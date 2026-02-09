# Tournament Event-Driven Plugin Architecture

## Overview

The tournament system now uses an **event-driven plugin architecture** where plugins are queried for state and notified of events, rather than being called imperatively to perform actions.

## Core Principles

1. **Query, Don't Tell**: Routes query plugins about tournament state (`isComplete()`, `canDelete()`, etc.) rather than telling them what to do
2. **Event Notification**: Plugins are notified when events occur (`onMatchCompleted`, `onChildTournamentCompleted`) and can react
3. **Hierarchical Propagation**: Events propagate up the tournament hierarchy (child → parent → grandparent)
4. **Plugin Orchestration**: Compound tournaments orchestrate child tournaments and make decisions based on their state

## Plugin Interface

### Query Methods (Required)
Plugins answer questions about their state:

```typescript
isComplete(tournament): boolean
  // Returns true if tournament is complete based on plugin-specific logic

shouldRecalculateRatings(tournament): boolean
  // Returns true if ratings should be recalculated for this tournament

canDelete(tournament): boolean
  // Returns true if tournament can be deleted

canCancel(tournament): boolean
  // Returns true if tournament can be cancelled
```

### Event Notification Methods (Optional)
Plugins are notified of events and return instructions:

```typescript
onMatchCompleted(event: MatchCompletedEvent): Promise<TournamentStateChangeResult>
  // Called when a match in this tournament completes
  // Can return: { shouldMarkComplete: true } to mark tournament complete

onChildTournamentCompleted(event: ChildTournamentCompletedEvent): Promise<TournamentStateChangeResult>
  // Called when a child tournament completes (compound tournaments only)
  // Can return: 
  //   - { shouldMarkComplete: true } to mark parent complete
  //   - { shouldCreateFinalTournament: true, finalTournamentConfig: {...} } to create finals

calculateMatchRatings(context): Promise<void>
  // Called to calculate ratings for a completed match
  // Each plugin implements its own rating calculation logic
```

### TournamentStateChangeResult
Plugins return this to instruct the system what to do:

```typescript
{
  shouldMarkComplete?: boolean;           // Mark tournament as COMPLETED
  shouldCreateFinalTournament?: boolean;  // Create final tournament phase
  finalTournamentConfig?: any;            // Configuration for final tournament
  message?: string;                       // Log message
}
```

## Basic Tournament Plugins

### RoundRobinPlugin
- **isComplete**: All expected matches are played
- **shouldRecalculateRatings**: Only when tournament completes (not per-match)
- **onMatchCompleted**: Checks if all matches done, returns `shouldMarkComplete: true`
- **calculateMatchRatings**: No-op (ratings calculated on tournament completion)

### PlayoffPlugin
- **isComplete**: Finals match (round 1) is played
- **shouldRecalculateRatings**: After each match
- **onMatchCompleted**: Advances winner to next round, checks if finals complete
- **calculateMatchRatings**: Uses incremental rating calculation per match

### SwissPlugin
- **isComplete**: Checks `swissData.isCompleted`
- **shouldRecalculateRatings**: After each match
- **onMatchCompleted**: Checks if tournament complete
- **calculateMatchRatings**: Per-match rating calculation

## Compound Tournament Architecture

### BaseCompoundTournamentPlugin (Abstract Base Class)
All compound tournaments extend this base class which provides:

**Common Orchestration Logic**:
- Enrichment delegation to child tournament plugins
- Common query method implementations
- Event propagation to child tournaments
- Helper method `createChildTournament()` for creating children

**Abstract Methods** (subclasses must implement):
```typescript
protected abstract hasFinalPhase(): boolean;
  // Returns true if this compound tournament has a final phase

protected abstract handleFinalPhaseLogic(
  parentTournament: any,
  allChildren: any[],
  prisma: any
): Promise<TournamentStateChangeResult>;
  // Implements logic for creating/managing final tournament phase
```

### Specific Compound Plugins

#### PreliminaryWithFinalPlayoffPlugin
- **hasFinalPhase**: `true`
- **handleFinalPhaseLogic**: 
  - When all preliminary groups complete → returns `shouldCreateFinalTournament: true` with playoff config
  - When final playoff completes → returns `shouldMarkComplete: true`

