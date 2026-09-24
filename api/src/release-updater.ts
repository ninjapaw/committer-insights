import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isSea } from 'node:sea';

const repository = 'ninjapaw/committer-insights';
const executableName = 'committer-insights.exe';
const maximumExecutableBytes = 256 * 1024 * 1024;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  state: string;
  digest?: string;
}

export interface PublishedRelease {
  tag_name: string;
  published_at: string;
  draft: boolean;
  assets: ReleaseAsset[];
}

export function latestRelease(releases: PublishedRelease[]) {
  const release = releases
    .filter((item) => item?.draft === false && Number.isFinite(Date.parse(item.published_at)))
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at))[0];
  if (
    !release ||
    !Array.isArray(release.assets) ||
    !/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(release.tag_name)
  ) {
    throw new Error('No supported published release was found.');
  }
  const asset = (name: string, limit: number) => {
    const matches = release.assets.filter((item) => item?.name === name);
    const candidate = matches[0];
    const expected = `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
    if (
      matches.length !== 1 ||
      !candidate ||
      candidate.state !== 'uploaded' ||
      candidate.browser_download_url !== expected ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size <= 0 ||
      candidate.size > limit
    ) {
      throw new Error(`Latest release ${release.tag_name} has no valid ${name} asset.`);
    }
    return candidate;
  };
  return {
    tag: release.tag_name,
    executable: asset(executableName, maximumExecutableBytes),
    checksum: asset('SHA256SUMS.txt', 16 * 1024),
  };
}

export function executableChecksum(manifest: string): string {
  const matches = manifest
    .split(/\r?\n/)
    .map((line) => line.match(/^([a-fA-F0-9]{64})[ \t]+\*?committer-insights\.exe$/)?.[1])
    .filter((value): value is string => Boolean(value));
  if (matches.length !== 1) throw new Error('Release checksum is missing or ambiguous.');
  return matches[0]!.toLowerCase();
}

async function request(url: string, timeout: number): Promise<Response> {
  const signal = AbortSignal.timeout(timeout);
  const hosts = new Set([
    'api.github.com',
    'github.com',
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
  ]);
  let destination = new URL(url);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      destination.protocol !== 'https:' ||
      !hosts.has(destination.hostname) ||
      destination.username ||
      destination.password ||
      destination.port
    ) {
      throw new Error('Release download redirected to an untrusted destination.');
    }
    const response = await fetch(destination, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'Committer-Insights-Updater', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || destination.hostname === 'api.github.com')
        throw new Error('Unexpected release metadata redirect.');
      destination = new URL(location, destination);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`GitHub release request failed (HTTP ${response.status}).`);
    }
    return response;
  }
  throw new Error('Too many release download redirects.');
}

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error('Empty release response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.byteLength;
      if (size > limit) throw new Error('Release response exceeded its size limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function fileChecksum(path: string): Promise<string | undefined> {
  try {
    if (!(await lstat(path)).isFile()) return undefined;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function downloadExecutable(
  asset: ReleaseAsset,
  path: string,
  checksum: string,
): Promise<void> {
  const response = await request(asset.browser_download_url, 120_000);
  if (!response.body) throw new Error('Empty executable download.');
  const reader = response.body.getReader();
  const file = await open(path, 'wx', 0o700);
  const hash = createHash('sha256');
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > asset.size || size > maximumExecutableBytes)
        throw new Error('Executable download exceeded its size limit.');
      hash.update(value);
      await file.writeFile(value);
    }
    if (size !== asset.size || hash.digest('hex') !== checksum) {
      throw new Error('Executable download failed SHA-256 or size verification.');
    }
    await file.sync();
  } finally {
    await file.close();
    await reader.cancel().catch(() => undefined);
  }
}

export async function prepareLatestRelease(executablePath: string, cacheRoot: string) {
  const releases: PublishedRelease[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await request(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      10_000,
    );
    const items: unknown = JSON.parse(
      (await readLimited(response, 2 * 1024 * 1024)).toString('utf8'),
    );
    if (!Array.isArray(items)) throw new Error('Invalid GitHub release metadata.');
    releases.push(...(items as PublishedRelease[]));
    if (items.length < 100) break;
    if (page === 20) throw new Error('Release history exceeded the supported update-check limit.');
  }
  const latest = latestRelease(releases);
  const response = await request(latest.checksum.browser_download_url, 10_000);
  const checksum = executableChecksum((await readLimited(response, 16 * 1024)).toString('utf8'));
  if (latest.executable.digest && latest.executable.digest !== `sha256:${checksum}`) {
    throw new Error('GitHub asset digest does not match the release checksum.');
  }
  if ((await fileChecksum(executablePath)) === checksum) {
    return { path: executablePath, checksum, tag: latest.tag, updated: false };
  }
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  if (!(await lstat(cacheRoot)).isDirectory()) throw new Error('Invalid updater cache directory.');
  const versionDirectory = join(cacheRoot, checksum);
  await mkdir(versionDirectory, { recursive: true, mode: 0o700 });
  if (!(await lstat(versionDirectory)).isDirectory())
    throw new Error('Invalid release cache directory.');
  const destination = join(versionDirectory, executableName);
  if ((await fileChecksum(destination)) !== checksum) {
    const staging = await mkdtemp(join(versionDirectory, 'download-'));
    try {
      const stagedExecutable = join(staging, executableName);
      await downloadExecutable(latest.executable, stagedExecutable, checksum);
      try {
        await rename(stagedExecutable, destination);
      } catch (error) {
        if ((await fileChecksum(destination)) !== checksum) throw error;
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  if ((await fileChecksum(destination)) !== checksum)
    throw new Error('Cached release failed integrity verification.');
  return { path: destination, checksum, tag: latest.tag, updated: true };
}

export async function consumeUpdateHandoff(executablePath: string): Promise<boolean> {
  const handoff = process.env.COMMITTER_INSIGHTS_UPDATE_HANDOFF;
  delete process.env.COMMITTER_INSIGHTS_UPDATE_HANDOFF;
  return Boolean(
    handoff && /^[a-f0-9]{64}$/.test(handoff) && (await fileChecksum(executablePath)) === handoff,
  );
}

export async function startVerifiedRelease(
  release: { path: string; checksum: string },
  args: string[],
): Promise<void> {
  if ((await fileChecksum(release.path)) !== release.checksum)
    throw new Error('Release changed before launch.');
  const child = spawn(release.path, args, {
    detached: true,
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, COMMITTER_INSIGHTS_UPDATE_HANDOFF: release.checksum },
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
}

export async function launchLatestRelease(args: string[]): Promise<boolean> {
  if (!isSea() || process.platform !== 'win32') return false;
  if (await consumeUpdateHandoff(process.execPath)) return false;
  process.stdout.write('Checking for the newest Committer Insights release...\n');
  try {
    const cacheRoot = join(
      process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
      'CommitterInsights',
      'releases',
    );
    const release = await prepareLatestRelease(process.execPath, cacheRoot);
    if (!release.updated) {
      process.stdout.write(`Running latest release ${release.tag}.\n`);
      return false;
    }
    process.stdout.write(`Starting verified release ${release.tag}...\n`);
    await startVerifiedRelease(release, args);
    return true;
  } catch (error) {
    throw new Error(
      `Update check failed: ${error instanceof Error ? error.message : 'Unable to verify the latest release.'} No update was launched. Retry online, or use --skip-update-check to explicitly run this installed copy.`,
    );
  }
}
