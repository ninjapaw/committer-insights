# Runbook

## Upstream (Azure DevOps) outage

1. Check Azure DevOps status page.
2. Confirm the API is surfacing `upstream_unavailable` (503) rather than a
   silent failure — check Application Insights for `AzureDevOpsAdapterError`.
3. No customer action required; retries with backoff are automatic for
   transient 502/503. Communicate via status page if prolonged.

## 429 response spike

1. Check Application Insights for `rate_limited` provider errors and
   `Retry-After` values observed.
2. Confirm bounded retry/backoff is behaving (max 3 attempts, jittered).
3. If sustained, consider adding per-organization request throttling in
   the report-creation function (not yet implemented; track as follow-up).

## Authentication outage (Entra)

1. Check Entra ID service health.
2. `/me` and all bearer-protected routes will return 401; this is expected
   fail-safe behavior, not a bug.

## Certificate or secret rotation

1. Create a new client secret/certificate in the Entra app registration.
2. Store the new value in Key Vault under the same secret name referenced
   by the Function App's Key Vault reference (`api-entra-client-secret`).
3. App Service automatically re-resolves Key Vault references; no restart
   should be required, but restart the Function App if issues persist.
4. Delete the old secret/certificate from Entra after confirming the new
   one works.

## Suspected token exposure

1. Revoke the affected user's sessions in Entra (Conditional Access /
   "revoke sessions").
2. Rotate the API's confidential client credential immediately (see
   rotation steps above).
3. Review Application Insights logs to confirm no tokens were logged
   (redaction should have prevented this).

## Customer deletion request

1. Confirm the customer's subject/tenant ID (never log raw values).
2. `DELETE /api/reports/{reportId}` for any known report IDs, or await
   natural expiry for session/thirty-day retention.
3. `DELETE /api/connections/azure-devops` to remove stored connection
   state.

## Preview API schema change

1. Contract validation (`azureDevOpsMeterUsageEstimateResponseSchema`) will
   reject unexpected shapes rather than passing through bad data.
2. Update the Zod schema and adapter mapping in
   `api/src/adapters/azure-devops/estimate-client.ts`.
3. Add a fixture-based regression test under
   `api/tests/integration/estimate-client.integration.test.ts`.

## Rollback procedure

1. Re-run the GitHub Actions "main" deployment workflow against the last
   known-good commit SHA (workflow supports manual dispatch).
2. Static Web Apps and Function App both support redeploying a previous
   build artifact retained per the CI retention policy.
