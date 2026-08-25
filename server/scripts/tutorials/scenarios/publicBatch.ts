import type { HTTPRequest } from 'puppeteer-core';
import type { ScenarioDef } from '../lib/types';
import type { CaptureContext } from '../lib/browser';
import {
  TUTORIAL_COMPLETED_RR_NAME,
  TUTORIAL_JOIN_APPLICANT,
  TUTORIAL_JOIN_TOKEN,
  TUTORIAL_PASSWORD,
} from '../lib/constants';
import { gotoPath } from '../lib/steps';

async function waitForText(ctx: CaptureContext, text: string, timeout = 20000): Promise<void> {
  await ctx.page.waitForFunction(
    (needle) => (document.body?.innerText || '').includes(needle),
    { timeout },
    text,
  );
}

async function openPublic(ctx: CaptureContext, path: string, readyText: string): Promise<void> {
  await gotoPath(ctx, path);
  await waitForText(ctx, readyText);
  await ctx.delay(300);
}

async function fillJoinApplyForm(ctx: CaptureContext): Promise<void> {
  await ctx.page.click('#join-first-name', { clickCount: 3 });
  await ctx.page.keyboard.type('Sam', { delay: 10 });
  await ctx.page.click('#join-last-name', { clickCount: 3 });
  await ctx.page.keyboard.type('Applicant', { delay: 10 });
  await ctx.page.click('#join-email', { clickCount: 3 });
  await ctx.page.keyboard.type('sam.applicant@example.com', { delay: 10 });
}

