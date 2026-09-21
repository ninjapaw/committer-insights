# Troubleshooting

## "Your session has expired. Sign in again to continue." (401)

The bearer token failed validation or expired. Sign in again. If this
recurs immediately after sign-in, confirm `VITE_ENTRA_CLIENT_ID` and
`API_EXPECTED_AUDIENCE` match the same app registration.

## "Azure DevOps did not authorize this report." (403)

Confirm the signed-in account is a member of the target Azure DevOps
organization and has Advanced Security read permission there. Portal roles
never grant additional Azure DevOps access.

## "Your organization requires additional consent..." (409)

The tenant administrator has not granted consent for the delegated Azure
DevOps permission (`vso.advsec` via `499b84ac-1321-427f-aa17-267ca6975798`).
Share the administrator-consent URL from `docs/ENTRA_SETUP.md` with the
tenant admin.

## "We could not access that Azure DevOps organization..." (404)

Check the organization name spelling and the signed-in account's
membership in that organization.

## "Azure DevOps temporarily limited this request." (429)

Wait for the duration shown (derived from `Retry-After`) before retrying.

## Preview API warning

`meterUsageEstimate` is a preview endpoint. If Azure DevOps changes its
response shape, contract validation (`azureDevOpsMeterUsageEstimateResponseSchema`)
will reject the malformed payload with a `502`-mapped `upstream_error`
rather than returning incorrect data.

## Local development cannot reach Azure DevOps

Confirm `local.settings.json` (copied from `local.settings.example.json`)
has real Entra values, and that the confidential client credential is
available via `API_ENTRA_CLIENT_SECRET`/certificate for local testing. Do
not commit `local.settings.json`.
