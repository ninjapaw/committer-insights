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

Beta.10 Windows builds include Node.js, GitHub CLI, and Azure CLI. No separate runtime, CLI installation, administrator rights, or PATH changes are needed. Internet access and authorized provider accounts are required for sign-in and collection. Endpoint controls and organization approval still apply.

## Sign In

Beta.13 fixes runtime-cache publication failures that could prevent Microsoft login from starting. Temporary Windows file locks receive bounded retries without weakening integrity checks. The app now distinguishes runtime preparation from account selection and reports preparation failures explicitly. Cancel any pending sign-in and restart with [beta.13](https://github.com/ninjapaw/committer-insights/releases/tag/v0.1.0-beta.13). Live account-picker confirmation on the affected workstation remains pending.

This section describes beta.10. Beta.9 exposed Azure CLI as a separate option; upgrade to beta.10 for the default modern Microsoft account picker.

**Microsoft (Windows package):** **Sign in with Microsoft** and **Change account** use bundled Azure CLI 2.90.0 with Windows Web Account Manager (WAM) enabled. Microsoft's modern account picker lets you choose a Windows account or sign in with another account; the application never requests your password. The CLI requests account selection rather than supplying a username. Device-code authentication is not forced; any browser or device fallback is controlled by the CLI, not an automatic SDK retry. There is no separate Azure CLI button and no publisher application ID is required for this default path. First use extracts and verifies the runtime; allow additional startup time and about 275 MB of tool-cache space.

**Sign in with a device code** remains a separate, explicit Azure Identity option that requires publisher configuration. It is not used automatically if CLI sign-in fails. Customers do not create app registrations or provide client secrets or PATs. The CLI default requires the Windows x64 package; source/non-Windows runs do not fall back to a system CLI or the SDK. Tenant consent, MFA, Conditional Access, and provider permissions remain authoritative for both methods.

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

Beta.10 puts **Collection at a glance** and **Reported usage subtotals** before detailed evidence. Prices appear once per provider; HTML raw datasets are expandable and retain all rows. Usage subtotals prefer complete monthly summaries to overlapping daily detail, keeping accounts, periods, products and units separate. Azure billing failures distinguish HTTP status, unsupported response format, truncation and timeout without exposing raw provider messages. Older exports cannot reveal which of those failures occurred; regenerate the report with the updated build.

**Azure DevOps provider-reported billing:** opt in to per-product billing snapshots and identities, with an optional UTC billing date and separately selected diagnostic details. Reports retain provider counts, subscription scope, collection status, and available project/repository/push evidence. Unmatched diagnostic identities are not added to totals. Reconciled counts cover only the selected organizations with complete same-date identity lists, not an entire subscription or invoice. Diagnostic data can include personal identities and email addresses.

**Azure DevOps enablement scenarios:** selected security plans always request Microsoft's organization-level enablement estimate, even when billing is unavailable or the product is disabled. In the Azure billing section, **Azure billing and enablement scenarios** compares the dated billable count with the provider estimate and modeled monthly/annualized cost. Provider counts remain usable when names are incomplete; each product reports its own success or failure. The evidence and provenance views retain completeness warnings, visible repository settings, billing date, collection timestamp, source URL, and price assumptions.

Code Security uses USD 30 and Secret Protection USD 19 per estimated committer/month, checked against [Azure DevOps pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/) on 2026-09-24. For example, an estimate of 12 Code Security committers models $360/month even if the dated billing snapshot says disabled with zero billed committers. This is not a charge, quote, or guaranteed number of additional seats. Do not add estimates to billed counts or sum organizations sharing a subscription. The snapshot-count monthly equivalent is also only a model, not an invoice. No product is enabled or billing setting changed.

For a product that is off, the primary result is its provider-estimated committer count multiplied by its monthly rate; a billing snapshot is optional, not a prerequisite. Code Security and Secret Protection are calculated independently. The primary table shows the arithmetic and whether identity detail reconciles, while observed on/off state and dated billing counts remain in the evidence view. New reports show this provider-count estimate once instead of repeating an identity-row estimate. No percentage accuracy is claimed: Microsoft supplies an estimate, and actual billing depends on daily eligible identities, subscription-wide deduplication, enabled scope, contract rates and adjustments. When the estimate API is unavailable, the report does not invent a count from Git history or silently enter zero.

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

If an older updater closes its window without opening a working app, download the newest executable and its matching checksum directly from Releases, verify it, then launch that downloaded copy from PowerShell with `--skip-update-check`. This bypasses the old updater's process handoff, not Windows security controls. Keep the app's console open while using the browser. Beta.11 keeps the launcher attached until the upgraded app exits and reports abnormal child exits; earlier downloaded launchers still use their original handoff behavior.

## Other Azure DevOps Service Estimates

Report setup now includes per-organization what-if quantities for Basic, Basic + Test Plans, Pipelines, Artifacts and GitHub AI credits for Azure DevOps. The preview, results dashboard and CSV/HTML/PDF exports use the same calculations. These quantities are user-entered, not collected license or usage inventories; an empty quantity stays unavailable instead of becoming zero. Security committer estimates are never reused as user-license counts.

| Service                    | Monthly USD list-price calculation                                                  |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Basic                      | `max(0, eligible Basic users - allocated free seats) x $6`; at most five free seats |
| Basic + Test Plans         | Paid users x $52; Basic is included, not added again                                |
| Microsoft-hosted Pipelines | Paid parallel jobs x $40                                                            |
| Self-hosted Pipelines      | Paid parallel jobs x $15                                                            |
| GitHub-hosted macOS agents | Standard minutes x $0.062; XL minutes x $0.102                                      |
| Artifacts                  | First 2 GiB free; next 8 x $2, next 90 x $1, next 900 x $0.50, remainder x $0.25    |
| GitHub AI credits          | Billable credits x $0.01                                                            |

Prices checked 2026-09-24 against [Microsoft's rate card](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/). Exclude qualifying Visual Studio/GitHub Enterprise included licenses before entering user counts and allocate free Basic seats according to your billing scope. A first paid Microsoft-hosted job replaces the free job, not adds to it; the free grant, when approved, has one job and 1,800 minutes/month. Enter paid capacity after applicable self-hosted benefits. Storage assumes a constant full-month GiB amount; actual usage and billing can change daily. AI credits cover billable credits after benefits, not a predicted credit cost per request. Annualized amounts are monthly x 12, not quotes. Taxes, negotiated discounts, proration and additional agent infrastructure are excluded. No cross-organization or security-plus-service grand total is inferred.

## Privacy and Security

Committer Insights has no report-processing backend and sends no product telemetry. Authentication and collection contact Microsoft and GitHub directly; update checks contact GitHub Releases. Provider access tokens are not returned to the browser. SDK Microsoft tokens and reports remain in application memory; GitHub CLI manages its own credential storage.

The default Azure CLI flow uses a fresh temporary CLI directory for each sign-in, separate from your existing CLI configuration. CLI telemetry and dynamic extension installation are disabled. Windows Web Account Manager manages broker credentials outside this directory and may reuse Windows accounts or retain sign-in state. App sign-out and cache removal do not sign you out of Windows or revoke issued tokens. The app-owned directory is removed on cancellation, account change, sign-out, or normal process exit; a crash or forced termination may leave sensitive files under your temporary directory (`committer-azure-sign-in-*`). Remove those leftovers only when the application is closed. The verified tool runtime remains under `%LOCALAPPDATA%\CommitterInsights\tools\azure-cli`.

Reports can contain organization and repository identifiers, project metadata, contributor identities, activity, security settings, timestamps, and optional billing amounts. Source files, commit messages, patches, and GitHub author email addresses from activity collection are not retained. Opt-in GitHub security billing includes provider-reported last-push email addresses and logins. Exports may contain personal and commercially sensitive information: apply your organization's retention and sharing policies.

The local server binds to loopback and requires a per-launch session credential. It is not designed to protect against a compromised computer, same-user malware, or privileged browser extensions. Do not share local session URLs or device codes. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not public issues.

## What's New in Beta.12

- Microsoft sign-in no longer hides the interactive CLI console that Windows Web Account Manager uses to parent its account picker. Background version and token requests remain hidden.
- Added authentication regressions and a native Windows check confirming the console handle is available for interactive subprocesses. WAM, tenant policy, credential isolation and cancellation remain unchanged.

All 267 automated tests and Windows packaging checks pass. Live account selection on the affected workstation remains unverified. Cancel any pending sign-in, close the old app and open the new executable before retrying. See [beta.12 release notes](https://github.com/ninjapaw/committer-insights/releases/tag/v0.1.0-beta.12). This remains an unsigned evaluation prerelease.

## What's New in Beta.11

- Upgrade handoffs keep the launcher and upgraded application attached to the same console instead of detaching a hidden child and exiting immediately.
- The launcher waits for the upgraded application to exit and reports launch errors, nonzero exit codes and termination signals.
- A packaged regression starts a relocated Windows executable, verifies its protected local session, checks launcher lifetime and confirms abnormal-exit reporting.

All 266 automated tests and the packaged smoke checks pass. Existing beta.10 or older launchers are not rewritten in place: download beta.11 directly if the old handoff closes without a working app. This remains an unsigned evaluation prerelease; see [beta.11 release notes](https://github.com/ninjapaw/committer-insights/releases/tag/v0.1.0-beta.11).

## What's New in Beta.10

- Default Microsoft sign-in and account changes use the bundled Azure CLI with the modern Windows account picker. Device codes are not forced; Windows broker credentials remain managed by Windows.
- Azure security estimates retain provider counts even when identity detail is incomplete or billing history is unavailable. Each selected product has independent calculations and collection status.
- Basic, Basic + Test Plans, Pipelines, Artifacts and AI-credit what-if inputs show monthly calculations and annualized costs in the dashboard and all exports, without substituting committer counts for usage.
- Consolidated coverage summaries, nonoverlapping usage subtotals and expandable HTML evidence make missing data and pricing assumptions visible.
- Synthetic fixtures cover service-pricing tiers, disabled products, denied billing, and partial estimates. These changes do not enable products or change provider billing settings.

Validation includes 264 automated tests, Windows packaging and CLI smoke checks, plus desktop/mobile synthetic export checks. Live WAM sign-in, customer invoice reconciliation and clean-machine certification remain separate acceptance checks. This is an unsigned evaluation prerelease; see [beta.10 release notes](https://github.com/ninjapaw/committer-insights/releases/tag/v0.1.0-beta.10) for the downloadable package and checksums.

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
| Explicit device-code sign-in is not configured       | Obtain a publisher-configured build. The development build's default bundled CLI path does not require the publisher app ID.         |
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
