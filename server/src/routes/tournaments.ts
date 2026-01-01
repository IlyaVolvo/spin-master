import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { recalculateRankings } from '../services/rankingService';
import { logger } from '../utils/logger';
import { invalidateCacheAfterTournament, invalidateTournamentCache } from '../services/cacheService';
import { emitCacheInvalidation, emitTournamentUpdate, emitMatchUpdate } from '../services/socketService';

const router = express.Router();

// Request logging is handled by requestLogger middleware in index.ts

// All routes require authentication
router.use(authenticate);

// Helper function to check if user has ORGANIZER role
async function isOrganizer(req: AuthRequest): Promise<boolean> {
  logger.debug('Checking organizer status', {
    hasMember: !!req.member,
    hasMemberId: !!req.memberId,
    memberId: req.member?.id || req.memberId,
    memberRoles: req.member?.roles,
  });

  // Check if session has member with ORGANIZER role
  if (req.member && Array.isArray(req.member.roles)) {
    // Check if roles array contains 'ORGANIZER' (case-sensitive)
    const hasOrganizerRole = req.member.roles.some(role => 
      String(role).toUpperCase() === 'ORGANIZER'
    );
    if (hasOrganizerRole) {
      logger.info('Organizer access granted via session', { 
        memberId: req.member.id,
        roles: req.member.roles 
      });
    return true;
    } else {
      logger.debug('Organizer access denied - session member does not have ORGANIZER role', { 
        memberId: req.member.id,
        roles: req.member.roles 
      });
    }
  }
  
  // Check if JWT token has memberId and member is organizer
  if (req.memberId) {
    try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
      
      if (member && Array.isArray(member.roles)) {
        // Check if roles array contains 'ORGANIZER' (case-sensitive)
        const hasOrganizerRole = member.roles.some(role => 
          String(role).toUpperCase() === 'ORGANIZER'
        );
        if (hasOrganizerRole) {
          logger.info('Organizer access granted via database lookup', { 
            memberId: req.memberId,
            roles: member.roles 
          });
          return true;
        } else {
          logger.debug('Organizer access denied - member does not have ORGANIZER role', { 
            memberId: req.memberId,
            roles: member.roles 
          });
        }
      } else {
        logger.warn('Organizer access denied - member not found or no roles', { 
          memberId: req.memberId,
          memberFound: !!member
        });
      }
    } catch (error) {
      logger.error('Error checking organizer status in database', {
        error: error instanceof Error ? error.message : String(error),
        memberId: req.memberId
      });
    }
  } else {
    logger.debug('Organizer access denied - no memberId in request');
  }
  
  return false;
}

