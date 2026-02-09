# Match Update Plugin Delegation - Complete

## Overview

Successfully refactored match update logic to remove all PLAYOFF-specific concepts (like `bracketMatchId`) from routes and delegate all match update logic to plugins via the new `updateMatch()` method.

---

## What Was Removed from Routes

### PLAYOFF-Specific Code Eliminated (Lines 937-1109, ~172 lines)

**Removed**:
1. `bracketMatchId` variable declarations
2. `isBracketMatchId` flag
3. Match resolution logic via `plugin.resolveMatchId()`
4. BYE match checking
5. Bracket match creation/update logic
6. Transaction code for linking BracketMatch to Match
7. Winner advancement logic
8. Complex forfeit handling

**All this logic is now hidden inside `PlayoffPlugin.updateMatch()`**

---

## What Was Added

### 1. TournamentPlugin Interface Method

```typescript
interface TournamentPlugin {
  // Match update - plugins handle match creation/update with type-specific logic
  updateMatch(context: {
    matchId: number;
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

### 2. PlayoffPlugin Implementation (~150 lines)

```typescript
class PlayoffPlugin implements TournamentPlugin {
  async updateMatch(context) {
    // Try to find Match directly
    let match = await prisma.match.findUnique({ where: { id: matchId } });
    
    let bracketMatchId: number | null = null;
    
    // If not found, matchId might be a bracketMatchId
    if (!match) {
      const bracketMatch = await prisma.bracketMatch.findUnique({
        where: { id: matchId },
      });
      
      // Check for BYE match
      if (bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0) {
        throw new Error('Cannot update BYE match');
      }
      
      bracketMatchId = matchId;
      match = bracketMatch.match || null;
    }
    
    // Determine winner
    const winnerId = player1Forfeit ? member2Id : 
                     player2Forfeit ? member1Id :
                     player1Sets > player2Sets ? member1Id : member2Id;
    
    // Create or update match
    if (match) {
      updatedMatch = await prisma.match.update({ ... });
    } else {
      updatedMatch = await prisma.match.create({ ... });
      await prisma.bracketMatch.update({
        where: { id: bracketMatchId },
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
          tournamentStateChange: { shouldMarkComplete: true },
        };
      }
    }
    
    return { match: updatedMatch };
  }
}
```

**All bracket-specific logic is encapsulated in the plugin!**

### 3. RoundRobinPlugin Implementation (~70 lines)

```typescript
class RoundRobinPlugin implements TournamentPlugin {
  async updateMatch(context) {
    // Find match directly
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });
    
    if (!match) {
      throw new Error('Match not found');
    }
    
    // Determine winner
    const winnerId = player1Forfeit ? match.member2Id :
                     player2Forfeit ? match.member1Id :
                     player1Sets > player2Sets ? match.member1Id : match.member2Id;
    
    // Update match
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: { player1Sets, player2Sets, player1Forfeit, player2Forfeit, winnerId },
    });
    
    // Check if tournament is complete
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: true },
    });
    
    const allMatchesComplete = this.isComplete(tournament);
    
    return {
      match: updatedMatch,
      tournamentStateChange: allMatchesComplete 
        ? { shouldMarkComplete: true, message: 'All matches completed' }
        : undefined,
    };
  }
}
```

**Simple, direct match update with completion checking.**

---

## Refactored Route (Simple Passthrough)

**Before**: 172 lines of PLAYOFF-specific logic  
**After**: 75 lines of generic delegation

```typescript
router.patch('/:tournamentId/matches/:matchId', async (req, res) => {
  // Auth check
  const hasOrganizerAccess = await isOrganizer(req);
  if (!hasOrganizerAccess) {
    return res.status(403).json({ error: 'Only Organizers can update matches' });
  }
  
  // Validation
  const { player1Sets, player2Sets, player1Forfeit, player2Forfeit } = req.body;
  const tournamentId = parseInt(req.params.tournamentId);
  const matchId = parseInt(req.params.matchId);
  
  if (player1Forfeit === true && player2Forfeit === true) {
    return res.status(400).json({ error: 'Only one player can forfeit' });
  }
  
  // Get tournament and plugin
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });
  
  const plugin = tournamentPluginRegistry.get(tournament.type);
  
  // Delegate to plugin (NO bracketMatchId visible here!)
  const result = await plugin.updateMatch({
    matchId,
    tournamentId,
    player1Sets: player1Sets ?? 0,
    player2Sets: player2Sets ?? 0,
    player1Forfeit: player1Forfeit || false,
    player2Forfeit: player2Forfeit || false,
    prisma,
    userId: req.userId,
  });
  
  const updatedMatch = result.match;
  
  // Handle tournament state changes
  if (result.tournamentStateChange?.shouldMarkComplete) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
    });
    
    const { recalculateRankings } = await import('../services/rankingService');
    await recalculateRankings(tournamentId);
  }
  
  // Calculate ratings
  if (tournament.status === 'ACTIVE' && updatedMatch.winnerId) {
    if (plugin.onMatchRatingCalculation) {
      await plugin.onMatchRatingCalculation({
        tournament,
        match: updatedMatch,
        winnerId: updatedMatch.winnerId,
        prisma,
      });
    }
  }
  
  // Invalidate cache and emit notifications
  await invalidateCacheAfterTournament(tournamentId);
  emitMatchUpdate(updatedMatch, tournamentId);
  emitCacheInvalidation(tournamentId);
  
  res.json(updatedMatch);
});
```

---

## Architecture Transformation

### Before: Routes Know About PLAYOFF Structure

```typescript
// Route has PLAYOFF-specific variables
let bracketMatchId: number | null = null;
let isBracketMatchId = false;

