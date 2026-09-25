import { Link } from 'react-router-dom';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export function LandingPage(): JSX.Element {
  return (
    <section className="landing" aria-labelledby="landing-title">
      <div className="landing__intro">
        <span className="eyebrow">Local reporting workspace</span>
        <h1 id="landing-title">{PRODUCT.displayName}</h1>
        <p className="landing__lead">
          Review Azure DevOps Advanced Security estimates or GitHub organization and enterprise
          committers, then export the results to CSV, PDF, or HTML.
        </p>
        <p className="callout" role="status">
          Delegated, read-only access. The portal does not ask for an Azure DevOps personal access
          token and uses no hosted API or cloud database.
        </p>
      </div>
      <div className="provider-grid" aria-label="Choose a provider">
        <article className="provider-card provider-card--azure">
          <span className="provider-card__mark" aria-hidden="true">
            AZ
          </span>
          <div>
            <span className="eyebrow">Advanced Security</span>
            <h2>Azure DevOps</h2>
            <p>Estimate active committers across Code Security and Secret Protection plans.</p>
          </div>
          <Link className="btn btn-primary" to="/connect" role="button">
            Connect Azure DevOps
          </Link>
        </article>
        <article className="provider-card provider-card--github">
          <span className="provider-card__mark" aria-hidden="true">
            GH
          </span>
          <div>
            <span className="eyebrow">Organization activity</span>
            <h2>GitHub</h2>
            <p>Count committers across visible repositories in an organization or enterprise.</p>
          </div>
          <Link className="btn btn-secondary" to="/connect/github" role="button">
            Connect GitHub
          </Link>
        </article>
      </div>
      <nav className="landing__links" aria-label="Secondary actions">
        <Link to="/connect">How Azure access works</Link>
        <Link to="/connect/github">How GitHub access works</Link>
        <Link to="/security-privacy">Security and privacy</Link>
      </nav>
    </section>
  );
}
