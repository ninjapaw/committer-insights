import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from '../../src/pages/SignInPage';
import {
  cancelDeviceSignIn,
  connectAzure,
  getDeviceSignIn,
  startDeviceSignIn,
} from '../../src/providers/azure-devops';

vi.mock('../../src/providers/azure-devops', () => ({
  connectAzure: vi.fn(),
  startDeviceSignIn: vi.fn(),
  getDeviceSignIn: vi.fn(),
  cancelDeviceSignIn: vi.fn(),
  disconnectAzure: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const pending = {
  id: 'test-attempt',
  status: 'pending' as const,
  challenge: {
    userCode: 'TEST-CODE',
    verificationUri: 'https://microsoft.com/devicelogin',
    expiresOnTimestamp: Date.now() + 60000,
  },
};

const selection = {
  id: pending.id,
  status: 'authenticated' as const,
  account: { username: 'selected@example.test', tenantId: 'test-tenant' },
};

function mockSuccess() {
  vi.mocked(getDeviceSignIn).mockResolvedValue(selection);
}

function chooseDevice() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a device code' }));
}

async function beginDevice() {
  vi.mocked(startDeviceSignIn).mockResolvedValue({ id: pending.id, status: 'pending' });
  vi.mocked(getDeviceSignIn).mockResolvedValue(pending);
  vi.mocked(cancelDeviceSignIn).mockResolvedValue({ id: pending.id, status: 'canceled' });
  const view = renderPage('/sign-in');
  chooseDevice();
  await screen.findByLabelText('Device sign-in code');
  return view;
}

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SignInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe('SignInPage', () => {
  it('shows restart guidance when the local session is invalid', () => {
    renderPage('/sign-in?reason=session');
    expect(screen.getByRole('heading', { name: 'Local session expired' })).toBeInTheDocument();
    expect(screen.getByText(/use the window opened by the executable/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with Microsoft' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with a device code' }),
    ).not.toBeInTheDocument();
  });

  it('shows provider sign-in when the local session is valid', () => {
    renderPage('/sign-in');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a device code' })).toBeVisible();
    expect(screen.queryByText('Other sign-in options')).not.toBeInTheDocument();
    expect(screen.queryByText(/Azure CLI/)).not.toBeInTheDocument();
  });

  it('keeps browser sign-in independent from device-code requests', async () => {
    vi.mocked(connectAzure).mockResolvedValue(selection);
    mockSuccess();
    const { client } = renderPage('/sign-in');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));
    await waitFor(() =>
      expect(client.getQueryData(['provider-connection', 'Azure DevOps'])).toBe(true),
    );
    expect(startDeviceSignIn).not.toHaveBeenCalled();
    expect(client.getQueryData(['microsoft-account'])).toEqual(selection.account);
    expect(screen.queryByRole('button', { name: 'Use this account' })).not.toBeInTheDocument();
  });

  it('shows a code and verification link then marks the provider connected', async () => {
    const { client } = await beginDevice();
    expect(screen.getByLabelText('Device sign-in code')).toHaveTextContent('TEST-CODE');
    expect(screen.getByRole('link', { name: 'Microsoft device sign-in' })).toHaveAttribute(
      'href',
      pending.challenge.verificationUri,
    );
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeDisabled();
    expect(connectAzure).not.toHaveBeenCalled();
    mockSuccess();
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['microsoft-device-sign-in'] });
    });
    await waitFor(() =>
      expect(client.getQueryData(['provider-connection', 'Azure DevOps'])).toBe(true),
    );
    expect(screen.queryByLabelText('Device sign-in code')).not.toBeInTheDocument();
  });

  it('cancels, hides the code, and allows another attempt', async () => {
    await beginDevice();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel device sign-in' }));
    await screen.findByText('Device sign-in canceled.');
    expect(cancelDeviceSignIn).toHaveBeenCalledWith(pending.id);
    expect(screen.queryByLabelText('Device sign-in code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a device code' })).toBeEnabled();
  });

  it('hides expired codes and offers retry', async () => {
    const { client } = await beginDevice();
    vi.mocked(getDeviceSignIn).mockResolvedValue({ id: pending.id, status: 'expired' });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['microsoft-device-sign-in'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Device code expired');
    expect(screen.queryByLabelText('Device sign-in code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a device code' })).toBeEnabled();
  });

  it('shows start failures and keeps browser sign-in available', async () => {
    vi.mocked(startDeviceSignIn).mockRejectedValue(new Error('Publisher client ID missing'));
    renderPage('/sign-in');
    chooseDevice();
    expect(await screen.findByRole('alert')).toHaveTextContent('Publisher client ID missing');
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeEnabled();
  });

  it('cancels pending sign-in when leaving the screen', async () => {
    const { unmount } = await beginDevice();
    unmount();
    await waitFor(() => expect(cancelDeviceSignIn).toHaveBeenCalledWith(pending.id));
  });

  it('cancels an attempt whose start response arrives after unmount', async () => {
    let finish!: (state: typeof pending) => void;
    vi.mocked(startDeviceSignIn).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(cancelDeviceSignIn).mockResolvedValue({ id: pending.id, status: 'canceled' });
    const { unmount } = renderPage('/sign-in');
    chooseDevice();
    await waitFor(() => expect(startDeviceSignIn).toHaveBeenCalled());
    unmount();
    await act(async () => {
      finish(pending);
    });
    await waitFor(() => expect(cancelDeviceSignIn).toHaveBeenCalledWith(pending.id));
  });
});
