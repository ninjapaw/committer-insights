# Maintaining Committer Insights

## Development

Use Node.js 24.19.0 and npm 11.17.0. Source runs need an installed GitHub CLI; Windows x64 executable builds include it.

```powershell
npm ci
npm run dev
npm run ci
```

The app is a React UI served by a loopback Node host. Shared report schemas and calculations live in `packages/contracts`; provider collection, authentication, and exports live in `api`. Provider tokens never enter the frontend. Reports remain in process memory and exports are explicit user actions.

`npm run ci` checks formatting, lint, types, unit/integration tests, executable packaging, and packaged smoke tests. Close running candidate executables before rebuilding. `build/` and `release/` are disposable generated directories. Keep credentials, real reports, personal configuration, and environment files out of Git.

## Microsoft Authentication

Default Microsoft login (`connectAzureDevOps`, including `/api/auth/sign-in`) starts bundled Azure CLI with the Windows account broker disabled for that child process, selecting system-browser login. The main Microsoft button and account-change action share this path; there is no duplicate CLI button. Source/non-Windows runs report that the Windows package is required instead of silently switching methods. The explicitly selected device-code action still uses Azure Identity and the publisher's multitenant Entra public-client registration. Customers do not supply registrations or secrets. The checked-in [publisher manifest](../infra/publisher/public-client.json) contains generic public configuration. No SDK fallback is attempted after CLI failure.

Publisher registration requirements:

- Organizational accounts, mobile/desktop public client, loopback redirect `http://localhost:8400`, and public-client flows enabled for device codes.
- Delegated Azure DevOps permissions required by the reporting APIs; no client secret, certificate, application permission, or Azure RBAC assignment.
- Tenant consent and Conditional Access remain authoritative. Do not weaken tenant policy to enable sign-in.
- The beta publisher is unverified. Changing publisher verification policy requires an explicit maintainer decision.

