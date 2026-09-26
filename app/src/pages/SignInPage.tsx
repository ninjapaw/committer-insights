import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MicrosoftSignIn } from '../components/MicrosoftSignIn';
import { GitHubSignIn } from '../components/GitHubSignIn';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invalidSession = searchParams.get('reason') === 'session';
  const queryClient = useQueryClient();
  const onConnected = async () => {
    queryClient.setQueryData(['provider-connection', 'Azure DevOps'], true);
    await queryClient.invalidateQueries({ queryKey: ['local-session'] });
    navigate('/connections');
  };
  const onGitHubConnected = async () => {
    queryClient.setQueryData(['provider-connection', 'GitHub'], true);
    await queryClient.invalidateQueries({ queryKey: ['local-session'] });
    navigate('/connections');
  };

  return (
    <section aria-labelledby="sign-in-title">
      {invalidSession ? (
        <>
          <h1 id="sign-in-title">Local session expired</h1>
          <p>
            This browser tab no longer has the active local session for the running application.
            Close stale {PRODUCT.displayName} tabs and use the window opened by the executable, or
            restart the application to create a fresh local session.
          </p>
          <p>
            Provider sign-in is disabled until the local session is valid because the local API
            rejects requests from stale tabs before Azure DevOps or GitHub authentication can run.
          </p>
        </>
      ) : (
        <>
          <h1 id="sign-in-title">Sign in</h1>
          <MicrosoftSignIn onConnected={() => void onConnected()} />
          <h2>Or sign in with GitHub</h2>
          <GitHubSignIn onConnected={() => void onGitHubConnected()} />
        </>
      )}
    </section>
  );
}
