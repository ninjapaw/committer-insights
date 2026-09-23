# Architecture

## System context

```mermaid
flowchart LR
  U[Customer] -->|launches| E[Signed local executable]
  E -->|serves on 127.0.0.1| B[System browser wizard]
  E -->|interactive public-client sign-in| M[Microsoft Entra ID]
  E -->|delegated read-only token| A[Azure DevOps Advanced Security API]
  E -->|in-memory report| B
  B -->|authenticated download| X[Local XLSX or CSV file]
```

No application backend, cloud database, Key Vault, Function App, or Static Web App is required.

## Startup sequence

1. The executable generates a 256-bit random capability.
2. It binds an HTTP server to `127.0.0.1` on an OS-assigned port.
3. It opens `http://127.0.0.1:<port>/#session=<capability>`.
4. The React application reads the fragment into module memory and removes it from browser history.
5. API requests send the capability in the `Authorization` header.
6. The local server rejects unexpected Host, Origin, and capability values.

## Authentication sequence

```mermaid
sequenceDiagram
  participant U as Customer
  participant W as Local wizard
  participant E as Local executable
  participant M as Microsoft Entra ID
  participant A as Azure DevOps

  U->>W: Sign in
  W->>E: POST /api/auth/sign-in with local capability
  E->>M: Interactive browser public-client authentication
  M-->>E: Delegated Azure DevOps token
  E-->>W: Authenticated session status
  U->>W: Enter organization and report options
  W->>E: Generate report
  E->>A: meterUsageEstimate using delegated token
  A-->>E: Committer estimate
  E-->>W: In-memory web report
  W->>E: Download Excel or CSV
  E-->>W: Generated file
```

Azure access and refresh tokens are never sent to the React application.

## Packaging

`scripts/build-executable.mjs` bundles the Node host with esbuild, embeds the Vite output as Node SEA assets, injects the SEA blob into a copy of the current Node executable, and writes a SHA-256 manifest. Release automation must sign the completed binary after injection and verify the signature before publication.
