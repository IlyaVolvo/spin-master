# Match Update Plugin Delegation - Design

## Overview

Design a plugin-based match update system that removes PLAYOFF-specific concepts (like `bracketMatchId`) from routes and handles match updates for all tournament types including compound tournaments.

---

## Problem Analysis

### Current Issues

1. **Routes expose `bracketMatchId`** - PLAYOFF-specific concept visible in generic route
2. **Match resolution logic in routes** - Should be in plugin
3. **Compound tournaments** - Don't have matches but need to react to child match updates

### Tournament Type Requirements

#### **ROUND_ROBIN**
- Matches exist in `Match` table
- Direct match ID lookup (no bracket structure)
- Match update = simple database update

#### **PLAYOFF**
- Two-tier structure: `BracketMatch` (bracket position) + `Match` (game result)
- Client may send `bracketMatchId` instead of `matchId`
- Need to resolve `bracketMatchId` → `Match`
- Need to advance winner to next bracket position

#### **SWISS**
- Matches exist in `Match` table
- Direct match ID lookup
- May need to generate next round pairings after match completion

#### **Compound (PRELIMINARY_WITH_FINAL_PLAYOFF)**
- Parent tournament has NO matches
- Child tournaments have matches
- Parent needs to react to child match completion
- Example: When all preliminary groups complete, create playoff

---

## Solution: Plugin Method for Match Updates

### Add to TournamentPlugin Interface

```typescript
interface TournamentPlugin {
  // ... existing methods
  
  // Update or create a match with scores
  // Returns the updated/created match
  updateMatch(context: {
    matchId: number;  // Could be actual matchId or bracket position ID
    tournamentId: number;
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
  }>;
}
```

---

## Implementation by Tournament Type

### 1. RoundRobinPlugin

**Simple case**: Direct match update, no special resolution needed.

```typescript
class RoundRobinPlugin implements TournamentPlugin {
  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
  }): Promise<{ match: any; tournamentStateChange?: any }> {
    const { matchId, tournamentId, player1Sets, player2Sets, player1Forfeit, player2Forfeit, prisma } = context;
    
    // Find match directly
    let match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });
    
    if (!match) {
      throw new Error('Match not found');
    }
    
    if (match.tournamentId !== tournamentId) {
      throw new Error('Match does not belong to this tournament');
    }
    
    // Determine winner
    const winnerId = player1Forfeit 
      ? match.member2Id 
      : player2Forfeit 
        ? match.member1Id 
        : player1Sets > player2Sets 
          ? match.member1Id 
          : match.member2Id;
    
    // Update match
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        player1Sets,
        player2Sets,
        player1Forfeit,
        player2Forfeit,
        winnerId,
      },
      include: { tournament: true },
    });
    
    // Check if tournament is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });
    
    const allMatchesComplete = tournament.matches.every(m => m.winnerId !== null);
    
    return {
      match: updatedMatch,
      tournamentStateChange: allMatchesComplete 
        ? { shouldMarkComplete: true, message: 'All matches completed' }
        : undefined,
    };
  }
}
```

---

### 2. PlayoffPlugin

**Complex case**: Resolve `bracketMatchId`, create/update match, advance winner.

```typescript
class PlayoffPlugin implements TournamentPlugin {
  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
  }): Promise<{ match: any; tournamentStateChange?: any }> {
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
    
    // Determine winner
    const member1Id = match?.member1Id || (await prisma.bracketMatch.findUnique({ where: { id: bracketMatchId! } }))?.member1Id;
    const member2Id = match?.member2Id || (await prisma.bracketMatch.findUnique({ where: { id: bracketMatchId! } }))?.member2Id;
    
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
          winnerId,
        },
        include: { tournament: true },
      });
    } else {
      // Create new match linked to bracketMatch
      const bracketMatch = await prisma.bracketMatch.findUnique({
        where: { id: bracketMatchId! },
      });
      
      updatedMatch = await prisma.match.create({
        data: {
          tournamentId,
          member1Id: bracketMatch.member1Id,
          member2Id: bracketMatch.member2Id,
          player1Sets,
          player2Sets,
          player1Forfeit,
          player2Forfeit,
          winnerId,
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
}
```

---

### 3. SwissPlugin (Future)

**Similar to RoundRobin**: Direct match update, but may trigger pairing generation.

```typescript
class SwissPlugin implements TournamentPlugin {
  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
  }): Promise<{ match: any; tournamentStateChange?: any }> {
    // Similar to RoundRobinPlugin
    // ... update match logic
    
    // Check if round is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });
    
    const currentRound = Math.max(...tournament.matches.map(m => m.round || 1));
    const roundMatches = tournament.matches.filter(m => m.round === currentRound);
    const roundComplete = roundMatches.every(m => m.winnerId !== null);
    
    if (roundComplete) {
      // Generate next round pairings
      await this.generateNextRoundPairings(tournamentId, prisma);
    }
    
    return { match: updatedMatch };
  }
}
```

---

### 4. Compound Tournament Plugin (PRELIMINARY_WITH_FINAL_PLAYOFF)

**Special case**: Parent tournament has NO matches, but reacts to child match updates.

