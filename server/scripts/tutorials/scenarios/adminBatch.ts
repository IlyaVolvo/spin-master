import type { ScenarioDef } from '../lib/types';
import { TUTORIAL_EMAILS } from '../lib/constants';
import {
  ensureLoggedIn,
  gotoPath,
  hotspotForTitle,
  loginFormStep,
  openAdminMenu,
} from '../lib/steps';

const E = TUTORIAL_EMAILS.admin;

export const adminScenarios: ScenarioDef[] = [
  {
    slug: 'admin-sign-in',
    role: 'admin',
    title: 'Sign in as administrator',
    description: 'Sign in and see admin chrome including the Admin menu.',
    relatedSlugs: ['admin-header-menu', 'admin-system-settings'],
    steps: [
      loginFormStep(E),
      {
        id: 'players-admin',
        title: 'Admin on Players',
        body: 'Administrators get + Player, the Admin menu, and System Settings access.',
        actionHint: 'Open Admin menu',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          try {
            return { hotspot: await ctx.hotspotForButton('Admin') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'admin-header-menu',
    role: 'admin',
    title: 'Admin header menu',
    description: 'Open the Admin dropdown to reach Payment Log, Attendance, Plans, and System Configuration.',
    relatedSlugs: ['admin-payment-log', 'admin-attendance-log', 'admin-system-settings'],
    steps: [
      {
        id: 'menu',
        title: 'Admin pages menu',
        body: 'Payment Log, Attendance Log, Payment Plans, and System Configuration live under Admin.',
        actionHint: 'Open Admin',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          await openAdminMenu(ctx);
          try {
            return { hotspot: await ctx.hotspotForButton('Admin') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'admin-system-settings',
    role: 'admin',
    title: 'System Settings overview',
    description: 'Open System Settings and review club branding controls.',
    relatedSlugs: ['admin-settings-hours', 'admin-settings-tournament-rules', 'admin-settings-core'],
    steps: [
      loginFormStep(E, {
        body: 'Administrators use the same login form, then open System Settings from Admin or the gear route.',
      }),
      {
        id: 'settings',
        title: 'System Settings',
        body: 'Club Name and Timezone sit at the top. Expand sections for hours, tournament rules, and operations.',
        actionHint: 'Focus Club Name',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/system-settings');
          try {
            return { hotspot: await ctx.hotspotFor('[data-testid="system-settings-club-name"]') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'admin-settings-hours',
    role: 'admin',
    title: 'Club open / close hours',
    description: 'Expand Open / Close hours to set weekly hours and date overrides.',
    relatedSlugs: ['admin-system-settings', 'admin-attendance-log'],
    steps: [
      {
        id: 'hours',
        title: 'Hours section',
        body: 'Configure weekday hours, closed days, and single-date overrides used by check-in and auto check-out.',
        actionHint: 'Open hours section',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/system-settings');
          const toggle = await ctx.page.$('[data-testid="system-settings-hours-toggle"]');
          if (toggle) {
            await toggle.click();
            await ctx.delay(400);
            return { hotspot: await ctx.hotspotFor('[data-testid="system-settings-hours-toggle"]') };
          }
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('button, summary, h2, h3')].find((n) =>
              (n.textContent || '').includes('Open / Close hours'),
            ) as HTMLElement | undefined;
            el?.click();
          });
          await ctx.delay(400);
          return {};
        },
      },
    ],
  },
  {
    slug: 'admin-settings-tournament-rules',
    role: 'admin',
    title: 'Tournament rules settings',
    description: 'Expand Tournament Rules for format minima and match score bounds.',
    relatedSlugs: ['admin-system-settings', 'organizer-create-round-robin'],
    steps: [
      {
        id: 'rules',
        title: 'Tournament Rules',
        body: 'Tune Round Robin, Playoff, Swiss, Multi RR, Preliminary formats, and match score limits.',
        actionHint: 'Open Tournament Rules',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/system-settings');
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('button, summary, h2, h3')].find((n) =>
              (n.textContent || '').includes('Tournament Rules'),
            ) as HTMLElement | undefined;
            el?.click();
          });
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'admin-settings-core',
    role: 'admin',
    title: 'Core & operations settings',
    description: 'Open Core Settings and Operations Settings accordions.',
    relatedSlugs: ['admin-system-settings', 'admin-settings-public-achievements'],
    steps: [
      {
        id: 'core',
        title: 'Core Settings',
        body: 'Core and Operations cover auth policy, preregistration defaults, and runtime options.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/system-settings');
          await ctx.page.evaluate(() => {
            for (const label of ['Core Settings', 'Operations Settings']) {
              const el = [...document.querySelectorAll('button, summary, h2, h3')].find((n) =>
                (n.textContent || '').includes(label),
              ) as HTMLElement | undefined;
              el?.click();
            }
          });
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'admin-settings-public-achievements',
    role: 'admin',
    title: 'Public achievements settings',
    description: 'Configure which achievement categories appear on public pages.',
    relatedSlugs: ['admin-system-settings', 'player-public-achievements'],
    steps: [
      {
        id: 'achievements',
        title: 'Public Achievements',
        body: 'Toggle categories and use Apply to all when bulk-updating visibility.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/system-settings');
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('button, summary, h2, h3')].find((n) =>
              (n.textContent || '').includes('Public Achievements'),
            ) as HTMLElement | undefined;
            el?.click();
          });
          await ctx.delay(500);
        },
      },
    ],
  },
  {
    slug: 'admin-payment-log',
    role: 'admin',
    title: 'Payment Log',
    description: 'Open Payment Log to filter and clear/reject pending payments.',
    relatedSlugs: ['admin-payment-plans', 'admin-header-menu'],
    steps: [
      {
        id: 'menu',
        title: 'Open Payment Log',
        body: 'Admin → Payment Log lists member payments with status filters.',
        actionHint: 'Open Payment Log',
        capture: async (ctx) => {
          await ctx.loginAs(E);
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
          if (!item) throw new Error('Payment Log menu item missing');
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(item, VIEWPORT.width, VIEWPORT.height) };
        },
      },
      {
        id: 'log',
        title: 'Payment Log page',
        body: 'Filter by member, date, Paid/Pending. Clear or Reject pending cash rows; open a member name for their plan.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await gotoPath(ctx, '/payments');
        },
      },
    ],
  },
  {
    slug: 'admin-payment-plans',
    role: 'admin',
    title: 'Payment Plans',
    description: 'Configure club plans, segments, and payment provider settings.',
    relatedSlugs: ['admin-payment-provider', 'admin-courtesy-visits', 'player-open-own-plan'],
    steps: [
      {
        id: 'plans',
        title: 'Payment Plans tab',
        body: 'Manage segments, create Time or Visit pack plans, and edit prices. Use + New Plan to add offers.',
        actionHint: 'Look for + New Plan',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/payments?tab=plans');
          await ctx.delay(700);
          try {
            return { hotspot: await ctx.hotspotForButton('+ New Plan') };
          } catch {
            try {
              return { hotspot: await ctx.hotspotForButton('New Plan') };
            } catch {
              return {};
            }
          }
        },
      },
    ],
  },
  {
    slug: 'admin-payment-provider',
    role: 'admin',
    title: 'Payment provider & courtesy settings',
    description: 'On Payment Plans, review provider configuration, reminders, trial, and courtesy knobs.',
    relatedSlugs: ['admin-payment-plans', 'admin-courtesy-visits'],
    steps: [
      {
        id: 'provider',
        title: 'Provider & courtesy',
        body: 'Set provider, online-pay defaults, courtesy grace, trial days, and reminder thresholds. Save with Save Payments Settings.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/payments?tab=plans');
          await ctx.delay(700);
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('h2, h3, button')].find((n) =>
              /Payment Provider|Courtesy|Reminders/i.test(n.textContent || ''),
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(300);
        },
      },
    ],
  },
  {
    slug: 'admin-courtesy-visits',
    role: 'admin',
    title: 'Courtesy visits',
    description: 'Review the Courtesy Visits subsection for members on courtesy check-in.',
    relatedSlugs: ['admin-payment-plans', 'admin-enter-checkin-kiosk'],
    steps: [
      {
        id: 'courtesy',
        title: 'Courtesy Visits',
        body: 'Suspend or resume courtesy for members who checked in without a paid entitlement under club policy.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/payments?tab=plans');
          await ctx.delay(700);
          await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('h2, h3, button')].find((n) =>
              (n.textContent || '').includes('Courtesy'),
            ) as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'center' });
          });
          await ctx.delay(300);
        },
      },
    ],
  },
  {
    slug: 'admin-attendance-log',
    role: 'admin',
    title: 'Attendance Log',
    description: 'Open Attendance Log to see who is present and filter rejected check-ins.',
    relatedSlugs: ['admin-close-club', 'admin-enter-checkin-kiosk'],
    steps: [
      {
        id: 'attendance',
        title: 'Attendance Log',
        body: 'Filter by member, date, and status (All / Only Present / Only Rejected). Close club ends the day for everyone present.',
        actionHint: 'Open Attendance Log',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          await openAdminMenu(ctx);
          const item = await ctx.page.evaluate(() => {
            const el = [...document.querySelectorAll('a, button')].find(
              (x) => (x.textContent || '').trim() === 'Attendance Log',
            ) as HTMLElement | undefined;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          if (item) {
            const { boxToPct } = await import('../lib/hotspot');
            const { VIEWPORT } = await import('../lib/constants');
            return { hotspot: boxToPct(item, VIEWPORT.width, VIEWPORT.height) };
          }
          return {};
        },
      },
      {
        id: 'log-page',
        title: 'Attendance table',
        body: 'Present count appears in the title. Use filters before closing the club.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await gotoPath(ctx, '/attendance-log');
        },
      },
    ],
  },
  {
    slug: 'admin-close-club',
    role: 'admin',
    title: 'Close club',
    description: 'Locate the Close club action on the Attendance Log.',
    relatedSlugs: ['admin-attendance-log'],
    steps: [
      {
        id: 'close',
        title: 'Close club control',
        body: 'Close club checks out everyone still present for the club-local day. Confirm before using it.',
        actionHint: 'Find Close club',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/attendance-log');
          try {
            return { hotspot: await ctx.hotspotForButton('Close club') };
          } catch {
            return {};
          }
        },
      },
    ],
  },
  {
    slug: 'admin-add-player',
    role: 'admin',
    title: 'Add a player',
    description: 'Start the + Player flow from the Players toolbar.',
    relatedSlugs: ['admin-sign-in', 'admin-edit-member'],
    steps: [
      {
        id: 'add',
        title: '+ Player',
        body: 'Administrators create members with + Player, including email invite / password setup flows.',
        actionHint: 'Click + Player',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Player') };
        },
      },
      {
        id: 'form',
        title: 'New player form',
        body: 'Fill required member fields and save. New members may need password reset or trial settings.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.clickButtonContaining('+ Player');
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'admin-edit-member',
    role: 'admin',
    title: 'Edit a member',
    description: 'Open a member edit control from the Players table.',
    relatedSlugs: ['admin-add-player', 'admin-member-plan'],
    steps: [
      {
        id: 'edit',
        title: 'Edit member',
        body: 'Use the row edit control to change profile, roles, and admin-only fields.',
        actionHint: 'Click Edit member profile',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const hs = await hotspotForTitle(ctx.page, 'Edit member profile');
          return hs ? { hotspot: hs } : {};
        },
      },
      {
        id: 'editor',
        title: 'Member editor',
        body: 'Adjust roles (Player / Organizer / Admin / Coach), ratings, and account flags, then save.',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.page.evaluate(() => {
            const el = document.querySelector('[title="Edit member profile"]') as HTMLElement | null;
            el?.click();
          });
          await ctx.delay(800);
        },
      },
    ],
  },
  {
    slug: 'admin-member-plan',
    role: 'admin',
    title: 'Open a member plan',
    description: 'Open another member’s plan from the roster $ indicator.',
    relatedSlugs: ['player-open-own-plan', 'admin-payment-log'],
    steps: [
      {
        id: 'plan',
        title: 'Member plan overlay',
        body: 'Admins can purchase on behalf of members, set credit, and manage courtesy check-in from the plan screen.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          const clicked = await ctx.page.evaluate(() => {
            const buttons = [...document.querySelectorAll('button, a')] as HTMLElement[];
            const el = buttons.find(
              (b) =>
                (b.getAttribute('title') || '').toLowerCase().includes('plan') ||
                (b.textContent || '').trim() === '$',
            );
            if (!el) return false;
            el.click();
            return true;
          });
          if (!clicked) {
            // fallback: open own plan
            await ctx.page.evaluate(() => {
              (
                document.querySelector(
                  '[title="View and manage your club plan"]',
                ) as HTMLElement | null
              )?.click();
            });
          }
          await ctx.delay(900);
        },
      },
    ],
  },
  {
    slug: 'admin-enter-checkin-kiosk',
    role: 'admin',
    title: 'Enter check-in kiosk',
    description: 'Open Kiosk and choose Check-in for front-desk attendance.',
    relatedSlugs: ['admin-checkin-present-filter', 'admin-attendance-log'],
    steps: [
      {
        id: 'kiosk',
        title: 'Kiosk button',
        body: 'Kiosk mode is for the front desk / floor. Admins can enter Check-in; organizers use Browse.',
        actionHint: 'Click Kiosk',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('Kiosk') };
        },
      },
      {
        id: 'chooser',
        title: 'Choose Check-in',
        body: 'Select Check-in. Members then check in with PIN; payment gates may appear when required.',
        actionHint: 'Click Check-in',
        capture: async (ctx) => {
          await ensureLoggedIn(ctx, E);
          await ctx.clickButtonContaining('Kiosk');
          await ctx.delay(500);
          try {
            return { hotspot: await ctx.hotspotForButton('Check-in') };
          } catch {
            return {};
          }
        },
      },
      {
        id: 'kiosk-ui',
        title: 'Check-in kiosk UI',
        body: 'Toolbar shows attendance count and Present filter. Each row has Check-in / Check-out. Use Restore privileges to exit.',
        capture: async (ctx) => {
          // Prior step should leave the kiosk chooser open — do not re-login (chooser hides Logout).
          const hasChooser = await ctx.page.evaluate(() =>
            [...document.querySelectorAll('button')].some((b) =>
              (b.textContent || '').trim() === 'Check-in',
            ),
          );
          if (!hasChooser) {
            await ctx.clickButtonContaining('Kiosk');
            await ctx.delay(400);
          }
          await ctx.clickButtonContaining('Check-in');
          await ctx.delay(1200);
        },
      },
    ],
  },
  {
    slug: 'admin-checkin-present-filter',
    role: 'admin',
    title: 'Kiosk Present filter',
    description: 'In check-in kiosk, toggle Present to focus on who is already in the club.',
    relatedSlugs: ['admin-enter-checkin-kiosk'],
    steps: [
      {
        id: 'present',
        title: 'Present filter',
        body: 'Present narrows the roster to members currently checked in.',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          await ctx.clickButtonContaining('Kiosk');
          await ctx.delay(400);
          await ctx.clickButtonContaining('Check-in');
          await ctx.delay(900);
          const box = await ctx.page.evaluate(() => {
            const el =
              (document.querySelector('#presentOnlyFilter') as HTMLElement | null) ||
              ([...document.querySelectorAll('label')].find((l) =>
                (l.textContent || '').includes('Present'),
              ) as HTMLElement | undefined);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          });
          if (!box) return {};
          const { boxToPct } = await import('../lib/hotspot');
          const { VIEWPORT } = await import('../lib/constants');
          return { hotspot: boxToPct(box, VIEWPORT.width, VIEWPORT.height) };
        },
      },
    ],
  },
  {
    slug: 'admin-players-toolbar',
    role: 'admin',
    title: 'Admin Players toolbar',
    description: 'Full administration toolbar: + Player, + Match, Stats, and more.',
    relatedSlugs: ['admin-add-player', 'admin-sign-in'],
    steps: [
      {
        id: 'toolbar',
        title: 'Toolbar',
        body: 'Admins combine member administration with match tools on Players.',
        actionHint: 'Click + Player',
        capture: async (ctx) => {
          await ctx.loginAs(E);
          await gotoPath(ctx, '/players');
          return { hotspot: await ctx.hotspotForButton('+ Player') };
        },
      },
    ],
  },
];
