/**
 * Generate or continue a tournament with randomly selected players and
 * simulated match results.
 *
 * ── CREATE MODE ──────────────────────────────────────────────────────
 *
 *   npx tsx scripts/generateTournament.ts <type> <numPlayers> [options]
 *
 *   Creates a new tournament, selects random players, simulates matches,
 *   and prints the tournament ID at the end.
 *
 *   Types:
 *     rr             Round Robin
 *     playoff        Single Elimination Playoff
 *     swiss          Swiss System
 *     prelim-rr      Preliminary groups → Final Round Robin
 *     prelim-playoff Preliminary groups → Final Playoff
 *
 *   Common options:
 *     --rating-min <n>     Minimum rating filter (default: 0)
 *     --rating-max <n>     Maximum rating filter (default: 9999)
 *     --correlation <f>    Rating-result correlation, -1..1 (default: 0)
 *                          0 = pure random (50/50 coin flip)
 *                          1 = full Elo probability (rating gap matters)
 *                         -1 = inverted Elo (lower rated favored)
 *     --complete <n>       % of matches to simulate, 0-100 (default: 100)
 *     --name <string>      Tournament name (default: TYPE YYYY-MM-DD HH:MM)
 *
 *   Type-specific options:
 *     playoff:        --seeds <n>  (default: 0, must be 0 or power of 2)
 *     prelim-rr:      --auto <n>  --groups <n>  --final <n>
 *     prelim-playoff: --auto <n>  --groups <n>  --final <n>
 *
 * ── CONTINUE MODE ────────────────────────────────────────────────────
 *
 *   npx tsx scripts/generateTournament.ts --continue <tournamentId> [options]
 *
 *   Resumes an existing ACTIVE tournament by simulating its remaining
 *   matches. The tournament type is auto-detected from the database.
 *
 *   Compatible options:
 *     --correlation <f>    Rating-result correlation (default: 0)
 *     --complete <n>       % of *remaining* matches to simulate (default: 100)
 *
 * ── EXAMPLES ─────────────────────────────────────────────────────────
 *
 *   # Create a partial RR tournament, then finish it later:
 *   npx tsx scripts/generateTournament.ts rr 6 --complete 50
 *   # → TOURNAMENT_ID=229
 *
 *   npx tsx scripts/generateTournament.ts --continue 229
 *   # → simulates remaining 50% and completes the tournament
 *
 *   # Create a full playoff:
 *   npx tsx scripts/generateTournament.ts playoff 8 --seeds 2 --correlation 0.5
 *
 *   # Create a Swiss, play 30%, then add 40% more:
 *   npx tsx scripts/generateTournament.ts swiss 12 --complete 30
 *   # → TOURNAMENT_ID=231
 *   npx tsx scripts/generateTournament.ts --continue 231 --complete 40
 *   # → plays 40% of remaining matches, still ACTIVE
 *   npx tsx scripts/generateTournament.ts --continue 231
 *   # → finishes all remaining matches and completes
 *
 *   # Preliminary tournaments:
 *   npx tsx scripts/generateTournament.ts prelim-rr 16 --groups 4 --final 6 --auto 2
 *   npx tsx scripts/generateTournament.ts prelim-playoff 16 --groups 4 --final 8 --auto 2
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

interface CommonOpts {
  type: string;
  numPlayers: number;
  ratingMin: number;
  ratingMax: number;
  correlation: number;
  complete: number;
  name?: string;
}

interface PlayoffOpts extends CommonOpts { seeds: number; }
interface SwissOpts extends CommonOpts { rounds: number; }
interface PrelimOpts extends CommonOpts { auto: number; groups: number; final: number; }

type Opts = CommonOpts & Partial<PlayoffOpts> & Partial<SwissOpts> & Partial<PrelimOpts>;

const TYPE_ALIASES: Record<string, string> = {
  'rr': 'ROUND_ROBIN',
  'round-robin': 'ROUND_ROBIN',
  'playoff': 'PLAYOFF',
  'swiss': 'SWISS',
  'prelim-rr': 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
  'prelim-playoff': 'PRELIMINARY_WITH_FINAL_PLAYOFF',
};

function parseArgs(argv: string[]): Opts {
  if (argv.length < 2) printUsageAndExit();

  const type = TYPE_ALIASES[argv[0].toLowerCase()];
  if (!type) {
    console.error(`❌ Unknown type "${argv[0]}". Valid: ${Object.keys(TYPE_ALIASES).join(', ')}`);
    process.exit(1);
  }

  const numPlayers = parseInt(argv[1]);
  if (isNaN(numPlayers) || numPlayers < 2) {
    console.error('❌ numPlayers must be an integer >= 2');
    process.exit(1);
  }

  const opts: Opts = {
    type,
    numPlayers,
    ratingMin: 0,
    ratingMax: 9999,
    correlation: 0,
    complete: 100,
  };

  let i = 2;
  while (i < argv.length) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--rating-min': opts.ratingMin = parseInt(next); i += 2; break;
      case '--rating-max': opts.ratingMax = parseInt(next); i += 2; break;
      case '--correlation': opts.correlation = parseFloat(next); i += 2; break;
      case '--name': opts.name = next; i += 2; break;
      case '--complete': opts.complete = parseInt(next); i += 2; break;
      case '--seeds': opts.seeds = parseInt(next); i += 2; break;
      case '--rounds': opts.rounds = parseInt(next); i += 2; break;
      case '--auto': opts.auto = parseInt(next); i += 2; break;
      case '--groups': opts.groups = parseInt(next); i += 2; break;
      case '--final': opts.final = parseInt(next); i += 2; break;
      default:
        console.error(`❌ Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  // Validate correlation
  if (opts.correlation < -1 || opts.correlation > 1) {
    console.error('❌ --correlation must be between -1 and 1');
    process.exit(1);
  }

  if (opts.ratingMin > opts.ratingMax) {
    console.error('❌ --rating-min must be <= --rating-max');
    process.exit(1);
  }

  if (isNaN(opts.complete) || opts.complete < 0 || opts.complete > 100) {
    console.error('❌ --complete must be an integer between 0 and 100');
    process.exit(1);
  }

  return opts;
}

interface ContinueOpts {
  tournamentId: number;
  correlation: number;
  complete: number;
}

function parseContinueArgs(argv: string[]): ContinueOpts {
  // argv[0] is '--continue', argv[1] is the tournament ID
  if (argv.length < 2) {
    console.error('❌ --continue requires a tournament ID');
    printUsageAndExit();
  }

  const tournamentId = parseInt(argv[1]);
  if (isNaN(tournamentId) || tournamentId < 1) {
    console.error('❌ Invalid tournament ID');
    process.exit(1);
  }

  const opts: ContinueOpts = {
    tournamentId,
    correlation: 0,
    complete: 100,
  };

  let i = 2;
  while (i < argv.length) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--correlation': opts.correlation = parseFloat(next); i += 2; break;
      case '--complete': opts.complete = parseInt(next); i += 2; break;
      default:
        console.error(`❌ Unknown flag for --continue mode: ${flag}`);
        console.error('   Only --correlation and --complete are allowed');
        process.exit(1);
    }
  }

  if (opts.correlation < -1 || opts.correlation > 1) {
    console.error('❌ --correlation must be between -1 and 1');
    process.exit(1);
  }

  if (isNaN(opts.complete) || opts.complete < 0 || opts.complete > 100) {
    console.error('❌ --complete must be an integer between 0 and 100');
    process.exit(1);
  }

  return opts;
}

function printUsageAndExit(): never {
  console.error(`
Usage:
  Create:   npx tsx scripts/generateTournament.ts <type> <numPlayers> [options]
  Continue: npx tsx scripts/generateTournament.ts --continue <id> [--correlation <f>] [--complete <n>]

Types: rr, playoff, swiss, prelim-rr, prelim-playoff

Create options:
  --rating-min <n>     (default: 0)
  --rating-max <n>     (default: 9999)
  --correlation <f>    -1..1 (default: 0)
  --complete <n>       % of matches to simulate, 0-100 (default: 100)
  --name <string>

Type-specific:
  playoff:        --seeds <n>
  swiss:          --rounds <n>  (default: floor(log2(numPlayers)) + 2)
  prelim-rr:      --auto <n> (0)  --groups <n> (5)  --final <n> (groups + auto)
  prelim-playoff: --auto <n> (0)  --groups <n> (5)  --final <n> (closest pow2 of 2*groups + auto)

Continue options:
  --correlation <f>    -1..1 (default: 0)
  --complete <n>       % of *remaining* matches to simulate (default: 100)
`);
  process.exit(1);
}

// ─── Default Name ────────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  'ROUND_ROBIN': 'Round Robin',
  'PLAYOFF': 'Playoff',
  'SWISS': 'Swiss',
  'PRELIMINARY_WITH_FINAL_ROUND_ROBIN': 'Prelim+RR',
  'PRELIMINARY_WITH_FINAL_PLAYOFF': 'Prelim+Playoff',
};

function defaultName(type: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `Generated ${DISPLAY_NAMES[type] || type} ${dateStr}`;
}

/**
 * Win probability for player 1 given ratings and correlation.
 *
 * The correlation controls how much the rating difference matters:
 *   correlation = 0  -> 50/50 coin flip (ratings ignored)
 *   correlation = 1  -> full Elo probability (larger rating gaps = stronger favorite)
 *   correlation = -1 -> inverted Elo (lower rated player gets the Elo advantage)
 *
 * The rating difference naturally scales the effect: a 200-point gap
 * produces a bigger favorite than a 50-point gap at the same correlation.
 */
