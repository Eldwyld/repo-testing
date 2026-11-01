// Offline-build smoke test: every non-local request is blocked and recorded,
// CSP violations are collected, local media is imported and must play.
// Run against a started offline package:
//   npm run build:offline && python3 dist-offline/serve.py --no-open &
//   node e2e/offline-smoke.cjs        (BASE_URL defaults to http://localhost:5224)
const { chromium } = require('playwright');
const path = require('path');
const FIX = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'screenshots');
require('fs').mkdirSync(OUT, { recursive: true });
const base = process.env.BASE_URL || 'http://localhost:5224';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
  });
  const external = [],
    errors = [];
  // Block and record anything that is not this machine.
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (
      ['localhost', '127.0.0.1'].includes(u.hostname) ||
      ['data:', 'blob:'].includes(u.protocol)
    )
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
    );
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(base + '/');
  await page.getByRole('button', { name: 'I am an adult' }).click();
  await page.waitForTimeout(800);
  const tabs = await page.locator('wa-tab').allInnerTexts();
  console.log('classic media tabs:', tabs.join(', '));
  const iconOk = await page.evaluate(async () => {
    const icons = [...document.querySelectorAll('wa-icon')];
    await new Promise(r => setTimeout(r, 500));
    return {
      total: icons.length,
      rendered: icons.filter(i => i.shadowRoot?.querySelector('svg')).length,
    };
  });
  console.log('icons rendered:', JSON.stringify(iconOk));
  console.log(
    'home entry mentions offline:',
    (await page.getByText(/Forge build/).count()) > 0
  );

  await page.goto(base + '/forge');
  await page.getByRole('heading', { name: 'JOI Forge Studio' }).waitFor();
  console.log(
    'studio note:',
    (await page.getByText(/Offline build: sessions only use/).count()) === 1
  );
  await page
    .getByTestId('media-files')
    .setInputFiles([
      path.join(FIX, 'sticker-pink.png'),
      path.join(FIX, 'testsrc.webm'),
    ]);
  await page.getByText(/Added 2 file\(s\)/).waitFor({ timeout: 20000 });
  console.log(
    'library:',
    await page
      .locator('.card', { hasText: 'Images & videos' })
      .first()
      .locator('p')
      .nth(1)
      .innerText()
  );
  await page.screenshot({ path: `${OUT}/offline-setup.png` });

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page
    .locator('.sidebar nav li button', { hasText: 'Media tags' })
    .click();
  await page.waitForTimeout(800);
  console.log(
    'listed files:',
    (await page.locator('table tbody tr td:first-child').allInnerTexts())
      .map(t => t.split('\n')[0])
      .join(', ')
  );

  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('button', { name: /I understand/ }).click();
  await page.waitForURL('**/forge/play');
  await page.waitForTimeout(9000);
  const shown = await page.evaluate(() => {
    const found = [];
    const walk = root =>
      root.querySelectorAll('*').forEach(el => {
        if ((el.tagName === 'IMG' || el.tagName === 'VIDEO') && el.src)
          found.push(`${el.tagName.toLowerCase()} ${el.src.slice(0, 5)}`);
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    walk(document);
    return found;
  });
  console.log('session media elements:', shown.join(' | ') || 'none');
  await page.screenshot({ path: `${OUT}/offline-session.png` });
  await page.getByRole('button', { name: 'Stop session' }).click();
  await page.waitForURL('**/forge/history/**');
  await page.getByRole('heading', { name: 'Session autopsy' }).waitFor();
  console.log(
    'autopsy media transitions:',
    await page.locator('tr', { hasText: 'Media transitions' }).innerText()
  );

  const csp = await page.evaluate(() => window.__csp);
  console.log('EXTERNAL REQUESTS:', external.length ? external : 'none');
  console.log('CSP VIOLATIONS:', csp.length ? csp : 'none');
  console.log('ERRORS:', errors.length ? errors : 'none');
  const ok =
    !external.length && !csp.length && !errors.length && shown.length > 0;
  console.log(ok ? 'OFFLINE SMOKE: PASS' : 'OFFLINE SMOKE: FAIL');
  if (!ok) process.exitCode = 1;
  await browser.close();
})().catch(e => {
  console.error('E2E FAILED', e);
  process.exit(1);
});
