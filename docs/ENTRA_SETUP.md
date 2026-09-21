# Microsoft Entra application registration setup

1. In the Microsoft Entra admin center, create **one** new app registration
   owned by the portal operator.
2. Under **Supported account types**, choose **Accounts in any
   organizational directory (Any Microsoft Entra ID tenant - Multitenant)**.
   Do **not** enable "and personal Microsoft accounts" for the initial
   release.
3. Under **Authentication**, add a **Single-page application** platform
   with the SPA redirect URI(s):
   - Local development: `http://localhost:5173/auth/callback`
   - Production: `https://<your-static-web-app-domain>/auth/callback`
4. No separate backend/API redirect URI is required for this architecture;
   the API never participates in the browser redirect — it only validates
   the resulting bearer token and performs OBO in the background.
5. Under **Expose an API**, set the Application ID URI (defaults to
   `api://{client-id}`) and add a scope:
   - Scope name: `access_as_user`
   - Who can consent: Admins and users
   - Admin/user consent display name and description: describe read-only
     Azure DevOps Advanced Security reporting access.
6. Under **API permissions**, add a permission for **Azure DevOps**
   (resource `499b84ac-1321-427f-aa17-267ca6975798`, not Microsoft Graph).
   Select the delegated permission corresponding to `vso.advsec` if it is
   exposed in the app's permission picker or manifest.
   - **If `vso.advsec` is not selectable through the Entra permission
     picker or manifest for your tenant/API version**, this is a known
     platform constraint. Do not attempt to work around it by requesting a
     broader Azure DevOps scope. Document the exact picker state you see
     (screenshot) and escalate to your Microsoft account team or Azure
     DevOps support. The application fails safely (`409
     consent_or_account_mismatch`) and shows an administrator
     troubleshooting message rather than silently broadening scopes.
7. **User consent vs. administrator consent**: individual users can grant
   consent for delegated permissions that their tenant policy allows for
   user consent. Some tenants restrict user consent entirely, requiring an
   administrator to consent on behalf of the organization via the
   admin-consent URL:
   `https://login.microsoftonline.com/{tenant-id}/adminconsent?client_id={client-id}`
8. Create a **client credential** for the confidential client (server-side
   OBO exchange):
   - **Preferred for production**: a client certificate, uploaded under
     **Certificates & secrets > Certificates**, with the private key
     stored only in Azure Key Vault.
   - **Acceptable for initial deployment**: a client secret, stored only in
     Azure Key Vault (never in source control or App Service plain
     settings).
9. Record the following values after registration (do not commit real
   values anywhere in this repository):
   - Application (client) ID
   - Directory (tenant) authority in use (`organizations` for this app)
   - Application ID URI / API audience (`api://{client-id}`)
   - Key Vault secret URI for the client secret or certificate
10. Test consent with a separate test tenant before production rollout;
    revoke the test grant (Entra admin center > Enterprise applications >
    the app > Permissions > Revoke) and verify the reconnect flow correctly
    re-prompts for consent.
11. **Publisher verification** is a production readiness item — complete it
    before general availability so customers see a verified publisher
    badge on the consent screen.
12. Configure branding (app logo, publisher domain), and link your privacy
    statement and terms of use under **Branding & properties**.

## Environment variables (names only — never commit values)

```
VITE_ENTRA_CLIENT_ID=
VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/organizations
VITE_PORTAL_API_SCOPE=api://REPLACE_WITH_CLIENT_ID/access_as_user
API_ENTRA_CLIENT_ID=
API_ENTRA_TENANT_AUTHORITY=https://login.microsoftonline.com/organizations
API_ENTRA_CLIENT_CERTIFICATE_SECRET_URI=
API_ENTRA_CLIENT_SECRET_URI=
API_EXPECTED_AUDIENCE=
AZURE_DEVOPS_RESOURCE=https://app.vssps.visualstudio.com
AZURE_DEVOPS_API_VERSION=7.2-preview.3
APPLICATIONINSIGHTS_CONNECTION_STRING=
REPORT_RETENTION_DEFAULT=none
ENABLE_MOCK_DATA=false
FEATURE_GITHUB_PROVIDER=false
```
