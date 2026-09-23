import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getPortalApiToken } from '../auth/get-token';

async function validateOrganization(organization: string): Promise<string> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/connections/azure-devops/validate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? 'Organization not found');
  }
  const body = (await response.json()) as { organization: string };
  return body.organization;
}

export function OrganizationConfigPage(): JSX.Element {
  const [organization, setOrganization] = useState('');
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: validateOrganization,
    onSuccess: (validatedOrganization) =>
      navigate('/reports/new', { state: { organization: validatedOrganization } }),
  });

  return (
    <section aria-labelledby="org-title">
      <h1 id="org-title">Azure DevOps organization</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(organization);
        }}
      >
        <label htmlFor="organization-input">Organization name or URL</label>
        <input
          id="organization-input"
          value={organization}
          onChange={(event) => setOrganization(event.currentTarget.value)}
          placeholder="https://dev.azure.com/your-organization"
          required
        />
        <button type="submit" disabled={mutation.isPending}>
          Validate and continue
        </button>
      </form>
      {mutation.isError && <div role="alert">{(mutation.error as Error).message}</div>}
    </section>
  );
}
