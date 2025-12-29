# Tournament View Load Performance Analysis

## Overview
This document analyzes what happens when a user switches to the Tournament view, identifying API calls, database queries, and performance bottlenecks.

## User Action Flow

When a user clicks "Tournaments" in the navigation:

1. **Client-side navigation** (`App.tsx` line 317-323)
   - Clears scroll positions and UI states
   - Navigates to `/tournaments` route
   - Renders `Tournaments` component

2. **Component Mount** (`Tournaments.tsx` line 378-402)
   - Checks for cached data (30-second cache)
   - If cache exists and is fresh (< 30 seconds): Uses cache immediately
   - If cache is stale or missing: Fetches fresh data

## API Calls Made

### Primary API Calls (Always Made)

1. **GET `/tournaments`** (line 408)
   - Fetches ALL tournaments (active + completed)
   - Returns tournaments with participants, matches, and bracket matches

2. **GET `/tournaments/active`** (line 409)
   - Fetches only active tournaments
   - Returns with bracket matches for PLAYOFF tournaments

**Note:** These two calls are made in parallel using `Promise.all()` (line 407-410)

## Server-Side Processing (GET `/tournaments`)

### Database Queries Executed

#### 1. Initial Tournament Query (line 148-164)
```typescript
prisma.tournament.findMany({
  orderBy: { createdAt: 'desc' },
  include: {
    participants: { include: { member: true } },
    matches: true,
    _count: { select: { participants: true, matches: true } }
  }
})
```

**Tables Accessed:**
- `tournaments` (main query)
- `tournament_participants` (via include)
- `members` (via nested include)
- `matches` (via include)
- Count queries for participants and matches

**Performance Impact:** 
- Scales with number of tournaments
- Each tournament loads all participants and matches
- Can be slow with many tournaments

#### 2. Post-Tournament Rating Calculations (lines 170-217)

For **each completed tournament**, the system calculates post-tournament ratings for **each participant**:

**For each tournament-participant pair:**
- Calls `getPostTournamentRating(tournamentId, memberId)`

**Inside `getPostTournamentRating()` (usattRatingService.ts:662-702):**

**If cache MISS (first time or cache cleared):**
1. Query: `prisma.tournament.findUnique({ where: { id }, select: { createdAt } })`
2. Query: `prisma.tournament.findMany({ 
     where: { status: 'COMPLETED', createdAt: { lte: ... } },
     include: { participants: { include: { member: true } }, matches: true }
   })`
3. Recalculates ratings chronologically up to that tournament

**If cache HIT:**
- Returns immediately from in-memory cache

**Performance Impact:**
- **Cache HIT:** ~0ms (instant)
- **Cache MISS:** 
  - Loads all tournaments up to that point
  - Recalculates ratings (can be 100-500ms per participant)
  - With many tournaments and participants, this can take seconds

#### 3. Bracket Matches for PLAYOFF Tournaments (lines 224-234, 256-270)

For each **PLAYOFF tournament** (both active and completed):

```typescript
prisma.bracketMatch.findMany({
  where: { tournamentId },
  include: { match: true },
  orderBy: [{ round: 'asc' }, { position: 'asc' }]
})
```

**Tables Accessed:**
- `bracket_matches`
- `matches` (via include)

#### 4. Rating History for Bracket Matches (attachRatingHistoryToBracketMatches)

For each bracket match with a played match:

**Optimized (after our improvements):**
- Single batch query for all rating history:
```typescript
prisma.ratingHistory.findMany({
  where: {
    matchId: { in: allMatchIds },
    memberId: { in: allMemberIds }
  }
})
```

**Tables Accessed:**
- `rating_history` (batch query - good!)

**Before optimization:** N queries (one per bracket match)
**After optimization:** 1 query total

## Server-Side Processing (GET `/tournaments/active`)

### Database Queries Executed

#### 1. Active Tournaments Query (line 264-275)
```typescript
prisma.tournament.findMany({
  where: { status: 'ACTIVE' },
  orderBy: { createdAt: 'desc' },
  include: {
    participants: { include: { member: true } },
    matches: true
  }
})
```

**Tables Accessed:**
- `tournaments`
- `tournament_participants`
- `members`
- `matches`

#### 2. Bracket Matches for PLAYOFF Tournaments (line 280-290)

Same as above - loads bracket matches for each PLAYOFF tournament.

## Performance Bottlenecks Identified

### 1. **Post-Tournament Rating Calculations** (MAJOR BOTTLENECK)

