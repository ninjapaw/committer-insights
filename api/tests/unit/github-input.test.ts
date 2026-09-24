import { describe, expect, it } from 'vitest';
import { gitHubRepositorySchema, parseGitHubTargetInput } from '@ninjapaw/contracts';

describe('gitHubRepositorySchema', () => {
  it.each([
    ['octocat/example', 'octocat/example'],
    ['https://github.com/octocat/example', 'octocat/example'],
    ['https://github.com/octocat/example.git', 'octocat/example'],
  ])('normalizes %s', (input, expected) => {
    expect(gitHubRepositorySchema.parse(input)).toBe(expected);
  });

  it.each(['https://evil.example/octocat/example', 'octocat', 'octocat/example/extra'])(
    'rejects %s',
    (input) => expect(gitHubRepositorySchema.safeParse(input).success).toBe(false),
  );
});

describe('parseGitHubTargetInput', () => {
  it.each([
    ['octocat', { targetType: 'organization', target: 'octocat' }],
    ['https://github.com/octocat', { targetType: 'organization', target: 'octocat' }],
    ['https://github.com/orgs/octocat', { targetType: 'organization', target: 'octocat' }],
    [
      'https://github.com/enterprises/octo-enterprise',
      { targetType: 'enterprise', target: 'octo-enterprise' },
    ],
  ] as const)('normalizes %s', (input, expected) => {
    expect(parseGitHubTargetInput(input)).toEqual(expected);
  });
});
