const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '..', 'DashyDashboard', 'DashyDashboard.Frontend', 'src', 'assets', 'broadridge-logo.svg'), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 4 });
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;background:transparent">
    <div id="w" style="display:inline-block;width:900px">${svg.replace('width="160" height="36"', 'width="900" height="202"')}</div>
  </body></html>`);
  const el = await page.$('#w');
  await el.screenshot({ path: path.join(__dirname, 'figures', 'broadridge-logo.png'), omitBackground: true });
  console.log('OK logo');
  await browser.close();
})();
