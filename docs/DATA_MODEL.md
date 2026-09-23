# Data model

## AzureDevOpsCommitter

| Field                          | Notes                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| provider                       | always `"azure-devops"`                                    |
| organization                   | validated Azure DevOps organization name                   |
| plan                           | `codeSecurity` \| `secretProtection` \| `all`              |
| resultType                     | `estimated` \| `licensed` — kept distinct, never conflated |
| cuid, identityId, descriptor   | opaque Azure DevOps identity fields                        |
| displayName, userPrincipalName | optional, present when the API returns them                |
| isEstimated, isLicensed        | booleans derived from resultType                           |
| collectedAt                    | ISO 8601 timestamp of collection                           |
| sourceApiVersion               | preview API version used for the request                   |

See `packages/contracts/src/index.ts` for the canonical Zod schemas.

## GitHubCommitter

| Field            | Notes                                                   |
| ---------------- | ------------------------------------------------------- |
| provider         | always `"github"`                                       |
| repository       | normalized `owner/repository`                           |
| login            | GitHub login, or commit author name for anonymous users |
| displayName      | optional commit author display name                     |
| profileUrl       | optional GitHub profile URL                             |
| commitCount      | commits on the default branch in the selected window    |
| lastCommitAt     | latest matching commit timestamp                        |
| collectedAt      | local collection timestamp                              |
| sourceApiVersion | GitHub REST API version                                 |

GitHub email addresses, messages, patches, filenames, and commit SHAs are not retained.
