import type { ScenarioDef } from '../lib/types';
import {
  TUTORIAL_CHECKIN_MEMBER,
  TUTORIAL_CHECKOUT_MEMBER,
  TUTORIAL_COMPLETED_RR_NAME,
  TUTORIAL_EMAILS,
  TUTORIAL_HISTORY_MEMBER,
  TUTORIAL_HISTORY_OPPONENTS,
  TUTORIAL_MONTHLY_PLAN_NAME,
  TUTORIAL_STATS_MEMBERS,
  TUTORIAL_PASSWORD,
  TUTORIAL_SCORE_PIN,
  TUTORIAL_UPDATED_CLUB_NAME,
  TUTORIAL_UPDATED_TIMEZONE,
} from '../lib/constants';
import {
  applyShowcaseSystemConfigEdits,
  clearHistoryOpponents,
  clickApplyAchievementsToAll,
  hotspotForPlayerQuickStatsButton,
  hotspotForPlayerStatsCheckbox,
  hotspotForStatsToolbar,
  hotspotForViewStatistics,
  openMultiPlayerStatistics,
  openPlayerMatchHistory,
  openPlayerSingleStatistics,
  selectHistoryOpponents,
  startStatsSelection,
  togglePlayerForStats,
  enableCompletedScoreCorrection,
  ensureAdminSession,
  ensureLoggedIn,
  ensureSystemSectionOpen,
  ensureTournamentRuleOpen,
  enterCheckinKiosk,
  enterTournamentScoreKiosk,
  ensurePlayersNameFilterVisible,
  fillCheckinPin,
  fillMatchEntryPins,
  fillMatchEntryScores,
  fillPlanFormTotalPrice,
  gotoPath,
  hotspotForCorrectScoresToggle,
  hotspotForCreatePlan,
  hotspotForFirstEmptyScoreCell,
  hotspotForFirstScoredResultCell,
  hotspotForHref,
  hotspotForMatchEntryPinField,
  hotspotForMatchEntrySave,
  hotspotForMatchEntryScoreField,
  fillMatchEntryPinField,
  fillMatchEntryScoreField,
  hotspotForMemberAttendanceButton,
  hotspotForMemberCheckinButton,
  hotspotForPinModalAttendance,
  hotspotForPinModalCheckin,
  hotspotForPlayersNameFilter,
  hotspotForPlanFamilySegmentAdd,
  hotspotForPlanPurchaseButton,
  hotspotForPlanSelect,
  hotspotForPlanSelectOption,
  hotspotForPlayerHistoryButton,
  expandPlanSelectForCapture,
  collapsePlanSelect,
  hotspotForSystemSave,
  hotspotForSystemSection,
  hotspotForTitle,
  hotspotForTournamentPlayerCheckbox,
  hotspotForTournamentType,
  hotspotForViewHistory,
  openAdminMenu,
  openSystemSettings,
  openFirstCompletedScoreCorrection,
  startPlayerHistorySelection,
  openFirstEmptyScoreEntry,
  openMemberAttendancePinModal,
  openMemberCheckinPinModal,
  openMultiRrConfirmGroups,
  openMultiRrFinalConfirm,
  openMultiRrGroupSize,
  openOwnPlanScreen,
  openPaymentPlans,
  openPlanFamilySegmentForm,
  openRoundRobinConfirm,
  openRoundRobinPlayerSelection,
  openSeededActiveRoundRobin,
  openSeededCompletedRoundRobin,
  openTournamentPlayerSelection,
  openTournamentWizard,
  saveMatchEntry,
  saveSystemSettings,
  scrollPlanHeading,
  selectPlanFamilyKey,
  selectPlanFormSegment,
  selectTournamentPlayers,
  selectTournamentType,
  setPlanPayMethod,
  setSystemClubName,
  setSystemClubTimezone,
  setSystemNumericByAriaLabel,
  setPlayersNameFilter,
  submitAttendancePinModal,
  submitCheckinPinModal,
  submitCreatePlan,
  submitPlanPurchase,
} from '../lib/steps';
import { goToLoginForm } from '../lib/browser';

const SHOWCASE_RR_NAME = 'Tutorial Showcase Round Robin';
const SHOWCASE_MULTI_RR_NAME = 'Tutorial Showcase Multi RR';
const SHOWCASE_PLAN_FAMILY = 'visit-pack-5';
const SHOWCASE_MULTI_RR_PLAYERS = 8;

/**
 * Role-grouped showcase walkthroughs (listed in the public catalog).
 * Pattern: context → action (hotspot) → result, with seeded data visible on screen.
 */
