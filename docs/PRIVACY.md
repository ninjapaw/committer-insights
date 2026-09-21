# Privacy

## Collected

- Portal account identifier (Microsoft Entra subject and tenant ID)
- Azure DevOps organization selected by the user
- Committer identity metadata returned by the Azure DevOps Advanced
  Security reporting API (CUID, identity ID, descriptor, display name,
  user principal name)
- Advanced Security plan estimate metadata (plan, result type, collection
  timestamp, source API version)
- Report parameters (organization, plans, retention selection)
- Minimal security audit events (sign-in, consent completion, connection
  validation, report generation/export/deletion, disconnect) — these events
  never include personal information as telemetry dimensions; stable
  identifiers used for abuse controls are hashed/pseudonymized.

## Not intended to be collected

This application requests only the Azure DevOps Advanced Security
meter-usage-estimate endpoint. It does not request or store:

- Source-code contents
- Repository file contents
- Pipeline definitions
- Work-item contents
- Customer personal access tokens
- Customer passwords
- Secrets

## Customer controls

- **Data deletion**: `DELETE /api/reports/{reportId}` removes a stored
  report immediately, subject to ownership verification.
- **Disconnect**: `DELETE /api/connections/azure-devops` removes the
  stored connection state for the signed-in user.
- **Retention control**: each report request selects `none` (default,
  processed in memory and not persisted after delivery), `session`
  (short-lived encrypted storage), or `thirty-days` (explicit opt-in with
  automatic expiry).
- **Privacy contact**: privacy@example.invalid (placeholder — update before
  production launch).
- **Terms URL**: https://example.invalid/terms (placeholder).
- **Subprocessors URL**: https://example.invalid/subprocessors (placeholder).
