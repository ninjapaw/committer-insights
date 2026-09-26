import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, readlink, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';
import {
  reduceAzureCli,
  reducedAzureCliVersion,
  validateReducedAzureCli,
  packReducedAzureCli,
} from './reduce-azure-cli.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// pip bakes the absolute path of the building interpreter into every console
// script's shebang, so on a CI runner `bin/az` points at a directory that does
// not exist on the user's machine. Replace those shebangs with a sh/Python
// polyglot header that resolves the interpreter next to the script instead, so
// the bundled entry points keep working wherever the runtime is unpacked.
const RELOCATABLE_SHEBANG = `#!/bin/sh
'''exec' "$(dirname -- "$0")/python3" "$0" "$@"
' '''`;

async function relocateConsoleScriptShebangs(binDir) {
  const entries = await readdir(binDir, { withFileTypes: true });
  const relocated = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(binDir, entry.name);
    let contents;
    try {
      contents = await readFile(path, 'utf8');
    } catch {
      continue; // Binaries are not valid UTF-8; they carry no shebang to fix.
    }
    const newline = contents.indexOf('\n');
    if (newline === -1) continue;
    const shebang = contents.slice(0, newline);
    if (!shebang.startsWith('#!') || !shebang.includes(binDir)) continue;
    await writeFile(path, `${RELOCATABLE_SHEBANG}${contents.slice(newline)}`);
    relocated.push(entry.name);
  }
  return relocated;
}

const TRUSTED_REDIRECT_HOSTS = [
  'azcliprod.blob.core.windows.net',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
];

