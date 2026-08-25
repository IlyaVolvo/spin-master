import type { ScenarioDef } from '../lib/types';
import type { CaptureContext } from '../lib/browser';
import { goToLoginForm } from '../lib/browser';
import {
  TUTORIAL_ACTIVE_RR_NAME,
  TUTORIAL_COMPLETED_RR_NAME,
  TUTORIAL_EMAILS,
  TUTORIAL_EVENT_FEE_MEMBER,
  TUTORIAL_EVENT_NIGHT_NAME,
  TUTORIAL_INVITE_MEMBER,
  TUTORIAL_PASSWORD,
  TUTORIAL_PREREG_NAME,
} from '../lib/constants';
import {
  ensureLoggedIn,
  ensureSystemSectionOpen,
  gotoPath,
  hotspotForAdminMenuItem,
  hotspotForHref,
  hotspotForTitle,
  hotspotForTournamentPlayerCheckbox,
  hotspotForTournamentType,
  openAttendanceLog,
  openFirstEmptyScoreEntry,
  openPaymentLog,
  openPaymentPlans,
  openPlayoffBracketOrganize,
  openPreregistrationTournament,
  clickPlayersToolbarItem,
  openSeededActiveRoundRobin,
  openSeededCompletedRoundRobin,
  openSystemSettings,
  openTournamentPlayerSelection,
  openTournamentWizard,
  openTournamentsStage,
  selectTournamentPlayers,
  selectTournamentType,
  setPaymentLogPendingOnly,
} from '../lib/steps';

async function waitForText(ctx: CaptureContext, text: string, timeout = 20000): Promise<void> {
  await ctx.page.waitForFunction(
    (needle) => (document.body?.innerText || '').includes(needle),
    { timeout },
    text,
  );
}

async function openOwnProfileEditor(ctx: CaptureContext): Promise<void> {
  await gotoPath(ctx, '/players');
  const clicked = await ctx.page.evaluate(() => {
    const el = document.querySelector('[title="Edit your profile"]') as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  });
  if (!clicked) throw new Error('Edit your profile control not found');
  await ctx.delay(800);
  await waitForText(ctx, 'Score PIN');
}

async function openPlayersSettingsMenu(ctx: CaptureContext): Promise<void> {
  const opened = await clickPlayersToolbarItem(ctx, 'Settings');
  if (!opened) throw new Error('Players Settings control not found');
  await ctx.delay(400);
  await ctx.page.waitForFunction(
    () =>
      [...document.querySelectorAll('button, label')].some((el) =>
        /Export archive|Import players from CSV|^Export$/i.test((el.textContent || '').trim()),
      ),
    { timeout: 15000 },
  );
}

async function openStopTournamentDialog(ctx: CaptureContext): Promise<void> {
  await openSeededActiveRoundRobin(ctx);
  const clicked = await ctx.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.getAttribute('title') || '') === 'Cancel tournament',
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Cancel tournament control not found');
  await ctx.delay(500);
  await waitForText(ctx, 'Stop Tournament');
}

async function openPrelimPlayoffConfigure(ctx: CaptureContext, playerCount = 8): Promise<void> {
  await openTournamentPlayerSelection(ctx, 'PRELIMINARY_WITH_FINAL_PLAYOFF');
  const n = await selectTournamentPlayers(ctx, playerCount);
  if (n < 4) throw new Error(`Need ≥4 players for Preliminary + Playoff, got ${n}`);
  const continued =
    (await ctx.clickButtonContaining('Continue')) || (await ctx.clickButtonContaining('Next'));
  if (!continued) throw new Error('Continue after player selection missing');
  await ctx.delay(900);
  await waitForText(ctx, 'Tournament Configuration');
}

async function scrollCourtesySettings(ctx: CaptureContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const el = [...document.querySelectorAll('h2, h3, h4, div, label')].find((n) =>
      /Courtesy grace days|Payment Provider & Courtesy/i.test(n.textContent || ''),
    ) as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center' });
  });
  await ctx.delay(300);
}

/**
 * Catalog showcases for the remaining Player / Organizer / Admin plan items.
 */
