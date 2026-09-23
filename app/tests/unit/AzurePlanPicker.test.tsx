import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AzureDevOpsPlan } from '@ninjapaw/contracts';
import { AzurePlanPicker } from '../../src/components/AzurePlanPicker';

function Harness() {
  const [plans, setPlans] = useState<AzureDevOpsPlan[]>(['codeSecurity']);
  return (
    <>
      <AzurePlanPicker plans={plans} onChange={setPlans} />
      <output>{JSON.stringify(plans)}</output>
    </>
  );
}

describe('Azure plan selection', () => {
  it('checks and disables individual plans for All, sending only the all value', () => {
    render(<Harness />);
    const all = screen.getByRole('checkbox', { name: 'All plans' });
    const code = screen.getByRole('checkbox', { name: 'Code Security' });
    const secrets = screen.getByRole('checkbox', { name: 'Secret Protection' });
    expect(code).toBeChecked();
    expect(secrets).not.toBeChecked();
    fireEvent.click(all);
    expect(code).toBeChecked();
    expect(secrets).toBeChecked();
    expect(code).toBeDisabled();
    expect(secrets).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('["all"]');
    fireEvent.click(all);
    expect(code).toBeEnabled();
    expect(secrets).toBeEnabled();
    expect(code).toBeChecked();
    expect(secrets).toBeChecked();
    fireEvent.click(secrets);
    expect(screen.getByRole('status')).toHaveTextContent('["codeSecurity"]');
  });
});
