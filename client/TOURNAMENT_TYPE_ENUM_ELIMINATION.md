# TournamentType Enum Elimination - Complete

## Overview

Replaced the static `TournamentType` enum with a dynamic string type. Tournament types are now determined by the plugin registry at runtime, not hardcoded at compile time.

---

## Key Change

### Before (Static Enum)
```typescript
// client/src/types/tournament.ts
export enum TournamentType {
  // Basic tournaments
  ROUND_ROBIN = 'ROUND_ROBIN',
  PLAYOFF = 'PLAYOFF',
  SWISS = 'SWISS',
  
  // Compound tournaments
  MULTI_ROUND_ROBINS = 'MULTI_ROUND_ROBINS',
  PRELIMINARY_WITH_FINAL_PLAYOFF = 'PRELIMINARY_WITH_FINAL_PLAYOFF',
  PRELIMINARY_WITH_FINAL_ROUND_ROBIN = 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
}
```

### After (Dynamic String Type)
```typescript
// client/src/types/tournament.ts
// Tournament Type
// Tournament types are dynamically registered via the plugin system
// No longer a static enum - types come from the tournament plugin registry
// Common types: 'ROUND_ROBIN', 'PLAYOFF', 'SWISS', 'MULTI_ROUND_ROBINS', 
// 'PRELIMINARY_WITH_FINAL_PLAYOFF', 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN'
export type TournamentType = string;
```

---

## Files Updated

### 1. Type Definition
**File**: `/client/src/types/tournament.ts`

Changed from enum to string type alias. Tournament types are now just strings validated by the plugin registry.

---

### 2. Plugin Definitions
All plugin files updated to use string literals instead of enum values:

#### PlayoffPlugin.tsx
```typescript
// Before
type: TournamentType.PLAYOFF,

// After
type: 'PLAYOFF',
```

#### RoundRobinPlugin.tsx
```typescript
// Before
type: TournamentType.ROUND_ROBIN,

// After
type: 'ROUND_ROBIN',
```

#### SwissPlugin.tsx
```typescript
// Before
type: TournamentType.SWISS,

// After
type: 'SWISS',
```

#### PreliminaryWithFinalPlayoffPlugin.tsx
```typescript
// Before
type: TournamentType.PRELIMINARY_WITH_FINAL_PLAYOFF,

// After
type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
```

#### PreliminaryWithFinalRoundRobinPlugin.tsx
```typescript
// Before
type: TournamentType.PRELIMINARY_WITH_FINAL_ROUND_ROBIN,

// After
type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
```

---

### 3. Plugin Registry Index
**File**: `/client/src/components/tournaments/plugins/index.ts`

#### Before (Hardcoded Array)
```typescript
export const AVAILABLE_TOURNAMENT_TYPES = [
  TournamentType.ROUND_ROBIN,
  TournamentType.PLAYOFF,
  TournamentType.SWISS,
  TournamentType.PRELIMINARY_WITH_FINAL_PLAYOFF,
  TournamentType.PRELIMINARY_WITH_FINAL_ROUND_ROBIN,
];

// Print available types
AVAILABLE_TOURNAMENT_TYPES.forEach(type => {
  const isRegistered = tournamentPluginRegistry.isRegistered(type);
  // ...
});
```

#### After (Dynamic from Registry)
```typescript
// No hardcoded array - get types dynamically from registry

// Print available types
const availableTypes = tournamentPluginRegistry.getTypes();
availableTypes.forEach(type => {
  const plugin = tournamentPluginRegistry.get(type);
  // ...
});
```

---

### 4. Component Usage
**File**: `/client/src/components/MatchEntryPopup.tsx`

#### Before
```typescript
const showForfeitOptions = tournamentType === TournamentType.ROUND_ROBIN || 
                          tournamentType === TournamentType.PLAYOFF;
```

#### After
```typescript
const showForfeitOptions = tournamentType === 'ROUND_ROBIN' || 
                          tournamentType === 'PLAYOFF';
```

---

## Benefits

### 1. **Truly Dynamic Types** ✅
Tournament types are no longer hardcoded in the type system. New types can be added by registering plugins without touching the types file.

### 2. **No Enum Maintenance** ✅
Adding a new tournament type no longer requires:
- Updating the enum
- Recompiling TypeScript
- Updating type guards

Just register a new plugin and it's automatically available.

### 3. **Consistent with Server** ✅
Server already uses string types for tournament types. Client now matches this approach.

### 4. **Plugin-Driven** ✅
The source of truth for available tournament types is the plugin registry, not a hardcoded enum.

### 5. **Extensible** ✅
Third-party plugins can register new tournament types without modifying core code.

---

## How Tournament Types Work Now

### Registration
```typescript
// Plugins register themselves with their type
tournamentPluginRegistry.register({
  type: 'MY_NEW_TYPE',
  name: 'My New Tournament',
  // ... other plugin methods
});
```

### Validation
```typescript
// Check if a type is valid
if (tournamentPluginRegistry.isRegistered('MY_NEW_TYPE')) {
  // Type is valid
}
```

### Getting Available Types
```typescript
// Get all registered types dynamically
const types: string[] = tournamentPluginRegistry.getTypes();
// Returns: ['ROUND_ROBIN', 'PLAYOFF', 'SWISS', ...]
```

### Type Safety
```typescript
// TournamentType is now just string
type TournamentType = string;

// But validation happens at runtime via plugin registry
const plugin = tournamentPluginRegistry.get(tournamentType);
if (!plugin) {
  throw new Error(`Unknown tournament type: ${tournamentType}`);
}
```

---

## Migration Guide

### For New Tournament Types

**Before** (Required enum update):
1. Add to `TournamentType` enum
2. Create plugin
3. Register plugin
4. Recompile

**After** (Just register plugin):
1. Create plugin with `type: 'MY_TYPE'`
2. Register plugin
3. Done! Type is automatically available

### For Type Checking

**Before**:
```typescript
if (tournament.type === TournamentType.PLAYOFF) {
  // ...
}
```

**After**:
```typescript
if (tournament.type === 'PLAYOFF') {
  // ...
}

// Or better - use plugin system
const plugin = tournamentPluginRegistry.get(tournament.type);
if (plugin.type === 'PLAYOFF') {
  // ...
}
```

---

## Architecture Alignment

This change aligns the client with the server architecture:

### Server
- Uses string types for tournament types
- Validates via plugin registry
- No hardcoded enums

### Client (Now)
- Uses string types for tournament types
- Validates via plugin registry
- No hardcoded enums

Both client and server now follow the same pattern: **types are strings validated by the plugin registry**.

---

## Summary

**Removed**: Static `TournamentType` enum  
**Added**: Dynamic `type TournamentType = string`  
**Result**: Tournament types are now fully dynamic and plugin-driven

The type system no longer constrains what tournament types can exist. The plugin registry is the single source of truth for available tournament types, making the system truly extensible.
