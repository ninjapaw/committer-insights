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

Recorded live in this session (see terminal output for exact commands);
this file is updated with pass/fail status and any missing-prerequisite
notes after running `npm install` and `npm run ci` in this workspace.

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
