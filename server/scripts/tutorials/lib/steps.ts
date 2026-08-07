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
    [...document.querySelectorAll('button')].some((b) => {
      const label = (b.getAttribute('aria-label') || '').trim();
      const title = (b.getAttribute('title') || '').trim();
      const text = (b.textContent || '').trim();
      return label === 'Logout' || title === 'Logout' || text.includes('Logout');
    }),
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

/** Apply the showcase System Settings edits (Public Achievements only). */
export async function applyShowcaseSystemConfigEdits(ctx: CaptureContext): Promise<void> {
  await ensureSystemSectionOpen(ctx, 'Public Achievements');
  await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '3');
  await clickApplyAchievementsToAll(ctx);
  await setSystemNumericByAriaLabel(ctx, 'Biggest upset', '1');
}

export async function hotspotForSystemNumericByAriaLabel(
  ctx: CaptureContext,
  ariaLabel: string,
): Promise<HotspotPct> {
  await ctx.page.evaluate((label) => {
    const input = document.querySelector(
      `input[aria-label="${label}"]`,
    ) as HTMLElement | null;
    input?.scrollIntoView({ block: 'center' });
  }, ariaLabel);
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    (label) => document.querySelector(`input[aria-label="${label}"]`) || null,
    ariaLabel,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Numeric field "${ariaLabel}" not found for hotspot`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Numeric field "${ariaLabel}" has no bounding box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForApplyAchievementsToAll(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Apply to all'),
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Apply to all'),
      ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Apply to all button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Apply to all has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
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

/** Admin → Payment Log (default payments tab). */
export async function openPaymentLog(ctx: CaptureContext, adminEmail: string): Promise<void> {
  await ensureAdminSession(ctx, adminEmail);
  await gotoPath(ctx, '/payments');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      /Payment Log/i.test(document.body.innerText || '') &&
      Boolean(document.querySelector('input[aria-label="Show pending payments"]')),
    { timeout: 20000 },
  );
}

export async function hotspotForAdminMenuItem(
  ctx: CaptureContext,
  label: string,
): Promise<HotspotPct> {
  await openAdminMenu(ctx);
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle((text) => {
    const el = [...document.querySelectorAll('a, button')].find(
      (x) => (x.textContent || '').trim() === text,
    ) as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
    return el || null;
  }, label);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Admin menu item "${label}" not found`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Admin menu item "${label}" has no bounding box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Pending-only: Paid off, Pending on. */
export async function setPaymentLogPendingOnly(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const paid = document.querySelector(
      'input[aria-label="Show paid payments"]',
    ) as HTMLInputElement | null;
    const pending = document.querySelector(
      'input[aria-label="Show pending payments"]',
    ) as HTMLInputElement | null;
    if (!paid || !pending) throw new Error('Payment status filters missing');
    if (!pending.checked) {
      pending.click();
    }
    if (paid.checked) {
      paid.click();
    }
  });
  await ctx.delay(300);
}

export async function hotspotForPaymentLogPaidFilter(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    document
      .querySelector('input[aria-label="Show paid payments"]')
      ?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () => document.querySelector('input[aria-label="Show paid payments"]') || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Show paid payments checkbox not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Show paid payments has no bounding box');
  return boxToPct(
    { x: box.x - 4, y: box.y - 4, width: Math.max(box.width + 48, 70), height: box.height + 8 },
    VIEWPORT.width,
    VIEWPORT.height,
  );
}

export async function hotspotForFirstPaymentClear(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Clear',
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('button')].find(
        (b) => (b.textContent || '').trim() === 'Clear',
      ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Clear button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Clear button has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function clearFirstPendingCashPayment(ctx: CaptureContext): Promise<void> {
  const before = await ctx.page.evaluate(
    () =>
      [...document.querySelectorAll('button')].filter(
        (b) => (b.textContent || '').trim() === 'Clear' && !(b as HTMLButtonElement).disabled,
      ).length,
  );
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Clear' && !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('No Clear button available');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    (prev) => {
      const clears = [...document.querySelectorAll('button')].filter(
        (b) => (b.textContent || '').trim() === 'Clear',
      );
      return clears.length < prev;
    },
    { timeout: 15000 },
    Math.max(before, 1),
  );
  await ctx.delay(400);
}

/** Admin → Attendance Log. */
export async function openAttendanceLog(ctx: CaptureContext, adminEmail: string): Promise<void> {
  await ensureAdminSession(ctx, adminEmail);
  await gotoPath(ctx, '/attendance-log');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      /Attendance Log/i.test(document.body.innerText || '') &&
      Boolean(document.querySelector('input[aria-label="Show Present visits"]')),
    { timeout: 20000 },
  );
}

