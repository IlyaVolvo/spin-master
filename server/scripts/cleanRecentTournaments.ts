/**
 * Clean up tournaments by ID list and/or date range.
 *
 * Removes matching ACTIVE and COMPLETED tournaments (and their children),
 * along with associated matches, bracket matches, participants,
 * swiss data, preliminary configs, and rating history entries.
 * Recalculates affected players' ratings from remaining history.
 *
 * Selection modes (can be combined — union of results):
 *   --ids <id1,id2,...>   Delete specific tournaments by ID
 *   --days <n>            Tournaments created in the last N days
 *   --from <date>         Tournaments created on or after this date (ISO or YYYY-MM-DD)
 *   --to <date>           Tournaments created on or before this date (ISO or YYYY-MM-DD)
 *
 * If no selection is given, defaults to --days 3.
 *
 * Usage:
 *   npx tsx scripts/cleanRecentTournaments.ts                          # dry-run, last 3 days
 *   npx tsx scripts/cleanRecentTournaments.ts --execute                # delete last 3 days
 *   npx tsx scripts/cleanRecentTournaments.ts --ids 151,156,163        # dry-run specific IDs
 *   npx tsx scripts/cleanRecentTournaments.ts --from 2026-02-14        # dry-run from date
 *   npx tsx scripts/cleanRecentTournaments.ts --from 2026-02-10 --to 2026-02-14
 *   npx tsx scripts/cleanRecentTournaments.ts --ids 151 --days 1 --execute  # combine modes
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

// ─── Arg parsing ─────────────────────────────────────────────────────────────

interface CleanOpts {
  ids: number[];
  days?: number;
  from?: Date;
  to?: Date;
  execute: boolean;
}

function parseArgs(): CleanOpts {
  const args = process.argv.slice(2);
  const opts: CleanOpts = { ids: [], execute: false };
  let hasSelection = false;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];
    switch (flag) {
      case '--ids':
        if (!next) { console.error('❌ --ids requires a comma-separated list of IDs'); process.exit(1); }
        opts.ids = next.split(',').map(s => {
          const n = parseInt(s.trim());
          if (isNaN(n)) { console.error(`❌ Invalid ID: "${s.trim()}"`); process.exit(1); }
          return n;
        });
        hasSelection = true;
        i++;
        break;
      case '--days':
        if (!next) { console.error('❌ --days requires a number'); process.exit(1); }
        opts.days = parseInt(next);
        if (isNaN(opts.days) || opts.days < 1) { console.error('❌ --days must be a positive integer'); process.exit(1); }
        hasSelection = true;
        i++;
        break;
      case '--from':
        if (!next) { console.error('❌ --from requires a date'); process.exit(1); }
        opts.from = new Date(next);
        if (isNaN(opts.from.getTime())) { console.error(`❌ Invalid date: "${next}"`); process.exit(1); }
        hasSelection = true;
        i++;
        break;
      case '--to':
        if (!next) { console.error('❌ --to requires a date'); process.exit(1); }
        opts.to = new Date(next);
        if (isNaN(opts.to.getTime())) { console.error(`❌ Invalid date: "${next}"`); process.exit(1); }
        // Set to end of day (UTC) if only date provided (no time component)
        if (next.length <= 10) opts.to.setUTCHours(23, 59, 59, 999);
        hasSelection = true;
        i++;
        break;
      case '--execute':
        opts.execute = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        break;
      default:
        console.error(`❌ Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  // Default to --days 3 if no selection given
  if (!hasSelection) {
    opts.days = 3;
  }

  return opts;
}

function printUsage(): never {
  console.log(`
Usage:
  npx tsx scripts/cleanRecentTournaments.ts [selection] [--execute]

Selection (can be combined — union of results):
  --ids <id1,id2,...>   Delete specific tournaments by ID
  --days <n>            Tournaments created in the last N days (default: 3)
  --from <date>         Created on or after date (ISO or YYYY-MM-DD)
  --to <date>           Created on or before date (ISO or YYYY-MM-DD)

Options:
  --execute     Actually perform the deletion (default: dry-run)
  --help        Show this help

Examples:
  npx tsx scripts/cleanRecentTournaments.ts                          # dry-run, last 3 days
  npx tsx scripts/cleanRecentTournaments.ts --ids 151,156 --execute  # delete specific IDs
  npx tsx scripts/cleanRecentTournaments.ts --from 2026-02-10 --to 2026-02-14
  npx tsx scripts/cleanRecentTournaments.ts --days 7 --execute
`);
  process.exit(0);
}

// ─── Collect all tournament IDs recursively ──────────────────────────────────

async function collectAllTournamentIds(rootIds: number[]): Promise<number[]> {
  const allIds = new Set<number>(rootIds);
  const queue = [...rootIds];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = await prisma.tournament.findMany({
      where: { parentTournamentId: parentId },
      select: { id: true },
    });
    for (const child of children) {
      if (!allIds.has(child.id)) {
        allIds.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return Array.from(allIds);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  const mode = opts.execute ? '🔴 EXECUTE' : '🟡 DRY-RUN';

  // Build description of selection criteria
  const criteria: string[] = [];
  if (opts.ids.length > 0) criteria.push(`IDs: ${opts.ids.join(', ')}`);
  if (opts.days) criteria.push(`last ${opts.days} day(s)`);
  if (opts.from) criteria.push(`from: ${opts.from.toISOString()}`);
  if (opts.to) criteria.push(`to: ${opts.to.toISOString()}`);

  console.log(`\n${mode} — Cleaning tournaments matching: ${criteria.join(' | ')}\n`);

  // 1. Build date range filter from --days, --from, --to
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (opts.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - opts.days);
    dateFilter.gte = cutoff;
  }
  if (opts.from) {
    // Use the earlier of --days cutoff and --from (union = wider range)
    if (!dateFilter.gte || opts.from < dateFilter.gte) {
      dateFilter.gte = opts.from;
    }
  }
  if (opts.to) {
    dateFilter.lte = opts.to;
  }

  // 2. Find root tournaments matching criteria (union of ID list + date range)
  const conditions: any[] = [];

  if (opts.ids.length > 0) {
    conditions.push({ id: { in: opts.ids }, parentTournamentId: null });
  }

  if (Object.keys(dateFilter).length > 0) {
    conditions.push({ createdAt: dateFilter, parentTournamentId: null });
  }

  // If --ids includes child tournaments, also find them directly
  // (user might specify a child ID — we should find its root)
  if (opts.ids.length > 0) {
    const specifiedTournaments = await prisma.tournament.findMany({
      where: { id: { in: opts.ids } },
      select: { id: true, parentTournamentId: true },
    });
    const childIds = specifiedTournaments
      .filter(t => t.parentTournamentId !== null)
      .map(t => t.parentTournamentId!);
    if (childIds.length > 0) {
      // Include the root parents of any specified child IDs
      conditions.push({ id: { in: childIds }, parentTournamentId: null });
    }
  }

  if (conditions.length === 0) {
    console.log('No selection criteria. Nothing to do.\n');
    return;
  }

  const rootTournaments = await prisma.tournament.findMany({
    where: { OR: conditions },
    select: { id: true, name: true, type: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Deduplicate (in case a tournament matched both ID and date filters)
  const seen = new Set<number>();
  const uniqueRoots = rootTournaments.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (uniqueRoots.length === 0) {
    console.log('No tournaments found matching criteria. Nothing to do.\n');
    return;
  }

  console.log(`Found ${uniqueRoots.length} root tournament(s):\n`);
  for (const t of uniqueRoots) {
    console.log(`  ID ${String(t.id).padStart(4)}  ${t.status.padEnd(9)}  ${t.type.padEnd(38)}  ${t.name ?? '(unnamed)'}  ${t.createdAt.toISOString()}`);
  }

  // 3. Collect all IDs (roots + children recursively)
  const rootIds = uniqueRoots.map(t => t.id);
  const allTournamentIds = await collectAllTournamentIds(rootIds);

  const childCount = allTournamentIds.length - rootIds.length;
  if (childCount > 0) {
    console.log(`\n  + ${childCount} child tournament(s)`);
  }
  console.log(`\n  Total tournaments to remove: ${allTournamentIds.length}`);

  // 3. Count related records
  const matchCount = await prisma.match.count({
    where: { tournamentId: { in: allTournamentIds } },
  });
  const bracketMatchCount = await prisma.bracketMatch.count({
    where: { tournamentId: { in: allTournamentIds } },
  });
  const participantCount = await prisma.tournamentParticipant.count({
    where: { tournamentId: { in: allTournamentIds } },
  });

  // Collect match IDs for rating history cleanup
  const matchIds = (await prisma.match.findMany({
    where: { tournamentId: { in: allTournamentIds } },
    select: { id: true },
  })).map(m => m.id);

  // Count rating history entries to delete
  const ratingHistoryByTournament = await (prisma as any).ratingHistory.count({
    where: { tournamentId: { in: allTournamentIds } },
  });
  const ratingHistoryByMatch = matchIds.length > 0
    ? await (prisma as any).ratingHistory.count({
        where: {
          matchId: { in: matchIds },
          tournamentId: { notIn: allTournamentIds }, // avoid double-counting
        },
      })
    : 0;
  const totalRatingHistory = ratingHistoryByTournament + ratingHistoryByMatch;

  // Collect affected member IDs (for rating recalculation)
  const affectedMemberIds = new Set<number>();
  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId: { in: allTournamentIds } },
    select: { memberId: true },
  });
  for (const p of participants) affectedMemberIds.add(p.memberId);

  // Also get members from matches (in case they aren't participants, e.g. standalone)
  const matches = await prisma.match.findMany({
    where: { tournamentId: { in: allTournamentIds } },
    select: { member1Id: true, member2Id: true },
  });
  for (const m of matches) {
    affectedMemberIds.add(m.member1Id);
    if (m.member2Id) affectedMemberIds.add(m.member2Id);
  }

  console.log(`\n  Related records:`);
  console.log(`    Matches:              ${matchCount}`);
  console.log(`    Bracket matches:      ${bracketMatchCount}`);
  console.log(`    Participants:         ${participantCount}`);
  console.log(`    Rating history:       ${totalRatingHistory}`);
  console.log(`    Affected players:     ${affectedMemberIds.size}`);

  if (!opts.execute) {
    console.log(`\n🟡 DRY-RUN complete. Re-run with --execute to perform the deletion.\n`);
    return;
  }

  // ─── Execute deletion ────────────────────────────────────────────────────

  console.log(`\n🔴 Executing deletion...\n`);

  // Step 1: Delete rating history (no FK, must be explicit)
  console.log('  Deleting rating history entries...');
  const deletedByTournament = await (prisma as any).ratingHistory.deleteMany({
    where: { tournamentId: { in: allTournamentIds } },
  });
  let deletedByMatch = { count: 0 };
  if (matchIds.length > 0) {
    deletedByMatch = await (prisma as any).ratingHistory.deleteMany({
      where: {
        matchId: { in: matchIds },
      },
    });
  }
  console.log(`    ✓ Deleted ${deletedByTournament.count + deletedByMatch.count} rating history entries`);

  // Step 2: Delete root tournaments (cascade handles children, matches, bracket matches, participants, swiss data, prelim config)
  console.log('  Deleting tournaments (cascade)...');
  const deleted = await prisma.tournament.deleteMany({
    where: { id: { in: rootIds } },
  });
  console.log(`    ✓ Deleted ${deleted.count} root tournament(s) (+ ${childCount} children via cascade)`);

  // Step 3: Recalculate affected players' ratings from remaining history
  console.log(`\n  Recalculating ratings for ${affectedMemberIds.size} affected player(s)...`);

  let recalculated = 0;
  for (const memberId of affectedMemberIds) {
    // Find the most recent rating history entry for this member
    const latestHistory = await (prisma as any).ratingHistory.findFirst({
      where: { memberId },
      orderBy: { timestamp: 'desc' },
    });

    if (latestHistory && latestHistory.rating !== null) {
      // Set member rating to the latest remaining history entry
      await prisma.member.update({
        where: { id: memberId },
        data: { rating: latestHistory.rating },
      });
    } else {
      // No remaining history — check if there's a base rating we should preserve
      // If no history at all, leave rating as-is (it was set at member creation)
      // This is safe because the original rating from populateDatabase is not in rating_history
    }

    recalculated++;
    if (recalculated % 20 === 0) {
      console.log(`    ${recalculated} / ${affectedMemberIds.size}...`);
    }
  }

  console.log(`    ✓ Recalculated ${recalculated} player ratings`);

  console.log(`\n✅ Cleanup complete!\n`);
}

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
