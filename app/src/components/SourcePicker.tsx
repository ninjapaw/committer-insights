import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface SourceOption {
  id: string;
  name: string;
  private?: boolean;
}

export function SourcePicker({
  title,
  legend,
  connectLabel,
  connect,
  discover,
  selected,
  onToggle,
  disabled,
  children,
  parseSource,
  manualLabel,
}: {
  title: string;
  legend: string;
  connectLabel: string;
  connect: () => Promise<unknown>;
  discover: () => Promise<SourceOption[]>;
  selected: string[];
  onToggle: (name: string) => void;
  disabled: boolean;
  children?: ReactNode;
  parseSource?: (value: string) => string;
  manualLabel?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState('');
  const { data: connected } = useQuery({
    queryKey: ['provider-connection', title],
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const connection = useMutation({
    mutationFn: connect,
    onSuccess: () => {
      queryClient.setQueryData(['provider-connection', title], true);
    },
  });
  const discovery = useQuery({
    queryKey: ['source-picker', title],
    queryFn: discover,
    enabled: connected,
    retry: false,
  });
  const options = [
    ...(discovery.data ?? []),
    ...selected
      .filter((name) => !discovery.data?.some((item) => item.name === name))
      .map((name) => ({ id: `manual:${name}`, name })),
  ];
  const visibleOptions = options.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="source-panel" aria-label={title}>
      <h2>{title}</h2>
      <button
        type="button"
        disabled={disabled || connection.isPending || connected}
        onClick={() => connection.mutate()}
      >
        {connected ? `${title} connected` : connectLabel}
      </button>
      {connection.isError && <div role="alert">{connection.error.message}</div>}
      {connected && discovery.isPending && (
        <p role="status">Discovering {legend.toLowerCase()}...</p>
      )}
      {discovery.isError && (
        <div role="alert">
          {discovery.error.message}{' '}
          <button
            type="button"
            disabled={disabled || discovery.isFetching}
            onClick={() => void discovery.refetch()}
          >
            Retry discovery
          </button>
        </div>
      )}
      {connected && (discovery.data || selected.length > 0) && (
        <>
          {children}
          <label>
            Filter {legend.toLowerCase()}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              disabled={disabled}
            />
          </label>
          <fieldset className="source-list" disabled={disabled}>
            <legend>
              {legend} ({selected.length} selected)
            </legend>
            {visibleOptions.length === 0 && <p>No matching {legend.toLowerCase()}.</p>}
            {visibleOptions.map((item: SourceOption) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(item.name)}
                  onChange={() => onToggle(item.name)}
                />
                <span>
                  {item.name}
                  {item.private ? ' (private)' : ''}
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      {connected && parseSource && (
        <details className="manual-source">
          <summary>Add by name or URL</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const name = parseSource(manual);
                if (!selected.includes(name)) onToggle(name);
                setSearch('');
                setManual('');
                setManualError('');
              } catch {
                setManualError(`Enter a valid ${manualLabel?.toLowerCase() ?? 'source'}.`);
              }
            }}
          >
            <label>
              {manualLabel}
              <input
                value={manual}
                onChange={(event) => setManual(event.currentTarget.value)}
                disabled={disabled}
                required
              />
            </label>
            <button type="submit" disabled={disabled || !manual.trim()}>
              Add source
            </button>
          </form>
          {manualError && <p role="alert">{manualError}</p>}
        </details>
      )}
    </section>
  );
}
