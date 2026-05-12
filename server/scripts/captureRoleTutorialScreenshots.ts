/**
 * Captures PNG screenshots for client/public/role-tutorials/ using the real UI.
 *
 * Prerequisites:
 *   1. App reachable at ROLE_TUTORIAL_BASE_URL (default http://localhost:3000)
 *   2. Demo users from seedRoleTutorialUsers.ts loaded in the same database the API uses
 *   3. Chrome/Chromium at PUPPETEER_EXECUTABLE_PATH (defaults to macOS Google Chrome)
 *
 *   cd server && npx tsx scripts/seedRoleTutorialUsers.ts
 *   cd server && npx tsx scripts/captureRoleTutorialScreenshots.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { type Page } from 'puppeteer-core';

const ASSETS_DIR = path.resolve(__dirname, '../../client/public/role-tutorials/assets');
const BASE_URL = (process.env.ROLE_TUTORIAL_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const PASSWORD = 'TutorialDemo#2026'; // keep in sync with ROLE_TUTORIAL_PASSWORD in seedRoleTutorialUsers.ts

const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome-stable');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLoggedIn(page: Page, timeout = 45000): Promise<void> {
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Logout')),
    { timeout }
  );
}

async function waitForLoginForm(page: Page, timeout = 20000): Promise<void> {
  await page.waitForSelector('input[type="email"]', { timeout });
}

async function clickButtonContaining(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const b = buttons.find((x) => (x.textContent || '').includes(t));
    if (!b) return false;
    b.click();
    return true;
  }, text);
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE_URL}/players`, { waitUntil: 'networkidle2', timeout: 60000 });
  const onForm = await page.$('input[type="email"]');
  if (!onForm) {
    try {
      await waitForLoggedIn(page, 8000);
      await clickButtonContaining(page, 'Logout');
      await waitForLoginForm(page);
    } catch {
      await waitForLoginForm(page);
    }
  } else {
    await waitForLoginForm(page);
  }

  await page.click('input[type="email"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(email, { delay: 10 });
  await page.click('input[type="password"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(PASSWORD, { delay: 10 });
  await page.click('button[type="submit"]');
  await waitForLoggedIn(page);
}

async function logout(page: Page): Promise<void> {
  await clickButtonContaining(page, 'Logout');
  await waitForLoginForm(page);
}

async function clipToolbarRow(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const matchBtn = buttons.find((b) => (b.textContent || '').includes('+ Match'));
    const anchor = matchBtn?.closest('div')?.parentElement || matchBtn?.parentElement || document.body;
    const r = anchor.getBoundingClientRect();
    const pad = 12;
    return {
      x: 0,
      y: Math.max(0, Math.floor(r.top) - pad),
      width: Math.min(window.innerWidth, 1280),
      height: Math.min(Math.ceil(r.height) + pad * 2, 240),
    };
  });
}

async function clipHeader(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const el = document.querySelector('.header');
    if (!el) return { x: 0, y: 0, width: 1280, height: 140 };
    const r = el.getBoundingClientRect();
    return { x: 0, y: 0, width: Math.min(r.width, 1280), height: Math.min(r.height + 8, 200) };
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`Chrome not found at ${CHROME_PATH}. Set PUPPETEER_EXECUTABLE_PATH.`);
    process.exit(1);
  }
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--window-size=1280,900', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await page.goto(`${BASE_URL}/players`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.screenshot({ path: path.join(ASSETS_DIR, 'login.png'), type: 'png' });

    await loginAs(page, 'tutorial-player@spin-master.local');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'player-players.png'), type: 'png' });
    const playerToolbar = await clipToolbarRow(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'player-toolbar.png'), type: 'png', clip: playerToolbar });

    if (await clickButtonContaining(page, '+ Match')) {
      await delay(700);
      await page.screenshot({ path: path.join(ASSETS_DIR, 'player-record-match.png'), type: 'png' });
    }

    await logout(page);

    await loginAs(page, 'tutorial-organizer@spin-master.local');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'organizer-players.png'), type: 'png' });
    const orgToolbar = await clipToolbarRow(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'organizer-toolbar.png'), type: 'png', clip: orgToolbar });

    if (await clickButtonContaining(page, '+ Tournament')) {
      await delay(900);
      await page.screenshot({ path: path.join(ASSETS_DIR, 'organizer-new-tournament.png'), type: 'png' });
    }

    await logout(page);

    await loginAs(page, 'tutorial-admin@spin-master.local');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'admin-players.png'), type: 'png' });
    const admToolbar = await clipToolbarRow(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'admin-toolbar.png'), type: 'png', clip: admToolbar });

    const hdr = await clipHeader(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'admin-header-gear.png'), type: 'png', clip: hdr });

    await page.goto(`${BASE_URL}/system-settings`, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(600);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'admin-system-settings.png'), type: 'png' });

    console.log('Wrote screenshots to', ASSETS_DIR);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
