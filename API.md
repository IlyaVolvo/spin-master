# API Documentation

## Base URL
- **Development**: `http://localhost:3001/api`
- **Production**: (Configured via environment)

## Authentication

All endpoints except authentication endpoints require authentication via:
- **JWT Token**: Stored in localStorage, sent in `Authorization` header
- **Session**: Server-side session (backup method)

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## Authentication Endpoints

### POST `/api/auth/member/login`
Member login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "jwt_token_here",
  "member": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["PLAYER"],
    "rating": 1500
  }
}
```

**Errors:**
- `400`: Validation errors
- `401`: Invalid credentials

---

### POST `/api/auth/member/logout`
Logout current user (clears session).

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

### GET `/api/auth/member/me`
Get current authenticated member information.

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "roles": ["PLAYER"],
  "rating": 1500
}
```

---

### POST `/api/auth/member/change-password`
Change password for current user.

**Request Body:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

---

### POST `/api/auth/member/:id/reset-password`
Admin endpoint to reset a member's password.

**Request Body:**
```json
{
  "newPassword": "newpassword"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

---

## Player Endpoints

### GET `/api/players`
Get all active players (members with PLAYER role).

**Query Parameters:**
- None

**Response (200):**
```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "rating": 1500,
    "isActive": true,
    "gender": "MALE",
    "birthDate": "1990-01-01T00:00:00.000Z"
  }
]
```

---

### GET `/api/players/all-members`
Get all members (Admin only - includes all roles).

**Response (200):**
```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "roles": ["PLAYER", "ORGANIZER"],
    "rating": 1500,
    "isActive": true
  }
]
```

---

### GET `/api/players/active`
Get only active players.

**Response (200):**
```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "rating": 1500,
    "isActive": true
  }
]
```

---

### GET `/api/players/:id`
Get a specific player by ID.

**Response (200):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "rating": 1500,
  "isActive": true,
  "gender": "MALE",
  "birthDate": "1990-01-01T00:00:00.000Z",
  "phone": "+1234567890",
  "address": "123 Main St"
}
```

---

### POST `/api/players`
Create a new player.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "gender": "MALE",
  "birthDate": "1990-01-01T00:00:00.000Z",
  "rating": 1500,
  "password": "password123",
  "phone": "+1234567890",
  "address": "123 Main St",
  "roles": ["PLAYER"]
}
```

**Response (201):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "rating": 1500,
  "isActive": true
}
```

**Errors:**
- `400`: Validation errors or duplicate email
- `409`: Similar name found (with similarity check)

---

### PATCH `/api/players/:id`
Update a player.

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "rating": 1600,
  "phone": "+1234567890"
}
```

**Response (200):**
```json
{
  "id": 1,
  "firstName": "Jane",
  "lastName": "Doe",
  "rating": 1600
}
```

---

### PATCH `/api/players/:id/activate`
Activate a player (set isActive to true).

**Response (200):**
```json
{
  "message": "Player activated successfully"
}
```

---

### PATCH `/api/players/:id/deactivate`
Deactivate a player (set isActive to false).

**Response (200):**
```json
{
  "message": "Player deactivated successfully"
}
```

---

### DELETE `/api/players/:id`
Delete a player (hard delete - only if no tournament participation).

**Response (200):**
```json
{
  "message": "Player deleted successfully"
}
```

**Errors:**
- `400`: Player has tournament participation

---

### GET `/api/players/:id/can-delete`
Check if a player can be deleted.

**Response (200):**
```json
{
  "canDelete": true,
  "reason": null
}
```

---

### POST `/api/players/rating-history`
Get rating history for a player.

**Request Body:**
```json
{
  "memberId": 1,
  "opponentIds": [2, 3],
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-12-31T23:59:59.999Z"
}
```

**Response (200):**
```json
[
  {
    "id": 1,
    "memberId": 1,
    "rating": 1500,
    "ratingChange": 50,
    "timestamp": "2024-01-15T10:00:00.000Z",
    "reason": "TOURNAMENT_COMPLETED",
    "tournamentId": 1
  }
]
```

---

### POST `/api/players/match-history`
Get match history for a player.

**Request Body:**
```json
{
  "memberId": 1,
  "opponentIds": [2, 3]
}
```

**Response (200):**
```json
[
  {
    "id": 1,
    "tournamentId": 1,
    "member1Id": 1,
    "member2Id": 2,
    "player1Sets": 3,
    "player2Sets": 1,
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### GET `/api/players/export`
Export players to CSV (Admin only).

**Response (200):**
CSV file download

---

### POST `/api/players/import`
Import players from CSV (Admin only).

**Request:**
Multipart form data with CSV file

**Response (200):**
```json
{
  "imported": 10,
  "errors": []
}
```

---

## Tournament Endpoints

### GET `/api/tournaments`
Get all tournaments.

**Query Parameters:**
- `status`: Filter by status (ACTIVE, COMPLETED)
- `type`: Filter by tournament type

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Winter Tournament",
    "type": "ROUND_ROBIN",
    "status": "ACTIVE",
    "cancelled": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "participants": [...],
    "matches": [...],
    "childTournaments": [...]
  }
]
```

---

### GET `/api/tournaments/active`
Get all active tournaments.

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Winter Tournament",
    "type": "ROUND_ROBIN",
    "status": "ACTIVE"
  }
]
```

