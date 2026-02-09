# Plugin Rating Delegation Refactoring - Complete

## Overview

Removed conditional `shouldRecalculateRatings` flag. All tournaments now receive rating calculation requests, and plugins decide whether to handle them or do nothing.

---

## Key Changes

### 1. Plugin Interface Updates

**File**: `/server/src/plugins/TournamentPlugin.ts`

#### Removed
```typescript
shouldRecalculateRatings(tournament: any): boolean;
calculateMatchRatings?(context: { tournament: any; match: any; prisma: any }): Promise<void>;
```

#### Added
```typescript
// Rating calculation - all plugins receive these calls, but can choose to do nothing
// Called when a match is completed - plugin decides if/how to calculate ratings
onMatchRatingCalculation?(context: { 
  tournament: any; 
  match: any; 
  winnerId: number; 
  prisma: any 
}): Promise<void>;

// Called when tournament is completed - plugin decides if/how to calculate final ratings
onTournamentCompletionRatingCalculation?(context: { 
  tournament: any; 
  prisma: any 
}): Promise<void>;
```

### Key Principle
**Before**: Routes check `if (plugin.shouldRecalculateRatings())` before calling rating methods  
**After**: Routes always call plugin methods; plugins that don't need rating calculation simply don't implement the method or do nothing

---

## Route Changes

### 2. Match Creation Route (POST /tournaments/:id/matches/create)

**Lines**: 964-979

#### Before
```typescript
const plugin = tournamentPluginRegistry.get(tournament.type);
if (plugin.shouldRecalculateRatings && plugin.shouldRecalculateRatings(tournament)) {
  // For tournaments that calculate ratings per match (e.g., PLAYOFF)
  await processMatchRating(member1Id, member2Id, player1Won, tournamentId, match.id, false, true);
} else if (tournament.type === 'SINGLE_MATCH') {
  // For SINGLE_MATCH tournaments
  await processMatchRating(...);
}
```

#### After
```typescript
// Notify plugin of match rating calculation - plugin decides if/how to handle it
const plugin = tournamentPluginRegistry.get(tournament.type);
if (plugin.onMatchRatingCalculation) {
  await plugin.onMatchRatingCalculation({
    tournament,
    match,
    winnerId,
    prisma,
  });
} else if (tournament.type === 'SINGLE_MATCH') {
  // SINGLE_MATCH: Legacy handling (will be refactored separately)
  const { processMatchRating } = await import('../services/matchRatingService');
  const player1Won = winnerId === member1Id;
  await processMatchRating(member1Id, member2Id, player1Won, tournamentId, match.id, false, true);
}
```

**Impact**: 
- No conditional check - plugin receives the request
- Plugin implementation decides whether to calculate ratings
- SINGLE_MATCH kept as-is (to be handled separately)

---

### 3. Match Update Route (PATCH /tournaments/:tournamentId/matches/:matchId)

**Lines**: 1270-1291

#### Before
```typescript
const plugin = tournamentPluginRegistry.get(match.tournament.type);
if (plugin.shouldRecalculateRatings && plugin.shouldRecalculateRatings(match.tournament) && !isForfeit) {
  // 70+ lines of embedded rating calculation logic
  if (wasCompleted && isBeingCompleted) {
    // Recalculate ratings
    await processMatchRating(...);
  } else if (isBeingCompleted && !wasCompleted) {
    // Calculate ratings for first time
    await processMatchRating(...);
  }
}
```

#### After
```typescript
// Determine winner for rating calculation
const winnerId = finalPlayer1Forfeit ? match.member2Id :
                 finalPlayer2Forfeit ? match.member1Id :
                 finalPlayer1Sets > finalPlayer2Sets ? match.member1Id :
                 finalPlayer2Sets > finalPlayer1Sets ? match.member2Id : null;

// Get plugin and notify of match rating calculation (if not forfeit and has winner)
if (match.tournament && winnerId && !isForfeit) {
  const plugin = tournamentPluginRegistry.get(match.tournament.type);
  if (plugin.onMatchRatingCalculation) {
    await plugin.onMatchRatingCalculation({
      tournament: match.tournament,
      match: updatedMatch || match,
      winnerId,
      prisma,
    });
  }
}
```

**Impact**:
- Removed 70+ lines of embedded rating calculation logic
- Clean delegation to plugin
- Plugin receives winner information and decides how to handle it
- No conditional checks - plugin decides behavior

