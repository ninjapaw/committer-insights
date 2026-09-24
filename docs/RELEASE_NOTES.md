# Release Notes

## v0.1.0-beta.3 - 2026-09-24

### Highlights

- Separate Azure DevOps and GitHub Enterprise report areas, with executive summaries, solution pricing totals and provider-scoped evidence. Each export still contains the complete report.
- Repository inventory, UTC activity windows and charts, current security-setting snapshots, collection availability, and optional GitHub billing usage evidence.
- Local rule-based CIO recommendations with supporting facts, owners and planning horizons. An aggregate AI review brief can be copied for manual review; the app does not send it to an AI service.
- One-click GitHub and Azure DevOps repository links in the dashboard and HTML export, plus clickable PDF links.
- Readable timestamps with configurable display timezone. Launch with `committer-insights.exe --timezone America/Toronto` or `--timezone=UTC`; use `--help` for options. Precedence is command line, then `COMMITTER_INSIGHTS_TIMEZONE`, then UTC. CSV timestamps, collection windows and date-only activity/billing periods remain unchanged.
- Improved desktop/mobile report navigation, filtering, pagination, identity contribution detail and offline HTML printing.
- Consolidated public architecture, privacy and setup documentation in the README.

### Compatibility and Limitations

- Exports are CSV, PDF and standalone HTML. XLSX export has been removed.
- This is an **unsigned Windows beta for evaluation**, not a production-ready signed release. The executable may trigger Windows trust warnings. `SHA256SUMS.txt` verifies download integrity, not publisher identity.
- Azure DevOps sign-in still primarily uses an existing Azure CLI login; the optional browser fallback requires a configured publisher client ID and remains subject to tenant consent and Conditional Access. GitHub uses the GitHub CLI login. Standalone Microsoft browser authentication was not added in this beta.
- Pricing is modeled public-list-price guidance, not an invoice, confirmed licensed-seat inventory or a purchasing recommendation. Missing evidence is not zero usage. Security settings do not prove successful scanning or compliance.
- Reports are held in local process memory and are cleared when the app closes. Exported reports contain potentially sensitive organization, repository and identity information; share only with authorized recipients.
- PDF standard-font limitations can replace unsupported characters with `?`; CSV and HTML retain Unicode text.

### Validation

- Full local `npm run ci`: formatting, lint, type checks, 140 unit/integration tests, executable build and packaged smoke tests passed.
- Packaged tests cover normal startup, timezone option syntaxes, help, invalid arguments and local session authorization.
- Synthetic Edge checks passed at desktop/mobile widths, including report navigation, filters, downloads, repository links and HTML printing. UTC and America/Toronto display cases were checked; live customer collection and tenant permissions were not validated as part of release preparation.
