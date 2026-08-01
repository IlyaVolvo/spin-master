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
