# System Architecture

## Overview

The Ping Pong Tournament Management System is a full-stack application designed for managing tournaments, players, and rankings with cloud-based data persistence.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Web Application (Portable to Mobile via RN)   │   │
│  │  - Player Management UI                              │   │
│  │  - Tournament Management UI                          │   │
│  │  - Authentication UI                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST
                            │
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Express)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth Routes  │  │Player Routes │  │Tournament    │     │
│  │              │  │              │  │Routes        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Authentication Middleware (JWT)               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Ranking Service (Business Logic)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Prisma ORM
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer (PostgreSQL)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Users   │  │ Players  │  │Tournaments│  │ Matches  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐                               │
│  │Ranking   │  │Tournament│                               │
│  │History   │  │Participants│                             │
│  └──────────┘  └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Database Schema

#### Users Table
- Stores authentication credentials (separate from players)
- Used for API access control

#### Players Table
- Core player information
- `isActive`: boolean flag (inactive players can't join tournaments)
- Never deleted (soft delete via `isActive`)

#### Ranking History Table
- Complete audit trail of ranking changes
- Links to tournaments that caused changes
- Preserves historical state

#### Tournaments Table
- Tournament metadata
- Status: ACTIVE or COMPLETED
- Timestamp for chronological processing

#### Tournament Participants Table
- Many-to-many relationship
- Stores ranking snapshot at tournament start
- Ensures historical accuracy

#### Matches Table
- Match results (sets won/lost)
- Links to tournament and players
- Can be updated for corrections

### 2. API Layer

**Authentication:**
- JWT-based token authentication
- Tokens stored client-side (localStorage)
- Middleware protects all routes except auth endpoints

**Endpoints:**
- RESTful design
- Consistent error handling
- Input validation via express-validator

**Ranking Service:**
- Calculates rankings from all completed tournaments
- Processes tournaments chronologically
- Updates rankings and creates history entries
- Triggered on tournament completion or result correction

### 3. Client Layer

**React Application:**
- Component-based architecture
- React Router for navigation
- Axios for API communication
- Local state management (can be extended with Redux/Zustand)

**Features:**
- Responsive design
- Form validation
- Error/success messaging
- Real-time data updates

## Data Flow

### Adding a Player
1. User submits form → Client
2. POST /api/players → API
3. Create player record → Database
4. If ranking provided, create history entry
5. Return player data → Client
6. Refresh player list

### Starting Tournament
1. User selects participants → Client
2. POST /api/tournaments → API
3. Validate participants are active
4. Create tournament + participant records (with ranking snapshots) → Database
5. Return tournament data → Client

### Adding Match Result
1. User enters match data → Client
2. POST /api/tournaments/:id/matches → API
3. Validate tournament is active and players are participants
4. Create match record → Database
5. Return match data → Client

### Completing Tournament
1. User clicks "Complete" → Client
2. PATCH /api/tournaments/:id/complete → API
3. Update tournament status → Database
4. Call ranking service:
   - Fetch all completed tournaments
   - Process all matches chronologically
   - Calculate new rankings
   - Update player rankings
   - Create history entries
5. Return updated tournament → Client

### Correcting Results
1. User updates match → Client
2. PATCH /api/tournaments/:id/matches/:matchId → API
3. Update match record → Database
4. If tournament is completed, recalculate rankings
5. Return updated match → Client

## Ranking Algorithm

The ranking system uses a weighted scoring approach:

1. **Win Rate** (70% weight): `wins / total_matches`
2. **Set Ratio** (30% weight): `sets_won / sets_lost` (capped)
3. **Final Score**: `(win_rate * 0.7) + (normalized_set_ratio * 0.3)`

Players are sorted by:
1. Final score (descending)
2. Total wins (descending, as tiebreaker)

Only players who have played at least one match are ranked.

## Security Considerations

1. **Authentication:**
   - Passwords hashed with bcrypt
   - JWT tokens with expiration
   - Protected routes require valid token

2. **Data Validation:**
   - Input validation on all endpoints
   - Type checking via TypeScript
   - SQL injection prevention via Prisma

3. **Authorization:**
   - Currently single-level (authenticated users can do everything)
   - Can be extended with role-based access control

## Scalability Considerations

1. **Database:**
   - Indexed on frequently queried fields
   - Partitioning possible for ranking_history
   - Connection pooling via Prisma

2. **API:**
   - Stateless design (JWT)
   - Can be horizontally scaled
   - Consider caching for read-heavy operations

3. **Client:**
   - Static assets can be CDN-hosted
   - React app can be code-split
   - Consider service workers for offline support

## Deployment Architecture

### Recommended Cloud Setup

```
┌─────────────────┐
│   CDN/Static    │  ← React App (Netlify/Vercel)
│     Hosting     │
└────────────────┘
         │
         │ API Calls
         │
┌─────────────────┐
│  Load Balancer  │  ← API Server (Heroku/AWS)
│   (Optional)    │
└─────────────────┘
         │
    ┌────┴────┐
    │         │
┌───┴───┐ ┌───┴───┐
│ API 1 │ │ API 2 │  ← Multiple instances
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
┌────────┴────────┐
│  PostgreSQL     │  ← Managed Database (RDS/Heroku)
│  (Cloud)        │
└─────────────────┘
```

## Technology Choices Rationale

1. **PostgreSQL**: Robust, ACID-compliant, excellent for relational data
2. **Prisma**: Type-safe ORM, excellent developer experience
3. **Express**: Mature, flexible, large ecosystem
4. **React**: Component reusability, large ecosystem, portable to mobile
5. **TypeScript**: Type safety, better IDE support, fewer runtime errors
6. **JWT**: Stateless authentication, scalable

## Future Enhancements

1. **Real-time Updates**: WebSockets for live tournament updates
2. **Caching Layer**: Redis for frequently accessed data
3. **Background Jobs**: Queue system for ranking calculations
4. **Mobile App**: React Native using same API
5. **Analytics**: Player statistics, tournament analytics
6. **Notifications**: Email/SMS for tournament updates