export async function hotspotForAttendanceStatusFilters(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    document
      .querySelector('[aria-labelledby="attendance-status-filter-label"]')
      ?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () => document.querySelector('[aria-labelledby="attendance-status-filter-label"]') || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Attendance status filter group not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Attendance status filters have no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForAttendanceDateFrom(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    document
      .querySelector('#attendance-date-from')
      ?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(() => {
    const from = document.querySelector('#attendance-date-from') as HTMLElement | null;
    const to = document.querySelector('#attendance-date-to') as HTMLElement | null;
    if (!from) return null;
    if (!to) return from;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const right = Math.max(a.right, b.right);
    const bottom = Math.max(a.bottom, b.bottom);
    // Synthetic element proxy via from; bounding box computed below from both.
    (from as HTMLElement & { __merged?: DOMRect }).__merged = new DOMRect(
      left,
      top,
      right - left,
      bottom - top,
    );
    return from;
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Attendance From date not found');
  }
  const merged = await ctx.page.evaluate((node) => {
    const m = (node as HTMLElement & { __merged?: DOMRect }).__merged;
    if (m) return { x: m.x, y: m.y, width: m.width, height: m.height };
    const r = (node as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, el);
  await handle.dispose();
  return boxToPct(merged, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForAttendanceStatusCheckbox(
  ctx: CaptureContext,
  label: 'Present' | 'Out' | 'Rejected',
): Promise<HotspotPct> {
  const aria = `Show ${label} visits`;
  await ctx.page.evaluate((a) => {
    document.querySelector(`input[aria-label="${a}"]`)?.scrollIntoView({ block: 'center' });
  }, aria);
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    (a) => document.querySelector(`input[aria-label="${a}"]`) || null,
    aria,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Attendance status checkbox "${label}" not found`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Attendance status checkbox "${label}" has no bounding box`);
  return boxToPct(
    { x: box.x - 4, y: box.y - 4, width: Math.max(box.width + 64, 80), height: box.height + 8 },
    VIEWPORT.width,
    VIEWPORT.height,
  );
}

/** Leave only one Attendance Log status checked. */
export async function setAttendanceStatusOnly(
  ctx: CaptureContext,
  keep: 'Present' | 'Out' | 'Rejected',
): Promise<void> {
  const labels = ['Present', 'Out', 'Rejected'] as const;
  await ctx.page.evaluate(
    (keepLabel, allLabels) => {
      for (const label of allLabels) {
        const input = document.querySelector(
          `input[aria-label="Show ${label} visits"]`,
        ) as HTMLInputElement | null;
        if (!input) throw new Error(`Missing status ${label}`);
        const want = label === keepLabel;
        if (input.checked !== want && !input.disabled) {
          input.click();
        }
      }
      // Second pass if first click left two selected (toggle order).
      for (const label of allLabels) {
        const input = document.querySelector(
          `input[aria-label="Show ${label} visits"]`,
        ) as HTMLInputElement | null;
        if (!input) continue;
        const want = label === keepLabel;
        if (input.checked !== want && !input.disabled) {
          input.click();
        }
      }
    },
    keep,
    labels,
  );
  await ctx.delay(500);
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

/** Open plan form via + Segment on an existing family (name/kind/duration locked). */
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
      [...document.querySelectorAll('h4')].some((h) => {
        const t = h.textContent || '';
        return t.includes('Add category price') || t.includes('New Plan');
      }),
    { timeout: 10000 },
  );
}

/** Ensure the plan form segment select is set. */
export async function selectPlanFormSegment(ctx: CaptureContext, segment: string): Promise<void> {
  const ok = await ctx.page.evaluate((seg) => {
    const select =
      (document.querySelector('[data-tutorial="plan-form-segment"]') as HTMLSelectElement | null) ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim() === 'Segment');
        return label?.parentElement?.querySelector('select') as HTMLSelectElement | null;
      })();
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

export async function hotspotForPlanFormSegment(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const el =
      (document.querySelector('[data-tutorial="plan-form-segment"]') as HTMLElement | null) ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim() === 'Segment');
        return label?.parentElement?.querySelector('select') as HTMLElement | null;
      })();
    el?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(() => {
    return (
      document.querySelector('[data-tutorial="plan-form-segment"]') ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim() === 'Segment');
        return label?.parentElement?.querySelector('select') || null;
      })()
    );
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Plan form Segment select not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Plan form Segment has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForPlanFormTotalPrice(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const el =
      (document.querySelector('[data-tutorial="plan-form-price"]') as HTMLElement | null) ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => /Total price/i.test(l.textContent || ''));
        return label?.parentElement?.querySelector('input') as HTMLElement | null;
      })();
    el?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(() => {
    return (
      document.querySelector('[data-tutorial="plan-form-price"]') ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => /Total price/i.test(l.textContent || ''));
        return label?.parentElement?.querySelector('input') || null;
      })()
    );
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Plan form Total price input not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Plan form Total price has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Set the Total price ($) field on the plan form (TIME plans). */
export async function fillPlanFormTotalPrice(ctx: CaptureContext, dollars: string): Promise<void> {
  const filled = await ctx.page.evaluate((val) => {
    const input =
      (document.querySelector('[data-tutorial="plan-form-price"]') as HTMLInputElement | null) ||
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => /Total price/i.test(l.textContent || ''));
        return label?.parentElement?.querySelector('input') as HTMLInputElement | null;
      })();
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
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = b.textContent || '';
      return t.includes('Create Plan') || t.includes('Add price');
    }) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('button')].find((b) => {
        const t = b.textContent || '';
        return t.includes('Create Plan') || t.includes('Add price');
      }) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Create Plan / Add price button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Create Plan / Add price has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function submitCreatePlan(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim();
      return t === 'Create Plan' || t === 'Add price';
    }) as HTMLButtonElement | undefined;
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Create Plan / Add price button missing or disabled');
  await ctx.delay(900);
  await ctx.page.waitForFunction(
    () =>
      ![...document.querySelectorAll('h4')].some((h) => {
        const t = h.textContent || '';
        return t.includes('New Plan') || t.includes('Add category price');
      }) || /Plan created|price added|created/i.test(document.body.innerText || ''),
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
    const buttons = [...document.querySelectorAll('button')];
    return {
      logout: buttons.some((b) => {
        const label = (b.getAttribute('aria-label') || '').trim();
        const title = (b.getAttribute('title') || '').trim();
        const text = (b.textContent || '').trim();
        return label === 'Logout' || title === 'Logout' || text.includes('Logout');
      }),
      restore: buttons.some((b) => (b.textContent || '').includes('Restore privileges')),
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

/** Expand Players filters so the name search field is visible (kiosk or normal). */
export async function ensurePlayersNameFilterVisible(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    try {
      localStorage.setItem('players_filtersCollapsed', 'false');
    } catch {
      /* ignore */
    }
  });
  const visible = await ctx.page.$('#nameFilter');
  if (visible) return;
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === 'Expand filters',
    ) as HTMLButtonElement | undefined;
    btn?.click();
  });
  await ctx.delay(350);
  const after = await ctx.page.$('#nameFilter');
  if (!after) throw new Error('Players name filter (#nameFilter) not found');
}

