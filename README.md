# Developer Usage Insights

Review Azure DevOps and GitHub plans, repository activity, security settings, reported billing, access coverage, and cost scenarios on your own computer. Explore interactive reports and export CSV, PDF, or standalone HTML without uploading report data to a hosted service.

[Download releases](https://github.com/ninjapaw/committer-insights/releases) | [Try the synthetic demo](https://ninjapaw.github.io/committer-insights/) | [Release notes](https://github.com/ninjapaw/committer-insights/releases)

> **Evaluation beta:** the Windows executable is unsigned and the Microsoft Entra publisher is unverified. Your organization may block it or require approval. Checksums verify download integrity, not publisher identity. Do not bypass security policies.
>
> **Independent community project.** Not a Microsoft or GitHub product, endorsement, support offering, or official licensing source. Validate reports and estimates before making business decisions. See the [disclaimer](DISCLAIMER.md).

## Contents

- [Get Started](#get-started)
- [Sign In](#sign-in)
- [Create and Export Reports](#create-and-export-reports)
- [Access and Data Coverage](#access-and-data-coverage)
- [Billing and Estimates](#billing-and-estimates)
- [Privacy and Security](#privacy-and-security)
- [Updates](#updates)
- [Troubleshooting](#troubleshooting)
- [Technical Collection Reference](#technical-collection-reference)
- [Contributing](#contributing)
- [Maintenance](#maintenance)
- [License](#license)

## Get Started

**Requirements:** Windows x64, macOS, or Linux, a web browser, internet access, and an authorized Microsoft or GitHub account. Windows/Linux releases include Node and the application; macOS releases require Node.js on `PATH`. Install Azure CLI (`az`) and GitHub CLI (`gh`) separately on macOS/Linux and make both available on `PATH` before provider sign-in. No administrator rights are required. Organization and endpoint restrictions still apply.

1. Download the release for your operating system and architecture from the **same [release](https://github.com/ninjapaw/committer-insights/releases)**.
2. Calculate the executable's SHA-256 and compare it with the downloaded checksum:

   ```powershell
   Get-FileHash .\developer-usage-insights.exe -Algorithm SHA256
   ```

3. Run the executable. It checks for updates and opens the local workspace in your browser. Windows first launch prepares the Microsoft sign-in runtime; macOS/Linux use the installed Azure CLI and GitHub CLI.
4. Sign in, select your sources and report options, then review access before generating a report.
5. Export anything you need to keep before closing the application. Reports are held in memory; downloaded exports remain on disk.

Keep the application console open while using the browser. The Microsoft runtime uses approximately 106 MB of local cache space, plus temporary extraction space. Later launches verify the cache before opening the workspace, without signing you in automatically.

On macOS, open the `developer-usage-insights-darwin-arm64.dmg` disk image and launch the included app. The launcher resolves Node.js from common Homebrew, system, nvm, and mise locations; if it cannot find Node.js, it displays an actionable macOS dialog. The default image is an unsigned evaluation build; a Developer ID signature and Apple notarization are required for Gatekeeper-approved distribution. On Linux, make `developer-usage-insights` runnable with `chmod +x` and use the included `run-developer-usage-insights.sh` launcher. The release archive includes the platform requirements. The [public demo](https://ninjapaw.github.io/committer-insights/) contains fictional complete, partial, and empty reports. It requires no sign-in and collects no customer data.

## Sign In

### Microsoft

Choose **Sign in with Microsoft** to select an account in your default browser. The Windows package uses an isolated bundled Azure CLI session; the application never asks for your password, a personal access token, or a client secret. Customers do not need to create an app registration.

**Sign in with a device code** is a separate, explicit option in publisher-configured builds, not an automatic retry after browser sign-in fails. Tenant consent, MFA, Conditional Access, and Azure DevOps permissions apply to both methods. Policies requiring Windows account-broker authentication may reject the browser flow.

### GitHub

Choose **Sign in with GitHub** to open GitHub's verification page and display a device code. Enter only the code shown by your running application. You can cancel the flow or choose an existing GitHub CLI identity under **Saved accounts**.

GitHub CLI saves new logins and may change its active account for other tools. Its OAuth scopes can be broader than this application's read-only reporting requests. Credentials may be stored in plaintext if the system credential store is unavailable; closing this app does not revoke them or sign other tools out.

### Changing Accounts

**Change account** starts a fresh sign-in and clears that provider's source selections, preserving the other provider's selections. Existing reports remain historical snapshots; generate a new report to reflect the new account's access.

## Create and Export Reports

Select the organizations, repositories, or enterprise targets available to your account, choose security plans, and review the collection results before generating a report.

| Report Area     | What You Can Review                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Activity        | Visible repository inventory, default-branch activity, contributor details, and daily, weekly, or monthly charts |
| Security        | Current settings with enabled, disabled, and unknown states                                                      |
| Billing         | Available provider-reported counts and usage, with dates and collection status                                   |
| Estimates       | Security enablement scenarios and optional Azure DevOps service what-if calculations                             |
| Coverage        | Successful, partial, and unavailable datasets, with warnings and evidence                                        |
| Recommendations | Evidence-linked observations generated locally by deterministic rules, not an AI model                           |

**New report defaults:** activity collection and the initial results view use 90 days, capped to available data. Reported billing is enabled for both providers and can be turned off. Azure billing diagnostic details remain off unless selected. Current settings, billing snapshots, and monthly aggregates keep their actual reporting periods rather than being relabeled as 90-day data.

CSV, PDF, and standalone HTML exports contain the collected report, not just the current display filter. HTML downloads preserve the dashboard's light or dark theme, use matching responsive navigation and table styling, and remain self-contained without scripts or external assets. Provider sections are all included in the file rather than hidden behind dashboard tabs. CSV and HTML preserve Unicode; PDF standard fonts may replace unsupported characters with `?`. CSV timestamps and collection windows stay in UTC. To change dashboard, PDF, and HTML display time:

```powershell
.\developer-usage-insights.exe --timezone America/Toronto
```

The optional **AI review brief** produces aggregate text for manual use with an approved service. Nothing is sent to an AI model automatically. Review it for confidential information before sharing.

## Access and Data Coverage

**Signing in does not mean every dataset is accessible.** Project visibility, repository Read access, security-product access, billing permissions, account access levels, and explicit Deny rules can differ within the same organization.

Azure DevOps source review checks selected product estimates, current security settings, visible repository history, and requested billing datasets independently, using the same read-only collectors as report generation. A readable estimate does not prove Git or billing access. Usable sources with missing datasets are labeled **Partial data access**, with individual results and safe failure explanations. Generation repeats the reads, so permissions or data can change between review and collection.

GitHub source review verifies minimum access; it does not certify all billing or repository reads. Review the generated report's coverage warnings for dataset-specific results.

- Hidden or denied projects and repositories may be absent even when visible data was read successfully.
- Failed, incomplete, or capped collection is not zero activity or zero cost.
- Empty inventory is not proof of access to all repository history.
- Security-setting snapshots do not prove successful scans, historical coverage, compliance, or entitlement.
- The app does not grant permissions, enable products, or change provider billing settings.

For missing data, ask your administrator to review the specific dataset and reported reason. Do not grant write or administrator access merely to fill report gaps.

## Billing and Estimates

**Reported billing, observed activity, and modeled costs are different evidence.** Keep Azure DevOps and GitHub results separate. Observed committers are not verified licensed seats, and estimates are not invoices, quotes, or purchasing recommendations.

The report now keeps four populations separate: observed contributors from repository history, Azure DevOps provider-estimated users for products that could be enabled, users present in Azure DevOps billing snapshots, and GitHub Advanced Security billing identities. The dashboard and exports classify identities as estimated only, currently licensed, both, or unavailable rather than presenting one blended licensing total.

Repository history scans all discovered branches by default and deduplicates overlapping commits by commit SHA or commit ID. A provider pagination ceiling can still make a repository result a lower bound; the report marks that repository as truncated and never presents the partial count as complete. Default-branch-only collection remains available as an explicit source option for faster spot checks.

### Azure DevOps

Reported billing includes available per-product snapshots and identities, with an optional UTC billing date. Diagnostic details are separately selectable and may contain personal identities, email addresses, and project, repository, or push evidence. Reconciled counts cover only selected organizations with complete same-date identity lists, not an entire subscription or invoice. Unmatched diagnostic identities are not added to totals.

Selected security plans also request Microsoft's organization-level enablement estimates, even when a product is disabled or billing is unavailable. These estimates are intended to identify users from repositories where Advanced Security is off and to model what enablement could cost; they are not invoices. Code Security and Secret Protection are calculated independently using provider counts and the report's dated price assumptions. Incomplete identity detail remains visible; an unavailable estimate is never replaced with a count invented from Git history.

Optional service scenarios use **your entered quantities**, not collected license or usage inventories, for Basic, Basic + Test Plans, Pipelines, Artifacts, and GitHub AI credits for Azure DevOps. Empty quantities stay unavailable. Review included-license benefits, free allowances, paid capacity, and billing scope before entering values.

Check the [official Azure DevOps pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/) and your agreement. Do not add enablement estimates to billed counts or sum organizations sharing a subscription. Monthly and annualized models exclude taxes, negotiated discounts, proration, and other contract adjustments; no cross-organization grand total is inferred.

### GitHub Billing

Available billing evidence includes current organization security committer counts, repository breakdowns, identities, and organization or enterprise usage charges. Your account needs the corresponding billing access; selecting billing does not grant permissions or expand authentication scopes.

Security snapshots are current at collection. Daily usage follows the activity window; aggregates cover each calendar month intersecting it, with the current month to date. Detailed enterprise usage defaults to unassigned-cost-center usage, while enterprise summaries include all cost centers.

These datasets overlap: do not add detail to summaries, premium-request or AI-credit data to other usage, or organizations to their parent enterprise. Enterprise-wide security-seat reconciliation, license inventories, invoices, payments, tax, and contractual adjustments are not supplied. Check [GitHub's billing documentation](https://docs.github.com/en/billing) and the report's coverage before interpreting amounts.

## Privacy and Security

There is no report-processing backend or product telemetry. Authentication and collection contact Microsoft and GitHub directly; update checks contact GitHub Releases. Provider access tokens are not returned to the browser.

| Data                             | Storage and Handling                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reports and SDK Microsoft tokens | Application memory; reports are cleared when the app closes                                                                                           |
| Exported reports                 | Files you explicitly download; retained until you remove them                                                                                         |
| Microsoft CLI credentials        | Fresh app-owned temporary directory, separate from your existing CLI configuration; removed on cancellation, account change, sign-out, or normal exit |
| GitHub credentials               | Managed and retained by GitHub CLI independently of this app                                                                                          |
| Verified tools and updates       | Per-user cache under `%LOCALAPPDATA%\CommitterInsights`                                                                                               |

A crash or forced termination may leave sensitive Microsoft CLI files in temporary directories named `committer-azure-sign-in-*`. Remove those leftovers only when the app is closed. Sign-out does not clear browser cookies, Windows accounts, credentials retained by older broker-based versions, or revoke issued tokens. Runtime integrity is verified at startup, not continuously during the session.

Reports may contain organization and repository identifiers, project metadata, contributor identities, activity, security settings, timestamps, and billing amounts. Source files, commit messages, patches, and GitHub author email addresses from activity collection are not retained. **GitHub security billing, enabled by default, can include last-push email addresses and logins.** Apply your organization's retention and sharing policies to reports, exports, and review briefs.

The local server binds to loopback and requires a per-launch session credential. It does not protect against a compromised computer, same-user malware, or privileged browser extensions. Never share local session URLs or device codes. Report vulnerabilities privately through the [security policy](SECURITY.md), not public issues.

## Updates

Normal Windows startup checks for the newest published release, **including prereleases**, and verifies downloads and cached executables with SHA-256. Newer copies run from `%LOCALAPPDATA%\CommitterInsights\releases`; the original executable is not overwritten, and older cache entries are retained. Updates trust this repository's release publishers, not a verified code-signing identity.

Startup stops if the newest release cannot be confirmed or verified. To deliberately run your installed copy without checking for updates:

```powershell
.\developer-usage-insights.exe --skip-update-check
```

Alternatively, control automatic updates through the launch environment:

```powershell
$env:DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE = 'false'
.\developer-usage-insights.exe
```

`DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE` defaults to `true` when unset or blank. It accepts `true` or `false` (case-insensitive, surrounding whitespace ignored); other values stop startup with an error. Set the variable back to `true` or remove it to restore checks. The PowerShell example affects this shell and its child processes only. `--skip-update-check` always disables checks for that launch, even when the variable is `true`. This controls the packaged Windows startup updater, not a background Windows service; it does not change download verification or provider collection.

This does not make provider sign-in or collection available offline. Use `--help` to view options without contacting GitHub. For changes and previous versions, see [release notes](https://github.com/ninjapaw/committer-insights/releases).

## Troubleshooting

| Problem                                                              | Next Step                                                                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows or organization policy blocks the executable                 | Ask your administrator to review this unsigned evaluation build. Do not disable endpoint protection.                                                                        |
| Microsoft runtime preparation fails                                  | Preserve any reports, close the app, and restart the current release. Check the console and endpoint restrictions. GitHub remains available if Microsoft preparation fails. |
| Microsoft requests approval or rejects sign-in                       | Follow your tenant's consent and Conditional Access process. Device codes do not bypass tenant policy.                                                                      |
| Explicit device-code sign-in is not configured                       | Use a publisher-configured Windows release. Customers do not need to create an app registration.                                                                            |
| GitHub organization access is missing                                | Complete required organization OAuth or SAML authorization using an approved account.                                                                                       |
| A source is accessible but most datasets are unavailable             | Review each dataset's result. Ask your administrator about project visibility, repository Read, security and billing access, account access level, and explicit Deny.       |
| A bundled tool fails                                                 | Verify the current download and check endpoint restrictions. Installing a global CLI does not replace the bundled tool.                                                     |
| The local session expired                                            | Close stale tabs and reopen the app using the browser window it launches.                                                                                                   |
| Update checks fail or an old launcher closes without opening the app | Download and verify the current release directly. Launch it from PowerShell with `--skip-update-check` for deliberate recovery; keep its console open.                      |

For a reproducible application issue, use [GitHub Issues](https://github.com/ninjapaw/committer-insights/issues). Include the app version, Windows version, reproduction steps, and sanitized error text. Do not attach credentials, device codes, local session URLs, or customer reports. Use the private reporting process for security issues.

## Technical Collection Reference

This inventory describes the current collectors, reviewed against official references on **2026-09-25**. Microsoft documentation now lives on `learn.microsoft.com` (formerly `docs.microsoft.com`); GitHub references use its official documentation and API specification. A documentation link verifies the interface or field meaning, **not** this application's completeness, your permissions, or the accuracy of a specific report. Provider schemas, previews, and authorization requirements can change.

[Authentication and Transport](#authentication-and-transport) | [Azure DevOps Collection](#azure-devops-collection) | [GitHub Collection](#github-collection) | [GitHub Billing Collection](#github-billing-collection) | [Local Calculations](#local-calculations) | [Not Collected](#not-collected) | [Verify a Result](#verify-a-result)

### Authentication and Transport

Collectors use Node's HTTP `fetch` with bearer authentication and Zod response validation. They make read-only **GET** requests, not repository clones, web scraping, Microsoft Graph directory enumeration, or Azure Resource Manager queries. The CLIs acquire credentials; the TypeScript adapters perform report collection. Authentication itself exchanges credentials with the providers and is not limited to GET requests.

| Purpose                                 | Mechanism Used                                                                                                                                                                                                                                                                                                                                                                                                       | Official Verification                                                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft browser sign-in and tokens    | Windows packages use a bundled Azure CLI in an isolated session; macOS/Linux packages use the installed `az` command in an isolated session. Both request tokens for Azure DevOps resource `499b84ac-1321-427f-aa17-267ca6975798`; selected tenant and expiry are retained API-side. CLI login also performs its normal Azure account discovery, not a report inventory of Azure resources.                          | [Interactive login](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively), [Azure DevOps Entra tokens](https://learn.microsoft.com/en-us/azure/devops/cli/entra-tokens?view=azure-devops)                                               |
| Explicit Microsoft device code          | `@azure/identity` `DeviceCodeCredential`, using `https://app.vssps.visualstudio.com/.default` and the publisher public-client registration. No automatic SDK fallback from CLI failure.                                                                                                                                                                                                                              | [DeviceCodeCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/devicecodecredential), [Entra authentication for Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra?view=azure-devops) |
| GitHub login, saved accounts and tokens | Windows packages use a bundled verified `gh`; macOS/Linux packages require `gh` on `PATH`. The app runs `gh auth login --hostname github.com --web --skip-ssh-key`, reads saved account metadata from `gh auth status --json hosts`, and gets tokens from `gh auth token --hostname github.com`. Inherited GitHub token environment variables are removed from child processes. Tokens never enter the UI or report. | [GitHub CLI login](https://cli.github.com/manual/gh_auth_login), [status](https://cli.github.com/manual/gh_auth_status), [token](https://cli.github.com/manual/gh_auth_token)                                                                                       |
| GitHub data reads                       | `https://api.github.com`, `Accept: application/vnd.github+json`; `X-GitHub-Api-Version: 2022-11-28` for discovery/activity/settings and `2026-03-10` for billing. This is GitHub.com, not a configurable Enterprise Server host.                                                                                                                                                                                     | [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), [authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)                                                                                    |
| Application update metadata             | Public `GET /repos/ninjapaw/committer-insights/releases`, followed by the selected executable/checksum assets. Publication time determines selection, including prereleases. This collects app version/asset metadata, not customer reports.                                                                                                                                                                         | [List releases](https://docs.github.com/en/rest/releases/releases#list-releases), [release assets](https://docs.github.com/en/rest/releases/assets)                                                                                                                 |

Implementation: [Microsoft credential handling](api/src/auth/local-credential.ts), [GitHub credential handling](api/src/auth/github-cli.ts), [GitHub HTTP client](api/src/adapters/github/http-client.ts), [provider configuration](api/src/shared/config.ts), and [updater](api/src/release-updater.ts).

### Azure DevOps Collection

In this table, `P` means `https://app.vssps.visualstudio.com`, `D` means `https://dev.azure.com/{organization}`, and `A` means `https://advsec.dev.azure.com/{organization}`. All rows use GET. `plan` is independently `codeSecurity` or `secretProtection`; selecting all expands to both. Only the fields described here are used or retained in normalized report/session data, not every property in the raw response.

| Dataset                               | Request and API Version                                                                                                                                                                                 | Fields and Processing                                                                                                                                                                                                       | Official Verification                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in profile                     | `P/_apis/profile/profiles/me?api-version=7.1`                                                                                                                                                           | Only the profile `id` is retained by this adapter and used for membership discovery. Other profile fields are discarded; this is not a tenant user directory.                                                               | [Profiles: Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/profile/profiles/get?view=azure-devops-rest-7.1)                                                                                                                                                                 |
| Available organizations               | `P/_apis/accounts?memberId={profileId}&api-version=7.1`                                                                                                                                                 | `accountId`, `accountName`; constructs the organization URL and sorts source options. This is membership discovery, not dataset access certification.                                                                       | [Accounts: List](https://learn.microsoft.com/en-us/rest/api/azure/devops/account/accounts/list?view=azure-devops-rest-7.1)                                                                                                                                                               |
| Repository/project inventory          | `D/_apis/git/repositories?includeHidden=true&api-version=7.1`                                                                                                                                           | Repository ID/name, default branch for history queries, disabled state, project ID/name and visibility. Missing state/visibility stays unknown. `includeHidden` is a request option, not an authorization bypass.           | [Repositories: List](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/repositories/list?view=azure-devops-rest-7.1)                                                                                                                                                           |
| Repository security settings          | `A/_apis/management/enablement?includeAllProperties=true&api-version=7.2-preview.3`                                                                                                                     | Joins `reposEnablementStatus` by repository ID. Reads Code Security, Secret Protection, push blocking, CodeQL default setup, and dependency-scanning injection flags. Missing/null values become unknown, not disabled.     | [Organization enablement: Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/advancedsecurity/org-enablement/get?view=azure-devops-rest-7.2)                                                                                                                                   |
| Default-branch activity               | `D/{projectId}/_apis/git/repositories/{repositoryId}/commits?api-version=7.1` with `searchCriteria.fromDate`, `toDate`, `$top=100`, `$skip`, and `itemVersion.versionType=branch`/`itemVersion.version` | Filters returned `committer.date` to the UTC window and aggregates daily counts. Includes automation; no contributor identities are derived from this endpoint. No branch means unverified history, not zero activity.      | [Commits: Get Commits](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/commits/get-commits?view=azure-devops-rest-7.1)                                                                                                                                                       |
| Code Security enablement estimate     | `A/_apis/management/meterUsageEstimate/default?plan=codeSecurity&api-version=7.2-preview.3`                                                                                                             | Provider `uniqueCommitterCount` and available `billedUsers` identities: CUID, identity ID, descriptor, display name, and unique name. Retains count separately when names are incomplete.                                   | [Organization meter usage estimate: Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/advancedsecurity/org-meter-usage-estimate/get?view=azure-devops-rest-7.2)                                                                                                               |
| Secret Protection enablement estimate | Same estimate route with `plan=secretProtection`                                                                                                                                                        | Separate count/identity evidence for that product. The app's activity window is not sent to either estimate endpoint; provider-defined eligibility governs it.                                                              | [Estimate response and plan definitions](https://learn.microsoft.com/en-us/rest/api/azure/devops/advancedsecurity/org-meter-usage-estimate/get?view=azure-devops-rest-7.2)                                                                                                               |
| Latest reported security billing      | `A/_apis/Management/MeterUsage/Last?plan={plan}&api-version=7.2-preview.3`                                                                                                                              | Account, tenant and subscription IDs; billing date; `isPlanEnabled`; nested `billedUsers.uniqueCommitterCount` and identity list. Records request URL/version, collection time, status and warnings.                        | [ManagementRestClient: getLastMeterUsage2](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/managementrestclient), [MeterUsageForPlan](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/meterusageforplan)                         |
| Dated reported security billing       | `A/_apis/Management/MeterUsage/Default?plan={plan}&billingDate={date}T00:00:00Z&api-version=7.2-preview.3`                                                                                              | Same fields as latest billing. Returned date must match the requested UTC date and not be in the future; missing scope/count/identities produces partial evidence.                                                          | [ManagementRestClient: getMeterUsage2](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/managementrestclient), [BilledCommittersList](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/billedcommitterslist)                       |
| Optional billing diagnostics          | `A/_apis/Management/MeterUsage/Details?plan={plan}&billingDate={snapshotDate}&api-version=7.2-preview.3`                                                                                                | After a valid matching snapshot, reads VSID, pusher ID, display name, committer email, project/repository IDs and names, push ID/time, commit ID/time. These are diagnostic identities/events, not additional billed users. | [ManagementRestClient: getBillableCommitterDetails2](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/managementrestclient), [BillableCommitterDetails](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/billablecommitterdetails) |

**Security field mapping:** `codeSecurityFeatures.codeSecurityEnabled` becomes Code Security; `codeSecurityFeatures.codeQLEnabled` becomes CodeQL default setup; `codeSecurityFeatures.dependencyScanningInjectionEnabled` becomes dependency scanning default setup; `secretProtectionFeatures.secretProtectionEnabled` becomes Secret Protection; `secretProtectionFeatures.blockPushes` becomes push protection. The organization-enablement reference above defines these fields. The app does not collect the other available fields, such as Autofix, malware-alert settings, or enable-on-create policy.

**Reference scope:** the estimate and enablement links are REST operation specifications. The three MeterUsage billing rows use Microsoft's official extension-client method/type references for verification; this application calls the HTTP routes directly and does **not** install that SDK. Use the plan-specific `MeterUsageForPlan` model, not the older flat `MeterUsage` model. A method/type reference alone is not a guarantee of every service deployment's preview route behavior or permissions.

**Limits:** history uses up to four repository workers, 100 commits/page, and a 100-page cap; reaching the cap without a terminating short page leaves history unavailable. Settings/inventory responses with continuation tokens are rejected as truncated rather than silently treated as complete. Billing responses are limited to 16 MiB and 100,000 identity/detail rows, with continuation rejected. Estimate identity lists are also capped at 100,000; count/identity mismatches are partial when the provider count is usable. Collection requests have 20-second deadlines; estimate HTTP 429/502/503 responses receive up to three retries, not authorization failures. Profile/account discovery currently uses single fetches without those explicit timeout, redirect, or continuation guards. Do not assume the collection guards cover discovery.

**Access:** official REST references identify profile (`vso.profile`), Git (`vso.code`), and Advanced Security (`vso.advsec`) capabilities; these legacy OAuth scope labels are not extra permissions this app adds to an Entra token. Effective organization/project/repository access still controls each read. Review [repository permissions](https://learn.microsoft.com/en-us/azure/devops/repos/git/set-git-repository-permissions?view=azure-devops) and [Advanced Security permissions](https://learn.microsoft.com/en-us/azure/devops/repos/security/github-advanced-security-permissions?view=azure-devops). Billing access is separate. Preflight runs these collectors without saving a report and exposes each dataset's result; generation reads again.

Implementation: [profile](api/src/adapters/azure-devops/profile-client.ts), [organizations](api/src/adapters/azure-devops/organizations-client.ts), [inventory/settings/history](api/src/adapters/azure-devops/insights-client.ts), [estimates](api/src/adapters/azure-devops/estimate-client.ts), [billing](api/src/adapters/azure-devops/billing-client.ts), and [collection orchestration](api/src/services/azure-devops.ts). The estimate API version can be overridden through `AZURE_DEVOPS_API_VERSION`; this does not change the hardcoded settings/billing versions.

### GitHub Collection

All paths below use `https://api.github.com`, GET, and API version `2022-11-28` in the current implementation. Official documentation may display a newer default; the app does not silently switch versions.

| Dataset                              | Request                                                              | Fields and Processing                                                                                                                                                                                                                               | Official Verification                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in viewer                     | `/user`                                                              | `id`, `login`, optional `name`; verifies the selected CLI identity. Not a full member or license inventory.                                                                                                                                         | [Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)                                                                               |
| Organization discovery               | `/user/orgs?per_page=100`                                            | Organization ID, login, URL; sorted source choices. Follows next-page links, up to 100 pages. Invalid entries are skipped.                                                                                                                          | [List organizations for the authenticated user](https://docs.github.com/en/rest/orgs/orgs#list-organizations-for-the-authenticated-user)                                           |
| Enterprise discovery                 | `/user/enterprises?per_page=100`                                     | Expects ID, slug and URL. Reads only the first response; non-rate-limit 403/404 yields no enterprise choices. **Public API support not verified; see the warning below.**                                                                           | [Official Enterprise Cloud REST specification](https://github.com/github/rest-api-description/blob/main/descriptions/ghec/ghec.json), which does not list this path at review time |
| Organization repositories            | `/orgs/{org}/repos?type=all&sort=full_name&per_page=100`             | Retains `full_name` to drive per-repository reads; follows next links up to 100 pages. Does not filter out forks or archived repositories here.                                                                                                     | [List organization repositories](https://docs.github.com/en/rest/repos/repos#list-organization-repositories)                                                                       |
| Enterprise repositories              | `/enterprises/{enterprise}/repos?per_page=100`                       | Same expected repository list and page cap. **Public API support not verified; see below.**                                                                                                                                                         | [Official Enterprise Cloud REST specification](https://github.com/github/rest-api-description/blob/main/descriptions/ghec/ghec.json), which does not list this path at review time |
| Repository metadata/settings         | `/repos/{owner}/{repo}`                                              | Validates repository ID; retains requested full name, visibility/private fallback, archived/disabled/active state, and the five `security_and_analysis` statuses listed below. Missing settings stay unknown.                                       | [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)                                                                                                   |
| Default-branch contributors/activity | `/repos/{owner}/{repo}/commits?since={from}&until={to}&per_page=100` | No `sha` is supplied, so GitHub uses the default branch. Reads linked author ID/login/profile URL and Git author name/date; filters author date again locally; retains counts, latest author date, and daily contributions per identity/repository. | [List commits](https://docs.github.com/en/rest/commits/commits#list-commits)                                                                                                       |

**Enterprise limitation:** the two enterprise-discovery routes above are implemented but absent from the official public Enterprise Cloud OpenAPI document inspected on 2026-09-25. They must not be represented as verified supported APIs or complete enterprise inventory. Collect accessible member organizations for repository evidence instead. Documented enterprise **billing** endpoints are separate and do not prove enterprise repository discovery works. No collector behavior was changed as part of this documentation consolidation.

**Security field mapping:** from `security_and_analysis`, `advanced_security.status` becomes Advanced Security bundle; `code_security.status` becomes Code Security; `secret_scanning.status` becomes secret scanning; `secret_scanning_push_protection.status` becomes push protection; `dependabot_security_updates.status` becomes Dependabot security updates. The repository reference defines each field and notes that seeing this block requires repository admin access or organization owner/security-manager rights. A successful metadata read can therefore still lack security settings. No alert, workflow-run, or CodeQL-analysis API is called.

**Activity/identity rules:** 100 commits/page, up to 100 pages, with at most four repository workers. Remaining pages after the cap cause failure, not a complete truncated count. The adapter groups by case-insensitive login, falling back to Git author name when no linked account exists. Service-level deduplication uses stable account IDs; an unlinked normalized login/name may merge with exactly one linked candidate, otherwise it stays unlinked. Normalization removes common honorifics, a trailing bot suffix, and non-alphanumeric characters; review possible name collisions. `dependabot[bot]` and `github-actions[bot]` are excluded, not every automation account. Commits are counted per repository; overlapping sources can repeat activity. This is not GitHub's billable active-committer calculation or a deduplication by commit SHA.

**Transport/access:** the shared client rejects redirects and foreign pagination origins, applies a 20-second request deadline, and stops when a returned rate-limit remainder is below 10. It does not automatically retry requests. Source review accepts a nonempty repository inventory, or readable billing as a fallback when requested; it does not pre-read every repository's history/settings. See [pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api), [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), and each endpoint's access requirements. Unsupported response shapes remain collection failures.

Implementation: [viewer](api/src/adapters/github/profile-client.ts), [source/repository discovery](api/src/adapters/github/repositories-client.ts), [repository settings](api/src/adapters/github/insights-client.ts), [commit aggregation](api/src/adapters/github/committers-client.ts), and [identity/collection rules](api/src/services/github.ts).

### GitHub Billing Collection

These GET requests use `https://api.github.com` and **`X-GitHub-Api-Version: 2026-03-10`**. Billing is collected only when selected; it defaults on in new UI drafts. Security snapshots are organization-only. Usage requests use `/organizations/{org}` or `/enterprises/{enterprise}`, not the `/orgs` prefix used for security billing.

| Dataset                             | Exact Path / Selection                                                  | Retained Evidence                                                                                                                                | Official Verification                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advanced Security bundle committers | `/orgs/{org}/settings/billing/advanced-security` with no product filter | Provider total, repository count, optional maximum/purchased committer counts; repository names/counts; identity login, last-push date and email | [Security active committers](https://docs.github.com/en/rest/billing/billing#get-github-advanced-security-active-committers-for-an-organization)                |
| Code Security committers            | Same route with `advanced_security_product=code_security`               | Same fields, independent product status; not added to the bundle                                                                                 | [Security product parameter](https://docs.github.com/en/rest/billing/billing#get-github-advanced-security-active-committers-for-an-organization)                |
| Secret Protection committers        | Same route with `advanced_security_product=secret_protection`           | Same fields, independent product status; identities may overlap other products                                                                   | [Security product parameter](https://docs.github.com/en/rest/billing/billing#get-github-advanced-security-active-committers-for-an-organization)                |
| Organization daily usage            | `/organizations/{org}/settings/billing/usage`                           | Date, product, SKU, unit, quantity, unit rate, gross/discount/net USD, available organization/repository names                                   | [Organization usage](https://docs.github.com/en/rest/billing/usage#get-billing-usage-report-for-an-organization)                                                |
| Enterprise daily usage              | `/enterprises/{enterprise}/settings/billing/usage`                      | Same daily fields; no cost-center selector is sent, so only unassigned-cost-center usage is requested by default                                 | [Enterprise usage](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage#get-billing-usage-report-for-an-enterprise)                            |
| Organization monthly summary        | `/organizations/{org}/settings/billing/usage/summary`                   | Validated scope and year/month; product, SKU, unit, rate, gross/discount/net quantities and amounts, model when returned                         | [Organization summary](https://docs.github.com/en/rest/billing/usage#get-billing-usage-summary-for-an-organization)                                             |
| Enterprise monthly summary          | `/enterprises/{enterprise}/settings/billing/usage/summary`              | Same aggregate fields; default summary includes all cost centers                                                                                 | [Enterprise summary](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage#get-billing-usage-summary-for-an-enterprise)                         |
| Organization premium requests       | `/organizations/{org}/settings/billing/premium_request/usage`           | Same monthly aggregate fields, including model when available; no per-user selector                                                              | [Organization premium requests](https://docs.github.com/en/rest/billing/usage#get-billing-premium-request-usage-report-for-an-organization)                     |
| Enterprise premium requests         | `/enterprises/{enterprise}/settings/billing/premium_request/usage`      | Same aggregate fields; no user, organization, model, product, or cost-center filter supplied                                                     | [Enterprise premium requests](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage#get-billing-premium-request-usage-report-for-an-enterprise) |
| Organization AI credits             | `/organizations/{org}/settings/billing/ai_credit/usage`                 | Same aggregate fields; credits are not assumed equivalent to request counts                                                                      | [Organization AI credits](https://docs.github.com/en/rest/billing/usage#get-billing-ai-credit-usage-report-for-an-organization)                                 |
| Enterprise AI credits               | `/enterprises/{enterprise}/settings/billing/ai_credit/usage`            | Same aggregate fields, independent dataset; no extra filters supplied                                                                            | [Enterprise AI credits](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage#get-billing-ai-credit-usage-report-for-an-enterprise)             |

**Periods and limits:** security requests use `per_page=100`, page/Link pagination, at most 100 pages and 100,000 total identity rows; totals must remain consistent across pages. Returned repository and distinct-login counts are checked against provider counts. Each usage endpoint is called once per calendar month intersecting the activity window, with `year`/`month` parameters. Only daily rows are clipped to the UTC date window; summaries, premium requests and AI credits keep full months/current month to date. Responses have a 16 MiB bound and 100,000-row schema cap. Unexpected next-page links on usage responses are rejected, not followed as if a partial aggregate were complete.

**Access and interpretation:** organization usage documentation requires appropriate organization administration; enterprise usage supports the roles and token permissions described on its endpoint pages. Billing-platform/product availability also matters. Security billing deduplicates distinct logins within an organization, not across selected organizations and their parent enterprise. No enterprise security-seat endpoint is called. Empty, denied, inconsistent, or unsupported responses remain marked; do not add overlapping product views or usage breakdowns together. The current GitHub billing errors group denied/unsupported/truncated causes, while Azure billing includes more specific safe HTTP/schema/timeout reasons.

Implementation: [GitHub billing collector](api/src/adapters/github/billing-client.ts) and [billing presentation schema/tables](packages/contracts/src/github-billing.ts).

### Local Calculations

These values are calculated from the collected evidence or explicit scenario inputs, not fetched from a separate provider API. Official links describe the underlying data/prices; **the formulas, matching rules, and recommendations are application behavior**, not provider-certified results.

| Output                                                    | How It Is Produced                                                                                                                                                                                                                                                                                                                         | Verification                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporting window and charts                               | Starts at UTC midnight `days - 1` before today and ends at collection time. Daily counts are summed into Monday-based weeks or calendar months. Only repositories with complete coverage of the requested window contribute. Azure uses committer dates and includes automation; GitHub uses author dates and excludes the two named bots. | [Window/chart implementation](packages/contracts/src/insights.ts); the two commit endpoint references above define source dates                                                                                                       |
| Coverage, repository states, identities and source totals | Derived from returned rows, source outcomes and dataset checks; repository display deduplication uses provider/source/repository keys. Identity summaries and overlapping source activity are not a global people/license census.                                                                                                          | [Provider summaries](api/src/reports/provider-summary.ts), [provider-scoped reports](packages/contracts/src/provider-report.ts), and the collection references above                                                                  |
| Azure billing identity reconciliation                     | Groups by tenant, subscription, product and UTC billing date. Only complete, nonduplicated organization snapshots with consistent unique CUIDs produce a selected-scope distinct count. No unmatched diagnostic row increases it.                                                                                                          | [Reconciliation](packages/contracts/src/azure-billing.ts); [official CUID definition](https://learn.microsoft.com/en-us/rest/api/azure/devops/advancedsecurity/org-meter-usage-estimate/get?view=azure-devops-rest-7.2)               |
| Azure security enablement scenarios                       | Provider count for each organization/product multiplied by its configured monthly rate; annualized means 12 unchanged months. Current combined reports retain provider-count estimates even when names are incomplete. Legacy identity-row cost estimates are a different basis, not interchangeable totals.                               | [Scenario tables](packages/contracts/src/azure-billing.ts), [legacy and GitHub estimates](api/src/reports/billing-estimates.ts), [Microsoft pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/) |
| GitHub observed-user scenarios                            | Observed deduplicated activity identities multiplied by stored Enterprise, Code Security, or Secret Protection rates. Does not verify actual member seats, private/internal enabled scope, billable pushes, or contract eligibility.                                                                                                       | [Estimate implementation](api/src/reports/billing-estimates.ts), [GitHub pricing](https://github.com/pricing), [security plans](https://github.com/security/plans)                                                                    |
| Reported usage subtotals                                  | For each source/scope/month, prefers one complete usage summary; otherwise uses one readable daily dataset. Groups gross/discount/net amounts by product and unit, leaving premium/AI breakdowns separate. Ambiguous or empty evidence does not become an inferred total.                                                                  | [Subtotal implementation](packages/contracts/src/report-overview.ts), [GitHub usage](https://docs.github.com/en/rest/billing/usage), [enterprise usage](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage)        |
| Recommendations and AI review brief                       | Local rules summarize source gaps, unknown/disabled settings, zero observed activity in complete windows, and financial evidence. P1/P2 indicate suggested review order, not severity. The brief is text for manual review; no model/API call occurs.                                                                                      | [Rule implementation](packages/contracts/src/cio-brief.ts); no official provider recommendation API or certification is claimed                                                                                                       |
| Exports                                                   | CSV, PDF and standalone HTML render the collected provider data and shared tables locally. They do not perform additional provider collection or recover missing evidence.                                                                                                                                                                 | [Export implementation](api/src/exports), [shared contracts](packages/contracts/src)                                                                                                                                                  |

Stored USD price assumptions were dated **2026-09-24** in the implementation; they are not fetched live. Validate current terms before use. Security models use Code Security **$30** and Secret Protection **$19** per committer/month; GitHub Enterprise's observed-user scenario uses **$21** per user/month. These are separate scenarios, not an additive quote.

The following Azure DevOps quantities are all **user-entered**. Formulas are shared by setup, dashboard and exports in [service pricing](packages/contracts/src/azure-service-pricing.ts); the official verification source for every row is [Microsoft's Azure DevOps rate card](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/).

| Scenario Input                                | Stored Monthly USD Calculation                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Basic eligible users and allocated free seats | `max(0, users - free seats) x $6`; allocated free seats range 0-5                                                         |
| Paid Basic + Test Plans users                 | `users x $52`; Basic is already included                                                                                  |
| Paid Microsoft-hosted parallel jobs           | `jobs x $40`; account for the free grant/first-paid-job replacement before entering capacity                              |
| Paid self-hosted parallel jobs                | `jobs x $15`; account for included benefits first                                                                         |
| GitHub-hosted macOS Standard minutes          | `minutes x $0.062`                                                                                                        |
| GitHub-hosted macOS XL minutes                | `minutes x $0.102`                                                                                                        |
| Artifacts storage GiB                         | First 2 free; next 8 at $2, next 90 at $1, next 900 at $0.50, remaining GiB at $0.25; assumes constant full-month storage |
| Billable GitHub AI credits for Azure DevOps   | `credits x $0.01` after applicable benefits, not a cost-per-request prediction                                            |

### Not Collected

The app does not collect source files, patches, retained commit messages, scan findings or secret values, scan execution history, remediation times, branch-policy coverage, repository ownership/criticality, a tenant/member directory, Basic/Test Plans seat entitlements, actual Azure Pipelines/Artifacts utilization, Azure invoices, payment/tax data, or contract prices/discount agreements. GitHub usage rows can include billed product/SKU amounts but are not a complete utilization or entitlement inventory. No Microsoft Graph, ARM/Cost Management, alert, pull-request, workflow-run, or source-content endpoint is used by these report collectors.

Raw provider JSON can contain more fields than the application retains. For example, commit-list responses may contain messages or email addresses, but activity normalization discards them. Billing-specific email/identity evidence is deliberately retained as described above. CLI-internal authentication traffic and GitHub CLI's credential storage are separate from report collection.

### Verify a Result

1. Identify the provider, source, dataset, date/window, and complete/partial/unavailable status. For billing and estimates, inspect the recorded source URL, API version, collection time, provider count and warnings.
2. Match that dataset to the operation and retained fields above. Check the linked official reference's scope, permissions, pagination and period semantics; use the same account and scope for any authorized comparison.
3. Separate raw provider evidence from local transformations: chart dates, identity matching, selected-scope reconciliation, subtotal selection, and modeled prices can change the meaning of a number. Do not compare an author-date activity count with a push-based billing meter as if they were the same measurement.
4. Reproduce only authorized read requests or compare with an owner-approved export. Never paste tokens, private responses, or customer identity data into an issue. A missing row or unverified endpoint is a coverage gap, not evidence of zero use or a reason to widen privileges.

## Contributing

See the [contribution guide](CONTRIBUTING.md) and [maintenance guidance](#maintenance) below. Source development and non-Windows runs have different prerequisites and sign-in support from the Windows package.

## Maintenance

### Development and Architecture

Use Node.js **24.19.0** and npm **11.17.0**. Source runs and macOS/Linux packages need installed GitHub CLI and Azure CLI tools available on `PATH`; Windows x64 packages include verified private copies. The explicit SDK device-code option requires publisher configuration.

```powershell
npm ci
npm run dev
npm run ci
```

The React/Vite UI lives in [app](app), the loopback Node/TypeScript API, authentication and exports in [api](api), and shared Zod schemas and calculations in [packages/contracts](packages/contracts). The Astro [demo](demo) reuses the production dashboard with deterministic fictional reports. Provider tokens remain API-side; reports remain in memory and exports require an explicit user action.

`npm run ci` checks formatting, lint, types, unit/integration tests, executable packaging, and packaged smoke tests. The prebuild cleanup removes disposable `build/`, `release/`, workspace `dist/`, and demo `.astro/` output before each build, so stale generated files cannot enter a fresh package. Close candidate executables before rebuilding; never commit credentials, personal configuration, customer reports, or environment files. Branch and pull-request requirements are in the [contribution guide](CONTRIBUTING.md).

### Publisher Authentication Configuration

The [publisher manifest](infra/publisher/public-client.json) defines generic registration requirements for the explicit Azure Identity device-code option: organizational accounts, a multitenant public client, mobile/desktop loopback redirect `http://localhost:8400`, public-client flows, and delegated Azure DevOps access. No client secret, certificate, application permission, or Azure RBAC assignment is required. Use Microsoft's [public-client registration guidance](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration) and [Azure DevOps Entra authentication guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra?view=azure-devops). Do not weaken tenant consent, MFA, or Conditional Access.

Set the public application ID in the repository Actions variable `DEVELOPER_USAGE_INSIGHTS_CLIENT_ID`, or the environment for a local build. Keep actual tenant identifiers and ownership records outside Git. The ID is public configuration, not a secret. Release CI requires it for the explicit SDK option; default bundled CLI sign-in does not use this publisher ID. Publisher verification is a separate maintainer decision; the current publisher is unverified.

```powershell
$env:DEVELOPER_USAGE_INSIGHTS_CLIENT_ID = '<public-application-id>'
npm run build:exe
.\release\developer-usage-insights.exe --skip-update-check
```

Default CLI sign-in uses an isolated temporary `AZURE_CONFIG_DIR`, `AZURE_CORE_ENABLE_BROKER_ON_WINDOWS=false`, and `AZURE_CORE_LOGIN_EXPERIENCE_V2=off`. These affect only the child session, not global CLI settings. The CLI requests browser account selection, with no supplied username/password or forced device flow; browser-launch fallback belongs to the CLI, not an automatic SDK retry. Interactive login is visible, background version/token requests are hidden, and sign-in has a ten-minute deadline and cancellation. Multi-tenant operators can set `DEVELOPER_USAGE_INSIGHTS_TENANT_ID` before launch. Tokens and renewal use the selected tenant and CLI expiry. See [interactive CLI authentication](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively) and [CLI-issued Azure DevOps tokens](https://learn.microsoft.com/en-us/azure/devops/cli/entra-tokens?view=azure-devops).

### Runtime Packaging and Integrity

- [config/github-cli.json](config/github-cli.json) pins the official Windows x64 GitHub CLI archive and SHA-256. [scripts/bundle-github-cli.mjs](scripts/bundle-github-cli.mjs) verifies the bounded HTTPS download and extracts only the executable and license. Assets and provenance are embedded in the Node single executable. The runtime resolver verifies its exact per-user cache path, restores corrupt entries from verified bytes or fails closed, and never falls back to PATH in the Windows package. Credential storage remains separate.
- [config/azure-cli.json](config/azure-cli.json) pins Azure CLI **2.90.0** and its upstream ZIP hash. Microsoft's [portable Windows ZIP distribution](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-windows?pivots=zip) is preview. Packaging bounds archive entries/expanded size and rejects unsafe, duplicate, or linked paths before reducing a separate build-owned copy. No global installation or elevation is performed.
- [scripts/reduce-azure-cli.mjs](scripts/reduce-azure-cli.mjs) retains `profile`, `resource`, and `util` command modules; Azure CLI/common/core/profiles and management core/resource/subscription/managementgroups/imagebuilder/monitor SDK families; and unchanged Python, shared third-party dependencies, certificates, and detected legal notices outside those filters. `resource` is required by account loading and `util` by version checks. This is not a general-purpose Azure CLI distribution. The policy is version-pinned; review it on upgrades.
- The reduced ZIP has sorted entries and fixed timestamps. Its manifest inventories retained files and records the reduced hash separately from the upstream archive hash; the companion SPDX inventory records the derived relationship. Never describe the modified payload as the unchanged Microsoft archive. Companion inventories identify distributions and hashes, not a complete upstream dependency-license determination.
- Runtime preparation occurs after update handoff and before the browser opens. Windows PowerShell extracts to staging and publishes atomically with bounded cancelable retries for file locks. A competing cache is usable only after full verification. Every runtime file is hashed at startup; extra files/links are rejected. Preparation has a ten-minute deadline and a shared in-process promise. Failure leaves GitHub usable and Microsoft unavailable until restart. Help/source runs do not prepare the runtime.
- The verified path is reused for the process lifetime: subsequent sign-in and token requests do not re-extract or re-hash files. Post-start cache mutation is detected only on the next launch. Python runs by exact path in isolated mode with bytecode writes disabled. To recover corrupt runtime files, close the app and remove only the affected versioned tool-cache directory before restarting.
- CLI telemetry and dynamic extensions are disabled. Cancellation terminates the owned process and normal cleanup removes its temporary credentials. Forced termination can leave credential files; browser cookies and Windows accounts are not cleared. Never log tokens, identity details, authentication headers, or capability URLs.

Review upstream releases and archive digests before updating either CLI pin. Rebuild and rerun the checks below; do not select an unpinned CLI at runtime. Preserve legal notices and publish all companion inventories.

### Validation and Security Invariants

Use synthetic identities and mocked providers for automated tests. `npm run ci` includes packaged fresh-user/empty-PATH CLI checks, upgrade handoff, and readiness-before-URL assertions. [scripts/test-azure-cli-runtime.py](scripts/test-azure-cli-runtime.py) runs under the reduced embedded Python, blocks network/browser activity, mocks MSAL, and checks TLS certificates, browser templates, account selection, subscription models/clients, tenant token requests, and cancellation. Loader errors fail packaging even when CLI help exits zero.

The native console-parent assertion requires an interactive terminal; headless runners report it unavailable rather than claiming account-picker validation. Verify desktop behavior separately. The maintainer reported live Microsoft sign-in success for the reduced candidate on 2026-09-25; this is not automated verification of every tenant's policies, cross-tenant discovery, or renewal. Billing tests do not certify customer invoices, entitlement inventories, or clean-machine compatibility.

- Preserve loopback binding, exact Host validation, per-launch capability checks on every API route, and exact Origin checks for mutations. No-browser test output contains a credential-bearing session URL and must remain private.
- Keep provider identifiers validated, destinations trusted, reads bounded, and missing/denied/capped data explicit. Retain provider counts separately from incomplete identity rows and preserve dates, coverage, source URLs, API versions, and pricing assumptions.
- Keep provider and billing scopes separate. Shared service-scenario calculations in [packages/contracts/src/azure-service-pricing.ts](packages/contracts/src/azure-service-pricing.ts) must distinguish missing values from zero, allocate Basic free seats explicitly, include Basic within Test Plans, use paid pipeline capacity, and apply Artifacts tiers. Never infer these quantities from Git activity or invent cross-organization totals.
- Preserve CSV formula-injection protection and HTML escaping. Do not export raw provider error bodies or credentials. Keep comments explaining security and compatibility invariants.
- Shutdown handles interrupt, termination, console-close, and Windows break signals, cancels sign-in, closes active connections, and removes listeners without duplicate shutdown work. Integration tests do not establish native window-close behavior on every workstation.

### Release Procedure

1. Commit to `dev`, push, and require build and CodeQL success for that exact commit. Do not move existing tags.
2. Download the Windows artifact and application SBOM from that CI run. Verify the executable checksum and run `npm run test:exe` against those downloaded files, not a replacement local build.
3. Create a draft prerelease targeting the tested commit. Before publication, upload the executable, `SHA256SUMS.txt`, application SBOM, GitHub CLI SBOM, Azure CLI SBOM, and `THIRD-PARTY-NOTICES.txt`. Verify assets so update clients never see an incomplete release.
4. Publish and verify normal online startup recognizes the new version and the release-demo workflow succeeds.
5. Confirm the synthetic samples attachment, live Pages site, exact tag, and clean synchronized worktree.

Keep the executable below the updater's **256 MiB** limit. SEA injection changes the binary; production signing/timestamping must occur afterward, followed by regenerated checksums. Current betas are unsigned. Updates trust release publishers; checksums are not publisher authentication.

The updater selects published releases, including betas, by publication time. It verifies downloads/cached executables, preserves original arguments, and uses a hash handoff to avoid loops without overwriting the original. The launcher must stay attached to the upgraded child's console, wait for its exit, and report failures; do not detach, hide, or unref it. Source/non-Windows runs do not automatically update. Use `--skip-update-check` for candidate testing or deliberate rollback so a candidate cannot hand off to a different published build.

### Demo Maintenance

```powershell
npm run demo:build
npx playwright install chromium
npm run demo:test
npm run demo:dev -- --port 4359
```

`DEMO_BROWSER_CHANNEL=msedge` selects installed Edge; `DEMO_BASE_PATH` and `DEMO_SITE_URL` override the default Pages location. Tests verify deterministic regeneration, CSV/HTML/PDF exports, desktop/mobile navigation, downloads, partial/empty reports, and absence of provider/API requests. Never put customer data in `demo/public/`.

The [release demo workflow](.github/workflows/release-demo.yml) checks out the published tag, builds/tests the demo, attaches synthetic samples, and deploys only `demo/dist`. The `github-pages` environment must allow authorized version tags; do not bypass deployment protections. Keep Actions references pinned to commit SHAs.

## License

MIT; see [LICENSE](LICENSE). Bundled tools and dependencies retain their own licenses and notices. Each Windows release includes `THIRD-PARTY-NOTICES.txt` and application, GitHub CLI, and Azure CLI SBOM inventories. Product names identify the services discussed and do not imply affiliation or trademark rights.
