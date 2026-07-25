import express, { Request, Response } from 'express';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { enrichTournamentForApi } from '../services/scoreCorrectionService';
import { sanitizeTournamentForPublic } from '../utils/publicTournamentSanitize';
import {
  computeMatchDateRangeFromTournamentTree,
  getMatchDateRangesByRootId,
  rangesOverlap,
} from '../utils/tournamentMatchDateRange';

const router = express.Router();

const PUBLIC_ELIGIBLE_WHERE = {
  status: 'COMPLETED' as const,
  cancelled: false,
  parentTournamentId: null,
};

function tournamentDetailInclude() {
  return {
    participants: {
      include: {
        member: true,
      },
    },
    matches: true,
    swissData: true,
    childTournaments: {
      orderBy: [{ groupNumber: 'asc' as const }, { id: 'asc' as const }],
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        swissData: true,
        bracketMatches: { include: { match: true } },
      },
    },
    _count: {
      select: {
        participants: true,
        matches: true,
      },
    },
  };
}

/** Parse YYYY-MM-DD into UTC day start/end for inclusive filtering. */
function parseInclusiveDateBound(value: unknown, endOfDay: boolean): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function attachMatchDateRange(tournament: any): any {
  const range = computeMatchDateRangeFromTournamentTree(tournament);
  return {
    ...tournament,
    matchDateFrom: range?.from?.toISOString() ?? null,
    matchDateTo: range?.to?.toISOString() ?? null,
  };
}

async function loadEligibleTournamentById(id: number) {
  return prisma.tournament.findFirst({
    where: {
      id,
      ...PUBLIC_ELIGIBLE_WHERE,
    },
    include: tournamentDetailInclude(),
  });
}

async function enrichAndSanitize(tournament: any) {
  const enriched = await enrichTournamentForApi(prisma, tournament);
  return attachMatchDateRange(sanitizeTournamentForPublic(enriched));
}

router.get('/list', async (req: Request, res: Response) => {
  try {
    const fromBound = parseInclusiveDateBound(req.query.from, false);
    const toBound = parseInclusiveDateBound(req.query.to, true);

    if (req.query.from != null && req.query.from !== '' && !fromBound) {
      return res.status(400).json({ error: 'Invalid from date; use YYYY-MM-DD' });
    }
    if (req.query.to != null && req.query.to !== '' && !toBound) {
      return res.status(400).json({ error: 'Invalid to date; use YYYY-MM-DD' });
    }
    if (fromBound && toBound && fromBound > toBound) {
      return res.status(400).json({ error: 'from date must be on or before to date' });
    }

    const tournaments = await prisma.tournament.findMany({
      where: PUBLIC_ELIGIBLE_WHERE,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    const ranges = await getMatchDateRangesByRootId(
      prisma,
      tournaments.map((t) => t.id),
    );

    const filtered = tournaments
      .map((tournament) => {
        const range = ranges.get(tournament.id) ?? null;
        return {
          id: tournament.id,
          name: tournament.name,
          type: tournament.type,
          matchDateFrom: range?.from?.toISOString() ?? null,
          matchDateTo: range?.to?.toISOString() ?? null,
        };
      })
      .filter((tournament) => {
        if (!fromBound && !toBound) return true;
        if (!tournament.matchDateFrom || !tournament.matchDateTo) return false;
        return rangesOverlap(
          {
            from: new Date(tournament.matchDateFrom),
            to: new Date(tournament.matchDateTo),
          },
          fromBound,
          toBound,
        );
      });

    res.json({ tournaments: filtered });
  } catch (error) {
    logger.error('Error listing public tournament results', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const tournament = await prisma.tournament.findFirst({
      where: PUBLIC_ELIGIBLE_WHERE,
      orderBy: { id: 'desc' },
      include: tournamentDetailInclude(),
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Results not available' });
    }

    res.json(await enrichAndSanitize(tournament));
  } catch (error) {
    logger.error('Error fetching latest public tournament results', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || String(tournamentId) !== req.params.id) {
      return res.status(404).json({ error: 'Results not available' });
    }

    const tournament = await loadEligibleTournamentById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Results not available' });
    }

    res.json(await enrichAndSanitize(tournament));
  } catch (error) {
    logger.error('Error fetching public tournament results', {
      error: error instanceof Error ? error.message : String(error),
      tournamentId: req.params.id,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
