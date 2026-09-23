import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AzureDevOpsPlan } from '@ninjapaw/contracts';
import { createAzureReport } from '../providers/azure-devops';
import { AzurePlanPicker } from '../components/AzurePlanPicker';

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
  const [plans, setPlans] = useState<AzureDevOpsPlan[]>(['codeSecurity']);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: createAzureReport,
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}`),
  });

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

        <AzurePlanPicker plans={plans} onChange={setPlans} disabled={mutation.isPending} />

        <button type="submit" disabled={mutation.isPending || plans.length === 0}>
          Generate report
        </button>
      </form>
      {mutation.isError && <div role="alert">{(mutation.error as Error).message}</div>}
    </section>
  );
}
