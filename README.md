# Committer Insights

Explore Azure DevOps and GitHub repository activity, security settings, and cost estimates on your own computer. Review interactive reports and export CSV, PDF, or standalone HTML without uploading report data to a hosted service.

[Download the Windows beta](https://github.com/ninjapaw/committer-insights/releases) | [Explore the synthetic demo](https://ninjapaw.github.io/committer-insights/) | [Release notes](https://github.com/ninjapaw/committer-insights/releases)

> **Independent community project.** This is not a Microsoft or GitHub product, assessment, endorsement, support offering, or official licensing source. Validate estimates and generated reports against official sources before making business decisions. See [DISCLAIMER.md](DISCLAIMER.md).

> **Evaluation beta:** the Windows executable is unsigned and the Microsoft Entra publisher is unverified. Windows or your organization may block it or require approval. A checksum verifies download integrity, not publisher identity. Do not bypass your organization's security policies.

## Get Started

1. Download `committer-insights.exe` and `SHA256SUMS.txt` from the same release. Windows x64 is the packaged target.
2. Compare the executable's SHA-256 with the value in `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash .\committer-insights.exe -Algorithm SHA256
   ```

3. Run the executable. It checks for updates and opens the local workspace in your browser.
4. Sign in to Microsoft and/or GitHub, then choose the organizations, repositories or enterprise targets available to your account.
5. Select security plans and an activity window, review the access check, and generate your report. Inaccessible sources are reported explicitly.
6. Review the results and download the formats you need. Closing the application clears its in-memory reports; exported files remain on disk.

Beta.9 Windows builds include Node.js, GitHub CLI, and Azure CLI. No separate runtime, CLI installation, administrator rights, or PATH changes are needed. Internet access and authorized provider accounts are required for sign-in and collection. Endpoint controls and organization approval still apply.

## Sign In

**Microsoft:** choose **Sign in with Microsoft** or **Sign in with a device code**. Authentication uses Azure Identity directly, not Azure CLI. Customers do not create app registrations or provide client secrets or PATs. Organizational Microsoft accounts are supported; personal Microsoft accounts are not. Tenant consent and Conditional Access may require administrator approval or block device codes.

**Azure CLI (Windows package):** the explicit **Sign in with Azure CLI** option uses bundled Azure CLI 2.90.0 and displays a Microsoft verification link and device code. Use it only where your organization permits CLI authentication. It does not bypass consent, MFA, Conditional Access, or provider permissions, and is never selected automatically after SDK sign-in fails. No publisher application ID is required for this option. First use extracts and verifies the full runtime; allow additional startup time and about 275 MB of tool-cache space.

**GitHub:** choose **Sign in with GitHub** to open the verification page automatically and display the device code and link. Enter only the code shown by your running app. This flow uses the bundled GitHub CLI and supports cancellation. Existing CLI accounts are available under **Saved accounts**.

**Change account** starts a fresh sign-in and clears that provider's source selections while preserving the other provider's selections. Existing reports remain historical snapshots.

The application makes read-only reporting requests, but GitHub CLI's OAuth scopes can include broader access. New CLI logins are saved by GitHub CLI and can change its active account for other tools. Its credential store may fall back to plaintext if the system store is unavailable. Closing Committer Insights does not revoke those credentials or sign other tools out.

## Reports

- Repository inventory, default-branch activity, daily/weekly/monthly charts, and identity contribution details.
- Current security-setting snapshots with enabled, disabled, and unknown states.
- Provider-specific cost scenarios, optional GitHub organization/enterprise billing evidence, and collection coverage.
- Evidence-linked review recommendations generated locally by deterministic rules, not an AI model.
- CSV, PDF, and standalone HTML exports containing the collected report, not just the current display filter.

PDF reports use a print-friendly version of the application's blue-and-neutral theme, with headline metrics, structured evidence, repeating table headers, clickable repository links, and continuous page numbering across provider sections.

**Azure DevOps provider-reported billing:** opt in to per-product billing snapshots and identities, with an optional UTC billing date and separately selected diagnostic details. Reports retain provider counts, subscription scope, collection status, and available project/repository/push evidence. Unmatched diagnostic identities are not added to totals. Reconciled counts cover only the selected organizations with complete same-date identity lists, not an entire subscription or invoice. Diagnostic data can include personal identities and email addresses.

**GitHub provider-reported billing:** opt in to billing snapshots when selecting sources. The GitHub billing section contains current organization security committer counts, repository breakdowns, user logins, last-push dates/emails, and organization or enterprise usage charges. Usage summary, premium-request, and AI-credit reports retain units, rates, gross amounts, discounts, and net amounts separately. Your account/token needs the corresponding billing access; this option does not grant permissions or change authentication scopes.

Security snapshots are current at collection and do not follow the activity date filter. Daily usage detail follows the selected window; aggregate reports cover each full calendar month intersecting that window (current month to date). Enterprise usage summaries include all cost centers; the detailed enterprise usage endpoint defaults to unassigned-cost-center usage only. These datasets overlap: do not add detail to summaries, premium/AI data to other usage, or organizations to their parent enterprise. Bundle and standalone security products are queried independently; an inapplicable product may be unavailable. Enterprise-wide security-seat reconciliation, Enterprise license inventories, invoices, payments, tax and contractual adjustments are not supplied by this report. Empty, denied, and incomplete results remain explicitly labeled.

Azure DevOps and GitHub quantities and costs remain separate. Missing, failed, or capped data is unavailable, not zero. Observed committers are not verified licensed seats. Security settings are not proof of successful scans, historical coverage, compliance, or entitlement. Estimates are planning scenarios, not invoices or purchasing recommendations; validate current prices, contracts, eligibility, and discounts with the providers.

The optional **AI review brief** produces aggregate text for manual use with an approved service. Nothing is sent to an AI model automatically. Even aggregate business information may be confidential; review it before sharing.

CSV and HTML preserve Unicode text; PDF standard fonts may replace unsupported characters with `?`. CSV timestamps and collection windows stay in UTC. Change dashboard/PDF/HTML display time using:

```powershell
.\committer-insights.exe --timezone America/Toronto
```

## Automatic Updates

On normal Windows startup, the app checks this repository for the newest published release, including betas. Downloads and cached executables are verified with SHA-256 before use. A newer copy runs from `%LOCALAPPDATA%\CommitterInsights\releases`; the original file and shortcut remain usable. No administrator rights are required, and old cache entries are retained.

Startup stops if the newest release cannot be confirmed or verified. For deliberate offline use, recovery, or testing, run the installed copy explicitly:

```powershell
.\committer-insights.exe --skip-update-check
```

Use `--help` to view options without contacting GitHub. Updates trust this repository's release publishers; checksums do not replace code signing. Beta.6 and earlier need a one-time manual upgrade to obtain the updater.

## Privacy and Security

Committer Insights has no report-processing backend and sends no product telemetry. Authentication and collection contact Microsoft and GitHub directly; update checks contact GitHub Releases. Provider access tokens are not returned to the browser. SDK Microsoft tokens and reports remain in application memory; GitHub CLI manages its own credential storage.

The optional Azure CLI flow uses a fresh temporary credential directory for each sign-in, separate from your existing CLI accounts. It disables CLI telemetry, dynamic extension installation, and the Windows authentication broker. The directory is removed on cancellation, account change, sign-out, or normal process exit; a crash or forced termination may leave sensitive files under your temporary directory (`committer-azure-sign-in-*`). Remove those leftovers only when the application is closed. Deleting a local cache does not revoke issued tokens. The verified tool runtime remains under `%LOCALAPPDATA%\CommitterInsights\tools\azure-cli`.

Reports can contain organization and repository identifiers, project metadata, contributor identities, activity, security settings, timestamps, and optional billing amounts. Source files, commit messages, patches, and GitHub author email addresses from activity collection are not retained. Opt-in GitHub security billing includes provider-reported last-push email addresses and logins. Exports may contain personal and commercially sensitive information: apply your organization's retention and sharing policies.

The local server binds to loopback and requires a per-launch session credential. It is not designed to protect against a compromised computer, same-user malware, or privileged browser extensions. Do not share local session URLs or device codes. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not public issues.

## What's New in Beta.9

- Separate Azure DevOps and GitHub provider-reported billing views, including counts, identities, coverage, and available usage charges in the dashboard and all exports.
- Preserved provider counts and explicit incomplete-data states instead of treating missing identity detail as zero. Billing remains separate from activity-based estimates.
- Bundled Azure CLI 2.90.0 with an explicit sign-in option, verified runtime files, and an isolated temporary credential cache. Existing SDK sign-in and bundled GitHub CLI remain available.
- Print-friendly PDF styling, readable tables, improved pagination, and continuous page numbers.
- A single GitHub sign-in action that retains its device code and cancellation controls.
- Expanded fictional demos covering overlapping billing identities, older commits pushed recently, unmatched identities, and denied billing access.

Billing behavior is validated with synthetic responses, not live customer invoices or tenant-wide reconciliation. Preview API availability and permissions vary. Beta.7 and beta.8 users receive the new package through the startup update check once published; older downloaded packages are not modified in place. See [GitHub Releases](https://github.com/ninjapaw/committer-insights/releases) for full notes, validation details, and previous versions.

## Troubleshooting

| Problem                                              | Next Step                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Windows or organization policy blocks the executable | Ask your administrator to review this unsigned evaluation build. Do not disable endpoint protection.                                 |
| Microsoft requests approval                          | Follow your tenant's consent process. Device codes do not bypass tenant policy.                                                      |
| Microsoft sign-in is not configured                  | Obtain a configured release from the publisher; `az login` does not fix the packaged configuration.                                  |
| GitHub login or bundled tool fails                   | Re-download the current release and check endpoint-policy restrictions. A global CLI installation does not replace the bundled tool. |
| A source or dataset is unavailable                   | Check the report's coverage warnings and your existing access. Do not grant write/admin access merely to fill report gaps.           |
| GitHub organization access is missing                | Complete any required organization OAuth or SAML authorization using an approved account.                                            |
| The local session expired                            | Close stale tabs and reopen the app using the browser window it launches.                                                            |
| Update checks fail                                   | Retry with internet access. Use `--skip-update-check` only to deliberately run the installed version.                                |

## Build and Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [maintainer guide](docs/maintaining.md) for development, publisher setup, packaging, validation, and release procedures. Source development requires Node.js, npm, and a system GitHub CLI; the packaged Windows app does not.

The public demo uses deterministic fictional data only. It does not perform provider sign-in or collect customer reports.

## License

MIT. See [LICENSE](LICENSE). Bundled GitHub CLI has its own MIT license, reproduced in the release's `THIRD-PARTY-NOTICES.txt`. The Azure CLI distribution preserves its Python and dependency license files; consult its companion inventory and bundled notices. Microsoft, Azure, Azure DevOps, and GitHub names identify the products discussed and do not imply affiliation or trademark rights.