/** Set the Players “Search by name…” filter (also writes localStorage like the UI). */
export async function setPlayersNameFilter(ctx: CaptureContext, value: string): Promise<void> {
  await ensurePlayersNameFilterVisible(ctx);
  const ok = await ctx.page.evaluate((v) => {
    const input = document.getElementById('nameFilter') as HTMLInputElement | null;
    if (!input) return false;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    proto?.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      localStorage.setItem('players_nameFilter', v);
    } catch {
      /* ignore */
    }
    return true;
  }, value);
  if (!ok) throw new Error('Players name filter (#nameFilter) not found');
  await ctx.delay(450);
}

export async function hotspotForPlayersNameFilter(ctx: CaptureContext): Promise<HotspotPct> {
  await ensurePlayersNameFilterVisible(ctx);
  const handle = await ctx.page.evaluateHandle(() => document.getElementById('nameFilter'));
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Name filter input not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Name filter has no bounding box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
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

/** Toggle a roster row checkbox while in History opponent-selection mode. */
export async function toggleHistoryOpponent(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  await togglePlayerForStats(ctx, firstName, lastName);
}

/** After Deselect All, check specific opponents for match history. */
export async function selectHistoryOpponents(
  ctx: CaptureContext,
  opponents: ReadonlyArray<{ firstName: string; lastName: string }>,
): Promise<void> {
  for (const m of opponents) {
    await toggleHistoryOpponent(ctx, m.firstName, m.lastName);
  }
  await ctx.page.waitForFunction(
    (n) => new RegExp(`${n} opponents? selected`, 'i').test(document.body.innerText || ''),
    { timeout: 8000 },
    opponents.length,
  );
  await ctx.delay(200);
}

export async function hotspotForViewHistory(ctx: CaptureContext): Promise<HotspotPct> {
  return ctx.hotspotForButton('View History');
}

/** Open Match History for a subject vs the given opponents. */
export async function openPlayerMatchHistory(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
  opponents: ReadonlyArray<{ firstName: string; lastName: string }>,
): Promise<void> {
  await gotoPath(ctx, '/players');
  await ctx.delay(500);
  await startPlayerHistorySelection(ctx, firstName, lastName);
  await clearHistoryOpponents(ctx);
  await selectHistoryOpponents(ctx, opponents);
  const opened = await ctx.clickButtonContaining('View History');
  if (!opened) throw new Error('View History button missing');
  await ctx.page.waitForFunction(
    () => /Match History/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(600);
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

const PLAYER_QUICK_STATS_LABEL = 'Show statistics for a player';

/** Hotspot for the row 📊 quick-stats control. */
export async function hotspotForPlayerQuickStatsButton(
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
    PLAYER_QUICK_STATS_LABEL,
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
    PLAYER_QUICK_STATS_LABEL,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Quick stats button not found for ${firstName} ${lastName}`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Quick stats button has no bounding box for ${firstName} ${lastName}`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Open Player Statistics for a single roster member via the row 📊 control. */
export async function openPlayerSingleStatistics(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  await gotoPath(ctx, '/players');
  await ctx.delay(500);
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
    PLAYER_QUICK_STATS_LABEL,
  );
  if (!clicked) throw new Error(`Quick stats button not found for ${firstName} ${lastName}`);
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

/** Scroll a plan-overlay section heading (`h4`) into view. */
export async function scrollPlanHeading(ctx: CaptureContext, heading: string): Promise<void> {
  await ctx.page.evaluate((h) => {
    const el = [...document.querySelectorAll('h4')].find(
      (n) => (n.textContent || '').trim() === h,
    ) as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center' });
  }, heading);
  await ctx.delay(250);
}

/**
 * Expand the Plan <select> for screenshots (native open menus are not captured by Puppeteer).
 * Sets `size` to show all options as a list.
 */
export async function expandPlanSelectForCapture(ctx: CaptureContext): Promise<void> {
  const el = await planSelectElement(ctx);
  await el.evaluate((node) => {
    const select = node as HTMLSelectElement;
    select.size = Math.max(select.options.length, 2);
  });
  await el.dispose();
  await ctx.delay(250);
}

export async function collapsePlanSelect(ctx: CaptureContext): Promise<void> {
  const el = await planSelectElement(ctx);
  await el.evaluate((node) => {
    (node as HTMLSelectElement).size = 1;
  });
  await el.dispose();
  await ctx.delay(150);
}

/** Hotspot for one option in the (expanded) Plan select. */
export async function hotspotForPlanSelectOption(
  ctx: CaptureContext,
  familyKey: string,
): Promise<HotspotPct> {
  await expandPlanSelectForCapture(ctx);
  const el = await planSelectElement(ctx);
  const box = await el.evaluate((node, key) => {
    const select = node as HTMLSelectElement;
    const opt = [...select.options].find((o) => o.value === key);
    if (!opt) return null;
    const r = opt.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, familyKey);
  await el.dispose();
  if (!box) throw new Error(`Plan option familyKey=${familyKey} has no box`);
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
    select.size = 1;
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

/** Set Cash vs Pay online on the member plan purchase panel. */
export async function setPlanPayMethod(
  ctx: CaptureContext,
  method: 'cash' | 'online',
): Promise<void> {
  const ok = await ctx.page.evaluate((m) => {
    const label = [...document.querySelectorAll('label')].find((l) => {
      const t = (l.textContent || '').replace(/\s+/g, ' ').trim();
      return m === 'cash' ? t.includes('Cash') : t.includes('Pay online');
    });
    const input = label?.querySelector('input[type="radio"]') as HTMLInputElement | undefined;
    if (!input || input.disabled) return false;
    input.click();
    return true;
  }, method);
  if (!ok) throw new Error(`Could not set pay method=${method}`);
  await ctx.delay(200);
}

/** Hotspot for the primary Purchase · Cash / Purchase · Online button. */
export async function hotspotForPlanPurchaseButton(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^Purchase\s*·/i.test((b.textContent || '').trim()),
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) =>
      /^Purchase\s*·/i.test((b.textContent || '').trim()),
    ) || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Purchase button not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Purchase button has no box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Click Purchase · Cash / Online and wait for a pending payment line. */
export async function submitPlanPurchase(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^Purchase\s*·/i.test((b.textContent || '').trim()),
    ) as HTMLButtonElement | undefined;
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Purchase button missing or disabled');
  await ctx.page.waitForFunction(
    () => {
      const text = document.body.innerText || '';
      return /pending|awaiting admin|Purchase pending/i.test(text);
    },
    { timeout: 20000 },
  );
  await ctx.delay(500);
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

/** Open + Tournament → Playoff → player selection step. */
export async function openPlayoffPlayerSelection(ctx: CaptureContext): Promise<void> {
  await openTournamentPlayerSelection(ctx, 'PLAYOFF');
}

/** Reach Playoff bracket organize / preview after selecting players. */
export async function openPlayoffBracketOrganize(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openPlayoffPlayerSelection(ctx);
  const n = await selectTournamentPlayers(ctx, playerCount);
  if (n < 4) throw new Error(`Need ≥4 players for Playoff, got ${n}`);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue after player selection missing');
  await ctx.delay(1000);
  await ctx.page.waitForFunction(
    () => {
      const text = document.body.innerText || '';
      if (/Loading bracket preview/i.test(text)) return false;
      return (
        [...document.querySelectorAll('button')].filter((b) =>
          (b.textContent || '').trim() === 'Continue',
        ).length > 0 &&
        (/BYE|vs|seed|bracket/i.test(text) ||
          document.querySelectorAll('[draggable="true"]').length > 0)
      );
    },
    { timeout: 30000 },
  );
  await ctx.delay(400);
}

/** Reach Playoff “First Round Matches” confirmation before Create Tournament. */
export async function openPlayoffFirstRoundConfirm(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openPlayoffBracketOrganize(ctx, playerCount);
  const continued = await ctx.clickButtonContaining('Continue');
  if (!continued) throw new Error('Continue from bracket organize missing');
  await ctx.delay(800);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('h3')].some((h) =>
        /First Round Matches/i.test(h.textContent || ''),
      ) ||
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
      [...document.querySelectorAll('h5')].some((h) =>
        /^Group\s+\d+/i.test((h.textContent || '').trim()),
      ) &&
      [...document.querySelectorAll('h3')].some((h) =>
        /Confirm Groups/i.test(h.textContent || ''),
      ),
    { timeout: 15000 },
  );
}

/** Hotspot for a draggable player row inside Confirm Groups (0-based group/player). */
export async function hotspotForMultiRrGroupPlayer(
  ctx: CaptureContext,
  groupIndex: number,
  playerIndex = 0,
): Promise<HotspotPct> {
  await ctx.page.evaluate(
    (gIdx, pIdx) => {
      const headers = [...document.querySelectorAll('h5')].filter((h) =>
        /^Group\s+\d+/i.test((h.textContent || '').trim()),
      );
      const root = headers[gIdx]?.parentElement;
      const row = root
        ? ([...root.querySelectorAll(':scope > div[draggable="true"]')][pIdx] as HTMLElement | undefined)
        : undefined;
      row?.scrollIntoView({ block: 'center' });
    },
    groupIndex,
    playerIndex,
  );
  await ctx.delay(200);
  const handle = await ctx.page.evaluateHandle(
    (gIdx, pIdx) => {
      const headers = [...document.querySelectorAll('h5')].filter((h) =>
        /^Group\s+\d+/i.test((h.textContent || '').trim()),
      );
      const root = headers[gIdx]?.parentElement;
      if (!root) return null;
      return [...root.querySelectorAll(':scope > div[draggable="true"]')][pIdx] || null;
    },
    groupIndex,
    playerIndex,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Multi RR group player not found (group ${groupIndex}, player ${playerIndex})`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) {
    throw new Error(`Multi RR group player has no box (group ${groupIndex}, player ${playerIndex})`);
  }
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/**
 * Move one player from group A to group B on Confirm Groups (HTML5 drag).
 * Default demo: first player in Group 1 → Group 2 (keeps both groups ≥2 when roster is 8).
 */
export async function moveMultiRrPlayerBetweenGroups(
  ctx: CaptureContext,
  fromGroupIndex = 0,
  playerIndex = 0,
  toGroupIndex = 1,
): Promise<void> {
  const result = await ctx.page.evaluate(
    async (fromG, pIdx, toG) => {
      const headers = [...document.querySelectorAll('h5')].filter((h) =>
        /^Group\s+\d+/i.test((h.textContent || '').trim()),
      );
      const fromRoot = headers[fromG]?.parentElement;
      const toRoot = headers[toG]?.parentElement;
      if (!fromRoot || !toRoot) return { ok: false, reason: 'group roots missing' };
      const source = [...fromRoot.querySelectorAll(':scope > div[draggable="true"]')][
        pIdx
      ] as HTMLElement | undefined;
      if (!source) return { ok: false, reason: 'source player missing' };
      const name = (source.textContent || '').trim();
      const dt = new DataTransfer();
      source.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      await new Promise((r) => setTimeout(r, 120));
      toRoot.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      await new Promise((r) => setTimeout(r, 40));
      toRoot.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      source.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      await new Promise((r) => setTimeout(r, 80));
      const needle = name.slice(0, Math.min(16, name.length));
      const landed = (toRoot.textContent || '').includes(needle);
      return { ok: landed, reason: landed ? '' : 'player did not appear in target group', name };
    },
    fromGroupIndex,
    playerIndex,
    toGroupIndex,
  );

  if (!result.ok) {
    throw new Error(
      `Cannot rearrange Multi RR groups (from ${fromGroupIndex}:${playerIndex} → ${toGroupIndex}): ${result.reason}`,
    );
  }
  await ctx.delay(300);
}

/** Confirm Groups after the showcase rearrange demo (Group 1 → Group 2). */
export async function openMultiRrConfirmGroupsRearranged(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openMultiRrConfirmGroups(ctx, playerCount);
  await moveMultiRrPlayerBetweenGroups(ctx);
}

/** Reach Multi RR final Create Tournament confirmation. */
export async function openMultiRrFinalConfirm(
  ctx: CaptureContext,
  playerCount = 8,
): Promise<void> {
  await openMultiRrConfirmGroupsRearranged(ctx, playerCount);
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

export async function hotspotForModifyMatchResult(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Modify Result'),
      ),
    { timeout: 10000 },
  );
  return ctx.hotspotForButton('Modify Result');
}

/** Click Match Entry save without waiting for the dialog to close (winner-change confirm may open). */
export async function clickMatchEntrySave(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn =
      (document.querySelector('button[title="Enter Score & Complete Match"]') as HTMLButtonElement | null) ||
      (document.querySelector('button[title="Save Changes"]') as HTMLButtonElement | null);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Match Entry save button missing or disabled');
  await ctx.delay(400);
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
  await fillMatchEntryScoreField(ctx, 1, player1Sets);
  await fillMatchEntryScoreField(ctx, 2, player2Sets);
}

export async function fillMatchEntryScoreField(
  ctx: CaptureContext,
  player: 1 | 2,
  sets: number,
): Promise<void> {
  const sel = player === 1 ? '#match-entry-player1-score' : '#match-entry-player2-score';
  await ctx.page.waitForSelector(sel, { timeout: 10000 });
  await ctx.page.click(sel, { clickCount: 3 });
  await ctx.page.keyboard.type(String(sets), { delay: 40 });
  await ctx.delay(150);
}

export async function hotspotForMatchEntryScoreField(
  ctx: CaptureContext,
  player: 1 | 2,
): Promise<HotspotPct> {
  const sel = player === 1 ? '#match-entry-player1-score' : '#match-entry-player2-score';
  await ctx.page.waitForSelector(sel, { timeout: 10000 });
  return ctx.hotspotFor(sel);
}

async function matchEntryPinInputs(ctx: CaptureContext): Promise<void> {
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('input[type="password"]')].filter((el) =>
        /PIN/i.test((el as HTMLInputElement).placeholder || ''),
      ).length >= 2,
    { timeout: 10000 },
  );
}

export async function fillMatchEntryPinField(
  ctx: CaptureContext,
  index: 0 | 1,
  pin: string,
): Promise<void> {
  await matchEntryPinInputs(ctx);
  const filled = await ctx.page.evaluate(
    (i, p) => {
      const inputs = [...document.querySelectorAll('input[type="password"]')].filter((el) =>
        /PIN/i.test((el as HTMLInputElement).placeholder || ''),
      ) as HTMLInputElement[];
      if (inputs.length <= i) return false;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      proto?.call(inputs[i], p);
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      return inputs[i].value === p;
    },
    index,
    pin,
  );
  if (!filled) throw new Error(`Could not fill participant PIN field ${index + 1}`);
  await ctx.delay(200);
}

export async function hotspotForMatchEntryPinField(
  ctx: CaptureContext,
  index: 0 | 1,
): Promise<HotspotPct> {
  await matchEntryPinInputs(ctx);
  await ctx.page.evaluate((i) => {
    const inputs = [...document.querySelectorAll('input[type="password"]')].filter((el) =>
      /PIN/i.test((el as HTMLInputElement).placeholder || ''),
    ) as HTMLElement[];
    inputs[i]?.scrollIntoView({ block: 'center' });
  }, index);
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle((i) => {
    const inputs = [...document.querySelectorAll('input[type="password"]')].filter((el) =>
      /PIN/i.test((el as HTMLInputElement).placeholder || ''),
    );
    return inputs[i] || null;
  }, index);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`PIN field ${index + 1} not found`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`PIN field ${index + 1} has no box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
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

/** Payment Log: Paid on, Pending off. */
export async function setPaymentLogPaidOnly(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const paid = document.querySelector(
      'input[aria-label="Show paid payments"]',
    ) as HTMLInputElement | null;
    const pending = document.querySelector(
      'input[aria-label="Show pending payments"]',
    ) as HTMLInputElement | null;
    if (!paid || !pending) throw new Error('Payment status filters missing');
    if (!paid.checked) paid.click();
    if (pending.checked) pending.click();
  });
  await ctx.delay(300);
}

export async function hotspotForPaymentLogPendingFilter(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    document
      .querySelector('input[aria-label="Show pending payments"]')
      ?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle(
    () => document.querySelector('input[aria-label="Show pending payments"]') || null,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Show pending payments checkbox not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Show pending payments has no bounding box');
  return boxToPct(
    { x: box.x - 4, y: box.y - 4, width: Math.max(box.width + 56, 80), height: box.height + 8 },
    VIEWPORT.width,
    VIEWPORT.height,
  );
}

export async function hotspotForPaymentLogDateFilters(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.evaluate(() => {
    document.querySelector('#payments-date-from')?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(150);
  const box = await ctx.page.evaluate(() => {
    const from = document.querySelector('#payments-date-from');
    const to = document.querySelector('#payments-date-to');
    if (!from) return null;
    const a = from.getBoundingClientRect();
    const b = to?.getBoundingClientRect();
    if (!b) return { x: a.x, y: a.y, width: a.width, height: a.height };
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    return {
      x: left,
      y: top,
      width: Math.max(a.right, b.right) - left,
      height: Math.max(a.bottom, b.bottom) - top,
    };
  });
  if (!box) throw new Error('Payment date filters not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForPaymentLogMemberSearch(ctx: CaptureContext): Promise<HotspotPct> {
  return ctx.hotspotFor('#member-payments-filter');
}

export async function setPaymentLogMemberFilter(ctx: CaptureContext, value: string): Promise<void> {
  await ctx.page.waitForSelector('#member-payments-filter', { timeout: 10000 });
  const ok = await ctx.page.evaluate((v) => {
    const input = document.querySelector('#member-payments-filter') as HTMLInputElement | null;
    if (!input) return false;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    proto?.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);
  if (!ok) throw new Error('Payment member filter not found');
  await ctx.delay(600);
}

/** Click a payment-log member name button to open MemberPlanScreen (ledger). */
export async function openMemberLedgerFromPaymentLog(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<void> {
  const needle = `${firstName} ${lastName}`;
  const clicked = await ctx.page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').trim().startsWith(name),
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, needle);
  if (!clicked) throw new Error(`Payment log member button for "${needle}" not found`);
  await ctx.delay(1100);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('h3, label')].some((el) =>
        /^Plan\b/i.test((el.textContent || '').trim()),
      ),
    { timeout: 15000 },
  );
}

export async function hotspotForPaymentLogMemberName(
  ctx: CaptureContext,
  firstName: string,
  lastName: string,
): Promise<HotspotPct> {
  const needle = `${firstName} ${lastName}`;
  await ctx.page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').trim().startsWith(name),
    ) as HTMLElement | undefined;
    btn?.scrollIntoView({ block: 'center' });
  }, needle);
  await ctx.delay(150);
  const handle = await ctx.page.evaluateHandle((name) => {
    return (
      [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').trim().startsWith(name),
      ) || null
    );
  }, needle);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(`Payment log member "${needle}" not found`);
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error(`Payment log member "${needle}" has no box`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForCheckinTypeSelect(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('label')].some((l) =>
        (l.textContent || '').includes('Check-in type'),
      ),
    { timeout: 15000 },
  );
  const handle = await ctx.page.evaluateHandle(() => {
    const lab = [...document.querySelectorAll('label')].find((l) =>
      (l.textContent || '').includes('Check-in type'),
    );
    const sel = lab?.parentElement?.querySelector('select') || document.querySelector('.card select');
    return sel || null;
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error('Check-in type select not found');
  }
  const box = await el.boundingBox();
  await handle.dispose();
  if (!box) throw new Error('Check-in type select has no box');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Prefer an actionable event_check_in option in the PIN modal select. */
export async function selectEventCheckInOption(ctx: CaptureContext): Promise<void> {
  await ctx.page.waitForFunction(
    () => Boolean(document.querySelector('.card select')),
    { timeout: 15000 },
  );
  const ok = await ctx.page.evaluate(() => {
    const sel = document.querySelector('.card select') as HTMLSelectElement | null;
    if (!sel) return false;
    const opt = [...sel.options].find(
      (o) => o.value.startsWith('event:') && !o.disabled,
    );
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (!ok) throw new Error('No actionable event check-in option in select');
  await ctx.delay(300);
}

/** Enable Pre-registration mode on the tournament type modal (RR should already be selected). */
export async function enablePreregistrationMode(ctx: CaptureContext): Promise<void> {
  const ok = await ctx.page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const lab = labels.find((l) => (l.textContent || '').includes('Pre-registration mode'));
    if (!lab) return false;
    const input = lab.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (input) {
      if (!input.checked) {
        input.click();
      }
      return input.checked || true;
    }
    lab.click();
    return true;
  });
  if (!ok) throw new Error('Pre-registration mode checkbox not found');
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Create Pre-registration'),
      ),
    { timeout: 10000 },
  );
}

export async function hotspotForPreregistrationMode(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const lab = labels.find((l) => (l.textContent || '').includes('Pre-registration mode'));
    if (!lab) return null;
    const input = lab.querySelector('input') || lab;
    const r = (input as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 180), height: Math.max(r.height, 24) };
  });
  if (!box) throw new Error('Pre-registration mode control not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Open + Tournament and enable Pre-registration mode (type not selected yet). */
export async function openPreregistrationWizard(ctx: CaptureContext): Promise<void> {
  await openTournamentWizard(ctx);
  await enablePreregistrationMode(ctx);
}

/** Enable Paid event under Pre-registration mode (prereg must already be on). */
export async function enablePaidEventMode(ctx: CaptureContext): Promise<void> {
  const ok = await ctx.page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const lab = labels.find((l) => (l.textContent || '').includes('Paid event'));
    if (!lab) return false;
    (lab as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const input = lab.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (input) {
      if (!input.checked) input.click();
      return true;
    }
    lab.click();
    return true;
  });
  if (!ok) throw new Error('Paid event checkbox not found');
  await ctx.delay(500);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('label')].some((l) =>
        /Event Name/i.test(l.textContent || ''),
      ),
    { timeout: 10000 },
  );
}

