import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { signInLocally } from '../auth/get-token';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signIn = useMutation({
    mutationFn: signInLocally,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['local-session'] });
      navigate('/connections/azure-devops/organization');
    },
  });

  return (
    <section aria-labelledby="sign-in-title">
      <h1 id="sign-in-title">Sign in</h1>
      <p>
        The local application uses your Microsoft work or school account to read Azure DevOps on
        your behalf. Tokens remain inside this process.
      </p>
      <button type="button" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
        Sign in with Microsoft
      </button>
      {signIn.isError && <div role="alert">{(signIn.error as Error).message}</div>}
    </section>
  );
}
