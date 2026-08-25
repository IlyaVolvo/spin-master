import * as path from 'path';

export const TUTORIAL_PASSWORD = 'TutorialDemo#2026';

export const TUTORIAL_CLUB_NAME =
  (process.env.ROLE_TUTORIAL_CLUB_NAME || 'Portland Table Tennis Club').trim() ||
  'Portland Table Tennis Club';

export const TUTORIAL_EMAILS = {
  player: 'tutorial-player@spin-master.local',
  organizer: 'tutorial-organizer@spin-master.local',
  admin: 'tutorial-admin@spin-master.local',
} as const;

/** Shared score PIN for all seeded tutorial members (authPolicy.pinLength = 4). */
export const TUTORIAL_SCORE_PIN = '1234';

/** Roster member used for the player kiosk check-in showcase (has visit-pack entitlement). */
export const TUTORIAL_CHECKIN_MEMBER = {
  firstName: 'Eden',
  lastName: 'Brooks',
} as const;

/** Roster member used for the player kiosk check-out showcase (seeded present today). */
export const TUTORIAL_CHECKOUT_MEMBER = {
  firstName: 'Alex',
  lastName: 'Rivera',
} as const;

/** Today’s paid event night — Eden is REGISTERED for event check-in showcase. */
export const TUTORIAL_EVENT_NIGHT_NAME = 'Tutorial Event Night';

/** Pending cash event fee — Payment Log + member ledger showcase. */
export const TUTORIAL_EVENT_FEE_MEMBER = {
  firstName: 'Finley',
  lastName: 'Ortiz',
} as const;

/** Tutorial player account — has rating history from the seeded completed RR. */
export const TUTORIAL_HISTORY_MEMBER = {
  firstName: 'Tutorial',
  lastName: 'PlayerOnly',
} as const;

/**
 * Opponents with completed-RR match history vs TUTORIAL_HISTORY_MEMBER.
 * Subject + these two = three players for the match-history showcase.
 */
export const TUTORIAL_HISTORY_OPPONENTS = [
  { firstName: 'Alex', lastName: 'Rivera' },
  { firstName: 'Blair', lastName: 'Chen' },
] as const;

/** Members used for multi-player Statistics (all have completed-RR rating history). */
export const TUTORIAL_STATS_MEMBERS = [
  { firstName: 'Tutorial', lastName: 'PlayerOnly' },
  { firstName: 'Alex', lastName: 'Rivera' },
  { firstName: 'Blair', lastName: 'Chen' },
] as const;

/** Seeded active Round Robin used for scoring / early-completion showcases. */
export const TUTORIAL_ACTIVE_RR_NAME = 'Tutorial Active Round Robin';

/** Seeded unpaid preregistration (non-event) used for prereg ops + cancel-reason showcases. */
export const TUTORIAL_PREREG_NAME = 'Tutorial Pre-Registration Event';

/** Seeded completed Round Robin used for score-correction / Repeat showcases. */
export const TUTORIAL_COMPLETED_RR_NAME = 'Tutorial Completed Round Robin';

/** First-time invite account — mustResetPassword until they set a password. */
export const TUTORIAL_INVITE_MEMBER = {
  firstName: 'Casey',
  lastName: 'Invitee',
  email: 'tutorial-invite@spin-master.local',
} as const;

/** Pending public join application — Accept membership walkthrough. */
export const TUTORIAL_JOIN_TOKEN = 'tutorialpublicjoinaccepttoken0001tutorialpublicjoinaccepttoken0001';
export const TUTORIAL_JOIN_APPLICANT = {
  firstName: 'Riley',
  lastName: 'Guest',
  email: 'tutorial-join@spin-master.local',
} as const;

/** Seeded Monthly plan family used when adding a Junior segment price. */
export const TUTORIAL_MONTHLY_PLAN_NAME = 'Monthly membership';
export const TUTORIAL_MONTHLY_FAMILY_KEY = 'monthly';

/** Values used when capturing the System Settings update showcase. */
export const TUTORIAL_UPDATED_CLUB_NAME = 'Portland TT Club Showcase';
export const TUTORIAL_UPDATED_TIMEZONE = 'America/New_York';

export const VIEWPORT = {
  width: Number(process.env.TUTORIAL_VIEWPORT_WIDTH || 1600) || 1600,
  height: Number(process.env.TUTORIAL_VIEWPORT_HEIGHT || 1000) || 1000,
};

export const BASE_URL = (process.env.ROLE_TUTORIAL_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);

export const CHROME_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome-stable');

export const PUBLIC_TUTORIALS_DIR = path.resolve(
  __dirname,
  '../../../../client/public/role-tutorials',
);

export const SCENARIOS_JSON_DIR = path.join(PUBLIC_TUTORIALS_DIR, 'scenarios');
export const ASSETS_DIR = path.join(PUBLIC_TUTORIALS_DIR, 'assets');
export const CATALOG_PATH = path.join(PUBLIC_TUTORIALS_DIR, 'catalog.json');