export async function hotspotForPaidEventMode(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const lab = labels.find((l) => (l.textContent || '').includes('Paid event'));
    if (!lab) return null;
    (lab as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const input = lab.querySelector('input') || lab;
    const r = (input as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 180), height: Math.max(r.height, 36) };
  });
  if (!box) throw new Error('Paid event control not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForEventNameField(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
      const wrap = el.closest('div');
      return !!wrap && /(tournament|event) name/i.test(wrap.textContent || '');
    }) as HTMLInputElement | undefined;
    const byPlaceholder = document.querySelector(
      'input[placeholder*="Auto-generated" i], input[placeholder*="event name" i]',
    ) as HTMLInputElement | null;
    const el = labeled || byPlaceholder;
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 160), height: Math.max(r.height, 28) };
  });
  if (!box) throw new Error('Event/Tournament Name field not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Fill only the wizard Tournament/Event Name (does not set date). */
export async function fillPreregistrationName(ctx: CaptureContext, name: string): Promise<void> {
  await ctx.page.evaluate((n) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
      const wrap = el.closest('div');
      return !!wrap && /(tournament|event) name/i.test(wrap.textContent || '');
    }) as HTMLInputElement | undefined;
    const byPlaceholder = document.querySelector(
      'input[placeholder*="Auto-generated" i], input[placeholder*="event name" i]',
    ) as HTMLInputElement | null;
    const nameInput = labeled || byPlaceholder;
    if (!nameInput) return;
    proto?.call(nameInput, n);
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
  await ctx.delay(300);
}

