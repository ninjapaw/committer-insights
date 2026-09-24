import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Report } from '@ninjapaw/contracts';
import { ResultsDashboardPage } from '../../src/pages/ResultsDashboardPage';
import { ReportInsightsPanel } from '../../src/components/ReportInsightsPanel';
import { CioBriefPanel } from '../../src/components/CioBriefPanel';

vi.mock('../../src/auth/get-token', () => ({
  getPortalApiToken: vi.fn().mockResolvedValue('test-capability'),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Results dashboard', () => {
  it('renders a supplied static report without calling the local API or authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const report: Report = {
      reportId: 'synthetic-empty',
      provider: 'github',
      subject: 'Synthetic demo',
      organization: 'synthetic-org',
      plans: [],
      generatedAt: '2026-09-24T12:00:00.000Z',
      sourceApiVersion: 'synthetic',
      warnings: [],
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/reports/synthetic-empty']}>
          <Routes>
            <Route
              path="/reports/:reportId"
              element={
                <ResultsDashboardPage
                  staticReport={report}
                  staticExportBase="/demo/downloads/"
                  sourceHref="/demo/"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Results dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demo reports' })).toHaveAttribute('href', '/demo/');
    expect(screen.queryByRole('link', { name: 'Change sources' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('labels local CIO analysis and copies only the aggregate AI brief with clipboard fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const report: Report = {
      reportId: 'private-id',
      provider: 'github',
      subject: 'private-company',
      organization: 'private-org',
      plans: [],
      generatedAt: '2026-09-24T12:00:00Z',
      sourceApiVersion: 'test',
      warnings: ['private-warning'],
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
    };
    render(<CioBriefPanel report={report} />);
    expect(
      screen.getByText(/Local rule-based analysis, not AI-generated advice/),
    ).toBeInTheDocument();
    expect(screen.getByText('Decision readiness: No evidence')).toBeInTheDocument();
    const recommendation = within(screen.getByRole('region', { name: 'CIO action priorities' }))
      .getByText('Reconcile modeled costs with entitlements and billing')
      .closest('details')!;
    expect(recommendation).not.toHaveAttribute('open');
    fireEvent.click(
      within(recommendation).getByText('Reconcile modeled costs with entitlements and billing'),
    );
    expect(recommendation).toHaveAttribute('open');
    expect(within(recommendation).getByText('F5')).toBeVisible();
    expect(within(recommendation).getByText(/Obtain Enterprise seat assignments/)).toBeVisible();
    fireEvent.click(screen.getByText('AI review brief', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy AI review brief' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Nothing was sent to an AI service'),
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain('private-');
    expect(writeText.mock.calls[0]?.[0]).toContain('Cite fact IDs');
    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy AI review brief' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard unavailable'),
    );
    expect(screen.getByLabelText('Aggregate AI review brief')).toHaveValue(
      writeText.mock.calls[0]?.[0],
    );
  });
  it.each([undefined, 'America/Toronto'])(
    'filters UTC activity while displaying observations in timezone %s',
    async (timeZone) => {
      const report: Report = {
        reportId: 'insights',
        timeZone,
        provider: 'github',
        subject: 'example',
        organization: 'example',
        plans: [],
        generatedAt: '2026-09-24T12:00:00Z',
        sourceApiVersion: 'test',
        warnings: [],
        azureDevOpsCommitters: [],
        gitHubCommitters: [],
        insights: {
          repositories: [
            {
              provider: 'github',
              source: 'example',
              id: 'example/repo',
              name: 'example/repo',
              visibility: 'private',
              state: 'active',
              observedAt: '2026-09-24T12:00:00Z',
              features: [{ name: 'Code Security', state: 'unknown' }],
              activity: {
                status: 'complete',
                from: '2026-08-26T00:00:00Z',
                to: '2026-09-24T12:00:00Z',
                daily: [
                  { date: '2026-09-01', commits: 5 },
                  { date: '2026-09-23', commits: 2 },
                ],
              },
            },
          ],
          billing: [],
          checks: [
            {
              provider: 'github',
              source: 'example',
              dataset: 'Billing usage',
              status: 'unavailable',
              detail: 'No billing access',
            },
          ],
        },
      };
      render(<ReportInsightsPanel report={report} />);
      expect(screen.getByText('Observed window commits').previousSibling).toHaveTextContent('7');
      fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '7' } });
      expect(screen.getByText('Observed window commits').previousSibling).toHaveTextContent('2');
      fireEvent.click(screen.getByLabelText('Repositories'));
      expect(await screen.findByText('Code Security: unknown')).toBeInTheDocument();
      const repositoryLink = screen.getByRole('link', { name: 'example/repo' });
      expect(repositoryLink).toHaveAttribute('href', 'https://github.com/example/repo');
      expect(repositoryLink).toHaveAttribute('target', '_blank');
      expect(repositoryLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(
        screen.getByText(
          timeZone ? 'Sep 24, 2026, 08:00 America/Toronto' : 'Sep 24, 2026, 12:00 UTC',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: `Observed ${timeZone ?? 'UTC'}` }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Sep 18, 2026 to Sep 24, 2026 UTC/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Repository search'), {
        target: { value: 'missing' },
      });
      expect(await screen.findByText('No matching repositories.')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Billing'));
      expect(screen.getByText(/not proof of zero cost/)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Evidence'));
      expect(screen.getByText('No billing access')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
      fireEvent.change(screen.getByLabelText('From (UTC)'), { target: { value: '2026-09-25' } });
      expect(screen.getByRole('alert')).toHaveTextContent('Choose dates');
    },
  );
  it.each([undefined, 'America/Toronto'])(
    'offers full-report downloads and consistent detail in timezone %s',
    async (timeZone) => {
      const generatedAt = '2026-09-23T10:00:00.000Z';
      const displayed = timeZone
        ? 'Sep 23, 2026, 06:00 America/Toronto'
        : 'Sep 23, 2026, 10:00 UTC';
      const report: Report = {
        reportId: 'test-report',
        timeZone,
        provider: 'combined',
        subject: 'example',
        organization: 'example',
        plans: [],
        generatedAt,
        sourceApiVersion: '2022-11-28',
        warnings: [],
        executiveSummary: {
          requestedSources: 1,
          includedSources: 1,
          skippedSources: 0,
          azureIdentityRecords: 0,
          gitHubIdentityRecords: 12,
          uniqueProviderIdentities: 12,
        },
        costEstimates: [
          {
            provider: 'github',
            solution: 'codeSecurity',
            label: 'GitHub Code Security',
            count: 12,
            unitPriceUsd: 30,
            estimatedMonthlyCostUsd: 360,
            basis: 'Observed identities',
            source: 'Test price',
          },
          {
            provider: 'github',
            solution: 'secretProtection',
            label: 'GitHub Secret Protection',
            count: 12,
            unitPriceUsd: 19,
            estimatedMonthlyCostUsd: 228,
            basis: 'Observed identities',
            source: 'Test price',
          },
        ],
        sourceStatuses: [
          {
            provider: 'azure-devops',
            subject: 'azure-organization-only',
            status: 'included',
            committerCount: 1,
          },
          {
            provider: 'github',
            subject: 'github-organization-only',
            status: 'included',
            committerCount: 12,
          },
        ],
        providerSummaries: [
          {
            provider: 'azure-devops',
            displayName: 'Azure DevOps',
            sourceLabel: 'Organizations',
            measurement: 'Azure estimates only',
            apiVersion: 'test',
            methodology: 'Azure methodology',
            includedSources: 1,
            skippedSources: 0,
            identityRecords: 1,
            uniqueIdentities: 1,
          },
          {
            provider: 'github',
            displayName: 'GitHub',
            sourceLabel: 'Organizations',
            measurement: 'GitHub activity only',
            apiVersion: 'test',
            methodology: 'GitHub methodology',
            includedSources: 1,
            skippedSources: 0,
            identityRecords: 12,
            uniqueIdentities: 12,
          },
        ],
        azureDevOpsCommitters: [
          {
            provider: 'azure-devops',
            organization: 'azure-organization-only',
            identityId: 'azure-user',
            displayName: 'Azure Person Only',
            plan: 'codeSecurity',
            resultType: 'estimated',
            isEstimated: true,
            isLicensed: false,
            collectedAt: generatedAt,
            sourceApiVersion: 'test',
          },
        ],
        gitHubCommitters: Array.from({ length: 12 }, (_, index) => ({
          provider: 'github',
          login: `person-${index}`,
          repository: `example/repo-${index}`,
          commitCount: 1,
          lastCommitAt: generatedAt,
          collectedAt: generatedAt,
          sourceApiVersion: '2022-11-28',
        })),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(report)),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/reports/test-report']}>
            <Routes>
              <Route path="/reports/:reportId" element={<ResultsDashboardPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await screen.findByRole('tab', { name: 'Azure DevOps', selected: true });
      expect(screen.getByTitle(generatedAt)).toHaveTextContent(displayed);
      expect(screen.getByTitle(generatedAt)).toHaveAttribute('datetime', generatedAt);
      const navigation = screen.getByRole('navigation', { name: 'Azure DevOps report sections' });
      expect(within(navigation).getAllByRole('link')).toHaveLength(7);
      for (const link of within(navigation).getAllByRole('link')) {
        const target = document.querySelector(link.getAttribute('href')!);
        expect(target).not.toBeNull();
        expect(target).toHaveAttribute('tabindex', '-1');
      }
      expect(screen.getByRole('region', { name: 'Estimated billing' })).toHaveTextContent(
        'Pricing totals unavailable',
      );
      await screen.findByText('Azure Person Only');
      expect(screen.getByText('Azure estimates only')).toBeInTheDocument();
      expect(screen.queryByText('GitHub activity only')).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'GitHub committers' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'GitHub Enterprise' }));
      expect(
        screen.getByRole('navigation', { name: 'GitHub Enterprise report sections' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Recommendations', exact: true })).toContainElement(
        screen.getByRole('region', { name: 'CIO decision brief' }),
      );
      const table = await screen.findByRole('region', { name: 'GitHub committers' });
      expect(within(table).getAllByText(displayed)).toHaveLength(10);
      expect(
        within(table).getByRole('columnheader', { name: `Last commit (${timeZone ?? 'UTC'})` }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Azure Person Only')).not.toBeInTheDocument();
      expect(screen.queryByText('azure-organization-only')).not.toBeInTheDocument();
      expect(screen.getByText('GitHub activity only')).toBeInTheDocument();
      expect(screen.getByText(/All providers are included in every download/)).toBeInTheDocument();
      for (const sectionName of ['Executive summary', 'Estimated billing']) {
        const section = screen.getByRole('region', { name: sectionName });
        expect(
          within(section).getByText('GHAS subtotal: Code Security + Secret Protection'),
        ).toBeInTheDocument();
        expect(within(section).getByText('$588.00')).toBeInTheDocument();
        expect(within(section).getByText('$7056.00')).toBeInTheDocument();
        expect(
          within(section).getByText('12 Code Security; 12 Secret Protection'),
        ).toBeInTheDocument();
      }
      expect(
        screen.getAllByRole('button', { name: /^Download / }).map((button) => button.textContent),
      ).toEqual(['Download CSV', 'Download PDF', 'Download HTML']);
      expect(screen.queryByRole('button', { name: /Excel/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Downloads include the complete report/)).toBeInTheDocument();
      fireEvent.click(within(table).getByRole('button', { name: 'Next' }));
      expect(within(table).getByText('person-11')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Search committers or repositories'), {
        target: { value: 'repo-11' },
      });
      await waitFor(() => expect(within(table).getByText('Page 1 of 1')).toBeInTheDocument());
      expect(within(table).getByText('person-11')).toBeInTheDocument();
      expect(within(table).queryByText('person-10')).not.toBeInTheDocument();
      expect(screen.getByText('example/repo-11')).toBeInTheDocument();
      expect(screen.queryByText('example/repo-10')).not.toBeInTheDocument();
      expect(within(table).getByText('Unknown')).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole('tab', { name: 'GitHub Enterprise' }), {
        key: 'ArrowLeft',
      });
      expect(screen.getByRole('tab', { name: 'Azure DevOps', selected: true })).toHaveFocus();
      expect(screen.getByText('Azure Person Only')).toBeInTheDocument();
      expect(screen.getByLabelText('Search committers or repositories')).toHaveValue('');
      expect(screen.queryByRole('region', { name: 'GitHub committers' })).not.toBeInTheDocument();
    },
  );
});
