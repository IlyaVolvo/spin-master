# Schedule and Print Plugin Methods

## Overview

Added `getSchedule` and `getPrintableView` as core required methods in the TournamentPlugin interface. These are universal operations needed by all tournament types, regardless of format.

---

## Plugin Interface Updates

### Added Methods

```typescript
interface TournamentPlugin {
  // ... existing methods
  
  // Schedule and print - required for all tournament types
  // Returns match schedule in a standardized format
  // For compound tournaments, aggregates schedules from child tournaments
  getSchedule(context: { tournament: any; prisma: any }): Promise<any>;
  
  // Returns printable view of tournament (for reports, exports, etc.)
  // Format depends on tournament type (bracket view, standings table, etc.)
  getPrintableView(context: { tournament: any; prisma: any }): Promise<any>;
}
```

---

## Why These Are Core Methods

### Universal Need
Every tournament type needs:
1. **Schedule** - When/where matches are played
2. **Printable View** - Human-readable format for reports, exports, displays

### Type-Specific Implementation
While all tournaments need these, the implementation varies:
- **PLAYOFF**: Schedule shows bracket progression, print shows bracket tree
- **ROUND_ROBIN**: Schedule shows round-by-round matches, print shows standings table
- **SWISS**: Schedule shows pairing rounds, print shows current standings
- **Compound**: Aggregates child tournament schedules and views

---

## Implementation Patterns

### Basic Tournament: PlayoffPlugin

```typescript
class PlayoffPlugin implements TournamentPlugin {
  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get all bracket matches with their linked matches
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: { tournamentId: tournament.id },
      include: { match: true },
      orderBy: [{ round: 'desc' }, { position: 'asc' }],
    });
    
    // Group by round
    const schedule = {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      type: 'PLAYOFF',
      rounds: this.groupByRound(bracketMatches),
    };
    
    return schedule;
  }
  
  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get bracket structure
    const { getBracketStructure } = await import('../services/playoffBracketService');
    const bracket = await getBracketStructure(tournament.id);
    
    return {
      type: 'bracket',
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      bracket,
      format: 'tree', // Tree view for printing
    };
  }
  
  private groupByRound(bracketMatches: any[]): any[] {
    const rounds = new Map<number, any[]>();
    
    bracketMatches.forEach(bm => {
      if (!rounds.has(bm.round)) {
        rounds.set(bm.round, []);
      }
      rounds.get(bm.round)!.push(bm);
    });
    
    return Array.from(rounds.entries()).map(([round, matches]) => ({
      round,
      roundName: this.getRoundName(round, rounds.size),
      matches,
    }));
  }
  
  private getRoundName(round: number, totalRounds: number): string {
    if (round === 1) return 'Finals';
    if (round === 2) return 'Semi-Finals';
    if (round === 3) return 'Quarter-Finals';
    return `Round ${totalRounds - round + 1}`;
  }
}
```

---

### Basic Tournament: RoundRobinPlugin

```typescript
class RoundRobinPlugin implements TournamentPlugin {
  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get all matches ordered by round
    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      include: {
        member1: true,
        member2: true,
      },
      orderBy: { round: 'asc' },
    });
    
    // Group by round
    const rounds = new Map<number, any[]>();
    matches.forEach(match => {
      const round = match.round || 1;
      if (!rounds.has(round)) {
        rounds.set(round, []);
      }
      rounds.get(round)!.push(match);
    });
    
    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      type: 'ROUND_ROBIN',
      rounds: Array.from(rounds.entries()).map(([round, matches]) => ({
        round,
        roundName: `Round ${round}`,
        matches,
      })),
    };
  }
  
  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get tournament with all data
    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: {
        participants: { include: { member: true } },
        matches: { include: { member1: true, member2: true } },
      },
    });
    
    // Calculate standings
    const { calculateStandings } = await import('./roundRobinUtils');
    const standings = calculateStandings(fullTournament.matches, fullTournament.participants);
    
    return {
      type: 'standings',
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      standings,
      format: 'table', // Table view for printing
    };
  }
}
```

---

### Compound Tournament: PreliminaryWithFinalPlayoffPlugin

**Key Concept**: Compound tournaments aggregate schedules from their child tournaments.

