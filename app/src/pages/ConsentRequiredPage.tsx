export function ConsentRequiredPage(): JSX.Element {
  return (
    <section aria-labelledby="consent-required-title">
      <h1 id="consent-required-title">Additional consent required</h1>
      <p>
        Your organization requires additional consent before this portal can read Azure DevOps
        reporting data. Contact your Microsoft Entra administrator and provide the
        administrator-consent link shown below.
      </p>
    </section>
  );
}
