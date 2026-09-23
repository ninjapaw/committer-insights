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
