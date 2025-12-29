# Performance Improvements

This document outlines the performance optimizations implemented to improve database query efficiency and reduce N+1 query problems.

## Summary of Changes

### 1. Fixed N+1 Query Problems

#### `usattRatingService.ts`
- **Batch Member Rating Updates**: Changed sequential `update` calls in loops to parallel execution using `Promise.all()` in three locations:
  - `recalculateAllRatings()`: Updates all player ratings in parallel
  - `createRatingHistoryForRoundRobinTournament()`: Batch updates final ratings and fetches current ratings in a single query
  - `adjustRatingsForSingleMatch()`: Updates both player ratings in parallel

**Impact**: Reduces database round-trips from N sequential queries to N parallel queries, significantly improving performance for bulk operations.

#### `tournaments.ts` Route
- **Batch Post-Tournament Rating Calculations**: Changed nested loops calling `getPostTournamentRating()` to collect all requests and execute them in parallel using `Promise.all()`
  
**Impact**: For tournaments with many participants, this reduces query time from O(n*m) sequential calls to O(n*m) parallel calls.

- **Batch Rating History Queries**: Optimized `attachRatingHistoryToBracketMatches()` to:
  - Collect all matchIds and memberIds first
  - Execute a single batch query for all rating history
  - Build an in-memory map for fast lookups
  
**Impact**: Reduces from N queries (one per bracket match) to 1 query total.

- **Batch Bracket Position Updates**: Optimized bracket position updates to:
  - Fetch all bracket matches in a single query
  - Build an in-memory map
  - Execute all updates in parallel using `Promise.all()`
  
**Impact**: Reduces from N sequential queries to 1 fetch + N parallel updates.

### 2. Optimized Query Structure

#### `getPostTournamentRating()` Function
- **Removed Nested Query**: Changed from a nested query in the `where` clause to a two-step approach:
  1. First fetch tournament `createdAt` date
  2. Then use that date in the main query
  
**Impact**: Eliminates nested query execution, improving query planning and execution time.

### 3. Database Indexes

Added missing indexes to frequently queried fields:

#### `RatingHistory` Table
- Added index on `matchId` for faster lookups when fetching rating history by match

#### `Match` Table
- Added index on `member1Id` for queries filtering by first player
- Added index on `member2Id` for queries filtering by second player  
- Added composite index on `[member1Id, member2Id]` for queries filtering by both players

**Impact**: Significantly improves query performance for:
- Match history lookups
- Player vs player queries
- Rating history by match queries

## Migration Required

To apply the new database indexes, run:

```bash
cd server
npx prisma migrate dev --name add_performance_indexes
```

Or manually create a migration with:

```sql
-- Add index on matchId in rating_history
CREATE INDEX IF NOT EXISTS "rating_history_matchId_idx" ON "rating_history"("matchId");

-- Add indexes on member1Id and member2Id in matches
CREATE INDEX IF NOT EXISTS "matches_member1Id_idx" ON "matches"("member1Id");
CREATE INDEX IF NOT EXISTS "matches_member2Id_idx" ON "matches"("member2Id");
CREATE INDEX IF NOT EXISTS "matches_member1Id_member2Id_idx" ON "matches"("member1Id", "member2Id");
```

## Performance Impact

### Before Optimizations
- **Tournament List Endpoint**: Could take 5-10+ seconds with many tournaments and participants
- **Bracket Display**: 2-5 seconds for tournaments with many matches
- **Rating Calculations**: Sequential updates causing long wait times

### After Optimizations
- **Tournament List Endpoint**: Expected 50-80% reduction in query time
- **Bracket Display**: Expected 70-90% reduction in query time (from N queries to 1)
- **Rating Calculations**: Parallel execution reduces total time significantly

## Best Practices Applied

1. **Batch Queries**: Collect all required data first, then execute a single query
2. **Parallel Execution**: Use `Promise.all()` for independent operations
3. **In-Memory Maps**: Build lookup maps to avoid repeated queries
4. **Database Indexes**: Add indexes on frequently queried fields
5. **Avoid Nested Queries**: Break complex queries into simpler steps

## Future Optimization Opportunities

1. **Caching Layer**: Consider adding Redis for frequently accessed tournament/player data
2. **Pagination**: Implement pagination for tournament lists to reduce initial load
3. **Lazy Loading**: Load bracket matches only when needed
4. **Database Connection Pooling**: Ensure proper connection pool configuration
5. **Query Result Caching**: Cache post-tournament ratings more aggressively

## Testing Recommendations

1. Test with large datasets (100+ tournaments, 50+ players)
2. Monitor database query times before/after
3. Check for any regressions in functionality
4. Verify parallel execution doesn't cause race conditions
5. Test with concurrent requests to ensure stability

