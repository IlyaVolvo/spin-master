import type { Page } from 'puppeteer-core';
import type { CaptureContext } from './browser';
import { goToLoginForm } from './browser';
import {
  TUTORIAL_COMPLETED_RR_NAME,
  TUTORIAL_MONTHLY_PLAN_NAME,
  TUTORIAL_PASSWORD,
  TUTORIAL_SCORE_PIN,
  TUTORIAL_UPDATED_CLUB_NAME,
  TUTORIAL_UPDATED_TIMEZONE,
  VIEWPORT,
} from './constants';
import { boxToPct, type HotspotPct } from './hotspot';
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

/** Admin → System Settings. */
export async function openSystemSettings(ctx: CaptureContext, adminEmail: string): Promise<void> {
  await ensureAdminSession(ctx, adminEmail);
  await gotoPath(ctx, '/system-settings');
  await ctx.delay(800);
  await ctx.page.waitForSelector('[data-testid="system-settings-club-name"]', { timeout: 20000 });
}

/** Open a top-level System Settings accordion by its title (idempotent). */
export async function ensureSystemSectionOpen(ctx: CaptureContext, title: string): Promise<void> {
  const state = await ctx.page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      return label === t || label.startsWith(t);
    }) as HTMLButtonElement | undefined;
    if (!btn) return 'missing';
    return btn.getAttribute('aria-expanded') === 'true' ? 'open' : 'closed';
  }, title);
  if (state === 'missing') throw new Error(`System Settings section "${title}" not found`);
  if (state === 'open') return;
  const clicked = await ctx.page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      return label === t || label.startsWith(t);
    }) as HTMLButtonElement | undefined;
    btn?.click();
    return Boolean(btn);
  }, title);
  if (!clicked) throw new Error(`Could not open section "${title}"`);
  await ctx.delay(400);
}

