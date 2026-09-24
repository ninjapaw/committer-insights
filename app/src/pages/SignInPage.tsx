import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { connectAzure } from '../providers/azure-devops';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invalidSession = searchParams.get('reason') === 'session';
  const queryClient = useQueryClient();
  const signIn = useMutation({
    mutationFn: connectAzure,
    onSuccess: async () => {
      queryClient.setQueryData(['provider-connection', 'Azure DevOps'], true);
      await queryClient.invalidateQueries({ queryKey: ['local-session'] });
      navigate('/connections');
    },
  });

  return (
    <section aria-labelledby="sign-in-title">
      {invalidSession ? (
        <>
          <h1 id="sign-in-title">Local session expired</h1>
          <p>
            This browser tab no longer has the active local session for the running application.
            Close stale Committer Insights tabs and use the window opened by the executable, or
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
          <p>
            The local application first uses your existing Azure CLI sign-in. If Azure CLI is not
            available, it opens Microsoft sign-in using the publisher application. Tokens remain
            inside this process.
          </p>
          <button type="button" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
            Sign in with Microsoft
          </button>
          {signIn.isError && <div role="alert">{(signIn.error as Error).message}</div>}
        </>
      )}
    </section>
  );
}