export const showcaseScenarios: ScenarioDef[] = [
  {
    slug: 'showcase-player-plan',
    role: 'player',
    showcase: true,
    title: 'Player buys / reviews a plan',
    description:
      'Sign in, open your plan with $, see that no current or next plan exists, pick a 5-visit pack, purchase with cash, and close.',
    relatedSlugs: ['showcase-player-checkin', 'showcase-admin-front-desk'],
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
        id: 'current-plan-none',
        kind: 'result',
        title: 'No current plan',
        body: 'The plan screen opens. Current plan shows None — this member does not have an active plan yet.',
        resultNote: 'Current plan is empty (None).',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await scrollPlanHeading(ctx, 'Current plan');
        },
      },
      {
        id: 'next-plan-buying',
        kind: 'result',
        title: 'No next plan — buy one',
        body: 'Next plan is also None. Use the Purchase section below to buy a new plan.',
        resultNote: 'Next plan empty; Purchase section is available.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await scrollPlanHeading(ctx, 'Next plan');
          await ctx.delay(200);
          await scrollPlanHeading(ctx, 'Purchase');
        },
      },
      {
        id: 'open-plan-list',
        kind: 'action',
        title: 'Open the plan list',
        body: 'Open the Plan drop-down to see every club plan and its price.',
        actionHint: 'Open the Plan list',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await scrollPlanHeading(ctx, 'Purchase');
          await collapsePlanSelect(ctx);
          return { hotspot: await hotspotForPlanSelect(ctx) };
        },
      },
      {
        id: 'plan-list-open',
        kind: 'result',
        title: 'Plan choices',
        body: 'The list shows Monthly membership, the 5-visit pack, and other club plans with prices.',
        resultNote: 'Plan drop-down is expanded.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await scrollPlanHeading(ctx, 'Purchase');
          await expandPlanSelectForCapture(ctx);
        },
      },
      {
        id: 'select-visit-pack',
        kind: 'action',
        title: 'Select 5-visit pack',
        body: 'Choose the 5-visit pack from the list. Details and price update under the control.',
        actionHint: 'Select 5-visit pack',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await scrollPlanHeading(ctx, 'Purchase');
          return { hotspot: await hotspotForPlanSelectOption(ctx, SHOWCASE_PLAN_FAMILY) };
        },
      },
      {
        id: 'visit-pack-selected',
        kind: 'result',
        title: '5-visit pack selected',
        body: 'The 5-visit pack is selected. Choose Cash or Pay online, then purchase.',
        resultNote: 'Visit pack selected in the Plan control.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await selectPlanFamilyKey(ctx, SHOWCASE_PLAN_FAMILY);
          await scrollPlanHeading(ctx, 'Purchase');
          await ctx.delay(300);
        },
      },
      {
        id: 'purchase-cash',
        kind: 'action',
        title: 'Purchase with cash',
        body: 'Tap Purchase · Cash. If you have an email and consent to online payment, Pay online would be the default instead. An administrator will accept the cash payment later — it moves from Pending to Paid.',
        actionHint: 'Click Purchase · Cash',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          await selectPlanFamilyKey(ctx, SHOWCASE_PLAN_FAMILY);
          await setPlanPayMethod(ctx, 'cash');
          await scrollPlanHeading(ctx, 'Purchase');
          return { hotspot: await hotspotForPlanPurchaseButton(ctx) };
        },
      },
      {
        id: 'purchase-pending',
        kind: 'result',
        title: 'Payment pending',
        body: 'Cash purchase is recorded as pending. An administrator clears it at the front desk; the payment then goes from Pending to Paid.',
        resultNote: 'Pending cash payment awaiting admin clearance.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          const alreadyPending = await ctx.page.evaluate(() =>
            /pending|awaiting admin|Purchase pending/i.test(document.body.innerText || ''),
          );
          if (!alreadyPending) {
            await selectPlanFamilyKey(ctx, SHOWCASE_PLAN_FAMILY);
            await setPlanPayMethod(ctx, 'cash');
            await submitPlanPurchase(ctx);
          }
          await scrollPlanHeading(ctx, 'Current plan');
          await ctx.delay(400);
        },
      },
      {
        id: 'close-plan-action',
        kind: 'action',
        title: 'Close',
        body: 'Close the overlay when you are done. You can reopen $ anytime to check status.',
        actionHint: 'Click Close',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openOwnPlanScreen(ctx);
          const alreadyPending = await ctx.page.evaluate(() =>
            /pending|awaiting admin|Purchase pending/i.test(document.body.innerText || ''),
          );
          if (!alreadyPending) {
            await selectPlanFamilyKey(ctx, SHOWCASE_PLAN_FAMILY);
            await setPlanPayMethod(ctx, 'cash');
            await submitPlanPurchase(ctx);
          }
          return { hotspot: await ctx.hotspotForButton('Close') };
        },
      },
      {
        id: 'back-on-players',
        kind: 'result',
        title: 'Back on Players',
        body: 'Closing returns you to the roster. The pending purchase stays with the club until an admin marks it Paid.',
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
    slug: 'showcase-player-checkin',
    role: 'player',
    showcase: true,
    title: 'Player checks in at the kiosk',
    description:
      'At the club check-in kiosk, a member finds their name (by typing), enters their score PIN, and joins today’s attendance.',
    relatedSlugs: ['showcase-player-checkout', 'showcase-player-score-kiosk'],
    steps: [
      {
        id: 'kiosk-ready',
        kind: 'context',
        title: 'Check-in kiosk',
        body: 'The front desk leaves the Players list in check-in kiosk mode. Members use the Check-in control on their row — not a personal login.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await ensurePlayersNameFilterVisible(ctx);
          await setPlayersNameFilter(ctx, '');
        },
      },
      {
        id: 'type-name',
        kind: 'action',
        title: 'Find your name',
        body: `You can scroll the roster to find ${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName}, but it is more efficient to start typing in the name search.`,
        actionHint: 'Type in the name search field',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await ensurePlayersNameFilterVisible(ctx);
          await setPlayersNameFilter(ctx, '');
          return { hotspot: await hotspotForPlayersNameFilter(ctx) };
        },
      },
      {
        id: 'name-found',
        kind: 'result',
        title: 'Your row appears',
        body: `Typing part of the name narrows the list. ${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName} has an active visit pack and is not present yet, so their row shows Check-in.`,
        resultNote: 'Name filter matches the member; Check-in is ready.',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKIN_MEMBER.firstName);
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName}`);
          await ctx.delay(400);
        },
      },
      {
        id: 'row-checkin-action',
        kind: 'action',
        title: 'Start check-in',
        body: 'Tap Check-in on your row. The kiosk asks for your score PIN (not your login password).',
        actionHint: 'Click Check-in on your row',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKIN_MEMBER.firstName);
          return {
            hotspot: await hotspotForMemberCheckinButton(
              ctx,
              TUTORIAL_CHECKIN_MEMBER.firstName,
              TUTORIAL_CHECKIN_MEMBER.lastName,
            ),
          };
        },
      },
      {
        id: 'enter-pin-action',
        kind: 'action',
        title: 'Enter PIN and confirm',
        body: 'Type the PIN, then confirm Check-in. A correct PIN records attendance for today.',
        actionHint: 'Click Check-in after entering the PIN',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKIN_MEMBER.firstName);
          await openMemberCheckinPinModal(
            ctx,
            TUTORIAL_CHECKIN_MEMBER.firstName,
            TUTORIAL_CHECKIN_MEMBER.lastName,
          );
          await fillCheckinPin(ctx, TUTORIAL_SCORE_PIN);
          return { hotspot: await hotspotForPinModalCheckin(ctx) };
        },
      },
      {
        id: 'checked-in',
        kind: 'result',
        title: 'State updated',
        body: 'The row has changed: Check-in is gone and Check-out appears. The attendance count increases, and a visit-pack remaining visit decreases when this was a charged check-in.',
        resultNote: 'Member is present; kiosk row now offers Check-out.',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKIN_MEMBER.firstName);
          const needsCheckin = await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            return [...(row?.querySelectorAll('button') || [])].some((b) => {
              const t = (b.textContent || '').trim();
              return t === 'Check-in' || t.includes('free re-entry');
            });
          }, `${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName}`);
          if (needsCheckin) {
            await openMemberCheckinPinModal(
              ctx,
              TUTORIAL_CHECKIN_MEMBER.firstName,
              TUTORIAL_CHECKIN_MEMBER.lastName,
            );
            await fillCheckinPin(ctx, TUTORIAL_SCORE_PIN);
            await submitCheckinPinModal(ctx);
          }
          await ctx.page.waitForFunction(
            (needle) => {
              const row = [...document.querySelectorAll('tr')].find((r) =>
                (r.textContent || '').includes(needle),
              );
              return [...(row?.querySelectorAll('button') || [])].some(
                (b) => (b.textContent || '').trim() === 'Check-out',
              );
            },
            { timeout: 15000 },
            `${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName}`,
          );
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_CHECKIN_MEMBER.firstName} ${TUTORIAL_CHECKIN_MEMBER.lastName}`);
          await ctx.delay(500);
        },
      },
    ],
  },

  {
    slug: 'showcase-player-checkout',
    role: 'player',
    showcase: true,
    title: 'Player checks out at the kiosk',
    description:
      'When leaving the club, a present member finds their name (by typing), opens Check-out, enters their PIN, and leaves today’s attendance.',
    relatedSlugs: ['showcase-player-checkin', 'showcase-player-score-kiosk'],
    steps: [
      {
        id: 'kiosk-ready',
        kind: 'context',
        title: 'Check-in kiosk',
        body: 'The same kiosk mode handles leaving: members who are present see Check-out on their row.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await ensurePlayersNameFilterVisible(ctx);
          await setPlayersNameFilter(ctx, '');
        },
      },
      {
        id: 'type-name',
        kind: 'action',
        title: 'Find your name',
        body: `You can scroll the roster to find ${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName}, but it is more efficient to start typing in the name search.`,
        actionHint: 'Type in the name search field',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await ensurePlayersNameFilterVisible(ctx);
          await setPlayersNameFilter(ctx, '');
          return { hotspot: await hotspotForPlayersNameFilter(ctx) };
        },
      },
      {
        id: 'name-found',
        kind: 'result',
        title: 'Your row appears',
        body: `Typing part of the name narrows the list. ${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName} is already checked in for today, so their row shows Check-out.`,
        resultNote: 'Name filter matches the member; Check-out is ready.',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKOUT_MEMBER.firstName);
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName}`);
          await ctx.delay(400);
        },
      },
      {
        id: 'row-checkout-action',
        kind: 'action',
        title: 'Start check-out',
        body: 'Tap Check-out on your row. The kiosk asks for the same score PIN used at check-in.',
        actionHint: 'Click Check-out on your row',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKOUT_MEMBER.firstName);
          return {
            hotspot: await hotspotForMemberAttendanceButton(
              ctx,
              TUTORIAL_CHECKOUT_MEMBER.firstName,
              TUTORIAL_CHECKOUT_MEMBER.lastName,
              'Check-out',
            ),
          };
        },
      },
      {
        id: 'enter-pin-action',
        kind: 'action',
        title: 'Enter PIN and confirm',
        body: 'Type the PIN, then confirm Check-out. A correct PIN ends the open visit for today.',
        actionHint: 'Click Check-out after entering the PIN',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKOUT_MEMBER.firstName);
          await openMemberAttendancePinModal(
            ctx,
            TUTORIAL_CHECKOUT_MEMBER.firstName,
            TUTORIAL_CHECKOUT_MEMBER.lastName,
            'Check-out',
          );
          await fillCheckinPin(ctx, TUTORIAL_SCORE_PIN);
          return { hotspot: await hotspotForPinModalAttendance(ctx, 'Check-out') };
        },
      },
      {
        id: 'checked-out',
        kind: 'result',
        title: 'State updated',
        body: 'The row has changed: Check-out is gone and Check-in returns (free re-entry if they come back today). The attendance count drops.',
        resultNote: 'Member is no longer present; kiosk row offers Check-in again.',
        capture: async (ctx) => {
          await enterCheckinKiosk(ctx, TUTORIAL_EMAILS.admin);
          await setPlayersNameFilter(ctx, TUTORIAL_CHECKOUT_MEMBER.firstName);
          const needsCheckout = await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            return [...(row?.querySelectorAll('button') || [])].some(
              (b) => (b.textContent || '').trim() === 'Check-out',
            );
          }, `${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName}`);
          if (needsCheckout) {
            await openMemberAttendancePinModal(
              ctx,
              TUTORIAL_CHECKOUT_MEMBER.firstName,
              TUTORIAL_CHECKOUT_MEMBER.lastName,
              'Check-out',
            );
            await fillCheckinPin(ctx, TUTORIAL_SCORE_PIN);
            await submitAttendancePinModal(ctx, 'Check-out');
          }
          await ctx.page.waitForFunction(
            (needle) => {
              const row = [...document.querySelectorAll('tr')].find((r) =>
                (r.textContent || '').includes(needle),
              );
              return [...(row?.querySelectorAll('button') || [])].some((b) => {
                const t = (b.textContent || '').trim();
                return t === 'Check-in' || t.includes('free re-entry');
              });
            },
            { timeout: 15000 },
            `${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName}`,
          );
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_CHECKOUT_MEMBER.firstName} ${TUTORIAL_CHECKOUT_MEMBER.lastName}`);
          await ctx.delay(500);
        },
      },
    ],
  },

  {
    slug: 'showcase-player-score-kiosk',
    role: 'player',
    showcase: true,
    title: 'Player enters a score via Score kiosk',
    description:
      'The tournament organizer starts Score kiosk; both players stay present while entering sets and each PIN, then confirm the result.',
    relatedSlugs: ['showcase-player-rating-history', 'showcase-player-checkin'],
    steps: [
      {
        id: 'event-ready',
        kind: 'context',
        title: 'Active tournament',
        body: 'Open the active event (Tutorial Active Round Robin). Before players can enter scores at the table, the tournament organizer must switch this terminal into Score kiosk mode.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await openSeededActiveRoundRobin(ctx);
        },
      },
      {
        id: 'start-score-kiosk',
        kind: 'action',
        title: 'Organizer starts Score kiosk',
        body: 'The tournament organizer taps Score kiosk once. That locks the terminal to this event so players can record results with PINs — without an organizer login at the table.',
        actionHint: 'Click Score kiosk',
        capture: async (ctx) => {
          await ensureAdminSession(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededActiveRoundRobin(ctx);
          const inKiosk = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('button')].some((b) =>
              (b.textContent || '').includes('Restore privileges'),
            ),
          );
          if (inKiosk) {
            await ctx.clickButtonContaining('Restore privileges');
            await ctx.delay(900);
            await openSeededActiveRoundRobin(ctx);
          }
          return { hotspot: await ctx.hotspotForButton('Score kiosk') };
        },
      },
      {
        id: 'score-kiosk-ready',
        kind: 'result',
        title: 'Both players present',
        body: 'Score kiosk is active. Both players in the match should be present at the table when entering the score — each will enter their own PIN to confirm.',
        resultNote: 'Tournament score kiosk is active (Restore privileges visible).',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
        },
      },
      {
        id: 'open-score-cell',
        kind: 'action',
        title: 'Open a match',
        body: 'Tap an empty match cell for the two players who just finished.',
        actionHint: 'Click an empty score cell',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          return { hotspot: await hotspotForFirstEmptyScoreCell(ctx) };
        },
      },
      {
        id: 'enter-first-score',
        kind: 'action',
        title: 'Enter first player’s sets',
        body: 'Type the first player’s set count (here 3).',
        actionHint: 'Enter the first score',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          return { hotspot: await hotspotForMatchEntryScoreField(ctx, 1) };
        },
      },
      {
        id: 'first-score-entered',
        kind: 'result',
        title: 'First score entered',
        body: 'The first player’s sets are filled in (3).',
        resultNote: 'Player 1 score field shows 3.',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScoreField(ctx, 1, 3);
        },
      },
      {
        id: 'enter-second-score',
        kind: 'action',
        title: 'Enter second player’s sets',
        body: 'Type the second player’s set count (here 1).',
        actionHint: 'Enter the second score',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScoreField(ctx, 1, 3);
          return { hotspot: await hotspotForMatchEntryScoreField(ctx, 2) };
        },
      },
      {
        id: 'second-score-entered',
        kind: 'result',
        title: 'Second score entered',
        body: 'Both set counts are in (3–1). Next each participant confirms with their score PIN.',
        resultNote: 'Score fields show 3 and 1.',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
        },
      },
      {
        id: 'enter-pin-1',
        kind: 'action',
        title: 'Enter first PIN',
        body: 'The first participant types their score PIN (not their login password).',
        actionHint: 'Enter the first player’s PIN',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          return { hotspot: await hotspotForMatchEntryPinField(ctx, 0) };
        },
      },
      {
        id: 'pin-1-entered',
        kind: 'result',
        title: 'First PIN entered',
        body: 'The first participant’s PIN is filled. The second player enters theirs next.',
        resultNote: 'First PIN field is filled.',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          await fillMatchEntryPinField(ctx, 0, TUTORIAL_SCORE_PIN);
        },
      },
      {
        id: 'enter-pin-2',
        kind: 'action',
        title: 'Enter second PIN',
        body: 'The second participant types their score PIN to agree with the result.',
        actionHint: 'Enter the second player’s PIN',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          await fillMatchEntryPinField(ctx, 0, TUTORIAL_SCORE_PIN);
          return { hotspot: await hotspotForMatchEntryPinField(ctx, 1) };
        },
      },
      {
        id: 'pin-2-entered',
        kind: 'result',
        title: 'Second PIN entered',
        body: 'Both PINs are in. Confirm to save the match.',
        resultNote: 'Both participant PIN fields are filled.',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          await fillMatchEntryPins(ctx, TUTORIAL_SCORE_PIN, TUTORIAL_SCORE_PIN);
        },
      },
      {
        id: 'confirm-score',
        kind: 'action',
        title: 'Confirm final score entry',
        body: 'Tap the green checkmark to save. Both PINs must be correct for the result to record.',
        actionHint: 'Click the green checkmark to save',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          await fillMatchEntryPins(ctx, TUTORIAL_SCORE_PIN, TUTORIAL_SCORE_PIN);
          return { hotspot: await hotspotForMatchEntrySave(ctx) };
        },
      },
      {
        id: 'score-saved',
        kind: 'result',
        title: 'Score recorded',
        body: 'The grid shows the saved result. The next empty match is ready for the next pair.',
        resultNote: 'Match saved from Score kiosk with participant PINs.',
        capture: async (ctx) => {
          await enterTournamentScoreKiosk(ctx, TUTORIAL_EMAILS.organizer);
          const hasResult = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('td')].some((td) =>
              /\d+\s*-\s*\d+/.test(td.textContent || ''),
            ),
          );
          const needsEntry = await ctx.page.evaluate(
            () => !!document.querySelector('button[title="Enter score"]'),
          );
          if (needsEntry && !hasResult) {
            await openFirstEmptyScoreEntry(ctx);
            await fillMatchEntryScores(ctx, 3, 1);
            await fillMatchEntryPins(ctx, TUTORIAL_SCORE_PIN, TUTORIAL_SCORE_PIN);
            await saveMatchEntry(ctx);
          }
          await ctx.delay(500);
        },
      },
    ],
  },

  {
    slug: 'showcase-player-rating-history',
    role: 'player',
    showcase: true,
    hideNextShowcase: true,
    title: 'Player views match history',
    description:
      'Select a player, clear the pre-selected opponents, choose opponents with completed match history (first pick shown, then a note that more picks work the same), then open Match History. The walkthrough ends there — single-player rating charts are in View Stats.',
    relatedSlugs: ['showcase-player-view-stats', 'showcase-player-multi-stats'],
    steps: [
      {
        id: 'players-list',
        kind: 'context',
        title: 'Players list',
        body: `${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName} has matches and rating changes from the seeded completed Round Robin.`,
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName}`);
          await ctx.delay(400);
        },
      },
      {
        id: 'open-history-control',
        kind: 'action',
        title: 'Open history for the player',
        body: 'Tap the scroll icon on the player’s row. That starts history selection with the player chosen (and opponents pre-selected).',
        actionHint: 'Click the history icon on the player row',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(400);
          return {
            hotspot: await hotspotForPlayerHistoryButton(
              ctx,
              TUTORIAL_HISTORY_MEMBER.firstName,
              TUTORIAL_HISTORY_MEMBER.lastName,
            ),
          };
        },
      },
      {
        id: 'history-selection',
        kind: 'result',
        title: 'History selection',
        body: 'The toolbar shows the selected player and how many opponents are checked. Match history uses opponents; rating history needs none.',
        resultNote: 'History selection mode is active with the player selected.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await ctx.delay(300);
        },
      },
      {
        id: 'deselect-opponents',
        kind: 'action',
        title: 'Deselect All',
        body: 'Deselect All clears the pre-checked opponents so you can pick exactly who to compare against.',
        actionHint: 'Click Deselect All',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          return { hotspot: await ctx.hotspotForButton('Deselect All') };
        },
      },
      {
        id: 'cleared-opponents',
        kind: 'result',
        title: 'Opponents cleared',
        body: 'With 0 opponents selected, you can check the players who have match history with this member.',
        resultNote: 'Opponent count is 0.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await clearHistoryOpponents(ctx);
          await ctx.delay(250);
        },
      },
      {
        id: 'select-first-opponent',
        kind: 'action',
        title: 'Select an opponent with history',
        body: `Check ${TUTORIAL_HISTORY_OPPONENTS[0].firstName} ${TUTORIAL_HISTORY_OPPONENTS[0].lastName} — one opponent who has completed matches against ${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName}.`,
        actionHint: `Click the checkbox for ${TUTORIAL_HISTORY_OPPONENTS[0].firstName} ${TUTORIAL_HISTORY_OPPONENTS[0].lastName}`,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await clearHistoryOpponents(ctx);
          return {
            hotspot: await hotspotForPlayerStatsCheckbox(
              ctx,
              TUTORIAL_HISTORY_OPPONENTS[0].firstName,
              TUTORIAL_HISTORY_OPPONENTS[0].lastName,
            ),
          };
        },
      },
      {
        id: 'more-selections-same',
        kind: 'bridge',
        title: 'More selections work the same',
        body: 'You can check several more opponents the same way. The next screen skips those repeated clicks and shows the result after a few similar selections.',
        autoAdvanceMs: 3800,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await clearHistoryOpponents(ctx);
          await selectHistoryOpponents(ctx, [TUTORIAL_HISTORY_OPPONENTS[0]]);
          await ctx.delay(250);
        },
      },
      {
        id: 'three-players-ready',
        kind: 'result',
        title: 'Three players selected',
        body: `${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName} plus ${TUTORIAL_HISTORY_OPPONENTS.map((m) => `${m.firstName} ${m.lastName}`).join(' and ')} — View History will list every match played against those two opponents.`,
        resultNote: '2 opponents selected for match history (remaining picks applied behind the scenes).',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await clearHistoryOpponents(ctx);
          await selectHistoryOpponents(ctx, TUTORIAL_HISTORY_OPPONENTS);
          await ctx.delay(300);
        },
      },
      {
        id: 'view-history',
        kind: 'action',
        title: 'View History',
        body: 'Confirm to open Match History for the selected player against those opponents.',
        actionHint: 'Click View History',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startPlayerHistorySelection(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
          await clearHistoryOpponents(ctx);
          await selectHistoryOpponents(ctx, TUTORIAL_HISTORY_OPPONENTS);
          return { hotspot: await hotspotForViewHistory(ctx) };
        },
      },
      {
        id: 'match-history',
        kind: 'result',
        title: 'Match History',
        body: 'Match History lists all matches played against the selected opponents (scores, dates, and rating impact when available). This is the last step of the walkthrough.',
        resultNote: 'Match History page shows head-to-head results. Showcase ends here.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openPlayerMatchHistory(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
            TUTORIAL_HISTORY_OPPONENTS,
          );
        },
      },
    ],
  },

  {
    slug: 'showcase-player-view-stats',
    role: 'player',
    showcase: true,
    title: 'View Stats',
    description:
      'Open Player Statistics for a single roster member using the chart icon on their row — the same member used in the match history showcase.',
    relatedSlugs: ['showcase-player-rating-history', 'showcase-player-multi-stats'],
    steps: [
      {
        id: 'players-list',
        kind: 'context',
        title: 'Players list',
        body: `${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName} has rating history from the seeded completed Round Robin. Single-player stats open from the row chart icon.`,
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate((needle) => {
            const row = [...document.querySelectorAll('tr')].find((r) =>
              (r.textContent || '').includes(needle),
            );
            row?.scrollIntoView({ block: 'center' });
          }, `${TUTORIAL_HISTORY_MEMBER.firstName} ${TUTORIAL_HISTORY_MEMBER.lastName}`);
          await ctx.delay(400);
        },
      },
      {
        id: 'open-quick-stats',
        kind: 'action',
        title: 'Open stats for the player',
        body: 'Tap the chart icon on the player’s row to open Player Statistics for that member alone.',
        actionHint: 'Click the chart icon on the player row',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(400);
          return {
            hotspot: await hotspotForPlayerQuickStatsButton(
              ctx,
              TUTORIAL_HISTORY_MEMBER.firstName,
              TUTORIAL_HISTORY_MEMBER.lastName,
            ),
          };
        },
      },
      {
        id: 'player-statistics',
        kind: 'result',
        title: 'Player Statistics',
        body: 'Player Statistics shows rating history for the selected member. Toggle series above the chart if more than one player is loaded.',
        resultNote: 'Statistics page opened for one player via the row chart icon.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openPlayerSingleStatistics(
            ctx,
            TUTORIAL_HISTORY_MEMBER.firstName,
            TUTORIAL_HISTORY_MEMBER.lastName,
          );
        },
      },
    ],
  },

  {
    slug: 'showcase-player-multi-stats',
    role: 'player',
    showcase: true,
    title: 'Player compares statistics for several players',
    description:
      'Use Stats on the Players list to select multiple members (first pick shown, then a note that more picks work the same), then open Player Statistics to compare rating trends.',
    relatedSlugs: ['showcase-player-view-stats', 'showcase-player-rating-history'],
    steps: [
      {
        id: 'players-list',
        kind: 'context',
        title: 'Players list',
        body: 'Statistics for several players starts from the Players toolbar — not the single-player 📊 shortcut on a row.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'start-stats',
        kind: 'action',
        title: 'Start Stats selection',
        body: 'Tap Stats to enter multi-select mode. Checkboxes appear so you can pick any number of players.',
        actionHint: 'Click Stats',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await ctx.delay(400);
          return { hotspot: await hotspotForStatsToolbar(ctx) };
        },
      },
      {
        id: 'stats-mode',
        kind: 'result',
        title: 'Stats selection mode',
        body: 'The toolbar shows how many players are selected. View Statistics stays disabled until at least one is checked.',
        resultNote: 'Stats selection is active (View Statistics visible).',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startStatsSelection(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'select-first-player',
        kind: 'action',
        title: 'Select a player',
        body: `Check ${TUTORIAL_STATS_MEMBERS[0].firstName} ${TUTORIAL_STATS_MEMBERS[0].lastName} — a member who already has rating history from the completed Round Robin.`,
        actionHint: `Click the checkbox for ${TUTORIAL_STATS_MEMBERS[0].firstName} ${TUTORIAL_STATS_MEMBERS[0].lastName}`,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startStatsSelection(ctx);
          return {
            hotspot: await hotspotForPlayerStatsCheckbox(
              ctx,
              TUTORIAL_STATS_MEMBERS[0].firstName,
              TUTORIAL_STATS_MEMBERS[0].lastName,
            ),
          };
        },
      },
      {
        id: 'more-stats-selections-same',
        kind: 'bridge',
        title: 'More selections work the same',
        body: 'You can check several more players the same way. The next screen skips those repeated clicks and shows the result after a few similar selections.',
        autoAdvanceMs: 3800,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startStatsSelection(ctx);
          await togglePlayerForStats(
            ctx,
            TUTORIAL_STATS_MEMBERS[0].firstName,
            TUTORIAL_STATS_MEMBERS[0].lastName,
          );
          await ctx.delay(250);
        },
      },
      {
        id: 'players-selected',
        kind: 'result',
        title: 'Several players selected',
        body: 'With multiple members checked, View Statistics will load a combined rating chart for the group.',
        resultNote: `${TUTORIAL_STATS_MEMBERS.length} players selected for statistics (remaining picks applied behind the scenes).`,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startStatsSelection(ctx);
          for (const m of TUTORIAL_STATS_MEMBERS) {
            await togglePlayerForStats(ctx, m.firstName, m.lastName);
          }
          await ctx.delay(300);
        },
      },
      {
        id: 'view-statistics',
        kind: 'action',
        title: 'View Statistics',
        body: 'Open Player Statistics for the selected group.',
        actionHint: 'Click View Statistics',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await gotoPath(ctx, '/players');
          await startStatsSelection(ctx);
          for (const m of TUTORIAL_STATS_MEMBERS) {
            await togglePlayerForStats(ctx, m.firstName, m.lastName);
          }
          return { hotspot: await hotspotForViewStatistics(ctx) };
        },
      },
      {
        id: 'statistics-chart',
        kind: 'result',
        title: 'Multi-player statistics',
        body: 'Rating History for N players shows a shared chart. Toggle names above the chart to show or hide each series.',
        resultNote: 'Player Statistics page compares rating history for the selected group.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.player);
          await openMultiPlayerStatistics(ctx, TUTORIAL_STATS_MEMBERS);
        },
      },
    ],
  },

  {
    slug: 'showcase-organizer-create-rr',
    role: 'organizer',
    showcase: true,
    title: 'Organizer creates a Round Robin',
    description:
      'Create a Round Robin end-to-end: pick the format, select players one by one (with a note on repeating), finalize, and open the new tournament page.',
    relatedSlugs: ['showcase-organizer-create-multi-rr', 'showcase-admin-front-desk'],
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
        id: 'more-selections-same',
        kind: 'bridge',
        title: 'More selections work the same',
        body: 'You can check several more players the same way. The next screen skips those repeated clicks and shows the roster after a few similar selections.',
        autoAdvanceMs: 3800,
        capture: async (ctx) => {
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
    slug: 'showcase-organizer-create-multi-rr',
    role: 'organizer',
    showcase: true,
    title: 'Organizer creates a Multi Round Robin',
    description:
      'Create a Multi Round Robin: choose the format, select a full roster, set players per group, confirm rating-based groups, and open the new compound event.',
    relatedSlugs: ['showcase-organizer-create-rr', 'showcase-admin-front-desk'],
    steps: [
      {
        id: 'org-home',
        kind: 'context',
        title: 'Organizer on Players',
        body: 'Multi Round Robin needs a larger field than a single table. The tutorial roster is large enough to form multiple groups.',
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
        body: 'Open the type modal to pick Multi Round Robin instead of a single Round Robin.',
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
        body: 'Multi Round Robin sits alongside Round Robin, Playoff, Swiss, and Preliminary compounds.',
        resultNote: 'Wizard opened from + Tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
        },
      },
      {
        id: 'pick-multi-rr',
        kind: 'action',
        title: 'Choose Multi Round Robin',
        body: 'Select Multi Round Robin to split the field into several rating-based Round Robin groups under one parent event.',
        actionHint: 'Select Multi Round Robin',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'MULTI_ROUND_ROBINS');
          return { hotspot: await hotspotForTournamentType(ctx, 'MULTI_ROUND_ROBINS') };
        },
      },
      {
        id: 'multi-rr-selected',
        kind: 'result',
        title: 'Multi Round Robin selected',
        body: 'The format is highlighted. Optionally name the event, then continue to player selection.',
        resultNote: 'MULTI_ROUND_ROBINS radio is checked.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'MULTI_ROUND_ROBINS');
          await ctx.page.evaluate((name) => {
            const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
              const wrap = el.closest('div');
              return !!wrap && /tournament name/i.test(wrap.textContent || '');
            }) as HTMLInputElement | undefined;
            if (!labeled) return;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(labeled, name);
            labeled.dispatchEvent(new Event('input', { bubbles: true }));
            labeled.dispatchEvent(new Event('change', { bubbles: true }));
          }, SHOWCASE_MULTI_RR_NAME);
          await ctx.delay(300);
        },
      },
      {
        id: 'next-players',
        kind: 'action',
        title: 'Continue to players',
        body: 'Advance to the shared player picker. Multi Round Robin typically needs more players than a single table.',
        actionHint: 'Click Next',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'MULTI_ROUND_ROBINS');
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
        body: 'Select enough members for at least two groups (default rules require six or more).',
        resultNote: 'Wizard moved to the player selection step.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
        },
      },
      {
        id: 'select-roster',
        kind: 'action',
        title: 'Select the roster',
        body: 'For a full field, Select All is the fastest path. You can still check players one by one as in the Round Robin showcase.',
        actionHint: 'Click Select All',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          return { hotspot: await ctx.hotspotForButton('Select All') };
        },
      },
      {
        id: 'roster-selected',
        kind: 'result',
        title: 'Roster selected',
        body: 'With enough players selected, Continue opens Multi Round Robin group configuration.',
        resultNote: 'Selection count meets the Multi RR minimum.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          await ctx.clickButtonContaining('Select All');
          await ctx.delay(500);
        },
      },
      {
        id: 'continue-config',
        kind: 'action',
        title: 'Continue to group size',
        body: 'Leave player selection and configure how many players go in each Round Robin group.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          await selectTournamentPlayers(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'group-size',
        kind: 'result',
        title: 'Players per group',
        body: 'Set the target group size. The summary shows how many groups rating-based splitting will create.',
        resultNote: 'Multi Round Robin Configuration panel is open.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrGroupSize(ctx, SHOWCASE_MULTI_RR_PLAYERS);
        },
      },
      {
        id: 'continue-groups',
        kind: 'action',
        title: 'Build groups',
        body: 'Continue to preview the rating-based groups. Strongest players land in Group 1, then Group 2, and so on.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrGroupSize(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'confirm-groups',
        kind: 'result',
        title: 'Confirm groups',
        body: 'Review each group. Drag players between groups if you need to rearrange before creating.',
        resultNote: 'Confirm Groups step lists the proposed Round Robin tables.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroups(ctx, SHOWCASE_MULTI_RR_PLAYERS);
        },
      },
      {
        id: 'continue-final',
        kind: 'action',
        title: 'Continue to confirm',
        body: 'When the groupings look right, continue to the final create confirmation.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroups(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'final-confirm',
        kind: 'result',
        title: 'Confirm tournament',
        body: 'Review type, total players, and group count, then create the Multi Round Robin parent event.',
        resultNote: 'Final confirmation with Create Tournament is visible.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrFinalConfirm(ctx, SHOWCASE_MULTI_RR_PLAYERS);
        },
      },
      {
        id: 'create-tournament',
        kind: 'action',
        title: 'Create the tournament',
        body: 'Finalize creation. The app opens the new Multi Round Robin (parent) tournament page.',
        actionHint: 'Click Create Tournament',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrFinalConfirm(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Create Tournament') };
        },
      },
      {
        id: 'tournament-page',
        kind: 'result',
        title: 'Tournament page',
        body: 'You land on the compound event with child Round Robin groups ready for day-of tools and scoring.',
        resultNote: 'Create Tournament succeeded; detail page shows the Multi RR event.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrFinalConfirm(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          const created = await ctx.clickButtonContaining('Create Tournament');
          if (!created) throw new Error('Create Tournament button missing');
          await ctx.page.waitForFunction(
            () => /\/tournaments\/\d+/.test(window.location.pathname),
            { timeout: 30000 },
          );
          await ctx.delay(900);
        },
      },
    ],
  },

  {
    slug: 'showcase-organizer-correct-completed-score',
    role: 'organizer',
    showcase: true,
    title: 'Organizer corrects a completed tournament score',
    description:
      'Conditions: the event is Completed and not cancelled; you are signed in as an Organizer; the results matrix already has recorded scores; and no participant’s rating has changed after this tournament (a later completed event or a manual rating adjustment blocks correction). When those hold, turn on Correct scores, click a highlighted result, edit the sets, and save — ratings for this event are recalculated.',
    relatedSlugs: ['showcase-admin-enter-score', 'showcase-organizer-create-rr'],
    steps: [
      {
        id: 'completed-list',
        kind: 'context',
        title: 'Completed tournaments',
        body: 'Open the Completed stage to find finished events. Score correction is only offered here — not while the tournament is still Active.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Completed');
          await ctx.delay(600);
        },
      },
      {
        id: 'open-completed-event',
        kind: 'action',
        title: 'Open the completed event',
        body: `${TUTORIAL_COMPLETED_RR_NAME} is seeded with a full results matrix and standings.`,
        actionHint: `Open ${TUTORIAL_COMPLETED_RR_NAME}`,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Completed');
          await ctx.delay(500);
          const handle = await ctx.page.evaluateHandle((name) => {
            const el = [...document.querySelectorAll('a, button, tr, div')].find((n) => {
              const t = (n.textContent || '').trim();
              return t.includes(name) && t.length < 120;
            });
            return el || null;
          }, TUTORIAL_COMPLETED_RR_NAME);
          const el = handle.asElement();
          if (!el) {
            await handle.dispose();
            await openSeededCompletedRoundRobin(ctx);
            return {};
          }
          const box = await el.boundingBox();
          await handle.dispose();
          if (!box) {
            await openSeededCompletedRoundRobin(ctx);
            return {};
          }
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(box, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'results-matrix',
        kind: 'result',
        title: 'Final results',
        body: 'Standings and the Results Matrix show every recorded match. Correction stays locked until you enable Correct scores.',
        resultNote: 'Completed Round Robin results are visible.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
        },
      },
      {
        id: 'enable-correction',
        kind: 'action',
        title: 'Enable Correct scores',
        body: 'Tap the wrench (Correct scores). The banner appears and correctable cells get a highlight outline.',
        actionHint: 'Click Correct scores',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          return { hotspot: await hotspotForCorrectScoresToggle(ctx) };
        },
      },
      {
        id: 'correction-mode',
        kind: 'result',
        title: 'Correction mode on',
        body: 'Highlighted cells are safe to edit under the current eligibility rules. If a later rating event blocked correction, the banner explains why instead.',
        resultNote: 'Score correction banner is active with highlighted results.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await enableCompletedScoreCorrection(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'open-result-cell',
        kind: 'action',
        title: 'Open a recorded result',
        body: 'Click a highlighted score cell (pencil icon). The Match Entry dialog opens with the existing sets.',
        actionHint: 'Click a highlighted result cell',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await enableCompletedScoreCorrection(ctx);
          return { hotspot: await hotspotForFirstScoredResultCell(ctx) };
        },
      },
      {
        id: 'edit-dialog',
        kind: 'result',
        title: 'Edit the score',
        body: 'Change the set counts as needed. If the winner changes, you will confirm before ratings recalculate for this tournament.',
        resultNote: 'Match Entry is open on an existing completed result.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
        },
      },
      {
        id: 'save-correction',
        kind: 'action',
        title: 'Save the correction',
        body: 'Change the sets (here to 2–0, same winner — no extra confirm). Confirm with the green checkmark to recalculate ratings for this event.',
        actionHint: 'Click the green checkmark to save',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScores(ctx, 2, 0);
          return { hotspot: await hotspotForMatchEntrySave(ctx) };
        },
      },
      {
        id: 'score-corrected',
        kind: 'result',
        title: 'Score corrected',
        body: 'The matrix and standings refresh with the new sets. Correction remains available until a later rating event for any participant.',
        resultNote: 'Completed result updated; ratings recalculated for this tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          const hasCorrected = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('td')].some((td) =>
              /2\s*-\s*0/.test((td.textContent || '').replace(/✏️/g, '')),
            ),
          );
          if (!hasCorrected) {
            await openFirstCompletedScoreCorrection(ctx);
            await fillMatchEntryScores(ctx, 2, 0);
            await saveMatchEntry(ctx);
            await openSeededCompletedRoundRobin(ctx);
          }
          await enableCompletedScoreCorrection(ctx);
          await ctx.delay(400);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-create-junior-plan',
    role: 'admin',
    showcase: true,
    title: 'Admin creates a Junior plan price',
    description:
      'Add a Junior price to an existing club plan from Payment Plans. Note: the same plan can exist for different member categories (segments) — one family key (for example Monthly) holds Regular, Junior, and other segment prices side by side. Junior must already be enabled under Segments before you can select it.',
    relatedSlugs: ['showcase-admin-system-config', 'showcase-admin-front-desk'],
    steps: [
      {
        id: 'plans-home',
        kind: 'context',
        title: 'Payment Plans',
        body: 'Club plans are managed under Admin → Payment Plans. Seeded Monthly membership already has a Regular price.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
        },
      },
      {
        id: 'add-segment-action',
        kind: 'action',
        title: 'Add a segment price',
        body: `On ${TUTORIAL_MONTHLY_PLAN_NAME}, use + Segment to attach another category price to the same plan family — not a separate unrelated plan.`,
        actionHint: 'Click + Segment on Monthly membership',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          return {
            hotspot: await hotspotForPlanFamilySegmentAdd(ctx, TUTORIAL_MONTHLY_PLAN_NAME),
          };
        },
      },
      {
        id: 'junior-form',
        kind: 'result',
        title: 'Junior plan form',
        body: 'The New Plan form reuses the Monthly name and family key. Segment is Junior (same offer, different category price).',
        resultNote:
          'Same plan family for different categories — Regular and Junior share one Monthly offer with separate prices.',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          const alreadyJunior = await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            );
            return Boolean(card && /Junior/.test(card.textContent || ''));
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          if (alreadyJunior) {
            // Show the family card with Junior already present.
            await ctx.page.evaluate((name) => {
              const card = [...document.querySelectorAll('.card')].find((c) =>
                (c.textContent || '').includes(name),
              ) as HTMLElement | undefined;
              card?.scrollIntoView({ block: 'center' });
            }, TUTORIAL_MONTHLY_PLAN_NAME);
            await ctx.delay(300);
            return;
          }
          await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
          await selectPlanFormSegment(ctx, 'Junior');
          await ctx.delay(200);
        },
      },
      {
        id: 'set-price-create',
        kind: 'action',
        title: 'Set Junior price and create',
        body: 'Enter the Junior total price (here $50.00), then Create Plan. Members in the Junior segment see this amount for Monthly.',
        actionHint: 'Click Create Plan',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          const alreadyJunior = await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            );
            return Boolean(card && /\bJunior\b/.test(card.textContent || ''));
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          if (alreadyJunior) {
            await ctx.page.evaluate((name) => {
              const card = [...document.querySelectorAll('.card')].find((c) =>
                (c.textContent || '').includes(name),
              ) as HTMLElement | undefined;
              card?.scrollIntoView({ block: 'center' });
            }, TUTORIAL_MONTHLY_PLAN_NAME);
            await ctx.delay(300);
            return {};
          }
          await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
          await selectPlanFormSegment(ctx, 'Junior');
          await fillPlanFormTotalPrice(ctx, '50.00');
          return { hotspot: await hotspotForCreatePlan(ctx) };
        },
      },
      {
        id: 'junior-created',
        kind: 'result',
        title: 'Junior price on Monthly',
        body: 'Monthly membership now lists Regular and Junior. Players are charged the price for their member segment.',
        resultNote:
          'Junior plan created on the same Monthly family — one plan, multiple category prices.',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          const hasJunior = await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            );
            return Boolean(card && /\bJunior\b/.test(card.textContent || ''));
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          if (!hasJunior) {
            await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
            await selectPlanFormSegment(ctx, 'Junior');
            await fillPlanFormTotalPrice(ctx, '50.00');
            await submitCreatePlan(ctx);
          }
          await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            ) as HTMLElement | undefined;
            card?.scrollIntoView({ block: 'center' });
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          await ctx.delay(400);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-system-config',
    role: 'admin',
    showcase: true,
    title: 'Admin updates System Settings',
    description:
      'Update club branding and tournament defaults from System Settings: Club Name, Club Timezone, Round Robin and Multi Round Robin rules, and Public Achievements. Changes stay local until you Save.',
    relatedSlugs: ['showcase-admin-front-desk', 'showcase-admin-create-junior-plan'],
    steps: [
      {
        id: 'settings-home',
        kind: 'context',
        title: 'System Settings',
        body: 'Club Name and Timezone stay at the top. Tournament Rules and Public Achievements are expandable sections below.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
        },
      },
      {
        id: 'edit-club-name',
        kind: 'action',
        title: 'Edit Club Name',
        body: 'Club Name appears in the header and public surfaces. Type the new display name for the club.',
        actionHint: 'Focus the Club Name field',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          try {
            return { hotspot: await ctx.hotspotFor('[data-testid="system-settings-club-name"]') };
          } catch {
            return {};
          }
        },
      },
      {
        id: 'branding-updated',
        kind: 'result',
        title: 'Name and timezone',
        body: `Set Club Name to “${TUTORIAL_UPDATED_CLUB_NAME}” and Club Timezone to ${TUTORIAL_UPDATED_TIMEZONE}. Timezone drives club calendar days for check-in and midnight jobs.`,
        resultNote: 'Club Name and Timezone updated in the form (not saved yet).',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await setSystemClubName(ctx, TUTORIAL_UPDATED_CLUB_NAME);
          await setSystemClubTimezone(ctx, TUTORIAL_UPDATED_TIMEZONE);
          await ctx.delay(300);
        },
      },
      {
        id: 'open-tournament-rules',
        kind: 'action',
        title: 'Open Tournament Rules',
        body: 'Expand Tournament Rules to tune format minima used when organizers create events.',
        actionHint: 'Click Tournament Rules',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          return { hotspot: await hotspotForSystemSection(ctx, 'Tournament Rules') };
        },
      },
      {
        id: 'rr-settings',
        kind: 'result',
        title: 'Round Robin settings',
        body: 'Round Robin controls min/max players and Early Complete Min %. Here Early Complete is set to 80%.',
        resultNote: 'Round Robin subsection open with Early Complete Min % = 80.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureTournamentRuleOpen(ctx, 'Round Robin');
          await setSystemNumericByAriaLabel(ctx, 'Early Complete Min %', '80');
          await ctx.delay(300);
        },
      },
      {
        id: 'open-multi-rr',
        kind: 'action',
        title: 'Open Multi Round Robins',
        body: 'Multi Round Robins settings include minimum roster size and the default players-per-group size.',
        actionHint: 'Click Multi Round Robins',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Tournament Rules');
          return { hotspot: await hotspotForSystemSection(ctx, 'Multi Round Robins') };
        },
      },
      {
        id: 'multi-rr-settings',
        kind: 'result',
        title: 'Multi RR settings',
        body: 'Default Size is the suggested group size when creating a Multi Round Robin. Here it is set to 5.',
        resultNote: 'Multi Round Robins open with Default Size = 5.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureTournamentRuleOpen(ctx, 'Multi Round Robins');
          await setSystemNumericByAriaLabel(ctx, 'Default Size', '5');
          await ctx.delay(300);
        },
      },
      {
        id: 'open-achievements',
        kind: 'action',
        title: 'Open Public Achievements',
        body: 'Public Achievements controls how many results each board shows on the public achievements page (0 hides a board).',
        actionHint: 'Click Public Achievements',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          return { hotspot: await hotspotForSystemSection(ctx, 'Public Achievements') };
        },
      },
      {
        id: 'achievements-updated',
        kind: 'result',
        title: 'Achievements configured',
        body: 'Use Set all to and Apply to all to publish every board with the same list length — here 10 results each.',
        resultNote: 'Public Achievements set to 10 for all boards via Apply to all.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '10');
          await clickApplyAchievementsToAll(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'save-settings',
        kind: 'action',
        title: 'Save System Settings',
        body: 'Apply all of the branding, tournament-rule, and achievement edits, then Save. The floating bar shows Unsaved changes until you confirm.',
        actionHint: 'Click Save',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          const already = await ctx.page.evaluate((name) => {
            const input = document.querySelector(
              '[data-testid="system-settings-club-name"]',
            ) as HTMLInputElement | null;
            return input?.value === name;
          }, TUTORIAL_UPDATED_CLUB_NAME);
          if (!already) {
            await applyShowcaseSystemConfigEdits(ctx);
          } else {
            // Touch a field so Save is enabled if a prior step already persisted.
            await setSystemClubName(ctx, TUTORIAL_UPDATED_CLUB_NAME);
            await ensureSystemSectionOpen(ctx, 'Public Achievements');
          }
          return { hotspot: await hotspotForSystemSave(ctx) };
        },
      },
      {
        id: 'settings-saved',
        kind: 'result',
        title: 'Settings saved',
        body: 'The bar returns to All saved. Club Name, Timezone, RR / Multi RR defaults, and achievement boards are now live for the club.',
        resultNote: 'System Settings saved successfully.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          const already = await ctx.page.evaluate((name) => {
            const input = document.querySelector(
              '[data-testid="system-settings-club-name"]',
            ) as HTMLInputElement | null;
            return input?.value === name;
          }, TUTORIAL_UPDATED_CLUB_NAME);
          if (!already) {
            await applyShowcaseSystemConfigEdits(ctx);
            await saveSystemSettings(ctx);
          } else {
            // Ensure we show the saved branding even if achievements were saved earlier.
            await ctx.delay(300);
          }
          await ctx.page.evaluate(() => {
            window.scrollTo(0, 0);
          });
          await ctx.delay(400);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-front-desk',
    role: 'admin',
    showcase: true,
    title: 'Admin front desk (payments + attendance + kiosk)',
    description:
      'See the front-desk path: open Payment Log and Attendance Log with seeded rows, then enter check-in kiosk mode.',
    relatedSlugs: ['showcase-admin-system-config', 'showcase-admin-create-junior-plan'],
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

  {
    slug: 'showcase-admin-enter-score',
    role: 'admin',
    showcase: true,
    title: 'Admin enters a tournament score',
    description:
      'Open the seeded active Round Robin, click an empty match cell, enter the set scores, and save the result.',
    relatedSlugs: ['showcase-admin-front-desk', 'showcase-organizer-correct-completed-score'],
    steps: [
      {
        id: 'admin-home',
        kind: 'context',
        title: 'Admin on Players',
        body: 'Club admins who also organize can open active tournaments and enter match scores from the event page.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'open-tournaments',
        kind: 'action',
        title: 'Open Tournaments',
        body: 'Go to the tournaments list to find the active Round Robin seeded for tutorials.',
        actionHint: 'Click Tournaments',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          try {
            return { hotspot: await ctx.hotspotForButton('Tournaments') };
          } catch {
            const hs = await hotspotForHref(ctx.page, '/tournaments');
            if (!hs) throw new Error('Tournaments nav missing');
            return { hotspot: hs };
          }
        },
      },
      {
        id: 'tournaments-list',
        kind: 'result',
        title: 'Active tournaments',
        body: 'Tutorial Active Round Robin is already running with a full matrix of empty match cells.',
        resultNote: 'Tournaments list shows the Active stage.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/tournaments');
          await ctx.delay(700);
        },
      },
      {
        id: 'open-event',
        kind: 'action',
        title: 'Open the active event',
        body: 'Open Tutorial Active Round Robin to reach the scoring grid.',
        actionHint: 'Open Tutorial Active Round Robin',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/tournaments');
          await ctx.delay(500);
          const handle = await ctx.page.evaluateHandle(() => {
            const el = [...document.querySelectorAll('a, button, tr, div')].find((n) =>
              /Tutorial Active Round Robin/i.test(n.textContent || ''),
            );
            return el || null;
          });
          const el = handle.asElement();
          if (!el) {
            await handle.dispose();
            // Fall back: seeded event is id 1 after reset-seed.
            await openSeededActiveRoundRobin(ctx);
            return {};
          }
          const box = await el.boundingBox();
          await handle.dispose();
          if (!box) {
            await openSeededActiveRoundRobin(ctx);
            return {};
          }
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(box, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'rr-grid',
        kind: 'result',
        title: 'Round Robin score grid',
        body: 'Each empty cell is a match yet to be played. Click a cell to open the score entry dialog.',
        resultNote: 'Active Round Robin matrix is visible with Enter score controls.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openSeededActiveRoundRobin(ctx);
        },
      },
      {
        id: 'open-score-cell',
        kind: 'action',
        title: 'Open a match cell',
        body: 'Choose any empty match. The Match Entry dialog opens for the two participants.',
        actionHint: 'Click an empty score cell',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openSeededActiveRoundRobin(ctx);
          return { hotspot: await hotspotForFirstEmptyScoreCell(ctx) };
        },
      },
      {
        id: 'score-dialog',
        kind: 'result',
        title: 'Match Entry dialog',
        body: 'Enter each player’s sets won. Organizers can also mark a forfeit when needed.',
        resultNote: 'Match Entry popup is open with both score fields.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openSeededActiveRoundRobin(ctx);
          await openFirstEmptyScoreEntry(ctx);
        },
      },
      {
        id: 'enter-scores',
        kind: 'action',
        title: 'Enter the score',
        body: 'Type the set counts (here 3–1), then confirm with the green checkmark to record the match.',
        actionHint: 'Click the green checkmark to save',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openSeededActiveRoundRobin(ctx);
          await openFirstEmptyScoreEntry(ctx);
          await fillMatchEntryScores(ctx, 3, 1);
          return { hotspot: await hotspotForMatchEntrySave(ctx) };
        },
      },
      {
        id: 'score-saved',
        kind: 'result',
        title: 'Score recorded',
        body: 'The grid updates with the result (green for the row winner, red for the loser). Progress advances toward completing the Round Robin.',
        resultNote: 'Match saved; at least one cell now shows a recorded score.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await openSeededActiveRoundRobin(ctx);
          const needsEntry = await ctx.page.evaluate(
            () => !!document.querySelector('button[title="Enter score"]'),
          );
          // Prefer completing entry if the matrix is still empty; if a prior step already saved, show that state.
          const hasResult = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('td')].some((td) =>
              /\d+\s*-\s*\d+/.test(td.textContent || ''),
            ),
          );
          if (needsEntry && !hasResult) {
            await openFirstEmptyScoreEntry(ctx);
            await fillMatchEntryScores(ctx, 3, 1);
            await saveMatchEntry(ctx);
          }
          await ctx.delay(500);
        },
      },
    ],
  },
];
