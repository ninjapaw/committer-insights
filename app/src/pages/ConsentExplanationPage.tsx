import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export function ConsentExplanationPage(): JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  const navigate = useNavigate();

  function continueToMicrosoft() {
    navigate('/sign-in');
  }

  return (
    <section aria-labelledby="consent-title">
      <h1 id="consent-title">Connect Azure DevOps</h1>
      <p>
        To build your report, {PRODUCT.displayName} needs delegated access to Azure DevOps on your
        behalf.
      </p>

      <h2>What the portal requests</h2>
      <ul>
        <li>Read-only access required for Azure DevOps Advanced Security reporting</li>
        <li>Access is limited by your existing Azure DevOps permissions</li>
        <li>Existing Azure CLI sign-in avoids {PRODUCT.displayName}-specific app approval</li>
        <li>The fallback publisher sign-in may require administrator approval</li>
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
        <li>Azure DevOps tokens remain inside the local executable</li>
        <li>Reports remain in memory until you close the application</li>
        <li>Exports are generated only at your request</li>
        <li>Closing the application clears the in-memory session and reports</li>
      </ul>

      <div className="consent-actions">
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
          Continue
        </button>
      </div>
    </section>
  );
}