```typescript
class PreliminaryWithFinalPlayoffPlugin implements TournamentPlugin {
  async getSchedule(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get all child tournaments
    const childTournaments = await prisma.tournament.findMany({
      where: { parentTournamentId: tournament.id },
      orderBy: { createdAt: 'asc' },
    });
    
    // Get schedule from each child tournament
    const childSchedules = await Promise.all(
      childTournaments.map(async (child) => {
        const plugin = tournamentPluginRegistry.get(child.type);
        const schedule = await plugin.getSchedule({ tournament: child, prisma });
        return {
          phase: this.getPhase(child),
          childTournamentId: child.id,
          childTournamentName: child.name,
          schedule,
        };
      })
    );
    
    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
      isCompound: true,
      phases: childSchedules,
    };
  }
  
  async getPrintableView(context: { tournament: any; prisma: any }): Promise<any> {
    const { tournament, prisma } = context;
    
    // Get all child tournaments
    const childTournaments = await prisma.tournament.findMany({
      where: { parentTournamentId: tournament.id },
      include: {
        participants: { include: { member: true } },
        matches: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    
    // Get printable view from each child
    const childViews = await Promise.all(
      childTournaments.map(async (child) => {
        const plugin = tournamentPluginRegistry.get(child.type);
        const view = await plugin.getPrintableView({ tournament: child, prisma });
        return {
          phase: this.getPhase(child),
          childTournamentId: child.id,
          childTournamentName: child.name,
          view,
        };
      })
    );
    
    return {
      type: 'compound',
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      isCompound: true,
      phases: childViews,
      format: 'multi-phase', // Multi-phase view for printing
    };
  }
  
  private getPhase(child: any): string {
    // Determine phase based on child tournament name or metadata
    if (child.name.includes('Preliminary') || child.name.includes('Group')) {
      return 'preliminary';
    }
    if (child.name.includes('Final') || child.name.includes('Playoff')) {
      return 'final';
    }
    return 'unknown';
  }
}
```

---

## Compound Tournament Schedule Aggregation

### Key Principles

1. **Delegation**: Compound tournaments delegate to child tournament plugins
2. **Aggregation**: Results are combined with phase information
3. **Ordering**: Child tournaments are ordered chronologically
4. **Metadata**: Each child's schedule includes phase context

### Example Output

```json
{
  "tournamentId": 123,
  "tournamentName": "Championship Tournament",
  "type": "PRELIMINARY_WITH_FINAL_PLAYOFF",
  "isCompound": true,
  "phases": [
    {
      "phase": "preliminary",
      "childTournamentId": 124,
      "childTournamentName": "Group A",
      "schedule": {
        "type": "ROUND_ROBIN",
        "rounds": [
          { "round": 1, "roundName": "Round 1", "matches": [...] },
          { "round": 2, "roundName": "Round 2", "matches": [...] }
        ]
      }
    },
    {
      "phase": "preliminary",
      "childTournamentId": 125,
      "childTournamentName": "Group B",
      "schedule": {
        "type": "ROUND_ROBIN",
        "rounds": [...]
      }
    },
    {
      "phase": "final",
      "childTournamentId": 126,
      "childTournamentName": "Final Playoff",
      "schedule": {
        "type": "PLAYOFF",
        "rounds": [
          { "round": 1, "roundName": "Finals", "matches": [...] },
          { "round": 2, "roundName": "Semi-Finals", "matches": [...] }
        ]
      }
    }
  ]
}
```

---

## Route Integration

### Generic Schedule Route

```typescript
// GET /tournaments/:id/schedule
router.get('/:id/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = parseInt(req.params.id);
    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);
    const schedule = await plugin.getSchedule({ tournament, prisma });
    
    res.json(schedule);
  } catch (error) {
    logger.error('Error getting schedule', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Generic Print Route

```typescript
// GET /tournaments/:id/print
router.get('/:id/print', async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = parseInt(req.params.id);
    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);
    const printView = await plugin.getPrintableView({ tournament, prisma });
    
    res.json(printView);
  } catch (error) {
    logger.error('Error getting printable view', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

---

## Benefits

### 1. **Universal Interface** ✅
All tournament types implement the same schedule/print interface.

### 2. **Type-Specific Formatting** ✅
Each plugin formats data appropriately for its type:
- PLAYOFF: Bracket tree
- ROUND_ROBIN: Standings table
- SWISS: Pairing list

### 3. **Compound Aggregation** ✅
Compound tournaments automatically aggregate child schedules:
- No special handling in routes
- Plugin handles delegation
- Clean hierarchical structure

### 4. **Extensible** ✅
New tournament types just implement these methods.

### 5. **Clean Routes** ✅
Routes are simple passthroughs - no type-specific logic.

---

## Summary

**Added**: `getSchedule` and `getPrintableView` as required plugin methods  
**Pattern**: Basic plugins return type-specific data; compound plugins aggregate child data  
**Result**: Universal schedule/print interface with type-specific implementations

This completes the plugin interface with all core operations that every tournament type needs, while allowing each type to implement them in their own way.
