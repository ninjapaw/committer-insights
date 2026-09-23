import { describe, expect, it } from 'vitest';
import { gitHubRepositorySchema } from '@ninjapaw/contracts';

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
