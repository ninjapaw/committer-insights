import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT, versionsFromReleaseTag } from '@ninjapaw/developer-usage-insights-metadata';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function packageVersion(workspace: string): Promise<string> {
  const manifest = await readFile(join(repositoryRoot, workspace, 'package.json'), 'utf8');
  return (JSON.parse(manifest) as { version: string }).version;
}

describe('release version derivation', () => {
  it('keeps the prerelease number so each build of a version stays distinguishable', () => {
    expect(versionsFromReleaseTag('v1.2.3-beta.25')).toEqual({
      version: '1.2.3',
      buildVersion: '1.2.3.25',
    });
  });

  it('treats a final release as the first build of its version', () => {
    expect(versionsFromReleaseTag('v1.2.3')).toEqual({
      version: '1.2.3',
      buildVersion: '1.2.3.0',
    });
  });

  it('produces build versions macOS accepts as period-separated integers', () => {
    expect(versionsFromReleaseTag(PRODUCT.releaseTag).buildVersion).toMatch(/^\d+(\.\d+)*$/);
  });

  it.each(['0.1.0', 'v1.2', 'v1.2.3-beta', 'v1.2.3+build.4', ''])(
    'refuses the unsupported tag %s rather than shipping an unusable version',
    (tag) => {
      expect(() => versionsFromReleaseTag(tag)).toThrow(/Unsupported release tag/);
    },
  );

  it('derives the published version numbers from the release tag', () => {
    expect({ version: PRODUCT.version, buildVersion: PRODUCT.buildVersion }).toEqual(
      versionsFromReleaseTag(PRODUCT.releaseTag),
    );
  });
});

describe('workspace version metadata', () => {
  // Windows, macOS, and Linux artifacts are all built from these manifests, so a manifest that
  // drifts from the product metadata would ship platforms that disagree about their version.
  it.each(['.', 'api', 'app', 'demo', 'packages/metadata', 'packages/contracts'])(
    'keeps the %s manifest on the product version',
    async (workspace) => {
      await expect(packageVersion(workspace)).resolves.toBe(PRODUCT.version);
    },
  );
});
