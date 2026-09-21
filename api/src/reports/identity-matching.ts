import type { AzureDevOpsCommitter, CombinedCommitter, GitHubCommitter } from '@ninjapaw/contracts';

function normalize(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

/** Deterministic canonical ID derived from the strongest available identity signal. */
function canonicalIdFor(key: string): string {
  return `identity:${key}`;
}

interface AliasMap {
  /** Administrator-approved mapping of GitHub login (lowercase) -> Azure DevOps UPN (lowercase). */
  gitHubLoginToUpn: Map<string, string>;
}

export function emptyAliasMap(): AliasMap {
  return { gitHubLoginToUpn: new Map() };
}

/**
 * Conservative identity matching: only auto-merges on exact normalized
 * email/UPN, or an explicit administrator-approved alias. Display-name-only
 * similarity never merges automatically.
 */
export function matchIdentities(
  azureDevOpsCommitters: AzureDevOpsCommitter[],
  gitHubCommitters: GitHubCommitter[],
  aliasMap: AliasMap = emptyAliasMap(),
): CombinedCommitter[] {
  const byUpn = new Map<string, AzureDevOpsCommitter[]>();
  for (const committer of azureDevOpsCommitters) {
    const upn = normalize(committer.userPrincipalName);
    if (!upn) continue;
    const bucket = byUpn.get(upn) ?? [];
    bucket.push(committer);
    byUpn.set(upn, bucket);
  }

  const combined = new Map<string, CombinedCommitter>();

  for (const gh of gitHubCommitters) {
    const login = normalize(gh.userLogin);
    const email = normalize(gh.lastPushedEmail);
    const isNoreply = email?.endsWith('@users.noreply.github.com') ?? false;

    let matchedAdo: AzureDevOpsCommitter | undefined;
    let matchMethod: CombinedCommitter['matchMethod'] = 'none';
    let matchConfidence = 0;

    if (email && !isNoreply && byUpn.has(email)) {
      matchedAdo = byUpn.get(email)![0];
      matchMethod = 'exact-email';
      matchConfidence = 1;
    } else if (login && aliasMap.gitHubLoginToUpn.has(login)) {
      const aliasedUpn = aliasMap.gitHubLoginToUpn.get(login)!;
      matchedAdo = byUpn.get(aliasedUpn)?.[0];
      if (matchedAdo) {
        matchMethod = 'approved-alias';
        matchConfidence = 0.95;
      }
    } else if (isNoreply && login) {
      // Candidate only: GitHub noreply emails never auto-merge.
      matchMethod = 'github-login-candidate';
      matchConfidence = 0.3;
    }

    const canonicalId = matchedAdo
      ? canonicalIdFor(normalize(matchedAdo.userPrincipalName) ?? login ?? gh.userLogin)
      : canonicalIdFor(`github:${login ?? gh.userLogin}`);

    const existing = combined.get(canonicalId);
    const providers = new Set<'azure-devops' | 'github'>(existing?.providers ?? []);
    providers.add('github');
    if (matchedAdo) providers.add('azure-devops');

    const reviewRequired = matchMethod === 'github-login-candidate';

    combined.set(canonicalId, {
      canonicalId,
      displayName: matchedAdo?.displayName ?? existing?.displayName,
      primaryEmail: email && !isNoreply ? email : existing?.primaryEmail,
      providers: Array.from(providers),
      gitHubLogin: gh.userLogin,
      azureDevOpsUserPrincipalName:
        matchedAdo?.userPrincipalName ?? existing?.azureDevOpsUserPrincipalName,
      organizations: Array.from(new Set([...(existing?.organizations ?? []), gh.organization])),
      repositories: Array.from(new Set([...(existing?.repositories ?? []), gh.repository])),
      plans: matchedAdo
        ? Array.from(new Set([...(existing?.plans ?? []), matchedAdo.plan]))
        : (existing?.plans ?? []),
      isEstimated: matchedAdo?.isEstimated ?? existing?.isEstimated ?? false,
      isLicensed: matchedAdo?.isLicensed ?? existing?.isLicensed ?? false,
      matchStatus: matchedAdo ? 'matched' : reviewRequired ? 'review-required' : 'provider-only',
      matchMethod,
      matchConfidence,
      reviewRequired,
    });
  }

  // Remaining Azure DevOps-only identities.
  for (const [upn, committers] of byUpn) {
    const canonicalId = canonicalIdFor(upn);
    if (combined.has(canonicalId)) continue;
    const primary = committers[0]!;
    combined.set(canonicalId, {
      canonicalId,
      displayName: primary.displayName,
      primaryEmail: undefined,
      providers: ['azure-devops'],
      azureDevOpsUserPrincipalName: primary.userPrincipalName,
      organizations: [primary.organization],
      repositories: [],
      plans: Array.from(new Set(committers.map((c) => c.plan))),
      isEstimated: committers.some((c) => c.isEstimated),
      isLicensed: committers.some((c) => c.isLicensed),
      matchStatus: 'provider-only',
      matchMethod: 'none',
      matchConfidence: 0,
      reviewRequired: false,
    });
  }

  return Array.from(combined.values());
}
