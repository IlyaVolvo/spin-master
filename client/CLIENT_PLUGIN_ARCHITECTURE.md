# Client-Side Tournament Plugin Architecture

## Overview

The client-side tournament system mirrors the server-side plugin architecture. Each tournament type is implemented as a plugin that provides its own React components (TSX files) for setup, active management, schedule display, and completed viewing.

## Directory Structure

```
client/src/
├── plugins/
│   ├── PlayoffPlugin.tsx
│   ├── RoundRobinPlugin.tsx
│   ├── SwissPlugin.tsx
│   ├── BaseCompoundPlugin.tsx
│   ├── PreliminaryWithFinalPlayoffPlugin.tsx
│   ├── PreliminaryWithFinalRoundRobinPlugin.tsx
│   └── MultiRoundRobinsPlugin.tsx
├── components/tournaments/
│   ├── playoff/
│   │   ├── PlayoffSetupPanel.tsx
│   │   ├── PlayoffActivePanel.tsx
│   │   ├── PlayoffSchedulePanel.tsx
│   │   └── PlayoffCompletedPanel.tsx
│   ├── roundrobin/
│   │   ├── RoundRobinSetupPanel.tsx
│   │   ├── RoundRobinActivePanel.tsx
│   │   ├── RoundRobinSchedulePanel.tsx
│   │   └── RoundRobinCompletedPanel.tsx
│   ├── swiss/
│   │   ├── SwissSetupPanel.tsx
│   │   ├── SwissActivePanel.tsx
│   │   ├── SwissSchedulePanel.tsx
│   │   └── SwissCompletedPanel.tsx
│   └── compound/
│       ├── CompoundSetupPanel.tsx
│       ├── CompoundActivePanel.tsx
│       ├── CompoundSchedulePanel.tsx
│       └── CompoundCompletedPanel.tsx
```

## Plugin Interface

Each plugin implements the `TournamentPlugin` interface:

```typescript
interface TournamentPlugin {
  type: TournamentType;
  isBasic: boolean;
  name: string;
  description: string;
  
  // Component creators - return React components
  createSetupPanel(props: TournamentSetupProps): React.ReactNode;
  createActivePanel(props: TournamentActiveProps): React.ReactNode;
  createSchedulePanel(props: TournamentScheduleProps): React.ReactNode;
  createCompletedPanel(props: TournamentCompletedProps): React.ReactNode;
  
  // Validation and creation
  validateSetup(data: any): string | null;
  createTournament(data: any): Promise<Tournament>;
  
  // Tournament-specific calculations
  calculateExpectedMatches(tournament: Tournament): number;
  countPlayedMatches(tournament: Tournament): number;
  areAllMatchesPlayed(tournament: Tournament): boolean;
  canDeleteTournament(tournament: Tournament): boolean;
  
  // Optional features
  generateSchedule?(tournament: Tournament): any[];
  generatePrintContent?(tournament: Tournament): string;
  handleCancellation?(tournament: Tournament): Promise<{ shouldKeepMatches: boolean; message?: string }>;
}
```

## Component Separation

### Before (Monolithic Tournaments.tsx)
All tournament type logic was in one massive file with conditionals:

```typescript
// Tournaments.tsx - 1000+ lines
if (tournament.type === 'PLAYOFF') {
  // Playoff-specific UI
} else if (tournament.type === 'ROUND_ROBIN') {
  // Round robin-specific UI
} else if (tournament.type === 'SWISS') {
  // Swiss-specific UI
}
```

### After (Plugin-based)
Each tournament type has its own components:

```typescript
// PlayoffPlugin.tsx
class PlayoffPlugin implements TournamentPlugin {
  createActivePanel(props) {
    return <PlayoffActivePanel {...props} />;
  }
}

// PlayoffActivePanel.tsx
export const PlayoffActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onMatchUpdate,
  ...
}) => {
  // Playoff-specific UI logic
  return <div>...</div>;
};
```

## Basic Tournament Plugins

### PlayoffPlugin
**Components:**
- `PlayoffSetupPanel` - Player selection and bracket positioning
- `PlayoffActivePanel` - Bracket display with match recording
- `PlayoffSchedulePanel` - Bracket schedule view
- `PlayoffCompletedPanel` - Final bracket with results

