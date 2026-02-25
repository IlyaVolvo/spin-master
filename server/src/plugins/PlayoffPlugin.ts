import { TournamentEnrichmentContext, EnrichedTournament, TournamentCreationContext } from './TournamentPlugin';
import { BaseTournamentPlugin } from './BaseTournamentPlugin';

async function attachRatingHistoryToBracketMatches(
  bracketMatches: any[], 
  tournamentParticipants: any[], 
  tournamentId: number,
  prisma: any
) {
  const participantMap = new Map<number, any>();
  if (tournamentParticipants) {
    tournamentParticipants.forEach((p: any) => {
      participantMap.set(p.memberId, p);
    });
  }

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

  const allRatingHistory = matchIds.length > 0
    ? await prisma.ratingHistory.findMany({
        where: {
          matchId: { in: matchIds },
          memberId: { in: Array.from(allMemberIds) },
        },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  const ratingHistoryMap = new Map<string, Map<number, any>>();
  for (const history of allRatingHistory) {
    const matchKey = history.matchId?.toString() || '';
    if (!ratingHistoryMap.has(matchKey)) {
      ratingHistoryMap.set(matchKey, new Map());
    }
    ratingHistoryMap.get(matchKey)!.set(history.memberId, history);
  }

  for (const bracketMatch of bracketMatches) {
    const member1Id = bracketMatch.member1Id;
    const member2Id = bracketMatch.member2Id;
    
    if (member1Id === 0 || member1Id === null || member2Id === 0 || member2Id === null) {
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

    if (!bracketMatch.match) {
      const participant1 = participantMap.get(member1Id);
      const participant2 = participantMap.get(member2Id);
      
      bracketMatch.player1RatingAtTime = participant1?.playerRatingAtTime ?? null;
      bracketMatch.player2RatingAtTime = participant2?.playerRatingAtTime ?? null;
      continue;
    }

    const matchId = bracketMatch.match.id;
    const matchHistoryMap = ratingHistoryMap.get(matchId.toString());
    
    const member1History = matchHistoryMap?.get(member1Id);
    const member2History = matchHistoryMap?.get(member2Id);
    
    if (member1History) {
      const ratingBefore = member1History.rating - member1History.ratingChange;
      bracketMatch.match.player1RatingBefore = ratingBefore;
      bracketMatch.match.player1RatingChange = member1History.ratingChange;
    } else {
      bracketMatch.match.player1RatingBefore = null;
      bracketMatch.match.player1RatingChange = null;
    }
    
    if (member2History) {
      const ratingBefore = member2History.rating - member2History.ratingChange;
      bracketMatch.match.player2RatingBefore = ratingBefore;
      bracketMatch.match.player2RatingChange = member2History.ratingChange;
    } else {
      bracketMatch.match.player2RatingBefore = null;
      bracketMatch.match.player2RatingChange = null;
    }

    const participant1 = participantMap.get(member1Id);
    const participant2 = participantMap.get(member2Id);
    bracketMatch.player1RatingAtTime = participant1?.playerRatingAtTime ?? null;
    bracketMatch.player2RatingAtTime = participant2?.playerRatingAtTime ?? null;
  }
}

export class PlayoffPlugin extends BaseTournamentPlugin {
  type = 'PLAYOFF';
  isBasic = true;

  async createTournament(context: TournamentCreationContext): Promise<any> {
    const { name, participantIds, players, prisma, additionalData, bracketPositions: bracketPositionsFromBody } = context as any;
    
    const bracketPositions = additionalData?.bracketPositions || bracketPositionsFromBody || [];
    
    // Create tournament
    const tournament = await prisma.tournament.create({
      data: {
        name,
        type: 'PLAYOFF',
        status: 'ACTIVE',
        participants: {
          create: participantIds.map((memberId: number) => {
            const player = players.find((p: any) => p.id === memberId);
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
        matches: true,
      },
    });

    // Generate bracket structure
    const { createPlayoffBracketWithPositions } = await import('../services/playoffBracketService');
    await createPlayoffBracketWithPositions(tournament.id, participantIds, bracketPositions);

    // Reload tournament with bracket matches
    return await prisma.tournament.findUnique({
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
  }

  async enrichActiveTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, prisma } = context;
    
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: { tournamentId: tournament.id },
      include: {
        match: true,
      },
      orderBy: [
        { round: 'asc' },
        { position: 'asc' },
      ],
    });
    
    await attachRatingHistoryToBracketMatches(bracketMatches, tournament.participants, tournament.id, prisma);
    
    return { ...tournament, bracketMatches };
  }

  async enrichCompletedTournament(context: TournamentEnrichmentContext): Promise<EnrichedTournament> {
    const { tournament, postRatingMap, prisma } = context;
    
    const participantsWithPostRating = tournament.participants.map((participant: any) => {
      const key = `${tournament.id}-${participant.memberId}`;
      const postRating = postRatingMap?.get(key) ?? participant.member.rating;
      return {
        ...participant,
        postRatingAtTime: postRating,
      };
    });

    const bracketMatches = await prisma.bracketMatch.findMany({
      where: { tournamentId: tournament.id },
      include: {
        match: true,
      },
      orderBy: [
        { round: 'asc' },
        { position: 'asc' },
      ],
    });
    
    await attachRatingHistoryToBracketMatches(bracketMatches, participantsWithPostRating, tournament.id, prisma);
    
    return {
      ...tournament,
      participants: participantsWithPostRating,
      bracketMatches,
    };
  }

  isComplete(tournament: any): boolean {
    // Playoff is complete when the finals match (round 1) is played
    if (!tournament.bracketMatches || tournament.bracketMatches.length === 0) {
      return false;
    }
    
    const finalsMatch = tournament.bracketMatches.find((bm: any) => bm.round === 1);
    if (!finalsMatch?.match) return false;
    return finalsMatch.match.player1Sets !== null && finalsMatch.match.player2Sets !== null;
  }

  shouldRecalculateRatings(tournament: any): boolean {
    // Playoff recalculates ratings after each match
    return true;
  }

  async onMatchRatingCalculation(context: { tournament: any; match: any; winnerId: number; prisma: any }): Promise<void> {
    const { match, prisma } = context;
    const isForfeit = match.player1Forfeit || match.player2Forfeit;
    if (isForfeit || !match.member1Id || !match.member2Id) return;

    // Delete any existing rating history for this match (handles re-scoring)
    await prisma.ratingHistory.deleteMany({
      where: { matchId: match.id },
    });

    const { adjustRatingsForSingleMatch } = await import('../services/usattRatingService');
    const player1Won = match.winnerId === match.member1Id;
    await adjustRatingsForSingleMatch(
      match.member1Id,
      match.member2Id,
      player1Won,
      match.tournamentId,
      match.id,
    );
  }

  canCancel(tournament: any): boolean {
    return true;
  }

  matchesRemaining(tournament: any): number {
    if (!tournament.bracketMatches || tournament.bracketMatches.length === 0) {
      return 0;
    }
    // Count bracket matches that are not BYEs and don't have a completed match
    const playableMatches = tournament.bracketMatches.filter((bm: any) => 
      bm.member1Id !== 0 && bm.member2Id !== 0 && bm.member2Id !== null
    );
    const completedMatches = playableMatches.filter((bm: any) => 
      bm.match && bm.match.winnerId !== null
    );
    return Math.max(0, playableMatches.length - completedMatches.length);
  }

  async resolveMatchId(context: {
    matchId: number;
    tournamentId: number;
    prisma: any;
  }): Promise<{
    match: any;
    bracketMatchId?: number;
    isBracketMatchId?: boolean;
  } | null> {
    // Check if matchId is actually a bracketMatchId
    const bracketMatch = await context.prisma.bracketMatch.findUnique({
      where: { id: context.matchId },
      include: { tournament: true, match: true },
    });
    
    if (!bracketMatch || bracketMatch.tournamentId !== context.tournamentId) {
      return null;
    }
    
    // Check for BYE match - these cannot be updated
    const isByeMatch = bracketMatch.member1Id === 0 || 
                       bracketMatch.member2Id === 0 || 
                       bracketMatch.member2Id === null ||
                       (bracketMatch as any).player1IsBye || 
                       (bracketMatch as any).player2IsBye;
    
    if (isByeMatch) {
      throw new Error('Cannot create or update match for BYE - BYE players are automatically promoted');
    }
    
    // Return existing match or create temporary structure
    if (bracketMatch.match) {
      return {
        match: bracketMatch.match,
        bracketMatchId: context.matchId,
        isBracketMatchId: true,
      };
    }
    
    // Create temporary match structure for new match
    const tournament = await context.prisma.tournament.findUnique({
      where: { id: context.tournamentId },
    });
    
    return {
      match: {
        id: context.matchId,
        tournamentId: context.tournamentId,
        member1Id: bracketMatch.member1Id,
        member2Id: bracketMatch.member2Id,
        player1Sets: 0,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        tournament,
      },
      bracketMatchId: context.matchId,
      isBracketMatchId: true,
    };
  }

  async handlePluginRequest(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any> {
    const { method, resource, tournamentId, data, prisma } = context;
    
    // Route to appropriate handler based on resource
    if (resource === 'bracket') {
      if (method === 'GET') {
        return this.getBracketStructure(tournamentId, prisma);
      } else if (method === 'PATCH') {
        return this.updateBracketPositions(tournamentId, data, prisma);
      }
    } else if (resource === 'reseed' && method === 'POST') {
      return this.reseedBracket(tournamentId, prisma);
    } else if (resource === 'participants-updated' && method === 'POST') {
      // Auto-reseed when participants change
      return this.reseedBracket(tournamentId, prisma);
    } else if (resource === 'preview' && method === 'POST') {
      return this.previewBracket(data);
    }
    
    throw new Error(`Unknown resource: ${method} ${resource}`);
  }

  private async getBracketStructure(tournamentId: number, prisma: any): Promise<any> {
    const { getBracketStructure } = await import('../services/playoffBracketService');
    return getBracketStructure(tournamentId);
  }

  private async updateBracketPositions(tournamentId: number, data: any, prisma: any): Promise<any> {
    const { positions } = data;
    
    if (!positions || !Array.isArray(positions)) {
      throw new Error('positions array is required');
    }
    
    // Batch fetch all bracket matches
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: {
        tournamentId,
        OR: positions.map((pos: any) => ({
          round: pos.round,
          position: pos.position,
        })),
      },
    });
    
    // Create map: `${round}-${position}` -> bracketMatch
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
        const isPlayer1 = (pos.position - 1) % 2 === 0;
        
        updates.push(
          prisma.bracketMatch.update({
            where: { id: bracketMatch.id },
            data: isPlayer1 
              ? { member1Id: pos.memberId || 0 }
              : { member2Id: pos.memberId || 0 },
          })
        );
      }
    }
    
    await Promise.all(updates);
    
    // Return updated bracket structure
    return this.getBracketStructure(tournamentId, prisma);
  }

  private async previewBracket(data: any): Promise<any> {
    const { participantIds, players, numSeeds } = data;
    
    // Convert to format expected by generateSeeding
    const participants = players.map((p: any) => ({
      memberId: p.id,
      playerRatingAtTime: p.rating,
    }));

    // Generate bracket positions using server-side logic
    const { generateSeeding, generateBracketPositions, calculateBracketSize } = 
      await import('../services/playoffBracketService');
    
    const seededPlayers = generateSeeding(participants);
    const bracketSize = calculateBracketSize(participants.length);
    const numSeedsToUse = numSeeds !== undefined ? parseInt(numSeeds) : undefined;
    
    const bracketPositions = generateBracketPositions(seededPlayers, bracketSize, numSeedsToUse);

    return { bracketPositions, bracketSize };
  }

  private async reseedBracket(tournamentId: number, prisma: any): Promise<any> {
    // Get tournament with participants and matches
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
      throw new Error('Tournament not found');
    }
    
    if (tournament.status === 'COMPLETED') {
      throw new Error('Cannot reseed completed tournament');
    }
    
    // Generate new seeding based on ratings
    const { generateSeeding, generateBracketPositions, calculateBracketSize } = 
      await import('../services/playoffBracketService');
    
    const seededPlayers = generateSeeding(tournament.participants);
    const bracketSize = calculateBracketSize(tournament.participants.length);
    const bracketPositions = generateBracketPositions(seededPlayers, bracketSize);
    
    // Update bracket matches with new positions
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'desc' }, { position: 'asc' }],
    });
    
    // Update first round bracket matches with new seeding
    const firstRoundMatches = bracketMatches.filter((bm: any) => 
      bm.round === Math.ceil(Math.log2(bracketSize))
    );
    
    const updates = firstRoundMatches.map((bm: any, index: number) => {
      const pos1 = index * 2;
      const pos2 = index * 2 + 1;
      
      return prisma.bracketMatch.update({
        where: { id: bm.id },
        data: {
          member1Id: bracketPositions[pos1] || 0,
          member2Id: bracketPositions[pos2] || 0,
        },
      });
    });
    
    await Promise.all(updates);
    
    return { message: 'Bracket reseeded successfully' };
  }

  async onMatchCompleted(event: any): Promise<any> {
    const { tournament, match, prisma } = event;
    
    // Advance winner to next round
    const bracketMatch = await prisma.bracketMatch.findFirst({
      where: { 
        tournamentId: tournament.id,
        matchId: match.id 
      },
    });

    if (bracketMatch) {
      const winnerId = match.player1Sets > match.player2Sets ? match.member1Id : match.member2Id;
      const { advanceWinner } = await import('../services/playoffBracketService');
      const { tournamentCompleted } = await advanceWinner(tournament.id, bracketMatch.id, winnerId);
      
      if (tournamentCompleted) {
        return { shouldMarkComplete: true };
      }
    }
    
    return {};
  }

  async calculateMatchRatings(context: any): Promise<void> {
    const { tournament, match, prisma } = context;
    
    // Playoff calculates ratings after each match using incremental rating
    const { processMatchRating } = await import('../services/matchRatingService');
    const player1Won = match.player1Sets > match.player2Sets;
    
    await processMatchRating(
      match.member1Id,
      match.member2Id,
      player1Won,
      tournament.id,
      match.id,
      false, // not a forfeit
      true   // use incremental rating (current rating)
    );
  }

  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement playoff schedule view
    return { matches: context.tournament.matches || [] };
  }

  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    // TODO: Implement playoff bracket printable view
    return { bracket: context.tournament.bracketMatches || [] };
  }

  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    member1Id?: number;
    member2Id?: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
    userId?: number;
  }): Promise<{
    match: any;
    tournamentStateChange?: {
      shouldMarkComplete?: boolean;
      message?: string;
    };
  }> {
    const { matchId, tournamentId, player1Sets, player2Sets, player1Forfeit, player2Forfeit, prisma } = context;
    
    // Try to find Match directly
    let match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });
    
    let bracketMatchId: number | null = null;
    
    // If not found, matchId might be a bracketMatchId
    if (!match) {
      const bracketMatch = await prisma.bracketMatch.findUnique({
        where: { id: matchId },
        include: { tournament: true, match: true },
      });
      
      if (!bracketMatch || bracketMatch.tournamentId !== tournamentId) {
        throw new Error('Match not found');
      }
      
      // Check for BYE match
      const isByeMatch = bracketMatch.member1Id === 0 || 
                         bracketMatch.member2Id === 0 || 
                         bracketMatch.member2Id === null;
      
      if (isByeMatch) {
        throw new Error('Cannot update BYE match - BYE players are automatically promoted');
      }
      
      bracketMatchId = matchId;
      
      // Use existing match or prepare for creation
      if (bracketMatch.match) {
        match = bracketMatch.match;
      } else {
        // Will create new match below
        match = null;
      }
    } else {
      // Match exists, validate it belongs to this tournament
      if (match.tournamentId !== tournamentId) {
        throw new Error('Match does not belong to this tournament');
      }
      
      // Get bracketMatchId from existing match
      const bracketMatch = await prisma.bracketMatch.findFirst({
        where: { matchId: match.id },
      });
      bracketMatchId = bracketMatch?.id || null;
    }
    
    // Get member IDs
    let member1Id: number;
    let member2Id: number;
    
    if (match) {
      member1Id = match.member1Id;
      member2Id = match.member2Id;
    } else {
      // Get from bracketMatch
      const bracketMatch = await prisma.bracketMatch.findUnique({
        where: { id: bracketMatchId! },
      });
      member1Id = bracketMatch!.member1Id;
      member2Id = bracketMatch!.member2Id;
    }
    
    // Determine winner
    const winnerId = player1Forfeit 
      ? member2Id 
      : player2Forfeit 
        ? member1Id 
        : player1Sets > player2Sets 
          ? member1Id 
          : member2Id;
    
    // Create or update match
    let updatedMatch;
    if (match) {
      // Update existing match
      updatedMatch = await prisma.match.update({
        where: { id: match.id },
        data: {
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
        },
        include: { tournament: true },
      });
    } else {
      // Create new match linked to bracketMatch
      updatedMatch = await prisma.match.create({
        data: {
          tournament: { connect: { id: tournamentId } },
          member1Id,
          member2Id,
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
        },
        include: { tournament: true },
      });
      
      // Link bracketMatch to new match
      await prisma.bracketMatch.update({
        where: { id: bracketMatchId! },
        data: { matchId: updatedMatch.id },
      });
    }
    
    // Advance winner to next round
    if (bracketMatchId) {
      const { advanceWinner } = await import('../services/playoffBracketService');
      const { tournamentCompleted } = await advanceWinner(tournamentId, bracketMatchId, winnerId);
      
      if (tournamentCompleted) {
        return {
          match: updatedMatch,
          tournamentStateChange: {
            shouldMarkComplete: true,
            message: 'Tournament completed',
          },
        };
      }
    }
    
    return { match: updatedMatch };
  }

  protected async getTournamentSpecificUpdateData(
    existingTournament: any,
    additionalData: Record<string, any> | undefined,
    prisma: any
  ): Promise<Record<string, any>> {
    // Playoff tournaments don't have additional specific data to update
    // The bracket structure is handled separately
    return {};
  }
}
