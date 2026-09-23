import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { connectGitHub } from '../providers/github';

export function GitHubConnectPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signIn = useMutation({
    mutationFn: connectGitHub,
    onSuccess: () => {
      queryClient.setQueryData(['provider-connection', 'GitHub'], true);
      navigate('/connections');
    },
  });

  return (
    <section aria-labelledby="github-connect-title">
      <h1 id="github-connect-title">Connect GitHub</h1>
      <p>
        Committer Insights reuses your active GitHub CLI account. Install GitHub CLI and run{' '}
        <code>gh auth login</code> once if you are not already signed in.
      </p>
      <h2>What is collected</h2>
      <ul>
        <li>Repositories visible to the active GitHub CLI account</li>
        <li>Committer login, display name, profile URL, commit count, and last commit date</li>
        <li>Commits from the selected repository default branch and date window</li>
      </ul>
      <h2>What is not collected</h2>
      <ul>
        <li>No commit messages, patches, filenames, or commit SHAs</li>
        <li>No committer email addresses</li>
        <li>No GitHub token is returned to or stored by the browser</li>
      </ul>
      <button type="button" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
        Use GitHub CLI account
      </button>
      {signIn.isError && <div role="alert">{(signIn.error as Error).message}</div>}
    </section>
  );
}
