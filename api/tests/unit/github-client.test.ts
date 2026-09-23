import { describe, expect, it, vi } from 'vitest';
import {
  discoverGitHubRepositories,
  fetchGitHubCommitters,
  getGitHubViewer,
} from '../../src/adapters/github/github-client.js';

describe('GitHub client', () => {
  it('validates the signed-in viewer', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { id: 1, login: 'octocat', name: 'Octo Cat' },
          { headers: { 'x-ratelimit-remaining': '4999' } },
        ),
      );
    await expect(getGitHubViewer('token', fetchImpl as typeof fetch)).resolves.toEqual({
      id: '1',
      login: 'octocat',
      name: 'Octo Cat',
    });
  });

  it('discovers and sorts repositories', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        [
          {
            id: 2,
            full_name: 'octocat/zeta',
            html_url: 'https://github.com/octocat/zeta',
            private: true,
          },
          {
            id: 1,
            full_name: 'octocat/alpha',
            html_url: 'https://github.com/octocat/alpha',
            private: false,
          },
        ],
        { headers: { 'x-ratelimit-remaining': '4999' } },
      ),
    );
    const result = await discoverGitHubRepositories('token', fetchImpl as typeof fetch);
    expect(result.map(({ name }) => name)).toEqual(['octocat/alpha', 'octocat/zeta']);
  });

  it('aggregates commits without retaining email, message, or sha fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        [
          {
            author: { id: 583231, login: 'octocat', html_url: 'https://github.com/octocat' },
            commit: { author: { name: 'Octo Cat', date: '2026-09-22T10:00:00.000Z' } },
          },
          {
            author: { id: 583231, login: 'octocat', html_url: 'https://github.com/octocat' },
            commit: { author: { name: 'Octo Cat', date: '2026-09-23T10:00:00.000Z' } },
          },
        ],
        { headers: { 'x-ratelimit-remaining': '4999' } },
      ),
    );
    const result = await fetchGitHubCommitters(
      { repository: 'https://github.com/octocat/example.git', sinceDays: 90, accessToken: 'token' },
      fetchImpl as typeof fetch,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      repository: 'octocat/example',
      userId: '583231',
      login: 'octocat',
      displayName: 'Octo Cat',
      commitCount: 2,
      lastCommitAt: '2026-09-23T10:00:00.000Z',
    });
    expect(result[0]).not.toHaveProperty('email');
    expect(result[0]).not.toHaveProperty('message');
    expect(result[0]).not.toHaveProperty('sha');
  });

  it('rejects pagination outside api.github.com', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json([], {
        headers: {
          link: '<https://evil.example/repos?page=2>; rel="next"',
          'x-ratelimit-remaining': '4999',
        },
      }),
    );
    await expect(discoverGitHubRepositories('token', fetchImpl as typeof fetch)).rejects.toThrow(
      'unsafe pagination URL',
    );
  });
});
