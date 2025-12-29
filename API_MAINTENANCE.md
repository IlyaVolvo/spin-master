# API Documentation Maintenance Guide

This guide explains how to keep `API_DOCUMENTATION.md` up-to-date with the codebase.

## Quick Start

After adding or modifying API endpoints, run:

```bash
cd server
npm run validate-api-docs
```

This will check if all routes are documented and report any missing endpoints.

## When to Update Documentation

### ✅ Must Update

1. **Adding a new endpoint** - Add complete documentation including:
   - HTTP method and path
   - Authentication requirements
   - Request body format with validation rules
   - Response format
   - Status codes
   - Special notes

2. **Modifying an existing endpoint** - Update the relevant section:
   - Change request/response formats
   - Add/remove parameters
   - Change status codes
   - Update authentication requirements

3. **Removing an endpoint** - Remove the documentation section

### 📝 Optional Updates

- Adding examples
- Clarifying descriptions
- Adding notes about edge cases
- Improving formatting

## Documentation Structure

Each endpoint should follow this structure:

```markdown
### METHOD `/api/path`

Brief description of what the endpoint does.

**Path Parameters:** (if applicable)
- `id` - Description (type)

**Query Parameters:** (if applicable)
- `param` - Description (type, optional/required)

**Request Body:**
```json
{
  "field": "description (validation rules)"
}
```

**Response:**
```json
{
  "field": "description"
}
```

**Status Codes:**
- `200` - Success description
- `400` - Error description

**Notes:**
- Any special behaviors or important information
```

## Validation Script

The validation script (`server/scripts/validate-api-docs.ts`) checks:

1. ✅ All routes in code are documented
2. ⚠️ Reports missing documentation

### Running Validation

```bash
# From project root
cd server
npm run validate-api-docs
```

### What It Checks

- Scans all route files (`auth.ts`, `players.ts`, `tournaments.ts`)
- Extracts route definitions (GET, POST, PATCH, DELETE)
- Compares with documented endpoints in `API_DOCUMENTATION.md`
- Reports missing documentation

### Limitations

The script uses pattern matching and may not catch:
- Routes defined with dynamic patterns
- Routes with complex middleware
- Routes defined in unusual ways

Always manually review when adding complex routes.

## Route Files Location

- `server/src/routes/auth.ts` - Authentication endpoints
- `server/src/routes/players.ts` - Player management endpoints  
- `server/src/routes/tournaments.ts` - Tournament management endpoints
- `server/src/index.ts` - Health check endpoint

## Example: Adding a New Endpoint

### 1. Add the route in code

```typescript
// server/src/routes/players.ts
router.get('/:id/stats', async (req, res) => {
  // Implementation
});
```

### 2. Run validation

```bash
npm run validate-api-docs
```

You'll see:
```
⚠️  1 route(s) missing from documentation:
  - GET /api/players/:id/stats (players.ts:120)
```

### 3. Add documentation

Add to `API_DOCUMENTATION.md` in the Players section:

```markdown
### GET `/api/players/:id/stats`
Get statistics for a player.

**Path Parameters:**
- `id` - Player ID (integer)

**Response:**
```json
{
  "playerId": "number",
  "totalMatches": "number",
  "wins": "number",
  "losses": "number"
}
```

**Status Codes:**
- `200` - Success
- `404` - Player not found
- `500` - Internal server error
```

### 4. Verify

Run validation again to confirm:
```bash
npm run validate-api-docs
```

Should show: `✅ All routes are documented!`

## Updating Last Modified Date

When making significant updates, update the date at the top of `API_DOCUMENTATION.md`:

```markdown
**Last Updated:** YYYY-MM-DD
```

## Best Practices

1. **Document as you code** - Add documentation immediately when creating endpoints
2. **Run validation before commits** - Catch missing documentation early
3. **Keep examples accurate** - Ensure JSON examples match actual responses
4. **Document edge cases** - Note special behaviors in the Notes section
5. **Use consistent formatting** - Follow the existing structure

## Troubleshooting

### Validation script fails but route is documented

- Check for typos in the path (case-sensitive)
- Ensure the method matches exactly (GET, POST, etc.)
- Verify the path format matches (with or without leading slash)

### Route not detected by validation

- Check if the route uses an unusual pattern
- Verify the route is in one of the standard route files
- Manually verify the route exists in the code

## Related Files

- `API_DOCUMENTATION.md` - Main API documentation
- `server/scripts/validate-api-docs.ts` - Validation script
- `server/src/routes/` - Route implementation files



