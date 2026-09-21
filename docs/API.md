# API reference

Base path: `/api` (Azure Functions `routePrefix`).

| Route | Method | Auth | Notes |
|---|---|---|---|
| /health | GET | none | No environment/secret exposure |
| /version | GET | none | API + Azure DevOps API version |
| /me | GET | bearer | Portal identity claims only, `Cache-Control: no-store` |
| /connections | GET | bearer | Lists the caller's provider connections |
| /connections/azure-devops/validate | POST | bearer | Validates org + OBO exchange |
| /connections/azure-devops | DELETE | bearer | Removes stored connection |
| /reports/azure-devops | POST | bearer | Creates a report; body validated with Zod |
| /reports/{reportId} | GET | bearer | Ownership-checked read |
| /reports/{reportId} | DELETE | bearer | Ownership-checked delete |
| /reports/{reportId}/export.xlsx | GET | bearer | ExcelJS workbook, formula-injection safe |
| /reports/{reportId}/export.csv | GET | bearer | CSV, formula-injection safe |

Errors use the typed `ProviderError` shape (`code`, `message`,
`correlationId`, optional `retryAfterSeconds`) and never include upstream
response bodies, stack traces, tenant IDs, tokens, or secrets.

## Known API limitation

`meterUsageEstimate` (`api-version=7.2-preview.3`) is a **preview** Azure
DevOps API. Field shapes may change without notice; every normalized record
includes `sourceApiVersion` and `collectedAt` so customers can correlate
results to the API version in effect at collection time.