// Route knows about BracketMatch table
const bracketMatch = await prisma.bracketMatch.findUnique({ ... });

// Route knows about BYE players
if (bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0) {
  return res.status(400).json({ error: 'Cannot update BYE match' });
}

// Route creates Match and links to BracketMatch
await prisma.$transaction(async (tx) => {
  const newMatch = await tx.match.create({ ... });
  await tx.bracketMatch.update({
    where: { id: bracketMatchId },
    data: { matchId: newMatch.id },
  });
});
```

### After: Routes Are Type-Agnostic

```typescript
// Route only knows about generic match update
const result = await plugin.updateMatch({
  matchId,
  tournamentId,
  player1Sets,
  player2Sets,
  player1Forfeit,
  player2Forfeit,
  prisma,
});

// Plugin handles all type-specific logic internally
// Route doesn't know about brackets, BYEs, or database structure
```

---

## Benefits Achieved

### 1. **Zero PLAYOFF-Specific Concepts in Routes** ✅
**Before**: Routes knew about `bracketMatchId`, `BracketMatch` table, BYE players  
**After**: Routes only know about generic match updates

### 2. **Each Plugin Handles Its Own Complexity** ✅
- **ROUND_ROBIN**: Direct match update, completion checking
- **PLAYOFF**: Bracket resolution, BYE checking, winner advancement, bracket linking
- **Future SWISS**: Pairing generation after round completion
- **Compound**: Child delegation, phase transitions

### 3. **Massive Code Reduction in Routes** ✅
**Before**: 172 lines of match update logic  
**After**: 75 lines of generic delegation  
**Reduction**: 97 lines (56% reduction)

### 4. **Extensible** ✅
New tournament types just implement `updateMatch()`:
```typescript
class SwissPlugin implements TournamentPlugin {
  async updateMatch(context) {
    // Update match
    const updatedMatch = await prisma.match.update({ ... });
    
    // Check if round complete
    if (roundComplete) {
      await this.generateNextRoundPairings(tournamentId, prisma);
    }
    
    return { match: updatedMatch };
  }
}
```

### 5. **Compound Tournaments Can React to Child Matches** ✅
```typescript
class PreliminaryWithFinalPlayoffPlugin {
  async updateMatch(context) {
    // Find which child tournament this match belongs to
    const childTournament = await findChildTournament(matchId);
    
    // Delegate to child plugin
    const childPlugin = tournamentPluginRegistry.get(childTournament.type);
    const result = await childPlugin.updateMatch({
      ...context,
      tournamentId: childTournament.id,
    });
    
    // React to child completion
    if (result.tournamentStateChange?.shouldMarkComplete) {
      if (allGroupsComplete()) {
        await createPlayoffPhase();
        return { message: 'Preliminary phase complete - playoff created' };
      }
    }
    
    return result;
  }
}
```

---

## Code Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Match update route lines | 172 | 75 | 56% reduction |
| PLAYOFF-specific variables in routes | 2 (`bracketMatchId`, `isBracketMatchId`) | 0 | 100% elimination |
| Database table knowledge in routes | Yes (BracketMatch) | No | Complete abstraction |
| BYE player knowledge in routes | Yes | No | Complete abstraction |
| Type checks in routes | Multiple | 0 | 100% elimination |

---

## What Routes Now Do vs. Don't Do

### Routes Do ✅
1. HTTP handling (auth, validation, response)
2. Generic forfeit validation
3. Plugin selection
4. Delegation to `plugin.updateMatch()`
5. Tournament state change handling
6. Rating calculation triggering
7. Cache invalidation

### Routes Don't Do ❌
1. ❌ Know about `bracketMatchId`
2. ❌ Know about `BracketMatch` table
3. ❌ Know about BYE players
4. ❌ Resolve bracket positions to matches
5. ❌ Create/link bracket matches
6. ❌ Advance winners in brackets
7. ❌ Check tournament-specific completion logic

---

## Summary

**Removed**: 172 lines of PLAYOFF-specific match update logic from routes  
**Added**: `updateMatch()` method to TournamentPlugin interface  
**Implemented**: `updateMatch()` in PlayoffPlugin (~150 lines) and RoundRobinPlugin (~70 lines)  
**Result**: Routes are pure passthroughs with zero tournament-type knowledge

Match update is now fully plugin-based:
- ✅ **PLAYOFF**: Handles bracket resolution, BYE checking, winner advancement
- ✅ **ROUND_ROBIN**: Handles direct match update, completion checking
- ✅ **Future SWISS**: Will handle pairing generation
- ✅ **Compound**: Can delegate to children and react to phase transitions

Routes are now type-agnostic passthroughs that delegate all match update logic to plugins.