export async function hotspotForSystemSection(ctx: CaptureContext, title: string): Promise<HotspotPct> {
  await ctx.page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      return label === t || label.startsWith(t);
    }) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  }, title);
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle((t) => {
    return (
      [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
        const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
        return label === t || label.startsWith(t);
      }) || null
    );
  }, title);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Section "${title}" not found for hotspot`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Section "${title}" has no bounding box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Open a Tournament Rules subsection (Round Robin, Multi Round Robins, …). */
export async function ensureTournamentRuleOpen(ctx: CaptureContext, title: string): Promise<void> {
  await ensureSystemSectionOpen(ctx, 'Tournament Rules');
  const state = await ctx.page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      return label === t;
    }) as HTMLButtonElement | undefined;
    if (!btn) return 'missing';
    return btn.getAttribute('aria-expanded') === 'true' ? 'open' : 'closed';
  }, title);
  if (state === 'missing') throw new Error(`Tournament rule "${title}" not found`);
  if (state === 'open') return;
  await ctx.page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      return label === t;
    }) as HTMLButtonElement | undefined;
    btn?.click();
  }, title);
  await ctx.delay(400);
}

export async function setSystemClubName(ctx: CaptureContext, name: string): Promise<void> {
  await ctx.page.waitForSelector('[data-testid="system-settings-club-name"]', { timeout: 10000 });
  await ctx.page.click('[data-testid="system-settings-club-name"]', { clickCount: 3 });
  await ctx.page.keyboard.type(name, { delay: 8 });
  await ctx.delay(200);
}

export async function setSystemClubTimezone(ctx: CaptureContext, timezone: string): Promise<void> {
  await ctx.page.waitForSelector('[data-testid="system-settings-club-timezone"]', { timeout: 10000 });
  const ok = await ctx.page.evaluate((tz) => {
    const select = document.querySelector(
      '[data-testid="system-settings-club-timezone"]',
    ) as HTMLSelectElement | null;
    if (!select) return false;
    select.value = tz;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value === tz;
  }, timezone);
  if (!ok) throw new Error(`Could not set club timezone to ${timezone}`);
  await ctx.delay(200);
}

/** Set a visible BoundedNumericInput by aria-label (must be unique among currently open fields). */
export async function setSystemNumericByAriaLabel(
  ctx: CaptureContext,
  ariaLabel: string,
  value: string,
): Promise<void> {
  const filled = await ctx.page.evaluate(
    (label, val) => {
      const input = document.querySelector(
        `input[aria-label="${label}"]`,
      ) as HTMLInputElement | null;
      if (!input) return false;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      proto?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    },
    ariaLabel,
    value,
  );
  if (!filled) throw new Error(`Numeric field "${ariaLabel}" not found`);
  await ctx.delay(250);
}

export async function clickApplyAchievementsToAll(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.clickButtonContaining('Apply to all');
  if (!clicked) throw new Error('Apply to all button not found');
  await ctx.delay(300);
}

export async function hotspotForSystemSave(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Save',
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'nearest' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Save') ||
      null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Save button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Save button has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function saveSystemSettings(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim();
      return t === 'Save' && !(b as HTMLButtonElement).disabled;
    }) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Save button missing or disabled');
  await ctx.page.waitForFunction(
    () => /All saved|Settings saved|saved successfully/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(500);
}

/** Apply the showcase System Settings edits (branding, RR, Multi RR, achievements). */
export async function applyShowcaseSystemConfigEdits(ctx: CaptureContext): Promise<void> {
  await setSystemClubName(ctx, TUTORIAL_UPDATED_CLUB_NAME);
  await setSystemClubTimezone(ctx, TUTORIAL_UPDATED_TIMEZONE);
  await ensureTournamentRuleOpen(ctx, 'Round Robin');
  await setSystemNumericByAriaLabel(ctx, 'Early Complete Min %', '80');
  await ensureTournamentRuleOpen(ctx, 'Multi Round Robins');
  await setSystemNumericByAriaLabel(ctx, 'Default Size', '5');
  await ensureSystemSectionOpen(ctx, 'Public Achievements');
  await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '10');
  await clickApplyAchievementsToAll(ctx);
}

/** Admin → Payment Plans tab. */
export async function openPaymentPlans(ctx: CaptureContext, adminEmail: string): Promise<void> {
  await ensureAdminSession(ctx, adminEmail);
  await gotoPath(ctx, '/payments?tab=plans');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      /Club Payment Plans|Payment Plans/i.test(document.body.innerText || '') &&
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('+ New Plan'),
      ),
    { timeout: 20000 },
  );
}

/** Hotspot for + Segment on a named plan family card. */
export async function hotspotForPlanFamilySegmentAdd(
  ctx: CaptureContext,
  planName: string,
): Promise<HotspotPct> {
  await ctx.page.evaluate((name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => {
      const t = c.textContent || '';
      return t.includes(name) && t.includes('+ Segment');
    }) as HTMLElement | undefined;
    const btn = [...(card?.querySelectorAll('button') || [])].find((b) =>
      (b.textContent || '').includes('+ Segment'),
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center', inline: 'center' });
  }, planName);
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle((name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => {
      const t = c.textContent || '';
      return t.includes(name) && t.includes('+ Segment');
    });
    return (
      [...(card?.querySelectorAll('button') || [])].find((b) =>
        (b.textContent || '').includes('+ Segment'),
      ) || null
    );
  }, planName);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`+ Segment not found for plan "${planName}"`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('+ Segment has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Open New Plan form via + Segment on an existing family (presets Junior when available). */
export async function openPlanFamilySegmentForm(
  ctx: CaptureContext,
  planName = TUTORIAL_MONTHLY_PLAN_NAME,
): Promise<void> {
  const opened = await ctx.page.evaluate((name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => {
      const t = c.textContent || '';
      return t.includes(name) && t.includes('+ Segment');
    });
    const btn = [...(card?.querySelectorAll('button') || [])].find((b) =>
      (b.textContent || '').includes('+ Segment'),
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, planName);
  if (!opened) throw new Error(`+ Segment not found for plan "${planName}"`);
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('h4')].some((h) =>
        (h.textContent || '').includes('New Plan'),
      ),
    { timeout: 10000 },
  );
}

/** Ensure the New Plan form segment select is Junior. */
export async function selectPlanFormSegment(ctx: CaptureContext, segment: string): Promise<void> {
  const ok = await ctx.page.evaluate((seg) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((l) => (l.textContent || '').trim() === 'Segment');
    const select = label?.parentElement?.querySelector('select') as HTMLSelectElement | null;
    if (!select) return false;
    const opt = [...select.options].find((o) => o.value === seg || o.textContent === seg);
    if (!opt) return false;
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value === opt.value;
  }, segment);
  if (!ok) throw new Error(`Could not select plan segment "${segment}"`);
  await ctx.delay(200);
}

/** Set the Total price ($) field on the plan form (TIME plans). */
export async function fillPlanFormTotalPrice(ctx: CaptureContext, dollars: string): Promise<void> {
  const filled = await ctx.page.evaluate((val) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((l) => /Total price/i.test(l.textContent || ''));
    const input = label?.parentElement?.querySelector('input') as HTMLInputElement | null;
    if (!input) return false;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    proto?.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }, dollars);
  if (!filled) throw new Error('Total price input not found');
  await ctx.delay(250);
}

export async function hotspotForCreatePlan(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Create Plan'),
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Create Plan'),
      ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Create Plan button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Create Plan has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function submitCreatePlan(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').trim() === 'Create Plan',
    ) as HTMLButtonElement | undefined;
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Create Plan button missing or disabled');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    () =>
      ![...document.querySelectorAll('h4')].some((h) =>
        (h.textContent || '').includes('New Plan'),
      ) || /Plan created/i.test(document.body.innerText || ''),
    { timeout: 15000 },
  );
  await ctx.delay(400);
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

/**
 * Ensure an admin session that can enter kiosk.
 * In check-in kiosk, Logout is hidden — treat Restore privileges as still logged in.
 */
export async function ensureAdminSession(ctx: CaptureContext, email: string): Promise<void> {
  const state = await ctx.page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent || '');
    return {
      logout: buttons.some((t) => t.includes('Logout')),
      restore: buttons.some((t) => t.includes('Restore privileges')),
    };
  });
  if (state.logout || state.restore) return;
  await ctx.loginAs(email);
}

/** Admin → Kiosk → Check-in (leaves the check-in kiosk UI active). */
export async function enterCheckinKiosk(ctx: CaptureContext, adminEmail: string): Promise<void> {
  await ensureAdminSession(ctx, adminEmail);
  await gotoPath(ctx, '/players');
  const already = await ctx.page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) =>
      (b.textContent || '').includes('Restore privileges'),
    ),
  );
  if (!already) {
    const opened = await ctx.clickButtonContaining('Kiosk');
    if (!opened) throw new Error('Kiosk button not found');
    await ctx.delay(400);
    const started = await ctx.clickButtonContaining('Check-in');
    if (!started) throw new Error('Check-in mode button not found');
    await ctx.delay(1100);
  }
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Restore privileges'),
      ),
    { timeout: 15000 },
  );
}

function memberNameNeedle(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

const PLAYER_HISTORY_BUTTON_LABEL = 'Game history for the player against selected group';

/** Hotspot for the row 📜 history control. */
export async function hotspotForPlayerHistoryButton(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<HotspotPct> {
  await ctx.page.evaluate(
    (first, last, label) => {
      const row = [...document.querySelectorAll('tr')].find((r) => {
        const t = r.textContent || '';
        return t.includes(first) && t.includes(last);
      });
      const btn = [...(row?.querySelectorAll('button') || [])].find(
        (b) => b.getAttribute('aria-label') === label || b.getAttribute('title') === label,
      ) as HTMLElement | undefined;
      btn?.scrollIntoView({ block: 'center' });
    },
    firstName,
    lastName,
    PLAYER_HISTORY_BUTTON_LABEL,
  );
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle(
    (first, last, label) => {
      const row = [...document.querySelectorAll('tr')].find((r) => {
        const t = r.textContent || '';
        return t.includes(first) && t.includes(last);
      });
      return (
        [...(row?.querySelectorAll('button') || [])].find(
          (b) => b.getAttribute('aria-label') === label || b.getAttribute('title') === label,
        ) || null
      );
    },
    firstName,
    lastName,
    PLAYER_HISTORY_BUTTON_LABEL,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`History button not found for ${firstName} ${lastName}`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`History button has no bounding box for ${firstName} ${lastName}`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Enter history selection via the row 📜 control (pre-selects all opponents). */
export async function startPlayerHistorySelection(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  const clicked = await ctx.page.evaluate(
    (first, last, label) => {
      const row = [...document.querySelectorAll('tr')].find((r) => {
        const t = r.textContent || '';
        return t.includes(first) && t.includes(last);
      });
      const btn = [...(row?.querySelectorAll('button') || [])].find(
        (b) => b.getAttribute('aria-label') === label || b.getAttribute('title') === label,
      ) as HTMLButtonElement | undefined;
      if (!btn) return false;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    },
    firstName,
    lastName,
    PLAYER_HISTORY_BUTTON_LABEL,
  );
  if (!clicked) throw new Error(`History button not found for ${firstName} ${lastName}`);
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('View History'),
      ),
    { timeout: 10000 },
  );
}

/** Clear opponent selection so View History opens one-player rating history. */
export async function clearHistoryOpponents(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.clickButtonContaining('Deselect All');
  if (!clicked) throw new Error('Deselect All not found');
  await ctx.delay(300);
  await ctx.page.waitForFunction(
    () => /0 opponents? selected/i.test(document.body.innerText || ''),
    { timeout: 5000 },
  );
}

export async function hotspotForViewHistory(ctx: CaptureContext): Promise<HotspotPct> {
  return ctx.hotspotForButton('View History');
}

/** Open one-player Rating History (select player, clear opponents, View History). */
export async function openPlayerRatingHistory(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  await gotoPath(ctx, '/players');
  await ctx.delay(500);
  await startPlayerHistorySelection(ctx, firstName, lastName);
  await clearHistoryOpponents(ctx);
  const opened = await ctx.clickButtonContaining('View History');
  if (!opened) throw new Error('View History button missing');
  await ctx.page.waitForFunction(
    () => /Rating History|Full Rating History/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(500);
}

/** Enter multi-player Stats selection from the Players toolbar. */
export async function startStatsSelection(ctx: CaptureContext): Promise<void> {
  const already = await ctx.page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) =>
      (b.textContent || '').includes('View Statistics'),
    ),
  );
  if (already) return;
  const opened = await ctx.clickButtonContaining('Stats');
  if (!opened) throw new Error('Stats button not found');
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('View Statistics'),
      ),
    { timeout: 10000 },
  );
}

export async function hotspotForStatsToolbar(ctx: CaptureContext): Promise<HotspotPct> {
  try {
    return await ctx.hotspotForButton('Stats');
  } catch {
    return ctx.hotspotFor('[aria-label="Show statistics for many players"]');
  }
}

/** Toggle a roster row checkbox while in Stats selection mode. */
export async function togglePlayerForStats(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  const toggled = await ctx.page.evaluate(
    (first, last) => {
      const row = [...document.querySelectorAll('tr')].find((r) => {
        const t = r.textContent || '';
        return t.includes(first) && t.includes(last);
      });
      const input = row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (!input) return false;
      input.scrollIntoView({ block: 'center' });
      input.click();
      return true;
    },
    firstName,
    lastName,
  );
  if (!toggled) throw new Error(`Stats checkbox not found for ${firstName} ${lastName}`);
  await ctx.delay(250);
}

export async function hotspotForPlayerStatsCheckbox(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<HotspotPct> {
  await ctx.page.evaluate(
    (first, last) => {
      const row = [...document.querySelectorAll('tr')].find((r) => {
        const t = r.textContent || '';
        return t.includes(first) && t.includes(last);
      });
      const input = row?.querySelector('input[type="checkbox"]') as HTMLElement | null;
      input?.scrollIntoView({ block: 'center' });
    },
    firstName,
    lastName,
  );
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle((first, last) => {
    const row = [...document.querySelectorAll('tr')].find((r) => {
      const t = r.textContent || '';
      return t.includes(first) && t.includes(last);
    });
    return row?.querySelector('input[type="checkbox"]') || null;
  }, firstName, lastName);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Stats checkbox not found for ${firstName} ${lastName}`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Stats checkbox has no bounding box for ${firstName} ${lastName}`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForViewStatistics(ctx: CaptureContext): Promise<HotspotPct> {
  return ctx.hotspotForButton('View Statistics');
}

/** Select several players and open the Statistics chart page. */
export async function openMultiPlayerStatistics(
  ctx: CaptureContext,
  members: ReadonlyArray<{ firstName: string; lastName: string }>,
): Promise<void> {
  await gotoPath(ctx, '/players');
  await ctx.delay(500);
  await startStatsSelection(ctx);
  for (const m of members) {
    await togglePlayerForStats(ctx, m.firstName, m.lastName);
  }
  const opened = await ctx.clickButtonContaining('View Statistics');
  if (!opened) throw new Error('View Statistics button missing');
  await ctx.page.waitForFunction(
    () => /Player Statistics|Rating History for/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(700);
}

export type KioskAttendanceAction = 'Check-in' | 'Check-out';

/** Hotspot for a member’s row Check-in / Check-out button in kiosk. */
export async function hotspotForMemberAttendanceButton(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
  action: KioskAttendanceAction,
): Promise<HotspotPct> {
  const name = memberNameNeedle(firstName, lastName);
  await ctx.page.evaluate(
    (needle, actionLabel) => {
      const row = [...document.querySelectorAll('tr')].find((r) =>
        (r.textContent || '').includes(needle),
      );
      const btn = [...(row?.querySelectorAll('button') || [])].find((b) => {
        const t = (b.textContent || '').trim();
        return actionLabel === 'Check-out'
          ? t === 'Check-out'
          : t === 'Check-in' || t.includes('free re-entry');
      }) as HTMLElement | undefined;
      btn?.scrollIntoView({ block: 'center' });
    },
    name,
    action,
  );
  await ctx.delay(250);
  const handle = await ctx.page.evaluateHandle(
    (needle, actionLabel) => {
      const row = [...document.querySelectorAll('tr')].find((r) =>
        (r.textContent || '').includes(needle),
      );
      return (
        [...(row?.querySelectorAll('button') || [])].find((b) => {
          const t = (b.textContent || '').trim();
          return actionLabel === 'Check-out'
            ? t === 'Check-out'
            : t === 'Check-in' || t.includes('free re-entry');
        }) || null
      );
    },
    name,
    action,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`${action} button not found for ${name}`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`${action} button for ${name} has no box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForMemberCheckinButton(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<HotspotPct> {
  return hotspotForMemberAttendanceButton(ctx, firstName, lastName, 'Check-in');
}

/** Open the PIN modal for a member’s Check-in / Check-out row button. */
export async function openMemberAttendancePinModal(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
  action: KioskAttendanceAction,
): Promise<void> {
  const name = memberNameNeedle(firstName, lastName);
  await ctx.page.evaluate(
    (needle, actionLabel) => {
      const row = [...document.querySelectorAll('tr')].find((r) =>
        (r.textContent || '').includes(needle),
      );
      const btn = [...(row?.querySelectorAll('button') || [])].find((b) => {
        const t = (b.textContent || '').trim();
        return actionLabel === 'Check-out'
          ? t === 'Check-out'
          : t === 'Check-in' || t.includes('free re-entry');
      }) as HTMLButtonElement | undefined;
      btn?.scrollIntoView({ block: 'center' });
      btn?.click();
    },
    name,
    action,
  );
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    (actionLabel) => {
      const hasPin = [...document.querySelectorAll('input[placeholder="PIN"]')].length > 0;
      const hasTitle = [...document.querySelectorAll('h3')].some((h) => {
        const t = h.textContent || '';
        return actionLabel === 'Check-out' ? /Check-out/i.test(t) : /Check-in/i.test(t);
      });
      return hasPin || hasTitle;
    },
    { timeout: 10000 },
    action,
  );
}

