import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeUpdateHandoff,
  executableChecksum,
  latestRelease,
  prepareLatestRelease,
  startVerifiedRelease,
  type PublishedRelease,
} from '../../src/release-updater.js';
import { parseLaunchOptions } from '../../src/cli.js';

const temporaryDirectories: string[] = [];
const launch = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: launch }));
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function setupDownload() {
  const directory = await mkdtemp(join(tmpdir(), 'committer-update-test-'));
  temporaryDirectories.push(directory);
  const executable = join(directory, 'installed.exe');
  await writeFile(executable, 'old-version');
  const content = Buffer.from('synthetic-new-executable');
  const checksum = createHash('sha256').update(content).digest('hex');
  const candidate = release('v0.1.0-beta.7', '2026-09-24');
  candidate.assets[0]!.size = content.length;
  candidate.assets[0]!.digest = `sha256:${checksum}`;
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.hostname === 'api.github.com') return Response.json([candidate]);
    if (url.pathname.endsWith('SHA256SUMS.txt'))
      return new Response(`${checksum}  developer-usage-insights.exe\n`);
    return new Response(content);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { executable, content, checksum, candidate, fetchMock, cache: join(directory, 'cache') };
}

function release(tag: string, date: string): PublishedRelease {
  return {
    tag_name: tag,
    published_at: date,
    draft: false,
    assets: ['developer-usage-insights.exe', 'SHA256SUMS.txt'].map((name) => ({
      name,
      state: 'uploaded',
      size: 100,
      browser_download_url: `https://github.com/ninjapaw/committer-insights/releases/download/${tag}/${name}`,
    })),
  };
}

describe('release update metadata', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['true', false],
    ['false', true],
    [' FALSE ', true],
  ] as const)('resolves automatic updates from environment %s', (value, skipped) => {
    vi.stubEnv('DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE', value);
    expect(parseLaunchOptions([]).skipUpdateCheck).toBe(skipped);
    expect(parseLaunchOptions(['--skip-update-check']).skipUpdateCheck).toBe(true);
  });

  it('rejects ambiguous updater values without preventing help', () => {
    vi.stubEnv('DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE', 'off');
    expect(() => parseLaunchOptions([])).toThrow('Use true or false');
    expect(parseLaunchOptions(['--help']).help).toBe(true);
  });

  it('checks releases by default and requires an explicit offline override', () => {
    expect(parseLaunchOptions([]).skipUpdateCheck).toBe(false);
    expect(parseLaunchOptions(['--skip-update-check', '--timezone', 'UTC'])).toMatchObject({
      skipUpdateCheck: true,
      timeZone: 'UTC',
      help: false,
    });
    expect(parseLaunchOptions(['--help']).help).toBe(true);
  });
  it('selects the newest publication including betas, ignoring drafts and API ordering', () => {
    const draft = { ...release('v9.0.0', '2026-09-25'), draft: true };
    expect(
      latestRelease([
        release('v0.1.0', '2026-09-01'),
        draft,
        release('v0.2.0-beta.1', '2026-09-24'),
      ]).tag,
    ).toBe('v0.2.0-beta.1');
  });

  it('does not silently choose an older release when the newest lacks Windows assets', () => {
    const newest = release('v0.2.0', '2026-09-24');
    newest.assets = [];
    expect(() => latestRelease([release('v0.1.0', '2026-09-01'), newest])).toThrow('no valid');
  });

  it('rejects untrusted download URLs, duplicate assets, unsafe tags and oversized binaries', () => {
    const candidate = release('v0.1.0-beta.7', '2026-09-24');
    candidate.assets[0]!.browser_download_url = 'https://example.test/developer-usage-insights.exe';
    expect(() => latestRelease([candidate])).toThrow('no valid');
    const duplicate = release('v0.1.0', '2026-09-24');
    duplicate.assets.push(duplicate.assets[0]!);
    expect(() => latestRelease([duplicate])).toThrow('no valid');
    expect(() => latestRelease([release('../unsafe', '2026-09-24')])).toThrow('supported');
    const oversized = release('v0.1.0', '2026-09-24');
    oversized.assets[0]!.size = 1024 ** 3;
    expect(() => latestRelease([oversized])).toThrow('no valid');
  });

  it('requires exactly one checksum for the Windows executable', () => {
    const checksum = 'a'.repeat(64);
    expect(executableChecksum(`${checksum}  developer-usage-insights.exe\r\n`)).toBe(checksum);
    expect(() => executableChecksum(`${checksum}  different.exe`)).toThrow('missing');
    expect(() =>
      executableChecksum(`${checksum}  developer-usage-insights.exe\n`.repeat(2)),
    ).toThrow('ambiguous');
    expect(() => executableChecksum('not-a-hash  developer-usage-insights.exe')).toThrow('missing');
  });
});