function winProbability(rating1: number, rating2: number, correlation: number): number {
  // Elo probability based on rating difference
  const eloProbability = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));

  if (correlation === 0) return 0.5;

  if (correlation > 0) {
    // Blend from 50/50 toward full Elo probability
    return 0.5 + correlation * (eloProbability - 0.5);
  } else {
    // Negative correlation: invert the Elo advantage (upsets)
    const invertedElo = 1 - eloProbability;
    return 0.5 + Math.abs(correlation) * (invertedElo - 0.5);
  }
}

function simulateBestOf5(rating1: number, rating2: number, correlation: number): { player1Sets: number; player2Sets: number } {
  const p = winProbability(rating1, rating2, correlation);
  let s1 = 0, s2 = 0;
  while (s1 < 3 && s2 < 3) {
    if (Math.random() < p) s1++; else s2++;
  }
  return { player1Sets: s1, player2Sets: s2 };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function closestPowerOf2(n: number): number {
  if (n <= 1) return 2;
  const lower = Math.pow(2, Math.floor(Math.log2(n)));
  const upper = lower * 2;
  return (n - lower <= upper - n) ? lower : upper;
}

/** Snake-draft players into groups (sorted by rating desc, then snake) */
function snakeDraftGroups(playerIds: number[], ratings: Map<number, number>, numGroups: number): number[][] {
  const sorted = [...playerIds].sort((a, b) => (ratings.get(b) ?? 0) - (ratings.get(a) ?? 0));
  const groups: number[][] = Array.from({ length: numGroups }, () => []);
  let forward = true;
  let g = 0;
  for (const id of sorted) {
    groups[g].push(id);
    if (forward) {
      if (g === numGroups - 1) { forward = false; } else { g++; }
    } else {
      if (g === 0) { forward = true; } else { g--; }
    }
  }
  return groups;
}

// ─── Player Selection ────────────────────────────────────────────────────────

async function selectPlayers(numPlayers: number, ratingMin: number, ratingMax: number) {
  const allEligible = await prisma.member.findMany({
    where: {
      isActive: true,
      rating: { gte: ratingMin, lte: ratingMax, not: null },
    },
    orderBy: { rating: 'desc' },
  });

  if (allEligible.length < 2) {
    console.error(`❌ Need at least 2 players but only ${allEligible.length} eligible (rating ${ratingMin}-${ratingMax})`);
    process.exit(1);
  }

  const actualCount = Math.min(numPlayers, allEligible.length);
  if (actualCount < numPlayers) {
    console.log(`⚠  Requested ${numPlayers} players but only ${allEligible.length} eligible (rating ${ratingMin}-${ratingMax}), using ${actualCount}`);
  }

  const selected = shuffle(allEligible).slice(0, actualCount);
  console.log(`\nSelected ${actualCount} players:`);
  selected.forEach((p, i) => console.log(`  ${i + 1}. ${p.firstName} ${p.lastName} (Rating: ${p.rating}, ID: ${p.id})`));
  console.log('');
  return selected;
}

// ─── Tournament Generators ───────────────────────────────────────────────────

type Player = { id: number; firstName: string; lastName: string; rating: number | null };

function playerName(p: Player) { return `${p.firstName} ${p.lastName}`; }
function playerRating(p: Player) { return p.rating ?? 1200; }

function logMatch(p1: Player, p2: Player, s1: number, s2: number) {
  const winner = s1 > s2 ? playerName(p1) : playerName(p2);
  console.log(`  ${playerName(p1)} (${playerRating(p1)}) vs ${playerName(p2)} (${playerRating(p2)}) → ${s1}-${s2} | Winner: ${winner}`);
}

/** Calculate per-match rating adjustments (creates RatingHistory records) */
async function calculateMatchRating(match: any, tournamentId: number) {
  if (!match || match.player1Forfeit || match.player2Forfeit || !match.member1Id || !match.member2Id) return;
  const { adjustRatingsForSingleMatch } = await import('../src/services/usattRatingService');
  const player1Won = match.winnerId === match.member1Id;
  await adjustRatingsForSingleMatch(match.member1Id, match.member2Id, player1Won, tournamentId, match.id);
}

// ─── Round Robin ─────────────────────────────────────────────────────────────

async function generateRoundRobin(players: Player[], opts: Opts) {
  const name = opts.name || defaultName('ROUND_ROBIN');
  console.log(`Creating Round Robin tournament: "${name}"...`);

  const participantIds = players.map(p => p.id);

  // Use plugin to create tournament
  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('ROUND_ROBIN');
  const tournament = await plugin.createTournament({
    name,
    participantIds,
    players,
    prisma,
  });

  console.log(`✓ Tournament created (ID: ${tournament.id})\n`);

  // Generate all RR matchups and shuffle so players accumulate matches evenly
  const matchups: Array<[number, number]> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matchups.push([i, j]);
    }
  }
  shuffle(matchups);

  const matchCount = Math.floor(matchups.length * opts.complete / 100);
  console.log(`Simulating ${matchCount}/${matchups.length} matches (${opts.complete}%)...\n`);

  for (let idx = 0; idx < matchCount; idx++) {
    const [i, j] = matchups[idx];
    const p1 = players[i], p2 = players[j];
    const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1), playerRating(p2), opts.correlation);

    const result = await plugin.updateMatch({
      matchId: 0, // 0 = create new match
      tournamentId: tournament.id,
      member1Id: p1.id,
      member2Id: p2.id,
      player1Sets,
      player2Sets,
      player1Forfeit: false,
      player2Forfeit: false,
      prisma,
    });
    await calculateMatchRating(result.match, tournament.id);

    logMatch(p1, p2, player1Sets, player2Sets);
  }

  console.log(`\n✓ ${matchCount} matches created`);
  if (opts.complete >= 100) {
    await completeTournament(tournament.id, 'ROUND_ROBIN');
  } else {
    console.log(`\n⏸  Tournament left ACTIVE (${opts.complete}% complete)`);
  }
  return tournament.id;
}

