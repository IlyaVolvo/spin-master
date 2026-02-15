# generateTournament.ts

Generate or continue a tournament with randomly selected players and simulated match results.

```
cd server
npx tsx scripts/generateTournament.ts [args]
```

---

## Modes

### Create Mode

```
npx tsx scripts/generateTournament.ts <type> <numPlayers> [options]
```

Creates a new tournament, selects random players from the database, simulates matches, and prints `TOURNAMENT_ID=<id>` at the end.

### Continue Mode

```
npx tsx scripts/generateTournament.ts --continue <tournamentId> [options]
```

Resumes an existing **ACTIVE** tournament by simulating its remaining matches. The tournament type is auto-detected from the database. Errors if the tournament is already COMPLETED.

---

## Tournament Types

| Alias            | Type                                  | Description                                      |
|------------------|---------------------------------------|--------------------------------------------------|
| `rr`             | ROUND_ROBIN                           | Every player plays every other player             |
| `playoff`        | PLAYOFF                               | Single-elimination bracket                        |
| `swiss`          | SWISS                                 | Swiss-system pairing across multiple rounds       |
| `prelim-rr`      | PRELIMINARY_WITH_FINAL_ROUND_ROBIN    | Preliminary RR groups → Final Round Robin         |
| `prelim-playoff` | PRELIMINARY_WITH_FINAL_PLAYOFF        | Preliminary RR groups → Final Playoff bracket     |

---

## Options

### Common Options (Create Mode)

| Flag               | Type   | Default | Description                                          |
|--------------------|--------|---------|------------------------------------------------------|
| `--rating-min <n>` | int    | 0       | Minimum player rating filter                         |
| `--rating-max <n>` | int    | 9999    | Maximum player rating filter                         |
| `--correlation <f>`| float  | 0       | Rating-result correlation (-1 to 1)                  |
| `--complete <n>`   | int    | 100     | % of matches to simulate (0–100)                     |
| `--name <string>`  | string | auto    | Tournament name (default: `Generated <Type> YYYY-MM-DD HH:MM`) |

**Correlation values:**
- `0` — pure Elo probability (random upsets possible)
- `1` — higher-rated player always wins
- `-1` — lower-rated player always wins (upsets only)

### Type-Specific Options

#### Playoff

| Flag           | Type | Default          | Description              |
|----------------|------|------------------|--------------------------|
| `--seeds <n>`  | int  | numPlayers / 4   | Number of seeded players |

#### Swiss

| Flag            | Type | Default                          | Description        |
|-----------------|------|----------------------------------|--------------------|
| `--rounds <n>`  | int  | floor(log2(numPlayers)) + 2      | Number of rounds   |

#### Preliminary (prelim-rr and prelim-playoff)

| Flag            | Type | Default                                          | Description                        |
|-----------------|------|--------------------------------------------------|------------------------------------|
| `--auto <n>`    | int  | 0                                                | Auto-qualified players (skip prelim) |
| `--groups <n>`  | int  | 5                                                | Number of preliminary groups       |
| `--final <n>`   | int  | see below                                        | Size of the final phase            |

**Final size defaults:**
- **prelim-rr**: `groups + auto` (e.g., 5 groups + 0 auto = 5 finalists)
- **prelim-playoff**: closest power of 2 to `2 × groups + auto` (e.g., 5 groups + 0 auto → closest pow2 of 10 → **8**)

For prelim-playoff, `--final` must be a power of 2 (2, 4, 8, 16, …).

### Continue Mode Options

| Flag               | Type  | Default | Description                              |
|--------------------|-------|---------|------------------------------------------|
| `--correlation <f>`| float | 0       | Rating-result correlation (-1 to 1)      |
| `--complete <n>`   | int   | 100     | % of *remaining* matches to simulate     |

No other flags are allowed in continue mode.

---

## Match Simulation

- Matches are best-of-5 sets
- Win probability is based on Elo rating difference, biased by `--correlation`
- **Round Robin**: matchups are shuffled so players accumulate matches evenly (not sequentially)
- **Compound tournaments**: group matches are interleaved across groups (one match per group in rotation)

---

## Output

Both modes print `TOURNAMENT_ID=<id>` as the last line, making it easy to capture in scripts:

```bash
ID=$(npx tsx scripts/generateTournament.ts rr 6 --complete 50 2>/dev/null | grep TOURNAMENT_ID | cut -d= -f2)
npx tsx scripts/generateTournament.ts --continue $ID
```

---

## Examples

### Round Robin — full

```bash
npx tsx scripts/generateTournament.ts rr 8
```

### Round Robin — partial, then continue

```bash
npx tsx scripts/generateTournament.ts rr 6 --complete 50
# → TOURNAMENT_ID=229

npx tsx scripts/generateTournament.ts --continue 229
# → simulates remaining 50%, completes the tournament
```

### Playoff — with seeds and correlation

```bash
npx tsx scripts/generateTournament.ts playoff 8 --seeds 2 --correlation 0.5
```

### Swiss — custom rounds

```bash
npx tsx scripts/generateTournament.ts swiss 12 --rounds 5
```

### Swiss — incremental simulation

```bash
npx tsx scripts/generateTournament.ts swiss 12 --complete 30
# → TOURNAMENT_ID=231

npx tsx scripts/generateTournament.ts --continue 231 --complete 40
# → plays 40% of remaining matches, still ACTIVE

npx tsx scripts/generateTournament.ts --continue 231
# → finishes all remaining matches, completes
```

### Preliminary + Final Round Robin — defaults

```bash
npx tsx scripts/generateTournament.ts prelim-rr 30
# → 5 groups, 0 auto-qualified, final size 5
```

### Preliminary + Final Round Robin — custom

```bash
npx tsx scripts/generateTournament.ts prelim-rr 20 --groups 4 --final 6 --auto 2
# → 4 groups, 2 auto-qualified, 6-player final RR
```

### Preliminary + Final Playoff — defaults

```bash
npx tsx scripts/generateTournament.ts prelim-playoff 30
# → 5 groups, 0 auto-qualified, 8-player playoff bracket
```

### Preliminary + Final Playoff — custom

```bash
npx tsx scripts/generateTournament.ts prelim-playoff 24 --groups 4 --final 8 --auto 2
# → 4 groups, 2 auto-qualified, 8-player playoff bracket
```

### Filtered player pool

```bash
npx tsx scripts/generateTournament.ts rr 6 --rating-min 1200 --rating-max 1800
```

### Named tournament

```bash
npx tsx scripts/generateTournament.ts swiss 10 --name "Weekly Swiss #42"
```

### Help

```bash
npx tsx scripts/generateTournament.ts --help
```
