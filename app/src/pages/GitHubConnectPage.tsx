import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { GitHubSignIn } from '../components/GitHubSignIn';

export function GitHubConnectPage(): JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onConnected = () => {
    queryClient.setQueryData(['provider-connection', 'GitHub'], true);
    navigate('/connections');
  };
  const onChanging = async () => {
    queryClient.setQueryData(['provider-connection', 'GitHub'], false);
    await queryClient.cancelQueries({ queryKey: ['source-picker', 'GitHub'] });
    queryClient.removeQueries({ queryKey: ['source-picker', 'GitHub'] });
    queryClient.setQueryData<{
      githubSelected: string[];
      githubTargetTypes: Record<string, string>;
    }>(['report-draft'], (draft) =>
      draft ? { ...draft, githubSelected: [], githubTargetTypes: {} } : draft,
    );
  };

  return (
    <section aria-labelledby="github-connect-title">
      <h1 id="github-connect-title">Connect GitHub</h1>
      <p>
        GitHub CLI is required on this computer.{' '}
        <a href="https://cli.github.com/" target="_blank" rel="noopener noreferrer">
          Install GitHub CLI
        </a>
      </p>
      <h2>What the portal requests</h2>
      <ul>
        <li>
          GitHub CLI authorization with repo, read:org, and gist scopes, which can include write
          access
        </li>
        <li>
          Committer Insights makes read-only reporting requests; it does not narrow the CLI token's
          permissions
        </li>
        <li>Access is limited by your existing GitHub organization and enterprise permissions</li>
        <li>Organization and enterprise source discovery visible to your GitHub account</li>
        <li>Repository commit metadata for visible repositories in the selected source</li>
      </ul>

      <h2>What the portal collects</h2>
      <ul>
        <li>Organizations and enterprises visible to the selected GitHub CLI account</li>
        <li>Committer login, display name, profile URL, commit count, and last commit date</li>
        <li>Commits from visible repositories in the selected source and date window</li>
      </ul>

      <h2>What the portal does not do</h2>
      <ul>
        <li>Modify repositories</li>
        <li>Change organization or enterprise settings</li>
        <li>Change workflows, packages, issues, or pull requests</li>
        <li>No personal access token is requested from the browser</li>
      </ul>

      <h2>How data is handled</h2>
      <ul>
        <li>GitHub CLI tokens stay on this device and are never returned to the browser</li>
        <li>
          New logins are saved by GitHub CLI and can change its active account for other tools
        </li>
        <li>
          GitHub CLI uses the system credential store, with a plaintext fallback if it is
          unavailable
        </li>
        <li>Reports remain in memory until you close the application</li>
        <li>Exports are generated only at your request</li>
        <li>No commit messages, patches, filenames, or commit SHAs</li>
        <li>No committer email addresses</li>
      </ul>

      <div className="consent-actions">
        <label htmlFor="github-consent-checkbox">
          <input
            id="github-consent-checkbox"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          I understand the GitHub access being requested and want to continue.
        </label>

        <GitHubSignIn disabled={!acknowledged} onConnected={onConnected} onChanging={onChanging} />
      </div>
    </section>
  );
}
