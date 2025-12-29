# REST API Documentation

**Last Updated:** 2025-12-04  
**Version:** 1.0  
**Base URL:** `/api`

All endpoints except `/api/auth/register` and `/api/auth/login` require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

> **Note:** This documentation should be updated whenever new endpoints are added or existing endpoints are modified. See the [Maintenance](#maintenance) section below for details.

---

## Health Check

### GET `/api/health`
Check server health status.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Authentication (`/api/auth`)

### POST `/api/auth/register`
Register a new user (for initial setup).

**Request Body:**
```json
{
  "username": "string (min: 3)",
  "password": "string (min: 6)"
}
```

**Response:**
```json
{
  "token": "string",
  "userId": "number"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error or username already exists
- `500` - Internal server error

---

### POST `/api/auth/login`
Login and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "userId": "number"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Invalid credentials
- `500` - Internal server error

---

### POST `/api/auth/change-password`
Change password for authenticated user.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (min: 6)"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Authentication required or incorrect current password
- `404` - User not found
- `500` - Internal server error

---

## Players (`/api/players`)

All player endpoints require authentication.

### GET `/api/players`
Get all players (active and inactive).

**Response:**
```json
[
  {
    "id": "number",
    "firstName": "string",
    "lastName": "string",
    "birthDate": "string (ISO 8601) | null",
    "rating": "number | null",
    "isActive": "boolean",
    "_count": {
      "tournamentParticipants": "number"
    }
  }
]
```

**Status Codes:**
- `200` - Success
- `500` - Internal server error

---

### GET `/api/players/active`
Get only active players.

**Response:**
Same format as GET `/api/players`, but only includes players where `isActive: true`.

**Status Codes:**
- `200` - Success
- `500` - Internal server error

---

### GET `/api/players/:id`
Get a single player by ID.

**Path Parameters:**
- `id` - Player ID (integer)

**Response:**
```json
{
  "id": "number",
  "firstName": "string",
  "lastName": "string",
  "birthDate": "string (ISO 8601) | null",
  "rating": "number | null",
  "isActive": "boolean",
  "rankingHistory": [
    {
      "id": "number",
      "playerId": "number",
      "ranking": "number",
      "timestamp": "string (ISO 8601)",
      "reason": "string",
      "tournamentId": "number | null"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid player ID
- `404` - Player not found
- `500` - Internal server error

---

### POST `/api/players`
Create a new player.

**Request Body:**
```json
{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "birthDate": "string (ISO 8601, optional)",
  "rating": "number (0-9999, optional)",
  "skipSimilarityCheck": "boolean (optional)"
}
```

**Response (if similar names found):**
```json
{
  "requiresConfirmation": true,
  "message": "Similar player names found",
  "similarNames": [
    {
      "name": "string",
      "similarity": "number (0-100)"
    }
  ],
  "proposedFirstName": "string",
  "proposedLastName": "string",
  "proposedBirthDate": "string | null",
  "proposedRating": "number | null"
}
```

**Response (on success):**
```json
{
  "id": "number",
  "firstName": "string",
  "lastName": "string",
  "birthDate": "string (ISO 8601) | null",
  "rating": "number | null",
  "isActive": true
}
```

**Status Codes:**
- `200` - Similar names found (requires confirmation)
- `201` - Player created successfully
- `400` - Validation error or duplicate name
- `500` - Internal server error

---

### PATCH `/api/players/:id/deactivate`
Deactivate a player.

**Path Parameters:**
- `id` - Player ID (integer)

**Response:**
```json
{
  "id": "number",
  "firstName": "string",
  "lastName": "string",
  "isActive": false
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid player ID
- `500` - Internal server error

---

### PATCH `/api/players/:id/activate`
Reactivate a player.

**Path Parameters:**
- `id` - Player ID (integer)

**Response:**
```json
{
  "id": "number",
  "firstName": "string",
  "lastName": "string",
  "isActive": true
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid player ID
- `500` - Internal server error

---

### POST `/api/players/rating-history`
Get rating history for one or more players.

**Request Body:**
```json
{
  "playerIds": ["number (min: 1)"]
}
```

**Response:**
```json
[
  {
    "playerId": "number",
    "firstName": "string",
    "lastName": "string",
    "history": [
      {
        "date": "string (ISO 8601)",
        "rating": "number | null",
        "tournamentId": "number | null",
        "tournamentName": "string | null"
      }
    ]
  }
]
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `500` - Internal server error

---

### POST `/api/players/match-history`
Get match history between a player and selected opponents.

**Request Body:**
```json
{
  "playerId": "number (min: 1)",
  "opponentIds": ["number (min: 1)"]
}
```

**Response:**
```json
{
  "player": {
    "id": "number",
    "firstName": "string",
    "lastName": "string"
  },
  "opponents": [
    {
      "id": "number",
      "firstName": "string",
      "lastName": "string"
    }
  ],
  "matches": [
    {
      "id": "number",
      "tournamentId": "number",
      "tournamentName": "string",
      "tournamentStatus": "string",
      "tournamentDate": "string (ISO 8601)",
      "opponentId": "number",
      "opponentName": "string",
      "playerSets": "number",
      "opponentSets": "number",
      "playerForfeit": "boolean",
      "opponentForfeit": "boolean",
      "matchDate": "string (ISO 8601)"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `404` - Player not found
- `500` - Internal server error

---

## Tournaments (`/api/tournaments`)

All tournament endpoints require authentication.

### GET `/api/tournaments`
Get all tournaments (active and completed).

**Response:**
```json
[
  {
    "id": "number",
    "name": "string | null",
    "type": "ROUND_ROBIN | PLAYOFF | SINGLE_MATCH",
    "status": "ACTIVE | COMPLETED",
    "createdAt": "string (ISO 8601)",
    "recordedAt": "string (ISO 8601)",
    "participants": [
      {
        "id": "number",
        "playerId": "number",
        "playerRatingAtTime": "number | null",
        "postRatingAtTime": "number | null (for completed tournaments)",
        "player": {
          "id": "number",
          "firstName": "string",
          "lastName": "string",
          "rating": "number | null"
        }
      }
    ],
    "matches": [
      {
        "id": "number",
        "player1Id": "number",
        "player2Id": "number",
        "player1Sets": "number",
        "player2Sets": "number",
        "player1Forfeit": "boolean",
        "player2Forfeit": "boolean",
        "round": "number | null (for PLAYOFF)",
        "position": "number | null (for PLAYOFF)",
        "nextMatchId": "number | null (for PLAYOFF)"
      }
    ],
    "_count": {
      "participants": "number",
      "matches": "number"
    }
  }
]
```

**Status Codes:**
- `200` - Success
- `500` - Internal server error

---

### GET `/api/tournaments/active`
Get only active tournaments.

**Response:**
Same format as GET `/api/tournaments`, but only includes tournaments where `status: "ACTIVE"`. Matches are ordered by `round` and `position` (for PLAYOFF tournaments).

**Status Codes:**
- `200` - Success
- `500` - Internal server error

---

### GET `/api/tournaments/:id`
Get a single tournament by ID.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Response:**
```json
{
  "id": "number",
  "name": "string | null",
  "type": "ROUND_ROBIN | PLAYOFF | SINGLE_MATCH",
  "status": "ACTIVE | COMPLETED",
  "createdAt": "string (ISO 8601)",
  "recordedAt": "string (ISO 8601)",
  "participants": [
    {
      "id": "number",
      "playerId": "number",
      "playerRatingAtTime": "number | null",
      "player": {
        "id": "number",
        "firstName": "string",
        "lastName": "string",
        "rating": "number | null"
      }
    }
  ],
  "matches": [
    {
      "id": "number",
      "player1Id": "number",
      "player2Id": "number",
      "player1Sets": "number",
      "player2Sets": "number",
      "player1Forfeit": "boolean",
      "player2Forfeit": "boolean",
      "round": "number | null",
      "position": "number | null",
      "nextMatchId": "number | null"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid tournament ID
- `404` - Tournament not found
- `500` - Internal server error

---

### POST `/api/tournaments`
Create a new tournament.

**Request Body:**
```json
{
  "name": "string (optional)",
  "participantIds": ["number (min: 2)"],
  "type": "ROUND_ROBIN | PLAYOFF | SINGLE_MATCH (optional, default: ROUND_ROBIN)",
  "bracketPositions": ["number | null"] (optional, for PLAYOFF tournaments)
}
```

**Response:**
```json
{
  "id": "number",
  "name": "string | null",
  "type": "string",
  "status": "ACTIVE",
  "createdAt": "string (ISO 8601)",
  "recordedAt": "string (ISO 8601)",
  "participants": [...],
  "matches": [...]
}
```

**Status Codes:**
- `201` - Tournament created successfully
- `400` - Validation error or invalid participants
- `500` - Internal server error

**Notes:**
- For `SINGLE_MATCH` type, exactly 2 players are required
- For `PLAYOFF` type, `bracketPositions` can be provided to set initial bracket positions
- Tournament name is auto-generated if not provided

---

### POST `/api/tournaments/bulk`
Create multiple tournaments at once.

**Request Body:**
```json
{
  "tournaments": [
    {
      "name": "string (optional)",
      "participantIds": ["number (min: 2)"],
      "type": "ROUND_ROBIN | PLAYOFF | SINGLE_MATCH (optional, default: ROUND_ROBIN)"
    }
  ]
}
```

**Response:**
```json
{
  "tournaments": [
    {
      "id": "number",
      "name": "string | null",
      "type": "string",
      "status": "ACTIVE",
      "participants": [...]
    }
  ]
}
```

**Status Codes:**
- `201` - Tournaments created successfully
- `400` - Validation error or invalid participants
- `500` - Internal server error

---

### POST `/api/tournaments/:id/matches`
Add a match result to a tournament.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Request Body:**
```json
{
  "player1Id": "number (min: 1)",
  "player2Id": "number (min: 1)",
  "player1Sets": "number (min: 0, optional)",
  "player2Sets": "number (min: 0, optional)",
  "player1Forfeit": "boolean (optional)",
  "player2Forfeit": "boolean (optional)"
}
```

**Response:**
```json
{
  "id": "number",
  "tournamentId": "number",
  "player1Id": "number",
  "player2Id": "number",
  "player1Sets": "number",
  "player2Sets": "number",
  "player1Forfeit": "boolean",
  "player2Forfeit": "boolean"
}
```

**Status Codes:**
- `201` - Match created successfully
- `400` - Validation error, tournament not active, or invalid players
- `404` - Tournament not found
- `500` - Internal server error

**Notes:**
- For `SINGLE_MATCH` tournaments, the tournament is automatically completed after match creation
- Only one player can forfeit per match
- If a player forfeits, scores are automatically set (forfeiting player: 0 sets, opponent: 1 set)

---

### PATCH `/api/tournaments/:tournamentId/matches/:matchId`
Update a match result.

**Path Parameters:**
- `tournamentId` - Tournament ID (integer)
- `matchId` - Match ID (integer)

**Request Body:**
```json
{
  "player1Sets": "number (min: 0, optional)",
  "player2Sets": "number (min: 0, optional)",
  "player1Forfeit": "boolean (optional)",
  "player2Forfeit": "boolean (optional)"
}
```

**Response:**
```json
{
  "id": "number",
  "tournamentId": "number",
  "player1Id": "number",
  "player2Id": "number",
  "player1Sets": "number",
  "player2Sets": "number",
  "player1Forfeit": "boolean",
  "player2Forfeit": "boolean"
}
```

**Status Codes:**
- `200` - Match updated successfully
- `400` - Validation error or match doesn't belong to tournament
- `404` - Match not found
- `500` - Internal server error

**Notes:**
- For `PLAYOFF` tournaments, completing a match automatically advances the winner to the next round
- Rankings are recalculated if the tournament is completed

---

### DELETE `/api/tournaments/:tournamentId/matches/:matchId`
Delete a match.

**Path Parameters:**
- `tournamentId` - Tournament ID (integer)
- `matchId` - Match ID (integer)

**Status Codes:**
- `204` - Match deleted successfully
- `400` - Invalid tournament or match ID
- `404` - Match not found
- `500` - Internal server error

**Notes:**
- Rankings are recalculated if the tournament is completed

---

### PATCH `/api/tournaments/:id/name`
Update tournament name.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Request Body:**
```json
{
  "name": "string (optional)"
}
```

**Response:**
```json
{
  "id": "number",
  "name": "string | null",
  "participants": [...],
  "matches": [...]
}
```

**Status Codes:**
- `200` - Tournament name updated successfully
- `400` - Invalid tournament ID
- `404` - Tournament not found
- `500` - Internal server error

---

### DELETE `/api/tournaments/:id`
Delete a tournament.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Response:**
```json
{
  "message": "Tournament deleted successfully"
}
```

**Status Codes:**
- `200` - Tournament deleted successfully
- `400` - Invalid tournament ID or tournament is completed
- `404` - Tournament not found
- `500` - Internal server error

**Notes:**
- Cannot delete completed tournaments
- Matches and participants are cascade deleted

---

### PATCH `/api/tournaments/:id/complete`
Mark a tournament as completed.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Response:**
```json
{
  "id": "number",
  "name": "string | null",
  "status": "COMPLETED",
  "participants": [...],
  "matches": [...]
}
```

**Status Codes:**
- `200` - Tournament completed successfully
- `400` - Invalid tournament ID or tournament already completed
- `404` - Tournament not found
- `500` - Internal server error

**Notes:**
- Rankings are automatically recalculated for all players

---

### GET `/api/tournaments/:id/bracket`
Get bracket structure for a playoff tournament.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Response:**
```json
{
  "rounds": [
    {
      "round": "number",
      "matches": [
        {
          "matchId": "number",
          "position": "number",
          "player1Id": "number | null",
          "player2Id": "number | null",
          "player1IsBye": "boolean",
          "player2IsBye": "boolean",
          "winnerId": "number | null",
          "nextMatchId": "number | null",
          "nextMatchPosition": "number | null"
        }
      ]
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid tournament ID
- `500` - Internal server error

---

### PATCH `/api/tournaments/:id/bracket`
Update bracket positions (for drag-and-drop in playoff tournaments).

**Path Parameters:**
- `id` - Tournament ID (integer)

**Request Body:**
```json
{
  "positions": [
    {
      "round": "number (min: 1)",
      "position": "number (min: 1)",
      "playerId": "number (min: 1, optional)"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Bracket positions updated successfully"
}
```

**Status Codes:**
- `200` - Bracket positions updated successfully
- `400` - Validation error, invalid tournament ID, or tournament is not a playoff tournament
- `404` - Tournament not found
- `500` - Internal server error

---

### POST `/api/tournaments/:id/reseed`
Re-seed a playoff tournament bracket by ratings.

**Path Parameters:**
- `id` - Tournament ID (integer)

**Response:**
```json
{
  "message": "Bracket reseeded successfully"
}
```

**Status Codes:**
- `200` - Bracket reseeded successfully
- `400` - Invalid tournament ID, tournament is not a playoff tournament, or tournament is completed
- `404` - Tournament not found
- `500` - Internal server error

**Notes:**
- Only reseeds first round matches
- Uses USATT seeding algorithm to place players

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "string (error message)"
}
```

For validation errors:
```json
{
  "errors": [
    {
      "msg": "string",
      "param": "string",
      "location": "string"
    }
  ]
}
```

---

## Authentication

JWT tokens are valid for 7 days. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

If authentication fails, the API returns:
- `401 Unauthorized` - Missing or invalid token
- `401 Unauthorized` - Invalid credentials (for login)

---

## Tournament Types

- **ROUND_ROBIN**: All players play against each other
- **PLAYOFF**: Single elimination tournament with bracket
- **SINGLE_MATCH**: Single match between two players (auto-completes after match)

**Note:** Multi-tournament mode is a UI feature that creates multiple separate ROUND_ROBIN tournaments. It is not a tournament type - each created tournament has type ROUND_ROBIN.

---

## Status Codes Summary

- `200` - Success
- `201` - Created
- `204` - No Content (successful deletion)
- `400` - Bad Request (validation error, invalid input)
- `401` - Unauthorized (authentication required or failed)
- `404` - Not Found
- `500` - Internal Server Error

---

## Maintenance

This documentation should be kept up-to-date with the codebase. For detailed maintenance instructions, see [API_MAINTENANCE.md](./API_MAINTENANCE.md).

When making changes:

### Adding New Endpoints

1. Add the endpoint to the appropriate section in this document
2. Include:
   - HTTP method and path
   - Authentication requirements
   - Request body format (with validation rules)
   - Response format
   - Status codes
   - Any special notes or behaviors

### Modifying Existing Endpoints

1. Update the relevant endpoint documentation
2. Note any breaking changes in the changelog (if maintained)
3. Update the "Last Updated" date at the top of this document

### Validation

Run the validation script to check for missing endpoints:

```bash
cd server
npm run validate-api-docs
```

Or manually verify by:
1. Checking all route files in `server/src/routes/`
2. Ensuring each `router.get()`, `router.post()`, `router.patch()`, `router.delete()` is documented
3. Verifying request/response formats match the implementation

### Route Files

- `server/src/routes/auth.ts` - Authentication endpoints
- `server/src/routes/players.ts` - Player management endpoints
- `server/src/routes/tournaments.ts` - Tournament management endpoints
- `server/src/index.ts` - Health check endpoint

### Quick Reference: Total Endpoints

- **Health Check:** 1 endpoint
- **Authentication:** 3 endpoints
- **Players:** 8 endpoints
- **Tournaments:** 14 endpoints
- **Total:** 26 endpoints

