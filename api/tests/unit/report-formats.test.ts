import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage, PDFDict, PDFName, PDFString } from 'pdf-lib';
import { generateExecutivePdf } from '../../src/exports/pdf-report.js';
import { generateStandaloneHtml } from '../../src/exports/standalone-html.js';
import type { StoredReport } from '../../src/reports/report-store.js';
import {
  exportFormats,
  formatReportDateTime,
  resolveReportTimeZone,
  repositoryWebUrl,
  solutionPricingRows,
  providerReport,
  type ExportFormat,
} from '@ninjapaw/contracts';
import { generateReportExport } from '../../src/exports/report-export.js';
import { generateCsv } from '../../src/exports/csv-report.js';
import { buildCioBrief, cioAiReviewBrief } from '@ninjapaw/contracts';

const report: StoredReport = {
  reportId: 'report-id',
  provider: 'combined',
  subject: 'combined-report',
  organization: 'multiple',
  plans: ['combined'],
  generatedAt: '2026-09-23T10:00:00.000Z',
  sourceApiVersion: 'multiple',
  azureDevOpsCommitters: [],
  gitHubCommitters: [],
  sourceStatuses: [
    {
      provider: 'github',
      subject: '<unsafe>',
      status: 'skipped',
      committerCount: 0,
      reason: 'Not accessible',
      remediation: 'Grant read access',
      scope: 'Default branch, last 90 days',
    },
  ],
  executiveSummary: {
    requestedSources: 1,
    includedSources: 0,
    skippedSources: 1,
    azureIdentityRecords: 0,
    gitHubIdentityRecords: 0,
    uniqueProviderIdentities: 0,
  },
  warnings: [],
};