// ─── Playoff ─────────────────────────────────────────────────────────────────

async function generatePlayoff(players: Player[], opts: Opts) {
  const name = opts.name || defaultName('PLAYOFF');
  const numSeeds = opts.seeds ?? 0;

  // Sort by rating for seeding
  const sorted = [...players].sort((a, b) => playerRating(b) - playerRating(a));
  const participantIds = sorted.map(p => p.id);

  // Generate bracket positions
  const { generateBracketPositions, calculateBracketSize } = await import('../src/services/playoffBracketService');
  const bracketSize = calculateBracketSize(players.length);
  const bracketPositions = generateBracketPositions(participantIds, bracketSize, numSeeds);

  console.log(`Creating Playoff tournament: "${name}" (bracket size: ${bracketSize}, seeds: ${numSeeds})...`);

  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('PLAYOFF');
  const tournament = await plugin.createTournament({
    name,
    participantIds,
    players: sorted,
    prisma,
    additionalData: { bracketPositions },
  });

  console.log(`✓ Tournament created (ID: ${tournament.id})\n`);

  // Simulate bracket matches round by round
  await simulatePlayoffBracket(tournament.id, players, opts.correlation, opts.complete);

  if (opts.complete >= 100) {
    await completeTournament(tournament.id, 'PLAYOFF');
  } else {
    console.log(`\n⏸  Tournament left ACTIVE (${opts.complete}% complete)`);
  }
  return tournament.id;
}

async function simulatePlayoffBracket(tournamentId: number, allPlayers: Player[], correlation: number, completePct: number = 100) {
  // Directly create Match records and call advanceWinner instead of plugin.updateMatch,
  // because plugin.updateMatch first tries prisma.match.findUnique({where: {id: matchId}})
  // and BracketMatch IDs can collide with Match IDs from other tournaments.
  const { advanceWinner } = await import('../src/services/playoffBracketService');
  const playerMap = new Map(allPlayers.map(p => [p.id, p]));

  let round = 1;
  while (true) {
    // Fetch current bracket state
    const bracketMatches = await prisma.bracketMatch.findMany({
      where: { tournamentId, round },
      include: { match: true },
      orderBy: { position: 'asc' },
    });

    if (bracketMatches.length === 0) break;

    // Find matches that need to be played (both players present, no match result yet)
    const playable = bracketMatches.filter(
      (bm: any) => bm.member1Id && bm.member2Id && !bm.match
    );

    if (playable.length === 0) {
      round++;
      continue;
    }

    // Single elimination: total matches = participants - 1
    // We count distinct participants across all bracket matches (not just currently-assigned ones)
    const participantCount = await prisma.tournamentParticipant.count({
      where: { tournamentId },
    });
    const totalMatches = participantCount - 1;
    const playedSoFar = await prisma.bracketMatch.count({
      where: { tournamentId, matchId: { not: null } },
    });
    const targetTotal = Math.floor(totalMatches * completePct / 100);

    if (playedSoFar >= targetTotal) {
      console.log(`  (skipping round ${round} — ${completePct}% target reached)`);
      break;
    }

    const remainingBudget = targetTotal - playedSoFar;
    const toPlay = Math.min(playable.length, remainingBudget);

    console.log(`Round ${round} (${toPlay}/${playable.length} matches):`);

    for (let mi = 0; mi < toPlay; mi++) {
      const bm = playable[mi];
      const p1 = playerMap.get(bm.member1Id!) || { id: bm.member1Id!, firstName: '?', lastName: '?', rating: 1200 };
      const p2 = playerMap.get(bm.member2Id!) || { id: bm.member2Id!, firstName: '?', lastName: '?', rating: 1200 };
      const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), correlation);

      const winnerId = player1Sets > player2Sets ? bm.member1Id! : bm.member2Id!;

      // Create match record
      const match = await prisma.match.create({
        data: {
          tournamentId,
          member1Id: bm.member1Id!,
          member2Id: bm.member2Id!,
          player1Sets,
          player2Sets,
        },
      });

      // Link bracket match to the new match record
      await prisma.bracketMatch.update({
        where: { id: bm.id },
        data: { matchId: match.id },
      });

      await calculateMatchRating(match, tournamentId);

      // Advance winner to next round
      await advanceWinner(tournamentId, bm.id, winnerId);

      logMatch(p1 as Player, p2 as Player, player1Sets, player2Sets);
    }

    if (toPlay < playable.length) {
      console.log(`  (stopped — ${completePct}% target reached)`);
      break;
    }

    console.log('');
    round++;
  }

  console.log('✓ Bracket simulation done');
}

