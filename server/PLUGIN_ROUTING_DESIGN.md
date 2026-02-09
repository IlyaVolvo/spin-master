# Plugin-Based Routing System Design

## Problem

Current routes have hardcoded PLAYOFF-specific endpoints:
- `GET /:id/bracket` - Get bracket structure
- `PATCH /:id/bracket` - Update bracket positions
- `POST /:id/reseed` - Reseed bracket by ratings

**Issues**:
1. Routes know about PLAYOFF-specific concepts (bracket, seeding)
2. Type checks: `if (plugin.type !== 'PLAYOFF')`
3. Not extensible - adding new tournament types with custom endpoints requires modifying routes
4. Round Robin, Swiss, etc. can't have their own custom endpoints

---

## Solution: Generic Plugin Action Handler

### Approach 1: Single Action Endpoint

```typescript
POST /tournaments/:id/action
{
  "action": "updateBracket",
  "data": { positions: [...] }
}

POST /tournaments/:id/action
{
  "action": "reseedBracket",
  "data": {}
}

GET /tournaments/:id/action?action=getBracket
```

**Pros**:
- Single endpoint
- Simple to implement

**Cons**:
- Not RESTful
- Mixing GET/POST in one endpoint
- Less clear API

---

### Approach 2: RESTful Plugin Resources (RECOMMENDED)

```typescript
// Generic plugin resource routes
GET    /tournaments/:id/plugin/:resource
POST   /tournaments/:id/plugin/:resource
PATCH  /tournaments/:id/plugin/:resource
DELETE /tournaments/:id/plugin/:resource
```

**Examples**:

```typescript
// PLAYOFF tournament
GET    /tournaments/123/plugin/bracket
PATCH  /tournaments/123/plugin/bracket
POST   /tournaments/123/plugin/reseed

// ROUND_ROBIN tournament
GET    /tournaments/456/plugin/standings
GET    /tournaments/456/plugin/schedule

// SWISS tournament
GET    /tournaments/789/plugin/pairings
POST   /tournaments/789/plugin/next-round
```

**Pros**:
- RESTful
- Clear HTTP method semantics
- Extensible - plugins define their own resources
- Type-agnostic routes

**Cons**:
- Slightly more complex implementation

---

## Implementation

### 1. Add Plugin Method

```typescript
interface TournamentPlugin {
  // ... existing methods
  
  // Handle custom plugin-specific requests
  handlePluginRequest?(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any>;
}
```

### 2. Generic Route Handler

```typescript
// Generic plugin resource handler
const pluginRouteHandler = async (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  req: AuthRequest,
  res: Response
) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const resource = req.params.resource;
    
    if (isNaN(tournamentId)) {
      return res.status(400).json({ error: 'Invalid tournament ID' });
    }
    
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const plugin = tournamentPluginRegistry.get(tournament.type);
    
    if (!plugin.handlePluginRequest) {
      return res.status(404).json({ 
        error: `Tournament type ${tournament.type} does not support custom resources` 
      });
    }
    
    const result = await plugin.handlePluginRequest({
      method,
      resource,
      tournamentId,
      data: req.body,
      query: req.query,
      prisma,
      userId: req.userId,
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Error handling plugin request', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
};

// Register routes
router.get('/:id/plugin/:resource', (req, res) => pluginRouteHandler('GET', req, res));
router.post('/:id/plugin/:resource', (req, res) => pluginRouteHandler('POST', req, res));
router.patch('/:id/plugin/:resource', (req, res) => pluginRouteHandler('PATCH', req, res));
router.delete('/:id/plugin/:resource', (req, res) => pluginRouteHandler('DELETE', req, res));
```

### 3. PlayoffPlugin Implementation

