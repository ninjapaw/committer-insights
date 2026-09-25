import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import {
  azureDevOpsCommitterSchema,
  gitHubCommitterSchema,
  azureBillingGroups,
  azureBillingTables,
} from '@ninjapaw/contracts';
import { createDemoReports } from './demo-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = resolve(root, 'demo/public/generated');
const dist = resolve(root, 'demo/dist');
const base = `${(process.env.DEMO_BASE_PATH ?? '/committer-insights').replace(/\/$/, '')}/`;
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const first = await json(resolve(generated, 'manifest.json'));
execFileSync(process.execPath, [resolve(root, 'scripts/generate-demo.mjs')], {
  cwd: root,
  stdio: 'pipe',
});
assert.deepEqual(
  await json(resolve(generated, 'manifest.json')),
  first,
  'Generated exports must be byte-for-byte reproducible',
);
assert.equal(first.synthetic, true);
for (const file of first.files) {
  const body = await readFile(resolve(dist, 'generated', file.name));
  assert.equal(
    createHash('sha256').update(body).digest('hex'),
    file.sha256,
    `Built artifact mismatch: ${file.name}`,
  );
  if (file.name.endsWith('.pdf')) assert.ok((await PDFDocument.load(body)).getPageCount() > 0);
  if (file.name.endsWith('.html') || file.name.endsWith('.csv'))
    assert.match(body.toString(), /SYNTHETIC DEMO/);
}
const reports = createDemoReports();
for (const report of reports) {
  assert.deepEqual(await json(resolve(generated, `${report.reportId}.json`)), report);
  for (const row of report.azureDevOpsCommitters) azureDevOpsCommitterSchema.parse(row);
  for (const row of report.gitHubCommitters) gitHubCommitterSchema.parse(row);
  assert.ok(report.warnings.some((warning) => warning.startsWith('SYNTHETIC DEMO')));
}
const [complete, partial, empty] = reports;
assert.equal(first.fixtureVersion, 5);
assert.equal(complete.insights.githubBilling[0].providerCount, 1);
assert.equal(complete.insights.githubBilling[0].repositories.length, 2);
assert.ok(
  partial.insights.githubBilling.every(
    (snapshot) => snapshot.status === 'unavailable' && snapshot.providerCount === undefined,
  ),
);
assert.equal(complete.insights.azureBilling.length, 2);
assert.deepEqual(
  azureBillingGroups(complete.insights.azureBilling).map((group) => group.uniqueCount),
  [2, 2],
);
const olderCommit = complete.insights.azureBilling[0].details[0];
assert.ok(olderCommit.commitTime < complete.insights.repositories[0].activity.from);
assert.ok(olderCommit.pushedTime >= complete.insights.repositories[0].activity.from);
assert.ok(olderCommit.pushedTime < complete.insights.azureBilling[0].billingDate);
const diagnostics = azureBillingTables(complete.insights.azureBilling).find(
  (table) => table.title === 'Azure billing diagnostic details',
);
assert.equal(diagnostics.rows[0][5], 'synthetic-cuid-1');
assert.equal(diagnostics.rows[1][5], 'Unmatched or ambiguous; not added to totals');
assert.equal(partial.insights.azureBilling[0].providerCount, 2);
assert.equal(partial.insights.azureBilling[0].identities.length, 1);
assert.equal(azureBillingGroups(partial.insights.azureBilling)[0].uniqueCount, undefined);
assert.equal(empty.insights.azureBilling?.length ?? 0, 0);
for (const format of ['csv', 'html']) {
  const body = await readFile(resolve(generated, `synthetic-complete.${format}`), 'utf8');
  for (const expected of [
    'synthetic-cuid-1',
    'Unmatched or ambiguous; not added to totals',
    'unmatched@example.test',
  ])
    assert.ok(body.includes(expected));
}
assert.equal(complete.azureDevOpsCommitters.length, 32);
assert.equal(complete.gitHubCommitters.length, 18);
assert.equal(complete.insights.repositories.length, 8);
assert.equal(
  complete.costEstimates.find(
    (item) => item.provider === 'github' && item.solution === 'codeSecurity',
  ).estimatedMonthlyCostUsd,
  540,
);
const observedCommits = complete.insights.repositories
  .filter((item) => item.provider === 'github')
  .flatMap((item) => item.activity.daily)
  .reduce((sum, point) => sum + point.commits, 0);
