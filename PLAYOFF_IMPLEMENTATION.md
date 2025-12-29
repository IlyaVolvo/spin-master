# Single Elimination (PLAYOFF) Tournament Implementation Plan

## Overview
Implementing a complete single elimination tournament system with seeding, BYEs, drag-and-drop bracket editing, and auto-advancement.

## Features to Implement

### 1. Player Selection ✅
- Use same selection UI as ROUND_ROBIN tournaments
- Allow selecting 2+ players for playoff tournament

### 2. Seeding System
- Button to "Seed Players by Rating"
- Highest ranked players don't meet until later stages
- Standard tournament bracket seeding pattern

### 3. BYE Handling
- Automatically create BYEs for highest ranked players
- Only when player count is not a power of 2
- BYE players advance automatically to next round

### 4. Drag and Drop Bracket Editing
- Visual bracket display
- Allow manual repositioning of players
- Save bracket structure

### 5. Auto-Advancement
- When match is completed, winner advances to next round
- Ratings updated immediately after match
- Next round match created automatically

### 6. Auto-Completion
- Tournament completes automatically after final match
- No manual completion needed

## Implementation Steps

1. ✅ Database schema - Add round, position, nextMatchId to Match model
2. ⏳ Bracket generation service - Create initial bracket with seeding
3. ⏳ Tournament creation - Generate bracket when PLAYOFF tournament is created
4. ⏳ Bracket display component - Visual bracket with drag-and-drop
5. ⏳ Match completion logic - Auto-advance winners
6. ⏳ Auto-completion - Complete tournament after final

## Technical Details

### Bracket Seeding Pattern
For 8 players:
- Round 1: (1 vs 8), (4 vs 5), (2 vs 7), (3 vs 6)
- Semifinals: (1/8 winner vs 4/5 winner), (2/7 winner vs 3/6 winner)
- Final: Semifinal winners

### BYE Examples
- 6 players → Seeds 1-2 get BYEs, Seeds 3-6 play Round 1
- 12 players → Seeds 1-4 get BYEs, Seeds 5-12 play Round 1

### Match Advancement
- Round 1 match winner → Round 2 (position based on bracket structure)
- Each round winner advances to next round
- Final match winner = tournament champion



