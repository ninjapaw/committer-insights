import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { getPortalApiToken } from '../auth/get-token';

const PLAN_OPTIONS = ['codeSecurity', 'secretProtection', 'all'] as const;

async function createReport(payload: {
  organization: string;
  plans: string[];
}): Promise<{ reportId: string }> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/reports/azure-devops', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization: payload.organization,
      plans: payload.plans,
      resultTypes: ['estimated'],
    }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? 'Unable to create report');
  }
  return (await response.json()) as { reportId: string };
}

export function ReportConfigurationPage(): JSX.Element {
  const location = useLocation();
  const validatedOrganization =
    typeof location.state === 'object' &&
    location.state !== null &&
    'organization' in location.state &&
    typeof location.state.organization === 'string'
      ? location.state.organization
      : '';
  const [organization, setOrganization] = useState(validatedOrganization);
  const [plans, setPlans] = useState<string[]>(['codeSecurity']);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: createReport,
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}`),
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
          mutation.mutate({ organization, plans });
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

        <button type="submit" disabled={mutation.isPending || plans.length === 0}>
          Generate report
        </button>
      </form>
      {mutation.isError && <div role="alert">{(mutation.error as Error).message}</div>}
    </section>
  );
}