assert.equal(
  complete.gitHubCommitters.reduce((sum, row) => sum + row.commitCount, 0),
  observedCommits,
);
assert.equal(
  partial.costEstimates.some((item) => item.provider === 'github'),
  false,
);
assert.equal(empty.insights.repositories.length, 0);
process.stdout.write(
  'Synthetic data, expected totals, production exports and deterministic regeneration passed.\n',
);

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    let file = resolve(dist, path.slice(base.length));
    if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.csv': 'text/csv',
    };
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  ...(process.env.DEMO_BROWSER_CHANNEL ? { channel: process.env.DEMO_BROWSER_CHANNEL } : {}),
  headless: true,
});
await mkdir(resolve(root, 'test-results/demo'), { recursive: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      acceptDownloads: true,
    });
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || /\/api\//.test(url.pathname)) {
        failures.push(`Unexpected network request: ${url.origin}${url.pathname}`);
        await route.abort();
      } else await route.continue();
    });
    await page.goto(`${origin}${base}`);
    await page
      .getByRole('link', { name: 'Synthetic example - complete collection', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Results dashboard' }).waitFor();
    await page.getByRole('heading', { name: 'Collection at a glance', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Azure DevOps', exact: true }).click();
    const services = page.getByRole('region', {
      name: 'Azure DevOps other services: what-if estimates',
      exact: true,
    });
    await services.scrollIntoViewIfNeeded();
    for (const amount of [
      '$42.00',
      '$156.00',
      '$40.00',
      '$30.00',
      '$106.00',
      '$6.20',
      '$10.20',
      '$5.00',
    ]) {
      assert.equal(await services.getByRole('cell', { name: amount, exact: true }).count(), 1);
    }
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    );
    await page.screenshot({ path: resolve(root, `test-results/demo/azure-services-${width}.png`) });
    await page
      .getByRole('heading', { name: 'Provider-reported Azure billing', exact: true })
      .waitFor();
    await page
      .getByLabel(/^Billing dataset/)
      .selectOption('Azure billing and enablement scenarios');
    const securityEstimates = page.getByRole('region', {
      name: 'Azure billing and enablement scenarios',
      exact: true,
    });
    assert.equal(
      await securityEstimates.getByRole('cell', { name: '$360.00', exact: true }).count(),
      1,
    );
    assert.equal(
      await securityEstimates.getByRole('cell', { name: '$152.00', exact: true }).count(),
      1,
    );
    await page
      .getByRole('region', { name: 'Azure billing and enablement scenarios', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(root, `test-results/demo/azure-estimates-${width}.png`),
    });
    await page.getByLabel(/^Billing dataset/).selectOption('Azure billing diagnostic details');
    await page.getByLabel('Filter billing rows', { exact: true }).fill('unmatched@example.test');
    assert.equal(
      await page
        .getByRole('cell', { name: 'Unmatched or ambiguous; not added to totals', exact: true })
        .count(),
      2,
    );
    await page.getByLabel('Filter billing rows', { exact: true }).fill('');
    await page.getByLabel(/^Billing dataset/).selectOption('Azure billing reconciliation');
    assert.equal(
      await page
        .getByRole('region', { name: 'Azure billing reconciliation', exact: true })
        .getByRole('cell', { name: '2', exact: true })
        .count(),
      2,
    );
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    );
    await page
      .getByRole('heading', { name: 'Provider-reported Azure billing', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, `test-results/demo/billing-${width}.png`) });
    await page.getByRole('tab', { name: 'GitHub Enterprise', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Provider-reported GitHub billing', exact: true })
      .waitFor();
    await page.getByLabel(/^Billing dataset/).selectOption('GitHub security billing identities');
    await page
      .getByLabel('Filter billing rows', { exact: true })
      .fill('billed-developer@example.test');
    assert.equal(
      await page.getByRole('cell', { name: 'billed-developer@example.test', exact: true }).count(),
      4,
    );
    await page.getByLabel(/^Billing dataset/).selectOption('GitHub provider usage charges');
    assert.equal(await page.getByRole('cell', { name: '0.6', exact: true }).count(), 3);
    await page
      .getByRole('region', { name: 'GitHub provider usage charges', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, `test-results/demo/github-billing-${width}.png`) });
    await page.getByRole('heading', { name: 'Usage and coverage', exact: true }).waitFor();
    await page.getByLabel('Repositories', { exact: true }).click();
    await page.getByLabel('Repository search', { exact: true }).fill('no-synthetic-match');
    await page.getByText('No matching repositories.', { exact: true }).waitFor();
    await page.getByLabel('Repository search', { exact: true }).fill('');
    for (const format of ['CSV', 'PDF', 'HTML']) {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: `Download ${format}`, exact: true }).click();
      const download = await downloadPromise;
      assert.ok((await stat(await download.path())).size > 100);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        globalThis.document.documentElement.dataset.theme = value;
      }, theme);
      const siteStyle = await page.evaluate(() => {
        const styles = globalThis.getComputedStyle(globalThis.document.body);
        return {
          background: styles.backgroundColor,
          color: styles.color,
          fontSize: styles.fontSize,
          panel: styles.getPropertyValue('--color-bg').trim(),
          tint: styles.getPropertyValue('--color-bg-tint').trim(),
        };
      });
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
      const download = await downloadPromise;
      const html = await readFile(await download.path(), 'utf8');
      const exported = await browser.newPage({ viewport: { width, height: 1000 } });
      const exportRequests = [];
      await exported.route('**/*', (route) => {
        exportRequests.push(route.request().url());
        return route.abort();
      });
      await exported.setContent(html);
      const result = await exported.evaluate(() => {
        const styles = globalThis.getComputedStyle(globalThis.document.body);
        const layout = globalThis.document.querySelector('.report-layout');
        const navigation = layout.querySelector('.report-nav');
        const content = layout.querySelector('.report-content');
        return {
          theme: globalThis.document.documentElement.dataset.theme,
          styles: {
            background: styles.backgroundColor,
            color: styles.color,
            fontSize: styles.fontSize,
          },
          metric: globalThis.getComputedStyle(globalThis.document.querySelector('.metric'))
            .backgroundColor,
          tableHeader: globalThis.getComputedStyle(globalThis.document.querySelector('thead th'))
            .backgroundColor,
          overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
          sidebar: navigation.getBoundingClientRect().right <= content.getBoundingClientRect().left,
          missingTargets: [...globalThis.document.querySelectorAll('a[href^="#"]')].filter(
            (link) => !globalThis.document.getElementById(link.hash.slice(1)),
          ).length,
          scripts: globalThis.document.scripts.length,
        };
      });
      assert.equal(result.theme, theme);
      const { panel, tint, ...siteBody } = siteStyle;
      assert.deepEqual(result.styles, siteBody, 'Export colors and type size must match the site');
      const rgb = (hex) => {
        const digits =
          hex.length === 4
            ? [...hex.slice(1)].map((digit) => digit + digit).join('')
            : hex.slice(1);
        return `rgb(${digits
          .match(/../g)
          .map((part) => parseInt(part, 16))
          .join(', ')})`;
      };
      assert.equal(result.metric, rgb(panel), 'Metric background must follow the selected theme');
      assert.equal(result.tableHeader, rgb(tint), 'Table headers must follow the selected theme');
      assert.equal(result.overflow, false);
      assert.equal(result.sidebar, width > 900);
      assert.equal(result.missingTargets, 0);
      assert.equal(result.scripts, 0);
      assert.deepEqual(exportRequests, [], 'Downloaded reports must render without network access');
      await exported.screenshot({
        path: resolve(root, `test-results/demo/html-${theme}-${width}.png`),
      });
      await exported.getByRole('link', { name: 'Recommendations', exact: true }).first().click();
      await exported.locator('#azure-devops-cio-brief').waitFor({ state: 'visible' });
      await exported.close();
    }
    await page.evaluate(() => {
      globalThis.document.documentElement.dataset.theme = 'light';
    });
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: resolve(root, `test-results/demo/report-${width}.png`),
      fullPage: true,
    });
    await page.goto(`${origin}${base}generated/synthetic-complete.html`);
    assert.equal(
      await page.getByRole('heading', { name: 'Solution pricing totals', exact: true }).count(),
      1,
    );
    const azureEstimate = page
      .locator('#area-azure-devops')
      .getByRole('region', { name: 'Azure billing and enablement scenarios', exact: true });
    assert.ok(await azureEstimate.isVisible());
    assert.equal(
      await azureEstimate.getByRole('cell', { name: '12 x $30.00/month', exact: true }).count(),
      1,
    );
    assert.equal(
      await page
        .locator('#area-azure-devops')
        .getByRole('heading', { name: 'Solution pricing totals', exact: true })
        .count(),
      0,
    );
    const usageSummary = page
      .locator('#area-github')
      .getByRole('region', { name: 'Reported usage subtotals', exact: true });
    assert.equal(await usageSummary.getByRole('cell', { name: '$0.60', exact: true }).count(), 1);
    assert.equal(
      await page
        .locator('#area-github')
        .getByRole('region', { name: 'GitHub provider usage charges', exact: true })
        .isVisible(),
      false,
    );
    await page
      .locator('#area-github summary')
      .filter({ hasText: 'GitHub provider usage charges' })
      .click();
    assert.equal(
      await page
        .locator('#area-github')
        .getByRole('region', { name: 'GitHub provider usage charges', exact: true })
        .getByRole('row')
        .count(),
      4,
    );
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    );
    await usageSummary.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(root, `test-results/demo/consolidated-html-${width}.png`),
    });
    for (const report of [partial, empty]) {
      await page.goto(`${origin}${base}reports/${report.reportId}/`);
      await page.getByRole('heading', { name: 'Results dashboard' }).waitFor();
      assert.ok(await page.getByText(report.subject, { exact: false }).count());
      if (report === partial) {
        await page.getByRole('tab', { name: 'Azure DevOps', exact: true }).click();
        await page
          .getByLabel(/^Billing dataset/)
          .selectOption('Azure billing and enablement scenarios');
        assert.equal(
          await securityEstimates.getByRole('cell', { name: '$152.00', exact: true }).count(),
          1,
        );
        assert.equal(
          await securityEstimates.getByRole('cell', { name: '$360.00', exact: true }).count(),
          0,
        );
        await page.getByLabel(/^Billing dataset/).selectOption('Azure billing enablement evidence');
        assert.equal(
          await page
            .getByRole('cell', { name: /Product disabled and zero billable committers/ })
            .count(),
          1,
        );
        await page.getByRole('tab', { name: 'GitHub Enterprise', exact: true }).click();
        await page
          .getByLabel('Filter billing rows', { exact: true })
          .fill('Synthetic billing access denied');
        assert.equal(await page.getByRole('cell', { name: 'unavailable', exact: true }).count(), 5);
      }
    }
    assert.deepEqual(
      failures,
      [],
      'Demo must run without provider/auth requests or browser errors',
    );
    process.stdout.write(
      `${width}px: static navigation, report filters, all downloads, partial/empty cases and network isolation passed.\n`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