export async function hotspotForPreregistrationDate(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
    if (!input) return null;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = input.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 160), height: Math.max(r.height, 28) };
  });
  if (!box) throw new Error('Tournament Date field not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function hotspotForPreregistrationDeadline(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="datetime-local"]')] as HTMLInputElement[];
    const input = inputs[1];
    if (!input) return null;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = input.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 160), height: Math.max(r.height, 28) };
  });
  if (!box) throw new Error('Registration Deadline field not found');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Set tournament date only — registration deadline auto-fills from club offset; do not touch it. */
export async function fillPreregistrationDate(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const dateInput = document.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement | null;
    if (!dateInput) return;
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setMinutes(0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    proto?.call(dateInput, local);
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await ctx.delay(400);
}

export async function setPreregistrationNumericByLabel(
  ctx: CaptureContext,
  label: string,
  value: string,
): Promise<void> {
  const filled = await ctx.page.evaluate(
    (lab, val) => {
      const input = document.querySelector(
        `input[aria-label="${lab}"]`,
      ) as HTMLInputElement | null;
      if (!input) return false;
      input.scrollIntoView({ block: 'center', inline: 'nearest' });
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      proto?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    },
    label,
    value,
  );
  if (!filled) throw new Error(`Preregistration field "${label}" not found`);
  await ctx.delay(250);
}

export async function hotspotForPreregistrationNumeric(
  ctx: CaptureContext,
  label: string,
): Promise<HotspotPct> {
  const box = await ctx.page.evaluate((lab) => {
    const input = document.querySelector(`input[aria-label="${lab}"]`) as HTMLInputElement | null;
    if (!input) return null;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = input.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 80), height: Math.max(r.height, 28) };
  }, label);
  if (!box) throw new Error(`Preregistration field "${label}" not found for hotspot`);
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function setPreregistrationEventPrice(
  ctx: CaptureContext,
  dollars: string,
): Promise<void> {
  const filled = await ctx.page.evaluate((val) => {
    const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
      const wrap = el.closest('div');
      return !!wrap && /event price/i.test(wrap.textContent || '');
    }) as HTMLInputElement | undefined;
    if (!labeled) return false;
    labeled.scrollIntoView({ block: 'center', inline: 'nearest' });
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    proto?.call(labeled, val);
    labeled.dispatchEvent(new Event('input', { bubbles: true }));
    labeled.dispatchEvent(new Event('change', { bubbles: true }));
    labeled.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }, dollars);
  if (!filled) throw new Error('Event Price field not found');
  await ctx.delay(300);
}

