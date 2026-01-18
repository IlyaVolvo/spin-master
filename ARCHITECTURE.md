# System Architecture

## Overview

The Spin Master Table Tennis Tournament Management System is a full-stack TypeScript application for managing players, tournaments, matches, and ratings with real-time updates.

## Technology Stack

### Frontend
- **Framework**: React 18.2 with TypeScript
- **Build Tool**: Vite 5.0
- **Routing**: React Router DOM 6.20
- **HTTP Client**: Axios 1.6
- **Real-time**: Socket.io Client 4.8
- **UI Libraries**: 
  - React DatePicker
  - Recharts (for statistics)

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express 4.18
- **ORM**: Prisma 7.2
- **Database**: PostgreSQL
- **Authentication**: 
  - JWT (JSON Web Tokens)
  - Express Session
  - bcryptjs for password hashing
- **Real-time**: Socket.io 4.8
- **Validation**: express-validator 7.0
- **Logging**: Winston (custom logger)

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Application (Port 5173)                       │   │
│  │  - Players Management                                │   │
│  │  - Tournament Creation & Management                  │   │
│  │  - Match Entry & Scoring                             │   │
│  │  - Statistics & History                              │   │
│  │  - Authentication UI                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST + WebSocket
                            │
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Express)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth Routes  │  │Player Routes │  │Tournament    │     │
│  │              │  │              │  │Routes        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Authentication Middleware (JWT + Session)      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Services Layer                                 │   │
│  │  - Ranking Service                                     │   │
│  │  - Cache Service                                       │   │
│  │  - Socket Service                                      │   │
│  │  - Round Robin Playoff Service                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Socket.io Server (Real-time Updates)          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Prisma ORM
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer (PostgreSQL)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Members  │  │Tournaments│ │ Matches  │  │Rating    │  │
│  │          │  │           │ │          │  │History   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐                               │
│  │Tournament│  │Bracket   │                               │
│  │Participants││Matches   │                               │
│  └──────────┘  └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Core Models

#### Member
- **Purpose**: Players, coaches, admins, organizers
- **Key Fields**:
  - `id`, `firstName`, `lastName`, `email` (unique)
  - `rating`: USATT-style numeric rating
  - `isActive`: Soft delete flag
  - `roles`: Array of roles (PLAYER, COACH, ADMIN, ORGANIZER)
  - `password`: Hashed with bcrypt
  - `mustResetPassword`: Flag for forced password reset
- **Relationships**:
  - One-to-many: `ratingHistory`
  - Many-to-many: `tournamentParticipants` (via TournamentParticipant)

#### Tournament
- **Purpose**: Tournament container with metadata
- **Key Fields**:
  - `id`, `name`, `type`, `status` (ACTIVE/COMPLETED)
  - `cancelled`: Boolean flag for incomplete tournaments
  - `roundRobinSize`: For PRELIMINARY_AND_PLAYOFF tournaments
  - `playoffBracketSize`: For PRELIMINARY_AND_PLAYOFF tournaments
  - `parentTournamentId`: For child tournaments (self-referential)
  - `groupNumber`: For Round Robin groups in preliminary phase
- **Types**:
  - `ROUND_ROBIN`: All players play each other
  - `PLAYOFF`: Single-elimination bracket
  - `PRELIMINARY_AND_PLAYOFF`: Multiple RR groups → Playoff
  - `PRELIMINARY_AND_ROUND_ROBIN`: Future type
  - `SWISS`: Future type
  - `SINGLE_MATCH`: One-off matches
- **Relationships**:
  - One-to-many: `participants`, `matches`, `bracketMatches`
  - Self-referential: `parentTournament` → `childTournaments`

#### TournamentParticipant
- **Purpose**: Links players to tournaments with rating snapshot
- **Key Fields**:
  - `tournamentId`, `memberId`
  - `playerRatingAtTime`: Snapshot of rating when tournament started
- **Purpose**: Ensures historical accuracy of ratings

