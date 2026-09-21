# Build report

## Summary

This is a from-scratch build of the Active Committer Portal monorepo
(`app/`, `api/`, `packages/contracts`, `infra/`, `docs/`, `.github/workflows`).
The repository had no prior commits. This report reflects the state after
the first implementation pass.

## Files created (by area)

- **Docs**: IMPLEMENTATION_PLAN, ASSUMPTIONS, ARCHITECTURE (with Mermaid),
  SECURITY, PRIVACY, CONSENT, DATA_MODEL, API, TROUBLESHOOTING, RUNBOOK,
  THREAT_MODEL, ENTRA_SETUP, adr/0001-linked-function-app, this file.
- **Contracts**: `packages/contracts/src/index.ts` — Zod schemas/types for
  Azure DevOps/GitHub/combined committers, report requests, retention,
  provider error model.
- **API**: config module, Pino logger with redaction, bearer-token
  validation (`jose`), OBO exchange (`@azure/msal-node`), Azure DevOps
  adapter (org validation, URL construction, contract validation, bounded
  retry with jitter, error mapping), identity matching, ExcelJS workbook +
  CSV export with formula-injection guards, in-memory report store with
  ownership checks and opaque IDs, HTTP functions for health/version/me/
  connections/reports/exports.
- **App**: MSAL config/instance/token acquisition, route guard, router with
  all 16 required pages, results dashboard wired to TanStack Table/Query,
  consent explanation page with gated checkbox, accessible skip-link and
  reduced-motion CSS.
- **Infra**: vendored `static-site`, `key-vault`, `monitoring` Bicep modules
  from `pawprint/modules`; new `function-app` module (Flex Consumption,
  adapted from `pawprint/infra/portal/api.bicep`); `main.bicep` composing
  all four; dev/test/prod(.example) bicepparam files; `bicepconfig.json`
  copied from `pawprint`.
- **CI/CD**: `pull-request.yml` (install, format, lint, typecheck, unit +
  integration tests, build, Bicep validation, dependency review, CodeQL)
  and `main.yml` (same validation + SBOM + OIDC-based dev/test/prod deploy
  with manual production approval).
- **Tests**: API unit tests for org validation/URL construction, identity
  matching (including the noreply-email and display-name-only negative
  cases), formula-injection sanitization, Excel generation, logger; API
  integration tests (MSW) covering success, empty results, malformed
  response, 401/403/404, 429 with Retry-After, transient 503 exhaustion;
  frontend unit tests for the landing page and consent checkbox gating.

## Checks executed

All commands below were run in this workspace (`v:\repos\ninjapaw\committer-insights`) after `npm install`:

| Check             | Command                                                | Result                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format            | `npm run format:check`                                 | Pass (after one `npm run format` auto-fix pass)                                                                                                                                                                                                                                                        |
| Lint              | `npm run lint`                                         | Pass, 0 errors/warnings                                                                                                                                                                                                                                                                                |
| Type check        | `npm run typecheck` (contracts, app, api)              | Pass                                                                                                                                                                                                                                                                                                   |
| Unit tests        | `npm run test:unit`                                    | Pass — 37 tests (2 app, 35 api)                                                                                                                                                                                                                                                                        |
| Integration tests | `npm run test:integration`                             | Pass — 8 tests (Azure DevOps adapter: success, empty results, malformed response, 401, 403, 404, 429+Retry-After, transient 503 exhaustion)                                                                                                                                                            |
| Production build  | `npm run build` (contracts → app → api)                | Pass                                                                                                                                                                                                                                                                                                   |
| Bicep validation  | `az bicep build` on `infra/main.bicep` and each module | Pass, 0 errors (the `npm run infra:validate` bash wrapper script fails in this sandbox's bash/WSL environment due to a missing `libicu` dependency for the Bicep CLI binary invoked from bash — `az bicep build` run directly from PowerShell works correctly and was used to validate; see gap below) |
| End-to-end tests  | `npm run test:e2e`                                     | Not run — no Playwright specs are written yet in this pass (see gaps)                                                                                                                                                                                                                                  |

## Notable fixes made during validation

- `app/package.json` was missing `@fluentui/react-icons`, a required peer of
  `@fluentui/react-components`; added and installed.
- Removed a top-level `await` in `app/src/main.tsx` (unsupported by the
  configured browser targets) in favor of a `.then()` chain.
- Fixed one ESLint `no-unused-vars` warning in `api/src/functions/exports.ts`.
- Fixed `api/package.json`'s `test:integration` script glob (pointed at
  `src/**` instead of the actual `tests/integration` location).
- Fixed `infra/main.bicep` module references, which used `../modules/...`
  (resolving outside the repository) instead of `./modules/...`.
- Removed hardcoded `https://login.microsoftonline.com/...` default values
  from Bicep parameters to satisfy the vendored `no-hardcoded-env-urls`
  linter rule from `pawprint`'s `bicepconfig.json`; the value must now be
  supplied by each `.bicepparam` file (already the case for dev/test/prod).
- This sandbox's npm/disk I/O intermittently produced corrupted/partial
  package extractions (empty `@fluentui/react-icons` directory, `eslint`
  installed without its `bin`); resolved by clearing the npm cache
  (`npm cache verify`) and, in one case, manually extracting the package
  tarball via `npm pack` + `tar` directly into `node_modules` after
  `npm install` repeatedly reported "up to date" without actually writing
  the files. This is an environment quirk, not a project configuration
  issue — a normal developer machine should not need this workaround.

## Known gaps / deferred work

- **Durable retention storage**: `session`/`thirty-days` retention currently
  use the same in-memory store as `none` (with different TTLs) rather than
  encrypted durable storage (e.g. Table Storage). Needs a follow-up
  implementation before enabling `thirty-days` in production.
- **GitHub provider**: contracts, disabled UI flag, and export columns exist;
  no OAuth/GitHub App implementation (explicitly out of scope until a
  GitHub App is registered per the spec).
- **Playwright E2E suite**: `test:e2e` script and `@playwright/test`
  dependency are wired up; actual E2E specs (test-auth-mode-backed) are not
  yet written in this pass.
- **Rate limiting**: per-user/tenant/IP/organization rate limiting at the
  API layer is not yet implemented; only upstream 429 handling exists.
- **Connections list/organization membership pre-check**: `/connections`
  and `/connections/azure-devops/validate` do not yet call a live Azure
  DevOps membership-check endpoint beyond the OBO exchange succeeding.
- **Excel `addTable` sanitization**: cell values are sanitized before being
  placed in both the plain rows and the Excel table definition; a
  dedicated fixture-based snapshot test for exact cell contents is not yet
  added (only a smoke test that a non-empty workbook is produced).
- Live Azure/Entra/Azure DevOps resources do not exist in this environment;
  Bicep validation, CI deploy jobs, and consent screens cannot be verified
  end-to-end against a real tenant.
