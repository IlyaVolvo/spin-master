import type { Page } from 'puppeteer-core';
import type { CaptureContext } from './browser';
import { goToLoginForm } from './browser';
import { TUTORIAL_PASSWORD } from './constants';
import { boxToPct, type HotspotPct } from './hotspot';
import { VIEWPORT } from './constants';
import type { ScenarioStepDef } from './types';

export function loginFormStep(
  email: string,
  opts: { id?: string; title?: string; body?: string } = {},
): ScenarioStepDef {
  return {
    id: opts.id || 'login-form',
    title: opts.title || 'Login screen',
    body:
      opts.body ||
      'Use the tutorial demo account for this role. Click Sign in after the credentials are filled.',
    actionHint: 'Click Sign in',
    capture: async (ctx) => {
      await goToLoginForm(ctx.page);
      await ctx.page.click('input[type="email"]', { clickCount: 3 });
      await ctx.page.keyboard.type(email, { delay: 5 });
      await ctx.page.click('input[type="password"]', { clickCount: 3 });
      await ctx.page.keyboard.type(TUTORIAL_PASSWORD, { delay: 5 });
      return { hotspot: await ctx.hotspotFor('button[type="submit"]') };
    },
  };
}

export async function ensureLoggedIn(ctx: CaptureContext, email: string): Promise<void> {
  const loggedIn = await ctx.page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Logout')),
  );
  if (!loggedIn) {
    await ctx.loginAs(email);
  }
}

export async function gotoPath(ctx: CaptureContext, path: string): Promise<void> {
  await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await ctx.delay(500);
}

export async function hotspotForHref(page: Page, href: string): Promise<HotspotPct | undefined> {
  const el = await page.$(`a[href="${href}"]`);
  if (!el) return undefined;
  const box = await el.boundingBox();
  if (!box) return undefined;
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForTitle(page: Page, title: string): Promise<HotspotPct | undefined> {
  const el = await page.$(`[title="${title}"]`);
  if (!el) return undefined;
  const box = await el.boundingBox();
  if (!box) return undefined;
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function openAdminMenu(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const byPopup = document.querySelector(
      '.header button[aria-haspopup="menu"]',
    ) as HTMLButtonElement | null;
    if (byPopup) {
      byPopup.click();
      return true;
    }
    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const admin = buttons.find((b) => /^\s*Admin/.test(b.textContent || ''));
    if (admin) {
      admin.click();
      return true;
    }
    return false;
  });
  if (!clicked) throw new Error('Admin menu trigger not found');
  await ctx.delay(400);
}

export async function openTournamentWizard(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/players');
  const opened = await ctx.clickButtonContaining('+ Tournament');
  if (!opened) throw new Error('+ Tournament not found');
  await ctx.delay(800);
}

export async function selectTournamentType(ctx: CaptureContext, value: string): Promise<void> {
  // Expand Preliminary group if needed (group header is a clickable div, not a label)
  if (value.startsWith('PRELIMINARY')) {
    const expanded = await ctx.page.evaluate(() => {
      const already = !!document.querySelector(
        'input[name="tournamentType"][value="PRELIMINARY_WITH_FINAL_ROUND_ROBIN"]',
      );
      if (already) return true;
      const span = [...document.querySelectorAll('span')].find(
        (s) => (s.textContent || '').trim() === 'Preliminary',
      );
      const row = span?.parentElement as HTMLElement | null;
      if (!row) return false;
      row.click();
      return true;
    });
    if (!expanded) throw new Error('Preliminary group header not found');
    await ctx.delay(400);
  }
  const selector = `input[name="tournamentType"][value="${value}"]`;
  await ctx.page.waitForSelector(selector, { timeout: 15000 });
  await ctx.page.click(selector);
  await ctx.delay(300);
}

export async function hotspotForTournamentType(
  ctx: CaptureContext,
  value: string,
): Promise<HotspotPct> {
  return ctx.hotspotFor(`input[name="tournamentType"][value="${value}"]`);
}

/** Open + Tournament → Round Robin → player selection step. */
export async function openRoundRobinPlayerSelection(ctx: CaptureContext): Promise<void> {
  await openTournamentWizard(ctx);
  await selectTournamentType(ctx, 'ROUND_ROBIN');
  const ok = (await ctx.clickButtonContaining('Next')) || (await ctx.clickButtonContaining('Continue'));
  if (!ok) throw new Error('Next/Continue missing after Round Robin type');
  await ctx.delay(900);
  await ctx.page.waitForSelector('tbody input[type="checkbox"]', { timeout: 15000 });
}

/** Hotspot for the nth player checkbox in the tournament picker table. */
export async function hotspotForTournamentPlayerCheckbox(
  ctx: CaptureContext,
  index = 0,
): Promise<HotspotPct> {
  const boxes = await ctx.page.$$('tbody input[type="checkbox"]');
  const el = boxes[index];
  if (!el) throw new Error(`Tournament player checkbox #${index} not found`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Tournament player checkbox #${index} has no box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Click the first `count` unchecked player checkboxes (or leave already-checked). */
export async function selectTournamentPlayers(ctx: CaptureContext, count: number): Promise<number> {
  const selected = await ctx.page.evaluate((n) => {
    const boxes = [...document.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];
    let done = 0;
    for (const box of boxes) {
      if (done >= n) break;
      if (!box.checked) box.click();
      if (box.checked) done += 1;
    }
    return done;
  }, count);
  await ctx.delay(400);
  return selected;
}

/** Reach Round Robin confirm modal with at least `playerCount` players selected. */
export async function openRoundRobinConfirm(
  ctx: CaptureContext,
  playerCount = 4,
): Promise<void> {
  await openRoundRobinPlayerSelection(ctx);
  const n = await selectTournamentPlayers(ctx, playerCount);
  if (n < 2) throw new Error(`Need ≥2 players selected, got ${n}`);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue after player selection missing');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Create Tournament'),
      ),
    { timeout: 15000 },
  );
}
