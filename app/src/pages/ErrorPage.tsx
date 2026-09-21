export function ErrorPage(): JSX.Element {
  return (
    <section aria-labelledby="error-title" role="alert">
      <h1 id="error-title">Something went wrong</h1>
      <p>
        An unexpected error occurred. If this continues, contact support with the correlation ID
        shown on the previous screen.
      </p>
    </section>
  );
}