export const planExpansionScenarios: ScenarioDef[] = [
  {
    slug: 'showcase-player-sign-in',
    role: 'player',
    showcase: true,
    title: 'Player signs in and resets a password',
    description:
      'Open the login form, use Forgot Password, and see the first-time invite prompt that requires a new password.',
    relatedSlugs: ['showcase-player-me-hub', 'showcase-public-join-accept'],
    steps: [
      {
        id: 'login-form',
        kind: 'context',
        title: 'Login screen',
        body: 'Members sign in with email and password. Use Forgot Password if you cannot get in, or set a new password the first time you accept an invite.',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          await ctx.page.click('input[type="email"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_EMAILS.player, { delay: 5 });
          await ctx.page.click('input[type="password"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_PASSWORD, { delay: 5 });
        },
      },
      {
        id: 'forgot-password',
        kind: 'action',
        title: 'Forgot Password',
        body: 'Request a reset when you cannot sign in. The club emails a link (this capture stops on the request form).',
        actionHint: 'Click Forgot Password?',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          return { hotspot: await ctx.hotspotForButton('Forgot Password') };
        },
      },
      {
        id: 'forgot-modal',
        kind: 'result',
        title: 'Reset request',
        body: 'Enter the account email. If the address exists, the club generates a reset token you can use to choose a new password.',
        resultNote: 'Forgot Password modal is open; the form is not submitted.',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          await ctx.clickButtonContaining('Forgot Password');
          await ctx.delay(500);
          await waitForText(ctx, 'Forgot Password');
        },
      },
      {
        id: 'invite-password',
        kind: 'result',
        title: 'First-time invite password',
        body: 'Invited members who still have a temporary password must set a new one before using the app.',
        resultNote: 'Password Reset Required after signing in with the invite account.',
        capture: async (ctx) => {
          await goToLoginForm(ctx.page);
          await ctx.page.click('input[type="email"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_INVITE_MEMBER.email, { delay: 5 });
          await ctx.page.click('input[type="password"]', { clickCount: 3 });
          await ctx.page.keyboard.type(TUTORIAL_PASSWORD, { delay: 5 });
          await ctx.page.click('button[type="submit"]');
          await waitForText(ctx, 'Password Reset Required');
        },
      },
    ],
  },
  {
    slug: 'showcase-player-me-hub',
    role: 'player',
    showcase: true,
    title: 'Player opens the phone hub',
    description:
      'The /me hub is the compact personal home: check in or out, Settings, Payment, Logout, and Full app.',
    relatedSlugs: ['showcase-player-sign-in', 'showcase-player-edit-profile'],
    steps: [
      {
        id: 'players-home',
        kind: 'context',
        title: 'Players home',
        body: 'On a wide screen you land on the roster. The phone hub is always at /me, and Full app returns here.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(400);
        },
      },
      {
        id: 'open-me',
        kind: 'action',
        title: 'Open /me',
        body: 'On a compact phone the Me control returns to this hub. This walkthrough opens /me directly so the tiles are visible at tutorial size.',
        actionHint: 'Open the phone hub',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          const me = await hotspotForTitle(ctx.page, 'Simple phone hub');
          if (me) return { hotspot: me };
          const aria = await ctx.page.$('button[aria-label="Open simple phone hub"]');
          if (aria) return { hotspot: await ctx.hotspotFor('button[aria-label="Open simple phone hub"]') };
          return {};
        },
      },
      {
        id: 'me-hub',
        kind: 'result',
        title: 'Phone hub',
        body: 'Check in or out from the large tile, then use Settings, Payment, Logout, or Full app.',
        resultNote: '/me shows the compact personal controls.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/me');
          await waitForText(ctx, 'Settings');
          await waitForText(ctx, 'Payment');
        },
      },
    ],
  },
  {
    slug: 'showcase-player-edit-profile',
    role: 'player',
    showcase: true,
    title: 'Player edits their profile',
    description: 'Open the header profile control and change your own contact fields.',
    relatedSlugs: ['showcase-player-score-pin', 'showcase-player-me-hub'],
    steps: [
      {
        id: 'profile-control',
        kind: 'action',
        title: 'Edit your profile',
        body: 'The gear next to $ opens your own member editor — not another player’s row.',
        actionHint: 'Click Edit your profile',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'Edit your profile');
          if (!hs) throw new Error('Edit your profile control not found');
          return { hotspot: hs };
        },
      },
      {
        id: 'editor',
        kind: 'result',
        title: 'Your profile',
        body: 'Update email, phone, and notifications, then save. Score PIN lives in the same editor.',
        resultNote: 'Self profile editor is open.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnProfileEditor(ctx);
        },
      },
    ],
  },
  {
    slug: 'showcase-player-score-pin',
    role: 'player',
    showcase: true,
    title: 'Player changes their score PIN',
    description: 'From your profile, show, change, or regenerate the PIN used at score kiosks.',
    relatedSlugs: ['showcase-player-edit-profile', 'showcase-player-score-kiosk'],
    steps: [
      {
        id: 'pin-section',
        kind: 'context',
        title: 'Score PIN',
        body: 'The Score PIN block is on your profile. Show PIN reveals it; Change PIN sets a new one; Regenerate PIN makes a random PIN.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await openOwnProfileEditor(ctx);
          await ctx.page.evaluate(() => {
            const h = [...document.querySelectorAll('h5')].find((n) =>
              (n.textContent || '').includes('Score PIN'),
            );
            h?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(200);
        },
      },
      {
        id: 'change-pin',
        kind: 'action',
        title: 'Change PIN',
        body: 'Open the change form. Enter the new PIN twice and save — this capture does not submit a change.',
        actionHint: 'Click Change PIN',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnProfileEditor(ctx);
          await ctx.page.evaluate(() => {
            const h = [...document.querySelectorAll('h5')].find((n) =>
              (n.textContent || '').includes('Score PIN'),
            );
            h?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(200);
          return { hotspot: await ctx.hotspotForButton('Change PIN') };
        },
      },
      {
        id: 'pin-form',
        kind: 'result',
        title: 'New PIN fields',
        body: 'Type the PIN and confirmation, then save. Keep this PIN for kiosk score entry.',
        resultNote: 'Change PIN form is expanded.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnProfileEditor(ctx);
          await ctx.clickButtonContaining('Change PIN');
          await ctx.delay(400);
        },
      },
    ],
  },
  {
    slug: 'showcase-player-browse-tournaments',
    role: 'player',
    showcase: true,
    title: 'Player browses tournaments',
    description: 'Open Tournaments as a player, switch stages, and open an event you are in.',
    relatedSlugs: ['showcase-player-sign-in', 'showcase-organizer-create-rr'],
    steps: [
      {
        id: 'nav-tournaments',
        kind: 'action',
        title: 'Tournaments tab',
        body: 'Header Tournaments opens the club event list. Players typically cannot create tournaments.',
        actionHint: 'Open Tournaments',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForHref(ctx.page, '/tournaments');
          if (hs) return { hotspot: hs };
          return { hotspot: await ctx.hotspotForButton('Tournaments') };
        },
      },
      {
        id: 'list',
        kind: 'result',
        title: 'Active list',
        body: 'Active, Preregistration, and Completed stages list club events. Open a row to follow results and registration.',
        resultNote: 'Active stage shows Tutorial Active Round Robin.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openTournamentsStage(ctx, 'Active');
          await waitForText(ctx, TUTORIAL_ACTIVE_RR_NAME);
        },
      },
      {
        id: 'open-event',
        kind: 'result',
        title: 'Tournament page',
        body: 'The event page shows participants and scores. Players follow along; organizers use extra day-of tools here.',
        resultNote: 'Opened Tutorial Active Round Robin as a player.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openSeededActiveRoundRobin(ctx);
        },
      },
    ],
  },
  {
    slug: 'showcase-player-public-from-header',
    role: 'player',
    showcase: true,
    title: 'Player opens public achievements',
    description: 'From a signed-in session, open the Public header link to the club achievements board.',
    relatedSlugs: ['showcase-public-achievements', 'showcase-player-sign-in'],
    steps: [
      {
        id: 'public-link',
        kind: 'action',
        title: 'Public in the header',
        body: 'Public opens the club pages (latest results, all results, achievements, join) in a new tab. This capture stays in the same window.',
        actionHint: 'Click Public',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('Public') };
        },
      },
      {
        id: 'achievements',
        kind: 'result',
        title: 'Public achievements',
        body: 'The same achievements board visitors see without signing in. Switch Period vs Tournament, then print a board if you need a copy.',
        resultNote: 'Signed-in member viewing /public/achievements.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/public/achievements');
          await waitForText(ctx, 'Achievements');
        },
      },
    ],
  },
  {
    slug: 'showcase-player-header-checkin',
    role: 'player',
    showcase: true,
    title: 'Player checks in from the header',
    description:
      'Use the header location control to check yourself in or out without the kiosk. The /me hub has the same control as a large tile.',
    relatedSlugs: ['showcase-player-checkin', 'showcase-player-me-hub'],
    steps: [
      {
        id: 'header-control',
        kind: 'action',
        title: 'Header check-in',
        body: 'The pin control is next to your profile. Gray means you are out; green means you are present. This capture does not submit a check-in.',
        actionHint: 'Find the check-in control',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          const out = await hotspotForTitle(ctx.page, 'Not checked in — click to check in');
          if (out) return { hotspot: out };
          const inn = await hotspotForTitle(ctx.page, 'Checked in — click to check out');
          if (inn) return { hotspot: inn };
          return { hotspot: await ctx.hotspotFor('button[aria-label*="check"]') };
        },
      },
      {
        id: 'me-tile',
        kind: 'result',
        title: 'Same control on /me',
        body: 'On the phone hub the tile is labeled Check in or Check out. Payment may be required before a club-day check-in succeeds.',
        resultNote: '/me check-in tile is visible.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/me');
          await waitForText(ctx, 'Check in');
        },
      },
    ],
  },
  {
    slug: 'showcase-player-payment-return',
    role: 'player',
    showcase: true,
    title: 'Player returns from online payment',
    description:
      'After Stripe Checkout, the browser lands on /payment-return with success or cancel copy. Close the tab and return to the club app.',
    relatedSlugs: ['showcase-player-plan', 'showcase-admin-payment-log'],
    steps: [
      {
        id: 'success',
        kind: 'result',
        title: 'Payment submitted',
        body: 'A successful Checkout return shows Payment submitted. The club plan updates shortly; you can close the page.',
        resultNote: '/payment-return?status=success',
        capture: async (ctx) => {
          await gotoPath(ctx, '/payment-return?status=success');
          await waitForText(ctx, 'Payment submitted');
        },
      },
      {
        id: 'cancel',
        kind: 'result',
        title: 'Payment cancelled',
        body: 'If you leave Checkout without paying, this page confirms nothing was charged. Try again from the club app when you are ready.',
        resultNote: '/payment-return?status=cancel',
        capture: async (ctx) => {
          await gotoPath(ctx, '/payment-return?status=cancel');
          await waitForText(ctx, 'Payment cancelled');
        },
      },
    ],
  },

  {
    slug: 'showcase-organizer-create-prelim-playoff',
    role: 'organizer',
    showcase: true,
    title: 'Organizer creates Preliminary + Playoff Final',
    description:
      'Expand Preliminary, choose Playoff Final, select players, then configure groups, qualifiers, and the playoff bracket size.',
    relatedSlugs: ['showcase-organizer-create-playoff', 'showcase-organizer-player-selection'],
    steps: [
      {
        id: 'open-wizard',
        kind: 'action',
        title: 'Start a tournament',
        body: 'Open + Tournament. Preliminary compounds live in the Preliminary group on the type modal.',
        actionHint: 'Click + Tournament',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Tournament') };
        },
      },
      {
        id: 'pick-prelim-playoff',
        kind: 'action',
        title: 'Choose Playoff Final',
        body: 'Expand Preliminary and select Playoff Final. Groups play round robins; qualifiers feed a playoff bracket.',
        actionHint: 'Select Playoff Final',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'PRELIMINARY_WITH_FINAL_PLAYOFF');
          return { hotspot: await hotspotForTournamentType(ctx, 'PRELIMINARY_WITH_FINAL_PLAYOFF') };
        },
      },
      {
        id: 'configure',
        kind: 'result',
        title: 'Tournament configuration',
        body: 'After player selection, set auto-qualified players, group size, qualifiers per group, and playoff bracket size, then continue to groups.',
        resultNote: 'Preliminary + Playoff configuration is open.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPrelimPlayoffConfigure(ctx, 8);
        },
      },
      {
        id: 'create',
        kind: 'action',
        title: 'Continue from configuration',
        body: 'Continue into group confirmation, then Create Tournament when the groups look right.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPrelimPlayoffConfigure(ctx, 8);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-preregistration',
    role: 'organizer',
    showcase: true,
    title: 'Organizer runs pre-registration',
    description:
      'Open the Preregistration stage, inspect a collecting event, and use Finalize when the field is ready.',
    relatedSlugs: ['showcase-organizer-create-event', 'showcase-organizer-cancel-prereg'],
    steps: [
      {
        id: 'prereg-tab',
        kind: 'action',
        title: 'Preregistration stage',
        body: 'The Preregistration tab lists events still collecting sign-ups.',
        actionHint: 'Open Preregistration',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/tournaments');
          return { hotspot: await ctx.hotspotForButton('Preregistration') };
        },
      },
      {
        id: 'list',
        kind: 'result',
        title: 'Collecting events',
        body: 'Tutorial Pre-Registration Event and Tutorial Event Night sit here until you Finalize or Cancel.',
        resultNote: 'Preregistration list is visible.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentsStage(ctx, 'Preregistration');
          await waitForText(ctx, TUTORIAL_PREREG_NAME);
        },
      },
      {
        id: 'detail',
        kind: 'result',
        title: 'Event detail',
        body: 'Open an event to see seats, registrations, Finalize, and Cancel. Finalize builds the tournament from registered players.',
        resultNote: 'Pre-registration detail with organizer Finalize.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_PREREG_NAME);
        },
      },
      {
        id: 'finalize',
        kind: 'action',
        title: 'Finalize',
        body: 'Finalize creates the live tournament from the current registrations. This capture does not submit it.',
        actionHint: 'Find Finalize',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_PREREG_NAME);
          return { hotspot: await ctx.hotspotForButton('Finalize') };
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-player-selection',
    role: 'organizer',
    showcase: true,
    title: 'Organizer selects and seeds players',
    description:
      'After choosing a format, pick the roster one-by-one or with Select All. Playoff then shows a rating-seeded bracket you can rearrange.',
    relatedSlugs: ['showcase-organizer-create-rr', 'showcase-organizer-create-playoff'],
    steps: [
      {
        id: 'picker',
        kind: 'result',
        title: 'Player picker',
        body: 'Every format uses this table. Check members until you meet the format minimum, then Continue.',
        resultNote: 'Round Robin player selection is open.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'ROUND_ROBIN');
        },
      },
      {
        id: 'select-all',
        kind: 'action',
        title: 'Select All',
        body: 'Select All checks every eligible row. Deselect All clears the field. Individual checkboxes still work for a smaller draw.',
        actionHint: 'Click Select All',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'ROUND_ROBIN');
          return { hotspot: await ctx.hotspotForButton('Select All') };
        },
      },
      {
        id: 'one-player',
        kind: 'action',
        title: 'Select one player',
        body: 'Or check a single row. Playoff seeding later uses ratings: higher rated players sit on preferred bracket lines.',
        actionHint: 'Click a player checkbox',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'ROUND_ROBIN');
          return { hotspot: await hotspotForTournamentPlayerCheckbox(ctx, 0) };
        },
      },
      {
        id: 'playoff-seeds',
        kind: 'result',
        title: 'Rating-seeded bracket',
        body: 'Playoff preview places players by rating. Drag to rearrange only when the UI allows it, then continue to first-round matches.',
        resultNote: 'Playoff bracket organize step after selecting eight players.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffBracketOrganize(ctx, 8);
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-early-completion',
    role: 'organizer',
    showcase: true,
    title: 'Organizer uses Early Completion',
    description:
      'On an active tournament, open Stop Tournament. Early Completion finishes remaining matches as NP when enough matches are played.',
    relatedSlugs: ['showcase-organizer-correct-completed-score', 'showcase-admin-enter-score'],
    steps: [
      {
        id: 'stop-control',
        kind: 'action',
        title: 'Stop tournament',
        body: 'The red X opens a destructive dialog. Abandon cancels the event; Early Completion can complete it early when the percentage rule is met.',
        actionHint: 'Click Cancel tournament',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openSeededActiveRoundRobin(ctx);
          const hs = await hotspotForTitle(ctx.page, 'Cancel tournament');
          if (!hs) throw new Error('Cancel tournament control not found');
          return { hotspot: hs };
        },
      },
      {
        id: 'dialog',
        kind: 'result',
        title: 'Early Completion',
        body: 'Enter your password to Abandon. Early Completion uses the club min-played % (you can override it in this dialog). Remaining matches become NP.',
        resultNote: 'Stop Tournament dialog with Early Completion.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openStopTournamentDialog(ctx);
        },
      },
      {
        id: 'early-button',
        kind: 'action',
        title: 'Early Completion control',
        body: 'Use Early Completion only when you intend to finish the event. This capture does not submit it.',
        actionHint: 'Find Early Completion',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openStopTournamentDialog(ctx);
          return { hotspot: await ctx.hotspotForButton('Early Completion') };
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-repeat',
    role: 'organizer',
    showcase: true,
    title: 'Organizer repeats a completed tournament',
    description:
      'From a completed event, Repeat opens the wizard with the same type and players so you can run it again or modify the field.',
    relatedSlugs: ['showcase-organizer-create-rr', 'showcase-organizer-correct-completed-score'],
    steps: [
      {
        id: 'completed',
        kind: 'context',
        title: 'Completed event',
        body: 'Open a finished tournament. Repeat copies its setup; you can change the name and roster before creating.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
        },
      },
      {
        id: 'repeat',
        kind: 'action',
        title: 'Repeat',
        body: 'Repeat starts a new tournament with the same format and participants.',
        actionHint: 'Click Repeat',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          return { hotspot: await ctx.hotspotForButton('Repeat') };
        },
      },
      {
        id: 'wizard',
        kind: 'result',
        title: 'Wizard prefilled',
        body: 'You land in the create flow with the prior type and players. Adjust, then create — or back out if you only wanted to inspect.',
        resultNote: 'Repeat opened the tournament wizard from the completed event.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          const clicked = await ctx.clickButtonContaining('Repeat');
          if (!clicked) throw new Error('Repeat not found');
          await ctx.delay(1000);
          await ctx.page.waitForFunction(
            () =>
              [...document.querySelectorAll('input[name="tournamentType"]')].length > 0 ||
              /Create Tournament|Next|Continue/i.test(document.body.innerText || ''),
            { timeout: 20000 },
          );
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-event-admissions',
    role: 'organizer',
    showcase: true,
    title: 'Organizer handles event admissions and unpaid fees',
    description:
      'On a paid Event, read the check-in window and handle pending or unpaid event fees (Record cash / Clear unpaid).',
    relatedSlugs: ['showcase-organizer-create-event', 'showcase-admin-event-fee-ledger'],
    steps: [
      {
        id: 'event-detail',
        kind: 'result',
        title: 'Event check-in window',
        body: 'Check-in time is when event admissions open. Players who check in inside that window use the event fee instead of a separate club-day charge.',
        resultNote: 'Tutorial Event Night shows Time and Check-in time.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_EVENT_NIGHT_NAME);
          await waitForText(ctx, 'Check-in time');
        },
      },
      {
        id: 'unpaid',
        kind: 'action',
        title: 'Unpaid event fee',
        body: `${TUTORIAL_EVENT_FEE_MEMBER.firstName} ${TUTORIAL_EVENT_FEE_MEMBER.lastName} still has a pending event fee. Record cash at the desk or Clear unpaid if they will not pay.`,
        actionHint: 'Find Record cash or Clear unpaid',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_EVENT_NIGHT_NAME);
          await ctx.page.evaluate((name) => {
            const el = [...document.querySelectorAll('span, div, button')].find((n) =>
              (n.textContent || '').includes(name),
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          }, TUTORIAL_EVENT_FEE_MEMBER.lastName);
          await ctx.delay(200);
          try {
            return { hotspot: await ctx.hotspotForButton('Record cash') };
          } catch {
            try {
              return { hotspot: await ctx.hotspotForButton('Clear unpaid') };
            } catch {
              return {};
            }
          }
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-forfeit-bye',
    role: 'organizer',
    showcase: true,
    title: 'Organizer records a forfeit (and sees BYEs)',
    description:
      'Open Match Entry on an active Round Robin to mark a forfeit. Playoff brackets show BYE when a seed has no opponent.',
    relatedSlugs: ['showcase-admin-enter-score', 'showcase-organizer-create-playoff'],
    steps: [
      {
        id: 'match-entry',
        kind: 'context',
        title: 'Match Entry',
        body: 'Click an empty score cell. Organizers see forfeit checkboxes; kiosk score entry hides them.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openSeededActiveRoundRobin(ctx);
          await openFirstEmptyScoreEntry(ctx);
        },
      },
      {
        id: 'forfeit',
        kind: 'action',
        title: 'Forfeit',
        body: 'Check a player’s Forfeit to award the match without set scores. Only one side can forfeit.',
        actionHint: 'Find a Forfeit checkbox',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededActiveRoundRobin(ctx);
          await openFirstEmptyScoreEntry(ctx);
          return { hotspot: await ctx.hotspotFor('#editPlayer1Forfeit') };
        },
      },
      {
        id: 'bye',
        kind: 'result',
        title: 'BYE in a playoff',
        body: 'When the field is not a power of two, Playoff preview shows BYE for empty first-round slots. Those players advance automatically.',
        resultNote: 'Playoff organize step with a non–power-of-two field.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffBracketOrganize(ctx, 5);
        },
      },
    ],
  },
  {
    slug: 'showcase-organizer-cancel-prereg',
    role: 'organizer',
    showcase: true,
    title: 'Organizer cancels pre-registration with a reason',
    description:
      'Cancel a collecting event and pick a preset reason (and optional details) for the email to invited and registered players.',
    relatedSlugs: ['showcase-organizer-preregistration', 'showcase-organizer-create-event'],
    steps: [
      {
        id: 'cancel',
        kind: 'action',
        title: 'Cancel',
        body: 'Cancel removes the pre-registration and emails players who have an address. This capture does not confirm it.',
        actionHint: 'Click Cancel',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_PREREG_NAME);
          return { hotspot: await ctx.hotspotForButton('Cancel') };
        },
      },
      {
        id: 'reason',
        kind: 'result',
        title: 'Preset reason',
        body: 'Choose a club preset such as Tournament cancelled by organizer or Not enough registered players, add details if needed, then Confirm Cancel — or Keep Registration.',
        resultNote: 'Cancel Tournament Registration dialog with reason presets.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPreregistrationTournament(ctx, TUTORIAL_PREREG_NAME);
          await ctx.clickButtonContaining('Cancel');
          await ctx.delay(400);
          await waitForText(ctx, 'Cancel Tournament Registration');
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-csv',
    role: 'admin',
    showcase: true,
    title: 'Admin imports and exports players as CSV',
    description: 'Open Players Settings to export the roster CSV or import a CSV (optionally sending invitation email).',
    relatedSlugs: ['showcase-admin-club-archive', 'showcase-admin-attendance-log'],
    steps: [
      {
        id: 'settings',
        kind: 'action',
        title: 'Players Settings',
        body: 'CSV and club archive tools live in Settings on the Players toolbar.',
        actionHint: 'Click Settings',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('Settings') };
        },
      },
      {
        id: 'export-csv',
        kind: 'action',
        title: 'Export CSV',
        body: 'Export writes the current roster to CSV. Use Chrome or Edge when you need a full Save As location.',
        actionHint: 'Find Export',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPlayersSettingsMenu(ctx);
          return { hotspot: await ctx.hotspotForButton('Export') };
        },
      },
      {
        id: 'import-csv',
        kind: 'result',
        title: 'Import CSV',
        body: 'Import players from CSV. Optionally send invitation email to new addresses. This capture does not pick a file.',
        resultNote: 'Settings panel shows Export and Import.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPlayersSettingsMenu(ctx);
          await waitForText(ctx, 'Import');
        },
      },
    ],
  },
  {
    slug: 'showcase-admin-membership-log',
    role: 'admin',
    showcase: true,
    title: 'Admin reviews the Membership Log',
    description: 'Open Membership Log to see apply, activate, update, deny, and delete history for members.',
    relatedSlugs: ['showcase-public-join-apply', 'showcase-admin-attendance-log'],
    steps: [
      {
        id: 'menu',
        kind: 'action',
        title: 'Membership Log',
        body: 'Membership Log is under Admin, next to Payment Log and Attendance Log.',
        actionHint: 'Open Membership Log',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          return { hotspot: await hotspotForAdminMenuItem(ctx, 'Membership Log') };
        },
      },
      {
        id: 'log',
        kind: 'result',
        title: 'Lifecycle history',
        body: 'Filter by action and date. Rows survive member deletion so you can still see who applied or was denied.',
        resultNote: 'Membership Log lists APPLY, ACTIVATE, and UPDATE rows from the tutorial seed.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/membership-log');
          await waitForText(ctx, 'Membership Log');
        },
      },
    ],
  },
  {
    slug: 'showcase-admin-courtesy',
    role: 'admin',
    showcase: true,
    title: 'Admin sets courtesy visit policy',
    description:
      'Courtesy grace days and extra visits live on Payment Plans. Courtesy check-ins appear on the Attendance Log Admission column.',
    relatedSlugs: ['showcase-admin-attendance-log', 'showcase-admin-payment-log'],
    steps: [
      {
        id: 'courtesy-settings',
        kind: 'result',
        title: 'Courtesy settings',
        body: 'On Payment Plans, Payment Provider & Courtesy Settings controls grace days, extra visits, and admin notify-on-courtesy.',
        resultNote: 'Courtesy grace days are visible on Payment Plans.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          await scrollCourtesySettings(ctx);
          await waitForText(ctx, 'Courtesy grace days');
        },
      },
      {
        id: 'attendance',
        kind: 'result',
        title: 'Courtesy on Attendance Log',
        body: 'A courtesy visit shows Admission as Courtesy. Suspend courtesy on a member’s Plan screen if they should not use grace.',
        resultNote: 'Attendance Log includes a courtesy visit from the tutorial seed.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('td, span, div')].find((n) =>
              (n.textContent || '').trim() === 'Courtesy',
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(200);
        },
      },
    ],
  },
  {
    slug: 'showcase-admin-hours-close-club',
    role: 'admin',
    showcase: true,
    title: 'Admin sets club hours and closes the club',
    description:
      'Set weekly open/close hours in System Settings, then use Close club on the Attendance Log. Auto checkout appears as Club close (AUTO) on visit rows.',
    relatedSlugs: ['showcase-admin-attendance-log', 'showcase-admin-system-config'],
    steps: [
      {
        id: 'hours',
        kind: 'result',
        title: 'Open / Close hours',
        body: 'Expand Open / Close hours for weekday times, closed days, and date overrides in the club timezone.',
        resultNote: 'Hours section is expanded.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Open / Close hours');
        },
      },
      {
        id: 'close-club',
        kind: 'action',
        title: 'Close club',
        body: 'Close club checks out everyone still present for the club-local day. Confirm with your password. Optional checkout time is shown next to the control.',
        actionHint: 'Find Close club',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          return { hotspot: await ctx.hotspotForButton('Close club') };
        },
      },
      {
        id: 'auto-checkout',
        kind: 'result',
        title: 'Auto checkout',
        body: 'Visits closed by club close show Club close (AUTO) on the Attendance Log. Manual check-out uses a different closed-by label.',
        resultNote: 'Attendance Log includes an AUTO checkout row.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('td, span, div')].find((n) =>
              /Club close \(AUTO\)|AUTO/i.test(n.textContent || ''),
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(200);
        },
      },
    ],
  },
  {
    slug: 'showcase-admin-club-archive',
    role: 'admin',
    showcase: true,
    title: 'Admin exports and imports a club archive',
    description:
      'From Players Settings, export a JSON archive of members plus completed tournaments, or import an archive into an empty tournament database.',
    relatedSlugs: ['showcase-admin-csv', 'showcase-admin-system-config'],
    steps: [
      {
        id: 'settings',
        kind: 'context',
        title: 'Archive tools',
        body: 'Club archive sits under CSV in Settings. It is for full club backup, not a daily roster CSV.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openPlayersSettingsMenu(ctx);
          await waitForText(ctx, 'Club archive');
        },
      },
      {
        id: 'export-archive',
        kind: 'action',
        title: 'Export archive',
        body: 'Export club archive JSON (members + completed tournaments). This capture does not download a file.',
        actionHint: 'Find Export archive',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPlayersSettingsMenu(ctx);
          return { hotspot: await ctx.hotspotForButton('Export archive') };
        },
      },
      {
        id: 'import-archive',
        kind: 'result',
        title: 'Import archive',
        body: 'Import archive is for an empty tournament database. Do not import over a live club without a restore plan.',
        resultNote: 'Import archive control is visible in Settings.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPlayersSettingsMenu(ctx);
          await waitForText(ctx, 'Import archive');
        },
      },
    ],
  },
  {
    slug: 'showcase-admin-write-off',
    role: 'admin',
    showcase: true,
    title: 'Admin writes off a pending payment',
    description:
      'On Payment Log, write off a pending payment when it will never be collected. No plan is granted. Confirm with the member name and your password.',
    relatedSlugs: ['showcase-admin-payment-log', 'showcase-admin-event-fee-ledger'],
    steps: [
      {
        id: 'pending',
        kind: 'context',
        title: 'Pending payments',
        body: 'Filter Payment Log to pending. Write off sits next to Clear for cash that will not be collected.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
        },
      },
      {
        id: 'write-off',
        kind: 'action',
        title: 'Write off',
        body: 'Write off does not grant a plan. Use it only when the obligation should be dropped.',
        actionHint: 'Click Write off',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
          return { hotspot: await ctx.hotspotForButton('Write off') };
        },
      },
      {
        id: 'confirm',
        kind: 'result',
        title: 'Confirm write-off',
        body: 'Type the member’s name and your password. This capture does not submit the write-off.',
        resultNote: 'Write off pending payment dialog is open.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
          await ctx.clickButtonContaining('Write off');
          await ctx.delay(400);
          await waitForText(ctx, 'Write off pending payment');
        },
      },
    ],
  },
];