// ─── Swiss ───────────────────────────────────────────────────────────────────

async function generateSwiss(players: Player[], opts: Opts) {
  const numberOfRounds = opts.rounds ?? (Math.floor(Math.log2(players.length)) + 2);
  const name = opts.name || defaultName('SWISS');

  console.log(`Creating Swiss tournament: "${name}" (${numberOfRounds} rounds)...`);

  const participantIds = players.map(p => p.id);
  const playerMap = new Map(players.map(p => [p.id, p]));

  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('SWISS');
  const tournament = await plugin.createTournament({
    name,
    participantIds,
    players,
    prisma,
    additionalData: { numberOfRounds },
  });

  console.log(`✓ Tournament created (ID: ${tournament.id})\n`);

  // Swiss: rounds are generated automatically by the plugin.
  // Round 1 was already generated by createTournament.
  // After scoring all matches in a round, the plugin's updateMatch auto-generates the next round.
  const matchesPerRound = Math.floor(players.length / 2);
  const totalExpectedMatches = matchesPerRound * numberOfRounds;
  const targetMatches = Math.floor(totalExpectedMatches * opts.complete / 100);
  let matchesPlayed = 0;

  for (let round = 1; round <= numberOfRounds; round++) {
    if (matchesPlayed >= targetMatches) {
      console.log(`  (stopping — ${opts.complete}% target reached)`);
      break;
    }

    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id, round },
      orderBy: { id: 'asc' },
    });

    if (matches.length === 0) {
      console.log(`  Round ${round}: no matches generated (odd player count or exhausted pairings)`);
      continue;
    }

    const budget = targetMatches - matchesPlayed;
    const toPlay = Math.min(matches.length, budget);
    console.log(`Round ${round} (${toPlay}/${matches.length} matches):`);

    for (let mi = 0; mi < toPlay; mi++) {
      const match = matches[mi];
      const p1 = playerMap.get(match.member1Id) || { id: match.member1Id, firstName: '?', lastName: '?', rating: 1200 };
      const p2 = playerMap.get(match.member2Id!) || { id: match.member2Id!, firstName: '?', lastName: '?', rating: 1200 };
      const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), opts.correlation);

      const swissResult = await plugin.updateMatch({
        matchId: match.id,
        tournamentId: tournament.id,
        player1Sets,
        player2Sets,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma,
      });
      await calculateMatchRating(swissResult.match, tournament.id);

      logMatch(p1 as Player, p2 as Player, player1Sets, player2Sets);
      matchesPlayed++;
    }

    if (toPlay < matches.length) {
      console.log(`  (stopped mid-round — ${opts.complete}% target reached)`);
      break;
    }

    console.log('');
  }

  console.log('✓ Swiss simulation done');
  if (opts.complete >= 100) {
    await completeTournament(tournament.id, 'SWISS');
  } else {
    console.log(`\n⏸  Tournament left ACTIVE (${opts.complete}% complete)`);
  }
  return tournament.id;
}

// ─── Preliminary + Final Round Robin ─────────────────────────────────────────