---

### GET `/api/tournaments/:id`
Get a specific tournament by ID.

**Response (200):**
```json
{
  "id": 1,
  "name": "Winter Tournament",
  "type": "ROUND_ROBIN",
  "status": "ACTIVE",
  "participants": [...],
  "matches": [...],
  "bracketMatches": [...],
  "childTournaments": [...]
}
```

---

### POST `/api/tournaments`
Create a new tournament.

**Request Body (ROUND_ROBIN):**
```json
{
  "name": "Winter Tournament",
  "type": "ROUND_ROBIN",
  "participantIds": [1, 2, 3, 4]
}
```

**Request Body (PLAYOFF):**
```json
{
  "name": "Championship",
  "type": "PLAYOFF",
  "participantIds": [1, 2, 3, 4, 5, 6, 7, 8],
  "bracketPositions": [1, 8, 4, 5, 2, 7, 3, 6]
}
```

**Request Body (PRELIMINARY_AND_PLAYOFF):**
```json
{
  "name": "Championship",
  "type": "PRELIMINARY_AND_PLAYOFF",
  "participantIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "roundRobinSize": 4,
  "playoffBracketSize": 8,
  "groups": [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]
}
```

**Request Body (SINGLE_MATCH):**
```json
{
  "type": "SINGLE_MATCH",
  "participantIds": [1, 2]
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Winter Tournament",
  "type": "ROUND_ROBIN",
  "status": "ACTIVE",
  "participants": [...],
  "matches": []
}
```

**Errors:**
- `400`: Validation errors
- `403`: Only Organizers can create tournaments
- `400`: Invalid tournament type or parameters

---

### POST `/api/tournaments/bulk`
Create multiple Round Robin tournaments.

**Request Body:**
```json
{
  "tournaments": [
    {
      "name": "Tournament 1",
      "participantIds": [1, 2, 3, 4, 5, 6]
    },
    {
      "name": "Tournament 2",
      "participantIds": [7, 8, 9, 10, 11, 12]
    }
  ]
}
```

**Response (201):**
```json
[
  {
    "id": 1,
    "name": "Tournament 1",
    "type": "ROUND_ROBIN"
  },
  {
    "id": 2,
    "name": "Tournament 2",
    "type": "ROUND_ROBIN"
  }
]
```

---

### POST `/api/tournaments/matches/create`
Create a match with final scores (not active).

**Request Body:**
```json
{
  "member1Id": 1,
  "member2Id": 2,
  "player1Sets": 3,
  "player2Sets": 1,
  "opponentPassword": "password123" // Required for non-organizers
}
```

