# Security

## Authentication and least privilege

The executable first requests an Azure DevOps token through the user's existing Azure CLI session. This path uses Microsoft's Azure CLI application identity and requires no Committer Insights app registration or consent. If Azure CLI is unavailable, the executable can fall back to a publisher-owned Microsoft Entra public client. The fallback contains no client secret or certificate and requests only read-only Advanced Security reporting access (`vso.advsec` equivalent).

Access remains constrained by the signed-in user's existing Azure DevOps permissions. The executable does not accept PATs and does not use application-only Azure DevOps access.

## Loopback boundary

- Bind only to `127.0.0.1` with an OS-assigned port.
- Require the exact loopback `Host` value.
- Require a random 256-bit per-launch bearer capability on every API route.
- Require the exact `Origin` value on state-changing requests.
- Disable cross-origin access and return restrictive browser security headers.
- Put the launch capability in a URL fragment, never a query string, and remove it from browser history immediately.

Loopback alone is not considered authorization. These controls protect against DNS rebinding, malicious websites, and accidental LAN exposure. Another process running as the same OS user remains within the local-machine trust boundary.

## Data handling

Azure tokens and reports remain in process memory. Tokens are never returned to the browser, logged, placed in URLs, or persisted. Reports are written only through an explicit authenticated browser download. Exported identity values are neutralized against spreadsheet formula injection.

Closing the process destroys the session capability, credential object, connection state, and in-memory reports.

## Releases

Node SEA assembly modifies the copied Node binary and invalidates its upstream signature. Public artifacts must be signed after SEA injection with SHA-256 and RFC 3161 timestamping. Release automation must verify the final signature and publish `SHA256SUMS.txt`, an SBOM, and provenance. Signing credentials must be protected by a release environment and must not be exported into the repository or build logs.

## Logging

Production logging must not include tokens, request authorization headers, identity values, organization names, report contents, capability-bearing launch URLs, or local output paths. The launch URL is printed only when explicit no-browser mode is enabled for automated smoke testing.
