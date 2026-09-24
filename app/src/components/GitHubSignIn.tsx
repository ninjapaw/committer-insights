import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectGitHub, disconnectGitHub, listGitHubAccounts } from '../providers/github';

export function GitHubSignIn({
  connected = false,
  disabled = false,
  onConnected,
  onChanging,
}: {
  connected?: boolean;
  disabled?: boolean;
  onConnected: () => void;
  onChanging?: () => Promise<void>;
}): JSX.Element {
  const client = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const [login, setLogin] = useState('');
  const { data: viewer } = useQuery({
    queryKey: ['github-account'],
    queryFn: () => null as { login: string; name?: string } | null,
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const accounts = useMutation({
    mutationFn: listGitHubAccounts,
    onSuccess: (items) =>
      setLogin(
        items.find((item) => item.available && item.active)?.login ??
          items.find((item) => item.available)?.login ??
          '',
      ),
  });
  const connect = useMutation({
    mutationFn: async (selected?: string) => {
      await onChanging?.();
      client.setQueryData(['github-account'], null);
      return connectGitHub(selected);
    },
    onSuccess: (result) => {
      client.setQueryData(['github-account'], result.viewer ?? null);
      setChoosing(false);
      onConnected();
    },
  });
  const change = useMutation({
    mutationFn: async () => {
      await onChanging?.();
      if (connected) await disconnectGitHub();
      client.setQueryData(['github-account'], null);
      setChoosing(true);
      connect.reset();
      accounts.mutate();
    },
  });
  const busy = disabled || connect.isPending || change.isPending || accounts.isPending;
  const error = connect.error?.message || change.error?.message || accounts.error?.message;
  return (
    <div className="github-sign-in">
      {connected && (
        <p role="status">
          {viewer ? (
            <>
              Signed in as <strong>{viewer.login}</strong>
            </>
          ) : (
            'GitHub connected'
          )}
        </p>
      )}
      <div className="sign-in-actions">
        {!connected && !choosing && (
          <button type="button" disabled={busy} onClick={() => connect.mutate(undefined)}>
            {connect.isPending ? 'Connecting...' : 'Connect GitHub CLI'}
          </button>
        )}
        {!choosing && (
          <button type="button" disabled={busy} onClick={() => change.mutate()}>
            {connected ? 'Change account' : 'Select GitHub account'}
          </button>
        )}
      </div>
      {choosing && (
        <form
          className="github-account-picker"
          onSubmit={(event) => {
            event.preventDefault();
            if (login) connect.mutate(login);
          }}
        >
          <label>
            GitHub account
            <select
              value={login}
              onChange={(event) => setLogin(event.currentTarget.value)}
              disabled={busy}
            >
              <option value="">Select an account</option>
              {accounts.data?.map((account) => (
                <option key={account.login} value={account.login} disabled={!account.available}>
                  {account.login}
                  {account.active ? ' (CLI active)' : ''}
                  {!account.available ? ' (sign-in required)' : ''}
                </option>
              ))}
            </select>
          </label>
          {accounts.isPending && <p role="status">Loading GitHub accounts...</p>}
          {accounts.isSuccess && accounts.data.length === 0 && (
            <p role="status">
              No GitHub CLI accounts found. Add an account with GitHub CLI, then refresh.
            </p>
          )}
          <div className="sign-in-actions">
            <button
              type="submit"
              disabled={
                busy ||
                !accounts.data?.some((account) => account.login === login && account.available)
              }
            >
              {connect.isPending ? 'Connecting...' : 'Connect selected account'}
            </button>
            <button type="button" disabled={busy} onClick={() => accounts.mutate()}>
              Refresh accounts
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChoosing(false);
                accounts.reset();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
