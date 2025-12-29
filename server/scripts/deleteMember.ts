/**
 * Script to delete a specific member from the database
 * 
 * Usage:
 *   npx tsx scripts/deleteMember.ts "First Name" "Last Name"
 * 
 * This script will:
 * - Find the member by name
 * - Check for related records (tournament participations, matches, rating history)
 * - Delete related records if possible
 * - Delete the member
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
// When running with tsx, process.cwd() should be the server directory
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function deleteMember(firstName: string, lastName: string) {
  try {
    // Find the member
    const member = await prisma.member.findFirst({
      where: {
        firstName: {
          equals: firstName,
          mode: 'insensitive',
        },
        lastName: {
          equals: lastName,
          mode: 'insensitive',
        },
      },
      include: {
        tournamentParticipants: true,
        ratingHistory: true,
      },
    });

    if (!member) {
      console.error(`❌ Member "${firstName} ${lastName}" not found.`);
      return;
    }

    console.log(`\nFound member: ${member.firstName} ${member.lastName} (ID: ${member.id})`);
    console.log(`Email: ${member.email}`);

    // Check for tournament participations
    const tournamentCount = member.tournamentParticipants.length;
    if (tournamentCount > 0) {
      console.log(`\n⚠️  Warning: Member has ${tournamentCount} tournament participation(s).`);
      console.log('   Tournament participations have onDelete: Restrict, so they must be deleted first.');
      
      // Delete tournament participations
      console.log('\nDeleting tournament participations...');
      await prisma.tournamentParticipant.deleteMany({
        where: { memberId: member.id },
      });
      console.log(`   ✓ Deleted ${tournamentCount} tournament participation(s).`);
    }

    // Check for matches where this member is player1 or player2
    const matchesAsPlayer1 = await prisma.match.count({
      where: { member1Id: member.id },
    });
    const matchesAsPlayer2 = await prisma.match.count({
      where: { member2Id: member.id },
    });

    if (matchesAsPlayer1 > 0 || matchesAsPlayer2 > 0) {
      console.log(`\n⚠️  Warning: Member is referenced in ${matchesAsPlayer1 + matchesAsPlayer2} match(es).`);
      console.log('   Matches reference members but don\'t have foreign key constraints.');
      console.log('   These matches will have invalid member references after deletion.');
      console.log('   Consider updating matches to set member IDs to null or another member.');
      
      // Option: Update matches to set member to null (if schema allows) or delete them
      // For now, we'll just warn and proceed
    }

    // Check for rating history
    const ratingHistoryCount = member.ratingHistory.length;
    if (ratingHistoryCount > 0) {
      console.log(`\n   Member has ${ratingHistoryCount} rating history record(s).`);
      console.log('   Rating history will be automatically deleted (onDelete: Cascade).');
    }

    // Delete the member (rating history will cascade)
    console.log('\nDeleting member...');
    await prisma.member.delete({
      where: { id: member.id },
    });

    console.log(`\n✅ Successfully deleted member: ${member.firstName} ${member.lastName} (ID: ${member.id})`);
    
    // Summary
    console.log('\nSummary:');
    console.log(`  - Tournament participations deleted: ${tournamentCount}`);
    console.log(`  - Rating history records deleted: ${ratingHistoryCount}`);
    if (matchesAsPlayer1 > 0 || matchesAsPlayer2 > 0) {
      console.log(`  - ⚠️  Matches with invalid references: ${matchesAsPlayer1 + matchesAsPlayer2}`);
      console.log(`     (Consider updating or deleting these matches manually)`);
    }
  } catch (error) {
    console.error('Error deleting member:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx tsx scripts/deleteMember.ts "First Name" "Last Name"');
  process.exit(1);
}

const [firstName, lastName] = args;
deleteMember(firstName, lastName)
  .catch((error) => {
    console.error('Failed to delete member:', error);
    process.exit(1);
  });