async function generatePrelimRR(players: Player[], opts: Opts) {
  const numGroups = opts.groups ?? 5;
  const autoCount = opts.auto ?? 0;
  const finalSize = opts.final ?? (numGroups + autoCount);
  const name = opts.name || defaultName('PRELIMINARY_WITH_FINAL_ROUND_ROBIN');

  if (autoCount >= players.length) {
    console.error('❌ --auto must be less than numPlayers');
    process.exit(1);
  }

  // Sort by rating, top autoCount are auto-qualified
  const sorted = [...players].sort((a, b) => playerRating(b) - playerRating(a));
  const autoQualified = sorted.slice(0, autoCount);
  const groupPlayers = sorted.slice(autoCount);

  const autoQualifiedMemberIds = autoQualified.map(p => p.id);
  const participantIds = sorted.map(p => p.id);
  const ratingMap = new Map(sorted.map(p => [p.id, playerRating(p)]));

  // Snake-draft remaining players into groups
  const groups = snakeDraftGroups(groupPlayers.map(p => p.id), ratingMap, numGroups);

  console.log(`Creating Preliminary + Final RR: "${name}"`);
  console.log(`  Groups: ${numGroups}, Final size: ${finalSize}, Auto-qualified: ${autoCount}`);
  if (autoCount > 0) {
    console.log(`  Auto-qualified: ${autoQualified.map(p => `${playerName(p)} (${playerRating(p)})`).join(', ')}`);
  }
  groups.forEach((g, i) => {
    const names = g.map(id => {
      const p = players.find(pl => pl.id === id)!;
      return `${playerName(p)} (${playerRating(p)})`;
    });
    console.log(`  Group ${i + 1}: ${names.join(', ')}`);
  });
  console.log('');

  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('PRELIMINARY_WITH_FINAL_ROUND_ROBIN');
  const tournament = await plugin.createTournament({
    name,
    participantIds,
    players: sorted,
    prisma,
    additionalData: {
      groups,
      finalRoundRobinSize: finalSize,
      autoQualifiedCount: autoCount,
      autoQualifiedMemberIds,
    },
  });

  console.log(`✓ Parent tournament created (ID: ${tournament.id})\n`);

  // Simulate child group RR matches interleaved across groups
  const childTournaments = await prisma.tournament.findMany({
    where: { parentTournamentId: tournament.id },
    include: { participants: { include: { member: true } }, matches: true },
    orderBy: { groupNumber: 'asc' },
  });

  const playerMap = new Map(players.map(p => [p.id, p]));
  const groupChildren = childTournaments.filter((c: any) => c.groupNumber !== null);

  console.log('Simulating group matches (interleaved):\n');
  await simulateGroupsInterleaved(groupChildren, playerMap, opts.correlation, opts.complete);

  // Check if final was auto-created by the plugin's onChildTournamentCompleted
  const finalChild = await prisma.tournament.findFirst({
    where: { parentTournamentId: tournament.id, groupNumber: null },
    include: { participants: { include: { member: true } }, matches: true },
  });

  if (finalChild) {
    console.log(`\n--- Final Round Robin (ID: ${finalChild.id}) ---`);
    await simulateRoundRobinChild(finalChild, playerMap, opts.correlation, opts.complete);
  }

  if (opts.complete >= 100) {
    await completeTournament(tournament.id, 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN');
  } else {
    console.log(`\n⏸  Tournament left ACTIVE (${opts.complete}% complete)`);
  }
  return tournament.id;
}

// ─── Preliminary + Final Playoff ─────────────────────────────────────────────

async function generatePrelimPlayoff(players: Player[], opts: Opts) {
  const numGroups = opts.groups ?? 5;
  const autoCount = opts.auto ?? 0;
  const finalSize = opts.final ?? closestPowerOf2(2 * numGroups + autoCount);
  const name = opts.name || defaultName('PRELIMINARY_WITH_FINAL_PLAYOFF');

  if (!isPowerOf2(finalSize)) {
    console.error(`❌ --final must be a power of 2 for playoff, got ${finalSize}`);
    process.exit(1);
  }

  if (autoCount >= players.length) {
    console.error('❌ --auto must be less than numPlayers');
    process.exit(1);
  }

  const sorted = [...players].sort((a, b) => playerRating(b) - playerRating(a));
  const autoQualified = sorted.slice(0, autoCount);
  const groupPlayers = sorted.slice(autoCount);

  const autoQualifiedMemberIds = autoQualified.map(p => p.id);
  const participantIds = sorted.map(p => p.id);
  const ratingMap = new Map(sorted.map(p => [p.id, playerRating(p)]));

  const groups = snakeDraftGroups(groupPlayers.map(p => p.id), ratingMap, numGroups);

  console.log(`Creating Preliminary + Final Playoff: "${name}"`);
  console.log(`  Groups: ${numGroups}, Playoff bracket: ${finalSize}, Auto-qualified: ${autoCount}`);
  if (autoCount > 0) {
    console.log(`  Auto-qualified: ${autoQualified.map(p => `${playerName(p)} (${playerRating(p)})`).join(', ')}`);
  }
  groups.forEach((g, i) => {
    const names = g.map(id => {
      const p = players.find(pl => pl.id === id)!;
      return `${playerName(p)} (${playerRating(p)})`;
    });
    console.log(`  Group ${i + 1}: ${names.join(', ')}`);
  });
  console.log('');

  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('PRELIMINARY_WITH_FINAL_PLAYOFF');
  const tournament = await plugin.createTournament({
    name,
    participantIds,
    players: sorted,
    prisma,
    additionalData: {
      groups,
      playoffBracketSize: finalSize,
      autoQualifiedCount: autoCount,
      autoQualifiedMemberIds,
    },
  });

  console.log(`✓ Parent tournament created (ID: ${tournament.id})\n`);

  // Simulate child group RR matches interleaved across groups
  const childTournaments = await prisma.tournament.findMany({
    where: { parentTournamentId: tournament.id, type: 'ROUND_ROBIN' },
    include: { participants: { include: { member: true } }, matches: true },
    orderBy: { groupNumber: 'asc' },
  });

  const playerMap = new Map(players.map(p => [p.id, p]));

  console.log('Simulating group matches (interleaved):\n');
  await simulateGroupsInterleaved(childTournaments, playerMap, opts.correlation, opts.complete);

  // Check if playoff final was auto-created
  const playoffChild = await prisma.tournament.findFirst({
    where: { parentTournamentId: tournament.id, type: 'PLAYOFF' },
    include: { participants: { include: { member: true } }, matches: true, bracketMatches: true },
  });

  if (playoffChild) {
    console.log(`\n--- Final Playoff (ID: ${playoffChild.id}) ---`);
    await simulatePlayoffBracket(playoffChild.id, players, opts.correlation, opts.complete);
  }

  if (opts.complete >= 100) {
    await completeTournament(tournament.id, 'PRELIMINARY_WITH_FINAL_PLAYOFF');
  } else {
    console.log(`\n⏸  Tournament left ACTIVE (${opts.complete}% complete)`);
  }
  return tournament.id;
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Simulate all RR matches for a child tournament, using the generic match endpoint pattern.
 */
async function simulateRoundRobinChild(
  child: any,
  playerMap: Map<number, Player>,
  correlation: number,
  completePct: number = 100,
) {
  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('ROUND_ROBIN');

  const memberIds = child.participants.map((p: any) => p.memberId);

  // Generate all matchups and shuffle so players accumulate matches evenly
  const matchups: Array<[number, number]> = [];
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      matchups.push([memberIds[i], memberIds[j]]);
    }
  }
  shuffle(matchups);

  const matchCount = Math.floor(matchups.length * completePct / 100);
  console.log(`  Simulating ${matchCount}/${matchups.length} matches (${completePct}%)...`);

  for (let idx = 0; idx < matchCount; idx++) {
    const [m1, m2] = matchups[idx];
    const p1 = playerMap.get(m1) || { id: m1, firstName: '?', lastName: '?', rating: 1200 };
    const p2 = playerMap.get(m2) || { id: m2, firstName: '?', lastName: '?', rating: 1200 };
    const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), correlation);

    const result = await plugin.updateMatch({
      matchId: 0,
      tournamentId: child.id,
      member1Id: m1,
      member2Id: m2,
      player1Sets,
      player2Sets,
      player1Forfeit: false,
      player2Forfeit: false,
      prisma,
    });
    await calculateMatchRating(result.match, child.id);

    logMatch(p1 as Player, p2 as Player, player1Sets, player2Sets);

    // If the plugin says the child tournament should be marked complete, do it
    if (result.tournamentStateChange?.shouldMarkComplete) {
      await prisma.tournament.update({
        where: { id: child.id },
        data: { status: 'COMPLETED' },
      });

      // Notify parent plugin
      if (child.parentTournamentId) {
        const parentTournament = await (prisma as any).tournament.findUnique({
          where: { id: child.parentTournamentId },
          include: {
            participants: { include: { member: true } },
            childTournaments: {
              include: {
                participants: { include: { member: true } },
                matches: true,
              },
            },
            preliminaryConfig: true,
          },
        });

        if (parentTournament) {
          const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);
          if (parentPlugin.onChildTournamentCompleted) {
            await parentPlugin.onChildTournamentCompleted({
              parentTournament,
              childTournament: child,
              prisma,
            });
          }
        }
      }

      console.log(`  ✓ Child tournament ${child.id} completed`);
    }
  }
}

