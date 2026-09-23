# Microsoft Entra setup

This setup is performed once by the application publisher. Customers do not create app registrations or provide tenant IDs, client secrets, certificates, or PATs.

1. Create a multitenant app registration for accounts in any organizational directory.
2. Configure it as a mobile and desktop public client.
3. Add the loopback redirect URI `http://localhost:8400`.
4. Do not create a client secret or upload a certificate.
5. Add only the delegated Azure DevOps Advanced Security reporting permission required by the meter usage estimate API (`vso.advsec` equivalent).
6. Do not add Microsoft Graph permissions unless a future feature has a documented requirement.
7. Configure publisher verification, logo, publisher domain, privacy URL, and terms URL before public release.
8. Test user and administrator consent in a separate tenant, including Conditional Access behavior.

The application uses the `organizations` authority, so personal Microsoft accounts are not supported.

## Build configuration

```powershell
$env:COMMITTER_INSIGHTS_CLIENT_ID = '<application-client-id>'
$env:COMMITTER_INSIGHTS_TENANT_ID = 'organizations'
$env:COMMITTER_INSIGHTS_REDIRECT_URI = 'http://localhost:8400'
npm run build:exe
```

The client ID is public configuration. A public release should embed the publisher-owned client ID during the build so customers do not set environment variables. The current development build reads it at runtime; embedding is tracked as a release-hardening requirement until the production registration exists.

If the required Azure DevOps delegated permission is unavailable in the tenant's permission picker, do not substitute a broader scope. Escalate through Azure DevOps support and fail closed.
