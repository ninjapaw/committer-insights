# Committer Insights

Generate Azure DevOps Advanced Security committer reports on your own computer. The executable opens a local browser wizard, uses delegated read-only Microsoft Entra access, and produces web, Excel, and CSV reports without uploading report data to a hosted service.

## Why local

- Azure tokens and report data stay on the user's computer.
- No hosted API, database, Azure subscription, PAT, or customer secret is required.
- Existing Azure CLI sign-in avoids a Committer Insights app registration and app-specific consent.
- Closing the executable clears its in-memory session and reports.

## Customer experience

1. Download the signed Windows executable and `SHA256SUMS.txt` from the release.
2. Verify the checksum and publisher signature.
3. For the no-registration path, install Azure CLI once and run `az login`.
4. Run the executable without Node.js, administrator rights, or installation.
5. The app reuses the Azure CLI account. If unavailable, it can use the optional publisher sign-in fallback.
6. Paste an Azure DevOps organization name or URL.
7. Generate the report and download Excel or CSV output.
8. Close the executable to erase the in-memory session and reports.

The application never asks for an Azure DevOps PAT, customer app registration, client secret, or tenant identifier. Azure CLI authentication is limited by the signed-in user's existing Azure DevOps permissions. If the optional publisher fallback is enabled, tenant policy may require administrator approval.

## Security model

- The server binds only to an OS-assigned port on `127.0.0.1`.
- Every API request requires a random per-launch capability.
- Mutating requests also require the exact loopback origin.
- Azure tokens remain in the executable process and never enter browser storage.
- Reports are held in memory and are written only when the user downloads an export.
- Azure DevOps access is delegated and cannot exceed the signed-in user's permissions.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Build from source

Prerequisites:

- Node.js 24.19.0
- npm 11.17.0
- Azure CLI with an authenticated user (`az login`) for live report testing
- Optional multitenant public-client registration for the non-CLI fallback; see [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md)
- Authenticode signing service or certificate for public releases

```powershell
npm ci
npm run build:exe
.\release\committer-insights.exe
```

To include the optional fallback, set `COMMITTER_INSIGHTS_CLIENT_ID` before `npm run build:exe`. The client ID is public configuration, not a secret.

## Development

```powershell
npm ci
npm run dev
```

`npm run dev` builds the React application and starts the same local host used by the executable. Run `az login` first for live Azure DevOps access.

## Validation

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build:exe
npm run test:exe
```

`npm run ci` runs this complete sequence. Build output is written to `release/` with `SHA256SUMS.txt`.

## Release boundary

Node SEA injection modifies the executable after copying Node, so the final binary must be Authenticode-signed and timestamped **after** `npm run build:exe`. CI artifacts are intentionally named `unsigned`; they are Azure CLI-only validation artifacts, not public releases. A public release must include:

- Verified Authenticode signature and RFC 3161 timestamp
- `SHA256SUMS.txt`
- SBOM and build provenance
- A production publisher client ID only when the optional fallback is offered

## Troubleshooting

- **Azure CLI sign-in fails:** run `az login`, select an account in the tenant connected to the Azure DevOps organization, and retry.
- **Organization cannot be accessed:** verify the organization URL and that the signed-in user is a member with Advanced Security reporting access.
- **Administrator approval appears:** Azure CLI was unavailable and the publisher fallback was used. Use `az login` to avoid Committer Insights-specific consent, or ask the tenant administrator to approve the fallback.
- **Browser did not open:** copy the loopback URL shown by the application only in explicit no-browser/test mode; normal releases open the default browser automatically.

## License

MIT. See [LICENSE](LICENSE).
