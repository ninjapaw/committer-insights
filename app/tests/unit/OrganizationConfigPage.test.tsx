import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrganizationConfigPage } from '../../src/pages/OrganizationConfigPage';

vi.mock('../../src/auth/get-token', () => ({
  getPortalApiToken: vi.fn().mockResolvedValue('local-capability'),
}));

afterEach(() => vi.unstubAllGlobals());

describe('OrganizationConfigPage', () => {
  it('lists and auto-selects a sole discovered organization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          organizations: [
            { id: 'organization-id', name: 'ninjapaws', url: 'https://dev.azure.com/ninjapaws' },
          ],
        }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrganizationConfigPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('option', { name: 'ninjapaws' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Organization name or URL')).toHaveValue('ninjapaws'),
    );
  });
});
