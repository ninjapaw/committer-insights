import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsentExplanationPage } from '../../src/pages/ConsentExplanationPage';
import { MemoryRouter } from 'react-router-dom';

describe('ConsentExplanationPage', () => {
  it('disables continue until the checkbox is checked', () => {
    render(
      <MemoryRouter>
        <ConsentExplanationPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
