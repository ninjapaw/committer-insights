import type { PropsWithChildren } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export function AppLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="navbar" role="banner">
        <div className="container navbar__inner">
          <Link className="navbar__brand" to="/" aria-label={`${PRODUCT.displayName} home`}>
            <span className="navbar__logo" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="navbar__title">{PRODUCT.displayName}</span>
          </Link>
          <nav className="navbar__nav" aria-label="Primary navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `navbar__link${isActive ? ' navbar__link--active' : ''}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/connections"
              className={({ isActive }) => `navbar__link${isActive ? ' navbar__link--active' : ''}`}
            >
              Sources
            </NavLink>
            <NavLink
              to="/security-privacy"
              className={({ isActive }) => `navbar__link${isActive ? ' navbar__link--active' : ''}`}
            >
              Security &amp; privacy
            </NavLink>
          </nav>
          <span className="navbar__status">Local</span>
        </div>
      </header>
      <div className="community-disclaimer" role="note">
        <strong>Independent community project.</strong> This reporting tool is not a Microsoft or
        GitHub product, assessment, endorsement, or official licensing source. Validate estimates
        and generated reports with official sources before making business decisions.
      </div>
      <main id="main-content" className="page-main">
        <div className="container page-main__inner">{children}</div>
      </main>
      <footer className="footer" role="contentinfo">
        <div className="container footer__inner">
          <div className="footer__summary">
            <strong>{PRODUCT.displayName}</strong>
            <p>Independent community reporting for Azure DevOps and GitHub.</p>
            <p>
              <strong>
                Not affiliated with, sponsored by, or endorsed by Microsoft or GitHub.
              </strong>
            </p>
          </div>
          <div className="footer__links" aria-label="Project links">
            <a
              href="https://github.com/ninjapaw/committer-insights/blob/main/DISCLAIMER.md"
              target="_blank"
              rel="noreferrer"
            >
              Disclaimer
            </a>
            <a
              href="https://github.com/ninjapaw/committer-insights/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              MIT License
            </a>
            <a
              href="https://github.com/ninjapaw/committer-insights"
              target="_blank"
              rel="noreferrer"
            >
              Source
            </a>
          </div>
        </div>
        <div className="container footer__bottom">
          <p>Tokens and reports remain on this device.</p>
          <p>
            Microsoft, Azure, Azure DevOps, and GitHub names are used only to identify the products
            discussed. All trademarks belong to their respective owners.
          </p>
        </div>
      </footer>
    </div>
  );
}