export async function hotspotForPreregistrationEventPrice(ctx: CaptureContext): Promise<HotspotPct> {
  const box = await ctx.page.evaluate(() => {
    const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
      const wrap = el.closest('div');
      return !!wrap && /event price/i.test(wrap.textContent || '');
    }) as HTMLInputElement | undefined;
    if (!labeled) return null;
    labeled.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = labeled.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(r.width, 80), height: Math.max(r.height, 28) };
  });
  if (!box) throw new Error('Event Price field not found for hotspot');
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export async function fillPreregistrationBasics(
  ctx: CaptureContext,
  name: string,
): Promise<void> {
  await ctx.page.evaluate((n) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    // Prefer the labeled Tournament/Event Name field in the wizard (not Players "Filter by name").
    const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
      const wrap = el.closest('div');
      return !!wrap && /(tournament|event) name/i.test(wrap.textContent || '');
    }) as HTMLInputElement | undefined;
    const byPlaceholder = document.querySelector(
      'input[placeholder*="Auto-generated" i], input[placeholder*="event name" i]',
    ) as HTMLInputElement | null;
    const nameInput = labeled || byPlaceholder;
    if (nameInput) {
      proto?.call(nameInput, n);
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Tournament date is required for Create Pre-registration.
    const dateInput = document.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement | null;
    if (dateInput) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setMinutes(0, 0, 0);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      proto?.call(dateInput, local);
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, name);
  await ctx.delay(400);
}

