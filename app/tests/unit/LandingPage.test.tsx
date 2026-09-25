import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingPage } from '../../src/pages/LandingPage';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../../src/layouts/AppLayout';

describe('LandingPage', () => {
  it('renders the title, no-PAT statement, and primary action', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Developer Usage Insights' })).toBeInTheDocument();
    expect(
      screen.getByText(/does not ask for an Azure DevOps personal access token/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Azure DevOps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Build combined report' })).not.toBeInTheDocument();
  });

  it('identifies the app as an independent community project', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <LandingPage />
        </AppLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Independent community project');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Not affiliated with, sponsored by, or endorsed by Microsoft or GitHub',
    );
    expect(screen.getByRole('link', { name: 'Disclaimer' })).toHaveAttribute(
      'href',
      expect.stringContaining('DISCLAIMER.md'),
    );
  });
});
