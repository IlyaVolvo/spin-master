# Refactoring Example: Using Plugin System in Tournaments.tsx

## Before: Conditional Logic Everywhere

```typescript
// Tournaments.tsx - OLD APPROACH (simplified example)

const Tournaments: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  
  // Rendering tournament panels with conditionals
  const renderTournamentPanel = (tournament: Tournament) => {
    if (tournament.status === 'ACTIVE') {
      // Active tournament rendering
      if (tournament.type === 'PLAYOFF') {
        return (
          <div className="playoff-active">
            {/* 200 lines of playoff-specific UI */}
            <BracketDisplay tournament={tournament} />
            <MatchRecording onMatchUpdate={handleMatchUpdate} />
            {/* ... more playoff UI */}
          </div>
        );
      } else if (tournament.type === 'ROUND_ROBIN') {
        return (
          <div className="roundrobin-active">
            {/* 200 lines of round robin-specific UI */}
            <MatchGrid tournament={tournament} />
            <StandingsTable tournament={tournament} />
            {/* ... more round robin UI */}
          </div>
        );
      } else if (tournament.type === 'SWISS') {
        return (
          <div className="swiss-active">
            {/* 200 lines of Swiss-specific UI */}
            <CurrentRoundPairings tournament={tournament} />
            <GenerateNextRound tournament={tournament} />
            {/* ... more Swiss UI */}
          </div>
        );
      }
    } else {
      // Completed tournament rendering
      if (tournament.type === 'PLAYOFF') {
        return <div>{/* Playoff completed UI */}</div>;
      } else if (tournament.type === 'ROUND_ROBIN') {
        return <div>{/* Round robin completed UI */}</div>;
      }
      // ... more conditionals
    }
  };
  
  // More conditional logic for calculations
  const calculateExpectedMatches = (tournament: Tournament) => {
    if (tournament.type === 'PLAYOFF') {
      return tournament.participants.length - 1;
    } else if (tournament.type === 'ROUND_ROBIN') {
      const n = tournament.participants.length;
      return (n * (n - 1)) / 2;
    } else if (tournament.type === 'SWISS') {
      return tournament.participants.length * tournament.swissData.rounds;
    }
    return 0;
  };
  
  // More conditional logic for deletion
  const canDelete = (tournament: Tournament) => {
    if (tournament.type === 'PLAYOFF') {
      return tournament.matches.length === 0;
    } else if (tournament.type === 'ROUND_ROBIN') {
      return tournament.matches.length === 0;
    }
    // ... more conditionals
    return false;
  };
  
  return (
    <div>
      {tournaments.map(tournament => (
        <div key={tournament.id}>
          {renderTournamentPanel(tournament)}
        </div>
      ))}
    </div>
  );
};
```

## After: Plugin-Based Approach

```typescript
// Tournaments.tsx - NEW APPROACH

import { tournamentPluginRegistry } from './plugins';

const Tournaments: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [expandedTournaments, setExpandedTournaments] = useState<Set<number>>(new Set());
  
  // Generic handlers
  const handleTournamentUpdate = (tournament: Tournament) => {
    setTournaments(prev => 
      prev.map(t => t.id === tournament.id ? tournament : t)
    );
  };
  
  const handleMatchUpdate = (match: Match) => {
    // Update tournament with new match
  };
  
  const handleError = (error: string) => {
    console.error(error);
    // Show error toast
  };
  
  const handleSuccess = (message: string) => {
    console.log(message);
    // Show success toast
  };
  
  const toggleExpanded = (tournamentId: number) => {
    setExpandedTournaments(prev => {
      const next = new Set(prev);
      if (next.has(tournamentId)) {
        next.delete(tournamentId);
      } else {
        next.add(tournamentId);
      }
      return next;
    });
  };
  
  // Simplified rendering - no conditionals!
  const renderTournamentPanel = (tournament: Tournament) => {
    const plugin = tournamentPluginRegistry.get(tournament.type);
    
    const baseProps = {
      tournament,
      onTournamentUpdate: handleTournamentUpdate,
      onError: handleError,
      onSuccess: handleSuccess,
    };
    
    if (tournament.status === 'ACTIVE') {
      return plugin.createActivePanel({
        ...baseProps,
        onMatchUpdate: handleMatchUpdate,
      });
    } else {
      return plugin.createCompletedPanel({
        ...baseProps,
        isExpanded: expandedTournaments.has(tournament.id),
        onToggleExpand: () => toggleExpanded(tournament.id),
      });
    }
  };
  
  // Simplified calculations - delegate to plugin
  const calculateExpectedMatches = (tournament: Tournament) => {
    const plugin = tournamentPluginRegistry.get(tournament.type);
    return plugin.calculateExpectedMatches(tournament);
  };
  
  // Simplified deletion check - delegate to plugin
  const canDelete = (tournament: Tournament) => {
    const plugin = tournamentPluginRegistry.get(tournament.type);
    return plugin.canDeleteTournament(tournament);
  };
  
  // Simplified deletion
  const handleDelete = async (tournament: Tournament) => {
    const plugin = tournamentPluginRegistry.get(tournament.type);
    const message = plugin.getDeleteConfirmationMessage(tournament);
    
    if (confirm(message)) {
      await fetch(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
      setTournaments(prev => prev.filter(t => t.id !== tournament.id));
    }
  };
  
  return (
    <div>
      {tournaments.map(tournament => (
        <div key={tournament.id}>
          {renderTournamentPanel(tournament)}
          <button onClick={() => handleDelete(tournament)}>Delete</button>
        </div>
      ))}
    </div>
  );
};
```

