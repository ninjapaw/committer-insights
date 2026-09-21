# Assumptions

- No existing Entra app registration, Azure DevOps organization, or GitHub
  App exists yet for this product; all setup steps are documented in
  `docs/ENTRA_SETUP.md` and must be performed manually by an operator with
  tenant admin or app-registration rights.
- No live Azure subscription/resource group has been provisioned for this
  product. `infra/main.dev.bicepparam` uses placeholder names following the
  `ninjapaws-cloud-security-dojo`/`pawprint` naming convention
  (`np-<app>-<env>-<region>`); an operator must confirm final names before
  deployment.
- The Azure DevOps Advanced Security "meter usage estimate" API
  (`/_apis/management/meterUsageEstimate/default`, `api-version=7.2-preview.3`)
  is a **preview** API. Its shape may change; the adapter isolates the API
  version in one config module and surfaces a preview warning to the UI/export
  per the spec.
- `vso.advsec` availability through delegated Entra permissions for the
  `499b84ac-1321-427f-aa17-267ca6975798` (Azure DevOps) resource is
  tenant/API-dependent and cannot be verified without a live tenant. The
  adapter and docs fail safely and surface an administrator-troubleshooting
  message (`docs/ENTRA_SETUP.md`, "vso.advsec availability" section) rather
  than silently requesting broader scopes.
- CI cannot perform real OAuth login; a dedicated `VITE_TEST_AUTH_MODE`
  (disabled by default, blocked from production builds) backs Playwright/RTL
  tests with a fake MSAL identity.
- No GitHub App is registered yet, so the GitHub provider ships as contracts
  - a feature-flagged, disabled UI + sanitized fixtures only, per the spec.
- Because this sandbox has no live Azure DevOps org/API credentials, all
  adapter/integration tests run against recorded/sanitized fixtures (MSW),
  never real network calls.
- `gh` CLI is available and authenticated in this environment, used to
  create the `main` branch from `dev` and to keep `dev` configured as the
  repository default branch for ongoing development.
- Given the scale of the full specification, this iteration prioritizes a
  complete, coherent, testable vertical slice (auth, Azure DevOps adapter,
  identity matching, export, core pages, infra, CI) over exhaustively
  implementing every enumerated test case; gaps are tracked in
  `docs/BUILD_REPORT.md` rather than silently omitted.
