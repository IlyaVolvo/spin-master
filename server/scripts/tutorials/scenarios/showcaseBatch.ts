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
} from '../lib/constants';
import {
  applyShowcaseSystemConfigEdits,
  clearFirstPendingCashPayment,
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
  hotspotForPlanFormSegment,
  hotspotForPlanFormTotalPrice,
  hotspotForFirstEmptyScoreCell,
  hotspotForFirstScoredResultCell,
  hotspotForHref,
  hotspotForAdminMenuItem,
  hotspotForApplyAchievementsToAll,
  hotspotForAttendanceDateFrom,
  hotspotForAttendanceStatusCheckbox,
  hotspotForAttendanceStatusFilters,
  hotspotForFirstPaymentClear,
  hotspotForPaymentLogPaidFilter,
  hotspotForSystemNumericByAriaLabel,
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
  openFirstCompletedScoreCorrection,
  startPlayerHistorySelection,
  openFirstEmptyScoreEntry,
  clickMatchEntrySave,
  confirmModifyMatchResult,
  hotspotForModifyMatchResult,
  openMemberAttendancePinModal,
  openMemberCheckinPinModal,
  openMultiRrConfirmGroups,
  openMultiRrConfirmGroupsRearranged,
  openMultiRrFinalConfirm,
  openMultiRrGroupSize,
  hotspotForMultiRrGroupPlayer,
  openOwnPlanScreen,
  openAttendanceLog,
  openPaymentLog,
  openPaymentPlans,
  openPlanFamilySegmentForm,
  openPlayoffBracketOrganize,
  openPlayoffFirstRoundConfirm,
  openPlayoffPlayerSelection,
  openRoundRobinConfirm,
  openRoundRobinPlayerSelection,
  openSeededActiveRoundRobin,
  openSeededCompletedRoundRobin,
  openSystemSettings,
  openTournamentPlayerSelection,
  openTournamentWizard,
  saveMatchEntry,
  saveSystemSettings,
  scrollPlanHeading,
  selectPlanFamilyKey,
  selectPlanFormSegment,
  selectTournamentPlayers,
  selectTournamentType,
  setAttendanceStatusOnly,
  setPaymentLogPendingOnly,
  setPlanPayMethod,
  setSystemNumericByAriaLabel,
  setPlayersNameFilter,
  submitAttendancePinModal,
  submitCheckinPinModal,
  submitCreatePlan,
  submitPlanPurchase,
} from '../lib/steps';
import { goToLoginForm } from '../lib/browser';