```typescript
class PlayoffPlugin implements TournamentPlugin {
  // ... existing methods
  
  async handlePluginRequest(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any> {
    const { method, resource, tournamentId, data, prisma } = context;
    
    // Route to appropriate handler
    if (resource === 'bracket') {
      if (method === 'GET') {
        return this.getBracketStructure(tournamentId, prisma);
      } else if (method === 'PATCH') {
        return this.updateBracketPositions(tournamentId, data, prisma);
      }
    } else if (resource === 'reseed' && method === 'POST') {
      return this.reseedBracket(tournamentId, prisma);
    }
    
    throw new Error(`Unknown resource: ${method} ${resource}`);
  }
  
  private async getBracketStructure(tournamentId: number, prisma: any) {
    const { getBracketStructure } = await import('../services/playoffBracketService');
    return getBracketStructure(tournamentId);
  }
  
  private async updateBracketPositions(tournamentId: number, data: any, prisma: any) {
    const { positions } = data;
    
    // Batch fetch all bracket matches
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: {
        tournamentId,
        OR: positions.map((pos: any) => ({
          round: pos.round,
          position: pos.position,
        })),
      },
    });
    
    // Create map and update
    const bracketMatchMap = new Map<string, any>();
    bracketMatches.forEach((bm: any) => {
      bracketMatchMap.set(`${bm.round}-${bm.position}`, bm);
    });
    
    const updates: Array<Promise<any>> = [];
    for (const pos of positions) {
      const bracketMatch = bracketMatchMap.get(`${pos.round}-${pos.position}`);
      if (bracketMatch) {
        const isPlayer1 = (pos.position - 1) % 2 === 0;
        updates.push(
          prisma.bracketMatch.update({
            where: { id: bracketMatch.id },
            data: isPlayer1 
              ? { member1Id: pos.memberId || 0 }
              : { member2Id: pos.memberId || 0 },
          })
        );
      }
    }
    
    await Promise.all(updates);
    
    // Return updated bracket
    return this.getBracketStructure(tournamentId, prisma);
  }
  
  private async reseedBracket(tournamentId: number, prisma: any) {
    const { reseedBracket } = await import('../services/playoffBracketService');
    return reseedBracket(tournamentId);
  }
}
```

### 4. RoundRobinPlugin Implementation

```typescript
class RoundRobinPlugin implements TournamentPlugin {
  // ... existing methods
  
  async handlePluginRequest(context: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    resource: string;
    tournamentId: number;
    data?: any;
    query?: any;
    prisma: any;
    userId?: number;
  }): Promise<any> {
    const { method, resource, tournamentId, prisma } = context;
    
    if (resource === 'standings' && method === 'GET') {
      return this.getStandings(tournamentId, prisma);
    } else if (resource === 'schedule' && method === 'GET') {
      return this.getSchedule(tournamentId, prisma);
    }
    
    throw new Error(`Unknown resource: ${method} ${resource}`);
  }
  
  private async getStandings(tournamentId: number, prisma: any) {
    // Calculate and return standings
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true, participants: { include: { member: true } } },
    });
    
    // Calculate standings logic...
    return { standings: [] };
  }
  
  private async getSchedule(tournamentId: number, prisma: any) {
    // Return match schedule
    const matches = await prisma.match.findMany({
      where: { tournamentId },
      orderBy: { round: 'asc' },
    });
    
    return { schedule: matches };
  }
}
```

---

## Benefits

### 1. **Type-Agnostic Routes** ✅
Routes don't know about specific tournament types or their features.

### 2. **No Type Checks** ✅
No more `if (plugin.type !== 'PLAYOFF')` in routes.

### 3. **Extensible** ✅
New tournament types can add custom endpoints without modifying routes:
- PLAYOFF: `bracket`, `reseed`
- ROUND_ROBIN: `standings`, `schedule`
- SWISS: `pairings`, `next-round`
- Custom types: Any resource they need

### 4. **RESTful** ✅
Proper HTTP method semantics:
- GET for retrieval
- POST for creation/actions
- PATCH for updates
- DELETE for removal

### 5. **Clean Separation** ✅
- Routes: Generic request handling, auth, validation
- Plugins: Type-specific business logic

### 6. **Discoverable** ✅
Could add a `GET /tournaments/:id/plugin/resources` endpoint to list available resources for a tournament type.

---

## Migration Path

### Phase 1: Add Generic Routes
1. Add `handlePluginRequest` to TournamentPlugin interface
2. Implement generic route handler
3. Register `/plugin/:resource` routes

### Phase 2: Migrate PLAYOFF Routes
1. Implement `handlePluginRequest` in PlayoffPlugin
2. Move bracket/reseed logic to plugin
3. Keep old routes for backward compatibility (deprecated)

### Phase 3: Remove Old Routes
1. Update client to use new endpoints
2. Remove deprecated routes
3. Clean up route file

---

## API Examples

### Before (Hardcoded)
```typescript
GET    /tournaments/123/bracket
PATCH  /tournaments/123/bracket
POST   /tournaments/123/reseed
```

### After (Generic)
```typescript
GET    /tournaments/123/plugin/bracket
PATCH  /tournaments/123/plugin/bracket
POST   /tournaments/123/plugin/reseed

// New tournament types can add their own
GET    /tournaments/456/plugin/standings
GET    /tournaments/789/plugin/pairings
```

---

## Summary

**Remove**: Hardcoded PLAYOFF-specific routes  
**Add**: Generic plugin resource handler  
**Result**: Tournament types define their own endpoints via plugin method

This completes the plugin architecture - routes become pure passthroughs that delegate all type-specific logic to plugins.
