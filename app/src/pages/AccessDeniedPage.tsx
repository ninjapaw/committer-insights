export function AccessDeniedPage(): JSX.Element {
  return (
    <section aria-labelledby="denied-title">
      <h1 id="denied-title">Access denied</h1>
      <p>
        Azure DevOps did not authorize this report. Confirm that your account can access the
        organization and that the required Advanced Security read permission has been granted.
      </p>
    </section>
  );
}
