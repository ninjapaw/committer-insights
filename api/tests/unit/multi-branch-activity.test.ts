import { describe, expect, it, vi } from 'vitest';
import { fetchGitHubCommitters } from '../../src/adapters/github/committers-client.js';

const commit = (sha: string, login: string, date = '2026-09-20T12:00:00Z') => ({
  sha,
  author: {
    id: Math.abs(Number(sha.slice(-2))) || 1,
    login,
    html_url: `https://github.com/${login}`,
  },
  commit: { author: { name: login, date } },
});

describe('multi-branch activity collection', () => {
  it('discovers branches, deduplicates shared commits, and reports branch coverage', async () => {
    const coverage: { branches: string[]; truncated: boolean }[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname.endsWith('/branches'))
        return Response.json([{ name: 'main' }, { name: 'feature/demo' }]);
      if (url.pathname.endsWith('/commits')) {
        return Response.json(
          url.searchParams.get('sha') === 'feature/demo'
            ? [commit('shared', 'alice'), commit('feature', 'bob')]
            : [commit('shared', 'alice')],
        );
      }
      throw new Error(`Unexpected URL: ${url.href}`);
    });

    const rows = await fetchGitHubCommitters(
      {
        repository: 'octocat/example',
        sinceDays: 90,
        accessToken: 'token',
        branchScope: 'all',
        onCoverage: (value) => coverage.push(value),
      },
      fetchImpl,
    );

    expect(rows.map((row) => [row.login, row.commitCount])).toEqual([
      ['alice', 1],
      ['bob', 1],
    ]);
    expect(coverage).toEqual([{ branches: ['main', 'feature/demo'], truncated: false }]);
  });

  it('returns a lower-bound result when the provider pagination ceiling is reached', async () => {
    const coverage: { branches: string[]; truncated: boolean }[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname.endsWith('/branches')) return Response.json([{ name: 'main' }]);
      const page = Number(url.searchParams.get('page') ?? '1');
      return Response.json([commit(`sha-${page}`, 'alice')], {
        headers: {
          link: `<https://api.github.com${url.pathname}?page=${page + 1}>; rel="next"`,
        },
      });
    });

    const rows = await fetchGitHubCommitters(
      {
        repository: 'octocat/example',
        sinceDays: 90,
        accessToken: 'token',
        branchScope: 'all',
        onCoverage: (value) => coverage.push(value),
      },
      fetchImpl,
    );

    expect(rows).toHaveLength(1);
    expect(coverage).toEqual([{ branches: ['main'], truncated: true }]);
  });
});
