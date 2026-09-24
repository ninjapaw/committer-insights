import { z } from 'zod';
import {
  gitHubRepositorySchema,
  reportingWindow,
  type RepositoryInsight,
} from '@ninjapaw/contracts';
import { API_ORIGIN, request } from './http-client.js';

const setting = z.object({ status: z.enum(['enabled', 'disabled']).optional() }).nullish();
const repositorySchema = z.object({
  id: z.number().int().positive(),
  visibility: z.string().optional(),
  private: z.boolean(),
  archived: z.boolean().optional(),
  disabled: z.boolean().optional(),
  security_and_analysis: z
    .object({
      advanced_security: setting,
      code_security: setting,
      secret_scanning: setting,
      secret_scanning_push_protection: setting,
      dependabot_security_updates: setting,
    })
    .nullish(),
});
export const gitHubSecurityFeatures = {
  advanced_security: 'Advanced Security bundle',
  code_security: 'Code Security',
  secret_scanning: 'Secret scanning',
  secret_scanning_push_protection: 'Push protection',
  dependabot_security_updates: 'Dependabot security updates',
} as const;

export async function fetchGitHubRepositoryInsight(
  repository: string,
  source: string,
  days: number,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepositoryInsight> {
  const name = gitHubRepositorySchema.parse(repository);
  const base: RepositoryInsight = {
    provider: 'github',
    source,
    id: name.toLowerCase(),
    name,
    visibility: 'unknown',
    state: 'unknown',
    features: Object.values(gitHubSecurityFeatures).map((name) => ({ name, state: 'unknown' })),
    observedAt: new Date().toISOString(),
    activity: { ...reportingWindow(days), status: 'unavailable', daily: [] },
  };
  const response = await request(new URL(`/repos/${name}`, API_ORIGIN), token, fetchImpl);
  const body = repositorySchema.parse(await response.json());
  return {
    ...base,
    visibility: body.visibility ?? (body.private ? 'private' : 'public'),
    state: body.disabled ? 'disabled' : body.archived ? 'archived' : 'active',
    features: Object.entries(gitHubSecurityFeatures).map(([key, name]) => ({
      name,
      state:
        body.security_and_analysis?.[key as keyof typeof gitHubSecurityFeatures]?.status ??
        'unknown',
    })),
  };
}

export { collectGitHubBillingSnapshots as collectGitHubBilling } from './billing-client.js';
