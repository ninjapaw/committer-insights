import { repositoryWebUrl, type RepositoryInsight } from '@ninjapaw/contracts';

export function RepositoryLink(
  repository: Pick<RepositoryInsight, 'provider' | 'source' | 'name' | 'project'>,
): JSX.Element {
  const url = repositoryWebUrl(repository);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Open repository in a new tab">
      {repository.name}
    </a>
  ) : (
    <>{repository.name}</>
  );
}
