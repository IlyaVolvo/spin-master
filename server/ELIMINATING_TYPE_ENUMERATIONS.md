# Eliminating Type Enumerations from tournaments.ts

## Progress Summary

### ✅ Completed

1. **Plugin Registry Enhanced**
   - Added `getTypes()` - Returns all registered tournament types
   - Added `isRegistered(type)` - Checks if type is registered
   - Added `getAll()` - Returns all plugins
   - Added `getBasic()` - Returns basic tournament plugins
   - Added `getCompound()` - Returns compound tournament plugins

2. **Tournament Creation Route (POST /)**
   - ✅ Replaced hardcoded `validTypes` array with `tournamentPluginRegistry.getTypes()`
   - ✅ Replaced type validation with `tournamentPluginRegistry.isRegistered(type)`
   - ✅ Removed type-specific validation conditionals (PRELIMINARY_WITH_FINAL_PLAYOFF checks)
   - ✅ Replaced tournament creation logic with `plugin.createTournament(context)`
   - ✅ Updated `TournamentCreationContext` to include all necessary fields

3. **Before/After Comparison**

**Before** (Hardcoded):
```typescript
const validTypes = ['ROUND_ROBIN', 'PLAYOFF', 'PRELIMINARY_WITH_FINAL_PLAYOFF', ...];
if (type && !validTypes.includes(type)) {
  return res.status(400).json({ error: `Invalid type` });
}

if (tournamentType === 'PRELIMINARY_WITH_FINAL_PLAYOFF') {
  // 40 lines of validation
}

if (tournamentType === 'PLAYOFF') {
  // Create playoff bracket
}
```

**After** (Plugin-based):
```typescript
const validTypes = tournamentPluginRegistry.getTypes();
if (type && !tournamentPluginRegistry.isRegistered(type)) {
  return res.status(400).json({ error: `Invalid type` });
}

const plugin = tournamentPluginRegistry.get(tournamentType);
const createdTournament = await plugin.createTournament(context);
```

### 🔄 In Progress / Remaining

#### 1. Match Creation/Update Routes
**Location**: Lines 1054, 1099, etc.

**Current Code**:
```typescript
if (bracketMatch && bracketMatch.tournament.type === 'PLAYOFF') {
  // Playoff-specific logic
}

if (tournament.type === 'PLAYOFF') {
  // More playoff-specific logic
}
```

**Needs**:
- Replace with plugin query: `plugin.requiresBracketMatches()`
- Or check plugin type: `plugin.isBasic` and plugin type

#### 2. Rating Calculation Routes
**Location**: Lines 1079-1090

**Current Code**:
```typescript
if (tournament.type === 'PLAYOFF') {
  await processMatchRating(..., useIncrementalRating: true);
} else if (tournament.type === 'SINGLE_MATCH') {
  await processMatchRating(..., useIncrementalRating: true);
} else {
  // ROUND_ROBIN - skip per-match rating
}
```

**Needs**:
- Replace with: `if (plugin.shouldRecalculateRatings(tournament))`
- Call: `plugin.calculateMatchRatings({ tournament, match, prisma })`

#### 3. Tournament Completion Routes
**Location**: Lines 1094-1100, 1697-1700

**Current Code**:
```typescript
if (tournament.type === 'SINGLE_MATCH') {
  // Auto-complete
}

if (updatedTournament.type === 'ROUND_ROBIN') {
  await createRatingHistoryForRoundRobinTournament(tournamentId);
}
```

**Needs**:
- Replace with: `if (plugin.isComplete(tournament))`
- Call: `plugin.onMatchCompleted({ tournament, match, prisma })`

#### 4. Match Advancement (Playoff-specific)
**Location**: Lines 1443-1456

**Current Code**:
```typescript
if (match.tournament.type === 'PLAYOFF' && isBeingCompleted && !wasCompleted) {
  const { advanceWinner } = await import('../services/playoffBracketService');
  await advanceWinner(tournamentId, bracketMatchId, winnerId);
}
```

**Needs**:
- Move to PlayoffPlugin's `onMatchCompleted` method
- Plugin handles advancement internally

