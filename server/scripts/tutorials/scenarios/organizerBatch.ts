import type { ScenarioDef } from '../lib/types';
import { TUTORIAL_EMAILS } from '../lib/constants';
import {
  ensureLoggedIn,
  gotoPath,
  hotspotForTournamentType,
  loginFormStep,
  openTournamentWizard,
  selectTournamentType,
} from '../lib/steps';

const E = TUTORIAL_EMAILS.organizer;

function formatScenario(
  slug: string,
  title: string,
  typeValue: string,
  typeLabel: string,
  extraBody: string,
): ScenarioDef {
  return {
    slug,
    role: 'organizer',
    title,
    description: `Open the tournament wizard and select ${typeLabel}.`,
    relatedSlugs: ['organizer-sign-in', 'organizer-player-selection'],
    steps: [
      {
        id: 'open-wizard',
        title: 'Open tournament wizard',
        body: 'From Players, use + Tournament to choose a format.',
        actionHint: 'Click + Tournament',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Tournament') };
        },
      },
      {
        id: 'select-type',
        title: `Select ${typeLabel}`,
        body: extraBody,
        actionHint: `Select ${typeLabel}`,
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, typeValue);
          return { hotspot: await hotspotForTournamentType(ctx, typeValue) };
        },
      },
    ],
  };
}

