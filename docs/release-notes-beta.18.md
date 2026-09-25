# Committer Insights v0.1.0-beta.18

## Changes

- Add `COMMITTER_INSIGHTS_AUTO_UPDATE=true|false` to control packaged Windows startup update checks, enabled by default. The existing `--skip-update-check` flag still skips checks for one launch; download integrity checks are unchanged.
- Align standalone HTML reports with the dashboard's typography, spacing, metric tiles, tables, and responsive navigation. Desktop reports use a section sidebar; smaller screens use wrapping navigation.
- Preserve the current dashboard's light or dark theme when downloading HTML, including downloads from the synthetic demo. Reports retain all providers and collected evidence, remain script-free, and require no external assets or network access to read.
- Keep recommendation navigation reachable and include links to other Azure DevOps service estimates when present. Printed reports retain a light, readable layout.
- Reorganize the README with navigation and current public guidance. Consolidate maintenance instructions into it and remove the separate maintainer guide.
- Document collection endpoints, API versions, retained fields, pagination and date rules, identity matching, local calculations, exclusions, and official Microsoft/GitHub references. Explicitly flag the existing GitHub enterprise-discovery routes that are absent from the reviewed public specification; this release does not change those collectors.

## Validation

- Updater regressions cover environment defaults, accepted and invalid values, command-line precedence, help availability, and startup without calling the updater when disabled.
- Export and dashboard regressions cover theme preservation, full-report content, HTML escaping, and self-contained output.
- Synthetic browser checks exercise light/dark HTML downloads at 1440px and 390px, compare theme colors and typography, check section targets and page overflow, and block network requests while reading the exported file.
- Publication requires full local validation, build and CodeQL success for the exact release commit, and checksum verification and packaged smoke tests of the downloaded CI artifact.

## Limitations

- Unsigned Windows x64 evaluation prerelease. Checksums verify integrity, not publisher identity; do not bypass organization security policies.
- Exported reports contain potentially sensitive data. The HTML preserves the full collected report, not the current dashboard filter, and shows provider sections together rather than interactive dashboard tabs.
- Directly generated HTML uses the default dark theme; downloads through the dashboard carry its selected theme. No theme scripts or provider collection are embedded in the file.
- No provider permission changes, new collection APIs, or Sources and Options workflow redesign are included. Documentation references do not certify complete tenant coverage or customer invoice accuracy.

Use `--skip-update-check` or `COMMITTER_INSIGHTS_AUTO_UPDATE=false` only for deliberate rollback or offline/candidate startup. Normal startup checks published releases, including prereleases.
