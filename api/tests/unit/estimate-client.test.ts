import { describe, expect, it } from 'vitest';
import {
  assertValidOrganization,
  buildMeterUsageEstimateUrl,
  AzureDevOpsAdapterError,
} from '../../src/adapters/azure-devops/estimate-client.js';

describe('assertValidOrganization', () => {
  it('accepts a typical organization name', () => {
    expect(assertValidOrganization('contoso')).toBe('contoso');
    expect(assertValidOrganization('contoso-eng')).toBe('contoso-eng');
  });

  it.each([
    'contoso.com',
    'contoso/../secrets',
    'contoso@evil.com',
    'https://evil.com',
    '',
    'a'.repeat(51),
    '-contoso',
    'contoso-',
  ])('rejects unsafe or invalid organization %s', (value) => {
    expect(() => assertValidOrganization(value)).toThrow(AzureDevOpsAdapterError);
  });
});

describe('buildMeterUsageEstimateUrl', () => {
  it('builds a URL only from trusted constants and the validated organization', () => {
    const url = buildMeterUsageEstimateUrl('contoso', 'codeSecurity');
    expect(url.origin).toBe('https://advsec.dev.azure.com');
    expect(url.pathname).toBe('/contoso/_apis/management/meterUsageEstimate/default');
    expect(url.searchParams.get('plan')).toBe('codeSecurity');
    expect(url.searchParams.get('api-version')).toBe('7.2-preview.3');
  });

  it('never allows the organization value to introduce a new host', () => {
    expect(() => buildMeterUsageEstimateUrl('contoso.evil.com', 'all')).toThrow();
  });
});
