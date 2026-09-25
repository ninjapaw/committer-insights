import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';
import {
  reduceAzureCli,
  reducedAzureCliVersion,
  validateReducedAzureCli,
  packReducedAzureCli,
} from './reduce-azure-cli.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function bundleAzureCli(root, buildDir, releaseDir) {
  if (process.platform !== 'win32') return {};
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
  const response = await fetch(pin.url, {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(180000),
  });
  if (!response.ok || !response.body) throw new Error('Unable to download pinned Azure CLI.');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > 160 * 1024 * 1024) throw new Error('Azure CLI archive exceeds download limit.');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (digest(archive) !== pin.sha256) throw new Error('Azure CLI archive checksum mismatch.');
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
  const reduced = join(directory, 'reduced');
  const reduction = await reduceAzureCli(extracted, reduced);
  await validateReducedAzureCli(root, reduced, pin.version);
  const reducedArchivePath = join(directory, 'runtime-reduced.zip');
  packReducedAzureCli(reduced, reducedArchivePath);
  const reducedArchive = await readFile(reducedArchivePath);
  const reducedSha256 = digest(reducedArchive);
  const files = {};
  async function inventory(relative = '') {
    for (const entry of await readdir(join(reduced, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await inventory(name);
      else if (entry.isFile()) files[name] = digest(await readFile(join(reduced, name)));
      else throw new Error('Unexpected Azure CLI runtime entry.');
    }
  }
  await inventory();
  if (!files['python.exe'] || !files['bin/az.cmd'])
    throw new Error('Incomplete Azure CLI runtime.');
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({ ...pin, upstreamSha256: pin.sha256, sha256: reducedSha256, reduction, files }),
  );
  process.stdout.write(
    `Azure CLI reduced at build time: ${reduction.originalFiles} -> ${reduction.retainedFiles} files; ${reduction.originalBytes} -> ${reduction.retainedBytes} unpacked bytes; ${archive.length} -> ${reducedArchive.length} archive bytes.\n`,
  );
  const notices = `\nAzure CLI ${pin.version}\nhttps://github.com/Azure/azure-cli\nOfficial source ZIP: ${pin.url}\nSource archive SHA-256: ${pin.sha256}\nReduced archive SHA-256: ${reducedSha256}\n${PRODUCT.displayName} removes unrelated command modules and Azure service SDKs at build time. Python, shared third-party dependencies, certificates and all detected license/notice trees are preserved unchanged. This reduced runtime is not the complete official distribution or a general-purpose Azure CLI installation.\n`;
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
            name: 'Azure CLI Windows distribution',
            SPDXID: 'SPDXRef-AzureCLI',
            versionInfo: pin.version,
            downloadLocation: pin.url,
            filesAnalyzed: false,
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: 'NOASSERTION',
            copyrightText: 'NOASSERTION',
            checksums: [{ algorithm: 'SHA256', checksumValue: pin.sha256 }],
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
    'azure-cli/extract.ps1': extractor,
    'azure-cli/sbom.spdx.json': spdxPath,
  };
}