#### Match
- **Purpose**: Individual match results
- **Key Fields**:
  - `tournamentId`, `member1Id`, `member2Id`
  - `player1Sets`, `player2Sets`: Scores
  - `player1Forfeit`, `player2Forfeit`: Forfeit flags
  - `bracketMatchId`: Link to bracket structure (for playoffs)
- **Relationships**:
  - Many-to-one: `tournament`

#### BracketMatch
- **Purpose**: Playoff bracket structure
- **Key Fields**:
  - `tournamentId`, `round`, `position`
  - `member1Id`, `member2Id`: Seeded players
  - `nextMatchId`: Links to next round match
- **Purpose**: Defines playoff bracket structure

#### RatingHistory
- **Purpose**: Complete audit trail of rating changes
- **Key Fields**:
  - `memberId`, `rating`, `ratingChange`
  - `reason`: Why rating changed
  - `tournamentId`, `matchId`: Links to source
- **Reasons**:
  - `TOURNAMENT_COMPLETED`, `MATCH_COMPLETED`
  - `PLAYOFF_MATCH_COMPLETED`, `RESULT_CORRECTED`
  - `MANUAL_ADJUSTMENT`, `MEMBER_DEACTIVATED`

## Services Layer

### RankingService
- **Purpose**: Calculates and updates player ratings
- **Triggers**:
  - Tournament completion
  - Match result corrections
  - Manual adjustments
- **Algorithm**: Point exchange rules based on rating differences
- **Features**:
  - Processes tournaments chronologically
  - Creates rating history entries
  - Handles PRELIMINARY_AND_PLAYOFF playoff creation

### RoundRobinPlayoffService
- **Purpose**: Manages PRELIMINARY_AND_PLAYOFF tournaments
- **Features**:
  - Checks when all Round Robin groups are complete
  - Calculates qualifiers for playoffs
  - Creates playoff bracket automatically
  - Implements seeding algorithm

### CacheService
- **Purpose**: Invalidates cache on data changes
- **Triggers**: Tournament/match updates
- **Integration**: Works with Socket.io for real-time updates

### SocketService
- **Purpose**: Real-time updates to connected clients
- **Events**:
  - Tournament updates
  - Match updates
  - Cache invalidation
- **Integration**: Broadcasts to all connected clients

## Authentication & Authorization

### Authentication Methods
1. **JWT Tokens**: Stored client-side (localStorage)
2. **Session-based**: Server-side session storage
3. **Password Hashing**: bcryptjs with salt rounds

### User Roles
- **ADMIN**: Full system access
- **ORGANIZER**: Can create tournaments and matches
- **PLAYER**: Can create matches for themselves (with opponent password)
- **COACH**: Future role (currently same as PLAYER)

### Authorization Rules
- All API routes require authentication (except login)
- Organizers can create any tournament/match
- Players can only create matches for themselves
- Match creation requires opponent password for non-organizers

## Data Flow Patterns

### Tournament Creation Flow
1. Client: User selects tournament type and players
2. Client: For PRELIMINARY_AND_PLAYOFF, groups are formed (snake draft)
3. Client: User confirms groups and playoff bracket size
4. API: Validates input and creates tournament structure
5. Database: Creates main tournament + child tournaments (if applicable)
6. Socket: Broadcasts tournament creation
7. Client: Receives real-time update

### Match Creation Flow
1. Client: User selects players and enters scores
2. Client: For non-organizers, requires opponent password
3. API: Validates players and password (if needed)
4. Database: Creates match record
5. Socket: Broadcasts match creation
6. Client: Receives real-time update

### Tournament Completion Flow
1. Client: User marks tournament as complete
2. API: Updates tournament status
3. Service: RankingService recalculates ratings
4. Service: For PRELIMINARY_AND_PLAYOFF, checks if playoff should be created
5. Database: Updates ratings and creates history entries
6. Socket: Broadcasts updates
7. Client: Receives real-time updates

## Real-time Communication

### WebSocket Events (Socket.io)

#### Server → Client
- `tournament:update`: Tournament data changed
- `match:update`: Match data changed
- `cache:invalidate`: Cache should be refreshed

#### Client → Server
- Connection/disconnection events
- (Currently mostly server-initiated)

