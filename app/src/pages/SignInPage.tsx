import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { connectAzure } from '../providers/azure-devops';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
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
      <h1 id="sign-in-title">Sign in</h1>
      <p>
        The local application first uses your existing Azure CLI sign-in. If Azure CLI is not
        available, it opens Microsoft sign-in using the publisher application. Tokens remain inside
        this process.
      </p>
      <button type="button" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
        Sign in with Microsoft
      </button>
      {signIn.isError && <div role="alert">{(signIn.error as Error).message}</div>}
    </section>
  );
}
