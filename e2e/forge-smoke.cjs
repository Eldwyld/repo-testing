// Browser smoke test for Forge. Requires Playwright + Chromium and a running build:
//   npm run build && npx vite preview --port 4173 &
//   node e2e/forge-smoke.cjs
// Screenshots are written to e2e/screenshots/ (git-ignored).
const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('e2e/screenshots', { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const base = process.env.BASE_URL || 'http://localhost:4173';
  await page.goto(base + '/forge');
  await page.getByRole('heading', { name: 'JOI Forge Studio' }).waitFor();
  await page.screenshot({ path: 'e2e/screenshots/1-setup.png', fullPage: true });
  await page.getByRole('tab', { name: 'Settings' }).click();
  const buttons = page.locator('.sidebar nav li button');
  const n = await buttons.count();
  const visited = [];
  for (let i = 0; i < n; i++) {
    await buttons.nth(i).click();
    await page.waitForTimeout(150);
    visited.push((await buttons.nth(i).innerText()).split('\n')[0]);
    if (i === 1) await page.screenshot({ path: 'e2e/screenshots/2-identity.png', fullPage: true });
  }
  console.log('visited categories:', visited.length, visited.join(' | '));
  // Event lab
  await page.locator('.sidebar nav li button', { hasText: 'Events & sequences' }).click();
  await page.getByRole('tab', { name: 'Lab' }).click();
  await page.getByRole('button', { name: 'Run' }).click();
  await page.waitForTimeout(500);
  const tl = await page.locator('.timeline li').count();
  console.log('dry-run timeline lines:', tl);
  await page.screenshot({ path: 'e2e/screenshots/3-lab.png', fullPage: true });
  // make an edit -> unsaved indicator, then search
  await page.locator('.sidebar nav li button', { hasText: 'Pacing & intensity' }).click();
  await page.getByLabel('Maximum pace (/s)').fill('6');
  console.log('unsaved indicator:', await page.getByText(/unsaved/).first().innerText());
  await page.getByRole('button', { name: 'Reset category' }).click();
  console.log('after reset unsaved count visible:', await page.getByText(/\d+ unsaved/).count());
  await page.getByLabel('Search settings').fill('pronoun');
  await page.locator('[role=listbox] button').first().click();
  console.log('search jumped to:', await page.locator('.main .card header h2').first().innerText());
  // Start a session
  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('button', { name: /I understand/ }).click();
  await page.waitForURL('**/forge/play');
  await page.waitForTimeout(6000);
  const status1 = await page.locator('.forge-status').innerText();
  console.log('STATUS after start:\n' + status1);
  await page.screenshot({ path: 'e2e/screenshots/4-session.png' });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(800);
  console.log('badge after pause:', await page.locator('.forge-status .badge').innerText());
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(5000);
  console.log('badge after resume:', await page.locator('.forge-status .badge').innerText());
  await page.getByRole('button', { name: 'Stop session' }).click();
  await page.waitForURL('**/forge/history/**', { timeout: 5000 });
  await page.getByRole('heading', { name: 'Session autopsy' }).waitFor();
  await page.waitForTimeout(500);
  console.log('autopsy summary:', (await page.locator('.card').first().innerText()).slice(0, 400));
  await page.getByRole('button', { name: 'Re-simulate and compare' }).click();
  await page.waitForTimeout(500);
  console.log('verify:', await page.locator('[role=status]').filter({ hasText: /Re-simulation|Diverged|Not possible/ }).first().innerText());
  await page.screenshot({ path: 'e2e/screenshots/5-autopsy.png', fullPage: true });
  // history
  await page.goto(base + '/forge');
  await page.getByRole('tab', { name: 'History' }).click();
  console.log('history rows:', await page.locator('tbody tr').count());
  // classic home still works
  await page.goto(base + '/');
  await page.waitForTimeout(1000);
  console.log('classic home title:', await page.title());
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
