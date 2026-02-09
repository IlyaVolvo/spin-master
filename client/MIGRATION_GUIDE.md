# Migration Guide: Refactoring Tournaments.tsx to Use Plugin Architecture

## Overview

This guide explains how to migrate the monolithic `Tournaments.tsx` component to use the new plugin-based architecture where each tournament type has its own dedicated components.

## Current State

`Tournaments.tsx` is a large file (~1000+ lines) with conditional logic for each tournament type:

```typescript
// Current approach
if (tournament.type === 'PLAYOFF') {
  // 200+ lines of playoff-specific UI
} else if (tournament.type === 'ROUND_ROBIN') {
  // 200+ lines of round robin-specific UI
} else if (tournament.type === 'SWISS') {
  // 200+ lines of Swiss-specific UI
}
```

## Target State

`Tournaments.tsx` becomes a thin orchestrator that delegates to plugins:

```typescript
// New approach
const plugin = tournamentPluginRegistry.get(tournament.type);
return plugin.createActivePanel(props);
```

## Migration Steps

### Step 1: Initialize Plugins in App.tsx

Add plugin initialization at app startup:

```typescript
// App.tsx
import '../plugins'; // Auto-initializes all plugins

function App() {
  // ... rest of app
}
```

### Step 2: Identify Code Sections to Extract

In `Tournaments.tsx`, identify these sections for each tournament type:

1. **Setup/Creation UI** → Move to `{Type}SetupPanel.tsx`
2. **Active Tournament UI** → Move to `{Type}ActivePanel.tsx`
3. **Schedule Display** → Move to `{Type}SchedulePanel.tsx`
4. **Completed Tournament UI** → Move to `{Type}CompletedPanel.tsx`

### Step 3: Extract Playoff Components (Example)

**Before** (in Tournaments.tsx):
```typescript
const renderPlayoffSetup = () => {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  // ... 100 lines of playoff setup UI
  return <div>...</div>;
};
```

**After** (in PlayoffSetupPanel.tsx):
```typescript
export const PlayoffSetupPanel: React.FC<TournamentSetupProps> = ({
  tournament,
  onComplete,
  onCancel,
  onError,
  onSuccess,
}) => {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  // ... same 100 lines of playoff setup UI
  return <div>...</div>;
};
```

### Step 4: Update Tournaments.tsx to Use Plugins

**Before**:
```typescript
const renderTournamentPanel = (tournament: Tournament) => {
  if (tournament.status === 'ACTIVE') {
    if (tournament.type === 'PLAYOFF') {
      return renderPlayoffActive(tournament);
    } else if (tournament.type === 'ROUND_ROBIN') {
      return renderRoundRobinActive(tournament);
    }
    // ... more conditionals
  }
};
```

**After**:
```typescript
const renderTournamentPanel = (tournament: Tournament) => {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  
  const props = {
    tournament,
    onTournamentUpdate,
    onMatchUpdate,
    onError,
    onSuccess,
  };
  
  if (tournament.status === 'ACTIVE') {
    return plugin.createActivePanel(props);
  } else {
    return plugin.createCompletedPanel({
      ...props,
      isExpanded: expandedTournaments.has(tournament.id),
      onToggleExpand: () => toggleExpanded(tournament.id),
    });
  }
};
```

### Step 5: Extract Tournament-Specific Logic

**Before** (in Tournaments.tsx):
```typescript
const canDeleteTournament = (tournament: Tournament) => {
  if (tournament.type === 'PLAYOFF') {
    return tournament.matches.length === 0;
  } else if (tournament.type === 'ROUND_ROBIN') {
    return tournament.matches.length === 0;
  }
  // ... more conditionals
};
```

**After** (use plugin):
```typescript
const canDeleteTournament = (tournament: Tournament) => {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  return plugin.canDeleteTournament(tournament);
};
```

### Step 6: Remove Conditional Logic

Search for and replace all tournament type conditionals:

**Find patterns like:**
- `if (tournament.type === 'PLAYOFF')`
- `tournament.type === 'ROUND_ROBIN' ? ... : ...`
- `switch (tournament.type)`

**Replace with:**
```typescript
const plugin = tournamentPluginRegistry.get(tournament.type);
// Use plugin methods
```

## Component Extraction Checklist

For each tournament type, extract:

