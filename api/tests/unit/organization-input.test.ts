import { describe, expect, it } from 'vitest';
import { azureDevOpsOrganizationSchema } from '@ninjapaw/contracts';

describe('azureDevOpsOrganizationSchema', () => {
  it.each([
    ['contoso', 'contoso'],
    [' https://dev.azure.com/contoso ', 'contoso'],
    ['https://dev.azure.com/contoso/project/_git/repository', 'contoso'],
    ['https://contoso.visualstudio.com/project', 'contoso'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(azureDevOpsOrganizationSchema.parse(input)).toBe(expected);
  });

  it.each([
    'http://dev.azure.com/contoso',
    'https://example.com/contoso',
    'https://contoso.visualstudio.com.evil.example/project',
    'contoso/path',
  ])('rejects untrusted input %s', (input) => {
    expect(azureDevOpsOrganizationSchema.safeParse(input).success).toBe(false);
  });
});
