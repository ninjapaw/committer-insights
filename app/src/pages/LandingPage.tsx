import { Link } from 'react-router-dom';

export function LandingPage(): JSX.Element {
  return (
    <section aria-labelledby="landing-title">
      <h1 id="landing-title">Active Committer Portal</h1>
      <p>
        Review Azure DevOps Advanced Security committer estimates, compare provider identities, and
        export a customer-controlled report.
      </p>
      <p role="status">
        The portal uses delegated, read-only access. It does not ask for an Azure DevOps personal
        access token.
      </p>
      <Link to="/connect" role="button">
        Connect Azure DevOps
      </Link>
      <nav aria-label="Secondary actions">
        <Link to="/connect">How access works</Link>
        <Link to="/security-privacy">Security and privacy</Link>
      </nav>
    </section>
  );
}
