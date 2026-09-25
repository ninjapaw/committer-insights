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
import {
  AzureServiceScenarioEditor,
  parseServiceInputs,
  type AzureServiceInputs,
} from '../components/AzureServicePricing';
import { SourcePicker } from '../components/SourcePicker';
import { MicrosoftSignIn } from '../components/MicrosoftSignIn';
import { GitHubSignIn } from '../components/GitHubSignIn';
import { connectAzure, discoverOrganizations } from '../providers/azure-devops';
import { commitWindows, connectGitHub, discoverGitHubTargets } from '../providers/github';
import { postJson } from '../services/local-api';

interface ReportDraft {
  azureServiceInputs?: Record<string, AzureServiceInputs>;
  azureSelected: string[];
  githubSelected: string[];
  githubTargetTypes: Record<string, GitHubTargetType>;
  plans: AzureDevOpsPlan[];
  sinceDays: number;
  includeBilling: boolean;
  includeAzureBilling: boolean;
  includeAzureBillingDetails: boolean;
  billingDate: string;
}

const emptyDraft: ReportDraft = {
  azureSelected: [],
  githubSelected: [],
  githubTargetTypes: {},
  plans: ['all'],
  sinceDays: 90,
  includeBilling: true,
  includeAzureBilling: true,
  includeAzureBillingDetails: false,
  billingDate: '',
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
      serviceScenario: parseServiceInputs(draft.azureServiceInputs?.[organization]).data,
      ...(draft.includeAzureBilling
        ? {
            includeAzureBilling: true,
            includeAzureBillingDetails: draft.includeAzureBillingDetails,
            ...(draft.billingDate ? { billingDate: draft.billingDate } : {}),
          }
        : {}),
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
  const validDate =
    !draft.includeAzureBilling ||
    !draft.billingDate ||
    (/^\d{4}-\d{2}-\d{2}$/.test(draft.billingDate) &&
      !Number.isNaN(Date.parse(`${draft.billingDate}T00:00:00Z`)) &&
      new Date(`${draft.billingDate}T00:00:00Z`).toISOString().slice(0, 10) === draft.billingDate &&
      draft.billingDate <= new Date().toISOString().slice(0, 10));
  const valid =
    sources.length > 0 &&
    (azureSelected.length === 0 ||
      (plans.length > 0 &&
        validDate &&
        azureSelected.every(
          (organization) => parseServiceInputs(draft.azureServiceInputs?.[organization]).success,
        )));

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
          renderConnection={(onConnected, onChanging, connected) => (
            <GitHubSignIn
              disabled={busy}
              connected={connected}
              onChanging={onChanging}
              onConnected={onConnected}
            />
          )}
          onDisconnect={() => updateDraft({ githubSelected: [], githubTargetTypes: {} })}
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
                Include GitHub billing snapshots, push identities/emails and usage charges with
                existing access
              </label>
            )}
            {azureSelected.length > 0 && (
              <fieldset disabled={busy}>
                <legend>Azure DevOps billing evidence</legend>
                <label className="billing-option">
                  <input
                    type="checkbox"
                    checked={draft.includeAzureBilling ?? false}
                    onChange={(event) =>
                      updateDraft({
                        includeAzureBilling: event.currentTarget.checked,
                        includeAzureBillingDetails: false,
                      })
                    }
                  />
                  Include provider-reported billing snapshots and identities
                </label>
                {draft.includeAzureBilling && (
                  <>
                    <label htmlFor="azure-billing-date">
                      Billing date (UTC, blank for latest available)
                    </label>
                    <input
                      id="azure-billing-date"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={draft.billingDate ?? ''}
                      onChange={(event) => updateDraft({ billingDate: event.currentTarget.value })}
                    />
                    {!validDate && (
                      <p role="alert">Enter a valid billing date, not in the future.</p>
                    )}
                    <label className="billing-option">
                      <input
                        type="checkbox"
                        checked={draft.includeAzureBillingDetails ?? false}
                        onChange={(event) =>
                          updateDraft({ includeAzureBillingDetails: event.currentTarget.checked })
                        }
                      />
                      Include billing diagnostic details (names, emails, repositories and push
                      evidence)
                    </label>
                    <p>
                      Billing identities and diagnostic details may contain personal information.
                      Existing access only; unavailable preview data remains unknown. Billing dates
                      are independent of the Git activity window.
                    </p>
                  </>
                )}
              </fieldset>
            )}
            <p>
              Read-only collection. Missing permissions leave individual datasets unavailable.
              Security settings are current snapshots; activity windows do not change provider
              billing rules.
            </p>
          </section>
          {azureSelected.length > 0 && (
            <details className="report-options">
              <summary>Other Azure DevOps services: what-if quantities</summary>
              {azureSelected.map((organization) => (
                <AzureServiceScenarioEditor
                  key={organization}
                  organization={organization}
                  disabled={busy}
                  inputs={draft.azureServiceInputs?.[organization] ?? {}}
                  onChange={(inputs) =>
                    updateDraft({
                      azureServiceInputs: { ...draft.azureServiceInputs, [organization]: inputs },
                    })
                  }
                />
              ))}
            </details>
          )}
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
              <span>
                {status.reason ??
                  (status.status === 'included' ? 'Minimum access verified' : 'Unavailable')}
              </span>
              {status.accessChecks && (
                <>
                  <p>
                    Selected data only. Hidden or denied projects and repositories may be absent.
                  </p>
                  <dl>
                    {status.accessChecks.map((check) => (
                      <div key={check.dataset}>
                        <dt>
                          {check.dataset}: {check.status.replace('-', ' ')}
                        </dt>
                        <dd>{check.detail}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
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
