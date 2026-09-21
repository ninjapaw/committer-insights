import { useMsal } from '@azure/msal-react';
import { portalApiScopes } from '../auth/msal-config';

export function SignInPage(): JSX.Element {
  const { instance } = useMsal();

  return (
    <section aria-labelledby="sign-in-title">
      <h1 id="sign-in-title">Sign in</h1>
      <p>
        This service currently requires a Microsoft work or school account. Personal Microsoft
        accounts are not supported.
      </p>
      <button type="button" onClick={() => instance.loginRedirect({ scopes: portalApiScopes })}>
        Sign in with Microsoft
      </button>
    </section>
  );
}
