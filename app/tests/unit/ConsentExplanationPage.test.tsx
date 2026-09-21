import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsentExplanationPage } from '../../src/pages/ConsentExplanationPage';
import { MemoryRouter } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';

const pca = new PublicClientApplication({ auth: { clientId: 'test-client-id' } });

describe('ConsentExplanationPage', () => {
  it('disables continue until the checkbox is checked', () => {
    render(
      <MsalProvider instance={pca}>
        <MemoryRouter>
          <ConsentExplanationPage />
        </MemoryRouter>
      </MsalProvider>,
    );
    expect(screen.getByRole('button', { name: 'Continue to Microsoft' })).toBeDisabled();
  });
});