## Error Handling

### Client-Side
- Try-catch blocks around API calls
- Error state management in components
- User-friendly error messages
- Success notifications

### Server-Side
- Express error middleware
- Validation errors via express-validator
- Database error handling
- Logging via Winston logger
- Consistent error response format

## Security Considerations

### Authentication
- Passwords hashed with bcrypt (salt rounds: 10)
- JWT tokens with expiration
- Session-based authentication as backup
- Password reset tokens with expiration

### Authorization
- Role-based access control
- Route-level permission checks
- Player match creation restrictions

### Data Validation
- Input validation on all endpoints
- TypeScript type checking
- SQL injection prevention via Prisma
- XSS prevention (React auto-escaping)

### Data Protection
- Passwords never returned in API responses
- Sensitive fields excluded from responses
- Rating snapshots for historical accuracy

## Performance Considerations

### Database
- Indexed fields: `email`, `rating`, `tournamentId`, `memberId`
- Connection pooling via Prisma
- Efficient queries with proper includes
- Soft deletes (isActive flag) instead of hard deletes

### API
- Stateless design (JWT)
- Horizontal scaling capability
- Caching service for read-heavy operations
- Real-time updates reduce polling needs

### Client
- Code splitting potential (Vite supports)
- Component lazy loading possible
- Efficient re-renders with React hooks
- Socket.io reduces unnecessary API calls

## Scalability

### Current Limitations
- Single server instance
- No load balancing
- No database replication
- Monolithic component structure (Players.tsx is 7800+ lines)

### Future Improvements
- Horizontal scaling with load balancer
- Database read replicas
- Component refactoring for better performance
- Caching layer (Redis)
- Background job queue for ranking calculations

## Deployment Architecture

### Recommended Setup

```
┌─────────────────┐
│   CDN/Static    │  ← React App (Vite build)
│     Hosting     │     (Netlify/Vercel)
└─────────────────┘
         │
         │ API Calls + WebSocket
         │
┌─────────────────┐
│  Load Balancer  │  ← API Server
│   (Optional)    │     (Heroku/Railway/AWS)
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
│  PostgreSQL     │  ← Managed Database
│  (Cloud)        │     (Supabase/RDS/Heroku)
└─────────────────┘
```

### Environment Variables

**Server (.env)**
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT token signing
- `PORT`: Server port (default: 3001)
- `ENABLE_LOGGING`: Enable file logging
- `LOG_TO_CONSOLE`: Also log to console
- `LOG_LEVEL`: Logging level (info/debug)

**Client**
- API base URL configured in `api.ts`

## Technology Choices Rationale

1. **PostgreSQL**: Robust, ACID-compliant, excellent for relational data
2. **Prisma**: Type-safe ORM, excellent developer experience, migrations
3. **Express**: Mature, flexible, large ecosystem
4. **React**: Component reusability, large ecosystem, great DX
5. **TypeScript**: Type safety, better IDE support, fewer runtime errors
6. **Socket.io**: Real-time bidirectional communication
7. **Vite**: Fast development, optimized builds
8. **JWT + Session**: Flexible authentication, stateless + stateful options

## Known Issues & Technical Debt

### Code Quality
- Large monolithic components (Players.tsx: 7800+ lines)
- Duplicated tournament creation logic
- Mixed concerns (UI + business logic)
- Inconsistent error handling patterns

### Database
- Some denormalized data that could be normalized
- Missing indexes on some frequently queried fields
- Foreign key relationships need review

### Architecture
- No separation of concerns in some components
- Business logic mixed with UI logic
- No state management library (could benefit from Redux/Zustand)
- Limited test coverage

## Future Enhancements

### Planned Features
- PRELIMINARY_AND_ROUND_ROBIN tournament type
- SWISS tournament type
- Better tournament statistics
- Player history visualization improvements
- Export/import functionality
- Mobile app (React Native)

### Architecture Improvements
- Component refactoring (break down large components)
- State management library integration
- Better database normalization
- API versioning
- GraphQL consideration
- Microservices consideration (if scale requires)