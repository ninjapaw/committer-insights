import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { discoverOrganizations, validateOrganization } from '../providers/azure-devops';

export function OrganizationConfigPage(): JSX.Element {
  const [organization, setOrganization] = useState('');
  const navigate = useNavigate();
  const discovery = useQuery({
    queryKey: ['azure-devops-organizations'],
    queryFn: discoverOrganizations,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: validateOrganization,
    onSuccess: (validatedOrganization) =>
      navigate('/reports/new', { state: { organization: validatedOrganization } }),
  });

  useEffect(() => {
    const onlyOrganization = discovery.data?.length === 1 ? discovery.data[0] : undefined;
    if (onlyOrganization) setOrganization((current) => current || onlyOrganization.name);
  }, [discovery.data]);

  return (
    <section aria-labelledby="org-title">
      <h1 id="org-title">Azure DevOps organization</h1>
      {discovery.isPending && <p aria-live="polite">Discovering your organizations...</p>}
      {discovery.data && discovery.data.length > 0 && (
        <div>
          <label htmlFor="discovered-organization">Discovered organizations</label>
          <select
            id="discovered-organization"
            value={
              discovery.data.some((candidate) => candidate.name === organization)
                ? organization
                : ''
            }
            onChange={(event) => setOrganization(event.currentTarget.value)}
          >
            <option value="">Select an organization</option>
            {discovery.data.map((candidate) => (
              <option key={candidate.id} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {discovery.isSuccess && discovery.data.length === 0 && (
        <p>No organizations were discovered. Enter one below.</p>
      )}
      {discovery.isError && <p>{(discovery.error as Error).message} Enter one below.</p>}
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
