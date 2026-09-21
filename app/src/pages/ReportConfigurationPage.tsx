import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getPortalApiToken } from '../auth/get-token';

const PLAN_OPTIONS = ['codeSecurity', 'secretProtection', 'all'] as const;

async function createReport(payload: {
  organization: string;
  plans: string[];
  retention: string;
}): Promise<{ reportId: string }> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/reports/azure-devops', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'azure-devops',
      azureDevOps: {
        organization: payload.organization,
        plans: payload.plans,
        resultTypes: ['estimated'],
      },
      retention: payload.retention,
    }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? 'Unable to create report');
  }
  return (await response.json()) as { reportId: string };
}

export function ReportConfigurationPage(): JSX.Element {
  const [organization, setOrganization] = useState('');
  const [plans, setPlans] = useState<string[]>(['codeSecurity']);
  const [retention, setRetention] = useState('none');
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: createReport,
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}/progress`),
  });

  function togglePlan(plan: string) {
    setPlans((current) =>
      current.includes(plan) ? current.filter((value) => value !== plan) : [...current, plan],
    );
  }

  return (
    <section aria-labelledby="report-config-title">
      <h1 id="report-config-title">Configure your report</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ organization, plans, retention });
        }}
      >
        <label htmlFor="report-org">Organization</label>
        <input
          id="report-org"
          value={organization}
          onChange={(e) => setOrganization(e.currentTarget.value)}
          required
        />

        <fieldset>
          <legend>Plans</legend>
          {PLAN_OPTIONS.map((plan) => (
            <label key={plan} htmlFor={`plan-${plan}`}>
              <input
                id={`plan-${plan}`}
                type="checkbox"
                checked={plans.includes(plan)}
                onChange={() => togglePlan(plan)}
              />
              {plan}
            </label>
          ))}
        </fieldset>

        <label htmlFor="retention-select">Retention</label>
        <select
          id="retention-select"
          value={retention}
          onChange={(e) => setRetention(e.currentTarget.value)}
        >
          <option value="none">None</option>
          <option value="session">Session</option>
          <option value="thirty-days">Thirty days</option>
        </select>

        <button type="submit" disabled={mutation.isPending || plans.length === 0}>
          Generate report
        </button>
      </form>
      {mutation.isError && <div role="alert">{(mutation.error as Error).message}</div>}
    </section>
  );
}
