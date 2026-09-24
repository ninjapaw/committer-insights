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

Default Microsoft login uses Azure Identity's browser and device-code credentials. The publisher supplies a multitenant Entra public-client registration. Customers do not supply app registrations or secrets. The checked-in [publisher manifest](../infra/publisher/public-client.json) contains only generic public configuration. A separately selected bundled Azure CLI flow is available in Windows packages; it never replaces failed SDK authentication automatically.

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

Local unconfigured test builds are allowed, but cannot use SDK Microsoft sign-in. The explicit Azure CLI option does not require that publisher client ID. A successful build does not prove user consent, cross-tenant permissions, or token renewal; validate those separately before production claims.

## Bundled GitHub CLI

[config/github-cli.json](../config/github-cli.json) pins the official Windows x64 archive version, URL, and SHA-256. [The packaging helper](../scripts/bundle-github-cli.mjs) verifies the bounded HTTPS download before extracting only the executable and license. Windows PowerShell's built-in ZIP support is used at build time. Unsupported Windows architectures fail explicitly.

The executable, manifest, license, notices, and companion SPDX inventory are embedded as Node SEA assets. At runtime, the resolver verifies the binary and uses its exact path under `%LOCALAPPDATA%\CommitterInsights\tools\github-cli\<version>-<sha256>`. Corrupt cache entries are restored from verified embedded bytes or fail closed. Windows packaged calls never fall back to PATH and do not require elevation or global installation. CLI credential storage remains separate from the tool cache.

Publish `THIRD-PARTY-NOTICES.txt` and `github-cli.spdx.json` with every Windows release, alongside the application SBOM. The companion SBOM identifies the official archive and executable hashes; it does not enumerate the upstream Go dependency graph. License notices are preserved unchanged.

CLI updates are a publisher responsibility: review upstream changes, verify the new archive digest, update the pin, rebuild, and rerun tests. Never select an unpinned CLI at runtime. Packaged smoke checks use empty PATH and fresh user/config directories; Windows CI also checks extraction, cache reuse, and tamper recovery. These isolated tests do not replace customer endpoint-policy validation.

## Bundled Azure CLI

[config/azure-cli.json](../config/azure-cli.json) pins the official Windows x64 ZIP, version 2.90.0, and the SHA-256 measured from its Microsoft-hosted HTTPS download. The portable ZIP is documented by Microsoft as preview. Preserve the entire distribution, including Python and all dependency licenses. The build verifies the pin, bounds archive entries and expanded size, rejects unsafe/duplicate/link paths, inventories every runtime file, and checks the CLI version. No global installation or PATH change is performed.

Runtime extraction uses Windows PowerShell's built-in ZIP support, a staging directory, and atomic publication. Each CLI process launch verifies every extracted runtime file and rejects extra files or links. Corruption fails closed; close the app and remove only its affected versioned Azure CLI tool-cache directory to force verified re-extraction. Python runs by exact path in isolated mode with bytecode writes disabled. Source/non-Windows runs explicitly report that this option requires a Windows package.

CLI authentication uses a fresh temporary `AZURE_CONFIG_DIR`, not a developer's existing cache. CLI telemetry, dynamic extension installation, and broker authentication are disabled. Cancellation terminates the owned process; normal cleanup removes the temporary credentials. Forced termination may leave a sensitive temporary directory, as described in the README. Tokens stay server-side, are requested only for Azure DevOps, and are renewed using the selected tenant and the CLI's returned expiry. Multi-tenant operators can set `COMMITTER_INSIGHTS_TENANT_ID` to a tenant GUID before launching. No administrator approval bypass is provided.

Publish `azure-cli.spdx.json` alongside the application and GitHub CLI inventories and `THIRD-PARTY-NOTICES.txt`. This companion inventory identifies the distribution and hash; it is not a complete dependency-license determination. Keep executable size below the existing updater's 256 MiB limit. Packaged smoke checks verify a protected, read-only `/api/auth/azure-cli/info` version request with an empty PATH and fresh configuration, without initiating authentication.

References: [Windows ZIP installation](https://learn.microsoft.com/cli/azure/install-azure-cli-windows?pivots=zip) and [CLI-issued Azure DevOps tokens](https://learn.microsoft.com/azure/devops/cli/entra-tokens).

## Updates and Releases

Normal Windows launches check published releases, including betas, by publication time. Downloads and cached executables are verified before launch; original arguments are preserved. A verified child consumes a hash handoff to avoid loops. The original executable is not overwritten. Source/non-Windows runs do not update automatically.

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

GitHub billing uses read-only REST API version `2026-03-10` independently of the existing activity API version. Organization security snapshots paginate `/orgs/{org}/settings/billing/advanced-security`, separately for bundle, Code Security and Secret Protection. Counts are retained when detail is incomplete; repository counts and distinct logins are checked without summing overlapping scopes/products. No documented enterprise security endpoint is assumed. Usage detail, all-cost-center usage summaries, premium requests and AI credits are separate monthly datasets; only daily rows are clipped to the activity window. The full month for an aggregate is intentional and must stay visible in exports. Tokens and API error bodies must not be exported. Billing-only access does not imply readable repository activity or zero estimated cost. The tests use synthetic responses; live customer billing reconciliation is a separate acceptance check.

References: [security billing](https://docs.github.com/en/rest/billing/billing), [organization usage](https://docs.github.com/en/rest/billing/usage), and [enterprise usage](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/usage). Preview/schema/access differences must be surfaced as unavailable or partial, never silently converted to zeros.

- The server binds to loopback with exact Host validation. Every API route requires a per-launch capability; mutations also require the exact Origin.
- Provider requests use validated identifiers, trusted hosts, bounded pagination/timeouts, and explicit partial-data reporting. Missing data must never silently become zero usage.
- CSV values are protected against formula injection; HTML escapes provider-supplied values.
- Never log provider tokens, authentication headers, personal identities, report content, or local capability URLs. Explicit no-browser test mode emits a capability URL and must be treated as credential-bearing output.
- Preserve comments explaining security invariants, protocol constraints, and non-obvious failure handling. Remove stale narration, not the reasons behind safeguards.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md) for contribution and private vulnerability-reporting policies.
