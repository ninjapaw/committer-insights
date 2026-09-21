import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { isTestAuthMode } from './msal-config';

/**
 * Frontend route guard. This is a UX convenience only; the API
 * independently validates identity and authorization on every protected
 * route regardless of this guard's state.
 */
export function RequireAuth({ children }: PropsWithChildren): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  if (!isAuthenticated && !isTestAuthMode()) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}
