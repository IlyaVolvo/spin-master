# Spin Master - Project Knowledge Base

## Project Overview
Table Tennis Tournament Management System with rating calculations, tournament management, and match tracking.

## Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Real-time**: Socket.io
- **Authentication**: JWT + Session-based

### Key Features
1. Player management with ratings
2. Tournament creation (Round Robin, Playoff, Preliminary + Playoff)
3. Match recording and scoring
4. Rating calculations based on match results
5. Tournament bracket visualization
6. Real-time updates via WebSocket

## Database Schema

### Current Issues
- Matches and tournaments need better normalization
- Some denormalized data that should be normalized
- Need better extensibility for future tournament types

### Key Models
- **Member**: Players with ratings, roles, authentication
- **Tournament**: Various types (ROUND_ROBIN, PLAYOFF, PRELIMINARY_AND_PLAYOFF, etc.)
- **Match**: Individual matches with scores
- **TournamentParticipant**: Links players to tournaments
- **RatingHistory**: Tracks rating changes over time

## Business Logic

### Rating System
- USATT-style numeric ratings
- Point exchange rules based on rating differences
- Rating changes calculated after match completion
- Supports upsets (lower-rated player winning)

### Tournament Types
1. **ROUND_ROBIN**: All players play each other
2. **PLAYOFF**: Single-elimination bracket
3. **PRELIMINARY_AND_PLAYOFF**: Multiple Round Robin groups → Playoff
4. **SINGLE_MATCH**: One-off matches

### Tournament Creation Flow
- Player selection
- Group formation (snake draft for PRELIMINARY_AND_PLAYOFF)
- Bracket organization (for PLAYOFF)
- Confirmation and creation

## UI/UX Patterns

### Key Components
- `Players.tsx`: Main player management and tournament creation (very large, needs refactoring)
- `Tournaments.tsx`: Tournament listing and management
- `BracketPreview.tsx`: Visual bracket representation
- `PlayoffBracket.tsx`: Interactive bracket management

### Current UI Issues
- Large monolithic components (Players.tsx is 7800+ lines)
- Code duplication in tournament creation flows
- Inconsistent button placement and visibility
- Complex state management

### User Roles
- **ADMIN**: Full access
- **ORGANIZER**: Can create tournaments and matches
- **PLAYER**: Can create matches for themselves (with opponent password)

## API Endpoints

### Key Routes
- `/api/players` - Player CRUD
- `/api/tournaments` - Tournament management
- `/api/tournaments/matches/create` - Match creation
- `/api/tournaments/:id/matches/:matchId` - Match updates
- `/api/auth` - Authentication

## Known Issues & Technical Debt

### Code Quality
- Massive component files (Players.tsx)
- Duplicated tournament creation logic
- Inconsistent error handling
- Mixed concerns (UI + business logic)

### Database
- Need better normalization
- Some fields could be in separate tables
- Foreign key relationships need review

### UI/UX
- Tournament creation flow is complex
- Button visibility issues (recently fixed)
- Need better loading states
- Error messages could be more user-friendly

## Recent Changes

### Tournament Types
- Added PRELIMINARY_AND_PLAYOFF
- Added PRELIMINARY_AND_ROUND_ROBIN (future)
- Added SWISS (future)

### Snake Draft Algorithm
- Distributes players into groups based on ratings
- Alternates forward/backward for balanced groups

### Match Creation
- Organizers can create matches for any players
- Players can create matches for themselves (requires opponent password)
- Matches can be created with final scores (not active)

## Design Decisions

### Why Current Structure
- Rapid prototyping led to monolithic components
- Feature additions without refactoring
- Database schema evolved organically

### What Should Change
1. Component architecture: Break into smaller, focused components
2. State management: Consider Redux/Zustand for complex state
3. Database: Normalize match/tournament relationships
4. API: More RESTful, consistent error handling
5. UI: Streamlined flows, better UX patterns

## Future Requirements

### Planned Features
- PRELIMINARY_AND_ROUND_ROBIN tournament type
- SWISS tournament type
- Better tournament statistics
- Player history visualization
- Export/import functionality

## Key Learnings

### What Works Well
- Prisma for type-safe database access
- Socket.io for real-time updates
- Component-based React architecture (conceptually)

### What Needs Improvement
- Component size and organization
- State management complexity
- Database normalization
- Code reusability
- Testing coverage

## Migration Strategy

### Reusable Code
- Business logic (rating calculations)
- Utility functions
- API patterns
- UI components (with refactoring)

### Needs Redesign
- Database schema
- Component architecture
- Tournament creation flows
- State management

## Environment Setup

### Required
- Node.js
- PostgreSQL
- Environment variables (DATABASE_URL, JWT_SECRET, etc.)

### Development
- `npm run dev` - Runs both server and client
- Prisma Studio for database inspection
- Socket.io for real-time features