**Logic:**
- Expected matches: `playerCount - 1`
- Complete when finals match is played
- Cannot delete if matches exist

### RoundRobinPlugin
**Components:**
- `RoundRobinSetupPanel` - Player selection
- `RoundRobinActivePanel` - Match grid with recording
- `RoundRobinSchedulePanel` - Round-by-round schedule
- `RoundRobinCompletedPanel` - Final standings table

**Logic:**
- Expected matches: `n * (n-1) / 2`
- Complete when all matches played
- Cannot delete if matches exist

### SwissPlugin
**Components:**
- `SwissSetupPanel` - Player selection and round configuration
- `SwissActivePanel` - Current round pairings
- `SwissSchedulePanel` - Round schedule
- `SwissCompletedPanel` - Final standings

**Logic:**
- Expected matches: `playerCount * rounds`
- Complete when all rounds finished
- Cannot delete if matches exist

## Compound Tournament Plugins

### BaseCompoundPlugin (Abstract)
Provides common functionality for all compound tournaments:

**Common Components:**
- `CompoundSetupPanel` - Group configuration
- `CompoundActivePanel` - Child tournament tabs
- `CompoundSchedulePanel` - Combined schedule from children
- `CompoundCompletedPanel` - Aggregated results

**Delegation:**
- Delegates rendering to child tournament plugins
- Aggregates data from child tournaments
- Handles parent-child relationship display

### Specific Compound Plugins

#### PreliminaryWithFinalPlayoffPlugin
- Extends `BaseCompoundPlugin`
- Shows preliminary groups + final playoff bracket
- Displays "Create Finals" button when preliminaries complete

#### PreliminaryWithFinalRoundRobinPlugin
- Extends `BaseCompoundPlugin`
- Shows preliminary groups + final round robin
- Displays "Create Finals" button when preliminaries complete

#### MultiRoundRobinsPlugin
- Extends `BaseCompoundPlugin`
- Shows multiple parallel round robin groups
- No finals phase

## Usage in Tournaments.tsx

### Before
```typescript
// Tournaments.tsx
const renderTournamentPanel = (tournament: Tournament) => {
  if (tournament.type === 'PLAYOFF') {
    return <div>/* 200 lines of playoff UI */</div>;
  } else if (tournament.type === 'ROUND_ROBIN') {
    return <div>/* 200 lines of round robin UI */</div>;
  }
  // ... more conditionals
};
```

### After
```typescript
// Tournaments.tsx
import { tournamentPluginRegistry } from './plugins/TournamentPluginRegistry';

const renderTournamentPanel = (tournament: Tournament) => {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  
  if (tournament.status === 'ACTIVE') {
    return plugin.createActivePanel({
      tournament,
      onMatchUpdate,
      onTournamentUpdate,
      onError,
      onSuccess,
    });
  } else {
    return plugin.createCompletedPanel({
      tournament,
      isExpanded,
      onToggleExpand,
      onTournamentUpdate,
      onError,
      onSuccess,
    });
  }
};
```

## Benefits

1. **Separation of Concerns**: Each tournament type's UI is in its own files
2. **Maintainability**: Easy to find and modify tournament-specific code
3. **Testability**: Each component can be tested independently
4. **Extensibility**: New tournament types = new plugin + components
5. **Code Reusability**: Compound plugins reuse basic plugin components
6. **Type Safety**: TypeScript ensures all plugins implement required methods
7. **Smaller Files**: No more 1000+ line monolithic component

## Migration Strategy

1. Create plugin classes for each tournament type
2. Create component files for each panel type
3. Move UI code from `Tournaments.tsx` to specific panel components
4. Update `Tournaments.tsx` to use plugin registry
5. Remove conditional logic from `Tournaments.tsx`
6. Test each tournament type independently

## Next Steps

1. Complete all basic plugin components (RoundRobin, Swiss)
2. Create BaseCompoundPlugin with common compound logic
3. Implement specific compound plugin components
4. Refactor Tournaments.tsx to use plugin registry
5. Remove old conditional code
6. Add tests for each plugin