**Problem:**
- For each completed tournament × each participant, calculates post-tournament rating
- If cache misses, recalculates by loading all tournaments chronologically
- Example: 10 tournaments × 8 participants = 80 calculations
- Each cache miss can take 100-500ms

**Why Inconsistent:**
- **Fast:** All ratings are cached (cache hits)
- **Slow:** Cache is empty or expired, requiring full recalculations

**Current Optimization:**
- Ratings are calculated in parallel (Promise.all)
- But still many individual function calls

### 2. **Large Tournament Data Loading**

**Problem:**
- Loads ALL tournaments, participants, and matches in one query
- With many tournaments, this can be a large dataset
- Network transfer time increases with data size

### 3. **Bracket Match Queries**

**Problem:**
- For each PLAYOFF tournament, makes a separate query for bracket matches
- If there are many PLAYOFF tournaments, this is N queries
- Each query also triggers rating history lookup

**Current Optimization:**
- Rating history is batched (1 query total)
- But bracket match queries are still per-tournament

### 4. **No Pagination**

**Problem:**
- All tournaments loaded at once
- No limit on data size
- Performance degrades linearly with number of tournaments

## Performance Scenarios

### Scenario 1: Fast Load (< 200ms)
**Conditions:**
- Small number of tournaments (< 20)
- All post-tournament ratings cached
- Few or no PLAYOFF tournaments
- Recent cache (< 30 seconds)

**Queries:**
- 1 query: All tournaments with participants/matches
- 1 query: Active tournaments
- 0-5 queries: Bracket matches (if any PLAYOFF)
- 1 query: Rating history (batched)

### Scenario 2: Slow Load (1-3 seconds)
**Conditions:**
- Many tournaments (50+)
- Cache miss on post-tournament ratings
- Many PLAYOFF tournaments
- Many participants per tournament

**Queries:**
- 1 query: All tournaments (large result set)
- 1 query: Active tournaments
- 10-50 queries: Bracket matches (one per PLAYOFF tournament)
- 1 query: Rating history (batched)
- 100-500+ calls: `getPostTournamentRating()` (many cache misses)
  - Each cache miss: 2-3 additional queries + rating calculation

## Database Tables Accessed

1. **tournaments** - Main tournament data
2. **tournament_participants** - Tournament participants
3. **members** - Player information
4. **matches** - Match results
5. **bracket_matches** - Bracket structure (PLAYOFF only)
6. **rating_history** - Rating changes (for bracket matches)

## Recommendations for Further Optimization

### 1. **Aggressive Caching of Post-Tournament Ratings**
- Cache ratings in database or Redis
- Persist cache across server restarts
- Invalidate only when tournaments are completed/updated

### 2. **Lazy Load Post-Tournament Ratings**
- Don't calculate on initial load
- Calculate on-demand when user expands tournament details
- Or calculate in background after initial load

### 3. **Pagination**
- Load tournaments in pages (e.g., 20 at a time)
- Load more on scroll or "Load More" button

### 4. **Optimize Bracket Match Queries**
- Batch bracket match queries for all tournaments
- Single query: `WHERE tournamentId IN (...)`

### 5. **Database Query Optimization**
- Add composite indexes on frequently queried combinations
- Consider materialized views for tournament statistics

### 6. **Client-Side Optimization**
- Implement virtual scrolling for large lists
- Defer rendering of collapsed tournaments
- Use React.memo for tournament list items

## Current Cache Strategy

**Client-side (Tournaments.tsx):**
- 30-second in-memory cache
- Shows cached data immediately if available
- Fetches fresh data in background if stale

**Server-side (usattRatingService.ts):**
- In-memory cache for post-tournament ratings
- Cache cleared on server restart
- No persistence

## Monitoring Recommendations

To identify performance issues:

1. **Log query execution times** in `/tournaments` endpoint
2. **Track cache hit/miss rates** for post-tournament ratings
3. **Monitor response sizes** (number of tournaments returned)
4. **Track bracket match query counts** (should be 1 per PLAYOFF tournament)
5. **Monitor rating calculation times** (should be < 50ms per participant when cached)

## Summary

**Fast loads occur when:**
- Post-tournament ratings are cached
- Few tournaments
- Few PLAYOFF tournaments

**Slow loads occur when:**
- Cache misses on post-tournament ratings
- Many tournaments
- Many participants per tournament
- Many PLAYOFF tournaments requiring bracket matches

**Primary bottleneck:** Post-tournament rating calculations with cache misses

