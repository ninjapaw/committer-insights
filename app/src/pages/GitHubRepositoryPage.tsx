import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { parseGitHubTargetInput } from '@ninjapaw/contracts';
import { commitWindows, createGitHubReport, discoverGitHubTargets } from '../providers/github';

export function GitHubRepositoryPage(): JSX.Element {
  const [target, setTarget] = useState('');
  const [sinceDays, setSinceDays] = useState(90);
  const navigate = useNavigate();
  const discovery = useQuery({
    queryKey: ['github-targets'],
    queryFn: discoverGitHubTargets,
    retry: false,
  });
  const createReport = useMutation({
    mutationFn: () =>
      createGitHubReport({
        targetType:
          discovery.data?.find((item) => item.name === target)?.targetType ??
          parseGitHubTargetInput(target).targetType,
        target: parseGitHubTargetInput(target).target,
        sinceDays,
      }),
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}`),
  });

  useEffect(() => {
    const onlyTarget = discovery.data?.length === 1 ? discovery.data[0] : undefined;
    if (onlyTarget) setTarget((current) => current || onlyTarget.name);
  }, [discovery.data]);

  return (
    <section aria-labelledby="github-repository-title">
      <h1 id="github-repository-title">GitHub organization or enterprise</h1>
      {discovery.isPending && (
        <p aria-live="polite">Discovering your organizations and enterprises...</p>
      )}
      {discovery.data && discovery.data.length > 0 && (
        <div>
          <label htmlFor="discovered-repository">Discovered organizations and enterprises</label>
          <select
            id="discovered-repository"
            value={discovery.data.some((item) => item.name === target) ? target : ''}
            onChange={(event) => setTarget(event.currentTarget.value)}
          >
            <option value="">Select an organization or enterprise</option>
            {discovery.data.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name} ({item.targetType})
              </option>
            ))}
          </select>
        </div>
      )}
      {discovery.isError && <p>{(discovery.error as Error).message} Enter one below.</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          createReport.mutate();
        }}
      >
        <label htmlFor="github-repository">Organization, enterprise, or URL</label>
        <input
          id="github-repository"
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value)}
          placeholder="octocat"
          required
        />
        <label htmlFor="github-window">Commit window</label>
        <select
          id="github-window"
          value={sinceDays}
          onChange={(event) => setSinceDays(Number(event.currentTarget.value))}
        >
          {commitWindows.map((days) => (
            <option key={days} value={days}>
              Last {days} days
            </option>
          ))}
        </select>
        <button type="submit" disabled={createReport.isPending || !target.trim()}>
          Generate GitHub report
        </button>
      </form>
      {createReport.isError && <div role="alert">{(createReport.error as Error).message}</div>}
    </section>
  );
}
