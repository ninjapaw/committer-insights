import type { ProviderSummary, SourceStatus } from '@ninjapaw/contracts';

export function buildProviderSummary(
  metadata: Pick<
    ProviderSummary,
    'provider' | 'displayName' | 'sourceLabel' | 'measurement' | 'apiVersion' | 'methodology'
  >,
  identityKeys: string[],
  statuses: SourceStatus[],
): ProviderSummary {
  const sources = statuses.filter((source) => source.provider === metadata.provider);
  return {
    ...metadata,
    includedSources: sources.filter((source) => source.status === 'included').length,
    skippedSources: sources.filter((source) => source.status === 'skipped').length,
    identityRecords: identityKeys.length,
    uniqueIdentities: new Set(identityKeys).size,
  };
}
