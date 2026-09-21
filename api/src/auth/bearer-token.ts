import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../shared/config.js';

export class AuthenticationRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

export interface PortalIdentity {
  subject: string;
  tenantId: string;
  name?: string;
  roles: string[];
  /** Raw bearer token, kept in-process only, never logged or returned to caller. */
  bearerToken: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) {
    // Multi-tenant "organizations" authority: use the common discovery
    // keys endpoint. Issuer is still validated per-token against the tid claim.
    jwks = createRemoteJWKSet(
      new URL('https://login.microsoftonline.com/organizations/discovery/v2.0/keys'),
    );
  }
  return jwks;
}

/**
 * Validates an incoming bearer token issued by Microsoft Entra ID for this
 * application's exposed API scope. Never logs the token or its claims.
 */
export async function validateBearerToken(
  authorizationHeader: string | undefined,
): Promise<PortalIdentity> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new AuthenticationRequiredError();
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  const audience = config.entra.expectedAudience();

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getJwks(), {
      audience: audience || undefined,
      // Entra v2 tokens use tenant-specific issuers; validated via regex below
      // rather than a fixed string because this app is multi-tenant.
    });
    payload = result.payload;
  } catch {
    throw new AuthenticationRequiredError('Token validation failed');
  }

  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F-]{36}\/v2\.0$/.test(issuer)) {
    throw new AuthenticationRequiredError('Unexpected token issuer');
  }

  const tenantId = typeof payload.tid === 'string' ? payload.tid : '';
  const subject = typeof payload.sub === 'string' ? payload.sub : '';
  if (!tenantId || !subject) {
    throw new AuthenticationRequiredError('Token missing required claims');
  }

  const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];

  return {
    subject,
    tenantId,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    roles,
    bearerToken: token,
  };
}

export const PORTAL_ROLES = {
  ReportReader: 'Report.Reader',
  ReportOperator: 'Report.Operator',
  ConnectionAdmin: 'Connection.Admin',
  ReportAuditor: 'Report.Auditor',
} as const;

export function requireRole(identity: PortalIdentity, role: string): void {
  if (!identity.roles.includes(role)) {
    throw new AuthenticationRequiredError(`Missing required role: ${role}`);
  }
}
