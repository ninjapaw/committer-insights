import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GitHubSignInState } from '@ninjapaw/contracts';
import {
  cancelGitHubSignIn,
  connectGitHub,
  disconnectGitHub,
  getGitHubSignIn,
  listGitHubAccounts,
  startGitHubSignIn,
} from '../providers/github';

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
  const [attempt, setAttempt] = useState<GitHubSignInState>();
  const attemptId = useRef<string | undefined>(undefined);
  const completedId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (attemptId.current) void cancelGitHubSignIn(attemptId.current).catch(() => undefined);
    };
  }, []);
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
  const browser = useMutation({
    mutationFn: async (mode: 'browser' | 'device-code') => {
      await onChanging?.();
      if (connected) await disconnectGitHub();
      client.setQueryData(['github-account'], null);
      connect.reset();
      accounts.reset();
      change.reset();
      cancel.reset();
      setChoosing(false);
      setAttempt(undefined);
      const state = await startGitHubSignIn(mode);
      if (!mounted.current) {
        await cancelGitHubSignIn(state.id);
        return;
      }
      attemptId.current = state.id;
      setAttempt(state);
    },
  });
  const status = useQuery({
    queryKey: ['github-browser-sign-in', attempt?.id],
    queryFn: () => getGitHubSignIn(attempt!.id),
    enabled: attempt?.status === 'pending',
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status && query.state.data.status !== 'pending' ? false : 1000,
    refetchIntervalInBackground: true,
  });
  const current = attempt?.status === 'pending' ? (status.data ?? attempt) : attempt;
  const complete = connect.mutate;
  useEffect(() => {
    if (!current || current.status === 'pending') return;
    attemptId.current = undefined;
    if (current.status === 'authenticated' && completedId.current !== current.id) {
      completedId.current = current.id;
      complete(undefined);
    }
  }, [current, complete]);
  const cancel = useMutation({
    mutationFn: async () => {
      if (!attemptId.current) return;
      const state = await cancelGitHubSignIn(attemptId.current);
      attemptId.current = undefined;
      setAttempt(state);
    },
  });
  const pending = current?.status === 'pending';
  const busy =
    disabled ||
    connect.isPending ||
    change.isPending ||
    accounts.isPending ||
    browser.isPending ||
    pending ||
    cancel.isPending;
  const error =
    browser.error?.message ||
    cancel.error?.message ||
    status.error?.message ||
    connect.error?.message ||
    change.error?.message ||
    accounts.error?.message;
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
        <button type="button" disabled={busy} onClick={() => browser.mutate('browser')}>
          {browser.isPending && browser.variables === 'browser'
            ? 'Signing in...'
            : connected
              ? 'Change account'
              : 'Sign in with GitHub'}
        </button>
        {!connected && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => browser.mutate('device-code')}
          >
            {browser.isPending && browser.variables === 'device-code'
              ? 'Requesting device code...'
              : 'Sign in with a device code'}
          </button>
        )}
      </div>
      {pending && (
        <div className="device-challenge" role="status" aria-live="polite">
          {current.challenge ? (
            <>
              <a href={current.challenge.verificationUri} target="_blank" rel="noopener noreferrer">
                GitHub device sign-in
              </a>
              <output aria-label="GitHub sign-in code">{current.challenge.userCode}</output>
              <span>Waiting for GitHub sign-in...</span>
            </>
          ) : (
            <span>Requesting GitHub sign-in code...</span>
          )}
          <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel GitHub sign-in
          </button>
        </div>
      )}
      {(current?.status === 'failed' || current?.status === 'expired') && (
        <p role="alert">{current.message}</p>
      )}
      {current?.status === 'canceled' && <p role="status">GitHub sign-in canceled.</p>}
      <details>
        <summary>Saved accounts</summary>
        <div className="sign-in-actions">
          {!connected && !choosing && (
            <button type="button" disabled={busy} onClick={() => connect.mutate(undefined)}>
              {connect.isPending ? 'Connecting...' : 'Connect GitHub CLI'}
            </button>
          )}
          {!choosing && (
            <button type="button" disabled={busy} onClick={() => change.mutate()}>
              Select GitHub account
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
              <p role="status">No saved GitHub accounts found.</p>
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
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