async function downloadPinnedArchive(initialUrl, expectedSha256, maxBytes) {
  let url = new URL(initialUrl);
  let response;
  const signal = globalThis.AbortSignal.timeout(180000);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !TRUSTED_REDIRECT_HOSTS.includes(url.hostname)
    ) {
      throw new Error('Untrusted Azure CLI download redirect.');
    }
    response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': `${PRODUCT.displayName}-Build` },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing Azure CLI redirect destination.');
    url = new URL(location, url);
    response = undefined;
  }
  if (!response?.ok || !response.body)
    throw new Error(`Unable to download pinned archive: ${initialUrl}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > maxBytes) throw new Error('Archive exceeds download limit.');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (digest(archive) !== expectedSha256) throw new Error('Archive checksum mismatch.');
  return archive;
}

async function inventoryReduced(reduced) {
  const files = {};
  async function visit(relative = '') {
    for (const entry of await readdir(join(reduced, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) files[name] = digest(await readFile(join(reduced, name)));
      // Symlinks (e.g. bin/python3 -> python3.11) have no content of their own;
      // record their target so the runtime verifier can check them cheaply
      // without dereferencing every symlink through a content hash.
      else if (entry.isSymbolicLink())
        files[name] = `symlink:${await readlink(join(reduced, name))}`;
      else throw new Error('Unexpected Azure CLI runtime entry.');
    }
  }
  await visit();
  return files;
}

async function finalizeReducedAzureCli({
  root,
  directory,
  releaseDir,
  extracted,
  pin,
  manifestExtra,
  upstreamUrl,
  upstreamSha256,
  upstreamArchiveBytes,
  requiredFiles,
  extractorAssetPath,
  extractorAssetKey,
}) {
  const reduced = join(directory, 'reduced');
  const reduction = await reduceAzureCli(extracted, reduced);
  await validateReducedAzureCli(root, reduced, pin.version);
  const reducedArchivePath = join(directory, 'runtime-reduced.zip');
  packReducedAzureCli(reduced, reducedArchivePath);
  const reducedArchive = await readFile(reducedArchivePath);
  const reducedSha256 = digest(reducedArchive);
  const files = await inventoryReduced(reduced);
  for (const required of requiredFiles)
    if (!files[required]) throw new Error('Incomplete Azure CLI runtime.');
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...pin,
      ...manifestExtra,
      upstreamSha256,
      sha256: reducedSha256,
      reduction,
      files,
    }),
  );
  process.stdout.write(
    `Azure CLI reduced at build time (${process.platform}/${process.arch}): ${reduction.originalFiles} -> ${reduction.retainedFiles} files; ${reduction.originalBytes} -> ${reduction.retainedBytes} unpacked bytes; ${upstreamArchiveBytes} -> ${reducedArchive.length} archive bytes.\n`,
  );
  const notices = `\nAzure CLI ${pin.version}\nhttps://github.com/Azure/azure-cli\nOfficial source archive: ${upstreamUrl}\nSource archive SHA-256: ${upstreamSha256}\nReduced archive SHA-256: ${reducedSha256}\n${PRODUCT.displayName} removes unrelated command modules and Azure service SDKs at build time. Python, shared third-party dependencies, certificates and all detected license/notice trees are preserved unchanged. This reduced runtime is not the complete official distribution or a general-purpose Azure CLI installation.\n`;
  await appendFile(join(releaseDir, 'THIRD-PARTY-NOTICES.txt'), notices);
  const spdxPath = join(releaseDir, 'azure-cli.spdx.json');
  await writeFile(
    spdxPath,
    JSON.stringify(
      {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `${PRODUCT.displayName} bundled Azure CLI`,
        documentNamespace: `https://github.com/ninjapaw/committer-insights/sbom/azure-cli/${pin.version}/${reducedSha256}`,
        creationInfo: {
          created: new Date().toISOString(),
          creators: [`Tool: ${PRODUCT.displayName} Build`],
        },
        packages: [
          {
            name: `Azure CLI ${process.platform} distribution`,
            SPDXID: 'SPDXRef-AzureCLI',
            versionInfo: pin.version,
            downloadLocation: upstreamUrl,
            filesAnalyzed: false,
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: 'NOASSERTION',
            copyrightText: 'NOASSERTION',
            checksums: [{ algorithm: 'SHA256', checksumValue: upstreamSha256 }],
            comment:
              'Distribution inventory only; consult bundled licenses for Python and individual dependencies.',
          },
          {
            name: `${PRODUCT.displayName} reduced Azure CLI runtime`,
            SPDXID: 'SPDXRef-ReducedAzureCLI',
            versionInfo: pin.version,
            downloadLocation: 'NOASSERTION',
            filesAnalyzed: false,
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: 'NOASSERTION',
            copyrightText: 'NOASSERTION',
            checksums: [{ algorithm: 'SHA256', checksumValue: reducedSha256 }],
            comment: `Derived payload, not the full upstream distribution. ${JSON.stringify(reduction)}. Offline synthetic authentication checks do not establish live tenant compatibility.`,
          },
        ],
        relationships: [
          {
            spdxElementId: 'SPDXRef-DOCUMENT',
            relationshipType: 'DESCRIBES',
            relatedSpdxElement: 'SPDXRef-ReducedAzureCLI',
          },
          {
            spdxElementId: 'SPDXRef-ReducedAzureCLI',
            relationshipType: 'GENERATED_FROM',
            relatedSpdxElement: 'SPDXRef-AzureCLI',
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );
  return {
    'azure-cli/runtime.zip': reducedArchivePath,
    'azure-cli/manifest.json': manifestPath,
    [extractorAssetKey]: extractorAssetPath,
    'azure-cli/sbom.spdx.json': spdxPath,
  };
}

async function bundleAzureCliWindows(root, buildDir, releaseDir) {
  const pin = JSON.parse(await readFile(join(root, 'config/azure-cli.json'), 'utf8'));
  if (pin.version !== reducedAzureCliVersion)
    throw new Error(
      'Review the Azure CLI reduction policy and authentication checks before changing versions.',
    );
  if (
    !/^\d+\.\d+\.\d+$/.test(pin.version) ||
    !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    pin.url !== `https://azcliprod.blob.core.windows.net/zip/azure-cli-${pin.version}-x64.zip` ||
    pin.platform !== process.platform ||
    pin.architecture !== process.arch ||
    process.arch !== 'x64'
  ) {
    throw new Error('No verified Azure CLI package is pinned for this build target.');
  }
  const archive = await downloadPinnedArchive(pin.url, pin.sha256, 160 * 1024 * 1024);
  const directory = join(buildDir, 'azure-cli');
  const extracted = join(directory, 'runtime');
  await mkdir(extracted, { recursive: true });
  const archivePath = join(directory, 'runtime.zip');
  await writeFile(archivePath, archive);
  const extractor = join(root, 'scripts/extract-azure-cli.ps1');
  execFileSync(
    join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', extractor],
    {
      env: { ...process.env, COMMITTER_AZ_ARCHIVE: archivePath, COMMITTER_AZ_OUTPUT: extracted },
      windowsHide: true,
      stdio: 'pipe',
      timeout: 180000,
    },
  );
  return finalizeReducedAzureCli({
    root,
    directory,
    releaseDir,
    extracted,
    pin,
    manifestExtra: {},
    upstreamUrl: pin.url,
    upstreamSha256: pin.sha256,
    upstreamArchiveBytes: archive.length,
    requiredFiles: ['python.exe', 'bin/az.cmd'],
    extractorAssetPath: extractor,
    extractorAssetKey: 'azure-cli/extract.ps1',
  });
}

async function bundleAzureCliMacOS(root, buildDir, releaseDir) {
  const pin = JSON.parse(await readFile(join(root, 'config/azure-cli.json'), 'utf8'));
  if (pin.version !== reducedAzureCliVersion)
    throw new Error(
      'Review the Azure CLI reduction policy and authentication checks before changing versions.',
    );
  const macOS = pin.macOS;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  const platformPin = arch && macOS && macOS[arch];
  if (
    !macOS ||
    !/^\d{8}$/.test(macOS.pythonBuildStandaloneRelease) ||
    !/^\d+\.\d+\.\d+$/.test(macOS.pythonVersion) ||
    !platformPin ||
    !/^[a-f0-9]{64}$/.test(platformPin.sha256) ||
    platformPin.url !==
      `https://github.com/astral-sh/python-build-standalone/releases/download/${macOS.pythonBuildStandaloneRelease}/cpython-${macOS.pythonVersion}%2B${macOS.pythonBuildStandaloneRelease}-${arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin-install_only_stripped.tar.gz`
  ) {
    throw new Error('No verified Python runtime is pinned for this macOS build target.');
  }
  const archive = await downloadPinnedArchive(
    platformPin.url,
    platformPin.sha256,
    80 * 1024 * 1024,
  );
  const directory = join(buildDir, 'azure-cli');
  const extracted = join(directory, 'runtime');
  await mkdir(directory, { recursive: true });
  const archivePath = join(directory, 'python-runtime.tar.gz');
  await writeFile(archivePath, archive);
  // python-build-standalone tarballs contain a single top-level `python/`
  // directory; strip it so `extracted` matches the runtime layout directly
  // (bin/, lib/, ... at the root), mirroring the Windows extraction.
  await mkdir(extracted, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', extracted, '--strip-components=1'], {
    stdio: 'pipe',
    timeout: 180000,
  });
  // Install Azure CLI into the extracted interpreter's own site-packages.
  // pip resolves and verifies each downloaded wheel's SHA-256 against the
  // hash published by PyPI's index for every file, so supply-chain trust
  // here is bounded by PyPI's own integrity guarantees (the same trust
  // level as any standard `pip install`), rather than a single pinned
  // archive hash as on Windows. This is a deliberate trade-off: Azure CLI
  // has no equivalent single-file signed macOS/POSIX distribution to pin.
  execFileSync(
    join(extracted, 'bin/python3'),
    [
      '-I',
      '-B',
      '-m',
      'pip',
      'install',
      '--no-cache-dir',
      '--no-compile',
      '--disable-pip-version-check',
      `azure-cli==${pin.version}`,
    ],
    {
      env: { PATH: '/usr/bin:/bin', PIP_NO_CACHE_DIR: '1', PYTHONIOENCODING: 'utf-8' },
      stdio: 'pipe',
      timeout: 600000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const extractor = join(root, 'scripts/extract-azure-cli.sh');
  const relocated = await relocateConsoleScriptShebangs(join(extracted, 'bin'));
  if (!relocated.includes('az')) {
    throw new Error('Azure CLI console script shebang was not made relocatable.');
  }
  return finalizeReducedAzureCli({
    root,
    directory,
    releaseDir,
    extracted,
    pin,
    manifestExtra: {
      platform: 'darwin',
      architecture: arch,
      pythonBuildStandaloneRelease: macOS.pythonBuildStandaloneRelease,
      pythonVersion: macOS.pythonVersion,
    },
    upstreamUrl: platformPin.url,
    upstreamSha256: platformPin.sha256,
    upstreamArchiveBytes: archive.length,
    requiredFiles: ['bin/python3', 'bin/az'],
    extractorAssetPath: extractor,
    extractorAssetKey: 'azure-cli/extract.sh',
  });
}

export async function bundleAzureCli(root, buildDir, releaseDir) {
  if (process.platform === 'win32') return bundleAzureCliWindows(root, buildDir, releaseDir);
  if (process.platform === 'darwin') return bundleAzureCliMacOS(root, buildDir, releaseDir);
  return {};
}
