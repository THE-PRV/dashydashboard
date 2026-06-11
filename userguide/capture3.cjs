const { chromium } = require('playwright-core');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(__dirname, 'figures', 'login-sso.png') });
  console.log('OK login-sso');
  await browser.close();
})();
