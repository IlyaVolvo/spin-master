import type { ScenarioDef } from '../lib/types';
import { TUTORIAL_EMAILS } from '../lib/constants';
import {
  ensureLoggedIn,
  gotoPath,
  hotspotForHref,
  hotspotForTitle,
  loginFormStep,
} from '../lib/steps';

const E = TUTORIAL_EMAILS.player;

export const playerScenarios: ScenarioDef[] = [
  {
    slug: 'player-sign-in',
    role: 'player',
    title: 'Sign in as a player',
    description: 'Open the login screen, sign in with a player account, and land on the Players list.',
    relatedSlugs: ['player-open-own-plan', 'player-payments-nav'],
    steps: [
      loginFormStep(E),
      {
        id: 'players-home',
        title: 'Players home',
        body: 'After sign-in you see the club roster. Player accounts do not get admin or organizer create buttons.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'player-open-own-plan',
    role: 'player',
    title: 'Open your club plan',
    description: 'Use the $ control in the header to review your membership plan and purchase options.',
    relatedSlugs: ['player-sign-in', 'player-plan-purchase-options'],
    steps: [
      {
        id: 'header-plan',
        title: 'Plan shortcut',
        body: 'The $ control opens your personal plan screen from anywhere in the app.',
        actionHint: 'Click the $ plan control',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'View and manage your club plan');
          return hs ? { hotspot: hs } : {};
        },
      },
      {
        id: 'plan-screen',
        title: 'Your plan',
        body: 'Review current entitlement, purchase a plan, choose cash or online payment, and see payment history.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          const clicked = await ctx.page.evaluate(() => {
            const el = document.querySelector(
              '[title="View and manage your club plan"]',
            ) as HTMLElement | null;
            if (!el) return false;
            el.click();
            return true;
          });
          if (!clicked) throw new Error('Plan control not found');
          await ctx.delay(900);
        },
      },
    ],
  },
  {
    slug: 'player-plan-purchase-options',
    role: 'player',
    title: 'Plan purchase options',
    description: 'On the plan screen, see available plans and cash vs online payment methods.',
    relatedSlugs: ['player-open-own-plan', 'admin-payment-plans'],
    steps: [
      {
        id: 'plan-purchase',
        title: 'Purchase section',
        body: 'Pick a plan, consent to online pay if needed, choose Cash or Pay online, then purchase.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          await ctx.page.evaluate(() => {
            const el = document.querySelector(
              '[title="View and manage your club plan"]',
            ) as HTMLElement | null;
            el?.click();
          });
          await ctx.delay(1000);
        },
      },
    ],
  },
  {
    slug: 'player-payments-nav',
    role: 'player',
    title: 'Players cannot open Payment Log',
    description:
      'Players manage their own plan via $; the Admin Payment Log is not in the player header.',
    relatedSlugs: ['player-open-own-plan', 'admin-payment-log'],
    steps: [
      {
        id: 'player-chrome',
        title: 'Player header',
        body: 'Confirm there is no Admin menu. Use $ for your plan instead of the admin Payment Log.',
        actionHint: 'Click the $ plan control',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'View and manage your club plan');
          return hs ? { hotspot: hs } : {};
        },
      },
    ],
  },
  {
    slug: 'player-record-match',
    role: 'player',
    title: 'Record a casual match',
    description: 'Start + Match, select an opponent on the Players table, then continue the score flow.',
    relatedSlugs: ['player-sign-in', 'organizer-record-match'],
    steps: [
      {
        id: 'toolbar-match',
        title: 'Match toolbar',
        body: 'Players can record casual matches with + Match.',
        actionHint: 'Click + Match',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Match') };
        },
      },
      {
        id: 'selection-mode',
        title: 'Select opponent',
        body: 'Selection mode highlights the table. Choose an active opponent (you stay on one side of the pairing).',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          const ok = await ctx.clickButtonContaining('+ Match');
          if (!ok) throw new Error('+ Match not found');
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'player-tournaments-list',
    role: 'player',
    title: 'Browse tournaments',
    description: 'Open the Tournaments tab to follow club events.',
    relatedSlugs: ['player-sign-in', 'organizer-tournaments-active'],
    steps: [
      {
        id: 'nav-tournaments',
        title: 'Tournaments tab',
        body: 'Header Tournaments opens the event list for your club.',
        actionHint: 'Open Tournaments',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForHref(ctx.page, '/tournaments');
          if (hs) return { hotspot: hs };
          return { hotspot: await ctx.hotspotForButton('Tournaments') };
        },
      },
      {
        id: 'list',
        title: 'Tournament list',
        body: 'Browse pre-registration, active, and completed events. Players typically cannot create tournaments.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await gotoPath(ctx, '/tournaments');
        },
      },
    ],
  },
  {
    slug: 'player-statistics',
    role: 'player',
    title: 'Statistics',
    description: 'Open Statistics for personal and club performance views.',
    relatedSlugs: ['player-history'],
    steps: [
      {
        id: 'stats',
        title: 'Statistics page',
        body: 'Use Stats from the Players toolbar or navigate to Statistics to explore results.',
        actionHint: 'Click Stats',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          try {
            return { hotspot: await ctx.hotspotForButton('Stats') };
          } catch {
            return {};
          }
        },
      },
      {
        id: 'stats-page',
        title: 'Statistics content',
        body: 'Review ratings, results, and related analytics available to members.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          const clicked = await ctx.clickButtonContaining('Stats');
          if (!clicked) await gotoPath(ctx, '/statistics');
          else await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'player-history',
    role: 'player',
    title: 'Match history',
    description: 'Open History to review past matches.',
    relatedSlugs: ['player-statistics', 'player-record-match'],
    steps: [
      {
        id: 'history',
        title: 'History',
        body: 'History shows prior match activity for the club and your account.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/history');
        },
      },
    ],
  },
  {
    slug: 'player-edit-profile',
    role: 'player',
    title: 'Edit your profile',
    description: 'Open the profile gear to update your member details.',
    relatedSlugs: ['player-sign-in'],
    steps: [
      {
        id: 'profile-gear',
        title: 'Profile control',
        body: 'The gear next to your name opens your own profile editor.',
        actionHint: 'Click Edit your profile',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'Edit your profile');
          return hs ? { hotspot: hs } : {};
        },
      },
      {
        id: 'profile-editor',
        title: 'Profile editor',
        body: 'Update allowed fields for your account, then save.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.page.evaluate(() => {
            const el = document.querySelector('[title="Edit your profile"]') as HTMLElement | null;
            el?.click();
          });
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'player-public-achievements',
    role: 'player',
    title: 'Public achievements',
    description: 'Open the public achievements page from the app when the Public link is available.',
    relatedSlugs: ['player-sign-in'],
    steps: [
      {
        id: 'public',
        title: 'Public achievements',
        body: 'Public pages showcase club achievements without requiring admin tools.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/public/achievements');
          await ctx.delay(600);
        },
      },
    ],
  },
];
