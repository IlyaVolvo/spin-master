import type { AchievementCategoryId } from './categoryIds';
import { isAchievementCategoryId } from './categoryIds';
import { ACHIEVEMENT_PLUGINS } from './plugins';
import type {
  AchievementCategoryResult,
  AchievementContext,
  AchievementPlugin,
  AchievementScope,
} from './types';
import {
  getAchievementDisplayLimit,
  getSystemConfig,
} from '../services/systemConfigService';

export function getAchievementPlugins(): AchievementPlugin[] {
  return ACHIEVEMENT_PLUGINS;
}

export function getAchievementPlugin(id: string): AchievementPlugin | null {
  if (!isAchievementCategoryId(id)) return null;
  return ACHIEVEMENT_PLUGINS.find((p) => p.id === id) ?? null;
}

export function isAchievementEnabled(id: AchievementCategoryId): boolean {
  return getAchievementDisplayLimit(id) > 0;
}

export function getEnabledAchievementPlugins(): AchievementPlugin[] {
  return ACHIEVEMENT_PLUGINS.filter((p) => isAchievementEnabled(p.id));
}

export async function computeCategory(
  plugin: AchievementPlugin,
  ctx: AchievementContext,
): Promise<AchievementCategoryResult | null> {
  if (!plugin.supportsScope(ctx.scope)) return null;
  const limit = getAchievementDisplayLimit(plugin.id);
  if (limit <= 0) return null;
  const entries = (await plugin.compute(ctx)).slice(0, limit);
  if (!entries.length) return null;
  // Re-number ranks after slice
  const ranked = entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
  return { id: plugin.id, title: plugin.title, entries: ranked };
}

export async function computeEnabledCategories(
  ctx: AchievementContext,
  plugins: AchievementPlugin[] = getEnabledAchievementPlugins(),
): Promise<AchievementCategoryResult[]> {
  const results: AchievementCategoryResult[] = [];
  for (const plugin of plugins) {
    if (!plugin.supportsScope(ctx.scope)) continue;
    const result = await computeCategory(plugin, ctx);
    if (result) results.push(result);
  }
  return results;
}

export function scopeSummary(scope: AchievementScope) {
  if (scope.type === 'tournament') {
    return { type: 'tournament' as const, tournamentId: scope.tournamentId };
  }
  return {
    type: 'period' as const,
    period: scope.period,
    from: scope.from?.toISOString() ?? null,
    to: scope.to?.toISOString() ?? null,
  };
}

/** @deprecated kept for clarity in callers that still import getSystemConfig via registry */
export function getAchievementsConfig() {
  return getSystemConfig().publicAccess.achievements;
}
