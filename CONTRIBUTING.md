# Contributing

1. Fork/branch from `dev` (the default development branch).
2. Run `npm install` at the repository root.
3. Run `npm run ci` locally before opening a pull request — it runs
   formatting, linting, type checking, tests, the production build, and
   executable build.
4. Open pull requests against `dev`. `main` is the production branch and is
   updated only through the release process.
5. Do not commit secrets, `.env`, signing credentials, or generated
   reports/customer data.
