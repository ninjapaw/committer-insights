import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <section aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
      <p>
        <Link to="/">Return to the landing page</Link>
      </p>
    </section>
  );
}
