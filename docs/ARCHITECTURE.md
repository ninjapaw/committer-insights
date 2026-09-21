# Architecture

## System context

```mermaid
flowchart LR
  customer[Customer\nwork/school account] -->|HTTPS| spa[React SPA\nAzure Static Web Apps]
  spa -->|Bearer token\nMSAL PKCE| api[Azure Functions API\nlinked backend]
  api -->|OBO exchange| entra[Microsoft Entra ID]
  api -->|Delegated token| ado[Azure DevOps\nAdvanced Security estimate API]
  api -->|Secrets| kv[Key Vault]
  api -->|Telemetry| ai[Application Insights /\nLog Analytics]
```

## Authentication sequence

```mermaid
sequenceDiagram
  participant U as Customer
  participant S as SPA (MSAL Browser)
  participant E as Microsoft Entra ID
  participant A as Functions API
  participant D as Azure DevOps

  U->>S: Sign in
  S->>E: Authorization code + PKCE
  E-->>S: ID token + access token (portal API scope)
  S->>A: Call API with bearer token
  A->>A: Validate issuer, audience, signature, lifetime (jose)
  A->>E: OBO exchange (user assertion)
  E-->>A: Delegated Azure DevOps token
  A->>D: Call meterUsageEstimate with delegated token
  D-->>A: Estimate response
  A-->>S: Normalized report (no upstream token returned)
```

## Report-generation sequence

```mermaid
sequenceDiagram
  participant S as SPA
  participant A as Functions API
  participant D as Azure DevOps

  S->>A: POST /reports/azure-devops {organization, plans, retention}
  A->>A: Validate organization (allow-list) and request body (Zod)
  A->>D: GET meterUsageEstimate (per plan/resultType)
  D-->>A: uniqueCommitterCount, billedUsers
  A->>A: Normalize, match identities, store per retention policy
  A-->>S: {reportId, generatedAt, warnings}
  S->>A: GET /reports/{reportId}/export.xlsx
  A-->>S: XLSX workbook (Content-Disposition attachment)
```

## Deployment architecture

```mermaid
flowchart TB
  subgraph RG[Resource Group]
    SWA[Static Web App]
    FA[Function App - Flex Consumption]
    KV[Key Vault]
    LAW[Log Analytics]
    AI[Application Insights]
    ST[Storage Account]
  end
  SWA -- linkedBackend --> FA
  FA -- managed identity --> KV
  FA --> AI
  AI --> LAW
  FA --> ST
```

## Data retention lifecycle

```mermaid
stateDiagram-v2
  [*] --> InMemory: Report generated (retention=none)
  InMemory --> Delivered: Export downloaded
  Delivered --> [*]: Session window expires (~15 min)
  [*] --> SessionStore: retention=session
  SessionStore --> [*]: Session TTL expires (~1 hour)
  [*] --> ThirtyDayStore: retention=thirty-days
  ThirtyDayStore --> [*]: 30-day expiry or explicit delete
```

## Notes

- The frontend is hosted on Azure Static Web Apps; the API is a **linked,
  dedicated** Azure Functions app rather than SWA managed Functions. See
  [adr/0001-linked-function-app.md](adr/0001-linked-function-app.md).
- Static Web Apps built-in authentication is **not** used for sign-in;
  `staticwebapp.config.json` only sets security headers and SPA fallback
  routing. MSAL is the single authoritative sign-in system, avoiding
  duplicate/confusing login experiences.
