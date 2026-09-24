import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceSignInState } from '@ninjapaw/contracts';
import {
  cancelDeviceSignIn,
  disconnectAzure,
  connectAzure,
  getDeviceSignIn,
  startDeviceSignIn,
} from '../providers/azure-devops';

export function MicrosoftSignIn({
  disabled = false,
  connected = false,
  onChanging,
  onConnected,
}: {
  disabled?: boolean;
  connected?: boolean;
  onChanging?: () => Promise<void>;
  onConnected: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const { data: account } = useQuery({
    queryKey: ['microsoft-account'],
    queryFn: () => null as DeviceSignInState['account'] | null,
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const [attempt, setAttempt] = useState<DeviceSignInState>();
  const [cancelError, setCancelError] = useState('');
  const attemptId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const completedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (attemptId.current) void cancelDeviceSignIn(attemptId.current).catch(() => undefined);
    };
  }, []);
  const receiveAttempt = async (start: () => Promise<DeviceSignInState>) => {
    await onChanging?.();
    if (connected) await disconnectAzure();
    queryClient.setQueryData(['microsoft-account'], null);
    setAttempt(undefined);
    const state = await start();
    if (!mounted.current) {
      await cancelDeviceSignIn(state.id);
      return;
    }
    attemptId.current = state.id;
    setAttempt(state);
  };
  const browser = useMutation({
    mutationFn: () => receiveAttempt(connectAzure),
  });
  const device = useMutation({
    mutationFn: () => receiveAttempt(startDeviceSignIn),
  });
  const status = useQuery({
    queryKey: ['microsoft-device-sign-in', attempt?.id],
    queryFn: () => getDeviceSignIn(attempt!.id),
    enabled: attempt?.status === 'pending',
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status && query.state.data.status !== 'pending' ? false : 1000,
    refetchIntervalInBackground: true,
  });
  const current = attempt?.status === 'pending' ? (status.data ?? attempt) : attempt;
  useEffect(() => {
    if (!current || current.status === 'pending') return;
    attemptId.current = undefined;
    if (current.status === 'authenticated' && completedId.current !== current.id) {
      completedId.current = current.id;
      queryClient.setQueryData(['microsoft-account'], current.account ?? null);
      onConnected();
    }
  }, [current, onConnected, queryClient]);
  const cancel = useMutation({
    mutationFn: async () => {
      if (!attemptId.current) return;
      const state = await cancelDeviceSignIn(attemptId.current);
      attemptId.current = undefined;
      setAttempt(state);
      setCancelError('');
    },
    onError: (error) => setCancelError(error.message),
  });
  const pending = current?.status === 'pending' && attempt?.status === 'pending';
  const busy = disabled || browser.isPending || device.isPending || pending || cancel.isPending;
  const challenge = pending ? current?.challenge : undefined;
  const cliFlow = browser.isSuccess || browser.isPending;
  const error =
    cancelError || browser.error?.message || device.error?.message || status.error?.message;

  return (
    <div className="microsoft-sign-in">
      {connected && account && (
        <p role="status" title={`Tenant: ${account.tenantId}`}>
          Signed in as <strong>{account.username}</strong>
        </p>
      )}
      <div className="sign-in-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAttempt(undefined);
            device.reset();
            setCancelError('');
            browser.mutate();
          }}
        >
          {browser.isPending
            ? 'Signing in...'
            : connected
              ? 'Change account'
              : 'Sign in with Microsoft'}
        </button>
        {!connected && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setAttempt(undefined);
              setCancelError('');
              browser.reset();
              device.mutate();
            }}
          >
            Sign in with a device code
          </button>
        )}
      </div>
      {pending && (
        <div className="device-challenge" role="status" aria-live="polite">
          {challenge ? (
            <>
              <a href={challenge.verificationUri} target="_blank" rel="noopener noreferrer">
                Microsoft device sign-in
              </a>
              <output aria-label="Device sign-in code">{challenge.userCode}</output>
              <span>
                Attempt expires at {new Date(challenge.expiresOnTimestamp).toLocaleTimeString()}
              </span>
              <span>Waiting for Microsoft sign-in...</span>
            </>
          ) : (
            <span>
              {cliFlow ? 'Waiting for Microsoft account selection...' : 'Requesting device code...'}
            </span>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cliFlow ? 'Cancel Microsoft sign-in' : 'Cancel device sign-in'}
          </button>
        </div>
      )}
      {current?.status === 'expired' && (
        <p role="alert">
          {cliFlow
            ? 'Microsoft sign-in timed out. Start sign-in again.'
            : 'Device code expired. Start device sign-in again.'}
        </p>
      )}
      {current?.status === 'failed' && <p role="alert">{current.message}</p>}
      {attempt?.status === 'canceled' && (
        <p role="status">{cliFlow ? 'Microsoft sign-in canceled.' : 'Device sign-in canceled.'}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
