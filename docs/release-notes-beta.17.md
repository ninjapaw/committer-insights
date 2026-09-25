# Committer Insights v0.1.0-beta.17

## Changes

- Prepare the bundled Microsoft sign-in runtime during application startup, after update handoff and before the browser opens. Sign-in and token requests reuse the verified runtime for that process.
- Reduce Azure CLI 2.90.0 at build time while preserving single-executable delivery, shared authentication dependencies, certificates and detected legal notices. The smaller runtime still extracts into the per-user cache; no global installation or elevation is required.
- Verify all runtime files on each application launch. Keep separate source and reduced-payload checksums, deterministic ZIP packaging, and companion SBOM provenance.
- Report startup preparation progress. A preparation failure leaves GitHub available and requires an application restart before Microsoft sign-in.

## Measured Reduction

Local candidate measurements, using decimal MB:

| Component            |   Before |    After |
| -------------------- | -------: | -------: |
| Runtime files        |   11,312 |    4,470 |
| Extracted runtime    | 273.9 MB | 105.6 MB |
| Embedded CLI archive |  90.2 MB |  44.1 MB |
| Complete executable  | 229.1 MB | 182.0 MB |

The published executable is rebuilt by CI; use its attached checksum rather than a local candidate checksum.

## Validation and Acceptance

- Full local validation passed: 286 automated tests, executable packaging, isolated offline authentication checks, upgrade handoff and fresh-user startup smoke checks. Two initial Windows test timeouts passed on an unchanged rerun.
- On 2026-09-25, the maintainer reported successful live Microsoft sign-in with the reduced candidate and explicitly cleared the publication gate. This is user-reported acceptance; automated checks do not sign in.
- Publication requires build and CodeQL success for the exact release commit and checksum verification and packaged smoke checks of the downloaded CI artifact.

## Limitations

- Unsigned, Windows x64 evaluation prerelease. Checksums verify integrity, not publisher identity.
- Successful live sign-in does not certify every tenant's Conditional Access policies, cross-tenant discovery or live token renewal. No tenant policies or global CLI settings are changed.
- Runtime integrity is checked at startup, not before every token request. Changes to the cache after startup are detected on the next launch.
- The reduced runtime is not a general-purpose Azure CLI installation. Its retention policy is pinned to 2.90.0 and requires review for upgrades.
- Headless CI cannot validate native console-parent UI behavior. Customer invoice reconciliation and clean-machine certification remain separate checks.

Use `--skip-update-check` for deliberate rollback or candidate testing. Normal startup checks published releases, including prereleases.
