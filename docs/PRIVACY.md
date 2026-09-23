# Privacy

Committer Insights processes Azure DevOps Advanced Security committer estimates locally on the customer's device.

## Processed data

- Azure DevOps organization selected by the user
- Committer identity metadata returned by the reporting API
- Report plan, result type, collection time, and API version

## Data location

The publisher does not operate a report-processing backend. Azure tokens, connection state, and generated reports remain in memory inside the local executable. Data leaves the process only when sent to Microsoft Entra ID or Azure DevOps for authentication and reporting, or when the user explicitly downloads an Excel or CSV export.

Closing the executable removes the in-memory session and reports. Downloaded exports remain on the customer's device and are controlled by the customer's endpoint and file-retention policies.

## Not collected

- Personal access tokens
- Customer passwords
- Source-code contents
- Repository files
- Pipeline definitions
- Work-item contents
- Application client secrets

The executable does not send product telemetry to the publisher.
