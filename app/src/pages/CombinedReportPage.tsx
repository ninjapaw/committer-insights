import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  azureDevOpsOrganizationSchema,
  parseGitHubTargetInput,
  type AzureDevOpsPlan,
  type GitHubTargetType,
  type MultiSource,
  type SourceStatus,
} from '@ninjapaw/contracts';
import { AzurePlanPicker } from '../components/AzurePlanPicker';
import { SourcePicker } from '../components/SourcePicker';
import { MicrosoftSignIn } from '../components/MicrosoftSignIn';
import { connectAzure, discoverOrganizations } from '../providers/azure-devops';
import { commitWindows, connectGitHub, discoverGitHubTargets } from '../providers/github';
import { postJson } from '../services/local-api';

interface ReportDraft {
  azureSelected: string[];
  githubSelected: string[];
  githubTargetTypes: Record<string, GitHubTargetType>;
  plans: AzureDevOpsPlan[];
  sinceDays: number;
  includeBilling: boolean;
}

const emptyDraft: ReportDraft = {
  azureSelected: [],
  githubSelected: [],
  githubTargetTypes: {},
  plans: ['all'],
  sinceDays: 90,
  includeBilling: false,
};

export function CombinedReportPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { data: draft } = useQuery({
    queryKey: ['report-draft'],
    queryFn: () => emptyDraft,
    initialData: emptyDraft,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const { azureSelected, githubSelected, githubTargetTypes, plans, sinceDays, includeBilling } =
    draft;
  const [reviewing, setReviewing] = useState(false);
  const [statuses, setStatuses] = useState<SourceStatus[] | null>(null);
  const navigate = useNavigate();

  const sources: MultiSource[] = [
    ...azureSelected.map((organization) => ({
      provider: 'azure-devops' as const,
      organization,
      plans,
      sinceDays,
    })),
    ...githubSelected.map((target) => ({
      provider: 'github' as const,
      targetType: githubTargetTypes[target] ?? ('organization' as const),
      target,
      sinceDays,
      ...(includeBilling ? { includeBilling: true } : {}),
    })),
  ];

  const preflight = useMutation({
    mutationFn: async () => {
      const result = await postJson<{ statuses: SourceStatus[] }>(
        '/api/reports/combined/preflight',
        { sources },
      );
      return result.statuses;
    },
    onMutate: () => setStatuses(null),
    onSuccess: setStatuses,
  });
  const generate = useMutation({
    mutationFn: () => postJson<{ reportId: string }>('/api/reports/combined', { sources }),
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}`),
  });

  const updateDraft = (patch: Partial<ReportDraft>) => {
    queryClient.setQueryData(['report-draft'], { ...draft, ...patch });
    setStatuses(null);
  };
  const toggle = (value: string, field: 'azureSelected' | 'githubSelected') => {
    const current = draft[field];
    updateDraft({
      [field]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };
  const toggleGitHubTarget = (name: string, targetType: GitHubTargetType = 'organization') => {
    const current = githubSelected;
    updateDraft({
      githubSelected: current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
      githubTargetTypes: current.includes(name)
        ? Object.fromEntries(Object.entries(githubTargetTypes).filter(([key]) => key !== name))
        : { ...githubTargetTypes, [name]: targetType },
    });
  };
  const readyCount = statuses?.filter((status) => status.status === 'included').length ?? 0;
  const busy = preflight.isPending || generate.isPending;
  const valid = sources.length > 0 && (azureSelected.length === 0 || plans.length > 0);

  return (
    <section className="combined-page" aria-labelledby="combined-title">
      <ol className="report-steps" aria-label="Report progress">
        <li aria-current={!reviewing ? 'step' : undefined}>1. Connect sources</li>
        <li aria-current={reviewing ? 'step' : undefined}>2. Review report</li>
        <li>3. Results</li>
      </ol>
      <h1 id="combined-title">{reviewing ? 'Review report' : 'Connect sources'}</h1>

      <div className="source-columns" hidden={reviewing}>
        <SourcePicker
          title="Azure DevOps"
          legend="Organizations"
          connectLabel="Sign in with Microsoft"
          connect={connectAzure}
          renderConnection={(onConnected, onChanging, connected) => (
            <MicrosoftSignIn
              disabled={busy}
              connected={connected}
              onChanging={onChanging}
              onConnected={onConnected}
            />
          )}
          onDisconnect={() => updateDraft({ azureSelected: [] })}
          discover={discoverOrganizations}
          parseSource={(value) => azureDevOpsOrganizationSchema.parse(value)}
          manualLabel="Organization name or URL"
          selected={azureSelected}
          onToggle={(name) => toggle(name, 'azureSelected')}
          disabled={busy}
        />
        <SourcePicker
          title="GitHub"
          legend="Organizations and enterprises"
          connectLabel="Connect GitHub CLI"
          connect={connectGitHub}
          discover={discoverGitHubTargets}
          parseSource={(value) => {
            const parsed = parseGitHubTargetInput(value);
            return { name: parsed.target, targetType: parsed.targetType };
          }}
          manualLabel="Organization, enterprise, or URL"
          discoveryErrorMessage="GitHub source discovery is unavailable. Add an organization or enterprise manually."
          selected={githubSelected}
          onToggle={(name, option) => {
            const discovered = option?.targetType
              ? option
              : queryClient
                  .getQueryData<Array<{ name: string; targetType?: GitHubTargetType }>>([
                    'source-picker',
                    'GitHub',
                  ])
                  ?.find((item) => item.name === name);
            toggleGitHubTarget(
              name,
              discovered?.targetType === 'enterprise' ? 'enterprise' : 'organization',
            );
          }}
          disabled={busy}
        />
      </div>

      <p className="selection-summary">
        {azureSelected.length} Azure DevOps organizations / {githubSelected.length} GitHub
        organizations and enterprises
      </p>

      {reviewing && (
        <>
          <section className="report-options" aria-label="Report options">
            {azureSelected.length > 0 && (
              <AzurePlanPicker
                plans={plans}
                onChange={(value) => updateDraft({ plans: value })}
                disabled={busy}
              />
            )}
            {sources.length > 0 && (
              <div>
                <label htmlFor="combined-window">Activity window (UTC)</label>
                <select
                  id="combined-window"
                  disabled={busy}
                  value={sinceDays}
                  onChange={(event) => {
                    updateDraft({ sinceDays: Number(event.currentTarget.value) });
                  }}
                >
                  {commitWindows.map((days) => (
                    <option key={days} value={days}>
                      Last {days} days
                    </option>
                  ))}
                </select>
              </div>
            )}
            {githubSelected.length > 0 && (
              <label className="billing-option">
                <input
                  type="checkbox"
                  checked={includeBilling}
                  disabled={busy}
                  onChange={(event) => updateDraft({ includeBilling: event.currentTarget.checked })}
                />
                Include GitHub organization billing usage with existing access
              </label>
            )}
            <p>
              Read-only collection. Missing permissions leave individual datasets unavailable.
              Security settings are current snapshots; activity windows do not change provider
              billing rules.
            </p>
          </section>
          {!statuses && (
            <div className="review-sources">
              <h2>Selected sources</h2>
              <ul>
                {sources.map((source) => (
                  <li
                    key={
                      source.provider +
                      (source.provider === 'github' ? source.target : source.organization)
                    }
                  >
                    <strong>{source.provider === 'github' ? 'GitHub' : 'Azure DevOps'}</strong>{' '}
                    {source.provider === 'github' ? source.target : source.organization}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {reviewing && statuses && (
        <div className="permission-results" aria-live="polite">
          <h2>Source access</h2>
          {statuses.map((status) => (
            <article
              key={`${status.provider}:${status.subject}`}
              className={`permission-result permission-result--${status.status}`}
            >
              <strong>{status.subject}</strong>
              <span>{status.status === 'included' ? 'Ready' : status.reason}</span>
              {status.remediation && <p>{status.remediation}</p>}
            </article>
          ))}
        </div>
      )}
      <div className="combined-actions">
        {!reviewing ? (
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => {
              setReviewing(true);
              preflight.mutate();
            }}
          >
            Review report
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => setReviewing(false)}
            >
              Back to sources
            </button>
            <button type="button" disabled={!valid || busy} onClick={() => preflight.mutate()}>
              {preflight.isPending ? 'Checking access...' : 'Check access'}
            </button>
            <button
              type="button"
              disabled={!valid || !statuses || readyCount === 0 || busy}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? 'Generating report...' : 'Generate report'}
            </button>
          </>
        )}
      </div>
      {preflight.isError && <div role="alert">{(preflight.error as Error).message}</div>}
      {generate.isError && <div role="alert">{(generate.error as Error).message}</div>}
    </section>
  );
}
