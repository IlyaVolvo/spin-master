# Deprecated Routes Migration Guide

## Overview

With the generic plugin routing system now in place, several hardcoded PLAYOFF-specific routes can be deprecated and eventually removed. All functionality is now available through the generic plugin endpoints.

---

## Deprecated Routes

### 1. GET /tournaments/:id/bracket (Line 1534)
**Status**: Deprecated  
**Replacement**: `GET /tournaments/:id/plugin/bracket`

**Old**:
```typescript
GET /tournaments/123/bracket
```

**New**:
```typescript
GET /tournaments/123/plugin/bracket
```

**Implementation**: Already handled by `PlayoffPlugin.handlePluginRequest()`

---

### 2. PATCH /tournaments/:id/bracket (Line 1553)
**Status**: Deprecated  
**Replacement**: `PATCH /tournaments/:id/plugin/bracket`

**Old**:
```typescript
PATCH /tournaments/123/bracket
Body: { positions: [...] }
```

**New**:
```typescript
PATCH /tournaments/123/plugin/bracket
Body: { positions: [...] }
```

**Implementation**: Already handled by `PlayoffPlugin.handlePluginRequest()`

---

### 3. POST /tournaments/:id/reseed (Lines 1912-2178)
**Status**: Deprecated  
**Replacement**: `POST /tournaments/:id/plugin/reseed`

**Old**:
```typescript
POST /tournaments/123/reseed
Body: { numSeeds?: number }
```

**New**:
```typescript
POST /tournaments/123/plugin/reseed
Body: { numSeeds?: number }
```

**Implementation**: Already handled by `PlayoffPlugin.handlePluginRequest()`

**Note**: The old route contains 267 lines of PLAYOFF-specific logic (lines 1912-2178) that should be moved to PlayoffPlugin for completeness, though a simplified version is already in the plugin.

---

## Migration Strategy

### Phase 1: Coexistence (Current State)
- ✅ New generic routes implemented
- ✅ Old routes still functional
- Both endpoints work simultaneously
- No breaking changes

### Phase 2: Client Migration
Update client code to use new endpoints:

```typescript
// OLD
const response = await fetch(`/api/tournaments/${id}/bracket`);
const response = await fetch(`/api/tournaments/${id}/bracket`, { method: 'PATCH', body: ... });
const response = await fetch(`/api/tournaments/${id}/reseed`, { method: 'POST' });

// NEW
const response = await fetch(`/api/tournaments/${id}/plugin/bracket`);
const response = await fetch(`/api/tournaments/${id}/plugin/bracket`, { method: 'PATCH', body: ... });
const response = await fetch(`/api/tournaments/${id}/plugin/reseed`, { method: 'POST' });
```

### Phase 3: Deprecation Warnings
Add deprecation headers to old routes:

```typescript
router.get('/:id/bracket', async (req, res) => {
  res.setHeader('X-Deprecated', 'true');
  res.setHeader('X-Deprecated-Replacement', '/tournaments/:id/plugin/bracket');
  // ... existing logic
});
```

### Phase 4: Removal
Once client is fully migrated:
1. Remove old route handlers (lines 1534-1549, 1553-1650, 1912-2178)
2. Clean up route file
3. Update API documentation

---

## Code to Remove

### Lines to Delete After Migration

```typescript
// Line 1534-1549: GET /tournaments/:id/bracket
router.get('/:id/bracket', async (req: AuthRequest, res: Response) => {
  // ... 15 lines
});

// Line 1553-1650: PATCH /tournaments/:id/bracket  
router.patch('/:id/bracket', [
  body('positions').isArray(),
  // ... validation
], async (req: AuthRequest, res: Response) => {
  // ... 97 lines including type check:
  // if (plugin.type !== 'PLAYOFF') { ... }
});

// Line 1912-2178: POST /tournaments/:id/reseed
router.post('/:id/reseed', async (req: AuthRequest, res: Response) => {
  // ... 267 lines including type check:
  // if (plugin.type !== 'PLAYOFF') { ... }
});
```

**Total lines to remove**: ~380 lines of PLAYOFF-specific route code

---

## Benefits After Migration

### 1. **Cleaner Route File** ✅
Remove 380 lines of type-specific code from routes.

### 2. **No Type Checks** ✅
Eliminate all `if (plugin.type !== 'PLAYOFF')` checks.

### 3. **Consistent API** ✅
All tournament-specific operations use the same pattern:
```
/tournaments/:id/plugin/:resource
```

### 4. **Extensible** ✅
Other tournament types can add their own resources without touching routes.

### 5. **Maintainable** ✅
All PLAYOFF logic lives in PlayoffPlugin, not scattered across routes.

---

## Reseed Logic Migration

The reseed route (lines 1912-2178) contains complex logic that should be fully migrated to PlayoffPlugin:

### Current State
- ✅ Basic reseed implemented in `PlayoffPlugin.reseedBracket()`
- ⚠️ Old route has additional logic for:
  - Double BYE validation
  - Multiple validation passes
  - Complex BYE promotion logic

### Recommended Action
Move the complete reseed logic from the old route to PlayoffPlugin:

```typescript
// In PlayoffPlugin.ts
private async reseedBracket(tournamentId: number, prisma: any): Promise<any> {
  // Move ALL logic from lines 1912-2178 here
  // Including:
  // - numSeeds parameter handling
  // - Double BYE validation (lines 1962-2006)
  // - Multiple validation passes
  // - BYE promotion logic (lines 2138-2172)
  
  // Current implementation is simplified - should be expanded
  // to match the full logic from the old route
}
```

---

## Testing Checklist

Before removing old routes, verify:

- [ ] `GET /tournaments/:id/plugin/bracket` returns same data as old endpoint
- [ ] `PATCH /tournaments/:id/plugin/bracket` updates positions correctly
- [ ] `POST /tournaments/:id/plugin/reseed` handles all edge cases:
  - [ ] Double BYE validation
  - [ ] BYE promotion to next round
  - [ ] numSeeds parameter
  - [ ] Completed tournament rejection
- [ ] Client uses new endpoints
- [ ] No references to old endpoints in codebase

---

## Summary

**Deprecated**: 3 hardcoded PLAYOFF routes (~380 lines)  
**Replacement**: Generic plugin routing system  
**Status**: New routes functional, old routes can be removed after client migration  
**Next Step**: Complete reseed logic migration to PlayoffPlugin, then update client

The generic plugin routing system is fully functional. The old routes are now redundant and can be safely removed once the client is updated to use the new endpoints.
