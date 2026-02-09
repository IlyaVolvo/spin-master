# Express-Validator Middleware Refactoring

## Problem Identified

The tournament creation route had hardcoded validation middleware that was aware of specific tournament types and their fields.

**Location**: `server/src/routes/tournaments.ts` line 489

---

## What the Old Code Did

### Before (Hardcoded Validation)
```typescript
router.post('/', [
  body('name').optional().trim(),
  body('participantIds').isArray({ min: 2 }),
  body('participantIds.*').isInt({ min: 1 }),
  body('type').optional().isIn(['ROUND_ROBIN', 'PLAYOFF', 'PRELIMINARY_AND_PLAYOFF', 'PRELIMINARY_AND_ROUND_ROBIN', 'SWISS']),
  body('bracketPositions').optional().isArray(), // For PLAYOFF tournaments
  body('roundRobinSize').optional().isInt({ min: 3, max: 12 }), // For PRELIMINARY_AND_PLAYOFF
  body('playoffBracketSize').optional().isInt({ min: 2 }), // For PRELIMINARY_AND_PLAYOFF
  body('groups').optional().isArray(), // For PRELIMINARY_AND_PLAYOFF - array of player ID arrays
], async (req: AuthRequest, res: Response) => {
```

### Issues

1. **Hardcoded Tournament Types**
   ```typescript
   body('type').optional().isIn(['ROUND_ROBIN', 'PLAYOFF', 'PRELIMINARY_AND_PLAYOFF', ...])
   ```
   - Static list of tournament types
   - Must be updated every time a new tournament type is added
   - Violates plugin architecture

2. **Type-Specific Field Validation**
   ```typescript
   body('bracketPositions').optional().isArray(), // For PLAYOFF tournaments
   body('roundRobinSize').optional().isInt({ min: 3, max: 12 }), // For PRELIMINARY_AND_PLAYOFF
   body('playoffBracketSize').optional().isInt({ min: 2 }), // For PRELIMINARY_AND_PLAYOFF
   body('groups').optional().isArray(), // For PRELIMINARY_AND_PLAYOFF
   ```
   - Middleware knows about PLAYOFF-specific fields (bracketPositions)
   - Middleware knows about PRELIMINARY_AND_PLAYOFF-specific fields (roundRobinSize, playoffBracketSize, groups)
   - Routes should not know about type-specific fields

3. **Tight Coupling**
   - Adding a new tournament type requires modifying the route validation
   - Type-specific field requirements are scattered across routes and plugins
   - No single source of truth for what fields a tournament type needs

---

## After (Plugin-Agnostic Validation)

### New Code
```typescript
router.post('/', [
  body('name').optional().trim(),
  body('participantIds').isArray({ min: 2 }),
  body('participantIds.*').isInt({ min: 1 }),
  body('type').optional().isString(), // Type validated against plugin registry in route handler
  // Type-specific fields (bracketPositions, roundRobinSize, etc.) are not validated here
  // Plugins validate their own required fields via plugin.validateSetup() or plugin.createTournament()
], async (req: AuthRequest, res: Response) => {
```

### What Changed

1. **Generic Type Validation**
   ```typescript
   body('type').optional().isString()
   ```
   - Only validates that type is a string
   - Actual type validation happens in route handler via plugin registry
   - No hardcoded list of types

2. **No Type-Specific Field Validation**
   - Removed all type-specific field validations from middleware
   - Fields like `bracketPositions`, `roundRobinSize`, etc. are not validated here
   - Plugins validate their own required fields

3. **Validation Delegation**
   - Type validation: `tournamentPluginRegistry.isRegistered(type)`
   - Field validation: `plugin.createTournament(context)` throws errors if fields are missing/invalid

---

## Validation Flow Now

### 1. Express-Validator Middleware (Generic)
```typescript
// Only validates generic fields that ALL tournaments need
body('name').optional().trim(),
body('participantIds').isArray({ min: 2 }),
body('participantIds.*').isInt({ min: 1 }),
body('type').optional().isString(),
```

### 2. Route Handler (Type Validation)
```typescript
// Validate type against plugin registry
const validTypes = tournamentPluginRegistry.getTypes();
if (type && !tournamentPluginRegistry.isRegistered(type)) {
  return res.status(400).json({ 
    error: `Invalid tournament type: ${type}. Only ${validTypes.join(', ')} are allowed.` 
  });
}
```

### 3. Plugin (Field Validation)
```typescript
// Plugin validates its own required fields
const plugin = tournamentPluginRegistry.get(tournamentType);
const createdTournament = await plugin.createTournament(context);
// Plugin throws error if required fields are missing or invalid
```

---

## Benefits

### 1. **No Hardcoded Types** ✅
Routes don't need to know what tournament types exist. The plugin registry is the source of truth.

### 2. **No Type-Specific Field Knowledge** ✅
Routes don't need to know what fields each tournament type requires. Plugins handle their own validation.

### 3. **Extensible** ✅
Adding a new tournament type:
- **Before**: Update route validation middleware + create plugin
- **After**: Just create and register plugin

### 4. **Single Responsibility** ✅
- **Middleware**: Validates generic request structure
- **Route Handler**: Validates type exists in registry
- **Plugin**: Validates type-specific fields and business logic

### 5. **Maintainable** ✅
Type-specific validation logic lives in one place (the plugin), not scattered across routes.

---

## Example: Adding a New Tournament Type

### Before (Required Route Changes)
```typescript
// 1. Update validation middleware
body('type').optional().isIn([
  'ROUND_ROBIN', 
  'PLAYOFF', 
  'MY_NEW_TYPE' // Add here
]),

// 2. Add type-specific field validation
body('myNewField').optional().isInt(), // For MY_NEW_TYPE

// 3. Create plugin
// 4. Register plugin
```

### After (No Route Changes)
```typescript
// 1. Create plugin with validation logic
class MyNewTypePlugin implements TournamentPlugin {
  type = 'MY_NEW_TYPE';
  
  async createTournament(context: TournamentCreationContext) {
    // Validate myNewField here
    if (!context.myNewField) {
      throw new Error('myNewField is required for MY_NEW_TYPE');
    }
    // Create tournament
  }
}

// 2. Register plugin
tournamentPluginRegistry.register(new MyNewTypePlugin());

// Done! No route changes needed.
```

---

## Validation Responsibilities

### Express-Validator Middleware
**Purpose**: Basic request structure validation  
**Validates**:
- `name` is a string (if provided)
- `participantIds` is an array with at least 2 items
- Each participant ID is an integer
- `type` is a string (if provided)

**Does NOT validate**:
- Whether `type` is a valid tournament type
- Type-specific fields
- Business logic

### Route Handler
**Purpose**: Type existence validation  
**Validates**:
- Tournament type exists in plugin registry
- User has permission (ORGANIZER role)

**Does NOT validate**:
- Type-specific fields
- Business logic

### Plugin
**Purpose**: Type-specific validation and creation  
**Validates**:
- All required fields for this tournament type
- Field values are valid for this type
- Business logic constraints

**Handles**:
- Tournament creation
- Type-specific setup

---

## Summary

**Removed**: Hardcoded tournament types and type-specific field validations from Express-validator middleware

**Result**: Routes are now generic and plugin-agnostic. Validation is properly delegated:
- Middleware → Generic structure
- Route handler → Type exists
- Plugin → Type-specific fields and logic

This completes the separation of concerns and makes the system fully plugin-driven.
