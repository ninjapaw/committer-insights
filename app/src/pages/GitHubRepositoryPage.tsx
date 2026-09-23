import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { commitWindows, createGitHubReport, discoverRepositories } from '../providers/github';

export function GitHubRepositoryPage(): JSX.Element {
  const [repository, setRepository] = useState('');
  const [sinceDays, setSinceDays] = useState(90);
  const navigate = useNavigate();
  const discovery = useQuery({
    queryKey: ['github-repositories'],
    queryFn: discoverRepositories,
    retry: false,
  });
  const createReport = useMutation({
    mutationFn: () => createGitHubReport({ repository, sinceDays }),
    onSuccess: ({ reportId }) => navigate(`/reports/${reportId}`),
  });

  useEffect(() => {
    const onlyRepository = discovery.data?.length === 1 ? discovery.data[0] : undefined;
    if (onlyRepository) setRepository((current) => current || onlyRepository.name);
  }, [discovery.data]);

  return (
    <section aria-labelledby="github-repository-title">
      <h1 id="github-repository-title">GitHub repository</h1>
      {discovery.isPending && <p aria-live="polite">Discovering your repositories...</p>}
      {discovery.data && discovery.data.length > 0 && (
        <div>
          <label htmlFor="discovered-repository">Discovered repositories</label>
          <select
            id="discovered-repository"
            value={discovery.data.some((item) => item.name === repository) ? repository : ''}
            onChange={(event) => setRepository(event.currentTarget.value)}
          >
            <option value="">Select a repository</option>
            {discovery.data.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
                {item.private ? ' (private)' : ''}
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
        <label htmlFor="github-repository">Repository name or URL</label>
        <input
          id="github-repository"
          value={repository}
          onChange={(event) => setRepository(event.currentTarget.value)}
          placeholder="owner/repository"
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
        <button type="submit" disabled={createReport.isPending}>
          Generate GitHub report
        </button>
      </form>
      {createReport.isError && <div role="alert">{(createReport.error as Error).message}</div>}
    </section>
  );
}
