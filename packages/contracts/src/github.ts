import { z } from 'zod';

export const GITHUB_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

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
});
export type GitHubCommitter = z.infer<typeof gitHubCommitterSchema>;

export const gitHubReportRequestSchema = z.object({
  repository: gitHubRepositorySchema,
  sinceDays: z.number().int().min(1).max(365).default(90),
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
