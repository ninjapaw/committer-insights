# Implementation Plan — Active Committer Portal

## Scope note

This is a from-scratch build (the repository contained no prior commits). Given
the size of the full specification, this pass delivers a working, testable
foundation across every required area rather than an exhaustively complete
production system in one iteration. Deferred items are tracked explicitly in
`docs/BUILD_REPORT.md`.

## Monorepo layout

- `app/` — React + TypeScript + Vite SPA (MSAL Browser/React, Fluent UI v9,
  TanStack Query/Table, Zod).
- `api/` — Azure Functions v4 (Node.js TypeScript programming model), OBO
  token exchange, Azure DevOps adapter, ExcelJS export, Pino logging.
- `packages/contracts` — shared Zod schemas/types used by both app and api.
- `packages/eslint-config`, `packages/tsconfig` — shared lint/TS config.
- `infra/` — Bicep, vendoring the proven module patterns from
  `pawprint/modules` (`static-site`, `key-vault`, `monitoring`) plus a new
  `function-app` module for the linked API.
- `docs/` — architecture, security, privacy, consent, threat model, runbook,
  Entra setup, ADRs.
- `.github/workflows/` — PR validation and main deployment pipelines.

## Delivery order

1. Repo scaffold, root tooling (npm workspaces, TS project references,
   ESLint/Prettier, root scripts).
2. Shared contracts (Zod schemas + TS types) for Azure DevOps, GitHub,
   combined identities, report requests/errors.
3. API: auth (bearer validation + OBO), Azure DevOps adapter, identity
   matching, ExcelJS/CSV export with formula-injection guards, HTTP
   functions for the required routes, structured logging with redaction.
4. App: MSAL configuration, route guards, required pages (landing through
   not-found), results dashboard with TanStack Table, export actions.
5. Infra: vendored Bicep modules + `main.bicep` composing Static Web App,
   Function App (Flex Consumption), Key Vault, Log Analytics/App Insights,
   role assignments, diagnostic settings, dev/test/prod param files.
6. CI/CD: PR workflow (install, format, lint, typecheck, unit+integration
   tests, build, Bicep validation, CodeQL, dependency review) and main
   workflow (same + OIDC deploy to dev/test/prod with manual prod approval).
7. Docs: architecture (with Mermaid), security, privacy, consent, threat
   model (STRIDE), Entra setup, runbook, ADRs, README.
8. Tests: unit (org validation, URL construction, zod contracts, identity
   matching, formula-injection, Excel generation, log redaction) and
   integration (mocked Azure DevOps responses via MSW/nock covering the
   required status codes).
9. Git: `dev` remains the default branch for ongoing work; `main` is created
   from `dev` as the production branch protected by the main workflow.
10. Validation pass: install, lint, typecheck, unit tests, build; record
    results (including anything blocked by missing CLIs/credentials) in
    `docs/BUILD_REPORT.md`.

## Key architectural decisions

- **Auth**: MSAL Browser/React (SPA, PKCE, authorization code) → Azure
  Functions API validates the bearer JWT (issuer/audience/signature/lifetime
  via `jose` + Entra JWKS) → API performs OBO exchange via `@azure/msal-node`
  `ConfidentialClientApplication.acquireTokenOnBehalfOf` scoped to
  `499b84ac-1321-427f-aa17-267ca6975798/.default` to obtain an Azure DevOps
  delegated token server-side only.
- **Hosting**: Azure Static Web Apps (frontend) linked to a dedicated Azure
  Functions app (Flex Consumption, Node 22), because OBO token exchange needs
  outbound calls to the Azure DevOps resource and secret-backed confidential
  client credentials that are simpler to manage outside the SWA managed
  Functions runtime. See `docs/adr/0001-linked-function-app.md`.
- **Data**: no default retention (`REPORT_RETENTION_DEFAULT=none`); reports
  are processed in memory and returned directly; `session`/`thirty-days`
  retention store encrypted rows keyed by opaque report IDs.
- **GitHub**: adapter interface + contracts only; connection UI is disabled
  behind `FEATURE_GITHUB_PROVIDER=false` until GitHub App scopes are defined.

## Reused infrastructure patterns (pawprint)

Vendored (copied, adapted names/tags) from `pawprint/modules`:

- `static-site/main.bicep` → `infra/modules/static-site/main.bicep`
- `key-vault/main.bicep` → `infra/modules/key-vault/main.bicep`
- `monitoring/main.bicep` → `infra/modules/monitoring/main.bicep`
- Flex Consumption Function App pattern (from `pawprint/infra/portal/api.bicep`)
  → `infra/modules/function-app/main.bicep`, adapted for the OBO backend
  (Entra client ID/authority/audience app settings, Key Vault secret
  references, system-assigned identity + Key Vault Secrets User role).

These are copied rather than cross-repo referenced because Bicep modules are
resolved at deploy time from the local repository and `committer-insights` is
an independent repository/deployment unit from `pawprint`.