const SHOWCASE_RR_NAME = 'Tutorial Showcase Round Robin';
const SHOWCASE_PLAYOFF_NAME = 'Tutorial Showcase Playoff';
const SHOWCASE_MULTI_RR_NAME = 'Tutorial Showcase Multi RR';
const SHOWCASE_PLAN_FAMILY = 'visit-pack-5';
const SHOWCASE_MULTI_RR_PLAYERS = 8;
const SHOWCASE_PLAYOFF_PLAYERS = 8;

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
    relatedSlugs: ['showcase-player-checkin', 'showcase-player-checkout'],
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
    relatedSlugs: ['showcase-organizer-create-playoff', 'showcase-organizer-create-multi-rr'],
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
    slug: 'showcase-organizer-create-playoff',
    role: 'organizer',
    showcase: true,
    title: 'Organizer creates a Playoff',
    description:
      'Create a Playoff end-to-end: pick the format, select players one by one (with a note on repeating), review the rating-seeded bracket (and rearrange rules), confirm first-round matches, and open the new tournament page.',
    relatedSlugs: ['showcase-organizer-create-rr', 'showcase-organizer-create-multi-rr'],
    steps: [
      {
        id: 'org-home',
        kind: 'context',
        title: 'Organizer on Players',
        body: 'Organizers see + Tournament. Playoff builds a single-elimination bracket from the selected roster.',
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
        body: 'Open the type modal. You will choose Playoff before naming and selecting players.',
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
        body: 'Formats include Round Robin, Playoff, Multi RR, Preliminary compounds, and Swiss.',
        resultNote: 'Wizard opened from + Tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
        },
      },
      {
        id: 'pick-playoff',
        kind: 'action',
        title: 'Choose Playoff',
        body: 'Select Playoff / Bracket for a single-elimination event with automatic winner advancement.',
        actionHint: 'Select Playoff / Bracket',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'PLAYOFF');
          return { hotspot: await hotspotForTournamentType(ctx, 'PLAYOFF') };
        },
      },
      {
        id: 'playoff-selected',
        kind: 'result',
        title: 'Playoff selected',
        body: 'The selected format is highlighted. Optionally set a name, then continue to player selection.',
        resultNote: 'PLAYOFF radio is checked.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'PLAYOFF');
          await ctx.page.evaluate((name) => {
            const labeled = [...document.querySelectorAll('input[type="text"]')].find((el) => {
              const wrap = el.closest('div');
              return !!wrap && /tournament name/i.test(wrap.textContent || '');
            }) as HTMLInputElement | undefined;
            const input = document.querySelector(
              'input[placeholder*="name" i], input[aria-label*="name" i]',
            ) as HTMLInputElement | null;
            const target = labeled || input;
            if (!target) return;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(target, name);
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }, SHOWCASE_PLAYOFF_NAME);
          await ctx.delay(300);
        },
      },
      {
        id: 'next-players',
        kind: 'action',
        title: 'Continue to players',
        body: 'Advance to the shared player picker. Playoff needs at least four players (eight fills a clean power-of-two bracket).',
        actionHint: 'Click Next',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'PLAYOFF');
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
          await openPlayoffPlayerSelection(ctx);
        },
      },
      {
        id: 'pick-one-player',
        kind: 'action',
        title: 'Select a player',
        body: 'Check one member to add them to the Playoff field.',
        actionHint: 'Click a player checkbox',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffPlayerSelection(ctx);
          return { hotspot: await hotspotForTournamentPlayerCheckbox(ctx, 0) };
        },
      },
      {
        id: 'one-selected',
        kind: 'result',
        title: 'One player included',
        body: 'That member is now counted in the selection total. Playoff still needs more players before you can continue.',
        resultNote: 'First checkbox applied; selection count increased by one.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'more-selections-same',
        kind: 'bridge',
        title: 'More selections work the same',
        body: 'You can check several more players the same way. The next screen skips those repeated clicks and shows a full enough roster for the bracket.',
        autoAdvanceMs: 3800,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'roster-selected',
        kind: 'result',
        title: 'Roster filled in',
        body: 'After repeating the selection, enough members are checked. Continue opens the seeded bracket preview.',
        resultNote: 'Multiple players selected behind the scenes for the Playoff field.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffPlayerSelection(ctx);
          const n = await selectTournamentPlayers(ctx, SHOWCASE_PLAYOFF_PLAYERS);
          if (n < 4) throw new Error('Could not select enough players for Playoff');
        },
      },
      {
        id: 'continue-bracket',
        kind: 'action',
        title: 'Continue to bracket',
        body: 'Leave player selection and open the bracket organizer. Seeds are placed automatically; you can drag to rearrange.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffPlayerSelection(ctx);
          await selectTournamentPlayers(ctx, SHOWCASE_PLAYOFF_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'bracket-preview',
        kind: 'result',
        title: 'Bracket preview',
        body: 'The bracket shows first-round slots (and BYEs when the field is not a power of two). Initial pairing comes from ratings; you can rearrange before continuing.',
        resultNote: 'Playoff bracket organize step is open with a seeded preview.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffBracketOrganize(ctx, SHOWCASE_PLAYOFF_PLAYERS);
        },
      },
      {
        id: 'attention-rearrange',
        kind: 'attention',
        title: 'Rearranging the bracket',
        body: 'Initial pairing is based on ratings. You can rearrange by dragging players from one spot to another. Rules: (1) No pair can be left without players — a match cannot end up empty. (2) To replace a player, move them to the temporary drop zone first, introduce the new opponent into the freed slot, then move the held player against their intended opponent.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffBracketOrganize(ctx, SHOWCASE_PLAYOFF_PLAYERS);
        },
      },
      {
        id: 'continue-first-round',
        kind: 'action',
        title: 'Continue to first round',
        body: 'When the bracket looks right, continue to review the first-round matchups.',
        actionHint: 'Click Continue',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffBracketOrganize(ctx, SHOWCASE_PLAYOFF_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Continue') };
        },
      },
      {
        id: 'first-round-confirm',
        kind: 'result',
        title: 'First round matches',
        body: 'Review who plays whom in round one, then create the Playoff.',
        resultNote: 'First Round Matches list and Create Tournament are visible.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffFirstRoundConfirm(ctx, SHOWCASE_PLAYOFF_PLAYERS);
        },
      },
      {
        id: 'create-tournament',
        kind: 'action',
        title: 'Create the tournament',
        body: 'Finalize creation. The app opens the new Playoff page with the live bracket.',
        actionHint: 'Click Create Tournament',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffFirstRoundConfirm(ctx, SHOWCASE_PLAYOFF_PLAYERS);
          return { hotspot: await ctx.hotspotForButton('Create Tournament') };
        },
      },
      {
        id: 'tournament-page',
        kind: 'result',
        title: 'Tournament page',
        body: 'You land on the Playoff detail view with the bracket ready for day-of scoring.',
        resultNote: 'Create Tournament succeeded; detail page shows the Playoff event.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openPlayoffFirstRoundConfirm(ctx, SHOWCASE_PLAYOFF_PLAYERS);
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
    slug: 'showcase-organizer-create-multi-rr',
    role: 'organizer',
    showcase: true,
    title: 'Organizer creates a Multi Round Robin',
    description:
      'Create a Multi Round Robin: choose the format, select players one by one (with a note on repeating), set players per group, review rating-based groups, drag a player between groups when needed, and open the new compound event.',
    relatedSlugs: ['showcase-organizer-create-playoff', 'showcase-organizer-create-rr'],
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
        body: 'Each row has a checkbox. Multi Round Robin needs enough members for at least two groups (six or more under default rules).',
        resultNote: 'Wizard moved to the player selection step.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
        },
      },
      {
        id: 'pick-one-player',
        kind: 'action',
        title: 'Select a player',
        body: 'Check one member to add them to the Multi Round Robin field. You will repeat this for everyone who should play.',
        actionHint: 'Click a player checkbox',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          return { hotspot: await hotspotForTournamentPlayerCheckbox(ctx, 0) };
        },
      },
      {
        id: 'one-selected',
        kind: 'result',
        title: 'One player included',
        body: 'That member is now counted in the selection total. Multi Round Robin still needs several more players before you can continue.',
        resultNote: 'First checkbox applied; selection count increased by one.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'more-selections-same',
        kind: 'bridge',
        title: 'More selections work the same',
        body: 'You can check several more players the same way. The next screen skips those repeated clicks and shows a full enough roster for multiple groups.',
        autoAdvanceMs: 3800,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          await selectTournamentPlayers(ctx, 1);
        },
      },
      {
        id: 'roster-selected',
        kind: 'result',
        title: 'Roster filled in',
        body: 'After repeating the selection, enough members are checked for at least two Round Robin groups. Continue opens group configuration.',
        resultNote: 'Multiple players selected behind the scenes (Select All is not required).',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openTournamentPlayerSelection(ctx, 'MULTI_ROUND_ROBINS');
          const n = await selectTournamentPlayers(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          if (n < 6) throw new Error('Could not select enough players for Multi RR');
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
        body: 'Rating-based split is a starting point. Review each group before creating the event.',
        resultNote: 'Confirm Groups step lists the proposed Round Robin tables.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroups(ctx, SHOWCASE_MULTI_RR_PLAYERS);
        },
      },
      {
        id: 'attention-drag',
        kind: 'attention',
        title: 'You can rearrange groups',
        body: 'Drag a player from one group onto another when the automatic split is not what you want — for example to separate clubmates, balance tables, or move a junior. Each group must keep at least two players.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroups(ctx, SHOWCASE_MULTI_RR_PLAYERS);
        },
      },
      {
        id: 'drag-player',
        kind: 'action',
        title: 'Move a player between groups',
        body: 'Drag this player onto Group 2 to apply that kind of adjustment.',
        actionHint: 'Drag this player onto Group 2',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroups(ctx, SHOWCASE_MULTI_RR_PLAYERS);
          return { hotspot: await hotspotForMultiRrGroupPlayer(ctx, 0, 0) };
        },
      },
      {
        id: 'groups-rearranged',
        kind: 'result',
        title: 'Groups updated',
        body: 'That player now sits in Group 2. Each group must keep at least two players. Adjust further the same way until the field looks right.',
        resultNote: 'One player moved from Group 1 to Group 2 via drag-and-drop.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openMultiRrConfirmGroupsRearranged(ctx, SHOWCASE_MULTI_RR_PLAYERS);
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
          await openMultiRrConfirmGroupsRearranged(ctx, SHOWCASE_MULTI_RR_PLAYERS);
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
      'On a Completed event, enable Correct scores only when none of the players have later matches that changed their ratings. Open a result, change each set count so the other player wins 3 games, confirm the winner change, and save — rankings for this tournament are recalculated.',
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
        id: 'attention-eligibility',
        kind: 'attention',
        title: 'When correction is allowed',
        body: 'Correct scores is available only if none of these players have played any later matches that changed their ratings. A later completed event or a manual rating change blocks correction.',
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
        body: 'Click a highlighted score cell (pencil icon). The Match Entry dialog opens with the existing sets (seeded here as 3–1).',
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
        title: 'Existing score',
        body: 'Match Entry shows the recorded sets. Change each player’s set count to correct the result.',
        resultNote: 'Match Entry is open on an existing completed result.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
        },
      },
      {
        id: 'change-first-score',
        kind: 'action',
        title: 'Change the first player’s sets',
        body: 'Edit the first player’s set count (here from 3 down to 1 — they will no longer be the winner).',
        actionHint: 'Enter the first score',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          return { hotspot: await hotspotForMatchEntryScoreField(ctx, 1) };
        },
      },
      {
        id: 'first-score-changed',
        kind: 'result',
        title: 'First score updated',
        body: 'The first player’s sets now show 1.',
        resultNote: 'Player 1 score field shows 1.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScoreField(ctx, 1, 1);
        },
      },
      {
        id: 'change-second-score',
        kind: 'action',
        title: 'Change the second player’s sets',
        body: 'Edit the second player’s set count so they win with 3 games (here 1–3).',
        actionHint: 'Enter the second score',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScoreField(ctx, 1, 1);
          return { hotspot: await hotspotForMatchEntryScoreField(ctx, 2) };
        },
      },
      {
        id: 'second-score-changed',
        kind: 'result',
        title: 'Winner flipped',
        body: 'Sets are now 1–3 — the other player wins with 3 games. Saving will ask you to confirm because the winner changed.',
        resultNote: 'Score fields show 1 and 3.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScores(ctx, 1, 3);
        },
      },
      {
        id: 'save-correction',
        kind: 'action',
        title: 'Save the correction',
        body: 'Confirm with the green checkmark. Because the winner changed, a confirmation dialog appears next.',
        actionHint: 'Click the green checkmark to save',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScores(ctx, 1, 3);
          return { hotspot: await hotspotForMatchEntrySave(ctx) };
        },
      },
      {
        id: 'confirm-winner-change',
        kind: 'action',
        title: 'Confirm winner change',
        body: 'Modify Result accepts the new winner. Rankings for this tournament will be recalculated.',
        actionHint: 'Click Modify Result',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          await openFirstCompletedScoreCorrection(ctx);
          await fillMatchEntryScores(ctx, 1, 3);
          await clickMatchEntrySave(ctx);
          return { hotspot: await hotspotForModifyMatchResult(ctx) };
        },
      },
      {
        id: 'score-corrected',
        kind: 'result',
        title: 'Score corrected',
        body: 'The matrix and standings refresh with 1–3. Rankings (and ratings) for this tournament are recalculated from the corrected result.',
        resultNote: 'Completed result updated; rankings recalculated for this tournament.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.organizer);
          await openSeededCompletedRoundRobin(ctx);
          const hasCorrected = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('td')].some((td) =>
              /1\s*-\s*3/.test((td.textContent || '').replace(/✏️/g, '')),
            ),
          );
          if (!hasCorrected) {
            await openFirstCompletedScoreCorrection(ctx);
            await fillMatchEntryScores(ctx, 1, 3);
            await clickMatchEntrySave(ctx);
            await confirmModifyMatchResult(ctx);
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
      'Add a Junior category price to an existing club plan from Payment Plans. + Segment reuses the plan name (locked); you choose the Junior segment and set only the price. Junior must already be enabled under Segments.',
    relatedSlugs: ['showcase-admin-payment-log', 'showcase-admin-enter-score'],
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
        title: 'Add a category price',
        body: `On ${TUTORIAL_MONTHLY_PLAN_NAME}, use + Segment to add another category price to the same plan — not a separate unrelated plan.`,
        actionHint: 'Click + Segment on Monthly membership',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          return {
            hotspot: await hotspotForPlanFamilySegmentAdd(ctx, TUTORIAL_MONTHLY_PLAN_NAME),
          };
        },
      },
      {
        id: 'form-locked-name',
        kind: 'result',
        title: 'Name stays the same',
        body: `The form shows ${TUTORIAL_MONTHLY_PLAN_NAME}. Name, kind, and duration are locked — you are adding a category to this plan, not renaming it.`,
        resultNote: 'Only Segment and Total price are editable.',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          const alreadyJunior = await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            );
            return Boolean(card && /\bJunior\b/.test(card.textContent || ''));
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          if (alreadyJunior) {
            await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
            await ctx.delay(200);
            return;
          }
          await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
          await ctx.delay(200);
        },
      },
      {
        id: 'select-junior',
        kind: 'action',
        title: 'Select Junior category',
        body: 'Choose Junior in the Segment dropdown. That is the member category this price applies to.',
        actionHint: 'Select Junior in Segment',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
          return { hotspot: await hotspotForPlanFormSegment(ctx) };
        },
      },
      {
        id: 'set-price',
        kind: 'action',
        title: 'Set Junior price',
        body: 'Only the Total price is yours to change here. Enter the Junior amount (example $50.00).',
        actionHint: 'Enter the Junior total price',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
          await selectPlanFormSegment(ctx, 'Junior');
          return { hotspot: await hotspotForPlanFormTotalPrice(ctx) };
        },
      },
      {
        id: 'add-price',
        kind: 'action',
        title: 'Save the Junior price',
        body: 'Click Add price. Members in the Junior segment see this amount for Monthly.',
        actionHint: 'Click Add price',
        capture: async (ctx) => {
          await openPaymentPlans(ctx, TUTORIAL_EMAILS.admin);
          const alreadyJunior = await ctx.page.evaluate((name) => {
            const card = [...document.querySelectorAll('.card')].find((c) =>
              (c.textContent || '').includes(name),
            );
            return Boolean(card && /\bJunior\b/.test(card.textContent || ''));
          }, TUTORIAL_MONTHLY_PLAN_NAME);
          if (alreadyJunior) {
            await openPlanFamilySegmentForm(ctx, TUTORIAL_MONTHLY_PLAN_NAME);
            await selectPlanFormSegment(ctx, 'Junior');
            await fillPlanFormTotalPrice(ctx, '50.00');
            return { hotspot: await hotspotForCreatePlan(ctx) };
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
          'Junior category price on the same Monthly plan — one plan name, multiple category prices.',
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
      'Update Public Achievements from System Settings: Apply Set all to 3, change Biggest upset to 1, then Save — the values stay after save.',
    relatedSlugs: ['showcase-admin-create-junior-plan', 'showcase-admin-payment-log'],
    steps: [
      {
        id: 'settings-home',
        kind: 'context',
        title: 'System Settings',
        body: 'Club Name and Timezone stay at the top. Expandable sections below include Tournament Rules and Public Achievements.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
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
        id: 'set-all-to-3',
        kind: 'action',
        title: 'Set all boards to 3',
        body: 'Enter 3 in Set all to, then Apply to all so every achievement board uses the same list length.',
        actionHint: 'Click Apply to all',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '3');
          return { hotspot: await hotspotForApplyAchievementsToAll(ctx) };
        },
      },
      {
        id: 'all-set-to-3',
        kind: 'result',
        title: 'All boards at 3',
        body: 'Every achievement board now shows 3. Next, override one board individually.',
        resultNote: 'Apply to all filled each board with 3.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '3');
          await clickApplyAchievementsToAll(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'click-biggest-upset',
        kind: 'action',
        title: 'Select Biggest upset',
        body: 'Click the Biggest upset value to edit that board only. It still shows 3 from Apply to all.',
        actionHint: 'Click Biggest upset',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          await setSystemNumericByAriaLabel(ctx, 'Set all achievement counts', '3');
          await clickApplyAchievementsToAll(ctx);
          return { hotspot: await hotspotForSystemNumericByAriaLabel(ctx, 'Biggest upset') };
        },
      },
      {
        id: 'biggest-upset-to-1',
        kind: 'result',
        title: 'Biggest upset set to 1',
        body: 'Change Biggest upset to 1. Other boards remain at 3.',
        resultNote: 'Biggest upset → 1; other boards still 3 (unsaved).',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await applyShowcaseSystemConfigEdits(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'save-settings',
        kind: 'action',
        title: 'Save System Settings',
        body: 'The floating bar shows Unsaved changes. Click Save to persist Biggest upset = 1 and the other boards at 3.',
        actionHint: 'Click Save',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await applyShowcaseSystemConfigEdits(ctx);
          return { hotspot: await hotspotForSystemSave(ctx) };
        },
      },
      {
        id: 'settings-saved',
        kind: 'result',
        title: 'Settings saved',
        body: 'After Save, the values stay the same: Biggest upset is still 1 and the other boards are still 3. The bar shows All saved.',
        resultNote: 'Saved values unchanged — Biggest upset 1, others 3.',
        capture: async (ctx) => {
          await openSystemSettings(ctx, TUTORIAL_EMAILS.admin);
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          const valuesOk = await ctx.page.evaluate(() => {
            const upset = document.querySelector(
              'input[aria-label="Biggest upset"]',
            ) as HTMLInputElement | null;
            const mostWins = document.querySelector(
              'input[aria-label="Most wins"]',
            ) as HTMLInputElement | null;
            return upset?.value === '1' && mostWins?.value === '3';
          });
          const saved = await ctx.page.evaluate(() =>
            /All saved/i.test(document.body.innerText || ''),
          );
          if (!valuesOk || !saved) {
            await applyShowcaseSystemConfigEdits(ctx);
            await saveSystemSettings(ctx);
          }
          await ensureSystemSectionOpen(ctx, 'Public Achievements');
          await ctx.page.evaluate(() => {
            document
              .querySelector('input[aria-label="Biggest upset"]')
              ?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(400);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-payment-log',
    role: 'admin',
    showcase: true,
    title: 'Admin clears a cash payment',
    description:
      'Open Payment Log, filter to Pending cash rows, Clear one payment, and confirm it becomes Paid so the member can check in.',
    relatedSlugs: ['showcase-admin-attendance-log', 'showcase-player-plan'],
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
        id: 'open-payment-log',
        kind: 'action',
        title: 'Open Payment Log',
        body: 'Payment Log lists every club payment — pending cash waiting at the desk, plus paid cash and online rows.',
        actionHint: 'Click Payment Log',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          return { hotspot: await hotspotForAdminMenuItem(ctx, 'Payment Log') };
        },
      },
      {
        id: 'payment-log-mixed',
        kind: 'result',
        title: 'Mixed Paid and Pending',
        body: 'The seeded log shows several Paid rows (online test and cash) and a couple of unconfirmed cash payments with Clear / Reject.',
        resultNote: 'Pending cash stays unpaid until an admin Clears it.',
        capture: async (ctx) => {
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await ctx.delay(400);
        },
      },
      {
        id: 'filter-pending',
        kind: 'action',
        title: 'Show Pending only',
        body: 'Turn off Paid under Status so only unconfirmed cash payments remain. Leave Pending checked.',
        actionHint: 'Uncheck Paid',
        capture: async (ctx) => {
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          return { hotspot: await hotspotForPaymentLogPaidFilter(ctx) };
        },
      },
      {
        id: 'pending-only',
        kind: 'result',
        title: 'Pending cash queue',
        body: 'Only Pending cash rows remain — each has Clear and Reject. These members paid at the desk but the plan is not active yet.',
        resultNote: 'Paid filter off; Pending filter on.',
        capture: async (ctx) => {
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
          await ctx.delay(300);
        },
      },
      {
        id: 'clear-payment',
        kind: 'action',
        title: 'Clear a cash payment',
        body: 'Clear confirms the cash was received, marks the row Paid, and grants the plan on the payment.',
        actionHint: 'Click Clear',
        capture: async (ctx) => {
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
          return { hotspot: await hotspotForFirstPaymentClear(ctx) };
        },
      },
      {
        id: 'cleared-result',
        kind: 'result',
        title: 'Payment cleared — member can check in',
        body: 'That row is now Paid and the plan is active. The member should be able to check in (for example in check-in kiosk) with their new entitlement.',
        resultNote: 'Clear grants the plan immediately; remaining Pending cash still waits for Clear or Reject.',
        capture: async (ctx) => {
          await openPaymentLog(ctx, TUTORIAL_EMAILS.admin);
          await setPaymentLogPendingOnly(ctx);
          const clearCount = await ctx.page.evaluate(
            () =>
              [...document.querySelectorAll('button')].filter(
                (b) => (b.textContent || '').trim() === 'Clear',
              ).length,
          );
          if (clearCount >= 2) {
            await clearFirstPendingCashPayment(ctx);
          }
          // Show mixed list again so Paid result is visible.
          await ctx.page.evaluate(() => {
            const paid = document.querySelector(
              'input[aria-label="Show paid payments"]',
            ) as HTMLInputElement | null;
            if (paid && !paid.checked) paid.click();
          });
          await ctx.delay(500);
        },
      },
    ],
  },

  {
    slug: 'showcase-admin-attendance-log',
    role: 'admin',
    showcase: true,
    title: 'Admin reviews Attendance Log',
    description:
      'Open Attendance Log, filter to Present (who is in the club now), then note the date filters for reviewing what happened in the past.',
    relatedSlugs: ['showcase-admin-payment-log', 'showcase-player-checkin'],
    steps: [
      {
        id: 'admin-home',
        kind: 'context',
        title: 'Admin home',
        body: 'Attendance Log is under the Admin menu alongside Payment Log and Plans.',
        capture: async (ctx) => {
          await ctx.loginAs(TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          await ctx.delay(500);
        },
      },
      {
        id: 'open-attendance-log',
        kind: 'action',
        title: 'Open Attendance Log',
        body: 'Attendance Log lists check-ins for the club — who is Present, who is Out, and rejected attempts.',
        actionHint: 'Click Attendance Log',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, TUTORIAL_EMAILS.admin);
          await gotoPath(ctx, '/players');
          return { hotspot: await hotspotForAdminMenuItem(ctx, 'Attendance Log') };
        },
      },
      {
        id: 'attendance-mixed',
        kind: 'result',
        title: 'Today’s visits',
        body: 'The seeded log mixes Present members, people who already checked Out, and a Rejected attempt. Status filters narrow that list.',
        resultNote: 'Title Present count reflects who is still in the club right now.',
        capture: async (ctx) => {
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await ctx.delay(400);
        },
      },
      {
        id: 'filter-present',
        kind: 'action',
        title: 'Show Present only',
        body: 'Turn off Out and Rejected so only Present remains — the most useful day-of view of who is in the club now.',
        actionHint: 'Leave only Present checked',
        capture: async (ctx) => {
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          return { hotspot: await hotspotForAttendanceStatusCheckbox(ctx, 'Present') };
        },
      },
      {
        id: 'present-only',
        kind: 'result',
        title: 'Who is Present',
        body: 'Only Present rows remain. This is the practical front-desk view while the club is open.',
        resultNote: 'Present filter on; Out and Rejected off.',
        capture: async (ctx) => {
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await setAttendanceStatusOnly(ctx, 'Present');
          await ctx.delay(400);
        },
      },
      {
        id: 'date-filters',
        kind: 'action',
        title: 'Date filters',
        body: 'From and To sit next to Status. Use them when you need a specific club day instead of the default recent window.',
        actionHint: 'Look at From and To',
        capture: async (ctx) => {
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await setAttendanceStatusOnly(ctx, 'Present');
          return { hotspot: await hotspotForAttendanceDateFrom(ctx) };
        },
      },
      {
        id: 'attention-past',
        kind: 'attention',
        title: 'Look back in time',
        body: 'You could also check what happened in the past. Set From and To to an earlier club date to review who was Present, Out, or Rejected that day.',
        capture: async (ctx) => {
          await openAttendanceLog(ctx, TUTORIAL_EMAILS.admin);
          await setAttendanceStatusOnly(ctx, 'Present');
          return { hotspot: await hotspotForAttendanceDateFrom(ctx) };
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
    relatedSlugs: ['showcase-organizer-correct-completed-score', 'showcase-organizer-create-rr'],
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