The shared [Pawprint provisioner](https://github.com/ninjapaw/pawprint/blob/186a5a544b9e3972e4b63e216b8d86f350f81138/scripts/publisher-public-client.mjs) supports offline validation, read-only planning, and explicit apply. Use that pinned revision in a sibling checkout with its dependencies installed:

```powershell
node ../pawprint/scripts/publisher-public-client.mjs validate --config infra/publisher/public-client.json
node ../pawprint/scripts/publisher-public-client.mjs plan --config infra/publisher/public-client.json --tenant <publisher-tenant-id>
node ../pawprint/scripts/publisher-public-client.mjs apply --config infra/publisher/public-client.json --tenant <publisher-tenant-id> --yes
```

Keep actual tenant identifiers and registration ownership records outside this repository. Set the public application ID in the repository Actions variable `COMMITTER_INSIGHTS_CLIENT_ID`, or in the environment for a local build. This ID is public configuration, not a secret. Windows CI rejects missing publisher configuration.

```powershell
$env:COMMITTER_INSIGHTS_CLIENT_ID = '<public-application-id>'
npm run build:exe
.\release\committer-insights.exe --skip-update-check
```

Local unconfigured Windows test builds can use the default CLI sign-in, but cannot use SDK device-code sign-in. The default CLI path does not require a publisher client ID. Release CI still requires publisher configuration for the explicit SDK option. A successful build does not prove user consent, cross-tenant permissions, or token renewal; validate those separately before production claims.

## Bundled GitHub CLI

[config/github-cli.json](../config/github-cli.json) pins the official Windows x64 archive version, URL, and SHA-256. [The packaging helper](../scripts/bundle-github-cli.mjs) verifies the bounded HTTPS download before extracting only the executable and license. Windows PowerShell's built-in ZIP support is used at build time. Unsupported Windows architectures fail explicitly.

The executable, manifest, license, notices, and companion SPDX inventory are embedded as Node SEA assets. At runtime, the resolver verifies the binary and uses its exact path under `%LOCALAPPDATA%\CommitterInsights\tools\github-cli\<version>-<sha256>`. Corrupt cache entries are restored from verified embedded bytes or fail closed. Windows packaged calls never fall back to PATH and do not require elevation or global installation. CLI credential storage remains separate from the tool cache.

Publish `THIRD-PARTY-NOTICES.txt` and `github-cli.spdx.json` with every Windows release, alongside the application SBOM. The companion SBOM identifies the official archive and executable hashes; it does not enumerate the upstream Go dependency graph. License notices are preserved unchanged.

CLI updates are a publisher responsibility: review upstream changes, verify the new archive digest, update the pin, rebuild, and rerun tests. Never select an unpinned CLI at runtime. Packaged smoke checks use empty PATH and fresh user/config directories; Windows CI also checks extraction, cache reuse, and tamper recovery. These isolated tests do not replace customer endpoint-policy validation.

## Bundled Azure CLI

Runtime preparation must finish before reporting account selection. On Windows, newly extracted runtime files can temporarily block the directory rename. Retry publication with a bounded, cancelable delay; treat a competing install as successful only when its destination exists and passes full integrity verification. Never replace verification with an existence check. Packaged smoke tests use a disposable LocalAppData directory to exercise the normal cache filesystem.

Current source prepares the Windows packaged runtime during startup, after update handoff and before opening the app. Archive checking, extraction, verification counts, publication and cleanup are printed to the console without credentials. Preparation has a ten-minute deadline. Concurrent preparation calls share one result, and a failure leaves Microsoft sign-in unavailable until restart while GitHub remains available. Help and source runs do not prepare the runtime. No sign-in is initiated during startup.

Every runtime file is hashed at startup, but the verified executable path is reused for that process lifetime: sign-in, version checks and token renewal do not extract or re-hash the runtime. This deliberately trusts the per-user cache until app exit; changes made after startup verification are not detected in that session. Restarting performs full verification again. An intact cache and successful offline verification do not establish the cause of a live preparation stall or prove successful Microsoft sign-in. Beta.16 and earlier releases still prepare on demand.

The native console-parent assertion requires an interactive Windows desktop with terminal-attached stdout. Windows runners can report `UserInteractive` even without a usable console, so that flag alone is insufficient. Headless runners report the assertion as unavailable instead of claiming account-picker validation; command visibility unit tests and packaged startup checks still run. Verify the desktop-only assertion locally before release.

Interactive `login` retains `windowsHide: false`; version checks and token requests remain hidden. The Windows packaging regression checks native console-handle availability without initiating authentication, and authentication unit tests enforce command-specific visibility. Beta.12 introduced the visible console for WAM parenting; current source builds no longer use WAM. This historical console regression does not validate browser launch or successful account selection.

CLI login selects browser authentication through `AZURE_CORE_ENABLE_BROKER_ON_WINDOWS=false`, overriding inherited broker settings only in the app-owned child environment. No global CLI config, Windows account or tenant policy is changed. Azure CLI 2.90.0's interactive flow requests `prompt=select_account`, with no `--use-device-code`, username or password arguments. User credentials remain in Microsoft's UI. `AZURE_CORE_LOGIN_EXPERIENCE_V2=off` disables only the terminal subscription selector. Any device fallback when the browser cannot open belongs to the CLI; the existing challenge parser still handles supported device messages. Sign-in retains the ten-minute deadline and cancellation; the SDK's explicit device-code option remains unchanged. Broker-specific Conditional Access requirements can reject browser authentication and must not be bypassed. See [Microsoft's interactive login guidance](https://learn.microsoft.com/cli/azure/authenticate-azure-cli-interactively).

[config/azure-cli.json](../config/azure-cli.json) pins the official Windows x64 ZIP, version 2.90.0, and the SHA-256 measured from its Microsoft-hosted HTTPS download. The portable ZIP is documented by Microsoft as preview. The build verifies the upstream pin, bounds archive entries and expanded size, and rejects unsafe/duplicate/link paths before reducing a separate build-owned copy. No global installation or PATH change is performed.

[scripts/reduce-azure-cli.mjs](../scripts/reduce-azure-cli.mjs) keeps the `profile`, `resource` and `util` command modules. The account command loader requires `resource`; `version` requires `util`. Azure SDK families are restricted to CLI/common/core/profiles and the management core/resource/subscription/managementgroups/imagebuilder/monitor families used by retained code. All Python files outside those Azure package filters, shared third-party packages, certificates, and detected license/notice trees remain unchanged. This is a conservative reduction, not a minimal or general-purpose Azure CLI distribution. The allowlist is explicitly tied to 2.90.0; version updates fail until the policy and checks are reviewed.

Build validation runs version and login/token help with isolated config, no PATH dependency and dynamic extensions disabled; command-loader errors fail even if the CLI exits successfully. [scripts/test-azure-cli-runtime.py](../scripts/test-azure-cli-runtime.py) runs under the reduced embedded Python, blocks network access and browser launches, and checks TLS certificates, browser response templates, synthetic account selection, subscription model/client loading, tenant-scoped tokens and cancellation. It mocks MSAL responses; no real sign-in is part of the build. On 2026-09-25, the maintainer reported successful live Microsoft sign-in with the reduced candidate and explicitly cleared the beta.17 publication gate. This is user-reported acceptance, not an automated result or certification of every tenant's Conditional Access, cross-tenant discovery or live renewal. Existing application tests cover token renewal and process cancellation.

The build creates a ZIP with sorted entries and fixed timestamps, inventories every retained file and embeds that reduced ZIP. The manifest and cache key use its SHA-256, not the original download hash. The companion SBOM records both the original source archive and the derived runtime hash; notices identify the reduction. Build output reports file counts, unpacked bytes and archive bytes before/after. Keep those provenance fields distinct: the reduced ZIP must never be described as the unchanged Microsoft archive.

Runtime extraction uses Windows PowerShell's built-in ZIP support, a staging directory, and atomic publication. Startup verifies every extracted runtime file and rejects extra files or links before marking the runtime ready. Corruption fails closed; close the app and remove only its affected versioned Azure CLI tool-cache directory to force verified re-extraction. Python runs by exact path in isolated mode with bytecode writes disabled. Source/non-Windows runs explicitly report that this option requires a Windows package.

CLI authentication uses a fresh temporary `AZURE_CONFIG_DIR`, not a developer's existing CLI configuration. CLI telemetry and dynamic extension installation are disabled. App cleanup does not erase browser cookies, earlier broker state or Windows accounts. Cancellation terminates the owned process; normal cleanup removes only the app-owned temporary credentials. Forced termination may leave a sensitive temporary directory, as described in the README. Tokens stay server-side; Azure DevOps token requests and renewal use the selected tenant and CLI expiry. The initial CLI login also performs its normal Azure account discovery. Multi-tenant operators can set `COMMITTER_INSIGHTS_TENANT_ID` to a tenant GUID before launching. No administrator approval bypass is provided.

Publish `azure-cli.spdx.json` alongside the application and GitHub CLI inventories and `THIRD-PARTY-NOTICES.txt`. This companion inventory identifies the distribution and hash; it is not a complete dependency-license determination. Keep executable size below the existing updater's 256 MiB limit. Packaged smoke checks verify a protected, read-only `/api/auth/azure-cli/info` version request with an empty PATH and fresh configuration, without initiating authentication.

References: [Windows ZIP installation](https://learn.microsoft.com/cli/azure/install-azure-cli-windows?pivots=zip) and [CLI-issued Azure DevOps tokens](https://learn.microsoft.com/azure/devops/cli/entra-tokens).

## Updates and Releases

Normal Windows launches check published releases, including betas, by publication time. Downloads and cached executables are verified before launch; original arguments are preserved. A verified child consumes a hash handoff to avoid loops. The original executable is not overwritten. Source/non-Windows runs do not update automatically.

The launcher must remain attached to the upgraded child's inherited console and wait for its exit. A successful process spawn is not successful application startup. Do not detach, hide or unref this child: doing so lets the original launcher exit before the upgraded app is usable and loses later failure reporting. The packaged bundle regression launches a relocated executable, verifies its protected local session while the handoff remains pending, and checks abnormal-exit propagation. Beta.11 includes this fix; existing older downloads still need a manual launch of the latest verified executable to bypass their old handoff.

Local-server shutdown handles interrupt, termination, console-close and Windows break signals. It cancels both sign-in flows, closes active HTTP connections rather than waiting indefinitely for requests, and removes its signal listeners. Repeated signals must not initiate duplicate shutdowns. Integration tests exercise stalled connections without signing in; they do not establish native window-close behavior on an affected workstation.

Use `--skip-update-check` for candidate testing, offline access, or deliberate rollback. Without it, a local candidate can hand off to the latest published version. CI smoke tests explicitly bypass updates so they test the candidate.

Release procedure:

1. Commit to `dev`, push, and wait for build and CodeQL success for the exact commit. Do not move existing tags.
2. Download the Windows artifact and application SBOM from that run. Verify the executable checksum and run the packaged smoke checks against those files.
3. Create a draft prerelease targeting the tested commit. Upload the executable, `SHA256SUMS.txt`, application SBOM, GitHub CLI and Azure CLI companion SBOMs, and third-party notices before publishing. This prevents update clients seeing incomplete releases.
4. Publish, then verify normal online startup recognizes the new version and the release-demo workflow succeeds.
5. Confirm the synthetic samples attachment, Pages site, tag, and clean synchronized worktree.

SEA injection modifies the executable; production signing and timestamping must happen afterward, with checksums regenerated for the signed file. Current beta artifacts are unsigned and evaluation-only. Checksums verify integrity, not publisher identity. Auto-update trusts this repository's release publishers.

## Static Demo

The Astro demo reuses the production dashboard with deterministic fictional reports. Generation takes no provider credentials or customer input. Never put customer data in `demo/public/`, which is publicly deployed.

```powershell
npm run demo:build
npx playwright install chromium
npm run demo:test
npm run demo:dev -- --port 4359
```

`DEMO_BROWSER_CHANNEL=msedge` selects installed Edge for local testing. `DEMO_BASE_PATH` and `DEMO_SITE_URL` override the default repository Pages location. Demo tests check regeneration hashes, export formats, desktop/mobile navigation, downloads, and absence of provider/API requests.

The release workflow checks out the published tag, builds/tests the demo, attaches synthetic samples, and deploys only `demo/dist`. The `github-pages` environment must allow versioned release tags; existing `v*.*.*` tag authorization supports this. Do not bypass other deployment protections. Actions remain pinned to commit SHAs.

## Security Boundaries

### Service Pricing Scenarios

`azure-service-pricing.ts` in the shared contracts package owns the validated inputs, dated USD rates and calculations for other Azure DevOps services. `serviceScenario` is per organization in the report request; `azureServiceEstimates` preserves the inputs in report insights. The setup preview, results and CSV/HTML/PDF exports use the same tables. Keep these scenarios separate from provider observations and exclude them from GitHub provider views.

Missing quantities stay unavailable; explicit zero is valid. Basic has a separately allocated free-seat allowance, Test Plans already includes Basic, pipeline inputs represent paid parallel jobs, and Artifacts applies progressive GiB bands after the free 2 GiB. Do not infer seats, paid capacity, storage or AI credits from Git activity. Do not introduce cross-organization totals without verified license and allowance scope. Price changes require updating the source date, assumptions and tier-boundary tests together.

### Acceptance Notes (2026-09-24)

- Run `npm run ci` for formatting, lint, typechecks, all 286 current automated tests, executable packaging, the Windows console-parent and upgrade-handoff regressions and isolated bundled-CLI smoke checks. Packaged startup checks require Microsoft runtime readiness before the app URL, including after upgrade handoff. The Windows build also runs the reduced-Python offline authentication check.
- Run `npm run demo:test` for deterministic synthetic CSV/HTML/PDF generation, desktop/mobile results, downloads, partial/empty reports and network isolation. Fixture version 5 includes other-service what-if calculations.
- Account selection is configured through the pinned CLI's browser flow; automated tests do not approve a real account or establish customer Conditional Access compatibility. App cache cleanup does not remove browser cookies or earlier Windows broker credentials.
- Billing tests use synthetic responses. No invoice reconciliation, tenant-wide entitlement inventory or future-charge guarantee is implied. The additional service quantities are manual planning inputs, not collected usage.
- Build artifacts stay ignored. Beta.10 packages this work through the explicit release procedure above; preserve beta.9 notes as historical behavior. A source commit/push alone is not a release.

### Provider Evidence

Azure enablement scenarios retain `uniqueCommitterCount` independently of returned names through the estimate adapter's optional structured callback. Legacy identity-only callers remain strict; incomplete names do not become a complete zero-count result. Report collection queries each selected product independently, preserving partial successes. Preflight permits any readable selected-product estimate, including count-only responses. The comparison remains available when billing collection is disabled or denied, but never interprets that as zero charges. Standalone-product list prices are shared in contracts; scenario amounts are per organization/product and must not be merged with billed usage or across subscriptions. `azureEstimates` and its provenance are included only in the Azure provider section and all exports. Dates, incomplete coverage, mismatches and legacy-bundle uncertainty must remain visible.

GitHub billing uses read-only REST API version `2026-03-10` independently of the existing activity API version. Organization security snapshots paginate `/orgs/{org}/settings/billing/advanced-security`, separately for bundle, Code Security and Secret Protection. Counts are retained when detail is incomplete; repository counts and distinct logins are checked without summing overlapping scopes/products. No documented enterprise security endpoint is assumed. Usage detail, all-cost-center usage summaries, premium requests and AI credits are separate monthly datasets; only daily rows are clipped to the activity window. The full month for an aggregate is intentional and must stay visible in exports. Tokens and API error bodies must not be exported. Billing-only access does not imply readable repository activity or zero estimated cost. The tests use synthetic responses; live customer billing reconciliation is a separate acceptance check.

References: [security billing](https://docs.github.com/en/rest/billing/billing), [organization usage](https://docs.github.com/en/rest/billing/usage), and [enterprise usage](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage). Preview/schema/access differences must be surfaced as unavailable or partial, never silently converted to zeros.

- The server binds to loopback with exact Host validation. Every API route requires a per-launch capability; mutations also require the exact Origin.
- Provider requests use validated identifiers, trusted hosts, bounded pagination/timeouts, and explicit partial-data reporting. Missing data must never silently become zero usage.
- CSV values are protected against formula injection; HTML escapes provider-supplied values.
- Never log provider tokens, authentication headers, personal identities, report content, or local capability URLs. Explicit no-browser test mode emits a capability URL and must be treated as credential-bearing output.
- Preserve comments explaining security invariants, protocol constraints, and non-obvious failure handling. Remove stale narration, not the reasons behind safeguards.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md) for contribution and private vulnerability-reporting policies.
