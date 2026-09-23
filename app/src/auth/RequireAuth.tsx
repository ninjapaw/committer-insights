import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getLocalSession } from './get-token';

/**
 * Frontend route guard. This is a UX convenience only; the API
 * independently validates identity and authorization on every protected
 * route regardless of this guard's state.
 */
export function RequireAuth({ children }: PropsWithChildren): JSX.Element {
  const session = useQuery({ queryKey: ['local-session'], queryFn: getLocalSession, retry: false });
  if (session.isPending) return <p aria-live="polite">Checking local session...</p>;
  if (session.isError || !session.data.authenticated) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}
