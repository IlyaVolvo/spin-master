# Single Match Rating Calculation Explanation

## How It Works

The single match rating system uses a **point exchange table** based on the USATT (USA Table Tennis) rating system. When two players play a match, they exchange rating points based on:

1. **Rating difference** between players
2. **Who won** the match
3. **Whether it was an upset** (lower-rated player beating higher-rated player)

## The Calculation Process

### Step 1: Get Current Ratings
```typescript
const rating1 = player1.rating ?? 1200; // Default to 1200 if unrated
const rating2 = player2.rating ?? 1200;
```

### Step 2: Calculate Rating Difference
```typescript
const ratingDiff = rating2 - rating1;
```
- If `ratingDiff > 0`: Player 2 is rated higher
- If `ratingDiff < 0`: Player 1 is rated higher
- If `ratingDiff = 0`: Players have the same rating

### Step 3: Determine if Upset
```typescript
const isUpset = player1Won && ratingDiff > 0;
```
**IMPORTANT**: This only detects upsets when Player 1 wins. If Player 2 wins as the underdog, this won't be detected as an upset!

### Step 4: Get Point Exchange
The `getPointExchange()` function returns points based on:
- Rating difference (absolute value)
- Whether it's an upset

**Point Exchange Table Examples:**
- Rating diff ≤ 12: **8 points** (expected result) or **8 points** (upset)
- Rating diff 13-37: **7 points** (expected) or **10 points** (upset)
- Rating diff 38-62: **6 points** (expected) or **13 points** (upset)
- Rating diff 63-87: **5 points** (expected) or **16 points** (upset)
- ... and so on

Upsets give MORE points to the winner because they're unexpected.

### Step 5: Apply Point Exchange
```typescript
if (player1Won) {
  newRating1 += points;  // Winner gains points
  newRating2 -= points;  // Loser loses points
} else {
  newRating1 -= points;  // Loser loses points
  newRating2 += points;  // Winner gains points
}
```

**This is a zero-sum exchange**: The total points in the system remain constant. One player gains exactly what the other loses.

## Why Both Players Can Have Positive OR Negative Adjustments

Both players can have positive OR negative adjustments depending on:

1. **If you win**: You **gain** points (+)
2. **If you lose**: You **lose** points (-)

**Examples:**

### Example 1: Expected Result (No Upset)
- Player 1: 1500 rating
- Player 2: 1400 rating
- Rating diff: 1400 - 1500 = -100 (Player 1 is 100 points higher)
- Player 1 wins (expected)
- Point exchange: 4 points (not an upset, diff > 87)
- **Result:**
  - Player 1: 1500 + 4 = **1504** (+4)
  - Player 2: 1400 - 4 = **1396** (-4)

### Example 2: Upset (Lower-Rated Player Wins)
- Player 1: 1500 rating
- Player 2: 1400 rating
- Rating diff: 1400 - 1500 = -100
- Player 2 wins (upset!)
- **BUG**: Current code doesn't detect this as an upset!
  - `isUpset = player1Won && ratingDiff > 0` would be `false`
  - Should be: `isUpset = (player2Won && ratingDiff < 0)` = true
- If detected correctly:
  - Point exchange: 20 points (upset, diff 87-112)
  - Player 1: 1500 - 20 = **1480** (-20)
  - Player 2: 1400 + 20 = **1420** (+20)

### Example 3: Close Match
- Player 1: 1500 rating
- Player 2: 1495 rating
- Rating diff: 1495 - 1500 = -5
- Player 2 wins
- Point exchange: 8 points (diff ≤ 12)
- **Result:**
  - Player 1: 1500 - 8 = **1492** (-8)
  - Player 2: 1495 + 8 = **1503** (+8)

## Potential Bug in Current Implementation

The upset detection is incomplete:

```typescript
const isUpset = player1Won && ratingDiff > 0;
```

This only detects upsets when:
- Player 1 wins AND
- Player 2 is rated higher

It **misses** upsets when:
- Player 2 wins AND
- Player 1 is rated higher

**Correct upset detection should be:**
```typescript
const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
```

Or more clearly:
```typescript
const isUpset = player1Won 
  ? ratingDiff > 0  // Player 1 (lower rated) beat Player 2 (higher rated)
  : ratingDiff < 0; // Player 2 (lower rated) beat Player 1 (higher rated)
```

## Summary

- **Both players can have positive OR negative adjustments** - this is normal!
- Winner gains points, loser loses points
- Upsets give more points to the winner
- The current code may not correctly detect all upsets
- Ratings are always exchanged (zero-sum)

