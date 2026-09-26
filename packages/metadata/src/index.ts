export const PRODUCT = {
  displayName: 'Developer Usage Insights',
  shortName: 'Developer Usage Insights',
  version: '0.1.0',
  // The GitHub release this build is published as. CFBundleVersion only accepts
  // period-separated integers, so the prerelease suffix lives here rather than in
  // version. Bump this whenever a release is tagged; the update check compares it
  // against the newest published release.
  releaseTag: 'v0.1.0-beta.25',
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
