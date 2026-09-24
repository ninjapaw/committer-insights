import { z } from 'zod';

export const GITHUB_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

export const gitHubTargetTypeSchema = z.enum(['organization', 'enterprise']);
export type GitHubTargetType = z.infer<typeof gitHubTargetTypeSchema>;

export interface GitHubSourceOption {
  id: string;
  name: string;
  targetType: GitHubTargetType;
  url?: string;
}

export function normalizeGitHubTarget(value: string): string {
  const input = value.trim();
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return input;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'orgs' && parts[1]) return parts[1];
    if (parts[0] === 'enterprises' && parts[1]) return parts[1];
    if (parts.length === 1 && parts[0]) return parts[0];
    return input;
  } catch {
    return input;
  }
}

export const gitHubTargetSchema = z
  .string()
  .transform(normalizeGitHubTarget)
  .pipe(
    z
      .string()
      .min(1, 'GitHub organization or enterprise is required')
      .max(100, 'GitHub organization or enterprise name is too long')
      .regex(GITHUB_NAME_PATTERN, 'Enter a GitHub organization, enterprise, or URL'),
  );

export function parseGitHubTargetInput(value: string): {
  targetType: GitHubTargetType;
  target: string;
} {
  const input = value.trim();
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'enterprises' && parts[1]) {
        return { targetType: 'enterprise', target: gitHubTargetSchema.parse(parts[1]) };
      }
      if (parts[0] === 'orgs' && parts[1]) {
        return { targetType: 'organization', target: gitHubTargetSchema.parse(parts[1]) };
      }
      if (parts.length === 1 && parts[0]) {
        return { targetType: 'organization', target: gitHubTargetSchema.parse(parts[0]) };
      }
    }
  } catch {
    // Bare names are treated as organizations because GitHub enterprise slugs are URL-scoped.
  }
  return { targetType: 'organization', target: gitHubTargetSchema.parse(input) };
}

export function normalizeGitHubRepository(value: string): string {
  const input = value.trim();
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return input;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return input;
    return `${parts[0]}/${parts[1]!.replace(/\.git$/i, '')}`;
  } catch {
    return input.replace(/\.git$/i, '');
  }
}

export const gitHubRepositorySchema = z
  .string()
  .transform(normalizeGitHubRepository)
  .pipe(
    z.string().refine((value) => {
      const [owner, repository, ...rest] = value.split('/');
      return (
        rest.length === 0 &&
        Boolean(owner && repository) &&
        GITHUB_NAME_PATTERN.test(owner!) &&
        GITHUB_NAME_PATTERN.test(repository!)
      );
    }, 'Enter a GitHub repository as owner/repository or a GitHub URL'),
  );

export const dailyActivitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commits: z.number().int().nonnegative(),
});
export type DailyActivity = z.infer<typeof dailyActivitySchema>;

export const gitHubContributionSchema = z.object({
  repository: gitHubRepositorySchema,
  commitCount: z.number().int().positive(),
  lastCommitAt: z.string().datetime(),
  dailyActivity: z.array(dailyActivitySchema).optional(),
});
export type GitHubContribution = z.infer<typeof gitHubContributionSchema>;

export const gitHubCommitterSchema = z.object({
  provider: z.literal('github'),
  repository: gitHubRepositorySchema,
  userId: z.string().optional(),
  login: z.string().min(1),
  displayName: z.string().optional(),
  profileUrl: z.string().url().optional(),
  commitCount: z.number().int().positive(),
  lastCommitAt: z.string().datetime(),
  collectedAt: z.string().datetime(),
  sourceApiVersion: z.string(),
  dailyActivity: z.array(dailyActivitySchema).optional(),
  contributions: z.array(gitHubContributionSchema).optional(),
});
export type GitHubCommitter = z.infer<typeof gitHubCommitterSchema>;

export function getGitHubContributions(committer: GitHubCommitter): GitHubContribution[] {
  if (committer.contributions) return committer.contributions;
  if (!gitHubRepositorySchema.safeParse(committer.repository).success) return [];
  return [
    {
      repository: committer.repository,
      commitCount: committer.commitCount,
      lastCommitAt: committer.lastCommitAt,
      dailyActivity: committer.dailyActivity,
    },
  ];
}

export const gitHubReportRequestSchema = z.object({
  targetType: gitHubTargetTypeSchema,
  target: gitHubTargetSchema,
  sinceDays: z.number().int().min(1).max(365).default(90),
  includeBilling: z.boolean().optional(),
});

export const gitHubViewerSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
});

export const gitHubRepositoryResponseSchema = z.object({
  id: z.number().int().positive(),
  full_name: gitHubRepositorySchema,
  html_url: z.string().url(),
  private: z.boolean(),
});

export const gitHubRepositoriesResponseSchema = z.array(gitHubRepositoryResponseSchema);

export const gitHubOrganizationResponseSchema = z.object({
  id: z.number().int().positive(),
  login: gitHubTargetSchema,
  html_url: z.string().url().optional(),
});

export const gitHubOrganizationsResponseSchema = z.array(gitHubOrganizationResponseSchema);

export const gitHubEnterpriseResponseSchema = z.object({
  id: z.number().int().positive(),
  slug: gitHubTargetSchema,
  html_url: z.string().url().optional(),
});

export const gitHubEnterprisesResponseSchema = z.array(gitHubEnterpriseResponseSchema);

export const gitHubCommitResponseSchema = z.object({
  author: z
    .object({
      id: z.number().int().positive(),
      login: z.string().min(1),
      html_url: z.string().url(),
    })
    .nullable()
    .optional(),
  commit: z.object({
    author: z
      .object({
        name: z.string().min(1),
        date: z.string().datetime(),
      })
      .nullable()
      .optional(),
  }),
});

export const gitHubCommitsResponseSchema = z.array(gitHubCommitResponseSchema);
