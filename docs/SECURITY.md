# Security model

## Authentication and authorization

- Customer sign-in: Microsoft Entra ID, work/school accounts only
  (`https://login.microsoftonline.com/organizations`), via MSAL Browser
  using authorization code + PKCE. Personal Microsoft accounts are not
  supported; the sign-in page states this explicitly.
- API authorization: every route validates the bearer token's issuer,
  audience, signature, and lifetime (`jose` + Entra JWKS) before processing
  a request. The frontend route guard (`RequireAuth`) is a UX convenience
  only.
- Azure DevOps access: the API performs an OAuth On-Behalf-Of exchange
  (`@azure/msal-node`) using a Key Vault-backed confidential client
  credential. The resulting Azure DevOps token is used server-side only and
  is never returned to the browser, logged, or persisted.
- Portal roles (`Report.Reader`, `Report.Operator`, `Connection.Admin`,
  `Report.Auditor`) gate portal features only; they never grant Azure
  DevOps access beyond what the signed-in user's own Azure DevOps
  permissions already allow.

## Transport and browser security

- `staticwebapp.config.json` sets `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy`
  with `frame-ancestors 'none'`.
- MSAL token cache uses `sessionStorage`, never `localStorage`; no tokens
  are placed in the URL after the OAuth callback completes.
- CORS is restricted to the deployed SPA origin(s) only (configured per
  environment; no wildcard origins in production).

## Data handling

- Organization names are validated against a strict allow-list
  (`AZURE_DEVOPS_ORG_PATTERN`) before being used to construct any outbound
  URL, preventing SSRF via crafted input. The Azure DevOps host is always a
  trusted constant (`config.azureDevOps.apiHost`).
- Report IDs are opaque, cryptographically random (not sequential), and
  every report read/export/delete verifies ownership (`subject` + `tenantId`)
  before returning data — see `InMemoryReportStore.get`.
- CSV/Excel export values are sanitized against formula injection
  (`api/src/exports/sanitize.ts`) per OWASP guidance.
- Structured logs (Pino) redact authorization headers, tokens, client
  secrets, and identity fields (email/UPN); identity values logged for
  diagnostics are masked (`maskIdentityValue`).

## Rate limiting and resiliency

- The Azure DevOps adapter retries only safe, transient failures
  (429/502/503) with bounded attempts and jittered backoff, respecting
  `Retry-After`. Authorization failures (401/403) are never retried.

## Secrets

- No secrets are committed. `local.settings.example.json` and `.env.example`
  contain variable names only. Production credentials are Key
  Vault-resolved via managed identity (see `docs/ENTRA_SETUP.md`).

## Mock data

- `ENABLE_MOCK_DATA` can only be `true` when
  `AZURE_FUNCTIONS_ENVIRONMENT` is not `Production` (`config.featureFlags.mockDataEnabled`).
