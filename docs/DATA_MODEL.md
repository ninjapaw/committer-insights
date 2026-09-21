# Data model

## AzureDevOpsCommitter

| Field | Notes |
|---|---|
| provider | always `"azure-devops"` |
| organization | validated Azure DevOps organization name |
| plan | `codeSecurity` \| `secretProtection` \| `all` |
| resultType | `estimated` \| `licensed` — kept distinct, never conflated |
| cuid, identityId, descriptor | opaque Azure DevOps identity fields |
| displayName, userPrincipalName | optional, present when the API returns them |
| isEstimated, isLicensed | booleans derived from resultType |
| collectedAt | ISO 8601 timestamp of collection |
| sourceApiVersion | preview API version used for the request |

## GitHubCommitter

| Field | Notes |
|---|---|
| provider | always `"github"` |
| userLogin, organization, repository, organizationRepository | |
| lastPushedDate, lastPushedEmail | optional |
| collectedAt | ISO 8601 timestamp |

## CombinedCommitter

| Field | Notes |
|---|---|
| canonicalId | deterministic ID derived from the strongest identity signal |
| providers | `azure-devops` and/or `github` |
| matchStatus | `matched` \| `provider-only` \| `review-required` |
| matchMethod | `exact-email` \| `exact-upn` \| `approved-alias` \| `github-login-candidate` \| `none` |
| matchConfidence | 0–1, only 1.0 for exact-email/exact-upn |
| reviewRequired | true only for `github-login-candidate` matches |

See `packages/contracts/src/index.ts` for the canonical Zod schemas and
`api/src/reports/identity-matching.ts` for the matching implementation and
its conservative-merge rules.
