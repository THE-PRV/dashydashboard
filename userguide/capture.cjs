/* Capture screenshots of the Access Review SPA for every role/state.
   Backend: Kestrel :5000 (Development, X-User-Id honored). Frontend: Vite dev :5173.
   We inject X-User-Id at the network layer so the backend resolves any persona. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173/';
const OUT = path.join(__dirname, 'figures');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fail = 0;

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, name + '.png'), ...opts });
  console.log('  OK', name);
  ok++;
}
async function step(name, fn) {
  try { await fn(); } catch (e) { console.log('  FAIL', name, '-', e.message.split('\n')[0]); fail++; }
}

async function ctxFor(browser, id) {
  const ctx = await browser.newContext({
    viewport: { width: 1480, height: 940 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: id ? { 'X-User-Id': id } : {},
  });
  return ctx;
}
async function load(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(900);
}
// open every collapsed <section> (associate client cards) by clicking headers lacking a table
async function expandAllSections(page) {
  const sections = await page.$$('section');
  for (const s of sections) {
    const hasTable = await s.$('table');
    if (!hasTable) { const h = await s.$('header'); if (h) { await h.click(); await sleep(180); } }
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ───────────── ASSOCIATE (Alice Chen 2001) ─────────────
  await step('associate', async () => {
    const ctx = await ctxFor(browser, '2001');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('Access report', { exact: false }).first().waitFor({ timeout: 15000 });
    await expandAllSections(page);
    await sleep(400);
    await shot(page, 'assoc-dashboard', { fullPage: true });

    // focused attestation table: screenshot the Natixis section (has used=No + dispute rows)
    await step('assoc-attest-table', async () => {
      const sec = page.locator('section', { hasText: 'Natixis' }).first();
      await sec.scrollIntoViewIfNeeded();
      await sec.screenshot({ path: path.join(OUT, 'assoc-attest-table.png') });
      console.log('  OK assoc-attest-table'); ok++;
    });

    // remark modal on the dispute tool
    await step('assoc-remark-modal', async () => {
      await page.getByRole('button', { name: /no longer use this tool/i }).first().click();
      await page.getByText('Your remark', { exact: false }).waitFor({ timeout: 8000 });
      await sleep(300);
      await shot(page, 'assoc-remark-modal');
      await page.keyboard.press('Escape').catch(() => {});
    });

    // cycle picker open
    await step('assoc-cycle-picker', async () => {
      await page.getByText('Q1 2026 Attestation', { exact: false }).first().click();
      await sleep(400);
      await shot(page, 'assoc-cycle-picker');
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.click(10, 10);
    });

    // dark mode
    await step('assoc-dark', async () => {
      await page.getByTitle('Switch to dark mode').click();
      await sleep(500);
      await shot(page, 'dark-mode', { fullPage: true });
      await page.getByTitle('Switch to light mode').click().catch(() => {});
    });
    await ctx.close();
  });

  // ───────────── ASSOCIATE submitted/locked (James Evans 4001) ─────────────
  await step('assoc-submitted', async () => {
    const ctx = await ctxFor(browser, '4001');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('Access report', { exact: false }).first().waitFor({ timeout: 15000 });
    await expandAllSections(page);
    await sleep(400);
    await shot(page, 'assoc-submitted', { fullPage: true });
    await ctx.close();
  });

  // ───────────── LOGIN (dev form, no header) ─────────────
  await step('login-form', async () => {
    const ctx = await ctxFor(browser, null);
    const page = await ctx.newPage();
    await load(page);
    await sleep(800);
    await shot(page, 'login-form');
    await ctx.close();
  });

  // ───────────── MANAGER (Morgan Drake 2011) ─────────────
  await step('manager', async () => {
    const ctx = await ctxFor(browser, '2011');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('Manager view', { exact: false }).first().waitFor({ timeout: 15000 });
    await sleep(500);
    await shot(page, 'mgr-overview', { fullPage: true });

    await step('mgr-member-detail', async () => {
      await page.getByText('Sophie Laurent', { exact: false }).first().click();
      await page.getByText('Per-client progress', { exact: false }).waitFor({ timeout: 8000 });
      await sleep(500);
      await shot(page, 'mgr-member-detail', { fullPage: true });
    });

    // Access management tab
    await step('access', async () => {
      await page.getByRole('button', { name: 'Access', exact: true }).click();
      await page.getByText('Access management', { exact: false }).first().waitFor({ timeout: 8000 });
      await sleep(500);
      await page.getByText('Sophie Laurent', { exact: false }).first().click();
      await page.getByText('Tool access', { exact: false }).first().waitFor({ timeout: 8000 });
      await sleep(600);
      await shot(page, 'access-overview', { fullPage: true });

      // fill the grant form to show Open vs Full
      await step('access-grant-form', async () => {
        const selects = page.locator('form select');
        await selects.nth(0).selectOption({ label: /Barclays/i }).catch(async () => {
          await selects.nth(0).selectOption({ index: 1 });
        });
        await sleep(300);
        await selects.nth(1).selectOption({ index: 1 }).catch(() => {});
        await sleep(300);
        await page.getByRole('button', { name: 'Open access', exact: true }).click().catch(() => {});
        await sleep(300);
        const form = page.locator('form').first();
        await form.screenshot({ path: path.join(OUT, 'access-grant-form.png') });
        console.log('  OK access-grant-form'); ok++;
      });
    });
    await ctx.close();
  });

  // ───────────── ADMIN (PRV001) ─────────────
  await step('admin', async () => {
    const ctx = await ctxFor(browser, 'PRV001');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('Admin Dashboard', { exact: false }).first().waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(page, 'admin-dashboard', { fullPage: true });

    await step('admin-add-client', async () => {
      await page.getByRole('button', { name: 'Add Client', exact: true }).click();
      await page.getByRole('heading', { name: 'Add Client' }).waitFor({ timeout: 6000 });
      await sleep(300);
      await shot(page, 'admin-add-client');
      await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
      await sleep(200);
    });
    await step('admin-add-tool', async () => {
      await page.getByRole('button', { name: 'Add Tool', exact: true }).click();
      await page.getByRole('heading', { name: 'Add Tool' }).waitFor({ timeout: 6000 });
      await sleep(300);
      await shot(page, 'admin-add-tool');
      await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
      await sleep(200);
    });
    await step('admin-notifications', async () => {
      await page.getByTitle('Notifications').click();
      await sleep(400);
      await shot(page, 'admin-notifications');
      await page.mouse.click(10, 10);
      await sleep(200);
    });
    await step('admin-drilldown', async () => {
      await page.locator('div', { hasText: /^DTC Settlements$/ }).first().click({ timeout: 4000 }).catch(async () => {
        await page.getByText('DTC Settlements', { exact: false }).first().click();
      });
      await page.getByText('All Departments', { exact: false }).waitFor({ timeout: 8000 });
      await sleep(700);
      await shot(page, 'admin-drilldown', { fullPage: true });
    });

    // Users directory (Admin only): sidebar Associate View -> top Users tab
    await step('users-directory', async () => {
      await page.getByText('Associate View', { exact: true }).click();
      await page.getByText('Access report', { exact: false }).first().waitFor({ timeout: 8000 });
      await page.getByRole('button', { name: 'Users', exact: true }).click();
      await page.getByText('All Users', { exact: false }).first().waitFor({ timeout: 8000 });
      await sleep(500);
      await shot(page, 'users-directory', { fullPage: true });
      await step('users-edit-modal', async () => {
        await page.getByTitle('Edit user').first().click();
        await page.getByRole('heading', { name: 'Edit User' }).waitFor({ timeout: 6000 });
        await sleep(300);
        await shot(page, 'users-edit-modal');
        await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
      });
    });
    await ctx.close();
  });

  // ───────────── GFH (Carlos Patel 1010) ─────────────
  await step('gfh', async () => {
    const ctx = await ctxFor(browser, '1010');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('GFH View', { exact: false }).first().waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(page, 'gfh-dashboard', { fullPage: true });
    await ctx.close();
  });

  // ───────────── GFH DELEGATE (David Kumar 1004) ─────────────
  await step('gfhdelegate', async () => {
    const ctx = await ctxFor(browser, '1004');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('Admin Dashboard', { exact: false }).first().waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(page, 'gfhdelegate-dashboard', { fullPage: true });
    await ctx.close();
  });

  // ───────────── IFH (Priya Johnson 1006) ─────────────
  await step('ifh', async () => {
    const ctx = await ctxFor(browser, '1006');
    const page = await ctx.newPage();
    await load(page);
    await page.getByText('IFH View', { exact: false }).first().waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(page, 'ifh-dashboard', { fullPage: true });
    await ctx.close();
  });

  await browser.close();
  console.log(`\nDONE. ok=${ok} fail=${fail}`);
})();
