import {
  azureServiceFields,
  azureServicePricingNote,
  azureServicePricingTables,
  azureServiceScenarioSchema,
  type AzureServiceEstimate,
  type AzureServiceScenario,
} from '@ninjapaw/contracts';
import { ReportTable } from './ReportTable';

export type AzureServiceInputs = Partial<Record<keyof AzureServiceScenario, string>>;
export function parseServiceInputs(inputs: AzureServiceInputs = {}) {
  return azureServiceScenarioSchema.safeParse(
    Object.fromEntries(
      Object.entries(inputs)
        .filter(([key, value]) => key === 'basicFreeUsers' || value?.trim() !== '')
        .map(([key, value]) => [key, value?.trim() ? Number(value) : NaN]),
    ),
  );
}

export function AzureServicePricing({
  estimates,
}: {
  estimates: AzureServiceEstimate[];
}): JSX.Element {
  const table = azureServicePricingTables(estimates)[0];
  return (
    <>
      <h2>Other Azure DevOps services</h2>
      <details>
        <summary>What-if pricing assumptions</summary>
        <p>{azureServicePricingNote}</p>
      </details>
      {table && (
        <ReportTable
          data={table.rows}
          globalFilter=""
          columns={table.columns.slice(0, 8).map((header, index) => ({
            id: String(index),
            header,
            accessorFn: (row: (string | number)[]) => row[index],
          }))}
          caption={table.title}
          emptyMessage="No service scenarios."
        />
      )}
    </>
  );
}

export function AzureServiceScenarioEditor({
  organization,
  inputs,
  disabled,
  onChange,
}: {
  organization: string;
  inputs: AzureServiceInputs;
  disabled: boolean;
  onChange: (inputs: AzureServiceInputs) => void;
}): JSX.Element {
  const parsed = parseServiceInputs(inputs);
  return (
    <fieldset disabled={disabled}>
      <legend>{organization}: monthly service scenario</legend>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))',
          gap: '1rem',
        }}
      >
        {azureServiceFields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={0}
              max={field.key === 'basicFreeUsers' ? 5 : 1_000_000_000}
              step={field.step}
              value={inputs[field.key] ?? (field.key === 'basicFreeUsers' ? '5' : '')}
              placeholder={field.key === 'basicFreeUsers' ? undefined : 'Unknown'}
              onChange={(event) => onChange({ ...inputs, [field.key]: event.currentTarget.value })}
            />
          </label>
        ))}
      </div>
      {!parsed.success && (
        <p role="alert">
          Use nonnegative quantities up to 1,000,000,000; users and jobs must be whole numbers and
          free Basic seats cannot exceed 5.
        </p>
      )}
      {parsed.success && (
        <AzureServicePricing estimates={[{ organization, inputs: parsed.data }]} />
      )}
    </fieldset>
  );
}
