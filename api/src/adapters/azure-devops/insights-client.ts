import { z } from 'zod';
import {
  azureDevOpsOrganizationSchema,
  mergeDailyActivity,
  reportingWindow,
  type ReportInsights,
  type RepositoryInsight,
  type SettingState,
} from '@ninjapaw/contracts';

const repositoriesSchema = z.object({
  value: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      defaultBranch: z.string().optional(),
      isDisabled: z.boolean().optional(),
      project: z.object({
        id: z.string().uuid(),
        name: z.string(),
        visibility: z.string().optional(),
      }),
    }),
  ),
});
const enabledSchema = z.object({
  reposEnablementStatus: z.array(
    z.object({
      repositoryId: z.string().uuid(),
      codeSecurityFeatures: z
        .object({
          codeSecurityEnabled: z.boolean().nullish(),
          codeQLEnabled: z.boolean().nullish(),
          dependencyScanningInjectionEnabled: z.boolean().nullish(),
        })
        .nullish(),
      secretProtectionFeatures: z
        .object({
          secretProtectionEnabled: z.boolean().nullish(),
          blockPushes: z.boolean().nullish(),
        })
        .nullish(),
    }),
  ),
});
const commitsSchema = z.object({
  value: z.array(
    z.object({
      committer: z.object({ date: z.string().datetime({ offset: true }) }),
    }),
  ),
});
const state = (value: boolean | null | undefined): SettingState =>
  value === true ? 'enabled' : value === false ? 'disabled' : 'unknown';

function securityFeatures(
  setting: z.infer<typeof enabledSchema>['reposEnablementStatus'][number] | undefined,
) {
  return [
    { name: 'Code Security', state: state(setting?.codeSecurityFeatures?.codeSecurityEnabled) },
    {
      name: 'Secret Protection',
      state: state(setting?.secretProtectionFeatures?.secretProtectionEnabled),
    },
    { name: 'Push protection', state: state(setting?.secretProtectionFeatures?.blockPushes) },
    { name: 'CodeQL default setup', state: state(setting?.codeSecurityFeatures?.codeQLEnabled) },
    {
      name: 'Dependency scanning default setup',
      state: state(setting?.codeSecurityFeatures?.dependencyScanningInjectionEnabled),
    },
  ];
}

class AzureReadError extends Error {}

function readFailure(error: unknown): string {
  if (error instanceof AzureReadError) return error.message;
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return 'Unsupported provider response; this does not establish a permission failure.';
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return 'Request timed out; retry before changing permissions.';
  return 'Network or provider failure; retry and verify connectivity.';
}

async function read(url: URL, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    const reasons: Record<number, string> = {
      401: 'Authentication rejected (HTTP 401); sign in with the intended account and tenant.',
      403: 'Access denied (HTTP 403); check effective permissions, access level and explicit Deny with the organization administrator.',
      404: 'Not found or not visible (HTTP 404); check organization/project scope and endpoint availability.',
      429: 'Provider rate limit (HTTP 429); retry later.',
    };
    throw new AzureReadError(
      reasons[response.status] ??
        `Provider returned HTTP ${response.status}; retry or check service health.`,
    );
  }
  if (response.headers.get('x-ms-continuationtoken'))
    throw new AzureReadError(
      'Azure DevOps returned a truncated inventory; coverage is not verified.',
    );
  return response.json();
}

export async function preflightAzureRepositoryAccess(
  organization: string,
  token: string,
): Promise<void> {
  const source = azureDevOpsOrganizationSchema.parse(organization);
  const repositories = repositoriesSchema.parse(
    await read(
      new URL(
        `https://dev.azure.com/${source}/_apis/git/repositories?includeHidden=true&api-version=7.1`,
      ),
      token,
      fetch,
    ),
  );
  if (!repositories.value.length) throw new Error('No accessible Azure DevOps repositories.');
}

