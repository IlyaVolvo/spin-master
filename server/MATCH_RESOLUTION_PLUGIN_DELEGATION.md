# Match Resolution Plugin Delegation - Complete

## Overview

Eliminated 144 lines of PLAYOFF-specific bracket match handling logic from the match update route by delegating to a plugin method. Routes are now simple passthroughs with minimal generic functionality.

---

## Problem: Lines 1039-1182 (144 lines)

The match update route contained extensive PLAYOFF-specific logic to handle the relationship between `BracketMatch` (bracket structure) and `Match` (game results).

### What It Did

**PLAYOFF tournaments have a two-tier structure**:
1. **BracketMatch** - Position in bracket (who plays whom, which round, advancement)
2. **Match** - Actual game result (scores, winner)

The route had to:
- Check if `matchId` is actually a `bracketMatchId`
- Fetch BracketMatch and validate it belongs to the tournament
- Check for BYE matches (auto-advanced players)
- Create temporary Match structure from BracketMatch data
- Handle multiple edge cases (match exists but wrong tournament, etc.)

### Issues

1. **Routes knew about BracketMatch table** - PLAYOFF-specific database structure
2. **Routes knew about BYE players** - PLAYOFF-specific concept
3. **Routes had type checks** - `if (plugin.type !== 'PLAYOFF')`
4. **144 lines of complex logic** - Hard to maintain, test, understand

---

## Solution: Plugin Method `resolveMatchId`

### Added to TournamentPlugin Interface

```typescript
// Match resolution - some tournament types (e.g., PLAYOFF) may need to map bracket IDs to match IDs
// Returns resolved match data or null if match cannot be resolved
resolveMatchId?(context: {
  matchId: number;
  tournamentId: number;
  prisma: any;
}): Promise<{
  match: any;
  bracketMatchId?: number;
  isBracketMatchId?: boolean;
} | null>;
```

---

## Refactored Route (44 lines - was 144)

### Before (144 lines of PLAYOFF-specific logic)
```typescript
// For playoff tournaments, if match doesn't exist, check if matchId is actually a bracketMatchId
let bracketMatchId: number | null = null;
let isBracketMatchId = false;
if (!match) {
  const bracketMatch = await (prisma as any).bracketMatch.findUnique({
    where: { id: matchId },
    include: { tournament: true },
  });
  
  if (bracketMatch && bracketMatch.tournamentId === tournamentId) {
    const plugin = tournamentPluginRegistry.get(bracketMatch.tournament.type);
    // Only process bracket matches for tournaments that support them (e.g., PLAYOFF)
    if (plugin.type !== 'PLAYOFF') {
      return res.status(404).json({ error: 'Match not found' });
    }
    // Check if this is a BYE match BEFORE processing
    const isByeMatch = bracketMatch.member1Id === 0 || bracketMatch.member2Id === 0 || 
                      bracketMatch.member2Id === null ||
                      (bracketMatch as any).player1IsBye || (bracketMatch as any).player2IsBye;
    
    if (isByeMatch) {
      return res.status(400).json({ error: 'Cannot create or update match for BYE...' });
    }
    
    // ... 120+ more lines of bracket handling logic
  }
}
```

### After (44 lines of generic plugin delegation)
```typescript
// If match not found, let plugin try to resolve it (e.g., PLAYOFF may map bracketMatchId to Match)
let bracketMatchId: number | null = null;
let isBracketMatchId = false;

if (!match) {
  // Get tournament to access plugin
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });
  
  if (tournament) {
    const plugin = tournamentPluginRegistry.get(tournament.type);
    
    // Let plugin try to resolve the match ID
    if (plugin.resolveMatchId) {
      try {
        const resolved = await plugin.resolveMatchId({
          matchId,
          tournamentId,
          prisma,
        });
        
        if (resolved) {
          match = resolved.match;
          bracketMatchId = resolved.bracketMatchId || null;
          isBracketMatchId = resolved.isBracketMatchId || false;
        }
      } catch (error) {
        // Plugin threw error (e.g., BYE match)
        return res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Invalid match' 
        });
      }
    }
  }
} else {
  // Match exists, extract bracketMatchId if present
  bracketMatchId = (match as any).bracketMatchId || null;
  
  // Validate match belongs to this tournament
  if (match.tournamentId !== tournamentId) {
    return res.status(400).json({ error: 'Match does not belong to this tournament' });
  }
}

if (!match) {
  return res.status(404).json({ error: 'Match not found' });
}
```

**Reduction**: 144 lines → 44 lines (69% reduction)

---

## PlayoffPlugin Implementation

```typescript
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
```

---

## RoundRobinPlugin / SwissPlugin

```typescript
// Don't implement resolveMatchId - they don't need special match resolution
// Route will just use direct Match lookup
```

---

## Benefits

### 1. **Routes Are Passthroughs** ✅
Routes no longer contain tournament-type-specific logic. They delegate to plugins.

### 2. **No Type Checks** ✅
**Before**: `if (plugin.type !== 'PLAYOFF')`  
**After**: Just call `plugin.resolveMatchId()` if it exists

### 3. **No Database Structure Knowledge** ✅
Routes don't know about:
- BracketMatch table
- BYE players
- Bracket structure

### 4. **Encapsulation** ✅
All bracket-specific logic lives in PlayoffPlugin:
- BracketMatch queries
- BYE validation
- Match structure creation

### 5. **Maintainable** ✅
- **Before**: 144 lines of complex conditional logic in routes
- **After**: 44 lines of simple plugin delegation in routes + clean implementation in plugin

### 6. **Testable** ✅
Test PlayoffPlugin.resolveMatchId() independently from routes

### 7. **Extensible** ✅
Future tournament types with custom match structures can implement their own `resolveMatchId`

---

## Architecture Achievement

### Route Responsibility
**Before**: 
- Fetch match
- Check if it's a bracket match
- Validate BYE players
- Handle multiple edge cases
- Create temporary structures
- Validate tournament ownership

**After**:
- Fetch match
- If not found, ask plugin to resolve
- Validate tournament ownership

### Plugin Responsibility
**Before**: None - all logic in routes

**After**: 
- Resolve bracket match IDs to Match records
- Validate BYE players
- Create temporary match structures
- Handle all bracket-specific edge cases

---

## Code Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Route lines | 144 | 44 | 69% reduction |
| Type checks | 3 | 0 | 100% elimination |
| Database queries in route | 5+ | 1 | 80% reduction |
| Plugin method | None | 1 | Encapsulation |

---

## Summary

**Removed**: 144 lines of PLAYOFF-specific bracket match handling from routes  
**Added**: `resolveMatchId` plugin method with clean implementation  
**Result**: Routes are now simple passthroughs that delegate to plugins

The match update route is now tournament-type-agnostic. It doesn't know about brackets, BYE players, or any PLAYOFF-specific concepts. All that logic lives in the PlayoffPlugin where it belongs.

This completes the transformation of routes into thin orchestration layers with minimal generic functionality, exactly as requested.