/**
 * Simulate RR matches across multiple child groups interleaved:
 * plays one match per group in round-robin order so all groups
 * progress at roughly the same pace.
 */
async function simulateGroupsInterleaved(
  children: any[],
  playerMap: Map<number, Player>,
  correlation: number,
  completePct: number = 100,
) {
  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('ROUND_ROBIN');

  // Build per-group matchup queues (shuffled)
  const groupQueues: Array<{
    child: any;
    matchups: Array<[number, number]>;
    idx: number;
    target: number;
    done: boolean;
  }> = [];

  for (const child of children) {
    const memberIds = child.participants.map((p: any) => p.memberId);
    const matchups: Array<[number, number]> = [];
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        matchups.push([memberIds[i], memberIds[j]]);
      }
    }
    shuffle(matchups);
    const target = Math.floor(matchups.length * completePct / 100);
    console.log(`  Group ${child.groupNumber}: ${target}/${matchups.length} matches to play`);
    groupQueues.push({ child, matchups, idx: 0, target, done: false });
  }

  console.log('');

  // Interleave: round-robin through groups, one match each
  let anyPlayed = true;
  while (anyPlayed) {
    anyPlayed = false;
    for (const gq of groupQueues) {
      if (gq.done || gq.idx >= gq.target) {
        gq.done = true;
        continue;
      }

      const [m1, m2] = gq.matchups[gq.idx];
      const p1 = playerMap.get(m1) || { id: m1, firstName: '?', lastName: '?', rating: 1200 };
      const p2 = playerMap.get(m2) || { id: m2, firstName: '?', lastName: '?', rating: 1200 };
      const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), correlation);

      const result = await plugin.updateMatch({
        matchId: 0,
        tournamentId: gq.child.id,
        member1Id: m1,
        member2Id: m2,
        player1Sets,
        player2Sets,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma,
      });
      await calculateMatchRating(result.match, gq.child.id);

      console.log(`  [G${gq.child.groupNumber}] ${playerName(p1 as Player)} (${playerRating(p1 as Player)}) vs ${playerName(p2 as Player)} (${playerRating(p2 as Player)}) → ${player1Sets}-${player2Sets}`);

      gq.idx++;
      anyPlayed = true;

      // Handle child completion
      if (result.tournamentStateChange?.shouldMarkComplete) {
        await prisma.tournament.update({
          where: { id: gq.child.id },
          data: { status: 'COMPLETED' },
        });

        if (gq.child.parentTournamentId) {
          const parentTournament = await (prisma as any).tournament.findUnique({
            where: { id: gq.child.parentTournamentId },
            include: {
              participants: { include: { member: true } },
              childTournaments: {
                include: {
                  participants: { include: { member: true } },
                  matches: true,
                },
              },
              preliminaryConfig: true,
            },
          });

          if (parentTournament) {
            const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);
            if (parentPlugin.onChildTournamentCompleted) {
              await parentPlugin.onChildTournamentCompleted({
                parentTournament,
                childTournament: gq.child,
                prisma,
              });
            }
          }
        }

        console.log(`  ✓ Group ${gq.child.groupNumber} completed`);
        gq.done = true;
      }
    }
  }
}

/**
 * Complete a tournament: mark as COMPLETED, recalculate rankings.
 */
async function completeTournament(tournamentId: number, type: string) {
  console.log('\nCompleting tournament and recalculating ratings...');

  // Mark completed if not already
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (t && t.status !== 'COMPLETED') {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
    });
  }

  // For compound tournaments, also complete any remaining active children
  const activeChildren = await prisma.tournament.findMany({
    where: { parentTournamentId: tournamentId, status: 'ACTIVE' },
  });
  for (const child of activeChildren) {
    await prisma.tournament.update({
      where: { id: child.id },
      data: { status: 'COMPLETED' },
    });
  }

  // Recalculate rankings
  const { recalculateRankings } = await import('../src/services/rankingService');
  await recalculateRankings(tournamentId);

  console.log('✓ Tournament completed and ratings/rankings recalculated');

  // Show final summary
  const final = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: { include: { member: true } },
      childTournaments: {
        include: { participants: { include: { member: true } } },
      },
    },
  });

  if (final) {
    // Collect all unique member IDs
    const memberIds = new Set<number>();
    final.participants.forEach((p: any) => memberIds.add(p.memberId));
    final.childTournaments?.forEach((c: any) =>
      c.participants.forEach((p: any) => memberIds.add(p.memberId))
    );

    const updatedMembers = await prisma.member.findMany({
      where: { id: { in: Array.from(memberIds) } },
      orderBy: { rating: 'desc' },
    });

    console.log(`\n=== Final Standings (${type}) ===\n`);
    updatedMembers.forEach((m: any, i: number) => {
      console.log(`  ${i + 1}. ${m.firstName} ${m.lastName} — Rating: ${m.rating}`);
    });
  }

  console.log('\n✅ Tournament generation complete!\n');
}

// ─── Continue Mode ───────────────────────────────────────────────────────────