describe('verified release cache', () => {
  it('forwards launch arguments without a shell and rejects files modified before launch', async () => {
    const fixture = await setupDownload();
    const prepared = await prepareLatestRelease(fixture.executable, fixture.cache);
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    launch.mockImplementation(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    const args = ['--timezone', 'America/Toronto'];
    let finished = false;
    const running = startVerifiedRelease(prepared, args).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    expect(launch.mock.calls[0]![0]).toBe(prepared.path);
    expect(launch.mock.calls[0]![1]).toEqual(args);
    expect(launch.mock.calls[0]![2].shell).toBeUndefined();
    expect(launch.mock.calls[0]![2]).toMatchObject({
      detached: false,
      windowsHide: false,
      stdio: 'inherit',
    });
    expect(launch.mock.calls[0]![2].env.DEVELOPER_USAGE_INSIGHTS_UPDATE_HANDOFF).toBe(
      prepared.checksum,
    );
    child.emit('exit', 0, null);
    await running;
    expect(finished).toBe(true);
    expect(child.unref).not.toHaveBeenCalled();
    await writeFile(prepared.path, 'tampered');
    await expect(startVerifiedRelease(prepared, args)).rejects.toThrow('changed before launch');
    expect(launch).toHaveBeenCalledOnce();
  });

  it('consumes a verified handoff once to avoid relaunch loops, rejecting mismatched hashes', async () => {
    const fixture = await setupDownload();
    const prepared = await prepareLatestRelease(fixture.executable, fixture.cache);
    vi.stubEnv('DEVELOPER_USAGE_INSIGHTS_UPDATE_HANDOFF', prepared.checksum);
    expect(await consumeUpdateHandoff(prepared.path)).toBe(true);
    expect(process.env.DEVELOPER_USAGE_INSIGHTS_UPDATE_HANDOFF).toBeUndefined();
    expect(await consumeUpdateHandoff(prepared.path)).toBe(false);
    vi.stubEnv('DEVELOPER_USAGE_INSIGHTS_UPDATE_HANDOFF', prepared.checksum);
    expect(await consumeUpdateHandoff(fixture.executable)).toBe(false);
  });

  it('reports executable launch failure instead of starting the old server', async () => {
    const fixture = await setupDownload();
    const prepared = await prepareLatestRelease(fixture.executable, fixture.cache);
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    launch.mockImplementation(() => {
      queueMicrotask(() => child.emit('error', new Error('Execution blocked')));
      return child;
    });
    await expect(startVerifiedRelease(prepared, [])).rejects.toThrow('Execution blocked');
    expect(child.unref).not.toHaveBeenCalled();
  });

  it.each([
    [1, null, 'code 1'],
    [null, 'SIGTERM', 'signal SIGTERM'],
  ])(
    'reports child termination (%s, %s) after a successful spawn',
    async (code, signal, detail) => {
      const fixture = await setupDownload();
      const prepared = await prepareLatestRelease(fixture.executable, fixture.cache);
      const child = new EventEmitter();
      launch.mockImplementation(() => {
        queueMicrotask(() => {
          child.emit('spawn');
          child.emit('exit', code, signal);
        });
        return child;
      });
      await expect(startVerifiedRelease(prepared, [])).rejects.toThrow(
        `Upgraded application exited with ${detail}`,
      );
    },
  );

  it('downloads and verifies once, rechecks releases every run, and preserves the original executable', async () => {
    const fixture = await setupDownload();
    const first = await prepareLatestRelease(fixture.executable, fixture.cache);
    expect(first.updated).toBe(true);
    expect(await readFile(first.path)).toEqual(fixture.content);
    expect(await readFile(fixture.executable, 'utf8')).toBe('old-version');
    fixture.fetchMock.mockClear();
    expect(await prepareLatestRelease(fixture.executable, fixture.cache)).toEqual(first);
    expect(fixture.fetchMock).toHaveBeenCalledTimes(2);
    expect((await prepareLatestRelease(first.path, fixture.cache)).updated).toBe(false);
    expect(fixture.fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      signal: expect.any(AbortSignal),
      redirect: 'manual',
      headers: {
        'User-Agent': 'Developer Usage Insights-Updater',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  });

  it('rejects corrupt downloads and removes staging files', async () => {
    const fixture = await setupDownload();
    fixture.fetchMock.mockImplementation(async (url: URL) => {
      if (url.hostname === 'api.github.com') return Response.json([fixture.candidate]);
      if (url.pathname.endsWith('SHA256SUMS.txt'))
        return new Response(`${fixture.checksum}  developer-usage-insights.exe\n`);
      return new Response(Buffer.alloc(fixture.content.length));
    });
    await expect(prepareLatestRelease(fixture.executable, fixture.cache)).rejects.toThrow(
      'verification',
    );
    expect(await readdir(join(fixture.cache, fixture.checksum))).toEqual([]);
  });

  it('repairs a corrupt cached copy before allowing it to run', async () => {
    const fixture = await setupDownload();
    const first = await prepareLatestRelease(fixture.executable, fixture.cache);
    await writeFile(first.path, 'tampered');
    await prepareLatestRelease(fixture.executable, fixture.cache);
    expect(await readFile(first.path)).toEqual(fixture.content);
  });

  it('rejects untrusted redirects and does not contact their destination', async () => {
    const fixture = await setupDownload();
    fixture.fetchMock.mockResolvedValueOnce(Response.json([fixture.candidate]));
    fixture.fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://example.test/payload' } }),
    );
    await expect(prepareLatestRelease(fixture.executable, fixture.cache)).rejects.toThrow(
      'untrusted',
    );
    expect(fixture.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed when offline, rate-limited, or asset digests disagree', async () => {
    const fixture = await setupDownload();
    fixture.fetchMock.mockRejectedValueOnce(new Error('Offline'));
    await expect(prepareLatestRelease(fixture.executable, fixture.cache)).rejects.toThrow(
      'Offline',
    );
    fixture.fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(prepareLatestRelease(fixture.executable, fixture.cache)).rejects.toThrow(
      'HTTP 403',
    );
    fixture.candidate.assets[0]!.digest = `sha256:${'f'.repeat(64)}`;
    await expect(prepareLatestRelease(fixture.executable, fixture.cache)).rejects.toThrow(
      'does not match',
    );
  });
});
