# Active Committer Portal

Review Azure DevOps Advanced Security committer estimates, compare provider
identities, and export a customer-controlled report — using delegated,
read-only Microsoft Entra ID access. **No Azure DevOps personal access
token is ever requested.**

## Product purpose

Customers sign in with a Microsoft work or school account, consent to
read-only delegated Azure DevOps access, select an organization they are
already authorized to access, and generate an Excel/CSV report of estimated
Advanced Security committers (Code Security, Secret Protection, or both).
GitHub identity correlation is designed in but disabled until a GitHub App
is registered.

## Screenshots

_Placeholder — add screenshots of the landing page, consent explanation
page, and results dashboard here once the UI is deployed._

## Architecture summary

React SPA (MSAL Browser/React, Fluent UI v9, TanStack Query/Table) → Azure
Static Web Apps → linked Azure Functions API (bearer validation + OAuth
On-Behalf-Of) → Azure DevOps Advanced Security estimate API. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams.

## Prerequisites

- Node.js 20 LTS or newer
- npm 10+
- Azure Functions Core Tools v4 (`func`) for local API execution
- Azure CLI with the Bicep extension, for `npm run infra:validate`
- A Microsoft Entra app registration — see [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md)

## Local setup

```bash
npm install
cp app/.env.example app/.env
cp api/local.settings.example.json api/local.settings.json
# Fill in app/.env and api/local.settings.json with your Entra app values.
npm run dev
```

## Environment configuration

See [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md) for the full variable list
and setup steps. Mock data (`ENABLE_MOCK_DATA=true`) only works in
non-production environments; it is force-disabled when
`AZURE_FUNCTIONS_ENVIRONMENT=Production`.

## Test commands

```bash
npm run test:unit
npm run test:integration
npm run test:e2e         # requires Playwright browsers installed
npm run test:coverage
```

## Build commands

```bash
npm run build
```

## Azure deployment

```bash
npm run infra:validate   # az bicep build for every template
```

Deployment to dev/test/prod is automated via `.github/workflows/main.yml`
using OIDC workload identity federation (no long-lived Azure credentials
stored in GitHub). Production requires manual environment approval.

## Entra setup

See [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md).

## Security model

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Data retention

Default is `none` (in-memory processing only). See
[docs/PRIVACY.md](docs/PRIVACY.md) and [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

## API limitations

The Azure DevOps `meterUsageEstimate` endpoint is a **preview** API
(`api-version=7.2-preview.3`). See [docs/API.md](docs/API.md).

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
