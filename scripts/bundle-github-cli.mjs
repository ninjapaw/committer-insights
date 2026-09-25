import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function bundleGitHubCli(root, buildDir, releaseDir) {
  if (process.platform !== 'win32') return {};
  const pin = JSON.parse(await readFile(join(root, 'config/github-cli.json'), 'utf8'));
  const expectedUrl = `https://github.com/cli/cli/releases/download/v${pin.version}/gh_${pin.version}_windows_amd64.zip`;
  if (
    !/^\d+\.\d+\.\d+$/.test(pin.version) ||
    !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    pin.url !== expectedUrl ||
    pin.platform !== process.platform ||
    pin.architecture !== process.arch ||
    process.arch !== 'x64'
  ) {
    throw new Error('No verified GitHub CLI package is pinned for this build target.');
  }
  const destination = join(buildDir, 'github-cli');
  await mkdir(destination, { recursive: true });
  const archivePath = join(destination, 'github-cli.zip');
  let url = new URL(pin.url);
  let response;
  const signal = globalThis.AbortSignal.timeout(120000);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      ![
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(url.hostname)
    ) {
      throw new Error('Untrusted GitHub CLI download redirect.');
    }
    response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': `${PRODUCT.displayName}-Build` },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing GitHub CLI redirect destination.');
    url = new URL(location, url);
    response = undefined;
  }
  if (!response?.ok || !response.body)
    throw new Error('Unable to download pinned GitHub CLI archive.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 64 * 1024 * 1024) throw new Error('GitHub CLI archive exceeds the size limit.');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (sha256(archive) !== pin.sha256)
    throw new Error('Pinned GitHub CLI archive checksum mismatch.');
  await writeFile(archivePath, archive);
  const powershell = join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  execFileSync(
    powershell,
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($env:COMMITTER_GH_ARCHIVE)
    try {
      foreach ($name in @('bin/gh.exe', 'LICENSE')) {
        $entries = @($zip.Entries | Where-Object { $_.FullName -ceq $name })
        if ($entries.Count -ne 1 -or $entries[0].Length -le 0 -or $entries[0].Length -gt 134217728) { throw 'Invalid pinned archive layout' }
        $target = Join-Path $env:COMMITTER_GH_OUTPUT ([System.IO.Path]::GetFileName($name))
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], $target)
      }
    } finally { $zip.Dispose() }
  `,
    ],
    {
      env: { ...process.env, COMMITTER_GH_ARCHIVE: archivePath, COMMITTER_GH_OUTPUT: destination },
      windowsHide: true,
      stdio: 'pipe',
    },
  );
  const binaryPath = join(destination, 'gh.exe');
  const licensePath = join(destination, 'LICENSE');
  const binary = await readFile(binaryPath);
  const license = await readFile(licensePath);
  if (
    binary[0] !== 0x4d ||
    binary[1] !== 0x5a ||
    !license.toString('utf8').includes('MIT License')
  ) {
    throw new Error('Invalid GitHub CLI executable or license in pinned archive.');
  }
  const binaryHash = sha256(binary);
  const manifestPath = join(destination, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({ version: pin.version, architecture: pin.architecture, sha256: binaryHash }),
  );
  const notices = `GitHub CLI ${pin.version}\nhttps://github.com/cli/cli\nOfficial archive: ${pin.url}\nArchive SHA-256: ${pin.sha256}\n\n${license.toString('utf8')}`;
  await writeFile(join(releaseDir, 'THIRD-PARTY-NOTICES.txt'), notices);
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${PRODUCT.displayName} bundled GitHub CLI`,
    documentNamespace: `https://github.com/ninjapaw/committer-insights/sbom/github-cli/${pin.version}/${binaryHash}`,
    creationInfo: {
      created: new Date().toISOString(),
      creators: [`Tool: ${PRODUCT.displayName} Build`],
    },
    packages: [
      {
        name: 'GitHub CLI',
        SPDXID: 'SPDXRef-GitHubCLI',
        versionInfo: pin.version,
        downloadLocation: pin.url,
        filesAnalyzed: false,
        licenseConcluded: 'NOASSERTION',
        licenseDeclared: 'MIT',
        copyrightText: 'Copyright (c) 2019 GitHub Inc.',
        checksums: [{ algorithm: 'SHA256', checksumValue: pin.sha256 }],
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: `pkg:github/cli/cli@v${pin.version}`,
          },
        ],
        comment:
          'Companion inventory for the official bundled Windows binary; upstream Go dependencies are not enumerated here.',
      },
    ],
    files: [
      {
        fileName: 'github-cli/gh.exe',
        SPDXID: 'SPDXRef-GitHubCLIExecutable',
        checksums: [{ algorithm: 'SHA256', checksumValue: binaryHash }],
        licenseConcluded: 'NOASSERTION',
        copyrightText: 'NOASSERTION',
      },
    ],
    relationships: [
      {
        spdxElementId: 'SPDXRef-DOCUMENT',
        relationshipType: 'DESCRIBES',
        relatedSpdxElement: 'SPDXRef-GitHubCLI',
      },
      {
        spdxElementId: 'SPDXRef-GitHubCLI',
        relationshipType: 'CONTAINS',
        relatedSpdxElement: 'SPDXRef-GitHubCLIExecutable',
      },
    ],
  };
  const sbomPath = join(releaseDir, 'github-cli.spdx.json');
  await writeFile(sbomPath, JSON.stringify(sbom, null, 2) + '\n');
  return {
    'github-cli/gh.exe': binaryPath,
    'github-cli/LICENSE': licensePath,
    'github-cli/manifest.json': manifestPath,
    'github-cli/sbom.spdx.json': sbomPath,
    'github-cli/THIRD-PARTY-NOTICES.txt': join(releaseDir, 'THIRD-PARTY-NOTICES.txt'),
  };
}
