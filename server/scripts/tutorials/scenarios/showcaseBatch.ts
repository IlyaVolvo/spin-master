import type { ScenarioDef } from '../lib/types';
import { TUTORIAL_EMAILS, TUTORIAL_PASSWORD } from '../lib/constants';
import {
  ensureLoggedIn,
  gotoPath,
  hotspotForTitle,
  hotspotForTournamentPlayerCheckbox,
  hotspotForTournamentType,
  openAdminMenu,
  openRoundRobinConfirm,
  openRoundRobinPlayerSelection,
  openTournamentWizard,
  selectTournamentPlayers,
  selectTournamentType,
} from '../lib/steps';
import { goToLoginForm } from '../lib/browser';

const SHOWCASE_RR_NAME = 'Tutorial Showcase Round Robin';

/**
 * Three longer showcase scenarios for quality evaluation.
 * Pattern: context → action (hotspot) → result, with seeded data visible on screen.
 */
export const showcaseScenarios: ScenarioDef[] = [
  {
    slug: 'showcase-player-plan',
    role: 'player',
    showcase: true,
    title: 'Showcase: Player buys / reviews a plan',
    description:
      'See how a member signs in, opens their club plan from the header, and reviews purchase options when they have no active entitlement.',
    relatedSlugs: ['showcase-organizer-create-rr', 'showcase-admin-front-desk'],
    steps: [
      {
        id: 'login-context',
        kind: 'context',
        title: 'Start at login',
        body: 'This walkthrough uses the tutorial player account. Credentials are filled so you can focus on the Sign in control.',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          await ctx.page.click('input[type="email"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_EMAILS.player, { delay: 5 });
          await ctx.page.click('input[type="password"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_PASSWORD, { delay: 5 });
        },
      },
      {
        id: 'login-action',
        kind: 'action',
        title: 'Sign in',
        body: 'Simulate signing in. The next frame shows the Players home after authentication.',
        actionHint: 'Click Sign in',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          await ctx.page.click('input[type="email"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_EMAILS.player, { delay: 5 });
          await ctx.page.click('input[type="password"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_PASSWORD, { delay: 5 });
          return { hotspot: await ctx.hotspotFor('button[type="submit"]') };
        },
      },
      {
        id: 'players-result',
        kind: 'result',
        title: 'Players home',
        body: 'You land on the roster. Player accounts do not see Admin tools — plan management is via the $ control.',
        resultNote: 'Header shows your name and the $ plan shortcut.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'open-plan-action',
        kind: 'action',
        title: 'Open your plan',
        body: 'The $ control opens your membership / plan overlay from anywhere in the app.',
        actionHint: 'Click the $ plan control',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'View and manage your club plan');
          if (!hs) throw new Error('Plan control not found');
          return { hotspot: hs };
        },
      },
      {
        id: 'plan-result',
        kind: 'result',
        title: 'Plan screen',
        body: 'Tutorial player has no current entitlement, so purchase options (Monthly membership, 5-visit pack) are visible with cash / online methods.',
        resultNote: 'Seeded club plans and empty “current plan” state are intentional for this demo.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate(() => {
            (
              document.querySelector(
                '[title="View and manage your club plan"]',
              ) as HTMLElement | null
            )?.click();
          });
          await ctx.delay(1100);
        },
      },
      {
        id: 'purchase-focus',
        kind: 'context',
        title: 'Purchase options',
        body: 'Scroll the plan dialog if needed. Note list prices, payment method (Cash vs Pay online), and consent for online pay.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate(() => {
            (
              document.querySelector(
                '[title="View and manage your club plan"]',
              ) as HTMLElement | null
            )?.click();
          });
          await ctx.delay(900);
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('button, h2, h3, label')].find((n) =>
              /Purchase|Cash|Pay online|Monthly|visit/i.test(n.textContent || ''),
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(400);
        },
      },
      {
        id: 'close-plan-action',
        kind: 'action',
        title: 'Close the plan',
        body: 'When finished reviewing, close the overlay to return to Players.',
        actionHint: 'Click Close',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate(() => {
            (
              document.querySelector(
                '[title="View and manage your club plan"]',
              ) as HTMLElement | null
            )?.click();
          });
          await ctx.delay(800);
          try {
            return { hotspot: await ctx.hotspotForButton('Close') };
          } catch {
            return {};
          }
        },
      },
      {
        id: 'back-on-players',
        kind: 'result',
        title: 'Back on Players',
        body: 'Closing returns you to the roster. Admins can also open any member’s plan from the table.',
        resultNote: 'Overlay dismissed; roster is interactive again.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(400);
        },
      },
    ],
  },

  {
    slug: 'showcase-organizer-create-rr',
    role: 'organizer',
    showcase: true,
    title: 'Showcase: Organizer creates a Round Robin',
    description:
      'Create a Round Robin end-to-end: pick the format, select players one by one (with a note on repeating), finalize, and open the new tournament page.',
    relatedSlugs: ['showcase-player-plan', 'showcase-admin-front-desk'],
    steps: [
      {
        id: 'org-home',
        kind: 'context',
        title: 'Organizer on Players',
        body: 'Organizers see + Tournament. The tutorial DB includes a roster of demo members so selection looks populated.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'open-wizard',
        kind: 'action',
        title: 'Start a tournament',
        body: 'Open the type modal. You will choose a format before naming and selecting players.',
        actionHint: 'Click + Tournament',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Tournament') };
        },
      },
      {
        id: 'type-modal',
        kind: 'result',
        title: 'Tournament type modal',
        body: 'Formats include Round Robin, Playoff, Multi RR, Preliminary compounds, and Swiss. Pre-registration can be enabled here too.',
        resultNote: 'Wizard opened from + Tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
        },
      },
      {
        id: 'pick-rr',
        kind: 'action',
        title: 'Choose Round Robin',
        body: 'Select Round Robin for a single-table all-play-all event.',
        actionHint: 'Select Round Robin',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'ROUND_ROBIN');
          return { hotspot: await hotspotForTournamentType(ctx, 'ROUND_ROBIN') };
        },
      },
      {
        id: 'rr-selected',
        kind: 'result',
        title: 'Round Robin selected',
        body: 'The selected format is highlighted. Optionally set a name, then continue to player selection.',
        resultNote: 'ROUND_ROBIN radio is checked.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'ROUND_ROBIN');
          await ctx.page.evaluate((name) => {
            const input = document.querySelector(
              'input[placeholder*="name" i], input[aria-label*="name" i]',
            ) as HTMLInputElement | null;
            // Prefer the labeled Tournament Name field near the wizard.
            const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
              const wrap = el.closest('div');
              return !!wrap && /tournament name/i.test(wrap.textContent || '');
            }) as HTMLInputElement | undefined;
            const target = labeled || input;
            if (!target) return;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(target, name);
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }, SHOWCASE_RR_NAME);
          await ctx.delay(300);
        },
      },
      {
        id: 'next-players',
        kind: 'action',
        title: 'Continue to players',
        body: 'Advance to the shared player picker used by every format.',
        actionHint: 'Click Next',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'ROUND_ROBIN');
          try {
            return { hotspot: await ctx.hotspotForButton('Next') };
          } catch {
            return { hotspot: await ctx.hotspotForButton('Continue') };
          }
        },
      },
      {
        id: 'player-picker',
        kind: 'result',
        title: 'Player selection',
        body: 'Each row has a checkbox. You build the field by selecting members one at a time.',
        resultNote: 'Wizard moved to the player selection step.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
        },
      },
      {
        id: 'pick-one-player',
        kind: 'action',
        title: 'Select a player',
        body: 'Check one member to add them to the tournament roster.',
        actionHint: 'Click a player checkbox',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
          return { hotspot: await hotspotForTournamentPlayerCheckbox(ctx, 0) };
        },
      },
      {
        id: 'one-selected',
        kind: 'result',
        title: 'One player included',
        body: 'That member is now counted in the selection total. Round Robin still needs more players before you can continue.',
        resultNote: 'First checkbox applied; selection count increased by one.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'repeat-selection-story',
        kind: 'context',
        title: 'Repeat for each player',
        body: 'Repeat this operation as many times as you need to include every player who should compete. The same checkbox action scales from a small group to a full roster.',
        capture: async (ctx) => {
          // Same visual as one-selected — this step is the narrative beat about repeatable work.
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'multi-selected',
        kind: 'result',
        title: 'Roster filled in',
        body: 'After repeating the selection, several members are checked and the Continue control becomes available.',
        resultNote: 'Multiple players selected behind the scenes to show the completed roster.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
          // Behind the scenes: mark several players (not teaching Select All).
          const n = await selectTournamentPlayers(ctx, 6);
          if (n < 2) throw new Error('Could not select enough players');
        },
      },
      {
        id: 'continue-finalize',
        kind: 'action',
        title: 'Continue to finalize',
        body: 'When the roster meets the format minimum, continue into the Round Robin confirmation step.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, 6);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'confirm-create',
        kind: 'result',
        title: 'Confirm tournament',
        body: 'Review the selected players, optionally split into multiple events, then create the Round Robin.',
        resultNote: 'Confirmation panel lists the roster and Create Tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinConfirm(ctx, 6);
        },
      },
      {
        id: 'create-tournament',
        kind: 'action',
        title: 'Create the tournament',
        body: 'Finalize creation. The app opens the new tournament page when it succeeds.',
        actionHint: 'Click Create Tournament',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinConfirm(ctx, 6);
          return { hotspot: await ctx.hotspotForButton('Create Tournament') };
        },
      },
      {
        id: 'tournament-page',
        kind: 'result',
        title: 'Tournament page',
        body: 'You land on the new Round Robin with the selected participants already present — ready for day-of tools and scoring.',
        resultNote: 'Create Tournament succeeded; detail page shows the active event.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openRoundRobinConfirm(ctx, 6);
          const created = await ctx.clickButtonContaining('Create Tournament');
          if (!created) throw new Error('Create Tournament button missing');
          await ctx.page.waitForFunction(
            () => /\/tournaments\/\d+/.test(window.location.pathname),
            { timeout: 30000 },
          );
          await ctx.delay(800);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-front-desk',
    role: 'admin',
    showcase: true,
    title: 'Showcase: Admin front desk (payments + attendance + kiosk)',
    description:
      'See the front-desk path: open Payment Log and Attendance Log with seeded rows, then enter check-in kiosk mode.',
    relatedSlugs: ['showcase-player-plan', 'showcase-organizer-create-rr'],
    steps: [
      {
        id: 'admin-home',
        kind: 'context',
        title: 'Admin home',
        body: 'Administrators use the Admin menu for Payment Log, Attendance Log, Plans, and System Configuration.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'open-menu',
        kind: 'action',
        title: 'Open Admin menu',
        body: 'Open the Admin dropdown to reach payment and attendance tools.',
        actionHint: 'Open Admin menu',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await openAdminMenu(ctx);
          const box = await ctx.page.evaluate(() => {
            const btn = document.querySelector(
              '.header button[aria-haspopup="menu"]',
            ) as HTMLElement | null;
            if (!btn) return null;
            const r = btn.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          if (!box) throw new Error('Admin menu missing');
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(box, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'menu-open',
        kind: 'result',
        title: 'Admin destinations',
        body: 'Payment Log, Attendance Log, Payment Plans, and System Configuration are listed here.',
        resultNote: 'Dropdown lists admin-only pages.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await openAdminMenu(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'goto-payments',
        kind: 'action',
        title: 'Open Payment Log',
        body: 'Payment Log shows succeeded and pending payments. The tutorial DB seeds both.',
        actionHint: 'Click Payment Log',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await openAdminMenu(ctx);
          const item = await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('a, button')].find(
              (x) => (x.textContent || '').trim() === 'Payment Log',
            ) as HTMLElement | undefined;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          if (!item) throw new Error('Payment Log item missing');
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(item, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'payments-result',
        kind: 'result',
        title: 'Payment Log with seed data',
        body: 'You should see at least one Paid and one Pending row (cash awaiting Clear/Reject).',
        resultNote: 'Seeded ClubPayment rows appear in the table.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/payments');
          await ctx.delay(800);
        },
      },
      {
        id: 'goto-attendance',
        kind: 'action',
        title: 'Open Attendance Log',
        body: 'Attendance Log shows who is present today and any rejected check-ins.',
        actionHint: 'Navigate to Attendance Log',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/payments');
          await openAdminMenu(ctx);
          const item = await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('a, button')].find(
              (x) => (x.textContent || '').trim() === 'Attendance Log',
            ) as HTMLElement | undefined;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          if (!item) throw new Error('Attendance Log item missing');
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(item, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'attendance-result',
        kind: 'result',
        title: 'Attendance with present members',
        body: 'Seeded open visits show under Only Present. Present count appears in the title.',
        resultNote: 'Open ClubVisit rows for today’s club date are listed.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/attendance-log');
          await ctx.delay(800);
          await ctx.page.evaluate(() => {
            const sel = document.querySelector('#attendance-status-filter') as HTMLSelectElement | null;
            if (sel) {
              sel.value = 'present';
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          await ctx.delay(400);
        },
      },
      {
        id: 'kiosk-action',
        kind: 'action',
        title: 'Enter kiosk',
        body: 'Front-desk check-in uses Kiosk → Check-in so members can use PINs without full admin chrome.',
        actionHint: 'Click Kiosk',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('Kiosk') };
        },
      },
      {
        id: 'kiosk-chooser',
        kind: 'result',
        title: 'Kiosk chooser',
        body: 'Admins can choose Check-in; organizers typically use Browse.',
        resultNote: 'Enter kiosk mode dialog is open.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await ctx.clickButtonContaining('Kiosk');
          await ctx.delay(500);
        },
      },
      {
        id: 'checkin-action',
        kind: 'action',
        title: 'Start check-in mode',
        body: 'Choose Check-in to show the attendance-oriented Players UI.',
        actionHint: 'Click Check-in',
        capture: async (ctx) => {
          // Prior step leaves the chooser open — do not re-login (chooser hides Logout).
          const hasChooser = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('button')].some(
              (b) => (b.textContent || '').trim() === 'Check-in',
            ),
          );
          if (!hasChooser) {
            await ctx.clickButtonContaining('Kiosk');
            await ctx.delay(400);
          }
          return { hotspot: await ctx.hotspotForButton('Check-in') };
        },
      },
      {
        id: 'kiosk-ui',
        kind: 'result',
        title: 'Check-in kiosk',
        body: 'Present count reflects seeded visits. Rows offer Check-in / Check-out. Use Restore privileges to exit.',
        resultNote: 'Kiosk check-in UI is active with banner and Present filter.',
        capture: async (ctx) => {
          const hasChooser = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('button')].some(
              (b) => (b.textContent || '').trim() === 'Check-in',
            ),
          );
          if (hasChooser) {
            await ctx.clickButtonContaining('Check-in');
          } else {
            await ctx.clickButtonContaining('Kiosk');
            await ctx.delay(300);
            await ctx.clickButtonContaining('Check-in');
          }
          await ctx.delay(1100);
        },
      },
    ],
  },
];