---

### 4. Tournament Completion Route (PATCH /tournaments/:id/complete)

**Lines**: 1552-1556

#### Before
```typescript
const plugin = tournamentPluginRegistry.get(updatedTournament.type);
if (plugin.calculateMatchRatings) {
  await plugin.calculateMatchRatings({ tournament: updatedTournament, match: null, prisma });
}
```

#### After
```typescript
// Notify plugin of tournament completion - plugin decides if/how to calculate ratings
const plugin = tournamentPluginRegistry.get(updatedTournament.type);
if (plugin.onTournamentCompletionRatingCalculation) {
  await plugin.onTournamentCompletionRatingCalculation({ 
    tournament: updatedTournament, 
    prisma 
  });
}
```

**Impact**:
- Renamed method to be more explicit about its purpose
- Plugin decides whether to calculate ratings on tournament completion
- ROUND_ROBIN plugins implement this to calculate all ratings at once
- PLAYOFF plugins can skip this (ratings already calculated per match)

---

## Plugin Implementation Pattern

### Example: PlayoffPlugin

```typescript
export class PlayoffPlugin implements TournamentPlugin {
  type = 'PLAYOFF';
  isBasic = true;
  
  // Playoff calculates ratings per match, so implement this method
  async onMatchRatingCalculation(context: { 
    tournament: any; 
    match: any; 
    winnerId: number; 
    prisma: any 
  }): Promise<void> {
    const { processMatchRating } = await import('../services/matchRatingService');
    const player1Won = context.winnerId === context.match.member1Id;
    await processMatchRating(
      context.match.member1Id,
      context.match.member2Id,
      player1Won,
      context.tournament.id,
      context.match.id,
      false,
      true // useIncrementalRating for PLAYOFF
    );
  }
  
  // Playoff doesn't need tournament completion rating calculation
  // So we don't implement onTournamentCompletionRatingCalculation
}
```

### Example: RoundRobinPlugin

```typescript
export class RoundRobinPlugin implements TournamentPlugin {
  type = 'ROUND_ROBIN';
  isBasic = true;
  
  // Round Robin doesn't calculate ratings per match
  // So we don't implement onMatchRatingCalculation (or implement as no-op)
  
  // Round Robin calculates all ratings at tournament completion
  async onTournamentCompletionRatingCalculation(context: { 
    tournament: any; 
    prisma: any 
  }): Promise<void> {
    const { createRatingHistoryForRoundRobinTournament } = 
      await import('../services/usattRatingService');
    await createRatingHistoryForRoundRobinTournament(context.tournament.id);
  }
}
```

---

## Benefits of This Approach

### 1. **No Conditional Checks in Routes** ✅
Routes don't need to check `if (plugin.shouldRecalculateRatings())` - they just call the method.

### 2. **Plugin Decides Behavior** ✅
Each plugin implements only the methods it needs:
- PLAYOFF: Implements `onMatchRatingCalculation`
- ROUND_ROBIN: Implements `onTournamentCompletionRatingCalculation`
- Plugins that don't need rating calculation: Don't implement either

### 3. **Cleaner Code** ✅
- Routes: Simple delegation, no embedded logic
- Plugins: Self-contained rating calculation logic

### 4. **Extensible** ✅
New tournament types just implement the appropriate rating methods based on their needs.

### 5. **Consistent Pattern** ✅
Same pattern as other plugin event handlers like `onMatchCompleted`, `onChildTournamentCompleted`.

---

## Summary

**Removed**: `shouldRecalculateRatings` flag and conditional checks  
**Added**: `onMatchRatingCalculation` and `onTournamentCompletionRatingCalculation` methods  
**Result**: All tournaments receive rating requests; plugins decide whether to handle them

This follows the **Hollywood Principle**: "Don't call us, we'll call you" - the routes notify plugins of events, and plugins decide how to respond.

---

## Next Steps

### Plugin Implementations Needed
1. Update PlayoffPlugin to implement `onMatchRatingCalculation`
2. Update RoundRobinPlugin to implement `onTournamentCompletionRatingCalculation`
3. Update SwissPlugin to implement appropriate rating methods
4. Update compound plugins to delegate to child plugins

### SINGLE_MATCH Handling
- Currently kept as legacy code in routes
- Will be refactored separately as it's not a tournament type
- Should be moved to a separate match recording system
