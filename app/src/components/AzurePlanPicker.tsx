import { azurePlanLabels, type AzureDevOpsPlan } from '@ninjapaw/contracts';

const individualPlans = ['codeSecurity', 'secretProtection'] as const;

export function AzurePlanPicker({
  plans,
  onChange,
  disabled = false,
}: {
  plans: AzureDevOpsPlan[];
  onChange: (plans: AzureDevOpsPlan[]) => void;
  disabled?: boolean;
}): JSX.Element {
  const all = plans.includes('all');
  return (
    <fieldset className="plan-picker" disabled={disabled}>
      <legend>Azure DevOps plans</legend>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={() => onChange(all ? [...individualPlans] : ['all'])}
        />
        {azurePlanLabels.all}
      </label>
      {individualPlans.map((plan) => (
        <label key={plan} className={all ? 'plan-picker__included' : undefined}>
          <input
            type="checkbox"
            checked={all || plans.includes(plan)}
            disabled={all}
            onChange={() =>
              onChange(
                plans.includes(plan) ? plans.filter((value) => value !== plan) : [...plans, plan],
              )
            }
          />
          {azurePlanLabels[plan]}
        </label>
      ))}
    </fieldset>
  );
}
