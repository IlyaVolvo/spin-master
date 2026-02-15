import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { TournamentType } from '@prisma/client';
import { recalculateRankings } from '../services/rankingService';
import { logger } from '../utils/logger';
import { invalidateCacheAfterTournament, invalidateTournamentCache } from '../services/cacheService';
import { emitCacheInvalidation, emitTournamentUpdate, emitMatchUpdate } from '../services/socketService';
import bcrypt from 'bcryptjs';
import { tournamentPluginRegistry } from '../plugins/TournamentPluginRegistry';

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
      where: { parentTournamentId: null }, // Only top-level tournaments; children are nested via enrichment
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        swissData: true,
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

      // Apply post-ratings to completed tournaments and include type-specific data using plugins
      const tournamentsWithPostRatings = await Promise.all(tournaments.map(async (tournament) => {
        const plugin = tournamentPluginRegistry.get(tournament.type);

        return tournament.status !== 'COMPLETED'
          ? await plugin.enrichActiveTournament({
              tournament,
              prisma,
            })
          : await plugin.enrichCompletedTournament({
              tournament,
              postRatingMap,
              prisma,
            });
      }));

      res.json(tournamentsWithPostRatings);
    } else {
      // No completed tournaments - use plugin enrichment for active tournaments
      const enrichedTournaments = await Promise.all(tournaments.map(async (tournament) => {
        const plugin = tournamentPluginRegistry.get(tournament.type);
        
        return await plugin.enrichActiveTournament({
          tournament,
          prisma,
        });
      }));
      res.json(enrichedTournaments);
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
      where: { status: 'ACTIVE', parentTournamentId: null }, // Only top-level; children nested via enrichment
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          include: {
            member: true,
          },
        },
        matches: true,
        swissData: true,
      },
    });

    // Use plugin-based enrichment for active tournaments
    const enrichedTournaments = await Promise.all(tournaments.map(async (tournament) => {
      const plugin = tournamentPluginRegistry.get(tournament.type);
      
      return await plugin.enrichActiveTournament({
        tournament,
        prisma,
      });
    }));

    res.json(enrichedTournaments);
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
        swissData: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Use plugin-based enrichment
    const plugin = tournamentPluginRegistry.get(tournament.type);
    const enrichedTournament = await plugin.enrichActiveTournament({ tournament, prisma });

    res.json(enrichedTournament);
  } catch (error) {
    logger.error('Error fetching tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start a new tournament
// Only Organizers can create tournaments
// Validation is kept generic - type-specific validation delegated to plugins
router.post('/', [
  body('name').optional().trim(),
  body('participantIds').isArray({ min: 2 }),
  body('participantIds.*').isInt({ min: 1 }),
  body('type').optional().isString(), // Type validated against plugin registry in route handler
  // Type-specific fields (bracketPositions, roundRobinSize, etc.) are not validated here
  // Plugins validate their own required fields via plugin.validateSetup() or plugin.createTournament()
], async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can create tournaments' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in tournament creation', { 
        errors: errors.array(),
        bodyType: req.body?.type,
        bodyKeys: Object.keys(req.body || {})
      });
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, participantIds, type, bracketPositions, roundRobinSize, groups, additionalData } = req.body;
    
    // Get valid types from plugin registry
    const validTypes = tournamentPluginRegistry.getTypes();
    
    // Log the received type for debugging
    logger.debug('Tournament creation request', { 
      type, 
      typeValue: type,
      typeType: typeof type,
      validTypes
    });
    
    // Tournament type is required
    if (!type) {
      return res.status(400).json({ error: 'Tournament type is required' });
    }
    
    // Validate tournament type using plugin registry
    if (!tournamentPluginRegistry.isRegistered(type)) {
      return res.status(400).json({ error: `Invalid tournament type: ${type}. Only ${validTypes.join(', ')} are allowed.` });
    }
    
    // Get plugin for validation and creation
    const plugin = tournamentPluginRegistry.get(type);

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
    if (!tournamentName) {
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

    // Delegate tournament creation to plugin
    const createdTournament = await plugin.createTournament({
      name: tournamentName,
      participantIds,
      players,
      bracketPositions,
      roundRobinSize,
      groups,
      additionalData,
      prisma,
    });

    res.status(201).json(createdTournament);
  } catch (error) {
    logger.error('Error creating tournament', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create multiple tournaments at once
// Bulk create tournaments - Only Organizers can create tournaments
// Type validation delegated to plugin registry in route handler
router.post('/bulk', [
  body('tournaments').isArray({ min: 1 }),
  body('tournaments.*.name').optional().trim(),
  body('tournaments.*.participantIds').isArray({ min: 2 }),
  body('tournaments.*.participantIds.*').isInt({ min: 1 }),
  body('tournaments.*.type').optional().isString(), // Type validated against plugin registry in handler
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
      tournaments.map((tournamentData: { name?: string; participantIds: number[]; type: TournamentType }) => {
        // Validate tournament type using plugin registry
        if (!tournamentPluginRegistry.isRegistered(tournamentData.type)) {
          throw new Error(`Invalid tournament type: ${tournamentData.type}. Only registered types are allowed.`);
        }
        
        return prisma.tournament.create({
          data: {
            name: tournamentData.name || `Tournament ${new Date().toLocaleDateString()}`,
            type: tournamentData.type,
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

// Create a standalone match directly with final scores (no tournament, tournamentId = null)
// Organizers can create matches for any pair of players
// Non-organizers can create matches for themselves (need opponent's password confirmation)
router.post('/matches/create', [
  body('member1Id').toInt().isInt({ min: 1 }),
  body('member2Id').toInt().isInt({ min: 1 }),
  body('player1Sets').toInt().isInt({ min: 0 }),
  body('player2Sets').toInt().isInt({ min: 0 }),
  body('opponentPassword').optional().trim(), // Required for non-organizers
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Match creation validation failed', { errors: errors.array(), body: req.body });
      return res.status(400).json({ errors: errors.array() });
    }

    const { member1Id, member2Id, player1Sets, player2Sets, opponentPassword } = req.body;
    const currentMemberId = req.memberId || req.member?.id;

    if (!currentMemberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is organizer
    const hasOrganizerAccess = await isOrganizer(req);

    // If not organizer, verify they're creating a match for themselves
    if (!hasOrganizerAccess) {
      const isPlayer1 = currentMemberId === member1Id;
      const isPlayer2 = currentMemberId === member2Id;
      
      if (!isPlayer1 && !isPlayer2) {
        return res.status(403).json({ error: 'You can only create matches for yourself' });
      }

      // Determine opponent ID
      const opponentId = isPlayer1 ? member2Id : member1Id;
      
      // Verify opponent's password
      if (!opponentPassword) {
        return res.status(400).json({ error: 'Opponent password confirmation is required' });
      }

      const opponent = await prisma.member.findUnique({
        where: { id: opponentId },
        select: { password: true, isActive: true },
      });

      if (!opponent || !opponent.isActive) {
        return res.status(404).json({ error: 'Opponent not found or inactive' });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(opponentPassword, opponent.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid opponent password' });
      }
    }

    // Validate players are different
    if (member1Id === member2Id) {
      return res.status(400).json({ error: 'Players must be different' });
    }

    // Validate scores - must have a winner (no ties)
    if (player1Sets === player2Sets) {
      return res.status(400).json({ error: 'Match cannot end in a tie' });
    }

    // Verify both players are active
    const players = await prisma.member.findMany({
      where: {
        id: { in: [member1Id, member2Id] },
        isActive: true,
      },
    });

    if (players.length !== 2) {
      return res.status(400).json({ error: 'Both players must be active' });
    }

    const player1 = players.find(p => p.id === member1Id);
    const player2 = players.find(p => p.id === member2Id);

    if (!player1 || !player2) {
      return res.status(400).json({ error: 'Players not found' });
    }

    // Use provided scores
    const finalPlayer1Sets = player1Sets ?? 0;
    const finalPlayer2Sets = player2Sets ?? 0;

    // Create standalone match with null tournamentId
    const match = await prisma.match.create({
      data: {
        tournamentId: null,
        member1Id,
        member2Id,
        player1Sets: finalPlayer1Sets,
        player2Sets: finalPlayer2Sets,
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    // Process rating changes (null tournamentId = standalone match, uses current ratings)
    const winnerId = finalPlayer1Sets > finalPlayer2Sets ? member1Id :
                     finalPlayer2Sets > finalPlayer1Sets ? member2Id : null;
    
    if (winnerId && member1Id !== null && member2Id !== null) {
      const { processMatchRating } = await import('../services/matchRatingService');
      const player1Won = winnerId === member1Id;
      await processMatchRating(member1Id, member2Id, player1Won, null, match.id, false, true);
    }

    // Emit match update notification
    emitMatchUpdate(match, null);

    logger.info('Standalone match created successfully', { 
      matchId: match.id,
      member1Id,
      member2Id,
      player1Sets: finalPlayer1Sets,
      player2Sets: finalPlayer2Sets
    });

    res.status(201).json({
      match,
    });
  } catch (error) {
    logger.error('Error creating standalone match', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });
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
    // Delegate rating calculation to plugin
    // Forfeited matches should not change ratings
    // Note: BYE matches are already rejected above, so we know this is not a BYE match
    
    if (!finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      // Determine winner
      const winnerId = finalPlayer1Sets > finalPlayer2Sets ? member1Id :
                       finalPlayer2Sets > finalPlayer1Sets ? member2Id : null;
      
      if (winnerId && member1Id !== null && member2Id !== null && 
          member1Id !== 0 && member2Id !== 0) {
        // Notify plugin of match rating calculation - plugin decides if/how to handle it
        const plugin = tournamentPluginRegistry.get(tournament.type);
        if (plugin.onMatchRatingCalculation) {
          await plugin.onMatchRatingCalculation({
            tournament,
            match,
            winnerId,
            prisma,
          });
        }
      }
    }

    // Invalidate cache for this tournament
    invalidateTournamentCache(tournamentId);
    emitMatchUpdate(match, tournamentId);
    emitCacheInvalidation(tournamentId);

    res.status(201).json(match);
  } catch (error) {
    logger.error('Error creating match', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generic match update endpoint - single entry point for all tournament types
// matchId can be: a real Match ID, a bracketMatchId (for playoffs), or 0 (for new match creation)
// The plugin's updateMatch() handles the type-specific logic
// Only Organizers can update matches
router.patch('/:tournamentId/matches/:matchId', [
  body('member1Id').optional().isInt({ min: 1 }),
  body('member2Id').optional().isInt({ min: 1 }),
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

    const { member1Id, member2Id, player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
    const tournamentId = parseInt(req.params.tournamentId);
    const matchId = parseInt(req.params.matchId);
    
    if (isNaN(tournamentId) || isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid tournament or match ID' });
    }

    // Validate forfeit logic: exactly one player can forfeit
    if (player1Forfeit === true && player2Forfeit === true) {
      return res.status(400).json({ error: 'Only one player can forfeit' });
    }

    // Validate scores: cannot be equal unless it's a forfeit
    if (!player1Forfeit && !player2Forfeit) {
      const p1Sets = player1Sets ?? 0;
      const p2Sets = player2Sets ?? 0;
      if (p1Sets === p2Sets) {
        return res.status(400).json({ error: 'Scores cannot be equal. One player must win.' });
      }
    }

    // Get tournament with participants and plugin
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Tournament is not active' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);

    // Process forfeit scores
    let finalPlayer1Sets = player1Sets ?? 0;
    let finalPlayer2Sets = player2Sets ?? 0;
    let finalPlayer1Forfeit = player1Forfeit || false;
    let finalPlayer2Forfeit = player2Forfeit || false;

    if (finalPlayer1Forfeit) {
      finalPlayer1Sets = 0;
      finalPlayer2Sets = 1;
      finalPlayer2Forfeit = false;
    } else if (finalPlayer2Forfeit) {
      finalPlayer1Sets = 1;
      finalPlayer2Sets = 0;
      finalPlayer1Forfeit = false;
    }
    
    // Delegate match update to plugin
    const result = await plugin.updateMatch({
      matchId,
      tournamentId,
      member1Id,
      member2Id,
      player1Sets: finalPlayer1Sets,
      player2Sets: finalPlayer2Sets,
      player1Forfeit: finalPlayer1Forfeit,
      player2Forfeit: finalPlayer2Forfeit,
      prisma,
      userId: req.userId ?? req.memberId,
    });
    
    const updatedMatch = result.match;

    // Calculate match ratings if plugin supports per-match rating calculation
    if (plugin.onMatchRatingCalculation && updatedMatch && !finalPlayer1Forfeit && !finalPlayer2Forfeit) {
      const winnerId = finalPlayer1Sets > finalPlayer2Sets ? updatedMatch.member1Id :
                       finalPlayer2Sets > finalPlayer1Sets ? updatedMatch.member2Id : null;
      if (winnerId) {
        await plugin.onMatchRatingCalculation({
          tournament,
          match: updatedMatch,
          winnerId,
          prisma,
        });
      }
    }

    // Handle tournament completion
    if (result.tournamentStateChange?.shouldMarkComplete) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED', recordedAt: new Date() },
      });

      // Calculate completion ratings if plugin supports it
      if (plugin.onTournamentCompletionRatingCalculation) {
        await plugin.onTournamentCompletionRatingCalculation({ tournament, prisma });
      }

      // Recalculate rankings
      const { recalculateRankings } = await import('../services/rankingService');
      await recalculateRankings(tournamentId);

      // Propagate to parent tournament if this is a child
      if (tournament.parentTournamentId) {
        const parentTournament = await prisma.tournament.findUnique({
          where: { id: tournament.parentTournamentId },
          include: { 
            childTournaments: {
              include: { participants: { include: { member: true } }, matches: true },
            },
            participants: { include: { member: true } },
          },
        });
        
        if (parentTournament) {
          const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);
          if (parentPlugin.onChildTournamentCompleted) {
            const parentResult = await parentPlugin.onChildTournamentCompleted({
              parentTournament,
              childTournament: tournament,
              prisma,
            });
            
            if (parentResult.shouldMarkComplete) {
              await prisma.tournament.update({
                where: { id: parentTournament.id },
                data: { status: 'COMPLETED', recordedAt: new Date() },
              });
            }
          }
        }
      }
    }
    
    // Calculate per-match ratings if match has a winner
    if (updatedMatch.winnerId && plugin.onMatchRatingCalculation) {
      await plugin.onMatchRatingCalculation({
        tournament,
        match: updatedMatch,
        winnerId: updatedMatch.winnerId,
        prisma,
      });
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

// Delete tournament route removed — use PATCH /:id/cancel instead

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

    const tournamentStatus = match.tournament?.status;

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

    // Notify plugin of tournament completion - plugin decides if/how to calculate ratings
    const plugin = tournamentPluginRegistry.get(updatedTournament.type);
    if (plugin.onTournamentCompletionRatingCalculation) {
      await plugin.onTournamentCompletionRatingCalculation({ tournament: updatedTournament, prisma });
    }

    res.json(updatedTournament);
  } catch (error) {
    logger.error('Error completing tournament', { error: error instanceof Error ? error.message : String(error), tournamentId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel tournament
// Only Organizers can cancel tournaments
// For ACTIVE tournaments:
//   - No matches played → physically deletes the tournament
//   - Matches played → marks as cancelled + COMPLETED, preserves matches
// For compound tournaments: propagates to all children automatically
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
      include: {
        matches: true,
        childTournaments: {
          include: {
            matches: true,
            childTournaments: { include: { matches: true } },
          },
        },
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Tournament is already completed' });
    }

    // Check if plugin allows cancellation
    const plugin = tournamentPluginRegistry.get(tournament.type);
    if (!plugin.canCancel(tournament)) {
      return res.status(400).json({ error: 'This tournament type cannot be cancelled' });
    }

    // Determine if this is a compound tournament (has children)
    const isCompound = tournament.childTournaments && tournament.childTournaments.length > 0;

    // Count total matches across the tournament (including children for compound)
    let totalMatches = tournament.matches.length;
    if (isCompound) {
      for (const child of tournament.childTournaments) {
        totalMatches += child.matches.length;
        // Also count grandchildren (e.g. prelim groups under compound)
        if (child.childTournaments) {
          for (const grandchild of (child as any).childTournaments) {
            totalMatches += grandchild.matches?.length ?? 0;
          }
        }
      }
    }

    if (totalMatches === 0) {
      // No matches anywhere → physically delete the entire tournament tree
      // Cascade delete handles children, matches, participants, bracket matches, etc.
      await prisma.tournament.delete({
        where: { id: tournamentId },
      });

      // Invalidate cache
      await invalidateCacheAfterTournament(tournamentId);

      return res.json({ message: 'Tournament deleted (no matches were played)', deleted: true });
    }

    // Has matches → cancel (mark as cancelled + COMPLETED)
    // For compound tournaments: cancel/delete each child first
    if (isCompound) {
      for (const child of tournament.childTournaments) {
        if (child.status === 'COMPLETED') continue; // already done

        if (child.matches.length === 0) {
          // Child has no matches → delete it
          await prisma.tournament.delete({ where: { id: child.id } });
        } else {
          // Child has matches → cancel it
          await prisma.tournament.update({
            where: { id: child.id },
            data: { status: 'COMPLETED', cancelled: true },
          });
        }
      }
    }

    // Cancel the root tournament
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
        childTournaments: {
          include: {
            participants: { include: { member: true } },
            matches: true,
          },
        },
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

    // If participants changed, delegate to plugin for any necessary updates (e.g., reseeding)
    if (participantsChanged) {
      try {
        const plugin = tournamentPluginRegistry.get(tournament.type);
        if (plugin.handlePluginRequest) {
          await plugin.handlePluginRequest({
            method: 'POST',
            resource: 'participants-updated',
            tournamentId,
            data: { participantIds },
            prisma,
          });
        }
      } catch (pluginError) {
        logger.error('Error handling participant update in plugin', { 
          error: pluginError instanceof Error ? pluginError.message : String(pluginError), 
          tournamentId,
          tournamentType: tournament.type
        });
        // Continue anyway - participants are updated, plugin-specific updates can be done manually
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

// Preview tournament setup (for client-side preview before tournament creation)
// Generic endpoint that delegates to tournament type plugins
router.post('/preview', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user has ORGANIZER role
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can preview tournament setup' });
    }
    
    const { tournamentType, participantIds, ...additionalData } = req.body;

    if (!tournamentType) {
      return res.status(400).json({ error: 'tournamentType is required' });
    }

    if (!Array.isArray(participantIds) || participantIds.length < 2) {
      return res.status(400).json({ error: 'participantIds must be an array with at least 2 player IDs' });
    }

    // Validate tournament type
    if (!tournamentPluginRegistry.isRegistered(tournamentType)) {
      return res.status(400).json({ error: `Invalid tournament type: ${tournamentType}` });
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

    // Delegate to plugin
    const plugin = tournamentPluginRegistry.get(tournamentType);
    if (!plugin.handlePluginRequest) {
      return res.status(400).json({ error: `Tournament type ${tournamentType} does not support preview` });
    }

    const result = await plugin.handlePluginRequest({
      method: 'POST',
      resource: 'preview',
      tournamentId: 0, // No tournament ID for preview
      data: { participantIds, players, ...additionalData },
      prisma,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error generating tournament preview', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
// Generic plugin-specific resource handler
// Allows tournament types to define their own custom endpoints
// Examples: GET /tournaments/:id/plugin/bracket, POST /tournaments/:id/plugin/reseed
const handlePluginRequest = async (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  req: AuthRequest,
  res: Response
) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const resource = req.params.resource;
    
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }
    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);
    
    if (!plugin.handlePluginRequest) {
      return res.status(404).json({ 
        error: `Tournament type '${tournament.type}' does not support custom resources` 
      });
    }
    
    const result = await plugin.handlePluginRequest({
      method,
      resource,
      tournamentId,
      data: req.body,
      query: req.query,
      prisma,
      userId: req.userId ?? req.memberId,
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Error handling plugin request', { 
      error: error instanceof Error ? error.message : String(error),
      tournamentId: req.params.id,
      resource: req.params.resource,
      method,
    });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
};

// Register generic plugin resource routes
router.get('/:id/plugin/:resource', (req, res) => handlePluginRequest('GET', req, res));
router.post('/:id/plugin/:resource', (req, res) => handlePluginRequest('POST', req, res));
router.patch('/:id/plugin/:resource', (req, res) => handlePluginRequest('PATCH', req, res));
router.delete('/:id/plugin/:resource', (req, res) => handlePluginRequest('DELETE', req, res));

export default router;


