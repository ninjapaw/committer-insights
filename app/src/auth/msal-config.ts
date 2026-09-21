import type { Configuration } from '@azure/msal-browser';

/**
 * SPA MSAL configuration using the "organizations" authority: this portal
 * supports work-or-school accounts only, not personal Microsoft accounts.
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID ?? '',
    authority:
      import.meta.env.VITE_ENTRA_AUTHORITY ?? 'https://login.microsoftonline.com/organizations',
    redirectUri: '/auth/callback',
    postLogoutRedirectUri: '/',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps tokens out of durable browser storage per the
    // security requirement to avoid localStorage-persisted tokens.
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const portalApiScopes = [
  import.meta.env.VITE_PORTAL_API_SCOPE ?? 'api://REPLACE_WITH_CLIENT_ID/access_as_user',
];

export const isTestAuthMode = (): boolean =>
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_TEST_AUTH_MODE === 'true';
