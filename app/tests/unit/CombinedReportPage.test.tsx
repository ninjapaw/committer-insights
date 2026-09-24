import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SourceStatus } from '@ninjapaw/contracts';
import { CombinedReportPage } from '../../src/pages/CombinedReportPage';
import { App } from '../../src/App';
import { GitHubSignIn } from '../../src/components/GitHubSignIn';

vi.mock('../../src/auth/get-token', () => ({
  getPortalApiToken: vi.fn().mockResolvedValue('local-capability'),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ready: SourceStatus = {
  provider: 'github',
  subject: 'octocat',
  status: 'included',
  committerCount: 0,
};

function renderGitHubFlow(preflight: () => Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    switch (String(input)) {
      case '/api/auth/github/sign-in':
        return Response.json({ authenticated: true });
      case '/api/connections/github/targets':
        return Response.json({
          targets: [{ id: 'organization:1', name: 'octocat', targetType: 'organization' }],
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
  fireEvent.click(screen.getByText('Saved accounts'));
  fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'octocat (organization)' });
  fireEvent.click(checkbox);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review report' })).toBeEnabled());
  return checkbox;
}

describe('CombinedReportPage', () => {
  it('previews service scenarios and sends validated quantities without enabling billing collection', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === '/api/reports/combined/preflight')
        return Response.json({
          statuses: [{ ...ready, provider: 'azure-devops', subject: 'example' }],
        });
      if (String(input) === '/api/reports/combined')
        return Response.json({ reportId: 'scenario-report' });
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(['report-draft'], {
      azureSelected: ['example'],
      githubSelected: [],
      githubTargetTypes: {},
      plans: ['all'],
      sinceDays: 90,
      includeBilling: false,
      includeAzureBilling: false,
      includeAzureBillingDetails: false,
      billingDate: '',
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Other Azure DevOps services: what-if quantities'));
    fireEvent.change(screen.getByLabelText('Basic users without included licenses'), {
      target: { value: '12' },
    });
    expect(await screen.findByRole('cell', { name: '$42.00', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Paid Basic + Test Plans users'), {
      target: { value: '-1' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('nonnegative');
    expect(screen.getByRole('button', { name: 'Check access' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Paid Basic + Test Plans users'), {
      target: { value: '3' },
    });
    expect(await screen.findByRole('cell', { name: '$156.00', exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Free Basic seats allocated (0-5)'), {
      target: { value: '' },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Free Basic seats allocated (0-5)'), {
      target: { value: '5' },
    });
    await screen.findByRole('cell', { name: '$42.00', exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/reports/combined')).toBe(true),
    );
    const requests = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const request = requests.find(([path]) => path === '/api/reports/combined');
    const source = JSON.parse(String(request?.[1].body)).sources[0];
    expect(source.serviceScenario).toEqual({ basicUsers: 12, basicFreeUsers: 5, testPlanUsers: 3 });
    expect(source.includeAzureBilling).toBeUndefined();
  });
  it.each(['browser'] as const)(
    'prompts for GitHub %s login and connects after approval',
    async (mode) => {
      const onConnected = vi.fn();
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path === `/api/auth/github/${mode}`)
          return Response.json({ id: 'browser-attempt', status: 'pending' });
        if (path === '/api/auth/github/browser/browser-attempt' && init?.method !== 'DELETE')
          return Response.json({ id: 'browser-attempt', status: 'authenticated' });
        if (path === '/api/auth/github/sign-in')
          return Response.json({ viewer: { login: 'new-account' } });
        throw new Error(`Unexpected request: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      render(
        <QueryClientProvider client={client}>
          <GitHubSignIn onConnected={onConnected} />
        </QueryClientProvider>,
      );
      expect(
        within(screen.getByRole('button', { name: 'Sign in with GitHub' }).parentElement!)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Sign in with GitHub']);
      expect(screen.getByText('Saved accounts').closest('details')).not.toHaveAttribute('open');
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Sign in with GitHub',
        }),
      );
      await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
      expect(client.getQueryData(['github-account'])).toEqual({ login: 'new-account' });
      expect(
        fetchMock.mock.calls.some(([path]) => String(path) === '/api/auth/github/accounts'),
      ).toBe(false);
    },
  );

  it('starts a fresh browser login from Change account instead of opening the saved-account picker', async () => {
    const onChanging = vi.fn();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === '/api/auth/github/sign-out')
        return Response.json({ authenticated: false });
      return Response.json({
        id: 'change-attempt',
        status: init?.method === 'DELETE' ? 'canceled' : 'pending',
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(['github-account'], { login: 'previous-account' });
    render(
      <QueryClientProvider client={client}>
        <GitHubSignIn connected onConnected={vi.fn()} onChanging={onChanging} />
      </QueryClientProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Sign in with a device code' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change account' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/github/browser')).toBe(true),
    );
    expect(onChanging).toHaveBeenCalledOnce();
    expect(client.getQueryData(['github-account'])).toBeNull();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/github/sign-out');
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/github/accounts')).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'GitHub account' })).not.toBeInTheDocument();
  });

  it('shows a GitHub device code and cancels without connecting a saved account', async () => {
    const onConnected = vi.fn();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Response.json({ id: 'attempt', status: 'canceled' });
      return Response.json({
        id: 'attempt',
        status: 'pending',
        challenge: {
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubSignIn onConnected={onConnected} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    expect(await screen.findByLabelText('GitHub sign-in code')).toHaveTextContent('ABCD-1234');
    expect(screen.getByRole('link', { name: 'GitHub device sign-in' })).toHaveAttribute(
      'href',
      'https://github.com/login/device',
    );
    expect(
      screen.queryByRole('button', { name: 'Sign in with a device code' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel GitHub sign-in' }));
    await screen.findByText('GitHub sign-in canceled.');
    expect(onConnected).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('selects and changes GitHub accounts without retaining stale GitHub sources or clearing Azure sources', async () => {
    let account = '';
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/auth/github/accounts')
        return Response.json({
          accounts: [
            { login: 'first', active: true, available: true },
            { login: 'second', active: false, available: true },
            { login: 'expired', active: false, available: false },
          ],
        });
      if (path === '/api/auth/github/sign-in') {
        account = JSON.parse(String(init?.body)).login;
        return Response.json({ authenticated: true, viewer: { login: account } });
      }
      if (path === '/api/auth/github/sign-out') return Response.json({ authenticated: false });
      if (path === '/api/connections/github/targets')
        return Response.json({ targets: [{ name: `${account}-org`, targetType: 'organization' }] });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['report-draft'], {
      azureSelected: ['kept-azure'],
      githubSelected: [],
      githubTargetTypes: {},
      plans: ['all'],
      sinceDays: 90,
      includeBilling: false,
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const github = within(screen.getByRole('region', { name: 'GitHub', exact: true }));
    fireEvent.click(github.getByText('Saved accounts'));
    fireEvent.click(github.getByRole('button', { name: 'Select GitHub account' }));
    const select = await github.findByRole('combobox', { name: 'GitHub account' });
    await github.findByRole('option', { name: 'second' });
    expect(github.getByRole('option', { name: 'expired (sign-in required)' })).toBeDisabled();
    fireEvent.change(select, { target: { value: 'second' } });
    fireEvent.click(github.getByRole('button', { name: 'Connect selected account' }));
    await github.findByText('second', { exact: true });
    fireEvent.click(await github.findByRole('checkbox', { name: 'second-org (organization)' }));
    fireEvent.click(github.getByRole('button', { name: 'Select GitHub account' }));
    await github.findByRole('combobox', { name: 'GitHub account' });
    expect(client.getQueryData(['report-draft'])).toMatchObject({
      azureSelected: ['kept-azure'],
      githubSelected: [],
      githubTargetTypes: {},
    });
    expect(
      github.queryByRole('checkbox', { name: 'second-org (organization)' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(github.getByRole('button', { name: 'Connect selected account' })).toBeEnabled(),
    );
    fireEvent.click(github.getByRole('button', { name: 'Connect selected account' }));
    await github.findByText('first', { exact: true });
    await github.findByRole('checkbox', { name: 'first-org (organization)' });
    expect(
      fetchMock.mock.calls.filter(([path]) => path === '/api/auth/github/sign-out'),
    ).toHaveLength(1);
    expect(client.getQueryData(['report-draft'])).toMatchObject({
      azureSelected: ['kept-azure'],
      githubSelected: [],
    });
  });

  it('supports refreshing an empty or failed GitHub account list and cancelling selection', async () => {
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        refreshes++;
        if (refreshes === 1)
          return Response.json({ message: 'Account listing unavailable' }, { status: 503 });
        return Response.json({ accounts: [] });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Saved accounts'));
    fireEvent.click(screen.getByRole('button', { name: 'Select GitHub account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account listing unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh accounts' }));
    await screen.findByText(/No saved GitHub accounts found/);
    expect(screen.getByRole('button', { name: 'Connect selected account' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.getByRole('button', { name: 'Connect GitHub CLI' })).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: 'GitHub account' })).not.toBeInTheDocument();
  });

  it('shows the signed-in account and clears only Azure selections when changing it', async () => {
    let signIns = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === '/api/auth/sign-in') {
        signIns++;
        return Response.json({
          id: `attempt-${signIns}`,
          status: 'authenticated',
          account: { username: `account-${signIns}@example.test`, tenantId: 'test-tenant' },
        });
      }
      if (path === '/api/auth/sign-out') return Response.json({ authenticated: false });
      if (path === '/api/connections/azure-devops/organizations')
        return Response.json({ organizations: [{ id: `org-${signIns}`, name: `org-${signIns}` }] });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['report-draft'], {
      azureSelected: [],
      githubSelected: ['kept-github'],
      githubTargetTypes: { 'kept-github': 'organization' },
      plans: ['all'],
      sinceDays: 90,
      includeBilling: false,
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CombinedReportPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));
    await screen.findByText('account-1@example.test');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'org-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change account' }));
    await screen.findByText('account-2@example.test');
    await screen.findByRole('checkbox', { name: 'org-2' });
    expect(screen.queryByRole('checkbox', { name: 'org-1' })).not.toBeInTheDocument();
    expect(client.getQueryData(['report-draft'])).toMatchObject({
      azureSelected: [],
      githubSelected: ['kept-github'],
    });
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/sign-out')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Use this account' })).not.toBeInTheDocument();
  });

  it('accepts a normalized manual source when discovery is unavailable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      switch (String(input)) {
        case '/api/auth/github/sign-in':
          return Response.json({ authenticated: true });
        case '/api/connections/github/targets':
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GitHub source discovery is unavailable. Add an organization or enterprise manually.',
    );
    fireEvent.click(screen.getByText('Add by name or URL'));
    fireEvent.change(screen.getByLabelText('Organization, enterprise, or URL'), {
      target: { value: 'https://github.com/enterprises/octo-enterprise' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    expect(await screen.findByRole('checkbox', { name: 'octo-enterprise' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled(),
    );
    const requests = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const request = requests.find(([url]) => url === '/api/reports/combined/preflight');
    expect(JSON.parse(String(request?.[1].body))).toEqual({
      sources: [
        {
          provider: 'github',
          targetType: 'enterprise',
          target: 'octo-enterprise',
          sinceDays: 90,
        },
      ],
    });
  });

  it('walks from GitHub connection to selection, review, results and back without Azure sign-in', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      switch (String(input)) {
        case '/api/auth/github/sign-in':
          return Response.json({ viewer: { login: 'octocat' } });
        case '/api/connections/github/targets':
          return Response.json({
            targets: [{ id: 'organization:1', name: 'octocat', targetType: 'organization' }],
          });
        case '/api/reports/combined/preflight':
          return Response.json({ statuses: [{ ...ready, subject: 'octocat' }] });
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
                sourceLabel: 'Organizations and enterprises',
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
    expect(screen.getByRole('button', { name: 'Connect GitHub CLI' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'I understand the GitHub access being requested and want to continue.',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
    const target = await screen.findByRole('checkbox', { name: 'octocat (organization)' });
    fireEvent.click(target);
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
    expect(await screen.findByRole('checkbox', { name: 'octocat (organization)' })).toBeChecked();
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
    expect(screen.getByText('Change account')).toBeDisabled();
    expect(screen.getByLabelText('Activity window (UTC)')).toBeDisabled();
    expect(generate).toBeDisabled();
    await act(async () => {
      finish(Response.json({ statuses: [ready] }));
    });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    expect(await screen.findByRole('heading', { name: 'Created report' })).toBeInTheDocument();
    const requests = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const sourceRequest = {
      sources: [
        { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
      ],
    };
    for (const path of ['/api/reports/combined/preflight', '/api/reports/combined']) {
      const request = requests.find(([url]) => url === path);
      expect(JSON.parse(String(request?.[1].body))).toEqual(sourceRequest);
    }
    fireEvent.click(screen.getByRole('link', { name: 'Change sources' }));
    expect(await screen.findByRole('checkbox', { name: 'octocat (organization)' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Change account' })).toBeEnabled();
    expect(requests.filter(([url]) => url === '/api/auth/github/sign-in')).toHaveLength(1);
  });

  it('invalidates preflight after changing a window or selected source', async () => {
    renderGitHubFlow(async () => Response.json({ statuses: [ready] }));
    const checkbox = await selectGitHubSource();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    const generate = screen.getByRole('button', { name: 'Generate report' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Activity window (UTC)'), { target: { value: '30' } });
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
        if (path === '/api/auth/sign-in' || path === '/api/auth/device-code/test-attempt') {
          return Response.json({
            id: 'test-attempt',
            status: 'authenticated',
            account: { username: 'selected@example.test', tenantId: 'test-tenant' },
          });
        }
        if (path === '/api/auth/github/sign-in') {
          return Response.json({ authenticated: true });
        }
        if (path === '/api/connections/azure-devops/organizations') {
          return Response.json({ organizations: [{ id: 'azure-id', name: 'contoso' }] });
        }
        if (path === '/api/connections/github/targets') {
          return Response.json({
            targets: [{ id: 'organization:1', name: 'octocat', targetType: 'organization' }],
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
                subject: 'octocat',
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
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub CLI' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'contoso' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'contoso' })).toBeChecked());
    fireEvent.click(await screen.findByRole('checkbox', { name: 'octocat (organization)' }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'octocat (organization)' })).toBeChecked(),
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
