import express, { Request, Response } from 'express';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE } from '../achievements/emptyMessage';
import {
  computeCategory,
  computeEnabledCategories,
  getAchievementPlugin,
  getEnabledAchievementPlugins,
  isAchievementEnabled,
  scopeSummary,
} from '../achievements/registry';
import { buildAchievementContext } from '../achievements/shared/context';
import { parseAchievementScope } from '../achievements/shared/scope';
import { hasAnyAchievementEnabled } from '../services/systemConfigService';
import { isAchievementCategoryId } from '../achievements/categoryIds';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!hasAnyAchievementEnabled()) {
      return res.status(404).json({ error: 'Achievements not available' });
    }

    const parsed = parseAchievementScope(req.query);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }

    const enabled = getEnabledAchievementPlugins().filter((p) =>
      p.supportsScope(parsed.scope),
    );
    if (enabled.length === 0) {
      return res.json({
        scope: scopeSummary(parsed.scope),
        categories: [],
        emptyMessage: { text: DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE },
      });
    }

    const ctxOrError = await buildAchievementContext(prisma, parsed.scope);
    if ('error' in ctxOrError) {
      return res.status(ctxOrError.status).json({ error: ctxOrError.error });
    }

    const categories = await computeEnabledCategories(ctxOrError, enabled);
    res.json({
      scope: scopeSummary(parsed.scope),
      categories,
      emptyMessage:
        categories.length === 0
          ? { text: DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE }
          : null,
    });
  } catch (error) {
    logger.error('Error computing public achievements', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:categoryId', async (req: Request, res: Response) => {
  try {
    if (!hasAnyAchievementEnabled()) {
      return res.status(404).json({ error: 'Achievements not available' });
    }

    const categoryId = req.params.categoryId;
    if (!isAchievementCategoryId(categoryId)) {
      return res.status(404).json({ error: 'Achievements not available' });
    }
    if (!isAchievementEnabled(categoryId)) {
      return res.status(404).json({ error: 'Achievements not available' });
    }

    const plugin = getAchievementPlugin(categoryId);
    if (!plugin) {
      return res.status(404).json({ error: 'Achievements not available' });
    }

    const parsed = parseAchievementScope(req.query);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }

    if (!plugin.supportsScope(parsed.scope)) {
      return res.status(404).json({ error: 'Achievements not available' });
    }

    const ctxOrError = await buildAchievementContext(prisma, parsed.scope);
    if ('error' in ctxOrError) {
      return res.status(ctxOrError.status).json({ error: ctxOrError.error });
    }

    const category = await computeCategory(plugin, ctxOrError);
    if (!category) {
      return res.json({
        scope: scopeSummary(parsed.scope),
        category: { id: plugin.id, title: plugin.title, entries: [] },
        emptyMessage: { text: DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE },
      });
    }

    res.json({
      scope: scopeSummary(parsed.scope),
      category,
      emptyMessage: null,
    });
  } catch (error) {
    logger.error('Error computing public achievement category', {
      error: error instanceof Error ? error.message : String(error),
      categoryId: req.params.categoryId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