export async function collectAzureRepositoryInsights(
  organization: string,
  days: number,
  token: string,
  insights: ReportInsights,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const source = azureDevOpsOrganizationSchema.parse(organization);
  const check = { provider: 'azure-devops' as const, source };
  const window = reportingWindow(days);
  let settings: z.infer<typeof enabledSchema>['reposEnablementStatus'] = [];
  try {
    settings = enabledSchema.parse(
      await read(
        new URL(
          `https://advsec.dev.azure.com/${source}/_apis/management/enablement?includeAllProperties=true&api-version=7.2-preview.3`,
        ),
        token,
        fetchImpl,
      ),
    ).reposEnablementStatus;
    insights.checks.push({
      ...check,
      dataset: 'Security settings',
      status:
        settings.length &&
        settings.every((setting) =>
          securityFeatures(setting).every((feature) => feature.state !== 'unknown'),
        )
          ? 'complete'
          : 'partial',
      detail:
        'Current settings returned by Advanced Security. Missing repository or feature values remain unknown; settings do not prove recent scans or payment.',
    });
  } catch (error) {
    insights.checks.push({
      ...check,
      dataset: 'Security settings',
      status: 'unavailable',
      detail: `${readFailure(error)} Security settings require Advanced Security read access. No permissions were changed.`,
    });
  }
  try {
    const repositories = repositoriesSchema.parse(
      await read(
        new URL(
          `https://dev.azure.com/${source}/_apis/git/repositories?includeHidden=true&api-version=7.1`,
        ),
        token,
        fetchImpl,
      ),
    ).value;
    const byId = new Map(settings.map((item) => [item.repositoryId.toLowerCase(), item]));
    let next = 0;
    const rows: RepositoryInsight[] = [];
    await Promise.all(
      Array.from({ length: Math.min(4, repositories.length) }, async () => {
        for (;;) {
          const repository = repositories[next++];
          if (!repository) return;
          const setting = byId.get(repository.id.toLowerCase());
          const row: RepositoryInsight = {
            ...check,
            id: repository.id,
            name: repository.name,
            project: repository.project.name,
            visibility: repository.project.visibility ?? 'unknown',
            state:
              repository.isDisabled === true
                ? 'disabled'
                : repository.isDisabled === false
                  ? 'active'
                  : 'unknown',
            observedAt: new Date().toISOString(),
            features: securityFeatures(setting),
            activity: { ...window, status: 'unavailable', daily: [] },
          };
          try {
            if (!repository.defaultBranch)
              throw new AzureReadError(
                'No default branch is available; history access was not verified.',
              );
            const daily: RepositoryInsight['activity']['daily'] = [];
            for (let page = 0; ; page += 1) {
              if (page >= 100)
                throw new AzureReadError(
                  'History exceeds the 10,000 commit cap; not a permission failure.',
                );
              const url = new URL(
                `https://dev.azure.com/${source}/${repository.project.id}/_apis/git/repositories/${repository.id}/commits`,
              );
              for (const [key, value] of Object.entries({
                'api-version': '7.1',
                'searchCriteria.fromDate': window.from,
                'searchCriteria.toDate': window.to,
                'searchCriteria.$top': '100',
                'searchCriteria.$skip': String(page * 100),
                'searchCriteria.itemVersion.versionType': 'branch',
                'searchCriteria.itemVersion.version': repository.defaultBranch.replace(
                  /^refs\/heads\//,
                  '',
                ),
              }))
                url.searchParams.set(key, value);
              const commits = commitsSchema.parse(await read(url, token, fetchImpl)).value;
              for (const commit of commits) {
                const timestamp = new Date(commit.committer.date).toISOString();
                if (timestamp >= window.from && timestamp <= window.to)
                  daily.push({ date: timestamp.slice(0, 10), commits: 1 });
              }
              if (commits.length < 100) break;
            }
            row.activity = { ...window, status: 'complete', daily: mergeDailyActivity(daily) };
          } catch (error) {
            row.activity.reason = `${readFailure(error)} Default-branch history is unavailable, not zero activity. Repository Read is required.`;
          }
          rows.push(row);
        }
      }),
    );
    insights.repositories.push(...rows);
    const settingsCheck = insights.checks.find(
      (item) =>
        item.provider === check.provider &&
        item.source === source &&
        item.dataset === 'Security settings',
    );
    if (
      settingsCheck?.status === 'complete' &&
      rows.some((row) => row.features.some((feature) => feature.state === 'unknown'))
    ) {
      settingsCheck.status = 'partial';
      settingsCheck.detail +=
        ' Some visible repositories have missing settings; their feature states are unknown.';
    }
    const readable = rows.filter((row) => row.activity.status === 'complete').length;
    const failures = [
      ...new Set(rows.flatMap((row) => (row.activity.reason ? [row.activity.reason] : []))),
    ];
    insights.checks.push({
      ...check,
      dataset: 'Repository activity',
      status: !rows.length
        ? 'partial'
        : !readable
          ? 'unavailable'
          : readable < rows.length
            ? 'partial'
            : 'complete',
      detail:
        `${readable}/${rows.length} visible repositories with readable history. ${!rows.length ? 'No visible repositories; history access was not verified. ' : ''}Default-branch committer-date counts, including automation; not billable identities. Hidden or denied repositories may be absent. ${failures.join(' ')}`.trim(),
    });
  } catch (error) {
    insights.repositories.push(
      ...settings.map((setting): RepositoryInsight => ({
        ...check,
        id: setting.repositoryId,
        name: `Repository ${setting.repositoryId}`,
        visibility: 'unknown',
        state: 'unknown',
        features: securityFeatures(setting),
        observedAt: new Date().toISOString(),
        activity: {
          ...window,
          status: 'unavailable',
          daily: [],
          reason: 'Repository names and history unavailable with existing Git read access.',
        },
      })),
    );
    insights.checks.push({
      ...check,
      dataset: 'Repository activity',
      status: 'unavailable',
      detail: `${readFailure(error)} Repository inventory requires project visibility and repository Read. No permissions were changed.`,
    });
  }
  insights.checks.push({
    ...check,
    dataset: 'Azure invoice and service meters',
    status: 'not-requested',
    detail:
      'Azure charges, Basic/Test Plans seats, Pipelines and Artifacts meters are not collected. Verify actual charges with your Azure DevOps billing owner; security settings and estimates are not invoices.',
  });
}
