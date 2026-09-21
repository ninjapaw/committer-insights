import { Link } from 'react-router-dom';

export function ConnectionSetupPage(): JSX.Element {
  return (
    <section aria-labelledby="setup-title">
      <h1 id="setup-title">Connection setup</h1>
      <p>Your Microsoft sign-in succeeded. Next, choose the Azure DevOps organization to connect.</p>
      <Link to="/connections/azure-devops/organization">Choose organization</Link>
    </section>
  );
}
