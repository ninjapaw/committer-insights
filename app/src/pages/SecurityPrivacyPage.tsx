export function SecurityPrivacyPage(): JSX.Element {
  return (
    <section aria-labelledby="privacy-title">
      <h1 id="privacy-title">Security and privacy</h1>
      <p>
        Reports and SDK Microsoft tokens remain in this application's memory. Provider tokens are
        never sent to the browser. Exports are written only when you download them. GitHub CLI
        manages its own saved credentials, which can persist after this application closes.
      </p>
      <p>
        Optional Azure CLI sign-in uses an isolated temporary credential directory, not your
        existing CLI accounts. It is removed on cancellation, account change, sign-out, or normal
        process exit. Forced termination can leave sensitive cache files in your temporary
        directory. CLI telemetry and dynamic extension installation are disabled. CLI sign-in
        remains subject to your organization's consent, MFA, and Conditional Access policies.
      </p>
      <h2>Independent project</h2>
      <p>
        Opt-in billing reports can contain GitHub logins and last-push emails, Azure identity
        records and diagnostic details, repository associations, and commercial usage amounts.
        Downloaded reports include these fields. Apply your organization's data retention and
        sharing policies; missing billing access is not zero usage.
      </p>
      <p>
        Committer Insights is an independent community tool. It is not a Microsoft or GitHub
        product, assessment, endorsement, or official licensing source. Validate estimates,
        permissions, licensing implications, and generated output against official documentation
        before using them for business decisions.
      </p>
      <p>
        Microsoft and GitHub product names are used for identification only. All trademarks belong
        to their respective owners.
      </p>
    </section>
  );
}