export async function submitCreatePreregistration(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.clickButtonContaining('Create Pre-registration');
  if (!clicked) throw new Error('Create Pre-registration button not found');
  await ctx.delay(2000);
  // Prefer landing on tournaments / leaving the type modal.
  await ctx.page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].some((b) =>
        (b.textContent || '').includes('Create Pre-registration'),
      ) || /Pre-Registration|Active|Completed/i.test(document.body.innerText || ''),
    { timeout: 20000 },
  );
  await ctx.delay(500);
}

/** Open the Preregistration stage tab on the tournaments list. */
export async function openPreregistrationStage(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/tournaments');
  await ctx.delay(400);
  // UI label is "Preregistration" (see stageTabLabel); keep hyphenated aliases for older copy.
  const onTab =
    (await ctx.clickButtonContaining('Preregistration')) ||
    (await ctx.clickButtonContaining('Pre-Registration')) ||
    (await ctx.clickButtonContaining('Pre-registration'));
  if (!onTab) throw new Error('Preregistration stage tab not found');
  await ctx.delay(700);
}

/** Open Pre-Registration stage and a tournament by name (detail). */
export async function openPreregistrationTournament(
  ctx: CaptureContext,
  name: string,
): Promise<void> {
  await openPreregistrationStage(ctx);
  await ctx.page.waitForFunction(
    (n) => (document.body.innerText || '').includes(n),
    { timeout: 20000 },
    name,
  );
  const opened = await ctx.page.evaluate((n) => {
    const candidates = [...document.querySelectorAll('a, button, h2, h3, div, span')];
    const el = candidates.find((node) => {
      const t = (node.textContent || '').trim();
      return t === n || (t.includes(n) && t.length < n.length + 40);
    }) as HTMLElement | undefined;
    if (!el) return false;
    const clickable =
      (el.closest('a') as HTMLElement | null) ||
      (el.closest('button') as HTMLElement | null) ||
      el;
    clickable.click();
    return true;
  }, name);
  if (!opened) throw new Error(`Pre-registration tournament "${name}" not found in list`);
  await ctx.delay(1000);
  await ctx.page.waitForFunction(
    (n) =>
      (document.body.innerText || '').includes(n) &&
      ([...document.querySelectorAll('button')].some((b) =>
        /Register|Decline|Finalize|Cancel/i.test(b.textContent || ''),
      ) ||
        /Pre-Registration|Registered|Invited|Your status/i.test(document.body.innerText || '')),
    { timeout: 20000 },
    name,
  );
}

export async function hotspotForRegisterOnPreregDetail(ctx: CaptureContext): Promise<HotspotPct> {
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        /^Register/i.test((b.textContent || '').trim()),
      ),
    { timeout: 20000 },
  );
  return ctx.hotspotForButton('Register');
}

export async function clickRegisterOnPreregDetail(ctx: CaptureContext): Promise<void> {
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^Register/i.test((b.textContent || '').trim()),
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Register button not found on prereg detail');
  await ctx.delay(1200);
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
