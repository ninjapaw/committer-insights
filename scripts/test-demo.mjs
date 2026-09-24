import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { azureDevOpsCommitterSchema, gitHubCommitterSchema } from '@ninjapaw/contracts';
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
    await page.getByRole('tab', { name: 'GitHub Enterprise', exact: true }).click();
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
    for (const report of [partial, empty]) {
      await page.goto(`${origin}${base}reports/${report.reportId}/`);
      await page.getByRole('heading', { name: 'Results dashboard' }).waitFor();
      assert.ok(await page.getByText(report.subject, { exact: false }).count());
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
