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

Microsoft login uses Azure Identity's browser and device-code credentials, not Azure CLI. The publisher supplies a multitenant Entra public-client registration. Customers do not supply app registrations or secrets. The checked-in [publisher manifest](../infra/publisher/public-client.json) contains only generic public configuration.

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

Local unconfigured test builds are allowed, but cannot sign in to Microsoft. A successful build does not prove user consent, cross-tenant permissions, or token renewal; validate those separately before production claims.

## Bundled GitHub CLI

[config/github-cli.json](../config/github-cli.json) pins the official Windows x64 archive version, URL, and SHA-256. [The packaging helper](../scripts/bundle-github-cli.mjs) verifies the bounded HTTPS download before extracting only the executable and license. Windows PowerShell's built-in ZIP support is used at build time. Unsupported Windows architectures fail explicitly.

The executable, manifest, license, notices, and companion SPDX inventory are embedded as Node SEA assets. At runtime, the resolver verifies the binary and uses its exact path under `%LOCALAPPDATA%\CommitterInsights\tools\github-cli\<version>-<sha256>`. Corrupt cache entries are restored from verified embedded bytes or fail closed. Windows packaged calls never fall back to PATH and do not require elevation or global installation. CLI credential storage remains separate from the tool cache.

Publish `THIRD-PARTY-NOTICES.txt` and `github-cli.spdx.json` with every Windows release, alongside the application SBOM. The companion SBOM identifies the official archive and executable hashes; it does not enumerate the upstream Go dependency graph. License notices are preserved unchanged.

CLI updates are a publisher responsibility: review upstream changes, verify the new archive digest, update the pin, rebuild, and rerun tests. Never select an unpinned CLI at runtime. Packaged smoke checks use empty PATH and fresh user/config directories; Windows CI also checks extraction, cache reuse, and tamper recovery. These isolated tests do not replace customer endpoint-policy validation.

## Updates and Releases

Normal Windows launches check published releases, including betas, by publication time. Downloads and cached executables are verified before launch; original arguments are preserved. A verified child consumes a hash handoff to avoid loops. The original executable is not overwritten. Source/non-Windows runs do not update automatically.

Use `--skip-update-check` for candidate testing, offline access, or deliberate rollback. Without it, a local candidate can hand off to the latest published version. CI smoke tests explicitly bypass updates so they test the candidate.

Release procedure:

1. Commit to `dev`, push, and wait for build and CodeQL success for the exact commit. Do not move existing tags.
2. Download the Windows artifact and application SBOM from that run. Verify the executable checksum and run the packaged smoke checks against those files.
3. Create a draft prerelease targeting the tested commit. Upload the executable, `SHA256SUMS.txt`, application SBOM, GitHub CLI companion SBOM, and third-party notices before publishing. This prevents update clients seeing incomplete releases.
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

- The server binds to loopback with exact Host validation. Every API route requires a per-launch capability; mutations also require the exact Origin.
- Provider requests use validated identifiers, trusted hosts, bounded pagination/timeouts, and explicit partial-data reporting. Missing data must never silently become zero usage.
- CSV values are protected against formula injection; HTML escapes provider-supplied values.
- Never log provider tokens, authentication headers, personal identities, report content, or local capability URLs. Explicit no-browser test mode emits a capability URL and must be treated as credential-bearing output.
- Preserve comments explaining security invariants, protocol constraints, and non-obvious failure handling. Remove stale narration, not the reasons behind safeguards.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md) for contribution and private vulnerability-reporting policies.
