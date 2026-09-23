# Privacy

Committer Insights processes Azure DevOps Advanced Security estimates and GitHub repository committer activity locally on the customer's device.

## Processed data

- Azure DevOps organization selected by the user
- Azure DevOps organization names available to the signed-in Azure CLI profile
- Committer identity metadata returned by the reporting API
- Report plan, result type, collection time, and API version
- GitHub repositories visible to the active GitHub CLI account
- GitHub login, display name, profile URL, commit count, and last commit date

## Data location

The publisher does not operate a report-processing backend. Azure/GitHub tokens, connection state, and generated reports remain in memory inside the local executable. Data leaves the process only when sent to Microsoft Entra ID, Azure DevOps, or GitHub for authentication and reporting, or when the user explicitly downloads an Excel, CSV, PDF, or standalone HTML export.

Combined exports include source inclusion or skip status, failure reasons, and remediation. Cross-provider identities are not automatically merged.

Closing the executable removes the in-memory session and reports. Downloaded exports remain on the customer's device and are controlled by the customer's endpoint and file-retention policies.

## Not collected

- Personal access tokens
- Customer passwords
- Source-code contents
- Repository files
- Pipeline definitions
- Work-item contents
- Application client secrets
- GitHub commit messages, patches, filenames, commit SHAs, or author email addresses

The executable does not send product telemetry to the publisher.
