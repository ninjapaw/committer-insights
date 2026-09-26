// The GitHub release every platform build is published as, and the only version string that
// is maintained by hand. Bump it whenever a release is tagged; the update check compares it
// against the newest published release, and the numeric forms below are derived from it so
// Windows, macOS, and Linux artifacts can never disagree about which release they are.
const RELEASE_TAG = 'v0.1.0-beta.26';

/**
 * Splits a release tag into the numeric version strings that platform packaging requires.
 *
 * macOS rejects a bundle whose CFBundleVersion is not period-separated integers, so the
 * `-beta.N` suffix cannot be used verbatim. `version` is the marketing version shared by every
 * platform and `buildVersion` appends the prerelease number so each prerelease of the same
 * version remains distinguishable to Finder, Gatekeeper, and installer tooling.
 */
export function versionsFromReleaseTag(tag: string): { version: string; buildVersion: string } {
  const match = /^v(\d+\.\d+\.\d+)(?:-[A-Za-z][A-Za-z0-9]*\.(\d+))?$/.exec(tag);
  const version = match?.[1];
  if (!version)
    throw new Error(
      `Unsupported release tag "${tag}". Use vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-prerelease.N.`,
    );
  return { version, buildVersion: `${version}.${match?.[2] ?? '0'}` };
}

const { version, buildVersion } = versionsFromReleaseTag(RELEASE_TAG);

export const PRODUCT = {
  displayName: 'Developer Usage Insights',
  shortName: 'Developer Usage Insights',
  // Derived from releaseTag; keep workspace package.json versions equal to this value.
  version,
  // Period-separated integers only, unique per prerelease. Used for macOS CFBundleVersion.
  buildVersion,
  releaseTag: RELEASE_TAG,
  slug: 'developer-usage-insights',
  bundleIdentifier: 'org.ninjapaw.developer-usage-insights',
  iconName: 'DeveloperUsageInsights',
  description:
    'Local Azure DevOps and GitHub plan, usage, billing, and activity reporting with CSV, PDF, and HTML exports.',
  githubDescription:
    'Local-first desktop reporting for Azure DevOps and GitHub plans, usage, billing, security settings, repository activity, access coverage, and cost scenarios.',
  reportTitle: 'Developer Usage Insights',
  executableName: 'developer-usage-insights',
  cacheDirectory: 'DeveloperUsageInsights',
  environmentPrefix: 'DEVELOPER_USAGE_INSIGHTS',
  repository: 'ninjapaw/committer-insights',
  demoBasePath: '/committer-insights',
} as const;

export const PRODUCT_DESCRIPTION =
  'Azure DevOps and GitHub plans, usage, billing, activity, access coverage, and cost scenarios.';