// Helper function to attach rating history to bracket matches
async function attachRatingHistoryToBracketMatches(bracketMatches: any[], tournamentParticipants?: any[], tournamentId?: number) {
  // Create a map of memberId -> participant for quick lookup
  const participantMap = new Map<number, any>();
  if (tournamentParticipants) {
    tournamentParticipants.forEach((p: any) => {
      participantMap.set(p.memberId, p);
    });
  }

  // Collect all matchIds and memberIds for batch query
  const matchIds: number[] = [];
  const allMemberIds = new Set<number>();
  
  for (const bracketMatch of bracketMatches) {
    if (bracketMatch.match?.id) {
      matchIds.push(bracketMatch.match.id);
    }
    if (bracketMatch.member1Id && bracketMatch.member1Id !== 0) {
      allMemberIds.add(bracketMatch.member1Id);
    }
    if (bracketMatch.member2Id && bracketMatch.member2Id !== 0) {
      allMemberIds.add(bracketMatch.member2Id);
    }
  }

  // Batch fetch all rating history in a single query
  const allRatingHistory = matchIds.length > 0
    ? await (prisma as any).ratingHistory.findMany({
        where: {
          matchId: { in: matchIds },
          memberId: { in: Array.from(allMemberIds) },
        },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  // Create a map: matchId -> memberId -> rating history
  const ratingHistoryMap = new Map<string, Map<number, any>>();
  for (const history of allRatingHistory) {
    const matchKey = history.matchId?.toString() || '';
    if (!ratingHistoryMap.has(matchKey)) {
      ratingHistoryMap.set(matchKey, new Map());
    }
    ratingHistoryMap.get(matchKey)!.set(history.memberId, history);
  }

  // Now process each bracket match
  for (const bracketMatch of bracketMatches) {
    const member1Id = bracketMatch.member1Id;
    const member2Id = bracketMatch.member2Id;
    
    // Skip BYE matches (memberId === 0 or null)
    if (member1Id === 0 || member1Id === null || member2Id === 0 || member2Id === null) {
      // For BYE matches, still set rating info to null on the bracketMatch itself
      bracketMatch.player1RatingAtTime = null;
      bracketMatch.player2RatingAtTime = null;
      if (bracketMatch.match) {
        bracketMatch.match.player1RatingBefore = null;
        bracketMatch.match.player1RatingChange = null;
        bracketMatch.match.player2RatingBefore = null;
        bracketMatch.match.player2RatingChange = null;
      }
      continue;
    }

    // For unplayed matches, get rating from tournament participant data
    if (!bracketMatch.match) {
      const participant1 = participantMap.get(member1Id);
      const participant2 = participantMap.get(member2Id);
      
      bracketMatch.player1RatingAtTime = participant1?.playerRatingAtTime ?? null;
      bracketMatch.player2RatingAtTime = participant2?.playerRatingAtTime ?? null;
      continue;
    }

    // For played matches, get rating history from the batch-fetched data
    const matchId = bracketMatch.match.id;
    const matchHistoryMap = ratingHistoryMap.get(matchId.toString());
    
    const member1History = matchHistoryMap?.get(member1Id);
    const member2History = matchHistoryMap?.get(member2Id);
    
    if (member1History) {
      // Calculate ratingBefore from rating and ratingChange
      const ratingBefore = member1History.rating - member1History.ratingChange;
      bracketMatch.match.player1RatingBefore = ratingBefore;
      bracketMatch.match.player1RatingChange = member1History.ratingChange;
    } else {
      bracketMatch.match.player1RatingBefore = null;
      bracketMatch.match.player1RatingChange = null;
    }
    
    if (member2History) {
      // Calculate ratingBefore from rating and ratingChange
      const ratingBefore = member2History.rating - member2History.ratingChange;
      bracketMatch.match.player2RatingBefore = ratingBefore;
      bracketMatch.match.player2RatingChange = member2History.ratingChange;
    } else {
      bracketMatch.match.player2RatingBefore = null;
      bracketMatch.match.player2RatingChange = null;
    }

    // Also attach rating at time from participant data for played matches
    const participant1 = participantMap.get(member1Id);
    const participant2 = participantMap.get(member2Id);
    bracketMatch.player1RatingAtTime = participant1?.playerRatingAtTime ?? null;
    bracketMatch.player2RatingAtTime = participant2?.playerRatingAtTime ?? null;
  }
}

// Get all tournaments
router.get('/', async (req, res) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        _count: {
          select: {
            participants: true,
            matches: true,
          },
        },
      },
    });

    // For completed tournaments, calculate post-tournament rating for each participant
    // Optimized: Batch queries instead of N+1 queries
    const completedTournaments = tournaments.filter(t => t.status === 'COMPLETED');
    
    if (completedTournaments.length > 0) {
      // Get the earliest and latest completed tournament dates
      const earliestDate = completedTournaments.reduce((earliest, t) => 
        t.createdAt < earliest ? t.createdAt : earliest, completedTournaments[0].createdAt
      );
      
      // Get all tournaments created after the earliest completed tournament
      // This single query replaces hundreds of individual queries
      const allLaterTournaments = await prisma.tournament.findMany({
        where: {
          createdAt: { gt: earliestDate },
        },
        include: {
          participants: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Build a map: tournamentId -> memberId -> rating after tournament
      // Use cache service for fast lookups
      const { getCachedPostTournamentRating } = await import('../services/cacheService');
      const { getPostTournamentRating } = await import('../services/usattRatingService');
      
      const postRatingMap = new Map<string, number | null>();
      
      // Process tournaments in chronological order to calculate post-ratings
      const sortedCompletedTournaments = [...completedTournaments].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // Collect all tournament-participant pairs and process in parallel
      // First try cache, then calculate if needed
      const ratingPromises: Array<Promise<[string, number | null | undefined]>> = [];
      for (const tournament of sortedCompletedTournaments) {
        for (const participant of tournament.participants) {
          const key = `${tournament.id}-${participant.memberId}`;
          
          // Try cache first
          const cached = getCachedPostTournamentRating(tournament.id, participant.memberId);
          if (cached !== undefined) {
            postRatingMap.set(key, cached);
          } else {
            // Calculate if not in cache (will be cached automatically)
            ratingPromises.push(
              getPostTournamentRating(tournament.id, participant.memberId).then(
                rating => [key, rating] as [string, number | null | undefined]
              )
            );
          }
        }
      }
      
      // Wait for all ratings to be calculated (in parallel)
      const ratingResults = await Promise.all(ratingPromises);
      ratingResults.forEach(([key, rating]) => {
        postRatingMap.set(key, rating ?? null);
      });

      // Apply post-ratings to completed tournaments and include bracketMatches for PLAYOFF tournaments
      const tournamentsWithPostRatings = await Promise.all(tournaments.map(async (tournament) => {
        if (tournament.status !== 'COMPLETED') {
          // For non-completed tournaments, just include bracketMatches if PLAYOFF
          if (tournament.type === 'PLAYOFF') {
            const bracketMatches = await (prisma as any).bracketMatch.findMany({
              where: { tournamentId: tournament.id },
              include: {
                match: true,
              },
              orderBy: [
                { round: 'asc' },
                { position: 'asc' },
              ],
            });
            await attachRatingHistoryToBracketMatches(bracketMatches, tournament.participants, tournament.id);
            return { ...tournament, bracketMatches } as any;
          }
          return { ...tournament, bracketMatches: [] } as any;
        }

        const participantsWithPostRating = tournament.participants.map(participant => {
          const key = `${tournament.id}-${participant.memberId}`;
          const postRating = postRatingMap.get(key) ?? participant.member.rating;
          return {
            ...participant,
            postRatingAtTime: postRating,
          };
        });

        const baseTournament = {
          ...tournament,
          participants: participantsWithPostRating,
        } as any;

        // Include bracketMatches for PLAYOFF tournaments
        if (tournament.type === 'PLAYOFF') {
          const bracketMatches = await (prisma as any).bracketMatch.findMany({
            where: { tournamentId: tournament.id },
            include: {
              match: true,
            },
            orderBy: [
              { round: 'asc' },
              { position: 'asc' },
            ],
          });
          await attachRatingHistoryToBracketMatches(bracketMatches, participantsWithPostRating, tournament.id);
          return { ...baseTournament, bracketMatches } as any;
        }

        return { ...baseTournament, bracketMatches: [] } as any;
      }));

      res.json(tournamentsWithPostRatings);
    } else {
      // No completed tournaments - still need to include bracketMatches for PLAYOFF tournaments
      const tournamentsWithBrackets = await Promise.all(tournaments.map(async (tournament) => {
        if (tournament.type === 'PLAYOFF') {
          const bracketMatches = await (prisma as any).bracketMatch.findMany({
            where: { tournamentId: tournament.id },
            include: {
              match: true,
            },
            orderBy: [
              { round: 'asc' },
              { position: 'asc' },
            ],
          });
          await attachRatingHistoryToBracketMatches(bracketMatches, tournament.participants, tournament.id);
          return { ...tournament, bracketMatches } as any;
        }
        return { ...tournament, bracketMatches: [] } as any;
      }));
      res.json(tournamentsWithBrackets);
    }
  } catch (error) {
    logger.error('Error fetching tournaments', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active tournaments
router.get('/active', async (req, res) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    // Only include bracketMatches for playoff tournaments
    const tournamentsWithBrackets = await Promise.all(tournaments.map(async (tournament) => {
      if (tournament.type === 'PLAYOFF') {
        const bracketMatches = await (prisma as any).bracketMatch.findMany({
          where: { tournamentId: tournament.id },
          include: {
            match: true,
          },
          orderBy: [
            { round: 'asc' },
            { position: 'asc' },
          ],
        });
        await attachRatingHistoryToBracketMatches(bracketMatches, tournament.participants);
        return { ...tournament, bracketMatches } as any;
      }
      return { ...tournament, bracketMatches: [] } as any;
    }));

    res.json(tournamentsWithBrackets);
  } catch (error) {
    logger.error('Error fetching active tournaments', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single tournament
router.get('/:id', async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }
    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Only include bracketMatches for playoff tournaments
    let tournamentWithBrackets: any = tournament;
    if (tournament.type === 'PLAYOFF') {
      const bracketMatches = await (prisma as any).bracketMatch.findMany({
        where: { tournamentId: tournament.id },
        include: {
          match: true,
        },
        orderBy: [
          { round: 'asc' },
          { position: 'asc' },
        ],
      });
      
      // Attach rating history to matches
      await attachRatingHistoryToBracketMatches(bracketMatches, tournament.participants, tournament.id);
      
      tournamentWithBrackets = { ...tournament, bracketMatches };
    } else {
      tournamentWithBrackets = { ...tournament, bracketMatches: [] };
    }

    res.json(tournamentWithBrackets);
  } catch (error) {
    logger.error('Error fetching tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start a new tournament
// Note: MULTI is not a valid tournament type. Multi-tournament mode creates multiple ROUND_ROBIN tournaments.
// Only Organizers can create tournaments
router.post('/', [
  body('name').optional().trim(),
  body('participantIds').isArray({ min: 2 }),
  body('participantIds.*').isInt({ min: 1 }),
  body('type').optional().isIn(['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH']),
  body('bracketPositions').optional().isArray(), // For PLAYOFF tournaments
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can create tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, participantIds, type, bracketPositions } = req.body;
    
    // Strict validation: only allow ROUND_ROBIN, PLAYOFF, or SINGLE_MATCH
    if (type && !['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH'].includes(type)) {
      return res.status(400).json({ error: `Invalid tournament type: ${type}. Only ROUND_ROBIN, PLAYOFF, and SINGLE_MATCH are allowed.` });
    }
    
    const tournamentType: 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH' = (type && ['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH'].includes(type))
      ? (type as 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH')
      : 'ROUND_ROBIN';

    // For Single Match, validate exactly 2 players
    if (tournamentType === 'SINGLE_MATCH' && participantIds.length !== 2) {
      return res.status(400).json({ error: 'Single Match requires exactly 2 players' });
    }

    // Verify all participants are active
    const players = await prisma.member.findMany({
      where: {
        id: { in: participantIds },
        isActive: true,
      },
    });

    if (players.length !== participantIds.length) {
      return res.status(400).json({ error: 'Some participants are not active or not found' });
    }

    // Generate tournament name
    let tournamentName = name;
    if (!tournamentName && tournamentType === 'SINGLE_MATCH') {
      // Auto-generate name from player names and date
      const player1 = players.find(p => p.id === participantIds[0]);
      const player2 = players.find(p => p.id === participantIds[1]);
      const dateStr = new Date().toLocaleDateString();
      if (player1 && player2) {
        tournamentName = `${player1.firstName} ${player1.lastName} vs ${player2.firstName} ${player2.lastName} - ${dateStr}`;
      } else {
        tournamentName = `Match ${dateStr}`;
      }
    } else if (!tournamentName) {
      tournamentName = `Tournament ${new Date().toLocaleDateString()}`;
    }

    // Create tournament with participants
    const tournament = await prisma.tournament.create({
      data: {
        name: tournamentName,
        type: tournamentType,
        status: 'ACTIVE',
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find(p => p.id === memberId);
            return {
              memberId,
              playerRatingAtTime: player?.rating || null, // Store rating when tournament started
            };
          }),
        },
      },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    // For PLAYOFF tournaments, generate initial bracket
    if (tournamentType === 'PLAYOFF') {
      try {

        const { createPlayoffBracketWithPositions } = await import('../services/playoffBracketService');
        // Use provided bracket positions if available, otherwise generate automatically
        const result = await createPlayoffBracketWithPositions(tournament.id, participantIds, bracketPositions);

      } catch (error) {
        logger.error('Error creating playoff bracket', { error: error instanceof Error ? error.message : String(error), tournamentId: tournament.id });
        // Continue anyway - tournament is created, bracket can be fixed later
      }
      
      // Reload tournament - bracketMatches are only for playoff tournaments
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
          participants: {
            include: {
              member: true,
            },
          },
          matches: true,
        },
      });
      
      if (updatedTournament) {
        // Load bracketMatches for playoff tournaments only
        const bracketMatches = await (prisma as any).bracketMatch.findMany({
          where: { tournamentId: tournament.id },
          include: {
            match: true,
          },
          orderBy: [
            { round: 'asc' },
            { position: 'asc' },
          ],
        });
        return res.status(201).json({ ...updatedTournament, bracketMatches } as any);
      }
      
      return res.status(201).json(tournament);
    }

    res.status(201).json(tournament);
  } catch (error) {
    logger.error('Error creating tournament', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create multiple tournaments at once
// Used by multi-tournament mode which creates multiple ROUND_ROBIN tournaments.
// Note: MULTI is not a valid tournament type - each tournament must be explicitly ROUND_ROBIN, PLAYOFF, or SINGLE_MATCH.
// Bulk create tournaments - Only Organizers can create tournaments
router.post('/bulk', [
  body('tournaments').isArray({ min: 1 }),
  body('tournaments.*.name').optional().trim(),
  body('tournaments.*.participantIds').isArray({ min: 2 }),
  body('tournaments.*.participantIds.*').isInt({ min: 1 }),
  body('tournaments.*.type').optional().isIn(['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH']),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can create tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tournaments } = req.body;

    // Collect all participant IDs to verify in one query
    const allParticipantIds = new Set<number>();
    tournaments.forEach((t: { participantIds: number[] }) => {
      t.participantIds.forEach((id: number) => allParticipantIds.add(id));
    });

    // Verify all participants are active
    const players = await prisma.member.findMany({
      where: {
        id: { in: Array.from(allParticipantIds) },
        isActive: true,
      },
    });

    const foundPlayerIds = new Set(players.map(p => p.id));
    const missingIds = Array.from(allParticipantIds).filter(id => !foundPlayerIds.has(id));
    
    if (missingIds.length > 0) {
      return res.status(400).json({ 
        error: `Some participants are not active or not found: ${missingIds.join(', ')}` 
      });
    }

    // Create all tournaments in a transaction
    const createdTournaments = await prisma.$transaction(
      tournaments.map((tournamentData: { name?: string; participantIds: number[]; type?: string }) => {
        // Strict validation: only allow ROUND_ROBIN, PLAYOFF, or SINGLE_MATCH
        // The validation middleware should catch invalid types, but this provides an extra check
        if (tournamentData.type && !['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH'].includes(tournamentData.type)) {
          throw new Error(`Invalid tournament type: ${tournamentData.type}. Only ROUND_ROBIN, PLAYOFF, and SINGLE_MATCH are allowed.`);
        }
        
        const tournamentType: 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH' = (tournamentData.type && ['ROUND_ROBIN', 'PLAYOFF', 'SINGLE_MATCH'].includes(tournamentData.type))
          ? (tournamentData.type as 'ROUND_ROBIN' | 'PLAYOFF' | 'SINGLE_MATCH')
          : 'ROUND_ROBIN'; // Default to ROUND_ROBIN
        
        return prisma.tournament.create({
          data: {
            name: tournamentData.name || `Tournament ${new Date().toLocaleDateString()}`,
            type: tournamentType,
            status: 'ACTIVE',
            participants: {
              create: tournamentData.participantIds.map((memberId: number) => {
                const player = players.find(p => p.id === memberId);
                return {
                  memberId,
                  playerRatingAtTime: player?.rating || null,
                };
              }),
            },
          },
          include: {
            participants: {
              include: {
                member: true,
              },
            },
          },
        });
      })
    );

    res.status(201).json({ tournaments: createdTournaments });
  } catch (error) {
    logger.error('Error creating bulk tournaments', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add match result to tournament
// Only Organizers can add matches
router.post('/:id/matches', [
  body('member1Id').isInt({ min: 1 }),
  body('member2Id').isInt({ min: 1 }),
  body('player1Sets').optional().isInt({ min: 0 }),
  body('player2Sets').optional().isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can add matches' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    // Verify tournament is active
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    }) as any; // Type assertion needed until Prisma types are fully regenerated

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tournament is not active' });
    }

    // Verify both players are participants
    const participantIds = tournament.participants.map((p: any) => p.memberId);
    if (!participantIds.includes(member1Id) || !participantIds.includes(member2Id)) {
      return res.status(400).json({ error: 'Both players must be tournament participants' });
    }

    if (member1Id === member2Id) {
      return res.status(400).json({ error: 'Players must be different' });
    }

    // Validate forfeit logic: exactly one player must forfeit
    const forfeit1 = player1Forfeit === true;
    const forfeit2 = player2Forfeit === true;
    if (forfeit1 && forfeit2) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
    }

    // If forfeit, set scores appropriately: forfeiting player loses (0 sets), opponent wins
    let finalPlayer1Sets = player1Sets ?? 0;
    let finalPlayer2Sets = player2Sets ?? 0;
    let finalPlayer1Forfeit = forfeit1;
    let finalPlayer2Forfeit = forfeit2;

    if (forfeit1) {
      finalPlayer1Sets = 0;
      finalPlayer2Sets = 1; // Winner gets 1 set (or could be 3-0, but 1-0 is simpler)
      finalPlayer1Forfeit = true;
      finalPlayer2Forfeit = false;
    } else if (forfeit2) {
      finalPlayer1Sets = 1; // Winner gets 1 set
      finalPlayer2Sets = 0;
      finalPlayer1Forfeit = false;
      finalPlayer2Forfeit = true;
    }

    // Check if this is a BYE match (memberId === 0) - BYE matches should not have Match records
    const isByeMatch = member1Id === 0 || member2Id === 0 || member2Id === null;
    if (isByeMatch) {
      return res.status(400).json({ error: 'Cannot create match for BYE - BYE players are automatically promoted' });
    }

    const match = await prisma.match.create({
      data: {
        tournamentId,
        member1Id,
        member2Id,
        player1Sets: finalPlayer1Sets,
        player2Sets: finalPlayer2Sets,
        player1Forfeit: finalPlayer1Forfeit,
        player2Forfeit: finalPlayer2Forfeit,
      },
    });

    // Adjust ratings immediately after match is created
    // ROUND_ROBIN: Don't calculate per match - ratings calculated on tournament completion
    // PLAYOFF: Calculate per match with incremental ratings (using current player rating)
    // SINGLE_MATCH: Calculate per match using playerRatingAtTime (rating when tournament started)
    // Forfeited matches should not change ratings
    // Note: BYE matches are already rejected above, so we know this is not a BYE match
    
    if (!finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      // Determine winner
      const winnerId = finalPlayer1Sets > finalPlayer2Sets ? member1Id :
                       finalPlayer2Sets > finalPlayer1Sets ? member2Id : null;
      
      if (winnerId && member1Id !== null && member2Id !== null && 
          member1Id !== 0 && member2Id !== 0) {
        const { processMatchRating } = await import('../services/matchRatingService');
        const player1Won = winnerId === member1Id;
        
        if (tournament.type === 'PLAYOFF') {
          // For PLAYOFF tournaments, use incremental calculation (current player rating)
          // useIncrementalRating = true for PLAYOFF (uses current rating, not playerRatingAtTime)
          await processMatchRating(member1Id, member2Id, player1Won, tournamentId, match.id, false, true);
        } else if (tournament.type === 'SINGLE_MATCH') {
          // For SINGLE_MATCH tournaments, use incremental ratings (current rating)
          // This ensures ratings build on each other when multiple single matches are played
          // useIncrementalRating = true for SINGLE_MATCH (uses current rating)
          await processMatchRating(member1Id, member2Id, player1Won, tournamentId, match.id, false, true);
        }
        // ROUND_ROBIN: Skip per-match rating calculation - will be calculated on tournament completion
      }
    }

    // For Single Match tournaments, auto-complete after match is created
    if (tournament.type === 'SINGLE_MATCH') {
      // Mark tournament as completed
      const completedTournament = await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED' },
      });
      
      // Invalidate cache and emit notifications
      await invalidateCacheAfterTournament(tournamentId);
      emitTournamentUpdate(completedTournament);
      emitMatchUpdate(match, tournamentId);
      emitCacheInvalidation(tournamentId);
    } else {
      // For other tournament types, invalidate cache for this tournament
      invalidateTournamentCache(tournamentId);
      emitMatchUpdate(match, tournamentId);
      emitCacheInvalidation(tournamentId);
    }

    res.status(201).json(match);
  } catch (error) {
    logger.error('Error creating match', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update match result (for corrections)
// Only Organizers can update matches
router.patch('/:tournamentId/matches/:matchId', [
  body('player1Sets').optional().isInt({ min: 0 }),
  body('player2Sets').optional().isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can update matches' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
    const tournamentId = parseInt(req.params.tournamentId);
    const matchId = parseInt(req.params.matchId);
    
    if (isNaN(tournamentId) || isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid tournament or match ID' });
    }

    let match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });

    // For playoff tournaments, if match doesn't exist, check if matchId is actually a bracketMatchId
    let bracketMatchId: number | null = null;
    let isBracketMatchId = false;
    if (!match) {
      const bracketMatch = await (prisma as any).bracketMatch.findUnique({
        where: { id: matchId },
        include: { tournament: true },
      });
      
      if (bracketMatch && bracketMatch.tournamentId === tournamentId && bracketMatch.tournament.type === 'PLAYOFF') {
        // Check if this is a BYE match BEFORE processing
        const isByeMatch = bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0 || 
                          bracketMatch.member2Id === null ||
                          (bracketMatch as any).player1IsBye || (bracketMatch as any).player2IsBye;
        
        if (isByeMatch) {
          return res.status(400).json({ error: 'Cannot create or update match for BYE - BYE players are automatically promoted' });
        }
        
        bracketMatchId = matchId;
        isBracketMatchId = true;
        // Get tournament for later use
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
        });
        if (!tournament) {
          return res.status(404).json({ error: 'Tournament not found' });
        }
        // Create a temporary match object structure for processing
        match = {
          id: matchId, // Will use bracketMatchId for creation
          tournamentId,
          member1Id: bracketMatch.member1Id!,
          member2Id: bracketMatch.member2Id,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
          tournament: { ...tournament, type: tournament.type as any },
        } as any;
      } else {
        return res.status(404).json({ error: 'Match not found' });
      }
    } else {
      // Match exists, check if it has a bracketMatchId
      bracketMatchId = (match as any).bracketMatchId;
      
      // For playoff tournaments, if match doesn't belong to this tournament, 
      // check if matchId is actually a bracketMatchId for this tournament
      if (match.tournamentId !== tournamentId) {
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
        });
        
        if (tournament && tournament.type === 'PLAYOFF') {
          // First check if matchId is actually a bracketMatchId for this tournament
          const bracketMatch = await (prisma as any).bracketMatch.findUnique({
            where: { id: matchId },
            include: { tournament: true, match: true },
          });
          
          if (bracketMatch && bracketMatch.tournamentId === tournamentId) {
            // Check if this is a BYE match BEFORE processing
            const isByeMatch = bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0 || 
                              bracketMatch.member2Id === null ||
                              (bracketMatch as any).player1IsBye || (bracketMatch as any).player2IsBye;
            
            if (isByeMatch) {
              return res.status(400).json({ error: 'Cannot create or update match for BYE - BYE players are automatically promoted' });
            }
            
            // matchId is actually a bracketMatchId for this tournament
            bracketMatchId = matchId;
            isBracketMatchId = true;
            // Use existing match if it exists, otherwise create temporary structure
            if (bracketMatch.match) {
              match = bracketMatch.match as any;
            } else {
              match = {
                id: matchId, // Will use bracketMatchId for creation
                tournamentId,
                member1Id: bracketMatch.member1Id!,
                member2Id: bracketMatch.member2Id,
                player1Sets: 0,
                player2Sets: 0,
                player1Forfeit: false,
                player2Forfeit: false,
                tournament: { ...tournament, type: tournament.type as any },
              } as any;
            }
          } else if (bracketMatchId) {
            // Match has a bracketMatchId, check if that bracketMatch belongs to this tournament
            const linkedBracketMatch = await (prisma as any).bracketMatch.findUnique({
              where: { id: bracketMatchId },
              include: { tournament: true },
            });
            
            if (linkedBracketMatch && linkedBracketMatch.tournamentId === tournamentId) {
              // The match's bracketMatch belongs to this tournament, so allow the update
              // match object is already correct, just continue
            } else {
            logger.error('Match does not belong to this tournament', { 
              matchTournamentId: match.tournamentId, 
              requestedTournamentId: tournamentId,
              matchId: matchId,
              bracketMatchId: bracketMatchId,
              matchObject: JSON.stringify(match, null, 2)
            });
              return res.status(400).json({ error: 'Match does not belong to this tournament' });
            }
          } else {
            logger.error('Match does not belong to this tournament', { 
              matchTournamentId: match.tournamentId, 
              requestedTournamentId: tournamentId,
              matchId: matchId
            });
            return res.status(400).json({ error: 'Match does not belong to this tournament' });
          }
        } else {
          logger.error('Match does not belong to this tournament', { 
            matchTournamentId: match.tournamentId, 
            requestedTournamentId: tournamentId,
            matchId: matchId,
            matchObject: JSON.stringify(match, null, 2)
          });
          return res.status(400).json({ error: 'Match does not belong to this tournament' });
        }
      }
    }

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Validate forfeit logic: exactly one player must forfeit
    const forfeit1 = player1Forfeit === true;
    const forfeit2 = player2Forfeit === true;
    if (forfeit1 && forfeit2) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
    }

    // If forfeit, set scores appropriately
    let finalPlayer1Sets = player1Sets ?? match.player1Sets;
    let finalPlayer2Sets = player2Sets ?? match.player2Sets;
    let finalPlayer1Forfeit = forfeit1;
    let finalPlayer2Forfeit = forfeit2;

    if (forfeit1) {
      finalPlayer1Sets = 0;
      finalPlayer2Sets = 1;
      finalPlayer1Forfeit = true;
      finalPlayer2Forfeit = false;
    } else if (forfeit2) {
      finalPlayer1Sets = 1;
      finalPlayer2Sets = 0;
      finalPlayer1Forfeit = false;
      finalPlayer2Forfeit = true;
    } else if (player1Forfeit === false && player2Forfeit === false) {
      // Explicitly clearing forfeit flags
      finalPlayer1Forfeit = false;
      finalPlayer2Forfeit = false;
    }

    // Check if match is being completed (scores are being set for the first time)
    const wasCompleted = match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || match.player2Forfeit;
    const isBeingCompleted = finalPlayer1Sets > 0 || finalPlayer2Sets > 0 || finalPlayer1Forfeit || finalPlayer2Forfeit;
    
    // Check if this is a BYE match (memberId === 0) - BYE matches should not have Match records
    const isByeMatch = match.member1Id === 0 || match.member2Id === 0 || match.member2Id === null;
    if (isByeMatch) {
      return res.status(400).json({ error: 'Cannot create or update match for BYE - BYE players are automatically promoted' });
    }
    
    let updatedMatch;
    if (isBracketMatchId && bracketMatchId) {
      // Create new Match record linked to bracketMatch
      updatedMatch = await prisma.match.create({
        data: {
          tournamentId,
          bracketMatchId: bracketMatchId,
          member1Id: match.member1Id,
          member2Id: match.member2Id,
          player1Sets: finalPlayer1Sets,
          player2Sets: finalPlayer2Sets,
          player1Forfeit: finalPlayer1Forfeit,
          player2Forfeit: finalPlayer2Forfeit,
        } as any, // Type assertion needed for bracketMatchId
      });
    } else {
      // Update existing match
      updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          player1Sets: finalPlayer1Sets,
          player2Sets: finalPlayer2Sets,
          player1Forfeit: finalPlayer1Forfeit,
          player2Forfeit: finalPlayer2Forfeit,
        },
      });
    }

    // Adjust ratings when match is completed or updated
    // ROUND_ROBIN: Don't calculate per match - ratings calculated on tournament completion
    // PLAYOFF: Calculate per match with incremental ratings (using current player rating)
    // Forfeited matches should not change ratings
    // IMPORTANT: Ratings are ONLY calculated when a Match record is created/updated with actual scores
    // NOT when players are just placed in bracket positions (that happens in advanceWinner)
    const isForfeit = finalPlayer1Forfeit || finalPlayer2Forfeit;
    
    // Only process ratings for PLAYOFF tournaments (ROUND_ROBIN handled on completion, SINGLE_MATCH already handled per match)
    if (match.tournament.type === 'PLAYOFF' && !isForfeit) {
      // If match was already completed and is being updated, we need to recalculate ratings
      // because the previous rating change was based on the old result
      if (wasCompleted && isBeingCompleted) {
        // Match result changed - recalculate this match's rating
        // The new change will be added to RatingHistory (previous change remains for history)
        const player1Won = finalPlayer1Sets > finalPlayer2Sets;
        const { processMatchRating } = await import('../services/matchRatingService');
        const actualMatchId = updatedMatch?.id ?? matchId;
        await processMatchRating(match.member1Id!, match.member2Id!, player1Won, tournamentId, actualMatchId, false, true);
      } else if (isBeingCompleted && !wasCompleted) {
        // Match is being completed for the first time - calculate ratings for THIS match only
        // Check if this is a BYE match - BYE matches should not affect ratings
        const isByeMatch = match.member1Id === 0 || match.member2Id === 0 || 
                          match.member2Id === null || 
                          (match as any).player1IsBye || (match as any).player2IsBye;
        
        if (!isByeMatch) {
          // Determine winner - must have valid scores and scores must be different
          if (finalPlayer1Sets === finalPlayer2Sets) {
            // Equal scores - cannot determine winner, skip rating calculation
            logger.warn('Match has equal scores, skipping rating calculation', { 
              tournamentId, 
              matchId, 
              player1Sets: finalPlayer1Sets, 
              player2Sets: finalPlayer2Sets 
            });
          } else {
            const winnerId = finalPlayer1Sets > finalPlayer2Sets ? match.member1Id :
                             finalPlayer2Sets > finalPlayer1Sets ? match.member2Id : null;
            
            if (winnerId && match.member1Id !== null && match.member2Id !== null && 
                match.member1Id !== 0 && match.member2Id !== 0) {
              // Calculate ratings for THIS match only using incremental calculation
              const { processMatchRating } = await import('../services/matchRatingService');
              const member1Id = match.member1Id!;
              const member2Id = match.member2Id!;
              const player1Won = winnerId === member1Id;
              
              // Verify winner determination is correct
              if ((player1Won && finalPlayer1Sets <= finalPlayer2Sets) || 
                  (!player1Won && finalPlayer2Sets <= finalPlayer1Sets)) {
                logger.error('Winner determination mismatch', {
                  tournamentId,
                  matchId,
                  member1Id,
                  member2Id,
                  player1Sets: finalPlayer1Sets,
                  player2Sets: finalPlayer2Sets,
                  winnerId,
                  player1Won
                });
                // Don't process rating if winner determination is wrong
              } else {
                // Process rating for THIS match only with incremental calculation
                // useIncrementalRating = true for PLAYOFF (uses current rating, not playerRatingAtTime)
                // Use the actual match ID (not bracketMatchId)
                const actualMatchId = updatedMatch?.id ?? matchId;
                await processMatchRating(member1Id, member2Id, player1Won, tournamentId, actualMatchId, false, true);
              }
            }
          }
        }
      }
    }
    // ROUND_ROBIN: Skip per-match rating calculation - will be calculated on tournament completion

    // For PLAYOFF tournaments, handle auto-advancement when match is completed
    if (match.tournament.type === 'PLAYOFF' && isBeingCompleted && !wasCompleted) {
      // Determine winner
      const winnerId = finalPlayer1Forfeit ? match.member2Id :
                       finalPlayer2Forfeit ? match.member1Id :
                       finalPlayer1Sets > finalPlayer2Sets ? match.member1Id :
                       finalPlayer2Sets > finalPlayer1Sets ? match.member2Id : null;
      
      if (winnerId && match.member1Id !== null && match.member2Id !== null) {
        // Advance winner to next round - use bracketMatchId
        const finalBracketMatchId = bracketMatchId || (updatedMatch as any).bracketMatchId;
        if (finalBracketMatchId && match.tournament.type === 'PLAYOFF') {
          const { advanceWinner } = await import('../services/playoffBracketService');
          const { tournamentCompleted } = await advanceWinner(tournamentId, finalBracketMatchId, winnerId);
          
          if (tournamentCompleted) {
            // Tournament is complete, recalculate rankings
            const { recalculateRankings } = await import('../services/rankingService');
            await recalculateRankings(tournamentId);
          }
        }
      }
    }

    // If tournament is completed, recalculate rankings
    if (match.tournament.status === 'COMPLETED') {
      const { recalculateRankings } = await import('../services/rankingService');
      await recalculateRankings(match.tournamentId);
    }

    // Invalidate cache and emit notifications
    await invalidateCacheAfterTournament(tournamentId);
    emitMatchUpdate(updatedMatch, tournamentId);
    emitCacheInvalidation(tournamentId);

    res.json(updatedMatch);
  } catch (error) {
    logger.error('Error updating match', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.tournamentId, matchId: req.params.matchId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tournament name and creation date
// Only Organizers can modify tournaments
router.patch('/:id/name', [
  body('name').optional().trim(),
  body('createdAt').optional().isISO8601(),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can modify tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const { name, createdAt } = req.body;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Only allow updating createdAt if tournament has no matches
    if (createdAt && tournament.matches.length > 0) {
      return res.status(400).json({ error: 'Cannot update creation date of tournament with matches' });
    }

    const updateData: any = {};
    if (name !== undefined) {
      updateData.name = name || null;
    }
    if (createdAt && tournament.matches.length === 0) {
      updateData.createdAt = new Date(createdAt);
    }

    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: updateData,
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    res.json(updatedTournament);
  } catch (error) {
    logger.error('Error updating tournament name', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete tournament
// Only Organizers can delete tournaments
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can delete tournaments' });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        matches: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot delete completed tournaments' });
    }

    // For playoff tournaments, only allow deletion if no matches have been played
    if (tournament.type === 'PLAYOFF' && tournament.matches.length > 0) {
      return res.status(400).json({ error: 'Cannot delete playoff tournament with matches. Use cancel instead.' });
    }

    // Delete tournament (matches and participants will be cascade deleted)
    await prisma.tournament.delete({
      where: { id: tournamentId },
    });

    res.json({ message: 'Tournament deleted successfully' });
  } catch (error) {
    logger.error('Error deleting tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete match
// Only Organizers can delete matches
router.delete('/:tournamentId/matches/:matchId', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can delete matches' });
    }

    const tournamentId = parseInt(req.params.tournamentId);
    const matchId = parseInt(req.params.matchId);
    
    if (isNaN(tournamentId) || isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid tournament or match ID' });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.tournamentId !== tournamentId) {
      return res.status(400).json({ error: 'Match does not belong to this tournament' });
    }

    const tournamentStatus = match.tournament.status;

    // Delete the match
    await prisma.match.delete({
      where: { id: matchId },
    });

    // If tournament is completed, recalculate rankings
    if (tournamentStatus === 'COMPLETED') {
      await recalculateRankings(tournamentId);
    }

    // Invalidate cache and emit notifications
    await invalidateCacheAfterTournament(tournamentId);
    emitCacheInvalidation(tournamentId);

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting match', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.tournamentId, matchId: req.params.matchId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete tournament
// Only Organizers can complete tournaments
router.patch('/:id/complete', async (req: AuthRequest, res) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can complete tournaments' });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Tournament is already completed' });
    }

    // Update tournament status
    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    // Recalculate rankings for all players (rankings are separate from ratings)
    await recalculateRankings(tournamentId);

    // For ROUND_ROBIN tournaments, calculate ratings and create rating history entries once after completion
    if (updatedTournament.type === 'ROUND_ROBIN') {
      const { createRatingHistoryForRoundRobinTournament } = await import('../services/usattRatingService');
      await createRatingHistoryForRoundRobinTournament(tournamentId);
    }

    res.json(updatedTournament);
  } catch (error) {
    logger.error('Error completing tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel playoff tournament
// Only Organizers can cancel tournaments
// Moves tournament to COMPLETED state, keeps all matches, affects ratings
router.patch('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can cancel tournaments' });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'PLAYOFF') {
      return res.status(400).json({ error: 'Only playoff tournaments can be cancelled' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Tournament is already completed' });
    }

    if (tournament.matches.length === 0) {
      return res.status(400).json({ error: 'Cannot cancel tournament with no matches. Use delete instead.' });
    }

    // Update tournament status to COMPLETED and mark as cancelled
    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: { 
        status: 'COMPLETED',
        cancelled: true,
      },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
      },
    });

    // Recalculate rankings for all players (rankings are separate from ratings)
    await recalculateRankings(tournamentId);

    // Invalidate cache and emit notifications
    await invalidateCacheAfterTournament(tournamentId);
    emitTournamentUpdate(updatedTournament);

    res.json(updatedTournament);
  } catch (error) {
    logger.error('Error cancelling tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bracket structure for a playoff tournament
router.get('/:id/bracket', async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const { getBracketStructure } = await import('../services/playoffBracketService');
    const bracket = await getBracketStructure(tournamentId);
    
    res.json(bracket);
  } catch (error: any) {
    logger.error('Error fetching bracket', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update bracket positions (for drag-and-drop)
// Only Organizers can modify tournaments
router.patch('/:id/bracket', [
  body('positions').isArray(),
  body('positions.*.round').isInt({ min: 1 }),
  body('positions.*.position').isInt({ min: 1 }),
  body('positions.*.memberId').optional().isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can modify tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'PLAYOFF') {
      return res.status(400).json({ error: 'Tournament is not a playoff tournament' });
    }

    const { positions } = req.body;

    // Batch fetch all bracket matches first
    const bracketMatches = await (prisma as any).bracketMatch.findMany({
        where: {
          tournamentId,
        OR: positions.map((pos: any) => ({
          round: pos.round,
          position: pos.position,
        })),
        },
      });

    // Create a map: `${round}-${position}` -> bracketMatch
    const bracketMatchMap = new Map<string, any>();
    bracketMatches.forEach((bm: any) => {
      bracketMatchMap.set(`${bm.round}-${bm.position}`, bm);
    });

    // Prepare all updates
    const updates: Array<Promise<any>> = [];
    for (const pos of positions) {
      const bracketMatch = bracketMatchMap.get(`${pos.round}-${pos.position}`);
      if (bracketMatch) {
        // Determine if player should be player1 or player2
        // For round 1, position 1 = player1, position 2 = player2, etc.
        const isPlayer1 = (pos.position - 1) % 2 === 0;
        
        if (isPlayer1) {
          updates.push(
            prisma.bracketMatch.update({
            where: { id: bracketMatch.id },
            data: { member1Id: pos.memberId || 0 },
            })
          );
        } else {
          updates.push(
            prisma.bracketMatch.update({
            where: { id: bracketMatch.id },
            data: { member2Id: pos.memberId || 0 },
            })
          );
        }
      }
    }

    // Execute all updates in parallel
    await Promise.all(updates);

    res.json({ message: 'Bracket positions updated successfully' });
  } catch (error) {
    logger.error('Error updating bracket positions', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tournament participants
// Only Organizers can modify tournaments
router.patch('/:id/participants', [
  body('participantIds').isArray({ min: 2 }),
  body('participantIds.*').isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can modify tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const { participantIds } = req.body;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: true,
        matches: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot modify participants of completed tournament' });
    }

    // Verify all participants are active
    const players = await prisma.member.findMany({
      where: {
        id: { in: participantIds },
        isActive: true,
      },
    });

    if (players.length !== participantIds.length) {
      return res.status(400).json({ error: 'Some participants are not active or not found' });
    }

    // Get current participant IDs
    const currentParticipantIds = tournament.participants.map(p => p.memberId);
    const newParticipantIds = new Set(participantIds);
    const participantsChanged = 
      currentParticipantIds.length !== participantIds.length ||
      currentParticipantIds.some((id: number) => !newParticipantIds.has(id)) ||
      participantIds.some((id: number) => !currentParticipantIds.includes(id));

    // Delete all existing participants
    await prisma.tournamentParticipant.deleteMany({
      where: { tournamentId },
    });

    // Create new participants with current ratings
    await prisma.tournamentParticipant.createMany({
      data: participantIds.map((memberId: number): { tournamentId: number; memberId: number; playerRatingAtTime: number | null } => {
        const player = players.find(p => p.id === memberId);
        return {
          tournamentId,
          memberId,
          playerRatingAtTime: player?.rating || null,
        };
      }),
    });

    // Check if this is a PLAYOFF tournament and seeding has occurred (matches exist)
    const hasSeeding = tournament.type === 'PLAYOFF' && tournament.matches.length > 0;

    // If participants changed and seeding has occurred, automatically reseed
    if (participantsChanged && hasSeeding) {
      try {
        // Import reseed logic
        const { generateSeeding, generateBracketPositions, calculateBracketSize } = await import('../services/playoffBracketService');
        const updatedTournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: {
            participants: {
              include: {
                member: true,
              },
            },
            matches: true,
          },
        }) as any;

        if (updatedTournament) {
          const seededPlayers = generateSeeding(updatedTournament.participants);
          const bracketSize = calculateBracketSize(updatedTournament.participants.length);
          const bracketPositions = generateBracketPositions(seededPlayers, bracketSize);

          // Update first round matches
          const firstRoundMatches = (updatedTournament.matches || []).filter((m: any) => (m.round || 1) === 1);
          firstRoundMatches.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

          const matchesToUpdate: Array<{ matchId: number; member1Id: number; member2Id: number }> = [];
          const matchesToDelete: number[] = [];
          const matchesToCreate: Array<{ member1Id: number; member2Id: number; position: number }> = [];

          for (let i = 0; i < bracketSize; i += 2) {
            const member1Id = bracketPositions[i];
            const member2Id = bracketPositions[i + 1];
            const matchPosition = (i / 2) + 1;
            const match = firstRoundMatches.find((m: any) => (m.position || 0) === matchPosition);

            if (member1Id !== null && member2Id !== null) {
              if (match) {
                matchesToUpdate.push({
                  matchId: match.id,
                  member1Id: member1Id,
                  member2Id: member2Id,
                });
              } else {
                matchesToCreate.push({
                  member1Id: member1Id,
                  member2Id: member2Id,
                  position: matchPosition,
                });
              }
            } else {
              if (match) {
                matchesToDelete.push(match.id);
              }
            }
          }

          // Execute updates
          for (const matchUpdate of matchesToUpdate) {
            await prisma.match.update({
              where: { id: matchUpdate.matchId },
              data: {
                member1Id: matchUpdate.member1Id,
                member2Id: matchUpdate.member2Id,
              },
            });
          }

          for (const matchCreate of matchesToCreate) {
            const nextRoundPosition = Math.floor((matchCreate.position - 1) / 2) + 1;
            await prisma.match.create({
              data: {
                tournamentId,
                member1Id: matchCreate.member1Id,
                member2Id: matchCreate.member2Id,
                player1Sets: 0,
                player2Sets: 0,
                round: 1,
                position: matchCreate.position,
                nextMatchPosition: nextRoundPosition,
              } as any,
            });
          }

          for (const matchId of matchesToDelete) {
            await prisma.match.delete({
              where: { id: matchId },
            });
          }
        }
      } catch (reseedError) {
        logger.error('Error auto-reseeding after participant change', { 
          error: reseedError instanceof Error ? reseedError.message : String(reseedError), 
          tournamentId 
        });
        // Continue anyway - participants are updated, reseeding can be done manually
      }
    }

    // Return updated tournament
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        bracketMatches: {
          orderBy: [
            { round: 'asc' },
            { position: 'asc' },
          ],
        },
      },
    });

    res.json(updatedTournament);
  } catch (error) {
    logger.error('Error updating tournament participants', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Preview bracket positions (for client-side preview before tournament creation)
// Preview bracket - Only Organizers can preview brackets (as part of tournament creation)
router.post('/preview-bracket', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can preview brackets' });
    }
    const { participantIds, numSeeds } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length < 2) {
      return res.status(400).json({ error: 'participantIds must be an array with at least 2 player IDs' });
    }

    // Fetch players with their ratings
    const players = await prisma.member.findMany({
      where: {
        id: { in: participantIds },
      },
      select: {
        id: true,
        rating: true,
      },
    });

    if (players.length !== participantIds.length) {
      return res.status(400).json({ error: 'Some player IDs not found' });
    }

    // Convert to format expected by generateSeeding
    const participants = players.map(p => ({
      memberId: p.id,
      playerRatingAtTime: p.rating,
    }));

    // Generate bracket positions using server-side logic
    const { generateSeeding, generateBracketPositions, calculateBracketSize } = await import('../services/playoffBracketService');
    const seededPlayers = generateSeeding(participants);
    const bracketSize = calculateBracketSize(participants.length);
    const numSeedsToUse = numSeeds !== undefined ? parseInt(numSeeds) : undefined;
    
    const bracketPositions = generateBracketPositions(seededPlayers, bracketSize, numSeedsToUse);

    res.json({ bracketPositions, bracketSize });
  } catch (error) {
    logger.error('Error generating bracket preview', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Re-seed bracket by ratings
// Only Organizers can reseed brackets
router.post('/:id/reseed', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can reseed brackets' });
    }

    const tournamentId = parseInt(req.params.id);
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true, // Get all matches to understand structure
      },
    }) as any;

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'PLAYOFF') {
      return res.status(400).json({ error: 'Tournament is not a playoff tournament' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot reseed completed tournament' });
    }

    // Get numSeeds from request body, or calculate default
    const numSeeds = req.body.numSeeds !== undefined ? parseInt(req.body.numSeeds) : undefined;

    // Generate new seeding
    const { generateSeeding, generateBracketPositions, calculateBracketSize } = await import('../services/playoffBracketService');
    const seededPlayers = generateSeeding(tournament.participants);
    const bracketSize = calculateBracketSize(tournament.participants.length);
    let bracketPositions = generateBracketPositions(seededPlayers, bracketSize, numSeeds);
    
    // CRITICAL: Validate and fix any double BYEs before proceeding
    // Run validation multiple times to catch all edge cases
    for (let validationPass = 0; validationPass < 5; validationPass++) {
      let foundDoubleBye = false;
      for (let i = 0; i < bracketSize; i += 2) {
        const pos1 = i;
        const pos2 = i + 1;
        if (bracketPositions[pos1] === null && bracketPositions[pos2] === null) {
          // Both are BYEs - this is invalid! We MUST fix this
          foundDoubleBye = true;
          
          // Find the lowest unplaced player and place them in pos1
          let playerToPlace: number | null = null;
          
          // First, check if there are any unplaced players
          for (let j = seededPlayers.length - 1; j >= 0; j--) {
            const memberId = seededPlayers[j];
            if (!bracketPositions.includes(memberId)) {
              playerToPlace = memberId;
              break;
            }
          }
          
          // If no unplaced players, find the lowest rated player who is not in a BYE-protected position
          const numByes = bracketSize - seededPlayers.length;
          if (playerToPlace === null) {
            for (let j = seededPlayers.length - 1; j >= 0; j--) {
              const memberId = seededPlayers[j];
              const playerPos = bracketPositions.indexOf(memberId);
              if (playerPos !== -1 && playerPos !== pos1 && playerPos !== pos2) {
                // Check if this player is in a BYE-protected position (top numByes)
                if (j >= numByes) {
                  // This is not a BYE-protected player, we can move them
                  playerToPlace = memberId;
                  // Remove them from their current position
                  bracketPositions[playerPos] = null;
                  break;
                }
              }
            }
          }
          
          // If still no player found, find ANY player to break the double BYE
          if (playerToPlace === null) {
            for (let j = 0; j < seededPlayers.length; j++) {
              const memberId = seededPlayers[j];
              const playerPos = bracketPositions.indexOf(memberId);
              if (playerPos !== -1 && playerPos !== pos1 && playerPos !== pos2) {
                // Move this player to pos1
                bracketPositions[playerPos] = null;
                playerToPlace = memberId;
                break;
              }
            }
          }
          
          // Place the player in pos1 to break the double BYE
          if (playerToPlace !== null) {
            bracketPositions[pos1] = playerToPlace;
          }
        }
      }
      
      // If no double BYEs were found in this pass, we're done
      if (!foundDoubleBye) {
        break;
      }
    }
    
    // Final check - if there are still double BYEs, log an error and fix it
    for (let i = 0; i < bracketSize; i += 2) {
      const pos1 = i;
      const pos2 = i + 1;
      if (bracketPositions[pos1] === null && bracketPositions[pos2] === null) {
        logger.warn('CRITICAL: Double BYE found in reseed', { pos1, pos2, tournamentId: tournament.id });
        // Emergency fix: place the first available player
        for (let j = 0; j < seededPlayers.length; j++) {
          const memberId = seededPlayers[j];
          if (!bracketPositions.includes(memberId)) {
            bracketPositions[pos1] = memberId;
            break;
          }
        }
        // If all players are placed, move the last player
        if (bracketPositions[pos1] === null && bracketPositions[pos2] === null && seededPlayers.length > 0) {
          const lastPlayer = seededPlayers[seededPlayers.length - 1];
          const lastPlayerPos = bracketPositions.indexOf(lastPlayer);
          if (lastPlayerPos !== -1 && lastPlayerPos !== pos1 && lastPlayerPos !== pos2) {
            bracketPositions[lastPlayerPos] = null;
            bracketPositions[pos1] = lastPlayer;
          }
        }
      }
    }

    // Get all first round bracket matches
    const firstRoundBracketMatches = await (prisma as any).bracketMatch.findMany({
      where: {
        tournamentId,
        round: 1,
      },
      include: {
        match: true,
      },
      orderBy: {
        position: 'asc',
      },
    });
    
    // Update first round bracket matches
    // BYEs are represented as memberId = 0 in bracketMatches (no Match records created)
    for (let i = 0; i < bracketSize; i += 2) {
      let member1Id: number | null = bracketPositions[i];
      let member2Id: number | null = bracketPositions[i + 1];
      const matchPosition = (i / 2) + 1;

      // CRITICAL: Never allow both players to be null (double BYE)
      // This should have been fixed in the validation above, but double-check here
      if (member1Id === null && member2Id === null) {
        logger.warn('CRITICAL: Double BYE detected during reseed update', { matchPosition, bracketPosition1: i, bracketPosition2: i+1, tournamentId: tournament.id });
        // Find a player to place - this should never happen if validation worked
        for (let j = 0; j < seededPlayers.length; j++) {
          const memberId = seededPlayers[j];
          // Check if this player is already in the bracket
          const playerIndex = bracketPositions.indexOf(memberId);
          if (playerIndex === -1) {
            // This player is not in the bracket, place them in member1Id
            member1Id = memberId;
            bracketPositions[i] = memberId;
            break;
          } else if (playerIndex !== i && playerIndex !== i + 1) {
            // This player is elsewhere, move them here as emergency fix
            bracketPositions[playerIndex] = null;
            member1Id = memberId;
            bracketPositions[i] = memberId;
            break;
          }
        }
      }

      const bracketMatch = firstRoundBracketMatches.find((bm: any) => bm.position === matchPosition);
      
      if (!bracketMatch) {
        logger.error('BracketMatch not found for position', { matchPosition, tournamentId });
        continue;
      }

      // Convert null to 0 for BYEs in bracketMatch
      const updatePlayer1Id = member1Id === null ? 0 : member1Id;
      const updatePlayer2Id = member2Id === null ? 0 : member2Id;
      
      // Check if this is a BYE match (member2Id === 0 or member1Id === 0)
      const isBye = updatePlayer1Id === 0 || updatePlayer2Id === 0;
      
      // Update the bracketMatch
      await (prisma as any).bracketMatch.update({
        where: { id: bracketMatch.id },
        data: {
          member1Id: updatePlayer1Id === 0 ? 0 : updatePlayer1Id, // Store 0 for BYE
          member2Id: updatePlayer2Id === 0 ? 0 : updatePlayer2Id, // Store 0 for BYE
        },
      });
      
      // If there's an existing Match record and this became a BYE, delete it
      if (bracketMatch.match && isBye) {
        await prisma.match.delete({
          where: { id: bracketMatch.match.id },
        });
      }
      
      // If both players exist and there's no Match record, we'll need to create one later
      // But for reseed, we just update the bracket structure, not create matches
      // Matches are created when scores are entered
    }
    
    // Handle BYE promotions: if a BYE was created, promote the player to next round
    // This replicates the logic from createPlayoffBracketWithPositions
    for (let i = 0; i < bracketSize; i += 2) {
      const member1Id = bracketPositions[i];
      const member2Id = bracketPositions[i + 1];
      const hasBye = member2Id === null && member1Id !== null;
      
      if (hasBye && member1Id) {
        const matchPosition = (i / 2) + 1;
        const bracketMatch = firstRoundBracketMatches.find((bm: any) => bm.position === matchPosition);
        
        if (bracketMatch && bracketMatch.nextMatchId) {
          // Get the next bracket match
          const nextBracketMatch = await (prisma as any).bracketMatch.findUnique({
            where: { id: bracketMatch.nextMatchId },
          });
          
          if (nextBracketMatch) {
            // Determine if winner goes to player1 or player2 slot in next match
            const isPlayer1Slot = (matchPosition - 1) % 2 === 0;
            
            // Directly update the next round's BracketMatch - no Match record needed for BYEs
            if (isPlayer1Slot) {
              await (prisma as any).bracketMatch.update({
                where: { id: nextBracketMatch.id },
                data: { member1Id: member1Id },
              });
            } else {
              await (prisma as any).bracketMatch.update({
                where: { id: nextBracketMatch.id },
                data: { member2Id: member1Id },
              });
            }
          }
        }
      }
    }

    res.json({ message: 'Bracket reseeded successfully' });
  } catch (error) {
    logger.error('Error reseeding bracket', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


