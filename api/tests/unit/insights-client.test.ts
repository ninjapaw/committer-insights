import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyInsights,
  activityInWindow,
  uniqueRepositories,
  reportingWindow,
} from '@ninjapaw/contracts';
import {
  collectGitHubBilling,
  fetchGitHubRepositoryInsight,
} from '../../src/adapters/github/insights-client.js';
import { collectAzureRepositoryInsights } from '../../src/adapters/azure-devops/insights-client.js';
import { saveReport } from '../../src/reports/report-store.js';
import { parseLaunchOptions } from '../../src/cli.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('read-only reporting evidence', () => {
  it('accepts launch timezone options with precedence over environment and UTC defaults', () => {
    vi.stubEnv('COMMITTER_INSIGHTS_TIMEZONE', undefined);
    expect(parseLaunchOptions([])).toEqual({ help: false, timeZone: 'UTC' });
    vi.stubEnv('COMMITTER_INSIGHTS_TIMEZONE', 'Europe/London');
    expect(parseLaunchOptions([]).timeZone).toBe('Europe/London');
    expect(parseLaunchOptions(['--timezone', 'America/Toronto']).timeZone).toBe('America/Toronto');
    expect(parseLaunchOptions(['--timezone=UTC']).timeZone).toBe('UTC');
    expect(parseLaunchOptions(['--help']).help).toBe(true);
    expect(parseLaunchOptions(['-h']).help).toBe(true);
    for (const args of [
      ['--timezone'],
      ['--timezone='],
      ['--timezone', 'Invalid/Zone'],
      ['--unknown'],
      ['America/Toronto'],
    ]) {
      expect(() => parseLaunchOptions(args)).toThrow();
    }
    expect(process.env.COMMITTER_INSIGHTS_TIMEZONE).toBe('Europe/London');
  });
  it('captures the runtime timezone per report and defaults invalid or missing settings to UTC', () => {
    const input = {
      provider: 'github' as const,
      subject: 'example',
      organization: 'example',
      plans: [],
      sourceApiVersion: 'test',
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
      warnings: [],
    };
    vi.stubEnv('COMMITTER_INSIGHTS_TIMEZONE', undefined);
    expect(saveReport(input).timeZone).toBe('UTC');
    vi.stubEnv('COMMITTER_INSIGHTS_TIMEZONE', 'America/Toronto');
    const report = saveReport(input);
    expect(report.timeZone).toBe('America/Toronto');
    expect(report.generatedAt).toMatch(/Z$/);
    vi.stubEnv('COMMITTER_INSIGHTS_TIMEZONE', 'Invalid/Zone');
    expect(saveReport(input).timeZone).toBe('UTC');
    expect(report.timeZone).toBe('America/Toronto');
  });
  it('keeps absent security flags unknown, including when another flag is disabled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        id: 1,
        private: true,
        security_and_analysis: { code_security: { status: 'disabled' } },
      }),
    );
    const row = await fetchGitHubRepositoryInsight(
      'example/repo',
      'example',
      30,
      'test-token',
      fetchImpl,
    );
    expect(row.features.find((feature) => feature.name === 'Code Security')?.state).toBe(
      'disabled',
    );
    expect(row.features.find((feature) => feature.name === 'Secret scanning')?.state).toBe(
      'unknown',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(JSON.stringify(row)).not.toContain('test-token');
  });

  it('does not request billing without opt-in and never translates denial into zero cost', async () => {
    const insights = emptyInsights();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    const source = {
      provider: 'github' as const,
      targetType: 'organization' as const,
      target: 'example',
      sinceDays: 30,
    };
    await collectGitHubBilling(source, 'token', insights, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(insights.checks[0]?.status).toBe('not-requested');
    await collectGitHubBilling({ ...source, includeBilling: true }, 'token', insights, fetchImpl);
    expect(insights.checks[1]?.status).toBe('unavailable');
    expect(insights.billing).toEqual([]);
  });

  it('filters billing across year boundaries and preserves units, discounts and net charges', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-05T12:00:00Z'));
    const insights = emptyInsights();
    const item = {
      date: '2025-12-31T00:00:00Z',
      product: 'Actions',
      sku: 'linux',
      quantity: 10,
      unitType: 'minutes',
      grossAmount: 1,
      discountAmount: 0.4,
      netAmount: 0.6,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ usageItems: [item, { ...item, date: '2025-01-01' }] }))
      .mockResolvedValueOnce(Response.json({ usageItems: [{ ...item, date: '2026-01-02' }] }));
    await collectGitHubBilling(
      {
        provider: 'github',
        targetType: 'organization',
        target: 'example',
        sinceDays: 7,
        includeBilling: true,
      },
      'token',
      insights,
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(insights.billing).toHaveLength(2);
    expect(insights.billing[0]).toMatchObject({
      unit: 'minutes',
      grossUsd: 1,
      discountUsd: 0.4,
      netUsd: 0.6,
    });
    expect(insights.checks[0]?.status).toBe('complete');
  });

  it('collects Azure settings and daily history without retaining identities or code', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T12:00:00Z'));
    const id = '11111111-1111-4111-8111-111111111111';
    const insights = emptyInsights();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          reposEnablementStatus: [
            {
              repositoryId: id,
              codeSecurityFeatures: { codeSecurityEnabled: true, codeQLEnabled: false },
              secretProtectionFeatures: { secretProtectionEnabled: false, blockPushes: null },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id,
              name: 'repo',
              defaultBranch: 'refs/heads/main',
              project: { id, name: 'project' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              committer: { date: '2026-09-23T12:00:00Z', email: 'private@example.com' },
              comment: 'sensitive',
            },
          ],
        }),
      );
    await collectAzureRepositoryInsights('example', 7, 'token', insights, fetchImpl);
    const row = insights.repositories[0]!;
    expect(row.features).toContainEqual({ name: 'Code Security', state: 'enabled' });
    expect(row.features).toContainEqual({ name: 'Push protection', state: 'unknown' });
    expect(row.activity.daily).toEqual([{ date: '2026-09-23', commits: 1 }]);
    expect(JSON.stringify(insights)).not.toMatch(/private@example|sensitive/);
    for (const call of fetchImpl.mock.calls)
      expect(call[1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(activityInWindow(row, '2026-09-18', '2026-09-24')).toBe(1);
    expect(activityInWindow(row, '2026-09-01', '2026-09-24')).toBeUndefined();
    expect(
      uniqueRepositories([
        row,
        { ...row, source: 'example', activity: { ...row.activity, status: 'unavailable' } },
      ]),
    ).toHaveLength(1);
  });

  it('reports denied inventory as unavailable rather than an empty successful inventory', async () => {
    const insights = emptyInsights();
    await collectAzureRepositoryInsights(
      'example',
      7,
      'token',
      insights,
      vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    );
    expect(insights.repositories).toEqual([]);
    expect(insights.checks.every((check) => check.status === 'unavailable')).toBe(true);
  });

  it('retains readable Azure enablement when Git inventory is denied', async () => {
    const insights = emptyInsights();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          reposEnablementStatus: [
            {
              repositoryId: '11111111-1111-4111-8111-111111111111',
              codeSecurityFeatures: { codeSecurityEnabled: true },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    await collectAzureRepositoryInsights('example', 7, 'token', insights, fetchImpl);
    expect(insights.repositories[0]?.features).toContainEqual({
      name: 'Code Security',
      state: 'enabled',
    });
    expect(insights.repositories[0]?.activity.status).toBe('unavailable');
  });

  it('omits cost scenarios when source activity is partial', () => {
    const report = saveReport({
      provider: 'github',
      subject: 'example',
      organization: 'example',
      plans: [],
      sourceApiVersion: 'test',
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
      warnings: [],
      costEstimates: [
        {
          provider: 'github',
          label: 'scenario',
          count: 0,
          unitPriceUsd: 30,
          estimatedMonthlyCostUsd: 0,
          basis: '',
          source: '',
        },
      ],
      insights: {
        ...emptyInsights(),
        checks: [
          {
            provider: 'github',
            source: 'example',
            dataset: 'Repository activity and settings',
            status: 'partial',
            detail: 'Denied repository',
          },
        ],
      },
    });
    expect(report.costEstimates).toEqual([]);
    expect(report.warnings.join(' ')).toContain('not zero usage');
    expect(reportingWindow(7, new Date('2026-09-24T12:00:00Z')).from).toBe(
      '2026-09-18T00:00:00.000Z',
    );
  });
});