#### 5. Deletion Validation
**Location**: Lines 1582-1584

**Current Code**:
```typescript
if (tournament.type === 'PLAYOFF' && tournament.matches.length > 0) {
  return res.status(400).json({ error: 'Cannot delete playoff tournament with matches' });
}
```

**Needs**:
- Replace with: `if (!plugin.canDelete(tournament))`

#### 6. Cancellation Routes
**Location**: Lines 1734-1736, 1828-1830

**Current Code**:
```typescript
if (tournament.type !== 'PLAYOFF') {
  return res.status(400).json({ error: 'Only playoff tournaments can be cancelled' });
}
```

**Needs**:
- Replace with: `if (!plugin.canCancel(tournament))`
- Or remove check if all tournament types support cancellation

#### 7. Playoff-Specific Routes
**Location**: Lines 1828-1830, 2182-2184

**Current Code**:
```typescript
if (tournament.type !== 'PLAYOFF') {
  return res.status(400).json({ error: 'Tournament is not a playoff tournament' });
}
```

**Needs**:
- Check plugin type: `if (plugin.type !== 'PLAYOFF')`
- Or create playoff-specific method: `plugin.supportsReseeding()`

#### 8. Bulk Tournament Creation
**Location**: Lines 709-711, 746-748

**Current Code**:
```typescript
if (tournamentData.type && !['ROUND_ROBIN', 'PLAYOFF'].includes(tournamentData.type)) {
  throw new Error(`Invalid tournament type`);
}
```

**Needs**:
- Replace with: `if (tournamentData.type && !tournamentPluginRegistry.isRegistered(tournamentData.type))`

#### 9. Seeding Check
**Location**: Line 1967

**Current Code**:
```typescript
const hasSeeding = tournament.type === 'PLAYOFF' && tournament.matches.length > 0;
```

**Needs**:
- Replace with plugin method: `plugin.hasSeeding(tournament)`
- Or check: `plugin.type === 'PLAYOFF' && tournament.matches.length > 0`

## Refactoring Strategy

### Phase 1: Query Methods (Completed ✅)
- Tournament creation validation
- Type checking

### Phase 2: Event Handlers (Next)
1. Replace rating calculation conditionals
2. Replace match completion conditionals
3. Integrate TournamentEventService

### Phase 3: Lifecycle Methods
1. Replace deletion checks
2. Replace cancellation checks
3. Replace completion checks

### Phase 4: Type-Specific Routes
1. Handle playoff-specific routes
2. Handle compound tournament routes

## Implementation Pattern

For each type conditional:

1. **Identify the conditional**
   ```typescript
   if (tournament.type === 'PLAYOFF') { ... }
   ```

2. **Determine the plugin method**
   - Query: `isComplete()`, `canDelete()`, `canCancel()`
   - Event: `onMatchCompleted()`, `onChildTournamentCompleted()`
   - Calculation: `calculateMatchRatings()`, `shouldRecalculateRatings()`

3. **Replace with plugin delegation**
   ```typescript
   const plugin = tournamentPluginRegistry.get(tournament.type);
   if (plugin.canDelete(tournament)) { ... }
   ```

4. **Move type-specific logic to plugin**
   - Playoff bracket advancement → PlayoffPlugin.onMatchCompleted()
   - Round robin rating calculation → RoundRobinPlugin.calculateMatchRatings()

## Benefits

✅ **No hardcoded type lists** - All types come from plugin registry
✅ **Polymorphic delegation** - Same code works for all tournament types
✅ **Extensible** - Add new types by creating plugins
✅ **Maintainable** - Type-specific logic in plugins, not routes
✅ **Testable** - Test plugins independently

## Next Steps

1. Replace rating calculation conditionals with `plugin.shouldRecalculateRatings()`
2. Replace match completion conditionals with `plugin.onMatchCompleted()`
3. Replace deletion/cancellation conditionals with `plugin.canDelete()` / `plugin.canCancel()`
4. Move playoff advancement logic to PlayoffPlugin
5. Test all routes with plugin delegation