export async function openMemberCheckinPinModal(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  return openMemberAttendancePinModal(ctx, firstName, lastName, 'Check-in');
}

/** Hotspot for the PIN modal primary Check-in / Check-out button. */
export async function hotspotForPinModalAttendance(
  ctx: CaptureContext,
  action: KioskAttendanceAction,
): Promise<HotspotPct> {
  const handle = await ctx.page.evaluateHandle((actionLabel) => {
    const h3 = [...document.querySelectorAll('h3')].find((h) => {
      const t = h.textContent || '';
      return actionLabel === 'Check-out' ? /Check-out/i.test(t) : /Check-in/i.test(t);
    });
    const card = h3?.closest('.card') || h3?.parentElement;
    return (
      [...(card?.querySelectorAll('button') || [])].find((b) => {
        const t = (b.textContent || '').trim();
        return actionLabel === 'Check-out'
          ? t === 'Check-out'
          : t === 'Check-in' || t.includes('free re-entry');
      }) || null
    );
  }, action);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`PIN modal ${action} button not found`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`PIN modal ${action} button has no box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForPinModalCheckin(ctx: CaptureContext): Promise<HotspotPct> {
  return hotspotForPinModalAttendance(ctx, 'Check-in');
}

/** Type the tutorial PIN into the attendance PIN modal (does not submit). */
export async function fillCheckinPin(ctx: CaptureContext, pin = TUTORIAL_SCORE_PIN): Promise<void> {
  await ctx.page.waitForSelector('input[placeholder="PIN"]', { timeout: 10000 });
  await ctx.page.click('input[placeholder="PIN"]', { clickCount: 3 });
  await ctx.page.keyboard.type(pin, { delay: 20 });
  await ctx.delay(200);
}

/** Submit the PIN modal and wait for it to close. */
export async function submitAttendancePinModal(
  ctx: CaptureContext,
  action: KioskAttendanceAction,
): Promise<void> {
  const clicked = await ctx.page.evaluate((actionLabel) => {
    const h3 = [...document.querySelectorAll('h3')].find((h) => {
      const t = h.textContent || '';
      return actionLabel === 'Check-out' ? /Check-out/i.test(t) : /Check-in/i.test(t);
    });
    const card = h3?.closest('.card') || h3?.parentElement;
    const btn = [...(card?.querySelectorAll('button') || [])].find((b) => {
      const t = (b.textContent || '').trim();
      return actionLabel === 'Check-out'
        ? t === 'Check-out'
        : t === 'Check-in' || t.includes('free re-entry');
    }) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, action);
  if (!clicked) throw new Error(`Could not submit PIN modal ${action}`);
  await ctx.page.waitForFunction(
    () => [...document.querySelectorAll('input[placeholder="PIN"]')].length === 0,
    { timeout: 15000 },
  );
  await ctx.delay(700);
}

export async function submitCheckinPinModal(ctx: CaptureContext): Promise<void> {
  return submitAttendancePinModal(ctx, 'Check-in');
}

/** Open the signed-in member’s plan overlay from the header $ control. */
export async function openOwnPlanScreen(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/players');
  await ctx.page.waitForSelector('[title="View and manage your club plan"]', { timeout: 15000 });
  await ctx.page.evaluate(() => {
    (
      document.querySelector('[title="View and manage your club plan"]') as HTMLElement | null
    )?.click();
  });
  await ctx.delay(1100);
  await ctx.page.waitForFunction(
    () => [...document.querySelectorAll('label')].some((l) => (l.textContent || '').trim() === 'Plan'),
    { timeout: 15000 },
  );
}

async function planSelectElement(ctx: CaptureContext) {
  const label = await ctx.page.evaluateHandle(() =>
    [...document.querySelectorAll('label')].find((l) => (l.textContent || '').trim() === 'Plan') ||
      null,
  );
  const labelEl = label.asElement();
  if (!labelEl) {
    await label.dispose();
    throw new Error('Plan label not found');
  }
  const selectHandle = await labelEl.evaluateHandle((lab) => {
    const section = lab.closest('div') || lab.parentElement;
    return section?.querySelector('select') || null;
  });
  await label.dispose();
  const select = selectHandle.asElement();
  if (!select) {
    await selectHandle.dispose();
    throw new Error('Plan select not found');
  }
  return select;
}

/** Hotspot for the Purchase plan <select> in the member plan overlay. */
export async function hotspotForPlanSelect(ctx: CaptureContext): Promise<HotspotPct> {
  const el = await planSelectElement(ctx);
  const box = await el.boundingBox();
  await el.dispose();
  if (!box) throw new Error('Plan select has no box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Choose a plan familyKey in the Purchase panel select. */
export async function selectPlanFamilyKey(ctx: CaptureContext, familyKey: string): Promise<void> {
  const el = await planSelectElement(ctx);
  const disabled = await el.evaluate((node) => (node as HTMLSelectElement).disabled);
  if (disabled) {
    await el.dispose();
    throw new Error('Plan select is disabled (purchase blocked)');
  }
  await el.focus();
  // React controlled <select>: use native value setter + change.
  await el.evaluate((node, key) => {
    const select = node as HTMLSelectElement;
    const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    proto?.call(select, key);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, familyKey);
  const value = await el.evaluate((node) => (node as HTMLSelectElement).value);
  await el.dispose();
  if (value !== familyKey) {
    throw new Error(`Could not select plan familyKey=${familyKey} (got ${value})`);
  }
  await ctx.delay(400);
}

/** Open + Tournament → choose type → player selection step. */
export async function openTournamentPlayerSelection(
  ctx: CaptureContext,
  typeValue: string,
): Promise<void> {
  await openTournamentWizard(ctx);
  await selectTournamentType(ctx, typeValue);
  const ok = (await ctx.clickButtonContaining('Next')) || (await ctx.clickButtonContaining('Continue'));
  if (!ok) throw new Error(`Next/Continue missing after ${typeValue}`);
  await ctx.delay(900);
  await ctx.page.waitForSelector('tbody input[type="checkbox"]', { timeout: 15000 });
}

/** Open + Tournament → Round Robin → player selection step. */
export async function openRoundRobinPlayerSelection(ctx: CaptureContext): Promise<void> {
  await openTournamentPlayerSelection(ctx, 'ROUND_ROBIN');
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

/** Reach Multi RR “Players per group” config after selecting players. */
export async function openMultiRrGroupSize(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
  const n = await selectTournamentPlayers(ctx, playerCount);
  if (n < 6) throw new Error(`Need ≥6 players for Multi RR, got ${n}`);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue after player selection missing');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('h3')].some((h) =>
        /Multi Round Robin Configuration/i.test(h.textContent || ''),
      ),
    { timeout: 15000 },
  );
}

/** Reach Multi RR confirm-groups step (after group size Continue). */
export async function openMultiRrConfirmGroups(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openMultiRrGroupSize(ctx, playerCount);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue from group size missing');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('h3')].some((h) =>
        /Confirm Groups/i.test(h.textContent || ''),
      ),
    { timeout: 15000 },
  );
}

/** Reach Multi RR final Create Tournament confirmation. */
export async function openMultiRrFinalConfirm(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openMultiRrConfirmGroups(ctx, playerCount);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue from confirm groups missing');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Create Tournament'),
      ),
    { timeout: 15000 },
  );
}

/** Open the seeded active Round Robin detail (created first → id 1 after reset-seed). */
export async function openSeededActiveRoundRobin(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/tournaments/1');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button[title="Enter score"]')].length > 0 ||
      /Tutorial Active Round Robin/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
}

/** Open the seeded completed Round Robin (id 3 after reset-seed: active, prereg, completed). */
export async function openSeededCompletedRoundRobin(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/tournaments/3');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    (name) => new RegExp(name, 'i').test(document.body.innerText || ''),
    { timeout: 20000 },
    TUTORIAL_COMPLETED_RR_NAME,
  );
  // Results matrix should be present when the completed panel is expanded.
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('td')].some((td) =>
        /\d+\s*-\s*\d+/.test((td.textContent || '').replace(/✏️/g, '')),
      ),
    { timeout: 20000 },
  );
}

/** Turn on Correct scores (wrench) for the completed tournament view. */
export async function enableCompletedScoreCorrection(ctx: CaptureContext): Promise<void> {
  const already = await ctx.page.evaluate(() =>
    [...document.querySelectorAll('button')].some(
      (b) =>
        b.getAttribute('title') === 'Correct scores' &&
        b.getAttribute('aria-pressed') === 'true',
    ),
  );
  if (already) return;
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === 'Correct scores',
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Correct scores toggle not found');
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) =>
          b.getAttribute('title') === 'Correct scores' &&
          b.getAttribute('aria-pressed') === 'true',
      ) || /Score correction/i.test(document.body.innerText || ''),
    { timeout: 10000 },
  );
}

export async function hotspotForCorrectScoresToggle(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === 'Correct scores',
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === 'Correct scores',
    ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Correct scores toggle not found for hotspot');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Correct scores toggle has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Hotspot for the first scored result cell in the completed Results Matrix. */
export async function hotspotForFirstScoredResultCell(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const td = [...document.querySelectorAll('td')].find((el) =>
      /^\d+\s*-\s*\d+$/.test((el.textContent || '').replace(/✏️/g, '').trim()),
    ) as HTMLElement | undefined;
    td?.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await ctx.delay(250);
  const handle = await ctx.page.evaluateHandle(() =>
    [...document.querySelectorAll('td')].find((el) =>
      /^\d+\s*-\s*\d+$/.test((el.textContent || '').replace(/✏️/g, '').trim()),
    ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('No scored result cell found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Scored result cell has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Open Match Entry by clicking the first scored cell while correction mode is on. */
export async function openFirstCompletedScoreCorrection(ctx: CaptureContext): Promise<void> {
  await enableCompletedScoreCorrection(ctx);
  await ctx.page.evaluate(() => {
    const td = [...document.querySelectorAll('td')].find((el) =>
      /^\d+\s*-\s*\d+$/.test((el.textContent || '').replace(/✏️/g, '').trim()),
    ) as HTMLElement | undefined;
    td?.scrollIntoView({ block: 'center', inline: 'center' });
    td?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await ctx.delay(500);
  await ctx.page.waitForSelector('#match-entry-player1-score', { timeout: 10000 });
}

/** Confirm the Modify Match Result dialog when the winner changed. */
export async function confirmModifyMatchResult(ctx: CaptureContext): Promise<void> {
  const confirmed = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Modify Result'),
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!confirmed) throw new Error('Modify Result confirmation button not found');
  await ctx.page.waitForFunction(
    () => !document.querySelector('#match-entry-player1-score'),
    { timeout: 20000 },
  );
  await ctx.delay(700);
}

/** Hotspot for the first empty Round Robin score-entry control. */
export async function hotspotForFirstEmptyScoreCell(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = document.querySelector('button[title="Enter score"]') as HTMLElement | null;
    btn?.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await ctx.delay(250);
  return ctx.hotspotFor('button[title="Enter score"]');
}

/** Open the Match Entry popup from the first empty score cell. */
export async function openFirstEmptyScoreEntry(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const btn = document.querySelector('button[title="Enter score"]') as HTMLElement | null;
    btn?.scrollIntoView({ block: 'center', inline: 'center' });
    btn?.click();
  });
  await ctx.delay(500);
  await ctx.page.waitForSelector('#match-entry-player1-score', { timeout: 10000 });
}

/** Set match scores in the Match Entry popup (does not save). */
export async function fillMatchEntryScores(
  ctx: CaptureContext,
  player1Sets: number,
  player2Sets: number,
): Promise<void> {
  await ctx.page.waitForSelector('#match-entry-player1-score', { timeout: 10000 });
  await ctx.page.click('#match-entry-player1-score', { clickCount: 3 });
  await ctx.page.keyboard.type(String(player1Sets), { delay: 40 });
  await ctx.delay(150);
  await ctx.page.click('#match-entry-player2-score', { clickCount: 3 });
  await ctx.page.keyboard.type(String(player2Sets), { delay: 40 });
  await ctx.delay(200);
}

/** Hotspot for the Match Entry save (checkmark) control. */
export async function hotspotForMatchEntrySave(ctx: CaptureContext): Promise<HotspotPct> {
  try {
    return await ctx.hotspotFor('button[title="Enter Score & Complete Match"]');
  } catch {
    return ctx.hotspotFor('button[title="Save Changes"]');
  }
}

/** Save the Match Entry popup and wait for it to close. */
export async function saveMatchEntry(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn =
      (document.querySelector('button[title="Enter Score & Complete Match"]') as HTMLButtonElement | null) ||
      (document.querySelector('button[title="Save Changes"]') as HTMLButtonElement | null);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Match Entry save button missing or disabled');
  await ctx.page.waitForFunction(
    () => !document.querySelector('#match-entry-player1-score'),
    { timeout: 20000 },
  );
  await ctx.delay(700);
}

/**
 * Organizer opens seeded active RR and enters tournament Score kiosk.
 * Leaves the page in kiosk score-entry mode (Restore privileges visible).
 */
export async function enterTournamentScoreKiosk(
  ctx: CaptureContext,
  organizerEmail: string,
  tournamentId = 1,
): Promise<void> {
  await ensureAdminSession(ctx, organizerEmail);
  await gotoPath(ctx, `/tournaments/${tournamentId}`);
  await ctx.delay(700);

  const state = await ctx.page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent || '');
    return {
      restore: buttons.some((t) => t.includes('Restore privileges')),
      banner: /Tournament score entry/i.test(document.body.innerText || ''),
      scoreKiosk: buttons.some((t) => t.includes('Score kiosk')),
    };
  });

  if (state.restore && state.banner) {
    await ctx.delay(300);
    return;
  }

  if (state.restore && !state.banner) {
    const restored = await ctx.clickButtonContaining('Restore privileges');
    if (!restored) throw new Error('Could not leave non-score kiosk mode');
    await ctx.delay(900);
    await openSeededActiveRoundRobin(ctx);
  } else if (!state.scoreKiosk) {
    await openSeededActiveRoundRobin(ctx);
  }

  const opened = await ctx.clickButtonContaining('Score kiosk');
  if (!opened) throw new Error('Score kiosk button not found');
  await ctx.delay(1200);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Restore privileges'),
      ) && /Tournament score entry/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(400);
}

/** Type both participant PINs in the Match Entry kiosk dialog (does not save). */
export async function fillMatchEntryPins(
  ctx: CaptureContext,
  pin1: string,
  pin2: string,
): Promise<void> {
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('input[type="password"]')].filter((el) =>
        /PIN/i.test((el as HTMLInputElement).placeholder || ''),
      ).length >= 2,
    { timeout: 10000 },
  );
  // Inline value-setting (no nested fn) — esbuild __name helpers break page.evaluate.
  const filled = await ctx.page.evaluate(
    (p1, p2) => {
      const inputs = [...document.querySelectorAll('input[type="password"]')].filter((el) =>
        /PIN/i.test((el as HTMLInputElement).placeholder || ''),
      ) as HTMLInputElement[];
      if (inputs.length < 2) return false;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      proto?.call(inputs[0], p1);
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      proto?.call(inputs[1], p2);
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      return inputs[0].value === p1 && inputs[1].value === p2;
    },
    pin1,
    pin2,
  );
  if (!filled) throw new Error('Could not fill participant PIN fields');
  await ctx.delay(250);
}
