# Contributing

1. Fork/branch from `dev` (the default development branch).
2. Run `npm ci` at the repository root.
3. Run the full local validation with `npm run ci` before opening a pull
   request. It runs formatting, linting, type checking, tests, the executable
   build, and the packaged-binary smoke test.
4. Open pull requests against `dev`. `main` is the production branch and is
   updated only through the release process.
5. Do not commit secrets, `.env`, signing credentials, or generated
   reports/customer data.

## Testing Boundaries

- `app/tests/unit/local-api.test.ts` checks the shared local capability headers, JSON requests, and error propagation.
- `app/tests/unit/ReportTable.test.tsx` checks pagination, filtering, and empty results. `CombinedReportPage.test.tsx` checks permission gating, selection locking, invalidation, and report navigation.
- `api/tests/unit/provider-services.test.ts` checks Azure DevOps and GitHub credential isolation, request options, and report metadata. `combined-report.test.ts` checks orchestration, skipped sources, all-failed runs, and provider-scoped deduplication.
- Existing adapter tests own upstream response parsing and provider-specific HTTP behavior. Export tests parse generated XLSX/PDF documents and verify CSV/HTML escaping and executive-export redaction.

Use synthetic identities and mocked credentials/providers in automated tests. No live CLI login is required. Assert observable results rather than only checking that a component renders or an export buffer is nonempty.

```sh
npm exec --workspace app -- vitest run tests/unit/ReportTable.test.tsx tests/unit/CombinedReportPage.test.tsx
npm exec --workspace api -- vitest run tests/unit/provider-services.test.ts tests/unit/combined-report.test.ts
npm test
```

Close running Committer Insights executables before `npm run ci` so packaging can replace the binary. The executable smoke test checks local startup and session authorization without contacting either provider.