**Response (201):**
```json
{
  "id": 1,
  "tournamentId": null,
  "member1Id": 1,
  "member2Id": 2,
  "player1Sets": 3,
  "player2Sets": 1,
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

**Errors:**
- `400`: Validation errors
- `401`: Invalid opponent password (for non-organizers)
- `403`: Can only create matches for yourself (for non-organizers)

---

### POST `/api/tournaments/:id/matches`
Create a match in a tournament.

**Request Body:**
```json
{
  "member1Id": 1,
  "member2Id": 2,
  "player1Sets": 3,
  "player2Sets": 1
}
```

**Response (201):**
```json
{
  "id": 1,
  "tournamentId": 1,
  "member1Id": 1,
  "member2Id": 2,
  "player1Sets": 3,
  "player2Sets": 1
}
```

**Errors:**
- `400`: Tournament not active or players not participants
- `400`: Match already exists

---

### PATCH `/api/tournaments/:tournamentId/matches/:matchId`
Update a match result.

**Request Body:**
```json
{
  "player1Sets": 3,
  "player2Sets": 2
}
```

**Response (200):**
```json
{
  "id": 1,
  "player1Sets": 3,
  "player2Sets": 2
}
```

**Side Effects:**
- If tournament is completed, rankings are recalculated
- For PRELIMINARY_AND_PLAYOFF, may trigger playoff creation

---

### DELETE `/api/tournaments/:tournamentId/matches/:matchId`
Delete a match.

**Response (200):**
```json
{
  "message": "Match deleted successfully"
}
```

**Side Effects:**
- If tournament is completed, rankings are recalculated

---

### PATCH `/api/tournaments/:id/name`
Update tournament name.

**Request Body:**
```json
{
  "name": "New Tournament Name"
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "New Tournament Name"
}
```

---

### PATCH `/api/tournaments/:id/complete`
Mark tournament as completed.

**Response (200):**
```json
{
  "id": 1,
  "status": "COMPLETED"
}
```

**Side Effects:**
- Rankings are recalculated
- For PRELIMINARY_AND_PLAYOFF, may trigger playoff creation

---

### PATCH `/api/tournaments/:id/cancel`
Cancel a tournament (mark as completed but cancelled).

**Response (200):**
```json
{
  "id": 1,
  "status": "COMPLETED",
  "cancelled": true
}
```

---

### DELETE `/api/tournaments/:id`
Delete a tournament.

**Response (200):**
```json
{
  "message": "Tournament deleted successfully"
}
```

---

### GET `/api/tournaments/:id/bracket`
Get bracket structure for a playoff tournament.

**Response (200):**
```json
{
  "bracketMatches": [
    {
      "id": 1,
      "round": 1,
      "position": 1,
      "member1Id": 1,
      "member2Id": 8,
      "nextMatchId": 5
    }
  ]
}
```

---

### PATCH `/api/tournaments/:id/bracket`
Update bracket structure.

**Request Body:**
```json
{
  "bracketMatches": [
    {
      "round": 1,
      "position": 1,
      "member1Id": 1,
      "member2Id": 8,
      "nextMatchId": 5
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Bracket updated successfully"
}
```

---

### PATCH `/api/tournaments/:id/participants`
Update tournament participants.

**Request Body:**
```json
{
  "participantIds": [1, 2, 3, 4, 5]
}
```

**Response (200):**
```json
{
  "id": 1,
  "participants": [...]
}
```

---

### POST `/api/tournaments/preview-bracket`
Preview bracket structure without creating tournament.

**Request Body:**
```json
{
  "participantIds": [1, 2, 3, 4, 5, 6, 7, 8],
  "bracketPositions": [1, 8, 4, 5, 2, 7, 3, 6]
}
```

**Response (200):**
```json
{
  "bracketMatches": [...]
}
```

---

### POST `/api/tournaments/:id/reseed`
Reseed a playoff tournament bracket.

**Response (200):**
```json
{
  "message": "Bracket reseeded successfully",
  "bracketMatches": [...]
}
```

---

## WebSocket Events

### Server → Client Events

#### `tournament:update`
Emitted when tournament data changes.

**Payload:**
```json
{
  "tournamentId": 1,
  "action": "created" | "updated" | "deleted" | "completed"
}
```

#### `match:update`
Emitted when match data changes.

**Payload:**
```json
{
  "matchId": 1,
  "tournamentId": 1,
  "action": "created" | "updated" | "deleted"
}
```

#### `cache:invalidate`
Emitted when cache should be invalidated.

**Payload:**
```json
{
  "type": "tournaments" | "players" | "all"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here"
}
```

Or for validation errors:

```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Invalid value",
      "path": "email",
      "location": "body"
    }
  ]
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate, etc.)
- `500`: Internal Server Error

---

## Rate Limiting

Currently no rate limiting implemented. Consider adding for production.

## CORS

CORS is configured to allow requests from the client origin.

## Request/Response Format

- **Content-Type**: `application/json`
- **Accept**: `application/json`
- All dates in ISO 8601 format
- All IDs are integers
