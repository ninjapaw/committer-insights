import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function bundleAzureCli(root, buildDir, releaseDir) {
  if (process.platform !== 'win32') return {};
  const pin = JSON.parse(await readFile(join(root, 'config/azure-cli.json'), 'utf8'));
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
  const files = {};
  async function inventory(relative = '') {
    for (const entry of await readdir(join(extracted, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await inventory(name);
      else if (entry.isFile()) files[name] = digest(await readFile(join(extracted, name)));
      else throw new Error('Unexpected Azure CLI runtime entry.');
    }
  }
  await inventory();
  if (!files['python.exe'] || !files['bin/az.cmd'])
    throw new Error('Incomplete Azure CLI runtime.');
  const version = execFileSync(
    join(extracted, 'python.exe'),
    ['-I', '-B', '-m', 'azure.cli', 'version', '--output', 'json'],
    {
      env: {
        ...process.env,
        AZURE_CONFIG_DIR: join(directory, 'build-config'),
        AZURE_CORE_COLLECT_TELEMETRY: 'no',
        AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
    },
  );
  if (JSON.parse(version)['azure-cli'] !== pin.version)
    throw new Error('Unexpected Azure CLI runtime version.');
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ ...pin, files }));
  const notices = `\nAzure CLI ${pin.version}\nhttps://github.com/Azure/azure-cli\nOfficial ZIP: ${pin.url}\nArchive SHA-256: ${pin.sha256}\nThe full distribution, including Python and dependency license/notice files, is preserved in the bundled runtime.\n`;
  await appendFile(join(releaseDir, 'THIRD-PARTY-NOTICES.txt'), notices);
  const spdxPath = join(releaseDir, 'azure-cli.spdx.json');
  await writeFile(
    spdxPath,
    JSON.stringify(
      {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: 'Committer Insights bundled Azure CLI',
        documentNamespace: `https://github.com/ninjapaw/committer-insights/sbom/azure-cli/${pin.version}/${pin.sha256}`,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: Committer-Insights-Build'],
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
        ],
        relationships: [
          {
            spdxElementId: 'SPDXRef-DOCUMENT',
            relationshipType: 'DESCRIBES',
            relatedSpdxElement: 'SPDXRef-AzureCLI',
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );
  return {
    'azure-cli/runtime.zip': archivePath,
    'azure-cli/manifest.json': manifestPath,
    'azure-cli/extract.ps1': extractor,
    'azure-cli/sbom.spdx.json': spdxPath,
  };
}