async function mockJoinApplyOk(ctx: CaptureContext): Promise<() => Promise<void>> {
  const page = ctx.page;
  await page.setRequestInterception(true);
  const handler = (req: HTTPRequest) => {
    if (req.method() === 'POST' && req.url().includes('/public/membership/apply')) {
      void req.respond({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    }
    void req.continue();
  };
  page.on('request', handler);
  return async () => {
    page.off('request', handler);
    try {
      await page.setRequestInterception(false);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Public (unauthenticated) showcase walkthroughs.
 */
export const publicScenarios: ScenarioDef[] = [
  {
    slug: 'showcase-public-achievements',
    role: 'public',
    showcase: true,
    title: 'Public achievements',
    description:
      'Open club achievements without signing in, switch Period vs Tournament, pick a board to print, and print the selection.',
    relatedSlugs: [
      'showcase-public-results-latest',
      'showcase-public-results-list',
      'showcase-public-join-apply',
    ],
    steps: [
      {
        id: 'achievements-home',
        kind: 'context',
        title: 'Achievements',
        body: 'Anyone can open the club’s public achievements. No login is required. Period is the default scope.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
        },
      },
      {
        id: 'period-scope',
        kind: 'action',
        title: 'Period is selected',
        body: 'Period shows boards for a rolling window (week, month, year, or all time). Tournament limits boards to one completed event.',
        actionHint: 'Notice Period is the active scope',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
          return { hotspot: await ctx.hotspotForButton('Period') };
        },
      },
      {
        id: 'tournament-scope',
        kind: 'action',
        title: 'Switch to Tournament',
        body: 'Choose Tournament to score boards from a single completed event instead of a date window.',
        actionHint: 'Click Tournament',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
          return { hotspot: await ctx.hotspotForButton('Tournament') };
        },
      },
      {
        id: 'tournament-picked',
        kind: 'result',
        title: 'Boards for one event',
        body: 'Pick the completed Round Robin. Boards refresh for that event only.',
        resultNote: 'Tournament scope is active and an event is selected.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
          await ctx.clickButtonContaining('Tournament');
          await ctx.delay(400);
          await ctx.page.waitForSelector('select', { timeout: 10000 });
          await ctx.page.evaluate((name) => {
            const select = document.querySelector('select') as HTMLSelectElement | null;
            if (!select) return;
            const opt = [...select.options].find((o) => (o.textContent || '').includes(name));
            if (opt) {
              select.value = opt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, TUTORIAL_COMPLETED_RR_NAME);
          await ctx.delay(800);
        },
      },
      {
        id: 'mark-print',
        kind: 'action',
        title: 'Mark a board to print',
        body: 'Check Print next to a board so it is included when you print selected achievements.',
        actionHint: 'Check Print on a board',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
          await ctx.page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
          return { hotspot: await ctx.hotspotFor('input[type="checkbox"]') };
        },
      },
      {
        id: 'print-selected',
        kind: 'action',
        title: 'Print selected',
        body: 'Print selected opens the browser print dialog for the boards you checked.',
        actionHint: 'Click Print selected',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Achievements');
          await ctx.page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
          await ctx.page.click('input[type="checkbox"]');
          await ctx.delay(200);
          return { hotspot: await ctx.hotspotForButton('Print selected') };
        },
      },
    ],
  },
  {
    slug: 'showcase-public-results-latest',
    role: 'public',
    showcase: true,
    title: 'Latest public results',
    description: 'Open Latest to see the club’s most recently completed tournament. No login required.',
    relatedSlugs: ['showcase-public-results-list', 'showcase-public-results-detail'],
    steps: [
      {
        id: 'open-latest',
        kind: 'context',
        title: 'Latest results',
        body: 'Latest always shows the newest completed top-level tournament. The page may redirect to that event’s detail URL.',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
        },
      },
      {
        id: 'latest-nav',
        kind: 'action',
        title: 'Latest is the current tab',
        body: 'The public bar highlights Latest. Use All results to browse older events, or Achievements for leaderboards.',
        actionHint: 'Latest is the active public tab',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
          return { hotspot: await ctx.hotspotForButton('Latest') };
        },
      },
      {
        id: 'latest-standings',
        kind: 'result',
        title: 'Completed standings',
        body: 'The same completed Round Robin the club just finished is shown with standings (and print, covered in the detail walkthrough).',
        resultNote: 'Newest completed tournament is on screen.',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
        },
      },
    ],
  },
  {
    slug: 'showcase-public-results-list',
    role: 'public',
    showcase: true,
    title: 'All public results',
    description: 'Browse completed tournaments, optionally filter by date, and open one event.',
    relatedSlugs: ['showcase-public-results-latest', 'showcase-public-results-detail'],
    steps: [
      {
        id: 'list-home',
        kind: 'context',
        title: 'All results',
        body: 'All results lists completed club tournaments. Date filters are optional.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/results/list', TUTORIAL_COMPLETED_RR_NAME);
        },
      },
      {
        id: 'date-from',
        kind: 'action',
        title: 'Filter from date',
        body: 'Set From to limit the list to events on or after that club date.',
        actionHint: 'Use the From date',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/results/list', 'Filter by date');
          return { hotspot: await ctx.hotspotFor('input[type="date"]') };
        },
      },
      {
        id: 'apply-filter',
        kind: 'action',
        title: 'Apply the filter',
        body: 'Filter reloads the list. Clear removes the dates.',
        actionHint: 'Click Filter',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/results/list', 'Filter by date');
          const from = '2000-01-01';
          const to = '2099-12-31';
          await ctx.page.$$eval(
            'input[type="date"]',
            (inputs, start, end) => {
              const [a, b] = inputs as HTMLInputElement[];
              if (a) {
                a.value = start;
                a.dispatchEvent(new Event('input', { bubbles: true }));
                a.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (b) {
                b.value = end;
                b.dispatchEvent(new Event('input', { bubbles: true }));
                b.dispatchEvent(new Event('change', { bubbles: true }));
              }
            },
            from,
            to,
          );
          return { hotspot: await ctx.hotspotForButton('Filter') };
        },
      },
      {
        id: 'filtered-list',
        kind: 'result',
        title: 'Matching events',
        body: 'The list shows completed tournaments in the range, including Tutorial Completed Round Robin.',
        resultNote: 'The completed Round Robin remains in the filtered list.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/results/list', TUTORIAL_COMPLETED_RR_NAME);
        },
      },
      {
        id: 'open-event',
        kind: 'action',
        title: 'Open an event',
        body: 'View results opens the public detail page for that tournament.',
        actionHint: 'Click View results',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/results/list', TUTORIAL_COMPLETED_RR_NAME);
          return { hotspot: await ctx.hotspotFor('a[href^="/public/results/"]') };
        },
      },
    ],
  },
  {
    slug: 'showcase-public-results-detail',
    role: 'public',
    showcase: true,
    title: 'Public result detail and print',
    description:
      'Read completed standings on the public detail page and print Standard, Detailed, or Abbreviated results.',
    relatedSlugs: ['showcase-public-results-latest', 'showcase-public-results-list'],
    steps: [
      {
        id: 'detail-home',
        kind: 'context',
        title: 'Event results',
        body: 'The public detail page shows the completed table (or bracket / Swiss) without editing controls.',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
        },
      },
      {
        id: 'print-menu',
        kind: 'action',
        title: 'Print formats',
        body: 'When extra print modes exist, Print opens Standard, Detailed, and Abbreviated. Round Robin supports Abbreviated.',
        actionHint: 'Open Print',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
          const select = await ctx.page.$('select[aria-label="Print results format"]');
          if (select) {
            return { hotspot: await ctx.hotspotFor('select[aria-label="Print results format"]') };
          }
          return { hotspot: await ctx.hotspotForButton('Print') };
        },
      },
      {
        id: 'print-open',
        kind: 'result',
        title: 'Choose a format',
        body: 'Standard is the default table. Abbreviated is a compact Round Robin print. Detailed is used when the format offers extra columns.',
        resultNote: 'Print options are visible.',
        capture: async (ctx) => {
          await gotoPath(ctx, '/public/results/latest');
          await waitForText(ctx, TUTORIAL_COMPLETED_RR_NAME);
          const select = await ctx.page.$('select[aria-label="Print results format"]');
          if (select) {
            await select.click();
            await ctx.delay(200);
          }
        },
      },
    ],
  },
  {
    slug: 'showcase-public-join-apply',
    role: 'public',
    showcase: true,
    title: 'Become a member — apply',
    description:
      'From the public bar, open Become a Member, enter name and email, and submit. The club emails Accept and Deny links (7 days).',
    relatedSlugs: ['showcase-public-join-accept', 'showcase-public-achievements'],
    steps: [
      {
        id: 'public-bar',
        kind: 'context',
        title: 'Public club pages',
        body: 'Become a Member stays on the public bar for visitors who are not signed in.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Become a Member');
        },
      },
      {
        id: 'become-member',
        kind: 'action',
        title: 'Become a Member',
        body: 'Open the application form. You do not need an account yet.',
        actionHint: 'Click Become a Member',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/achievements', 'Become a Member');
          return { hotspot: await ctx.hotspotForButton('Become a Member') };
        },
      },
      {
        id: 'join-form',
        kind: 'result',
        title: 'Application form',
        body: 'Enter first name, last name, and email. The club sends confirmation links; nothing is activated until you Accept.',
        resultNote: 'Become a Member form is on screen.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/join', 'Become a Member');
        },
      },
      {
        id: 'fill-submit',
        kind: 'action',
        title: 'Submit the application',
        body: 'After the fields are filled, Submit sends the confirmation email with Accept and Deny links that expire in 7 days.',
        actionHint: 'Click Submit',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/join', 'Become a Member');
          await fillJoinApplyForm(ctx);
          return { hotspot: await ctx.hotspotForButton('Submit') };
        },
      },
      {
        id: 'check-email',
        kind: 'result',
        title: 'Check your email',
        body: 'The page asks you to check email for Accept and Deny. Those links expire in 7 days.',
        resultNote: 'Confirmation message replaces the form.',
        capture: async (ctx) => {
          await openPublic(ctx, '/public/join', 'Become a Member');
          await fillJoinApplyForm(ctx);
          const stop = await mockJoinApplyOk(ctx);
          try {
            await ctx.clickButtonContaining('Submit');
            await waitForText(ctx, 'Check your email');
          } finally {
            await stop();
          }
        },
      },
    ],
  },
  {
    slug: 'showcase-public-join-accept',
    role: 'public',
    showcase: true,
    hideNextShowcase: true,
    title: 'Become a member — accept',
    description:
      'Open the Accept link from email, set a password and score PIN, and activate membership.',
    relatedSlugs: ['showcase-public-join-apply'],
    steps: [
      {
        id: 'accept-link',
        kind: 'context',
        title: 'Accept membership',
        body: 'The Accept link in email opens this setup page. It is valid for 7 days.',
        capture: async (ctx) => {
          await gotoPath(ctx, `/public/join/setup?token=${TUTORIAL_JOIN_TOKEN}`);
          await waitForText(ctx, 'Accept membership');
        },
      },
      {
        id: 'set-password',
        kind: 'action',
        title: 'Set password and PIN',
        body: 'Choose a password (club minimum length) and a 4-digit score PIN used at the kiosk.',
        actionHint: 'Fill password and PIN, then Activate',
        capture: async (ctx) => {
          await gotoPath(ctx, `/public/join/setup?token=${TUTORIAL_JOIN_TOKEN}`);
          await waitForText(ctx, TUTORIAL_JOIN_APPLICANT.firstName);
          await ctx.page.type('#join-password', TUTORIAL_PASSWORD, { delay: 5 });
          await ctx.page.type('#join-password-confirm', TUTORIAL_PASSWORD, { delay: 5 });
          await ctx.page.type('#join-pin', '1234', { delay: 5 });
          return { hotspot: await ctx.hotspotForButton('Activate and sign in') };
        },
      },
      {
        id: 'ready-activate',
        kind: 'result',
        title: 'Ready to activate',
        body: 'Activate and sign in creates the account and signs you in. After that you can add phone, photo, and notification preferences.',
        resultNote: 'Password and PIN are filled; Activate is ready. (This walkthrough does not submit, so the demo token stays valid.)',
        capture: async (ctx) => {
          await gotoPath(ctx, `/public/join/setup?token=${TUTORIAL_JOIN_TOKEN}`);
          await waitForText(ctx, TUTORIAL_JOIN_APPLICANT.firstName);
          await ctx.page.type('#join-password', TUTORIAL_PASSWORD, { delay: 5 });
          await ctx.page.type('#join-password-confirm', TUTORIAL_PASSWORD, { delay: 5 });
          await ctx.page.type('#join-pin', '1234', { delay: 5 });
        },
      },
    ],
  },
];