export const organizerScenarios: ScenarioDef[] = [
  {
    slug: 'organizer-sign-in',
    role: 'organizer',
    title: 'Sign in as an organizer',
    description: 'Sign in with an organizer account and see tournament tools on Players.',
    relatedSlugs: ['organizer-create-round-robin', 'organizer-tournaments-active'],
    steps: [
      loginFormStep(E),
      {
        id: 'players-toolbar',
        title: 'Organizer toolbar',
        body: 'Organizers see + Tournament and usually + Match on the Players page.',
        actionHint: 'Click + Tournament',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await ctx.delay(500);
          return { hotspot: await ctx.hotspotForButton('+ Tournament') };
        },
      },
    ],
  },
  formatScenario(
    'organizer-create-round-robin',
    'Create Round Robin',
    'ROUND_ROBIN',
    'Round Robin',
    'Round Robin needs a minimum roster. Name the event optionally, then continue to player selection.',
  ),
  formatScenario(
    'organizer-create-playoff',
    'Create Playoff / Bracket',
    'PLAYOFF',
    'Playoff / Bracket',
    'Playoff builds a bracket. Choose this type, then continue to select players and seeding options.',
  ),
  formatScenario(
    'organizer-create-swiss',
    'Create Swiss',
    'SWISS',
    'Swiss',
    'Swiss pairs by rating across rounds. Select Swiss, then continue into configuration.',
  ),
  formatScenario(
    'organizer-create-multi-rr',
    'Create Multi Round Robin',
    'MULTI_ROUND_ROBINS',
    'Multi Round Robin',
    'Multi Round Robin splits the field into several RR groups. Select it, then configure group size.',
  ),
  formatScenario(
    'organizer-create-prelim-rr-final',
    'Create Preliminary + RR Final',
    'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
    'Round Robin Final',
    'Expand Preliminary, choose Round Robin Final, then configure auto-qualified players and final size.',
  ),
  formatScenario(
    'organizer-create-prelim-playoff-final',
    'Create Preliminary + Playoff Final',
    'PRELIMINARY_WITH_FINAL_PLAYOFF',
    'Playoff Final',
    'Expand Preliminary, choose Playoff Final, then set qualifiers per group and bracket options.',
  ),
  {
    slug: 'organizer-preregistration',
    role: 'organizer',
    title: 'Pre-registration mode',
    description: 'Enable pre-registration on the type modal to collect sign-ups before the event starts.',
    relatedSlugs: ['organizer-create-round-robin', 'organizer-tournaments-prereg'],
    steps: [
      {
        id: 'open-wizard',
        title: 'Tournament type modal',
        body: 'Open + Tournament to reach the type modal.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await openTournamentWizard(ctx);
        },
      },
      {
        id: 'enable-prereg',
        title: 'Pre-registration checkbox',
        body: 'Check Pre-registration mode to collect date, deadline, rating bounds, and max participants. The primary button becomes Create Pre-registration.',
        actionHint: 'Enable Pre-registration mode',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'ROUND_ROBIN');
          const box = await ctx.page.evaluate(() => {
            const labels = [...document.querySelectorAll('label')];
            const lab = labels.find((l) => (l.textContent || '').includes('Pre-registration mode'));
            if (!lab) return null;
            const input = lab.querySelector('input') || lab;
            const r = (input as HTMLElement).getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          await ctx.page.evaluate(() => {
            const labels = [...document.querySelectorAll('label')];
            const lab = labels.find((l) => (l.textContent || '').includes('Pre-registration mode'));
            const input = lab?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            if (input && !input.checked) input.click();
            else lab?.click();
          });
          await ctx.delay(400);
          if (!box) return {};
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(box, VIEWPORT.width, VIEWPORT.height) };
        },
      },
    ],
  },
  {
    slug: 'organizer-player-selection',
    role: 'organizer',
    title: 'Select tournament players',
    description: 'After choosing a type, advance to the shared player selection step.',
    relatedSlugs: ['organizer-create-round-robin', 'organizer-sign-in'],
    steps: [
      {
        id: 'player-select',
        title: 'Player selection',
        body: 'Use Select All / Deselect All, then Continue when the roster meets the format minimum.',
        actionHint: 'Click Next / Continue',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await openTournamentWizard(ctx);
          await selectTournamentType(ctx, 'ROUND_ROBIN');
          const next = await ctx.clickButtonContaining('Next');
          if (!next) {
            const cont = await ctx.clickButtonContaining('Continue');
            if (!cont) throw new Error('Next/Continue not found');
          }
          await ctx.delay(900);
          try {
            return { hotspot: await ctx.hotspotForButton('Select All') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'organizer-record-match',
    role: 'organizer',
    title: 'Record a casual match',
    description: 'Organizers can also record casual matches from Players with + Match.',
    relatedSlugs: ['player-record-match', 'organizer-sign-in'],
    steps: [
      {
        id: 'match',
        title: 'Start match recording',
        body: 'Click + Match, then pick players on the roster.',
        actionHint: 'Click + Match',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Match') };
        },
      },
      {
        id: 'selection',
        title: 'Selection mode',
        body: 'Choose participants, then continue into scoring when prompted.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.clickButtonContaining('+ Match');
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'organizer-tournaments-active',
    role: 'organizer',
    title: 'Active tournaments',
    description: 'Open Tournaments and review the Active stage tab.',
    relatedSlugs: ['organizer-tournaments-prereg', 'organizer-tournaments-completed'],
    steps: [
      {
        id: 'active',
        title: 'Active stage',
        body: 'Active holds running events. Open one for day-of scoring, schedule, and print tools.',
        actionHint: 'Open Active tab',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Active');
          await ctx.delay(500);
          try {
            return { hotspot: await ctx.hotspotForButton('Active') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'organizer-tournaments-prereg',
    role: 'organizer',
    title: 'Pre-registration tournaments',
    description: 'Switch to the Pre-Registration stage on the tournaments list.',
    relatedSlugs: ['organizer-preregistration', 'organizer-tournaments-active'],
    steps: [
      {
        id: 'prereg-tab',
        title: 'Pre-Registration tab',
        body: 'Pre-Registration lists events still collecting sign-ups. Finalize or cancel from the event detail.',
        actionHint: 'Open Pre-Registration',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Pre-Registration');
          await ctx.delay(500);
          try {
            return { hotspot: await ctx.hotspotForButton('Pre-Registration') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'organizer-tournaments-completed',
    role: 'organizer',
    title: 'Completed tournaments',
    description: 'Review finished events under Completed.',
    relatedSlugs: ['organizer-tournaments-active', 'organizer-repeat-hint'],
    steps: [
      {
        id: 'completed',
        title: 'Completed tab',
        body: 'Completed events are available for review and often as a template to repeat a past setup.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Completed');
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'organizer-individual-matches',
    role: 'organizer',
    title: 'Individual matches',
    description: 'Open the Individual Matches stage for casual / non-tournament match lists.',
    relatedSlugs: ['organizer-record-match'],
    steps: [
      {
        id: 'individual',
        title: 'Individual Matches',
        body: 'This stage groups standalone matches outside tournament brackets.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments');
          const ok = await ctx.clickButtonContaining('Individual Matches');
          if (!ok) await ctx.clickButtonContaining('Individual');
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'organizer-open-active-tournament',
    role: 'organizer',
    title: 'Open an active tournament',
    description: 'Open the seeded tutorial active tournament detail page.',
    relatedSlugs: ['organizer-tournaments-active', 'organizer-day-of-tools'],
    steps: [
      {
        id: 'detail',
        title: 'Tournament detail',
        body: 'Detail pages expose scoring, stands, schedule, abandon, early completion, and print actions depending on format and state.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          // Seed creates "Tutorial Active Round Robin" as the first tournament (id 1).
          await gotoPath(ctx, '/tournaments/1');
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'organizer-day-of-tools',
    role: 'organizer',
    title: 'Day-of tournament tools',
    description: 'On an active event, locate scoring and related day-of controls.',
    relatedSlugs: ['organizer-open-active-tournament', 'organizer-abandon-hint'],
    steps: [
      {
        id: 'day-of',
        title: 'Day-of chrome',
        body: 'Look for score entry, schedule, and print. Exact controls vary by tournament type.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments/1');
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'organizer-abandon-hint',
    role: 'organizer',
    title: 'Abandon / stop controls',
    description: 'Find destructive end-of-event actions (Abandon / Early Completion) on an active tournament.',
    relatedSlugs: ['organizer-day-of-tools', 'organizer-open-active-tournament'],
    steps: [
      {
        id: 'controls',
        title: 'End-of-event actions',
        body: 'Abandon stops an event without normal completion. Early Completion finishes early when rules allow. Prefer these only with intent.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments/1');
          await ctx.delay(800);
          try {
            return { hotspot: await ctx.hotspotForButton('Abandon') };
          } catch {
            try {
              return { hotspot: await ctx.hotspotForButton('Early') };
            } catch {
              return {};
            }
          }
        },
      },
    ],
  },
  {
    slug: 'organizer-repeat-hint',
    role: 'organizer',
    title: 'Repeat a past setup',
    description: 'Completed tournaments are the starting point for repeating a prior configuration.',
    relatedSlugs: ['organizer-tournaments-completed'],
    steps: [
      {
        id: 'completed-list',
        title: 'Completed list',
        body: 'Open a completed event to look for Repeat / re-create style actions when the UI offers them.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/tournaments');
          await ctx.clickButtonContaining('Completed');
          await ctx.delay(600);
        },
      },
    ],
  },
  {
    slug: 'organizer-browse-kiosk',
    role: 'organizer',
    title: 'Enter browse kiosk',
    description: 'Open the Kiosk chooser and enter Browse mode for floor display.',
    relatedSlugs: ['admin-enter-checkin-kiosk', 'organizer-sign-in'],
    steps: [
      {
        id: 'kiosk-button',
        title: 'Kiosk entry',
        body: 'Kiosk drops elevated chrome for a floor-friendly UI. Organizers use Browse; admins also get Check-in.',
        actionHint: 'Click Kiosk',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('Kiosk') };
        },
      },
      {
        id: 'chooser',
        title: 'Kiosk chooser',
        body: 'Choose Browse for tournament floor browsing. Use Restore privileges later to exit kiosk.',
        actionHint: 'Click Browse',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.clickButtonContaining('Kiosk');
          await ctx.delay(500);
          try {
            return { hotspot: await ctx.hotspotForButton('Browse') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'organizer-stats',
    role: 'organizer',
    title: 'Organizer statistics',
    description: 'Open Stats from the Players toolbar.',
    relatedSlugs: ['player-statistics'],
    steps: [
      {
        id: 'stats',
        title: 'Stats',
        body: 'Statistics are available to organizers from the same toolbar entry as players.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          await ctx.clickButtonContaining('Stats');
          await ctx.delay(800);
        },
      },
    ],
  },
];
