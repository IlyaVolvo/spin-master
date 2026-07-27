import type { AchievementPlugin } from '../types';
import { biggestUpsetPlugin } from './biggestUpset';
import { mostWinsPlugin } from './mostWins';
import { mostActivePlugin } from './mostActive';
import { underdogChampionPlugin } from './underdogChampion';
import { clubLadderMoversPlugin } from './clubLadderMovers';

/** Register plugins here when adding/removing achievement categories. */
export const ACHIEVEMENT_PLUGINS: AchievementPlugin[] = [
  biggestUpsetPlugin,
  mostWinsPlugin,
  mostActivePlugin,
  underdogChampionPlugin,
  clubLadderMoversPlugin,
];