### Playoff
- [ ] Setup UI → `PlayoffSetupPanel.tsx`
- [ ] Active bracket UI → `PlayoffActivePanel.tsx`
- [ ] Schedule view → `PlayoffSchedulePanel.tsx`
- [ ] Completed results → `PlayoffCompletedPanel.tsx`

### Round Robin
- [ ] Setup UI → `RoundRobinSetupPanel.tsx`
- [ ] Active match grid → `RoundRobinActivePanel.tsx`
- [ ] Schedule view → `RoundRobinSchedulePanel.tsx`
- [ ] Completed standings → `RoundRobinCompletedPanel.tsx`

### Swiss
- [ ] Setup UI → `SwissSetupPanel.tsx`
- [ ] Active pairings → `SwissActivePanel.tsx`
- [ ] Schedule view → `SwissSchedulePanel.tsx`
- [ ] Completed standings → `SwissCompletedPanel.tsx`

### Compound Tournaments
- [ ] Use `BaseCompoundPlugin` which delegates to child plugins
- [ ] No custom components needed (reuses basic plugin components)

## Testing Strategy

### 1. Test Each Plugin Independently

```typescript
// Test playoff plugin
const playoffPlugin = new PlayoffPlugin();
const setupPanel = playoffPlugin.createSetupPanel(props);
// Verify panel renders correctly
```

### 2. Test Plugin Registry

```typescript
import { tournamentPluginRegistry } from './plugins';

// Verify all plugins registered
expect(tournamentPluginRegistry.isRegistered(TournamentType.PLAYOFF)).toBe(true);
expect(tournamentPluginRegistry.isRegistered(TournamentType.ROUND_ROBIN)).toBe(true);
```

### 3. Test Tournament Rendering

For each tournament type:
1. Create a test tournament
2. Render using plugin
3. Verify correct component displays
4. Test user interactions (match recording, etc.)

### 4. Integration Testing

1. Test tournament creation flow
2. Test match recording
3. Test tournament completion
4. Test deletion/cancellation

## Common Pitfalls

### 1. Forgetting to Initialize Plugins

**Problem**: `No plugin registered for tournament type: PLAYOFF`

**Solution**: Import `'../plugins'` in App.tsx or main entry point

### 2. Props Mismatch

**Problem**: Component expects different props than plugin provides

**Solution**: Ensure all panel components use standard prop interfaces:
- `TournamentSetupProps`
- `TournamentActiveProps`
- `TournamentScheduleProps`
- `TournamentCompletedProps`

### 3. State Management

**Problem**: State was shared across tournament types in Tournaments.tsx

**Solution**: 
- Move shared state to parent (Tournaments.tsx)
- Pass state and callbacks via props
- Each panel component manages its own local state

### 4. API Calls

**Problem**: API calls were centralized in Tournaments.tsx

**Solution**:
- Keep API calls in plugins (`createTournament`, `handleCancellation`)
- Pass callbacks to components for updates
- Use standard error/success handlers

## Benefits After Migration

1. **Smaller Files**: Each component file is focused and manageable
2. **Easier Testing**: Test each tournament type independently
3. **Better Organization**: Clear separation by tournament type
4. **Extensibility**: Add new tournament types without modifying existing code
5. **Reusability**: Compound tournaments reuse basic tournament components
6. **Type Safety**: TypeScript ensures all plugins implement required methods
7. **Maintainability**: Find and fix bugs in specific tournament types easily

## Rollback Plan

If issues arise during migration:

1. Keep old Tournaments.tsx as `Tournaments.legacy.tsx`
2. Implement new plugin-based version alongside
3. Use feature flag to switch between old and new
4. Test thoroughly before removing legacy code

## Timeline

Suggested migration timeline:

1. **Week 1**: Extract Playoff components and test
2. **Week 2**: Extract Round Robin components and test
3. **Week 3**: Extract Swiss components and test
4. **Week 4**: Implement compound tournament plugins
5. **Week 5**: Full integration testing and bug fixes
6. **Week 6**: Remove legacy code and cleanup

## Next Steps

1. ✅ Plugin architecture created
2. ✅ All plugin classes implemented
3. ✅ Component file structure created
4. ⏳ Extract UI code from Tournaments.tsx to panel components
5. ⏳ Update Tournaments.tsx to use plugin registry
6. ⏳ Test each tournament type
7. ⏳ Remove old conditional logic
8. ⏳ Documentation and cleanup
