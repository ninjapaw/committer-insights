import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingPage } from '../../src/pages/LandingPage';
import { MemoryRouter } from 'react-router-dom';

describe('LandingPage', () => {
  it('renders the title, no-PAT statement, and primary action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Active Committer Portal' })).toBeInTheDocument();
    expect(
      screen.getByText(/does not ask for an Azure DevOps personal access token/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Azure DevOps' })).toBeInTheDocument();
  });
});