async function continueTournament(opts: ContinueOpts): Promise<number> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: opts.tournamentId },
    include: {
      participants: { include: { member: true } },
      childTournaments: {
        include: {
          participants: { include: { member: true } },
          matches: true,
          bracketMatches: { include: { match: true } },
        },
        orderBy: { groupNumber: 'asc' },
      },
    },
  });

  if (!tournament) {
    console.error(`❌ Tournament ${opts.tournamentId} not found`);
    process.exit(1);
  }

  if (tournament.status === 'COMPLETED') {
    console.error(`❌ Tournament ${opts.tournamentId} is already COMPLETED`);
    process.exit(1);
  }

  const type = tournament.type;
  console.log(`\n=== Continuing ${type} Tournament (ID: ${tournament.id}) ===`);
  console.log(`  Name: ${tournament.name}`);
  console.log(`  Participants: ${tournament.participants.length}`);
  if (opts.correlation !== 0) console.log(`  Correlation: ${opts.correlation}`);
  if (opts.complete < 100) console.log(`  Complete: ${opts.complete}% of remaining`);
  console.log('');

  // Build player map from participants
  const playerMap = new Map<number, Player>();
  for (const p of tournament.participants) {
    const m = (p as any).member;
    if (m) playerMap.set(m.id, m);
  }
  // Also load players from child tournaments
  for (const child of (tournament as any).childTournaments || []) {
    for (const p of child.participants) {
      const m = p.member;
      if (m && !playerMap.has(m.id)) playerMap.set(m.id, m);
    }
  }

  switch (type) {
    case 'ROUND_ROBIN':
      await continueRoundRobin(tournament, playerMap, opts);
      break;
    case 'PLAYOFF':
      await continuePlayoff(tournament, playerMap, opts);
      break;
    case 'SWISS':
      await continueSwiss(tournament, playerMap, opts);
      break;
    case 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN':
      await continuePrelimRR(tournament, playerMap, opts);
      break;
    case 'PRELIMINARY_WITH_FINAL_PLAYOFF':
      await continuePrelimPlayoff(tournament, playerMap, opts);
      break;
    default:
      console.error(`❌ Unsupported tournament type for --continue: ${type}`);
      process.exit(1);
  }

  return tournament.id;
}

async function continueRoundRobin(tournament: any, playerMap: Map<number, Player>, opts: ContinueOpts) {
  const memberIds = tournament.participants.map((p: any) => p.memberId);

  // Generate all possible matchups
  const allMatchups: Array<[number, number]> = [];
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      allMatchups.push([memberIds[i], memberIds[j]]);
    }
  }

  // Find already-played matchups
  const existingMatches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
  });
  const playedSet = new Set(existingMatches.map((m: any) => {
    const ids = [m.member1Id, m.member2Id].sort((a: number, b: number) => a - b);
    return `${ids[0]}-${ids[1]}`;
  }));

  const remaining = allMatchups.filter(([a, b]) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    return !playedSet.has(key);
  });

  if (remaining.length === 0) {
    console.log('All matches already played.');
    if (tournament.status !== 'COMPLETED') {
      await completeTournament(tournament.id, 'ROUND_ROBIN');
    }
    return;
  }

  const matchCount = Math.floor(remaining.length * opts.complete / 100);
  console.log(`Remaining: ${remaining.length} matches, simulating ${matchCount} (${opts.complete}%)...\n`);

  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('ROUND_ROBIN');

  for (let idx = 0; idx < matchCount; idx++) {
    const [m1, m2] = remaining[idx];
    const p1 = playerMap.get(m1) || { id: m1, firstName: '?', lastName: '?', rating: 1200 };
    const p2 = playerMap.get(m2) || { id: m2, firstName: '?', lastName: '?', rating: 1200 };
    const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), opts.correlation);

    const contResult = await plugin.updateMatch({
      matchId: 0,
      tournamentId: tournament.id,
      member1Id: m1,
      member2Id: m2,
      player1Sets,
      player2Sets,
      player1Forfeit: false,
      player2Forfeit: false,
      prisma,
    });
    await calculateMatchRating(contResult.match, tournament.id);

    logMatch(p1 as Player, p2 as Player, player1Sets, player2Sets);
  }

  console.log(`\n✓ ${matchCount} matches simulated`);
  const allDone = matchCount >= remaining.length;
  if (allDone && opts.complete >= 100) {
    await completeTournament(tournament.id, 'ROUND_ROBIN');
  } else {
    console.log(`\n⏸  Tournament still ACTIVE (${remaining.length - matchCount} matches remaining)`);
  }
}

async function continuePlayoff(tournament: any, playerMap: Map<number, Player>, opts: ContinueOpts) {
  console.log('Simulating remaining bracket matches...\n');
  await simulatePlayoffBracket(tournament.id, Array.from(playerMap.values()), opts.correlation, opts.complete);

  // Check if all bracket matches are done
  const unplayed = await prisma.bracketMatch.count({
    where: {
      tournamentId: tournament.id,
      matchId: null,
      member1Id: { not: null },
      member2Id: { not: null },
    },
  });

  if (unplayed === 0 && opts.complete >= 100) {
    await completeTournament(tournament.id, 'PLAYOFF');
  } else {
    console.log(`\n⏸  Tournament still ACTIVE (${unplayed} bracket matches remaining)`);
  }
}

async function continueSwiss(tournament: any, playerMap: Map<number, Player>, opts: ContinueOpts) {
  const { tournamentPluginRegistry } = await import('../src/plugins/TournamentPluginRegistry');
  const plugin = tournamentPluginRegistry.get('SWISS');

  // Get swiss data to know total rounds
  const swissData = await prisma.swissTournamentData.findUnique({
    where: { tournamentId: tournament.id },
  });

  if (!swissData) {
    console.error('❌ Swiss tournament data not found');
    process.exit(1);
  }

  const numberOfRounds = swissData.numberOfRounds;
  const currentRound = swissData.currentRound;

  // Count remaining matches across all rounds
  // For Swiss, only the current round's unplayed matches are available
  // (next round is generated after current round completes)
  const unplayedInCurrentRound = await prisma.match.findMany({
    where: {
      tournamentId: tournament.id,
      round: currentRound,
      player1Sets: 0,
      player2Sets: 0,
    },
    orderBy: { id: 'asc' },
  });

  // Estimate total remaining: unplayed in current round + future rounds
  const matchesPerRound = Math.floor(tournament.participants.length / 2);
  const futureRounds = numberOfRounds - currentRound;
  const totalRemaining = unplayedInCurrentRound.length + futureRounds * matchesPerRound;
  const targetMatches = Math.floor(totalRemaining * opts.complete / 100);

  console.log(`Swiss: round ${currentRound}/${numberOfRounds}, ~${totalRemaining} matches remaining, simulating ${targetMatches}...\n`);

  let matchesPlayed = 0;

  for (let round = currentRound; round <= numberOfRounds; round++) {
    if (matchesPlayed >= targetMatches) {
      console.log(`  (stopping — ${opts.complete}% target reached)`);
      break;
    }

    const matches = await prisma.match.findMany({
      where: {
        tournamentId: tournament.id,
        round,
        player1Sets: 0,
        player2Sets: 0,
      },
      orderBy: { id: 'asc' },
    });

    if (matches.length === 0) {
      // Round might be fully played already, or no matches generated
      continue;
    }

    const budget = targetMatches - matchesPlayed;
    const toPlay = Math.min(matches.length, budget);
    console.log(`Round ${round} (${toPlay}/${matches.length} unplayed matches):`);

    for (let mi = 0; mi < toPlay; mi++) {
      const match = matches[mi];
      const p1 = playerMap.get(match.member1Id) || { id: match.member1Id, firstName: '?', lastName: '?', rating: 1200 };
      const p2 = playerMap.get(match.member2Id!) || { id: match.member2Id!, firstName: '?', lastName: '?', rating: 1200 };
      const { player1Sets, player2Sets } = simulateBestOf5(playerRating(p1 as Player), playerRating(p2 as Player), opts.correlation);

      const contSwissResult = await plugin.updateMatch({
        matchId: match.id,
        tournamentId: tournament.id,
        player1Sets,
        player2Sets,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma,
      });
      await calculateMatchRating(contSwissResult.match, tournament.id);

      logMatch(p1 as Player, p2 as Player, player1Sets, player2Sets);
      matchesPlayed++;
    }

    if (toPlay < matches.length) {
      console.log(`  (stopped mid-round — ${opts.complete}% target reached)`);
      break;
    }

    console.log('');
  }

  console.log(`✓ ${matchesPlayed} matches simulated`);

  // Check if Swiss is now complete
  const updatedSwiss = await prisma.swissTournamentData.findUnique({
    where: { tournamentId: tournament.id },
  });
  if (updatedSwiss?.isCompleted && opts.complete >= 100) {
    await completeTournament(tournament.id, 'SWISS');
  } else {
    const updatedRound = updatedSwiss?.currentRound ?? currentRound;
    console.log(`\n⏸  Tournament still ACTIVE (round ${updatedRound}/${numberOfRounds})`);
  }
}