```typescript
class PreliminaryWithFinalPlayoffPlugin implements TournamentPlugin {
  async updateMatch(context: {
    matchId: number;
    tournamentId: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    prisma: any;
  }): Promise<{ match: any; tournamentStateChange?: any }> {
    const { matchId, tournamentId, prisma } = context;
    
    // Parent tournament has no matches
    // This method is called when a child tournament match is updated
    
    // Find which child tournament this match belongs to
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });
    
    if (!match) {
      throw new Error('Match not found');
    }
    
    const childTournament = match.tournament;
    
    // Verify this child belongs to the parent
    if (childTournament.parentTournamentId !== tournamentId) {
      throw new Error('Match does not belong to a child of this tournament');
    }
    
    // Delegate to child tournament's plugin
    const childPlugin = tournamentPluginRegistry.get(childTournament.type);
    const result = await childPlugin.updateMatch({
      ...context,
      tournamentId: childTournament.id,
    });
    
    // Check if child tournament completed
    if (result.tournamentStateChange?.shouldMarkComplete) {
      // Mark child as complete
      await prisma.tournament.update({
        where: { id: childTournament.id },
        data: { status: 'COMPLETED' },
      });
      
      // Check if all preliminary groups are complete
      const parentTournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          childTournaments: true,
        },
      });
      
      const preliminaryGroups = parentTournament.childTournaments.filter(
        ct => ct.type === 'ROUND_ROBIN'
      );
      
      const allGroupsComplete = preliminaryGroups.every(
        g => g.status === 'COMPLETED'
      );
      
      if (allGroupsComplete) {
        // All preliminary groups complete - create playoff
        const playoffPlugin = tournamentPluginRegistry.get('PLAYOFF');
        
        // Get top players from each group
        const topPlayers = await this.getTopPlayersFromGroups(
          preliminaryGroups,
          parentTournament.playoffBracketSize,
          prisma
        );
        
        // Create playoff tournament
        await playoffPlugin.createTournament({
          name: `${parentTournament.name} - Final Playoff`,
          participantIds: topPlayers.map(p => p.memberId),
          players: topPlayers,
          prisma,
          additionalData: {
            parentTournamentId: tournamentId,
          },
        });
        
        return {
          match: result.match,
          tournamentStateChange: {
            message: 'Preliminary phase complete - playoff created',
          },
        };
      }
    }
    
    return result;
  }
}
```

---

## Refactored Route Handler

**Route becomes a simple passthrough**:

```typescript
router.patch('/:tournamentId/matches/:matchId', [
  body('player1Sets').isInt({ min: 0 }),
  body('player2Sets').isInt({ min: 0 }),
  body('player1Forfeit').optional().isBoolean(),
  body('player2Forfeit').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    // Auth check
    const hasOrganizerAccess = await isOrganizer(req);
    if (!hasOrganizerAccess) {
      return res.status(403).json({ error: 'Only Organizers can update matches' });
    }
    
    // Validation
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
    
    // Get tournament and plugin
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);
    
    // Delegate to plugin
    const result = await plugin.updateMatch({
      matchId,
      tournamentId,
      player1Sets,
      player2Sets,
      player1Forfeit: player1Forfeit || false,
      player2Forfeit: player2Forfeit || false,
      prisma,
      userId: req.userId,
    });
    
    // Handle tournament state changes
    if (result.tournamentStateChange?.shouldMarkComplete) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED' },
      });
    }
    
    // Calculate ratings (existing plugin method)
    if (tournament.status === 'ACTIVE' && result.match.winnerId) {
      const plugin = tournamentPluginRegistry.get(tournament.type);
      if (plugin.onMatchRatingCalculation) {
        await plugin.onMatchRatingCalculation({
          tournament,
          match: result.match,
          winnerId: result.match.winnerId,
          prisma,
        });
      }
    }
    
    res.json(result.match);
  } catch (error) {
    logger.error('Error updating match', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});
```

---

## Benefits

### 1. **No PLAYOFF-Specific Concepts in Routes** ✅
- No `bracketMatchId` variable
- No `isBracketMatchId` flag
- No bracket resolution logic

### 2. **Each Plugin Handles Its Own Complexity** ✅
- **ROUND_ROBIN**: Simple match update
- **PLAYOFF**: Bracket resolution, winner advancement
- **SWISS**: Pairing generation
- **Compound**: Child delegation, phase transitions

### 3. **Compound Tournaments React to Child Matches** ✅
- Parent plugin delegates to child plugin
- Parent reacts to child completion
- Can trigger phase transitions (preliminary → playoff)

### 4. **Extensible** ✅
New tournament types just implement `updateMatch()`:
```typescript
class CustomPlugin implements TournamentPlugin {
  async updateMatch(context) {
    // Custom match update logic
    // Return updated match + state changes
  }
}
```

### 5. **Clean Separation** ✅
- **Routes**: HTTP handling, auth, validation, delegation
- **Plugins**: Match resolution, update logic, state transitions

---

## Summary

**Add**: `updateMatch()` method to TournamentPlugin interface  
**Remove**: `bracketMatchId` and resolution logic from routes  
**Result**: Routes delegate all match update logic to plugins

Each tournament type handles match updates in its own way:
- Basic tournaments: Direct match update
- PLAYOFF: Bracket resolution + winner advancement
- Compound: Child delegation + phase transitions

Routes become pure passthroughs with zero tournament-type knowledge.