describe('standalone report formats', () => {
  it('exports service scenario inputs and calculations without treating them as provider billing', async () => {
    const input: StoredReport = {
      ...report,
      insights: {
        repositories: [],
        billing: [],
        checks: [],
        azureServiceEstimates: [
          {
            organization: 'example',
            inputs: { basicUsers: 12, basicFreeUsers: 5, testPlanUsers: 3, artifactGiB: 100 },
          },
        ],
      },
    };
    expect(providerReport(input, 'github').insights?.azureServiceEstimates).toBeUndefined();
    expect(providerReport(input, 'azure-devops').insights?.azureServiceEstimates).toEqual(
      input.insights?.azureServiceEstimates,
    );
    for (const text of [generateCsv(input), generateStandaloneHtml(input)]) {
      for (const expected of [
        'Basic + Test Plans',
        '$42.00',
        '$156.00',
        '$106.00',
        'User-entered what-if',
        'Quantity required',
      ])
        expect(text).toContain(expected);
    }
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(input);
      const text = draw.mock.calls.map(([value]) => value).join(' ');
      for (const expected of [
        'Basic + Test Plans',
        '$42.00',
        '$156.00',
        '$106.00',
        'User-entered what-if',
      ])
        expect(text).toContain(expected);
    } finally {
      draw.mockRestore();
    }
  });
  it('presents pricing once per provider and retains detailed evidence in expandable sections', () => {
    const html = generateStandaloneHtml({
      ...report,
      insights: { repositories: [], billing: [], checks: [] },
    });
    expect(html.match(/<h3>Solution pricing totals<\/h3>/g)).toHaveLength(2);
    expect(html).toContain('id="azure-devops-billing-evidence"');
    expect(html).toContain('<summary>Reported billing usage (0 rows)</summary>');
    expect(html).toContain('<summary>Collection evidence (0 rows)</summary>');
    expect(html).toContain('Evidence-based recommendations');
  });
  it('preserves GitHub billing snapshots and charges separately in every export and provider view', async () => {
    const input: StoredReport = {
      ...report,
      insights: {
        repositories: [],
        billing: [],
        checks: [],
        githubBilling: [
          {
            source: 'synthetic-billing-org',
            scope: 'organization',
            dataset: 'code-security',
            period: 'Current snapshot',
            collectedAt: report.generatedAt,
            sourceUrl:
              'https://api.github.com/orgs/synthetic-billing-org/settings/billing/advanced-security',
            apiVersion: '2026-03-10',
            status: 'partial',
            coverage: 'Current security snapshot, not activity counts',
            warnings: ['Incomplete identity list'],
            providerCount: 12,
            repositoryCount: 1,
            repositories: [
              {
                name: 'synthetic-billing-org/repo',
                providerCount: 12,
                identities: [
                  {
                    login: '<sample>',
                    lastPushedAt: '2026-09-20T10:00:00Z',
                    lastPushedEmail: 'synthetic@example.test',
                  },
                ],
              },
            ],
            usage: [
              {
                product: 'Actions',
                sku: 'linux',
                unit: 'minutes',
                quantity: 100,
                pricePerUnit: 0.01,
                grossUsd: 1,
                discountUsd: 0.4,
                netUsd: 0.6,
              },
            ],
          },
        ],
      },
    };
    expect(providerReport(input, 'azure-devops').insights?.githubBilling).toBeUndefined();
    expect(providerReport(input, 'github').insights?.githubBilling?.[0]?.providerCount).toBe(12);
    const csv = generateCsv(input);
    const html = generateStandaloneHtml(input);
    for (const text of [csv, html]) {
      expect(text).toContain('synthetic@example.test');
      expect(text).toContain('Incomplete identity list');
      expect(text).toContain('2026-03-10');
      expect(text).toContain('Do not add organizations');
    }
    expect(html).toContain('&lt;sample&gt;');
    expect(html).not.toContain('<sample>');
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(input);
      const lines = draw.mock.calls.map(([line]) => line);
      expect(lines.filter((line) => line === 'GitHub billing snapshots')).toHaveLength(1);
      expect(lines.join(' ')).toContain('synthetic@example.test');
      expect(lines.join(' ')).toContain('Provider committer count: 12');
    } finally {
      draw.mockRestore();
    }
  });
  it('paginates branded PDFs with repeated table headers, bounded text and continuous page numbers', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      const input: StoredReport = {
        ...report,
        warnings: ['Long evidence ' + 'unbroken'.repeat(800)],
        insights: {
          repositories: [
            {
              provider: 'github',
              source: 'example',
              id: 'example/repo',
              name: 'example/repository',
              visibility: 'private',
              state: 'active',
              observedAt: report.generatedAt,
              features: [],
              activity: {
                status: 'complete',
                from: report.generatedAt,
                to: report.generatedAt,
                daily: Array.from({ length: 90 }, (_, index) => ({
                  date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
                  commits: index,
                })),
              },
            },
          ],
          billing: [],
          checks: [],
        },
      };
      const pdf = await PDFDocument.load(await generateExecutivePdf(input));
      expect(pdf.getTitle()).toBe('Committer Insights - Executive report');
      expect(pdf.getPageCount()).toBeGreaterThan(4);
      const text = draw.mock.calls.map(([value]) => value);
      expect(text.filter((value) => value === 'COMMITTER INSIGHTS')).toHaveLength(
        pdf.getPageCount(),
      );
      expect(text.filter((value) => value === 'Date UTC').length).toBeGreaterThan(1);
      expect(text).toContain('0');
      expect(text).toContain('89');
      for (let index = 1; index <= pdf.getPageCount(); index++) {
        expect(text.filter((value) => value === `${index} / ${pdf.getPageCount()}`)).toHaveLength(
          1,
        );
      }
      for (const [line, options] of draw.mock.calls) {
        const right = options!.x! + options!.font!.widthOfTextAtSize(line, options!.size!);
        expect(options!.x).toBeGreaterThanOrEqual(46);
        expect(right).toBeLessThanOrEqual(566.01);
        expect(
          options!.y === 30 || options!.y === 752 || (options!.y! >= 64 && options!.y! <= 710),
        ).toBe(true);
      }
    } finally {
      draw.mockRestore();
    }
  });
  it('uses the selected timezone for timestamps, including daylight saving, but not date-only values', () => {
    expect(formatReportDateTime('2026-09-24T02:00:00Z', 'America/Toronto')).toBe(
      'Sep 23, 2026, 22:00 America/Toronto',
    );
    expect(formatReportDateTime('2026-01-24T02:00:00Z', 'America/Toronto')).toBe(
      'Jan 23, 2026, 21:00 America/Toronto',
    );
    expect(formatReportDateTime('2026-09-24', 'America/Toronto')).toBe('Sep 24, 2026');
    expect(formatReportDateTime('2026-09-24T02:00:00Z', 'Invalid/Zone')).toBe(
      'Sep 24, 2026, 02:00 UTC',
    );
    expect(resolveReportTimeZone()).toBe('UTC');
    expect(resolveReportTimeZone('')).toBe('UTC');
    expect(resolveReportTimeZone('Invalid/Zone')).toBe('UTC');
  });
  it('exports safe repository hyperlinks for both providers, including PDF annotations', async () => {
    const linked: StoredReport = {
      ...report,
      gitHubCommitters: [
        {
          provider: 'github',
          login: 'person',
          repository: 'owner/contribution',
          commitCount: 1,
          lastCommitAt: report.generatedAt,
          collectedAt: report.generatedAt,
          sourceApiVersion: 'test',
        },
      ],
      insights: {
        repositories: [
          { provider: 'github', source: 'owner', name: 'owner/repo' },
          { provider: 'azure-devops', source: 'example', project: 'My Project', name: 'Repo #1' },
          { provider: 'github', source: 'owner', name: 'owner/<img onerror="alert(1)">' },
          { provider: 'azure-devops', source: 'example', name: 'missing-project' },
        ].map((repository, index) => ({
          ...repository,
          provider: repository.provider as 'github' | 'azure-devops',
          id: String(index),
          visibility: 'private',
          state: 'active',
          features: [],
          observedAt: report.generatedAt,
          activity: {
            status: 'complete',
            from: report.generatedAt,
            to: report.generatedAt,
            daily: [],
          },
        })),
        billing: [],
        checks: [],
      },
    };
    const html = generateStandaloneHtml(linked);
    for (const url of [
      'https://github.com/owner/repo',
      'https://github.com/owner/contribution',
      'https://dev.azure.com/example/My%20Project/_git/Repo%20%231',
    ]) {
      expect(html).toContain(`href="${url}" target="_blank" rel="noopener noreferrer"`);
    }
    expect(html).not.toContain('<img');
    expect(html).toContain('owner/&lt;img onerror=&quot;alert(1)&quot;&gt;</a>');
    expect(html).toContain('<td>missing-project</td>');
    const pdf = await PDFDocument.load(await generateExecutivePdf(linked));
    const urls = pdf.getPages().flatMap((page) =>
      (page.node.Annots()?.asArray() ?? []).map((reference) => {
        const annotation = pdf.context.lookup(reference, PDFDict);
        return annotation
          .lookup(PDFName.of('A'), PDFDict)
          .lookup(PDFName.of('URI'), PDFString)
          .decodeText();
      }),
    );
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://github.com/owner/repo',
        'https://github.com/owner/contribution',
        'https://dev.azure.com/example/My%20Project/_git/Repo%20%231',
      ]),
    );
    expect(urls.some((url) => url.includes('missing-project'))).toBe(false);
  });
  it('builds repository links on fixed provider hosts with encoded path segments', () => {
    expect(repositoryWebUrl({ provider: 'github', source: 'example', name: 'owner/repo' })).toBe(
      'https://github.com/owner/repo',
    );
    expect(repositoryWebUrl({ provider: 'github', source: 'owner', name: 'repo' })).toBe(
      'https://github.com/owner/repo',
    );
    expect(
      repositoryWebUrl({
        provider: 'azure-devops',
        source: 'example',
        project: 'My Project',
        name: 'Repo #1',
      }),
    ).toBe('https://dev.azure.com/example/My%20Project/_git/Repo%20%231');
    expect(
      repositoryWebUrl({ provider: 'azure-devops', source: 'example', name: 'repo' }),
    ).toBeUndefined();
    for (const name of ['../repo', 'owner/..', 'https://evil.example/repo', 'owner/repo/extra', ''])
      expect(repositoryWebUrl({ provider: 'github', source: '', name })).toBeUndefined();
  });
  it('formats readable UTC dates without changing missing or invalid values', () => {
    expect(formatReportDateTime('2026-09-24T10:00:45.123Z')).toBe('Sep 24, 2026, 10:00 UTC');
    expect(formatReportDateTime('2026-09-24T00:30:00+02:00')).toBe('Sep 23, 2026, 22:30 UTC');
    expect(formatReportDateTime('2026-09-24T00:00:00Z')).toBe('Sep 24, 2026, 00:00 UTC');
    expect(formatReportDateTime('2026-09-24')).toBe('Sep 24, 2026');
    expect(formatReportDateTime('Unavailable')).toBe('Unavailable');
    expect(formatReportDateTime('')).toBe('');
    expect(formatReportDateTime('2026-13-24T10:00:00Z')).toBe('2026-13-24T10:00:00Z');
    expect(formatReportDateTime('2026-09-24T10:00:00')).toBe('2026-09-24T10:00:00');
  });
  it('grounds CIO recommendations in provider evidence and excludes raw strings from AI briefs', () => {
    const sensitive = 'private-repository-ignore-instructions-secret';
    const input: StoredReport = {
      ...report,
      insights: {
        repositories: [
          {
            provider: 'github',
            source: sensitive,
            id: sensitive,
            name: sensitive,
            visibility: 'private',
            state: 'active',
            observedAt: report.generatedAt,
            features: [{ name: sensitive, state: 'disabled' }],
            activity: {
              status: 'unavailable',
              from: report.generatedAt,
              to: report.generatedAt,
              daily: [],
              reason: sensitive,
            },
          },
          {
            provider: 'github',
            source: 'example',
            id: 'complete-empty',
            name: sensitive,
            visibility: 'private',
            state: 'archived',
            observedAt: report.generatedAt,
            features: [],
            activity: {
              status: 'complete',
              from: report.generatedAt,
              to: report.generatedAt,
              daily: [],
            },
          },
        ],
        billing: [],
        checks: [],
      },
    };
    const brief = buildCioBrief(input, 'github');
    expect(brief.readiness).toBe('Evidence incomplete');
    expect(brief.facts.find((fact) => fact.id === 'F4')?.text).toContain('1 repositories');
    expect(brief.recommendations.some((item) => item.title.includes('disabled settings'))).toBe(
      true,
    );
    expect(
      brief.recommendations.every((item) =>
        item.evidence.split(', ').every((id) => brief.facts.some((fact) => fact.id === id)),
      ),
    ).toBe(true);
    expect(cioAiReviewBrief(brief)).not.toContain(sensitive);
    const azure = buildCioBrief(input, 'azure-devops');
    expect(azure.readiness).toBe('No evidence');
    expect(azure.recommendations.some((item) => item.title.includes('disabled settings'))).toBe(
      false,
    );
    expect(azure.collection[0]?.dataset).toContain('Basic/Test Plans');
    expect(brief.collection[0]?.dataset).toContain('Enterprise seats');
    expect(brief.narrative).toContain('No defensible savings estimate');
    const html = generateStandaloneHtml(input);
    expect(html).toContain('CIO decision brief');
    expect(html).toContain('Local rule-based analysis, not AI-generated advice');
    expect(html).toContain('Recommended collection');
    const csv = generateCsv(input);
    expect(csv).toContain('cio-decision-summary');
    expect(csv).toContain('cio-recommendations');
    expect(csv).toContain('recommended-collection');
  });
  it('isolates provider data and derives summaries without copying combined counts', () => {
    const mixed: StoredReport = {
      ...report,
      sourceStatuses: [
        { provider: 'azure-devops', subject: 'azure-only', status: 'included', committerCount: 3 },
        { provider: 'github', subject: 'github-only', status: 'skipped', committerCount: 0 },
      ],
      providerSummaries: [
        {
          provider: 'azure-devops',
          displayName: 'Azure DevOps',
          sourceLabel: 'Organizations',
          measurement: 'Estimates',
          apiVersion: 'test',
          methodology: 'test',
          includedSources: 1,
          skippedSources: 0,
          identityRecords: 3,
          uniqueIdentities: 2,
        },
      ],
      insights: {
        repositories: [],
        billing: [
          {
            provider: 'github',
            source: 'github-only',
            date: '2026-09-23',
            product: 'Actions',
            sku: 'test',
            quantity: 1,
            unit: 'minutes',
            grossUsd: 1,
            discountUsd: 0,
            netUsd: 1,
          },
        ],
        checks: [
          {
            provider: 'github',
            source: 'github-only',
            dataset: 'Billing',
            status: 'unavailable',
            detail: 'Denied',
          },
        ],
      },
    };
    const azure = providerReport(mixed, 'azure-devops');
    expect(azure.executiveSummary).toMatchObject({
      includedSources: 1,
      skippedSources: 0,
      uniqueProviderIdentities: 2,
      azureIdentityRecords: 3,
      gitHubIdentityRecords: 0,
    });
    expect(azure.sourceStatuses?.map((item) => item.subject)).toEqual(['azure-only']);
    expect(azure.insights).toEqual({ repositories: [], billing: [], checks: [] });
    const github = providerReport(mixed, 'github');
    expect(github.executiveSummary).toMatchObject({
      includedSources: 0,
      skippedSources: 1,
      uniqueProviderIdentities: 0,
    });
    expect(github.insights?.billing).toHaveLength(1);
    expect(github.insights?.checks).toHaveLength(1);
    expect(mixed.sourceStatuses).toHaveLength(2);
  });
  it('totals solutions without adding overlapping identity counts or unrelated plans', async () => {
    const estimates = [
      {
        provider: 'azure-devops' as const,
        solution: 'codeSecurity' as const,
        count: 10,
        unitPriceUsd: 30,
        estimatedMonthlyCostUsd: 300,
      },
      {
        provider: 'azure-devops' as const,
        solution: 'secretProtection' as const,
        count: 8,
        unitPriceUsd: 19,
        estimatedMonthlyCostUsd: 152,
      },
      {
        provider: 'github' as const,
        solution: 'codeSecurity' as const,
        count: 5,
        unitPriceUsd: 30,
        estimatedMonthlyCostUsd: 150,
      },
      {
        provider: 'github' as const,
        solution: 'secretProtection' as const,
        count: 5,
        unitPriceUsd: 19,
        estimatedMonthlyCostUsd: 95,
      },
      {
        provider: 'github' as const,
        solution: 'enterprise' as const,
        count: 5,
        unitPriceUsd: 21,
        estimatedMonthlyCostUsd: 105,
      },
    ].map((item) => ({
      ...item,
      label: item.solution,
      basis: 'Test scenario',
      source: 'Test price',
    }));
    const rows = solutionPricingRows(estimates);
    expect(rows).toHaveLength(7);
    expect(rows[5]).toMatchObject({
      provider: 'Azure DevOps',
      quantity: '10 Code Security; 8 Secret Protection',
      monthlyUsd: 452,
      annualizedUsd: 5424,
    });
    expect(rows[6]).toMatchObject({ provider: 'GitHub', monthlyUsd: 245, annualizedUsd: 2940 });
    expect(rows.some((row) => row.provider === 'Azure DevOps + GitHub')).toBe(false);
    expect(solutionPricingRows(estimates.slice(0, 1))).toHaveLength(1);
    expect(solutionPricingRows([])).toEqual([]);
    expect(
      solutionPricingRows(estimates.map((item) => ({ ...item, solution: undefined }))),
    ).toHaveLength(5);
    const pricedReport = { ...report, costEstimates: estimates };
    const html = generateStandaloneHtml(pricedReport);
    expect(html).not.toContain('Combined GHAS subtotal across providers');
    expect(html).toContain('$452.00');
    expect(html).toContain('$2940.00');
    const csv = generateCsv(pricedReport);
    expect(csv).toContain('solution-pricing-total');
    expect(csv).toContain('annualizedCostUsd');
    expect(csv).toContain('5424');
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(pricedReport);
      const text = drawText.mock.calls.map(([value]) => value).join(' ');
      expect(text).not.toContain('Combined GHAS subtotal across providers');
      expect(text).toContain('$452.00');
      expect(text).toContain('$2940.00');
      expect(text).toContain('CIO decision brief');
      expect(text).toContain('FinOps and procurement');
    } finally {
      drawText.mockRestore();
    }
  });

  it.each([undefined, 'America/Toronto'])(
    'preserves evidence and date-only values with timezone %s in all downloads',
    async (timeZone) => {
      const zone = timeZone ?? 'UTC';
      const displayed = timeZone
        ? 'Sep 23, 2026, 06:00 America/Toronto'
        : 'Sep 23, 2026, 10:00 UTC';
      const enriched: StoredReport = {
        ...report,
        timeZone,
        insights: {
          repositories: [
            {
              provider: 'github',
              source: 'example',
              id: 'example/repo',
              name: '<repo>',
              visibility: 'private',
              state: 'active',
              observedAt: report.generatedAt,
              features: [{ name: 'Code Security', state: 'unknown' }],
              activity: {
                status: 'complete',
                from: report.generatedAt,
                to: report.generatedAt,
                daily: [{ date: '2026-09-23', commits: 3 }],
              },
            },
          ],
          billing: [
            {
              provider: 'github',
              source: 'example',
              date: '2026-09-23',
              product: 'Actions',
              sku: 'linux',
              quantity: 100,
              unit: 'minutes',
              grossUsd: 1,
              discountUsd: 0.2,
              netUsd: 0.8,
            },
          ],
          checks: [
            {
              provider: 'azure-devops',
              source: 'example',
              dataset: 'Security settings',
              status: 'unavailable',
              detail: 'Read permission missing',
            },
          ],
        },
      };
      const csv = generateCsv(enriched);
      for (const kind of [
        'repository-inventory',
        'security-settings',
        'daily-activity',
        'reported-billing-usage',
        'collection-evidence',
      ])
        expect(csv).toContain(kind);
      expect(csv).toContain('netUsd');
      expect(csv).toContain(report.generatedAt);
      expect(csv).not.toContain('Sep 23, 2026');
      expect(csv).toBe(generateCsv({ ...enriched, timeZone: undefined }));
      const html = generateStandaloneHtml(enriched);
      expect(html).toContain(displayed);
      expect(html).toContain(`Observed ${zone}`);
      expect(html).toContain('Date windows are UTC');
      expect(html).toContain('<td>Sep 23, 2026</td>');
      expect(html).not.toContain(`<td>${report.generatedAt}</td>`);
      expect(html).toContain('&lt;repo&gt;');
      expect(html).not.toContain('<repo>');
      expect(html).toContain('Read permission missing');
      const draw = vi.spyOn(PDFPage.prototype, 'drawText');
      try {
        await generateExecutivePdf(enriched);
        const text = draw.mock.calls.map(([line]) => line).join(' ');
        expect(text).toContain('Reported billing usage');
        expect(text).toContain(`Executive report generated ${displayed}`);
        expect(text).toContain(`Observed ${zone}: ${displayed}`);
        expect(text).not.toContain(report.generatedAt);
        expect(text).toContain('Net USD: 0.8');
        expect(text).toContain('Read permission missing');
      } finally {
        draw.mockRestore();
      }
    },
  );
  it.each(['azure-devops', 'github'] as const)(
    'keeps metadata, coverage, costs and warnings for %s CSV',
    (provider) => {
      const csv = generateCsv({
        ...report,
        provider,
        warnings: ['=unsafe warning'],
        costEstimates: [
          {
            provider,
            label: 'Planning scenario',
            count: 2,
            unitPriceUsd: 30,
            estimatedMonthlyCostUsd: 60,
            basis: 'Not an invoice',
            source: 'Published price',
          },
        ],
      });
      for (const rowType of [
        'report-metadata',
        'executive-summary',
        'source-status',
        'cost-estimate',
        'warning',
      ])
        expect(csv).toContain(rowType);
      expect(csv).toContain(report.generatedAt);
      expect(csv).toContain('Grant read access');
      expect(csv).toContain('countUnit');
      expect(csv).toContain("'=unsafe warning");
      expect(csv).toContain('summary and contribution counts overlap');
    },
  );

  it('renders Azure detail, warnings, unavailable legacy contributions and bounded PDF lines', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      const pdf = await generateExecutivePdf({
        ...report,
        warnings: [
          'Collection incomplete',
          String.fromCodePoint(0x4e2d, 0x1f600),
          'https://example.invalid/' + 'a'.repeat(400),
        ],
        azureDevOpsCommitters: [
          {
            provider: 'azure-devops',
            organization: 'example',
            displayName: 'Example Person',
            plan: 'codeSecurity',
            resultType: 'estimated',
            isEstimated: true,
            isLicensed: false,
            collectedAt: report.generatedAt,
            sourceApiVersion: '7.2-preview.3',
          },
        ],
        gitHubCommitters: [
          {
            provider: 'github',
            repository: 'example/one, example/two',
            login: 'legacy-user',
            commitCount: 3,
            lastCommitAt: report.generatedAt,
            collectedAt: report.generatedAt,
            sourceApiVersion: '2022-11-28',
          },
        ],
      });
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
      const lines = draw.mock.calls.map(([line]) => line);
      expect(lines.join(' ')).toContain('Report-wide warning: Collection incomplete');
      expect(lines.join(' ')).toContain('??');
      expect(lines.join(' ')).toContain('Example Person');
      expect(lines.join(' ')).toContain(
        'Organization: example; Plan: Code Security; Billing: Estimated',
      );
      expect(lines.join(' ')).toContain('Unknown repositories');
      for (const [line, options] of draw.mock.calls)
        expect(options!.font!.widthOfTextAtSize(line, options!.size!)).toBeLessThanOrEqual(520);
    } finally {
      draw.mockRestore();
    }
  });
  it('offers CSV, PDF and HTML only and rejects removed formats', async () => {
    expect(exportFormats).toEqual(['csv', 'pdf', 'html']);
    await expect(generateReportExport(report, 'xlsx' as ExportFormat)).rejects.toThrow(
      'Unsupported report format',
    );
  });
  it('has valid section targets and escapes report warnings', () => {
    const html = generateStandaloneHtml({
      ...report,
      executiveSummary: undefined,
      warnings: ['<script>unsafe</script>'],
    });
    for (const match of html.matchAll(/href="#([^"]+)"/g))
      expect(html).toContain(`id="${match[1]}"`);
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).toContain('Unknown does not mean free');
    expect(html).toContain('@media print');
    expect(html).not.toContain('<script>');
  });

  it('retains per-repository counts in HTML and CSV with unique CSV column names', () => {
    const populated: StoredReport = {
      ...report,
      gitHubCommitters: [
        {
          provider: 'github',
          login: 'example-user',
          repository: 'example/one, example/two',
          commitCount: 7,
          collectedAt: report.generatedAt,
          lastCommitAt: report.generatedAt,
          sourceApiVersion: '2022-11-28',
          contributions: [
            { repository: 'example/one', commitCount: 2, lastCommitAt: report.generatedAt },
            { repository: 'example/two', commitCount: 5, lastCommitAt: report.generatedAt },
          ],
        },
      ],
    };
    const html = generateStandaloneHtml(populated);
    expect(html).toContain('example/one</a></td><td>2');
    expect(html).toContain('example/two</a></td><td>5');
    const csv = generateCsv(populated);
    const headers = csv.split('\n')[0]!.split(',');
    expect(new Set(headers).size).toBe(headers.length);
    expect(csv.match(/repository-contribution/g)).toHaveLength(2);
  });
  it('retains distinct provider measurements in HTML, CSV and PDF', async () => {
    const withProviders: StoredReport = {
      ...report,
      providerSummaries: [
        {
          provider: 'azure-devops',
          displayName: 'Azure DevOps',
          sourceLabel: 'Organizations',
          measurement: 'Security estimate',
          apiVersion: '7.2-preview.3',
          methodology: 'Estimate methodology',
          includedSources: 1,
          skippedSources: 0,
          identityRecords: 2,
          uniqueIdentities: 1,
        },
        {
          provider: 'github',
          displayName: 'GitHub',
          sourceLabel: 'Repositories',
          measurement: 'Commit activity',
          apiVersion: '2022-11-28',
          methodology: 'Commit methodology',
          includedSources: 1,
          skippedSources: 1,
          identityRecords: 1,
          uniqueIdentities: 1,
          totalRepositories: 3,
          totalCommits: 6,
        },
      ],
      costEstimates: [
        {
          provider: 'azure-devops',
          label: 'Azure DevOps Advanced Security billable committers',
          count: 2,
          unitPriceUsd: 49,
          estimatedMonthlyCostUsd: 98,
          basis: 'Azure basis',
          source: 'Azure source',
        },
        {
          provider: 'github',
          label: 'GitHub Enterprise observed users',
          count: 1,
          unitPriceUsd: 21,
          estimatedMonthlyCostUsd: 21,
          basis: 'GitHub Enterprise basis',
          source: 'GitHub Enterprise source',
        },
      ],
    };
    for (const content of [generateCsv(withProviders), generateStandaloneHtml(withProviders)]) {
      expect(content).toContain('Security estimate');
      expect(content).toContain('Commit activity');
      expect(content).toContain('Estimate methodology');
      expect(content).toContain('Commit methodology');
      expect(content).toMatch(/Estimated billing|cost-estimate/);
      expect(content).toContain('Azure DevOps Advanced Security billable committers');
      expect(content).toContain('GitHub Enterprise observed users');
    }
    expect(generateCsv(withProviders)).toContain('provider-summary');
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(withProviders);
      const lines = draw.mock.calls.map(([line]) => line);
      expect(lines).toEqual(
        expect.arrayContaining([
          'Azure DevOps',
          'GitHub',
          'Estimated billing',
          'Azure DevOps Advanced Security billable committers: 2 x $49.00 = $98.00 / month',
          'Commits: 6',
          'Repositories: 3',
          'Measurement: Security estimate',
          'Measurement: Commit activity',
        ]),
      );
      expect(lines.filter((line) => line.startsWith('Commits:'))).toHaveLength(1);
    } finally {
      draw.mockRestore();
    }
  });

  const contentTypes = {
    csv: 'text/csv; charset=utf-8',
    pdf: 'application/pdf',
    html: 'text/html; charset=utf-8',
  };
  it.each(exportFormats)('dispatches %s through the shared export service', async (format) => {
    const output = await generateReportExport(report, format);
    expect(output.filename).toMatch(new RegExp(`\\.${format}$`));
    expect(output.body.length).toBeGreaterThan(0);
    expect(output.contentType).toBe(contentTypes[format]);
    expect(typeof output.body === 'string').toBe(format === 'csv' || format === 'html');
  });

  it('includes skipped sources and remediation in combined CSV', () => {
    const csv = generateCsv(report);
    expect(csv).toContain('skipped');
    expect(csv).toContain('Grant read access');
    expect(csv).toContain('Default branch, last 90 days');
    expect(csv).not.toContain('identityId');
    expect(csv).not.toContain('userPrincipalName');
  });

  it('escapes standalone HTML and includes remediation', () => {
    const html = generateStandaloneHtml(report);
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).not.toContain('<unsafe>');
    expect(html).toContain('Grant read access');
    expect(html).toContain('Default branch, last 90 days');
    expect(html).not.toContain('<script');
  });

  it('produces a valid PDF document', async () => {
    const pdf = await generateExecutivePdf(report);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(document.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('paginates long PDF source status lists', async () => {
    const pdf = await generateExecutivePdf({
      ...report,
      sourceStatuses: Array.from({ length: 60 }, (_, index) => ({
        ...report.sourceStatuses![0]!,
        subject: `octocat/repo-${index}`,
      })),
    });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });

  it('includes both providers but redacts sensitive identifier values in executive CSV and HTML', () => {
    const populated: StoredReport = {
      ...report,
      azureDevOpsCommitters: [
        {
          provider: 'azure-devops',
          organization: 'contoso',
          displayName: '<script>alert("x")</script>',
          plan: 'codeSecurity',
          resultType: 'estimated',
          userPrincipalName: 'private-upn@example.invalid',
          cuid: 'private-cuid',
          identityId: 'private-identity',
          isEstimated: true,
          isLicensed: false,
          collectedAt: report.generatedAt,
          sourceApiVersion: '7.2-preview.3',
        },
        {
          provider: 'azure-devops',
          organization: 'contoso',
          displayName: '<script>alert("x")</script>',
          plan: 'secretProtection',
          resultType: 'estimated',
          userPrincipalName: 'private-upn@example.invalid',
          cuid: 'private-cuid',
          identityId: 'private-identity',
          isEstimated: true,
          isLicensed: false,
          collectedAt: report.generatedAt,
          sourceApiVersion: '7.2-preview.3',
        },
      ],
      gitHubCommitters: [
        {
          provider: 'github',
          repository: 'octocat/example',
          login: 'octocat',
          displayName: '=formula',
          userId: 'private-github-id',
          profileUrl: 'https://github.com/private-profile',
          commitCount: 2,
          lastCommitAt: report.generatedAt,
          collectedAt: report.generatedAt,
          sourceApiVersion: '2022-11-28',
        },
      ],
    };
    for (const output of [generateCsv(populated), generateStandaloneHtml(populated)]) {
      expect(output).toContain('contoso');
      expect(output).toContain('octocat/example');
      expect(output).toContain('Code Security, Secret Protection');
      expect(output).toMatch(/Billing status|billableCommitter/);
      expect(output).toContain('Estimated');
      expect(output).toContain('Unknown');
      for (const secret of [
        'private-upn',
        'private-cuid',
        'private-identity',
        'private-github-id',
        'private-profile',
      ])
        expect(output).not.toContain(secret);
    }
    const html = generateStandaloneHtml(populated);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html.match(/&lt;script&gt;alert/g) ?? []).toHaveLength(1);
    expect(html).not.toMatch(/<script|<iframe|<link\b|\ssrc=/i);
    const csv = generateCsv({
      ...populated,
      sourceStatuses: [{ ...report.sourceStatuses![0]!, remediation: '=formula' }],
    });
    expect(csv).toContain("'=formula");
  });
});
