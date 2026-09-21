import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { portalApiScopes } from '../auth/msal-config';

export function ConsentExplanationPage(): JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  const { instance } = useMsal();
  const navigate = useNavigate();

  async function continueToMicrosoft() {
    await instance.loginRedirect({ scopes: portalApiScopes });
    navigate('/connections/setup');
  }

  return (
    <section aria-labelledby="consent-title">
      <h1 id="consent-title">Connect Azure DevOps</h1>
      <p>
        To build your report, Active Committer Portal needs delegated access to Azure DevOps on your
        behalf.
      </p>

      <h2>What the portal requests</h2>
      <ul>
        <li>Read-only access required for Azure DevOps Advanced Security reporting</li>
        <li>Access is limited by your existing Azure DevOps permissions</li>
        <li>Your organization may require administrator approval</li>
      </ul>

      <h2>What the portal does not request</h2>
      <ul>
        <li>No permission to modify repositories</li>
        <li>No permission to change pipelines</li>
        <li>No permission to change organization settings</li>
        <li>No customer PAT</li>
        <li>No permission to write source code</li>
      </ul>

      <h2>How data is handled</h2>
      <ul>
        <li>Azure DevOps tokens remain server-side</li>
        <li>Report retention defaults to no saved history</li>
        <li>Exports are generated only at your request</li>
        <li>You can disconnect the integration and delete retained reports</li>
      </ul>

      <label htmlFor="consent-checkbox">
        <input
          id="consent-checkbox"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.currentTarget.checked)}
        />
        I understand the access being requested and want to continue.
      </label>

      <button type="button" disabled={!acknowledged} onClick={continueToMicrosoft}>
        Continue to Microsoft
      </button>
    </section>
  );
}