## Key Improvements

### 1. No More Conditionals

**Before**: 50+ if/else statements checking `tournament.type`
**After**: Single plugin lookup: `tournamentPluginRegistry.get(tournament.type)`

### 2. Smaller Main Component

**Before**: 1000+ lines in Tournaments.tsx
**After**: ~200 lines in Tournaments.tsx (orchestration only)

### 3. Type-Specific Logic Encapsulated

**Before**: All tournament logic mixed together
**After**: Each tournament type in its own files

### 4. Easy to Add New Tournament Types

**Before**: Add conditionals everywhere
**After**: Create new plugin class + components, register it

### 5. Testable Components

**Before**: Hard to test specific tournament types
**After**: Test each plugin independently

## Tournament Creation Example

### Before

```typescript
const handleCreateTournament = async (data: any) => {
  if (data.type === 'PLAYOFF') {
    // Playoff-specific creation logic
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        type: 'PLAYOFF',
        participantIds: data.participantIds,
        bracketPositions: data.bracketPositions,
      }),
    });
    // ... handle response
  } else if (data.type === 'ROUND_ROBIN') {
    // Round robin-specific creation logic
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        type: 'ROUND_ROBIN',
        participantIds: data.participantIds,
      }),
    });
    // ... handle response
  }
  // ... more conditionals
};
```

### After

```typescript
const handleCreateTournament = async (type: TournamentType, data: any) => {
  const plugin = tournamentPluginRegistry.get(type);
  
  // Validate
  const error = plugin.validateSetup(data);
  if (error) {
    handleError(error);
    return;
  }
  
  // Create
  try {
    const tournament = await plugin.createTournament(data);
    setTournaments(prev => [...prev, tournament]);
    handleSuccess('Tournament created successfully');
  } catch (err) {
    handleError('Failed to create tournament');
  }
};
```

## Setup Panel Example

### Before (in Tournaments.tsx)

```typescript
const renderSetupPanel = () => {
  const [selectedType, setSelectedType] = useState<TournamentType>();
  
  if (selectedType === 'PLAYOFF') {
    return (
      <div>
        {/* 100 lines of playoff setup UI */}
        <PlayerSelection />
        <BracketPositioning />
        <button onClick={handleCreatePlayoff}>Create</button>
      </div>
    );
  } else if (selectedType === 'ROUND_ROBIN') {
    return (
      <div>
        {/* 100 lines of round robin setup UI */}
        <PlayerSelection />
        <button onClick={handleCreateRoundRobin}>Create</button>
      </div>
    );
  }
  // ... more conditionals
};
```

### After (in Tournaments.tsx)

```typescript
const renderSetupPanel = () => {
  const [selectedType, setSelectedType] = useState<TournamentType>();
  
  if (!selectedType) {
    return (
      <div>
        <h3>Select Tournament Type</h3>
        {tournamentPluginRegistry.getAll().map(plugin => (
          <button key={plugin.type} onClick={() => setSelectedType(plugin.type)}>
            {plugin.name}
          </button>
        ))}
      </div>
    );
  }
  
  const plugin = tournamentPluginRegistry.get(selectedType);
  
  return plugin.createSetupPanel({
    tournament: null,
    onComplete: (tournament) => {
      setTournaments(prev => [...prev, tournament]);
      setSelectedType(undefined);
    },
    onCancel: () => setSelectedType(undefined),
    onError: handleError,
    onSuccess: handleSuccess,
  });
};
```

## Compound Tournament Example

### Before

```typescript
const renderCompoundTournament = (tournament: Tournament) => {
  if (tournament.type === 'PRELIMINARY_WITH_FINAL_PLAYOFF') {
    return (
      <div>
        <h3>{tournament.name}</h3>
        {tournament.childTournaments?.map(child => {
          if (child.type === 'ROUND_ROBIN') {
            return renderRoundRobinActive(child);
          } else if (child.type === 'PLAYOFF') {
            return renderPlayoffActive(child);
          }
        })}
      </div>
    );
  }
  // ... more compound tournament conditionals
};
```

### After

```typescript
const renderCompoundTournament = (tournament: Tournament) => {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  
  // Plugin automatically delegates to child tournament plugins
  return plugin.createActivePanel({
    tournament,
    onTournamentUpdate: handleTournamentUpdate,
    onMatchUpdate: handleMatchUpdate,
    onError: handleError,
    onSuccess: handleSuccess,
  });
};
```

The `BaseCompoundPlugin` handles all the delegation automatically!

## Summary

The plugin architecture transforms Tournaments.tsx from a monolithic component with hundreds of conditionals into a clean orchestrator that delegates to specialized plugins. Each tournament type's UI and logic is now in its own dedicated files, making the codebase more maintainable, testable, and extensible.