async function continuePrelimRR(tournament: any, playerMap: Map<number, Player>, opts: ContinueOpts) {
  // Find active child tournaments (preliminary groups)
  const activeChildren = await prisma.tournament.findMany({
    where: { parentTournamentId: tournament.id, status: 'ACTIVE', groupNumber: { not: null } },
    include: { participants: { include: { member: true } }, matches: true },
    orderBy: { groupNumber: 'asc' },
  });

  if (activeChildren.length > 0) {
    console.log('Simulating group matches (interleaved):\n');
    await simulateGroupsInterleaved(activeChildren, playerMap, opts.correlation, opts.complete);
  }

  // Check if final was auto-created
  const finalChild = await prisma.tournament.findFirst({
    where: { parentTournamentId: tournament.id, groupNumber: null, status: 'ACTIVE' },
    include: { participants: { include: { member: true } }, matches: true },
  });

  if (finalChild) {
    console.log(`\n--- Final Round Robin (ID: ${finalChild.id}) ---`);
    await simulateRoundRobinChild(finalChild, playerMap, opts.correlation, opts.complete);
  }

  // Check if everything is done
  const stillActive = await prisma.tournament.count({
    where: { parentTournamentId: tournament.id, status: 'ACTIVE' },
  });

  if (stillActive === 0 && opts.complete >= 100) {
    await completeTournament(tournament.id, 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN');
  } else {
    console.log(`\n⏸  Tournament still ACTIVE (${stillActive} child tournaments active)`);
  }
}

async function continuePrelimPlayoff(tournament: any, playerMap: Map<number, Player>, opts: ContinueOpts) {
  // Find active child RR tournaments (preliminary groups)
  const activeRRChildren = await prisma.tournament.findMany({
    where: { parentTournamentId: tournament.id, status: 'ACTIVE', type: 'ROUND_ROBIN' },
    include: { participants: { include: { member: true } }, matches: true },
    orderBy: { groupNumber: 'asc' },
  });

  if (activeRRChildren.length > 0) {
    console.log('Simulating group matches (interleaved):\n');
    await simulateGroupsInterleaved(activeRRChildren, playerMap, opts.correlation, opts.complete);
  }

  // Check if playoff final exists and is active
  const playoffChild = await prisma.tournament.findFirst({
    where: { parentTournamentId: tournament.id, type: 'PLAYOFF', status: 'ACTIVE' },
    include: { participants: { include: { member: true } }, matches: true, bracketMatches: { include: { match: true } } },
  });

  if (playoffChild) {
    // Load playoff participants into playerMap
    for (const p of playoffChild.participants) {
      const m = (p as any).member;
      if (m && !playerMap.has(m.id)) playerMap.set(m.id, m);
    }
    console.log(`\n--- Final Playoff (ID: ${playoffChild.id}) ---`);
    await simulatePlayoffBracket(playoffChild.id, Array.from(playerMap.values()), opts.correlation, opts.complete);
  }

  // Check if everything is done
  const stillActive = await prisma.tournament.count({
    where: { parentTournamentId: tournament.id, status: 'ACTIVE' },
  });

  if (stillActive === 0 && opts.complete >= 100) {
    await completeTournament(tournament.id, 'PRELIMINARY_WITH_FINAL_PLAYOFF');
  } else {
    console.log(`\n⏸  Tournament still ACTIVE (${stillActive} child tournaments active)`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') printUsageAndExit();

  let tournamentId: number;

  // Detect mode: --continue or create
  if (args[0] === '--continue') {
    const opts = parseContinueArgs(args);
    tournamentId = await continueTournament(opts);
  } else {
    const opts = parseArgs(args);

    console.log(`\n=== Generating ${opts.type} Tournament with ${opts.numPlayers} Players ===`);
    if (opts.correlation !== 0) {
      console.log(`  Correlation: ${opts.correlation}`);
    }
    if (opts.complete < 100) {
      console.log(`  Complete: ${opts.complete}%`);
    }

    const players = await selectPlayers(opts.numPlayers, opts.ratingMin, opts.ratingMax);

    switch (opts.type) {
      case 'ROUND_ROBIN':
        tournamentId = await generateRoundRobin(players, opts);
        break;
      case 'PLAYOFF':
        tournamentId = await generatePlayoff(players, opts);
        break;
      case 'SWISS':
        tournamentId = await generateSwiss(players, opts);
        break;
      case 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN':
        tournamentId = await generatePrelimRR(players, opts);
        break;
      case 'PRELIMINARY_WITH_FINAL_PLAYOFF':
        tournamentId = await generatePrelimPlayoff(players, opts);
        break;
      default:
        console.error(`❌ Unhandled type: ${opts.type}`);
        process.exit(1);
    }
  }

  // Always print the tournament ID for scripting
  console.log(`TOURNAMENT_ID=${tournamentId}`);
}

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
