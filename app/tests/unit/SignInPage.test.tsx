import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from '../../src/pages/SignInPage';

vi.mock('../../src/providers/azure-devops', () => ({
  connectAzure: vi.fn(),
}));

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SignInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SignInPage', () => {
  it('shows restart guidance when the local session is invalid', () => {
    renderPage('/sign-in?reason=session');
    expect(screen.getByRole('heading', { name: 'Local session expired' })).toBeInTheDocument();
    expect(screen.getByText(/use the window opened by the executable/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with Microsoft' }),
    ).not.toBeInTheDocument();
  });

  it('shows provider sign-in when the local session is valid', () => {
    renderPage('/sign-in');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
  });
});
