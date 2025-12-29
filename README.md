# Spin Master - Table Tennis Tournament Management System

A comprehensive tournament management system for ping pong tournaments with cloud-based data storage, RESTful API, and a modern web interface.

## System Architecture

### Technology Stack

**Backend:**
- **Node.js** with **Express** and **TypeScript** - RESTful API server
- **Prisma** - ORM for database management
- **PostgreSQL** - Cloud database (compatible with AWS RDS, Heroku Postgres, etc.)
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing

**Frontend:**
- **React** with **TypeScript** - Modern UI framework
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Axios** - HTTP client

### Database Schema

The system uses PostgreSQL with the following schema:

1. **users** - Authentication users (separate from players)
2. **players** - Tournament participants with current ranking
3. **ranking_history** - Historical ranking changes
4. **tournaments** - Tournament records with status (ACTIVE/COMPLETED)
5. **tournament_participants** - Many-to-many relationship with ranking snapshot
6. **matches** - Match results (sets won/lost)

### Key Features

- **Player Management**: Add players with optional initial ranking, activate/deactivate
- **Tournament Management**: Create tournaments, add match results, complete tournaments
- **Automatic Ranking**: Rankings recalculate automatically when tournaments complete or results are corrected
- **Ranking History**: All ranking changes are preserved with timestamps and reasons
- **Authentication**: JWT-based authentication for API access

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud)

### Installation

1. Install dependencies:
```bash
npm run install:all
```

2. Set up the database:
   - Create a PostgreSQL database
   - Copy `server/env.example` to `server/.env`
   - Update `DATABASE_URL` in `server/.env` with your database connection string
   - Update `JWT_SECRET` with a secure random string

3. Initialize database:
```bash
cd server
npm run prisma:generate
npm run prisma:migrate
```

4. Create an admin user (optional - you can register via API):
```bash
# Use the /api/auth/register endpoint or create manually
```

### Running the Application

**Development mode (both server and client):**
```bash
npm run dev
```

**Or run separately:**
```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm start
```

- Server runs on: http://localhost:3001
- Client runs on: http://localhost:3000

### Production Build

```bash
npm run build
```

## API Documentation

### Authentication

**POST /api/auth/register**
- Register a new user
- Body: `{ username, password }`

**POST /api/auth/login**
- Login and get JWT token
- Body: `{ username, password }`
- Returns: `{ token, userId }`

All other endpoints require `Authorization: Bearer <token>` header.

### Players

**GET /api/players**
- Get all players (sorted by ranking)

**GET /api/players/active**
- Get only active players

**GET /api/players/:id**
- Get player details with ranking history

**POST /api/players**
- Add new player
- Body: `{ name, ranking? }`

**PATCH /api/players/:id/deactivate**
- Deactivate a player

**PATCH /api/players/:id/activate**
- Reactivate a player

### Tournaments

**GET /api/tournaments**
- Get all tournaments

**GET /api/tournaments/active**
- Get active tournaments only

**GET /api/tournaments/:id**
- Get tournament details

**POST /api/tournaments**
- Start new tournament
- Body: `{ name?, participantIds: string[] }`

**POST /api/tournaments/:id/matches**
- Add match result
- Body: `{ player1Id, player2Id, player1Sets, player2Sets }`

**PATCH /api/tournaments/:tournamentId/matches/:matchId**
- Update match result (for corrections)
- Body: `{ player1Sets, player2Sets }`

**PATCH /api/tournaments/:id/complete**
- Complete tournament and recalculate rankings

## Maintenance

### Deleting Inactive Players

To permanently remove inactive players from the database, use the provided script:

```bash
cd server
npx tsx scripts/deleteInactivePlayers.ts
```

**Important Notes:**
- Only players with `isActive: false` are considered inactive
- Players without ratings are NOT considered inactive (they can still be active)
- Players with tournament participations cannot be deleted automatically (to preserve tournament history)
- The script will:
  - Show a summary of inactive players found
  - Delete players without tournament participations
  - Warn about players that cannot be deleted due to tournament history
  - Automatically delete ranking history for deleted players (cascade delete)

**Example Output:**
```
Found 3 inactive player(s)
Deleting 3 inactive player(s) without tournament participations...
  ✓ Deleted: Player Name (ID: 1)
✅ Successfully deleted 3 inactive player(s).
```

### Dumping Players Data

To view all players in the database with detailed information, use the dump script:

```bash
cd server
npx tsx scripts/dumpPlayers.ts
```

**What it shows:**
- Summary statistics (total players, active/inactive counts, players with ratings/rankings)
- Detailed information for each player:
  - ID, Name, Status (Active/Inactive)
  - Rating and Current Ranking
  - Creation/Update timestamps
  - Recent ranking history (last 5 changes)
  - Tournament participations
- JSON export at the end (for programmatic use)

**Output Options:**
```bash
# Save to file
npx tsx scripts/dumpPlayers.ts > players_dump.txt

# Pretty JSON only (requires jq)
npx tsx scripts/dumpPlayers.ts | grep -A 1000 "JSON Export" | tail -n +3 | jq
```

**Example Output:**
```
Total players: 4

Summary:
  Active players: 4
  Inactive players: 0
  Players with rating: 3
  Players with ranking: 3

Player #1:
  ID: 4
  Name: Theo Cassidy
  Status: ACTIVE
  Rating: 1236
  Current Ranking: #1
  ...
```

## Ranking Algorithm

Rankings are calculated based on:
- Win rate (70% weight)
- Set ratio (30% weight)
- Only players who have played matches are ranked
- Rankings update automatically when:
  - A tournament is completed
  - Match results are corrected in completed tournaments

## Deployment

### Database

Deploy PostgreSQL to:
- AWS RDS
- Heroku Postgres
- Google Cloud SQL
- Any PostgreSQL-compatible cloud service

### Backend

Deploy to:
- Heroku
- AWS Elastic Beanstalk
- Google Cloud Run
- Any Node.js hosting service

Set environment variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT` (optional)

### Frontend

Build and deploy to:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any static hosting service

Set `VITE_API_URL` environment variable to your backend URL.

## Security Notes

- Change `JWT_SECRET` to a strong random string in production
- Use HTTPS in production
- Consider adding rate limiting
- Add input validation and sanitization
- Consider adding CORS restrictions

## Future Enhancements

- Tournament brackets/brackets
- Player statistics and analytics
- Email notifications
- Mobile app (React Native)
- Real-time updates (WebSockets)
- Tournament templates
- Export/import functionality