#### PreliminaryWithFinalRoundRobinPlugin
- **hasFinalPhase**: `true`
- **handleFinalPhaseLogic**: 
  - When all preliminary groups complete → returns `shouldCreateFinalTournament: true` with round-robin config
  - When final round-robin completes → returns `shouldMarkComplete: true`

#### MultiRoundRobinsPlugin
- **hasFinalPhase**: `false` (no final phase, just parallel groups)
- **handleFinalPhaseLogic**: Returns empty result (never called)

## TournamentEventService

Central service that handles event propagation and state changes.

### Key Methods

#### `handleMatchCompleted(matchId, tournamentId)`
1. Fetches tournament and match data
2. Calls `plugin.calculateMatchRatings()` if `shouldRecalculateRatings()` returns true
3. Calls `plugin.onMatchCompleted(event)`
4. Executes state changes based on result
5. If tournament now complete, propagates to parent via `handleChildTournamentCompleted()`

#### `handleChildTournamentCompleted(childId, parentId)`
1. Fetches parent and child tournament data
2. Calls `parentPlugin.onChildTournamentCompleted(event)`
3. Executes state changes (mark complete, create finals, etc.)
4. If parent now complete, propagates further up hierarchy

#### `executeStateChanges(tournament, result)`
- Marks tournament as COMPLETED if `shouldMarkComplete: true`
- Creates final tournament if `shouldCreateFinalTournament: true`
- Logs messages

#### `checkTournamentCompletion(tournamentId)`
- Queries plugin to check if tournament is complete
- Returns boolean

#### `triggerCompletionCheck(tournamentId)`
- Manually checks and marks tournament complete if needed
- Propagates to parent if exists

## Event Flow Example

### Scenario: Match completes in a preliminary group of a compound tournament

```
1. Match completed in Round Robin Group 1
   ↓
2. Route calls: tournamentEventService.handleMatchCompleted(matchId, groupTournamentId)
   ↓
3. Event Service:
   - Fetches tournament data
   - Calls RoundRobinPlugin.calculateMatchRatings() → No-op
   - Calls RoundRobinPlugin.onMatchCompleted()
   ↓
4. RoundRobinPlugin checks if all matches done
   - If yes: returns { shouldMarkComplete: true }
   - If no: returns {}
   ↓
5. Event Service executes state changes
   - Marks Group 1 as COMPLETED
   ↓
6. Event Service propagates to parent:
   tournamentEventService.handleChildTournamentCompleted(group1Id, parentId)
   ↓
7. Event Service:
   - Fetches parent tournament data
   - Calls PreliminaryWithFinalPlayoffPlugin.onChildTournamentCompleted()
   ↓
8. PreliminaryWithFinalPlayoffPlugin checks all children:
   - If all preliminaries complete: returns { shouldCreateFinalTournament: true, ... }
   - If final exists and complete: returns { shouldMarkComplete: true }
   - Otherwise: returns {}
   ↓
9. Event Service executes state changes
   - Creates final playoff tournament (if requested)
   - OR marks parent as COMPLETED (if all done)
```

## Integration Points

### Routes Need to Call Event Service

When a match is completed (in match routes):
```typescript
import { tournamentEventService } from '../services/tournamentEventService';

// After match is recorded
await tournamentEventService.handleMatchCompleted(match.id, tournament.id);
```

### Benefits of This Architecture

1. **Separation of Concerns**: Tournament-type logic lives in plugins, not routes
2. **Extensibility**: New tournament types = new plugin class
3. **Testability**: Each plugin can be tested independently
4. **Maintainability**: Clear event flow, no scattered conditionals
5. **Flexibility**: Plugins can make complex decisions (e.g., when to create finals)
6. **Hierarchical**: Events naturally propagate through tournament trees

## Next Steps

1. Integrate `tournamentEventService.handleMatchCompleted()` into match completion routes
2. Implement final tournament creation logic in `executeStateChanges()`
3. Add logic to determine top N players from preliminary groups
4. Test event propagation with compound tournaments
5. Add admin endpoints to manually trigger completion checks
