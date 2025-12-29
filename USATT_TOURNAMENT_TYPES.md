# USATT Tournament Types

## Overview
The United States Association of Table Tennis (USATT) organizes various tournament formats. This document outlines the common tournament types used in USATT-sanctioned events.

## Tournament Formats

### 1. Single Elimination (Playoff/Knockout)
- **Description**: Players compete in a bracket format. Each match eliminates the loser, and the winner advances to the next round.
- **Structure**: 
  - Bracket format (typically powers of 2: 4, 8, 16, 32, 64 players)
  - Highest ranked players are seeded to avoid meeting until later rounds
  - BYEs are given to top seeds when player count is not a power of 2
- **Use Cases**: 
  - Championships
  - Finals after group stages
  - Quick tournaments with many participants
- **Advantages**: 
  - Fast completion
  - Clear winner determination
  - Exciting knockout format

### 2. Round Robin
- **Description**: Every player plays every other player once.
- **Structure**: 
  - All players in one group
  - Each player plays (n-1) matches where n = number of players
  - Winner determined by win-loss record, then set ratios
- **Use Cases**: 
  - Small groups (typically 4-8 players)
  - League play
  - Guaranteed matches for all participants
- **Advantages**: 
  - Fair - everyone plays everyone
  - No elimination until the end
  - Comprehensive ranking

### 3. Group Stage + Playoff
- **Description**: Players divided into groups for round-robin play, then top finishers advance to single elimination playoffs.
- **Structure**: 
  - Initial group stage (round robin)
  - Top players from each group advance
  - Single elimination bracket for finals
- **Use Cases**: 
  - Large tournaments
  - Regional championships
  - National competitions
- **Advantages**: 
  - Combines fairness of round robin with excitement of elimination
  - Allows more players to participate meaningfully

### 4. Double Elimination
- **Description**: Players must lose twice to be eliminated. Losers bracket provides second chance.
- **Structure**: 
  - Winners bracket and losers bracket
  - More matches than single elimination
  - True second place determined
- **Use Cases**: 
  - Major championships
  - When fairness is critical
- **Advantages**: 
  - More forgiving
  - True second place
  - More matches for participants

### 5. Swiss System
- **Description**: Players are paired each round based on similar records. No elimination.
- **Structure**: 
  - Fixed number of rounds
  - Pairing based on win-loss records
  - Final ranking by record and tiebreakers
- **Use Cases**: 
  - Large tournaments with time constraints
  - When you want many matches but limited time
- **Advantages**: 
  - Everyone plays all rounds
  - Efficient for large groups
  - Fair pairing system

## Seeding Principles

### Standard Seeding (Power of 2)
For a bracket with 8 players:
- Seed 1 vs Seed 8
- Seed 2 vs Seed 7
- Seed 3 vs Seed 6
- Seed 4 vs Seed 5

This ensures:
- Top 2 seeds can only meet in the final
- Top 4 seeds can only meet in semifinals
- Fair distribution of difficulty

### BYE Handling
When player count is not a power of 2:
- Highest seeds receive BYEs in the first round
- Example: 6 players → Seeds 1 and 2 get BYEs, Seeds 3-6 play first round
- Example: 12 players → Seeds 1-4 get BYEs, Seeds 5-12 play first round

## Rating-Based Seeding
- Players ranked/seeded by current rating
- Higher rating = higher seed
- Ensures best players meet later in tournament
- Protects top players from early elimination

## Implementation Notes

For this system, we implement:
- **PLAYOFF** = Single Elimination tournament
- Seeding based on current ranking/rating
- Automatic bracket generation
- BYE assignment for top seeds
- Manual bracket adjustment capability
- Auto-advancement of winners
- Auto-completion after final



