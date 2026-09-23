import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SourceStatus } from '@ninjapaw/contracts';
import { CombinedReportPage } from '../../src/pages/CombinedReportPage';
import { App } from '../../src/App';

vi.mock('../../src/auth/get-token', () => ({
  getPortalApiToken: vi.fn().mockResolvedValue('local-capability'),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ready: SourceStatus = {
  provider: 'github',
  subject: 'octocat/private',
  status: 'included',
  committerCount: 0,
};

function renderGitHubFlow(preflight: () => Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    switch (String(input)) {
      case '/api/auth/github/sign-in':
        return Response.json({ authenticated: true });
      case '/api/connections/github/repositories':
        return Response.json({
          repositories: [{ id: 'repo-id', name: 'octocat/private', private: true }],
        });
      case '/api/reports/combined/preflight':
        return preflight();
      case '/api/reports/combined':
        return Response.json({ reportId: 'created-report' });
      default:
        throw new Error(`Unexpected request: ${String(input)}`);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<CombinedReportPage />} />
          <Route
            path="/reports/:reportId"
            element={
              <>
                <h1>Created report</h1>
                <Link to="/">Change sources</Link>
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

async function selectGitHubSource() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'octocat/private (private)' });
  fireEvent.click(checkbox);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review report' })).toBeEnabled());
  return checkbox;
}

describe('CombinedReportPage', () => {
  it('accepts a normalized manual source when discovery is unavailable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      switch (String(input)) {
        case '/api/auth/github/sign-in':
          return Response.json({ authenticated: true });
        case '/api/connections/github/repositories':
          return Response.json({ message: 'Discovery unavailable.' }, { status: 503 });
        case '/api/reports/combined/preflight':
          return Response.json({ statuses: [ready] });
        default:
          throw new Error(`Unexpected request ${String(input)}`);
      }
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Discovery unavailable.');
    fireEvent.click(screen.getByText('Add by name or URL'));
    fireEvent.change(screen.getByLabelText('Repository name or URL'), {
      target: { value: 'https://github.com/octocat/private.git' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    expect(await screen.findByRole('checkbox', { name: 'octocat/private' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled(),
    );
    const requests = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const request = requests.find(([url]) => url === '/api/reports/combined/preflight');
    expect(JSON.parse(String(request?.[1].body))).toEqual({
      sources: [{ provider: 'github', repository: 'octocat/private', sinceDays: 90 }],
    });
  });

  it('walks from GitHub connection to selection, review, results and back without Azure sign-in', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      switch (String(input)) {
        case '/api/auth/github/sign-in':
          return Response.json({ viewer: { login: 'octocat' } });
        case '/api/connections/github/repositories':
          return Response.json({
            repositories: [{ id: 'repo-id', name: 'octocat/example', private: false }],
          });
        case '/api/reports/combined/preflight':
          return Response.json({ statuses: [{ ...ready, subject: 'octocat/example' }] });
        case '/api/reports/combined':
          return Response.json({ reportId: 'github-only' });
        case '/api/reports/github-only':
          return Response.json({
            reportId: 'github-only',
            provider: 'combined',
            azureDevOpsCommitters: [],
            gitHubCommitters: [],
            warnings: [],
            providerSummaries: [
              {
                provider: 'github',
                displayName: 'GitHub',
                sourceLabel: 'Repositories',
                measurement: 'Default-branch commit activity',
                apiVersion: '2022-11-28',
                methodology: 'Not a security billing estimate.',
                includedSources: 1,
                skippedSources: 0,
                identityRecords: 0,
                uniqueIdentities: 0,
                totalCommits: 0,
              },
            ],
          });
        default:
          throw new Error(`Unexpected route ${String(input)}`);
      }
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/connect/github']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use GitHub CLI account' }));
    const repo = await screen.findByRole('checkbox', { name: 'octocat/example' });
    fireEvent.click(repo);
    const review = screen.getByRole('button', { name: 'Review report' });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    const generate = screen.getByRole('button', { name: 'Generate report' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    expect(await screen.findByRole('heading', { name: 'Results dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Provider summary' })).toBeInTheDocument();
    expect(screen.getByText('Default-branch commit activity')).toBeInTheDocument();
    expect(screen.getByText(/Not a security billing estimate/)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Azure DevOps committers' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Change sources' }));
    expect(await screen.findByRole('checkbox', { name: 'octocat/example' })).toBeChecked();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/github/sign-in')).toHaveLength(
      1,
    );
    expect(
      fetchMock.mock.calls.some(([url]) => url === '/api/session' || url === '/api/auth/sign-in'),
    ).toBe(false);
  });

  it('locks source selection during preflight and submits the selected sources', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = renderGitHubFlow(() => pending);
    const checkbox = await selectGitHubSource();
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    const generate = screen.getByRole('button', { name: 'Generate report' });
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(screen.getByLabelText('Commit window')).toBeDisabled();
    expect(generate).toBeDisabled();
    await act(async () => {
      finish(Response.json({ statuses: [ready] }));
    });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    expect(await screen.findByRole('heading', { name: 'Created report' })).toBeInTheDocument();
    const requests = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const sourceRequest = {
      sources: [{ provider: 'github', repository: 'octocat/private', sinceDays: 90 }],
    };
    for (const path of ['/api/reports/combined/preflight', '/api/reports/combined']) {
      const request = requests.find(([url]) => url === path);
      expect(JSON.parse(String(request?.[1].body))).toEqual(sourceRequest);
    }
    fireEvent.click(screen.getByRole('link', { name: 'Change sources' }));
    expect(
      await screen.findByRole('checkbox', { name: 'octocat/private (private)' }),
    ).toBeChecked();
    expect(screen.getByRole('button', { name: 'GitHub connected' })).toBeDisabled();
    expect(requests.filter(([url]) => url === '/api/auth/github/sign-in')).toHaveLength(1);
  });

  it('invalidates preflight after changing a window or selected source', async () => {
    renderGitHubFlow(async () => Response.json({ statuses: [ready] }));
    const checkbox = await selectGitHubSource();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    const generate = screen.getByRole('button', { name: 'Generate report' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Commit window'), { target: { value: '30' } });
    expect(generate).toBeDisabled();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back to sources' }));
    fireEvent.click(checkbox);
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review report' })).toBeDisabled(),
    );
  });

  it('does not generate when every source is skipped', async () => {
    renderGitHubFlow(async () =>
      Response.json({
        statuses: [
          {
            ...ready,
            status: 'skipped',
            reason: 'Permission denied',
            remediation: 'Grant read access.',
          },
        ],
      }),
    );
    await selectGitHubSource();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    expect(await screen.findByText('Grant read access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  });

  it('clears an earlier successful preflight when a recheck fails', async () => {
    const preflight = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ statuses: [ready] }))
      .mockResolvedValueOnce(
        Response.json({ message: 'Permission check unavailable.' }, { status: 503 }),
      );
    renderGitHubFlow(preflight);
    await selectGitHubSource();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    const generate = screen.getByRole('button', { name: 'Generate report' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission check unavailable.');
    expect(generate).toBeDisabled();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });

  it('requires preflight and keeps skipped-source remediation visible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === '/api/auth/sign-in' || path === '/api/auth/github/sign-in') {
          return Response.json({ authenticated: true });
        }
        if (path === '/api/connections/azure-devops/organizations') {
          return Response.json({ organizations: [{ id: 'azure-id', name: 'contoso' }] });
        }
        if (path === '/api/connections/github/repositories') {
          return Response.json({
            repositories: [{ id: 'github-id', name: 'octocat/private', private: true }],
          });
        }
        if (path === '/api/reports/combined/preflight') {
          return Response.json({
            statuses: [
              {
                provider: 'azure-devops',
                subject: 'contoso',
                status: 'included',
                committerCount: 0,
              },
              {
                provider: 'github',
                subject: 'octocat/private',
                status: 'skipped',
                committerCount: 0,
                reason: 'Minimum read permission not met',
                remediation: 'Grant repository read access.',
              },
            ],
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Review report' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Azure CLI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'contoso' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'contoso' })).toBeChecked());
    fireEvent.click(await screen.findByRole('checkbox', { name: 'octocat/private (private)' }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'octocat/private (private)' })).toBeChecked(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    const generate = screen.getByRole('button', { name: 'Generate report' });

    expect(await screen.findByText('Grant repository read access.')).toBeInTheDocument();
    await waitFor(() => expect(generate).toBeEnabled());
    expect(screen.getByRole('checkbox', { name: 'All plans' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Code Security' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Secret Protection' })).toBeChecked();
  });
});
