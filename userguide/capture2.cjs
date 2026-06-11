const { chromium } = require('playwright-core');
const path = require('path');
const OUT = path.join(__dirname, 'figures');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1480, height: 940 }, deviceScaleFactor: 2,
    extraHTTPHeaders: { 'X-User-Id': '2001' },
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.getByText('Access report', { exact: false }).first().waitFor({ timeout: 15000 });
  await sleep(700);

  // Cycle picker open
  try {
    await page.getByText('Q1 2026 Attestation', { exact: false }).first().click();
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'assoc-cycle-picker.png') });
    console.log('OK assoc-cycle-picker');
    await page.mouse.click(5, 300); await sleep(300);
  } catch (e) { console.log('FAIL cycle', e.message.split('\n')[0]); }

  // Dark mode (full page)
  try {
    await page.getByTitle('Switch to dark mode').click();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'dark-mode.png'), fullPage: true });
    console.log('OK dark-mode');
  } catch (e) { console.log('FAIL dark', e.message.split('\n')[0]); }

  await browser.close();
})();
