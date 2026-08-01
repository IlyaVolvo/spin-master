import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import {
  BASE_URL,
  CHROME_PATH,
  TUTORIAL_PASSWORD,
  VIEWPORT,
} from './constants';
import { hotspotForButtonText, hotspotForSelector, type HotspotPct } from './hotspot';

export type CaptureContext = {
  page: Page;
  baseUrl: string;
  loginAs: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  delay: (ms: number) => Promise<void>;
  clickButtonContaining: (text: string) => Promise<boolean>;
  hotspotFor: (selector: string) => Promise<HotspotPct>;
  hotspotForButton: (text: string) => Promise<HotspotPct>;
  screenshotPath: string;
};

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function launchTutorialBrowser(): Promise<Browser> {
  const fs = await import('fs');
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Chrome not found at ${CHROME_PATH}. Set PUPPETEER_EXECUTABLE_PATH.`);
  }
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    args: [
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
}

async function waitForLoggedIn(page: Page, timeout = 45000): Promise<void> {
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Logout')),
    { timeout },
  );
}

async function waitForLoginForm(page: Page, timeout = 20000): Promise<void> {
  await page.waitForSelector('input[type="email"]', { timeout });
}

export async function clickButtonContaining(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const b = buttons.find((x) => (x.textContent || '').includes(t));
    if (!b) return false;
    b.click();
    return true;
  }, text);
}

export async function loginAs(page: Page, email: string): Promise<void> {
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
  await page.keyboard.type(TUTORIAL_PASSWORD, { delay: 10 });
  await page.click('button[type="submit"]');
  await waitForLoggedIn(page);
}

export async function logout(page: Page): Promise<void> {
  // Exit kiosk first if needed
  await clickButtonContaining(page, 'Restore privileges');
  await delay(400);
  const hasLogout = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Logout')),
  );
  if (hasLogout) {
    await clickButtonContaining(page, 'Logout');
    await waitForLoginForm(page);
    return;
  }
  await page.goto(`${BASE_URL}/players`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clickButtonContaining(page, 'Logout');
  await waitForLoginForm(page);
}

/** Leave the browser on the login form (logged out). */
export async function goToLoginForm(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/players`, { waitUntil: 'networkidle2', timeout: 60000 });
  const onForm = await page.$('input[type="email"]');
  if (!onForm) {
    try {
      await waitForLoggedIn(page, 8000);
      await clickButtonContaining(page, 'Logout');
    } catch {
      /* ignore */
    }
    await waitForLoginForm(page);
  } else {
    await waitForLoginForm(page);
  }
}

export function makeCaptureContext(page: Page, screenshotPath: string): CaptureContext {
  return {
    page,
    baseUrl: BASE_URL,
    screenshotPath,
    delay,
    loginAs: (email) => loginAs(page, email),
    logout: () => logout(page),
    clickButtonContaining: (text) => clickButtonContaining(page, text),
    hotspotFor: (selector) => hotspotForSelector(page, selector),
    hotspotForButton: (text) => hotspotForButtonText(page, text),
  };
}
