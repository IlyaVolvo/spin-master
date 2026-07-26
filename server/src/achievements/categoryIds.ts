/** Stable achievement category ids — used by config, registry, and API. */
export const ACHIEVEMENT_CATEGORY_IDS = [
  'biggest_upset',
  'most_wins',
  'most_active',
  'underdog_champion',
  'club_ladder_movers',
] as const;

export type AchievementCategoryId = (typeof ACHIEVEMENT_CATEGORY_IDS)[number];

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategoryId, string> = {
  biggest_upset: 'Biggest upset',
  most_wins: 'Most wins',
  most_active: 'Most active',
  underdog_champion: 'Underdog champion',
  club_ladder_movers: 'Club ladder movers',
};

export function isAchievementCategoryId(value: string): value is AchievementCategoryId {
  return (ACHIEVEMENT_CATEGORY_IDS as readonly string[]).includes(value);
}
