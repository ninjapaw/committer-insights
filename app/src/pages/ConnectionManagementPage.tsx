import { useMutation } from '@tanstack/react-query';
import { getPortalApiToken } from '../auth/get-token';

async function disconnect(): Promise<void> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/connections/azure-devops', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error('Unable to disconnect Azure DevOps');
  }
}

export function ConnectionManagementPage(): JSX.Element {
  const mutation = useMutation({ mutationFn: disconnect });

  return (
    <section aria-labelledby="connections-title">
      <h1 id="connections-title">Manage connections</h1>
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Disconnect Azure DevOps
      </button>
      {mutation.isSuccess && <p role="status">Azure DevOps has been disconnected.</p>}
      {mutation.isError && <div role="alert">{(mutation.error as Error).message}</div>}
    </section>
  );
}
