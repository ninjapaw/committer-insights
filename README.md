# Committer Insights

Generate Azure DevOps Advanced Security committer reports on your own computer. The signed executable opens a local browser wizard, authenticates with delegated read-only Microsoft Entra access, and produces web, Excel, and CSV reports without uploading report data to a hosted service.

## Customer experience

1. Download the executable and verify its SHA-256 checksum.
2. Run it without Node.js, Azure CLI, administrator rights, or installation.
3. Sign in with a Microsoft work or school account.
4. Paste an Azure DevOps organization name or URL.
5. Generate the report and download Excel or CSV output.
6. Close the executable to erase the in-memory session and reports.

The application never asks for an Azure DevOps PAT, customer app registration, client secret, Azure subscription, or tenant identifier. A tenant administrator may still need to approve the publisher's delegated permission under the customer's consent policy.

## Security model

- The server binds only to an OS-assigned port on `127.0.0.1`.
- Every API request requires a random per-launch capability.
- Mutating requests also require the exact loopback origin.
- Azure tokens remain in the executable process and never enter browser storage.
- Reports are held in memory and are written only when the user downloads an export.
- Azure DevOps access is delegated and cannot exceed the signed-in user's permissions.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Maintainer setup

Prerequisites:

- Node.js 24.19.0
- npm 11.17.0
- A multitenant Microsoft Entra public-client registration described in [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md)
- A code-signing service or certificate for public releases

```powershell
npm ci
$env:COMMITTER_INSIGHTS_CLIENT_ID = '<public-client-application-id>'
npm run build:exe
.\release\committer-insights.exe
```

The client ID is public configuration, not a secret. Release builds should provide it centrally so customers do not configure anything.

## Development

```powershell
npm ci
$env:COMMITTER_INSIGHTS_CLIENT_ID = '<public-client-application-id>'
npm run dev
```

`npm run dev` builds the React application and starts the same local host used by the executable.

## Validation

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build:exe
```

Build output is written to `release/` with `SHA256SUMS.txt`. The generated executable is not release-ready until it has been Authenticode-signed and verified.

## License

MIT. See [LICENSE](LICENSE).
