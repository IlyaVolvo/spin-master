/**
 * Script to populate database with 130 players, 150 matches, and tournaments
 * 
 * Features:
 * - Clears all DB
 * - Creates 130 players with multi-language names
 * - Nationality distribution: 55% English, 30% Chinese, 10% Russian, 5% Swedish
 * - Age: 10-80, normal distribution (peak at 45)
 * - Rating: 800-2200, normal distribution (peak at 1400), correlated with age (peak at 35)
 * - Generates 150 matches ensuring at least 5 players have 5+ matches
 * - Creates round-robin and playoff tournaments
 * 
 * Usage:
 *   npx tsx scripts/populateDatabase.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

// MemberRole enum values (matching Prisma schema)
const MemberRole = {
  PLAYER: 'PLAYER' as const,
  COACH: 'COACH' as const,
  ADMIN: 'ADMIN' as const,
  ORGANIZER: 'ORGANIZER' as const,
} as const;

type MemberRoleType = typeof MemberRole[keyof typeof MemberRole];

// Timestamp tracker to ensure all timestamps increase chronologically
class TimestampTracker {
  private currentTime: Date;
  private minIncrement: number = 1000; // Minimum 1 second between timestamps

  constructor(startDate: Date) {
    this.currentTime = new Date(startDate);
  }

  /**
   * Get the next timestamp, ensuring it's always increasing
   */
  next(): Date {
    const timestamp = new Date(this.currentTime);
    this.currentTime = new Date(this.currentTime.getTime() + this.minIncrement);
    return timestamp;
  }

  /**
   * Get the current timestamp without advancing
   */
  current(): Date {
    return new Date(this.currentTime);
  }

  /**
   * Advance time by a specific amount (in milliseconds)
   */
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  /**
   * Set time to a specific date (only if it's in the future)
   */
  setTime(date: Date): void {
    if (date.getTime() > this.currentTime.getTime()) {
      this.currentTime = new Date(date);
    }
  }
}

// Name pools for different languages (all in Roman alphabet)
const englishFirstNames = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle'
];

const englishLastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Robinson', 'Lewis', 'Walker', 'Hall', 'Allen',
  'Young', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams',
  'Nelson', 'Baker', 'Gonzalez', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell',
  'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook',
  'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward',
  'Torres', 'Peterson', 'Gray', 'Ramirez', 'James', 'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price',
  'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long',
  'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster', 'Gonzales', 'Bryant', 'Alexander'
];

const swedishFirstNames = [
  'Erik', 'Lars', 'Anders', 'Johan', 'Per', 'Mikael', 'Jan', 'Stefan', 'Magnus', 'Peter',
  'Anna', 'Maria', 'Karin', 'Eva', 'Kristina', 'Lena', 'Sara', 'Ingrid', 'Helena', 'Birgitta'
];

const swedishLastNames = [
  'Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson',
  'Pettersson', 'Jonsson', 'Jansson', 'Hansson', 'Bengtsson', 'Berg', 'Lindberg', 'Lindstrom', 'Lindqvist', 'Axelsson'
];

// Russian names transliterated to Roman alphabet
const russianFirstNames = [
  'Aleksandr', 'Dmitri', 'Maksim', 'Sergei', 'Andrei', 'Aleksei', 'Artem', 'Ilya', 'Kirill', 'Mikhail',
  'Anna', 'Maria', 'Elena', 'Natalia', 'Olga', 'Tatiana', 'Irina', 'Ekaterina', 'Svetlana', 'Yulia'
];

const russianLastNames = [
  'Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Lebedev', 'Kozlov', 'Novikov', 'Morozov', 'Petrov',
  'Volkov', 'Solovyov', 'Vasiliev', 'Zaitsev', 'Pavlov', 'Semyonov', 'Golubev', 'Vinogradov', 'Bogdanov', 'Vorobev'
];

// Chinese names in Roman alphabet (Pinyin)
const chineseFirstNames = [
  'Wei', 'Ming', 'Li', 'Jun', 'Hua', 'Yong', 'Feng', 'Jian', 'Qiang', 'Lei',
  'Mei', 'Ling', 'Hui', 'Yan', 'Fang', 'Xia', 'Ying', 'Qing', 'Xin', 'Yue'
];

const chineseLastNames = [
  'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou',
  'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Gao', 'Lin', 'Luo'
];

/**
 * Determine gender from first name
 */
function determineGender(firstName: string): 'MALE' | 'FEMALE' | 'OTHER' {
  const name = firstName.toLowerCase();
  
  // Build exact male names from the name pools
  const exactMaleNames = [
    // English male names (lines 68-69)
    ...englishFirstNames.slice(0, 20).map(n => n.toLowerCase()),
    // Swedish male names (line 88)
    ...swedishFirstNames.slice(0, 10).map(n => n.toLowerCase()),
    // Russian male names (lines 99)
    ...russianFirstNames.slice(0, 10).map(n => n.toLowerCase()),
    // Chinese male names (line 110)
    ...chineseFirstNames.slice(0, 10).map(n => n.toLowerCase())
  ];
  
  // Build exact female names from the name pools
  const exactFemaleNames = [
    // English female names (lines 70-71)
    ...englishFirstNames.slice(20).map(n => n.toLowerCase()),
    // Swedish female names (line 89)
    ...swedishFirstNames.slice(10).map(n => n.toLowerCase()),
    // Russian female names (line 100)
    ...russianFirstNames.slice(10).map(n => n.toLowerCase()),
    // Chinese female names (line 111)
    ...chineseFirstNames.slice(10).map(n => n.toLowerCase())
  ];
  
  // Check exact matches first (most reliable)
  if (exactMaleNames.includes(name)) {
    return 'MALE';
  }
  
  if (exactFemaleNames.includes(name)) {
    return 'FEMALE';
  }
  
  // Fallback to pattern matching for names not in our lists
  // Female name patterns (common endings)
  const femalePatterns = ['a', 'ia', 'ella', 'ette', 'ine', 'ina', 'elle'];
  
  // Check if it matches female patterns
  if (femalePatterns.some(pattern => name.endsWith(pattern) && name.length > 3)) {
    return 'FEMALE';
  }
  
  // Default to OTHER if uncertain
  return 'OTHER';
}

/**
 * Generate email from first name and last name
 */
function generateEmail(firstName: string, lastName: string): string {
  const firstLetter = firstName.charAt(0).toLowerCase();
  const lastNameLower = lastName.toLowerCase().replace(/\s+/g, '');
  return `${firstLetter}${lastNameLower}@example.com`;
}

/**
 * Generate a random number from a normal distribution using Box-Muller transform
 */
function normalRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate age with normal distribution (peak at 45, range 10-80)
 */
function generateAge(): number {
  const mean = 45;
  const stdDev = 15; // Standard deviation
  let age = normalRandom(mean, stdDev);
  age = clamp(age, 10, 80);
  return Math.round(age);
}

/**
 * Generate rating correlated with age
 * Peak rating at age 35, normal distribution around 1400
 */
function generateRating(age: number): number {
  // Base rating from normal distribution (peak at 1400)
  const baseMean = 1400;
  const baseStdDev = 300;
  let baseRating = normalRandom(baseMean, baseStdDev);
  
  // Age correlation: peak performance around age 35
  // Use a bell curve centered at 35
  const peakAge = 35;
  const ageDiff = Math.abs(age - peakAge);
  const maxAgePenalty = 20; // Maximum years from peak
  const ageFactor = Math.max(0, 1 - (ageDiff / maxAgePenalty));
  
  // Adjust rating based on age (younger and older players have lower ratings)
  const ageAdjustment = (ageFactor - 0.5) * 200; // ±200 rating adjustment
  baseRating += ageAdjustment;
  
  // Clamp to 800-2200 range
  baseRating = clamp(baseRating, 800, 2200);
  return Math.round(baseRating);
}

/**
 * Generate a random name based on nationality distribution:
 * 55% English, 30% Chinese, 10% Russian, 5% Swedish
 */
function generateName(): { firstName: string; lastName: string } {
  const rand = Math.random();
  let lang: { first: string[]; last: string[] };
  
  if (rand < 0.55) {
    // 55% English
    lang = { first: englishFirstNames, last: englishLastNames };
  } else if (rand < 0.85) {
    // 30% Chinese (0.55 to 0.85)
    lang = { first: chineseFirstNames, last: chineseLastNames };
  } else if (rand < 0.95) {
    // 10% Russian (0.85 to 0.95)
    lang = { first: russianFirstNames, last: russianLastNames };
  } else {
    // 5% Swedish (0.95 to 1.0)
    lang = { first: swedishFirstNames, last: swedishLastNames };
  }
  
  const firstName = lang.first[Math.floor(Math.random() * lang.first.length)];
  const lastName = lang.last[Math.floor(Math.random() * lang.last.length)];
  
  return { firstName, lastName };
}

/**
 * Calculate probability of player 1 winning based on rating difference
 */
function calculateWinProbability(rating1: number, rating2: number): number {
  const ratingDiff = rating2 - rating1;
  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

/**
 * Simulate a best-of-5 match
 * 90% chance to win according to rating, 10% completely random
 */
function simulateMatch(rating1: number, rating2: number, completelyRandom: boolean = false): { player1Sets: number; player2Sets: number } {
  let player1WinProb: number;
  
  if (completelyRandom) {
    // Completely random (50/50)
    player1WinProb = 0.5;
  } else {
    // 90% chance: use rating-based probability
    // 10% chance: completely random (50/50)
    if (Math.random() < 0.9) {
      player1WinProb = calculateWinProbability(rating1, rating2);
    } else {
      player1WinProb = 0.5; // Completely random
    }
  }
  
  let player1Sets = 0;
  let player2Sets = 0;
  
  // Play until someone wins 3 sets
  while (player1Sets < 3 && player2Sets < 3) {
    if (Math.random() < player1WinProb) {
      player1Sets++;
    } else {
      player2Sets++;
    }
  }
  
  return { player1Sets, player2Sets };
}

async function clearDatabase() {
  console.log('\n=== Clearing Database ===\n');
  
  // Try to delete ratingHistory if it exists (may not exist if migration hasn't run yet)
  try {
    await (prisma as any).ratingHistory.deleteMany({});
  } catch (error) {
    // Table doesn't exist yet, that's okay
    console.log('  Note: rating_history table does not exist yet (will be created by migration)');
  }
  
  await prisma.bracketMatch.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.tournamentParticipant.deleteMany({});
  await prisma.tournament.deleteMany({});
  await prisma.member.deleteMany({});
  
  // Reset all auto-increment sequences to start from 1 (make it like a brand new DB)
  console.log('  Resetting all sequence counters...');
  const sequences = [
    'members_id_seq',
    'rating_history_id_seq',
    'tournaments_id_seq',
    'tournament_participants_id_seq',
    'bracket_matches_id_seq',
    'matches_id_seq',
    'point_exchange_rules_id_seq'
  ];
  
  for (const seq of sequences) {
    try {
      // Use ALTER SEQUENCE RESTART to reset the sequence to 1
      await prisma.$executeRawUnsafe(`ALTER SEQUENCE IF EXISTS "${seq}" RESTART WITH 1;`);
      // After RESTART, use setval with is_called=false to ensure next nextval() returns 1 (not 2)
      // setval(seq_name, 1, false) means: set value to 1, and mark as not called
      // This ensures the next nextval() will return 1
      await prisma.$executeRawUnsafe(`SELECT setval('${seq}', 1, false);`);
    } catch (error) {
      // If ALTER doesn't work, try setval directly
      try {
        await prisma.$executeRawUnsafe(`SELECT setval('${seq}', 1, false);`);
      } catch (setvalError) {
        // Sequence might not exist yet, that's okay - it will be created on first insert
        console.log(`    Note: Sequence ${seq} will be created on first insert`);
      }
    }
  }
  console.log('  ✓ All sequence counters reset to 1\n');
  
  // CRITICAL: After deleting all members, we MUST ensure the sequence is truly at 1
  // PostgreSQL might cache the max ID, so we need to explicitly reset it
  // Verify the reset worked for members_id_seq
  try {
    const verifySeq: any = await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM members_id_seq;`);
    if (verifySeq && verifySeq.length > 0) {
      const { last_value, is_called } = verifySeq[0];
      if (last_value !== 1n || is_called !== false) {
        // Force reset again
        await prisma.$executeRawUnsafe(`ALTER SEQUENCE "members_id_seq" RESTART WITH 1;`);
        await prisma.$executeRawUnsafe(`SELECT setval('members_id_seq', 1, false);`);
        console.log('  ✓ Verified and re-reset members_id_seq to ensure it starts at 1\n');
      }
    }
  } catch (error) {
    // Verification failed, but that's okay
  }
  
  console.log('✓ Database cleared and reset to brand new state\n');
}

async function createPlayers() {
  console.log('=== Creating 130 Members ===\n');
  
  const members: Array<{
    firstName: string;
    lastName: string;
    email: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    password: string;
    roles: MemberRoleType[];
    birthDate: Date;
    rating: number;
    isActive: boolean;
    mustResetPassword: boolean;
  }> = [];
  const usedNames = new Set<string>();
  const usedEmails = new Set<string>();
  const bcrypt = await import('bcryptjs');
  const defaultPassword = await bcrypt.default.hash('changeme', 10);
  
  for (let i = 0; i < 130; i++) {
    let name;
    let fullName;
    let email;
    
    // Ensure unique names and emails
    do {
      name = generateName();
      fullName = `${name.firstName} ${name.lastName}`;
      email = generateEmail(name.firstName, name.lastName);
      
      // If email exists, add a number
      let counter = 1;
      while (usedEmails.has(email)) {
        email = `${name.firstName.charAt(0).toLowerCase()}${name.lastName.toLowerCase()}${counter}@example.com`;
        counter++;
      }
    } while (usedNames.has(fullName));
    
    usedNames.add(fullName);
    usedEmails.add(email);
    
    const age = generateAge();
    const birthYear = new Date().getFullYear() - age;
    const birthDate = new Date(birthYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    const rating = generateRating(age);
    const gender = determineGender(name.firstName);
    
    members.push({
      firstName: name.firstName,
      lastName: name.lastName,
      email,
      gender,
      password: defaultPassword,
      roles: [MemberRole.PLAYER],
      birthDate,
      rating,
      isActive: true,
      mustResetPassword: false, // Set to false for all users in generation script
    });
  }
  
  // Create in batches
  const batchSize = 50;
  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);
    await prisma.member.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`  Created ${Math.min(i + batchSize, members.length)} / ${members.length} members...`);
  }
  
  console.log(`\n✓ Created ${members.length} members\n`);
  
  // Fetch created members to return with IDs
  const createdMembers = await prisma.member.findMany({
    where: { email: { in: members.map(m => m.email) } },
    select: { id: true, firstName: true, lastName: true, birthDate: true, rating: true, isActive: true },
  });
  
  return createdMembers;
}

/**
 * Generate a date between startDate and endDate using timestamp tracker
 * This ensures chronological ordering and distributes evenly across the period
 * For tournaments, distributes across different days to avoid clustering
 */
function generateDateBetween(startDate: Date, endDate: Date, timestampTracker: TimestampTracker, totalItems: number, currentIndex: number, preferDifferentDays: boolean = false): Date {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const totalRange = endTime - startTime;
  
  // Calculate target time for this item (distribute evenly)
  const progress = totalItems > 1 ? currentIndex / (totalItems - 1) : 0;
  let targetTime = startTime + (totalRange * progress);
  
  // If preferDifferentDays, try to distribute across different days
  if (preferDifferentDays && totalItems > 1) {
    // Calculate which day this match should be on (distribute evenly across available days)
    const daysRange = Math.max(1, Math.ceil(totalRange / (24 * 60 * 60 * 1000)));
    // Use modulo to cycle through days, ensuring better distribution
    const targetDayIndex = Math.min(Math.floor((currentIndex * daysRange) / totalItems), daysRange - 1);
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + targetDayIndex);
    // Spread matches across the day (9 AM to 5 PM, with some variation)
    const hourOffset = Math.floor((currentIndex % 8)); // 0-7 hours
    const minuteOffset = (currentIndex * 11) % 60; // Vary minutes
    dayStart.setHours(9 + hourOffset, minuteOffset, 0, 0);
    targetTime = dayStart.getTime();
    
    // Ensure we don't exceed endDate
    if (targetTime > endTime) {
      targetTime = endTime - (24 * 60 * 60 * 1000); // Use day before end
    }
  }
  
  // Ensure we're at least at the target time
  timestampTracker.setTime(new Date(targetTime));
  
  // Advance by a small amount to ensure uniqueness (at least 1 minute between matches)
  timestampTracker.advance(60000); // 1 minute
  return timestampTracker.next();
}

async function generateMatches(players: any[], targetMatches: number = 150, timestampTracker: TimestampTracker) {
  console.log('=== Generating 150 Individual Matches ===\n');
  
  // Get all active players, excluding Admin (members with ADMIN role)
  const allMembers = await prisma.member.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });
  
  // Filter out Admin members (those with ADMIN role)
  const allPlayers = allMembers.filter(m => !m.roles.includes(MemberRole.ADMIN));
  
  // Date range: 1 month ago to today
  const endDate = new Date(); // Today
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1); // 1 month ago
  
  // Initialize timestamp tracker to start date
  timestampTracker.setTime(startDate);
  
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`  Dating matches from ${startDate.toLocaleDateString()} to today (${daysDiff} days)\n`);
  
  // Ensure at least 5 players have 5+ matches
  const priorityPlayers = allPlayers.slice(0, 5);
  
  const matches: Array<{ 
    member1Id: number; 
    member2Id: number; 
    player1Sets: number; 
    player2Sets: number;
    matchDate: Date;
  }> = [];
  const playerMatchCounts = new Map<number, number>();
  
  // Initialize match counts
  allPlayers.forEach(p => playerMatchCounts.set(p.id, 0));
  
  // First, ensure priority players have at least 5 matches each
  console.log('  Ensuring priority players have 5+ matches...');
  for (const priorityPlayer of priorityPlayers) {
    while (playerMatchCounts.get(priorityPlayer.id)! < 5) {
      // Find a random opponent
      const opponents = allPlayers.filter(p => p.id !== priorityPlayer.id);
      const opponent = opponents[Math.floor(Math.random() * opponents.length)];
      
      // Check if this match already exists
      const matchExists = matches.some(
        m => (m.member1Id === priorityPlayer.id && m.member2Id === opponent.id) ||
             (m.member1Id === opponent.id && m.member2Id === priorityPlayer.id)
      );
      
      if (!matchExists) {
        const rating1 = priorityPlayer.rating ?? 1400;
        const rating2 = opponent.rating ?? 1400;
        const result = simulateMatch(rating1, rating2);
        // Use current match count as index for even distribution
        const matchDate = generateDateBetween(startDate, endDate, timestampTracker, targetMatches, matches.length);
        
        matches.push({
          member1Id: priorityPlayer.id,
          member2Id: opponent.id,
          ...result,
          matchDate
        });
        
        playerMatchCounts.set(priorityPlayer.id, playerMatchCounts.get(priorityPlayer.id)! + 1);
        playerMatchCounts.set(opponent.id, playerMatchCounts.get(opponent.id)! + 1);
      }
    }
  }
  
  // Fill remaining matches randomly
  console.log(`  Generating remaining matches (${matches.length} / ${targetMatches})...`);
  while (matches.length < targetMatches) {
    const player1 = allPlayers[Math.floor(Math.random() * allPlayers.length)];
    const player2 = allPlayers[Math.floor(Math.random() * allPlayers.length)];
    
    if (player1.id === player2.id) continue;
    
    // Check if match already exists
    const matchExists = matches.some(
      m => (m.member1Id === player1.id && m.member2Id === player2.id) ||
           (m.member1Id === player2.id && m.member2Id === player1.id)
    );
    
    if (!matchExists) {
      const rating1 = player1.rating ?? 1400;
      const rating2 = player2.rating ?? 1400;
      const result = simulateMatch(rating1, rating2);
      // Use current match count as index for even distribution
      const matchDate = generateDateBetween(startDate, endDate, timestampTracker, targetMatches, matches.length);
      
      matches.push({
        member1Id: player1.id,
        member2Id: player2.id,
        ...result,
        matchDate
      });
      
      playerMatchCounts.set(player1.id, playerMatchCounts.get(player1.id)! + 1);
      playerMatchCounts.set(player2.id, playerMatchCounts.get(player2.id)! + 1);
    }
  }
  
  // Sort matches by date
  matches.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  
  // Create individual single-match tournaments for each match
  console.log('  Creating individual matches (as single-match tournaments)...');
  let created = 0;
  
  for (const match of matches) {
    const player1 = allPlayers.find(p => p.id === match.member1Id)!;
    const player2 = allPlayers.find(p => p.id === match.member2Id)!;
    
    // Use the generated match date, ensuring tournament is created before match
    // Tournament should be created slightly before the match
    timestampTracker.setTime(match.matchDate);
    timestampTracker.advance(-60000); // Tournament created 1 minute before match
    const tournamentCreatedAt = timestampTracker.next();
    const matchCreatedAt = match.matchDate; // Use the exact generated match date
    timestampTracker.setTime(matchCreatedAt);
    timestampTracker.advance(60000); // recordedAt 1 minute after match
    const tournamentRecordedAt = timestampTracker.next();
    
    // Create a single-match tournament (COMPLETED with completed match)
    const tournament = await prisma.tournament.create({
      data: {
        name: `${player1.firstName} ${player1.lastName} vs ${player2.firstName} ${player2.lastName}`,
        type: 'ROUND_ROBIN',
        status: 'COMPLETED', // Tournament is COMPLETED
        createdAt: tournamentCreatedAt,
        recordedAt: tournamentRecordedAt,
        participants: {
          create: [
            {
              memberId: match.member1Id,
              playerRatingAtTime: player1.rating,
            },
            {
              memberId: match.member2Id,
              playerRatingAtTime: player2.rating,
            },
          ],
        },
        matches: {
          create: {
            member1Id: match.member1Id,
            member2Id: match.member2Id,
            player1Sets: match.player1Sets,
            player2Sets: match.player2Sets,
            createdAt: matchCreatedAt,
            updatedAt: matchCreatedAt,
          },
        },
      },
      include: {
        matches: true,
      },
    });
    
    // Process rating changes for individual match tournament
    const matchRecord = tournament.matches[0];
    if (matchRecord) {
      const player1Won = match.player1Sets > match.player2Sets;
      const { processMatchRating } = await import('../src/services/matchRatingService');
      await processMatchRating(
        match.member1Id,
        match.member2Id,
        player1Won,
        tournament.id,
        matchRecord.id,
        false, // isForfeit
        true   // useIncrementalRating (individual matches should use incremental ratings to build on previous matches)
      );
    }
    
    created++;
    if (created % 25 === 0) {
      console.log(`    Created ${created} / ${matches.length} individual matches...`);
    }
  }
  
  console.log(`\n✓ Created ${matches.length} individual matches (each as a completed single-match tournament)\n`);
  console.log('  Match distribution (top 10):');
  const sortedCounts = Array.from(playerMatchCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  sortedCounts.forEach(([playerId, count]) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player) {
      console.log(`    ${player.firstName} ${player.lastName}: ${count} matches`);
    }
  });
  console.log('');
}

/**
 * Generate all round-robin matchups for n players
 */
function generateRoundRobinMatchups(numPlayers: number): Array<[number, number]> {
  const matchups: Array<[number, number]> = [];
  for (let i = 0; i < numPlayers; i++) {
    for (let j = i + 1; j < numPlayers; j++) {
      matchups.push([i, j]);
    }
  }
  return matchups;
}

async function createTournaments(timestampTracker: TimestampTracker) {
  console.log('=== Creating Tournaments ===\n');
  
  // Get all active players, excluding Admin (members with ADMIN role)
  const allMembers = await prisma.member.findMany({
    where: { isActive: true },
    orderBy: { rating: 'desc' },
  });
  
  // Filter out Admin members (those with ADMIN role)
  const allPlayers = allMembers.filter(m => !m.roles.includes(MemberRole.ADMIN));
  
  // Tournament 1: Championship - 6 highest ranking players
  console.log('Creating "Championship" tournament (6 highest ranking players)...');
  const top6Players = allPlayers.slice(0, 6);
  
  const championshipCreatedAt = timestampTracker.next();
  const championship = await prisma.tournament.create({
    data: {
      name: 'Championship',
      type: 'ROUND_ROBIN',
      status: 'ACTIVE',
      createdAt: championshipCreatedAt,
      participants: {
        create: top6Players.map(player => ({
          memberId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          member: true,
        },
      },
    },
  });
  
  console.log(`  ✓ Created tournament "Championship" (ID: ${championship.id})`);
  console.log(`  Participants: ${top6Players.map(p => `${p.firstName} ${p.lastName} (${p.rating})`).join(', ')}`);
  
  // Generate and create all round-robin matches for Championship
  console.log('  Generating matches for Championship...');
  const championshipMatchups = generateRoundRobinMatchups(top6Players.length);
  const championshipMatches: Array<{
    tournamentId: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    matchDate: Date;
  }> = [];
  
  // Date range: tournament creation to today
  const champEndDate = new Date(); // Today
  const champStartDate = championshipCreatedAt;
  
  // Set timestamp tracker to tournament creation time
  timestampTracker.setTime(champStartDate);
  
  // Track matches per player per day to ensure max 5 per day
  const playerMatchesPerDay = new Map<number, Map<string, number>>(); // playerId -> dateString -> count
  
  // Tournament duration: spread matches over a reasonable period (e.g., 1-2 weeks)
  const tournamentDurationDays = 10; // 10 days for tournament
  const tournamentEndDate = new Date(champStartDate);
  tournamentEndDate.setDate(tournamentEndDate.getDate() + tournamentDurationDays);
  
  let matchIndex = 0;
  for (const [idx1, idx2] of championshipMatchups) {
    const player1 = top6Players[idx1];
    const player2 = top6Players[idx2];
    const rating1 = player1.rating ?? 1400;
    const rating2 = player2.rating ?? 1400;
    const result = simulateMatch(rating1, rating2);
    
    // Find a date where both players have less than 5 matches
    let matchDate: Date;
    let attempts = 0;
    do {
      matchDate = generateDateBetween(champStartDate, tournamentEndDate, timestampTracker, championshipMatchups.length, matchIndex, true);
      const dateKey = matchDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Get current match counts for this day
      const player1Count = playerMatchesPerDay.get(player1.id)?.get(dateKey) || 0;
      const player2Count = playerMatchesPerDay.get(player2.id)?.get(dateKey) || 0;
      
      if (player1Count < 5 && player2Count < 5) {
        // Update counts
        if (!playerMatchesPerDay.has(player1.id)) {
          playerMatchesPerDay.set(player1.id, new Map());
        }
        if (!playerMatchesPerDay.has(player2.id)) {
          playerMatchesPerDay.set(player2.id, new Map());
        }
        playerMatchesPerDay.get(player1.id)!.set(dateKey, player1Count + 1);
        playerMatchesPerDay.get(player2.id)!.set(dateKey, player2Count + 1);
        break;
      }
      
      // If both players already have 5 matches on this day, advance to next day
      timestampTracker.advance(24 * 60 * 60 * 1000); // Advance 1 day
      attempts++;
    } while (attempts < 100); // Safety limit
    
    championshipMatches.push({
      tournamentId: championship.id,
      member1Id: player1.id,
      member2Id: player2.id,
      player1Sets: result.player1Sets,
      player2Sets: result.player2Sets,
      matchDate,
    });
    
    matchIndex++;
  }
  
  // Sort matches by date
  championshipMatches.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  
  // Create matches one by one using the generated match dates
  console.log('  Creating matches and processing ratings...');
  for (const matchData of championshipMatches) {
    // Use the exact generated match date
    const matchCreatedAt = matchData.matchDate;
    
    // Ensure timestamp tracker is at least at this point for next operations
    timestampTracker.setTime(matchCreatedAt);
    timestampTracker.advance(60000); // Advance 1 minute for next match
    
    const match = await prisma.match.create({
      data: {
        tournamentId: matchData.tournamentId,
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id,
        player1Sets: matchData.player1Sets,
        player2Sets: matchData.player2Sets,
        createdAt: matchCreatedAt,
        updatedAt: matchCreatedAt,
      },
    });
    
    // Process rating changes for this match
    // For RoundRobin, we don't process individual match ratings (ratings calculated at tournament end)
    // But we still need to ensure timestamps advance
  }
  
  // Get the latest match date for tournament completion date
  const champLatestMatchDate = championshipMatches[championshipMatches.length - 1].matchDate;
  const champRecordedAt = timestampTracker.next(); // Ensure recordedAt is after last match
  
  // Complete the tournament with increasing timestamp
  await prisma.tournament.update({
    where: { id: championship.id },
    data: { 
      status: 'COMPLETED',
      recordedAt: champRecordedAt,
    },
  });
  
  // Recalculate ratings after tournament completion
  const { recalculateRankings } = await import('../src/services/rankingService');
  await recalculateRankings(championship.id);
  
  console.log(`  ✓ Created ${championshipMatches.length} matches and completed tournament (ratings recalculated)\n`);
  
  // Tournament 2: Players with rating 1200-1400
  console.log('Creating tournament for players with rating 1200-1400...');
  const midRangePlayers = allPlayers.filter(
    p => p.rating !== null && p.rating >= 1200 && p.rating <= 1400
  );
  
  if (midRangePlayers.length < 5) {
    console.log(`  ⚠️  Warning: Only found ${midRangePlayers.length} players in range 1200-1400`);
    console.log(`  Using closest 5 players to this range...`);
    // Find closest to 1300
    const sortedByProximity = allPlayers
      .map(p => ({ member: p, distance: Math.abs((p.rating ?? 1300) - 1300) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(item => item.member);
    midRangePlayers.length = 0;
    midRangePlayers.push(...sortedByProximity);
  }
  
  const selectedMidRange = midRangePlayers.slice(0, 5);
  
  const midTournamentCreatedAt = timestampTracker.next();
  const midTournament = await prisma.tournament.create({
    data: {
      name: 'Mid-Level Tournament',
      type: 'ROUND_ROBIN',
      status: 'ACTIVE',
      createdAt: midTournamentCreatedAt,
      participants: {
        create: selectedMidRange.map(player => ({
          memberId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          member: true,
        },
      },
    },
  });
  
  console.log(`  ✓ Created tournament "Mid-Level Tournament" (ID: ${midTournament.id})`);
  console.log(`  Participants: ${selectedMidRange.map(p => `${p.firstName} ${p.lastName} (${p.rating})`).join(', ')}`);
  
  // Generate and create all round-robin matches for Mid-Level Tournament
  console.log('  Generating matches for Mid-Level Tournament...');
  const midMatchups = generateRoundRobinMatchups(selectedMidRange.length);
  const midMatches: Array<{
    tournamentId: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    matchDate: Date;
  }> = [];
  
  // Date range: tournament creation to today
  const midEndDate = new Date(); // Today
  const midStartDate = midTournamentCreatedAt;
  
  // Set timestamp tracker to tournament creation time
  timestampTracker.setTime(midStartDate);
  
  // Track matches per player per day to ensure max 5 per day
  const midPlayerMatchesPerDay = new Map<number, Map<string, number>>();
  
  // Tournament duration: spread matches over a reasonable period
  const midTournamentDurationDays = 7; // 7 days for tournament
  const midTournamentEndDate = new Date(midStartDate);
  midTournamentEndDate.setDate(midTournamentEndDate.getDate() + midTournamentDurationDays);
  
  let midMatchIndex = 0;
  for (const [idx1, idx2] of midMatchups) {
    const player1 = selectedMidRange[idx1];
    const player2 = selectedMidRange[idx2];
    const rating1 = player1.rating ?? 1400;
    const rating2 = player2.rating ?? 1400;
    const result = simulateMatch(rating1, rating2);
    
    // Find a date where both players have less than 5 matches
    let matchDate: Date;
    let attempts = 0;
      do {
        matchDate = generateDateBetween(midStartDate, midTournamentEndDate, timestampTracker, midMatchups.length, midMatchIndex, true);
        const dateKey = matchDate.toISOString().split('T')[0];
      
      const player1Count = midPlayerMatchesPerDay.get(player1.id)?.get(dateKey) || 0;
      const player2Count = midPlayerMatchesPerDay.get(player2.id)?.get(dateKey) || 0;
      
      if (player1Count < 5 && player2Count < 5) {
        if (!midPlayerMatchesPerDay.has(player1.id)) {
          midPlayerMatchesPerDay.set(player1.id, new Map());
        }
        if (!midPlayerMatchesPerDay.has(player2.id)) {
          midPlayerMatchesPerDay.set(player2.id, new Map());
        }
        midPlayerMatchesPerDay.get(player1.id)!.set(dateKey, player1Count + 1);
        midPlayerMatchesPerDay.get(player2.id)!.set(dateKey, player2Count + 1);
        break;
      }
      
      timestampTracker.advance(24 * 60 * 60 * 1000); // Advance 1 day
      attempts++;
    } while (attempts < 100);
    
    midMatches.push({
      tournamentId: midTournament.id,
      member1Id: player1.id,
      member2Id: player2.id,
      player1Sets: result.player1Sets,
      player2Sets: result.player2Sets,
      matchDate,
    });
    
    midMatchIndex++;
  }
  
  // Sort matches by date
  midMatches.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  
  // Create matches one by one using the generated match dates
  console.log('  Creating matches...');
  for (const matchData of midMatches) {
    // Use the exact generated match date
    const matchCreatedAt = matchData.matchDate;
    
    // Ensure timestamp tracker is at least at this point for next operations
    timestampTracker.setTime(matchCreatedAt);
    timestampTracker.advance(60000); // Advance 1 minute for next match
    
    await prisma.match.create({
      data: {
        tournamentId: matchData.tournamentId,
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id,
        player1Sets: matchData.player1Sets,
        player2Sets: matchData.player2Sets,
        createdAt: matchCreatedAt,
        updatedAt: matchCreatedAt,
      },
    });
  }
  
  // Get the latest match date for tournament completion date
  const midLatestMatchDate = midMatches[midMatches.length - 1].matchDate;
  const midRecordedAt = timestampTracker.next(); // Ensure recordedAt is after last match
  
  // Complete the tournament with increasing timestamp
  await prisma.tournament.update({
    where: { id: midTournament.id },
    data: { 
      status: 'COMPLETED',
      recordedAt: midRecordedAt,
    },
  });
  
  // Recalculate ratings after tournament completion
  const { recalculateRankings: recalculateMidRankings } = await import('../src/services/rankingService');
  await recalculateMidRankings(midTournament.id);
  
  console.log(`  ✓ Created ${midMatches.length} matches and completed tournament (ratings recalculated)\n`);
  
  // Tournament 3: Playoff tournament with 12 highest ranked players
  console.log('Creating playoff tournament with 12 highest ranked players...');
  const top12Players = allPlayers.slice(0, 12);
  
  const playoffTournamentCreatedAt = timestampTracker.next();
  const playoffTournament = await prisma.tournament.create({
    data: {
      name: 'Playoff Championship',
      type: 'PLAYOFF',
      status: 'ACTIVE',
      createdAt: playoffTournamentCreatedAt,
      participants: {
        create: top12Players.map(player => ({
          memberId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          member: true,
        },
      },
    },
  });
  
  console.log(`  ✓ Created tournament "Playoff Championship" (ID: ${playoffTournament.id})`);
  console.log(`  Participants: ${top12Players.map(p => `${p.firstName} ${p.lastName} (${p.rating})`).join(', ')}`);
  
  // Create bracket structure
  console.log('  Creating bracket structure...');
  const { createPlayoffBracketWithPositions: createPlayoffBracket } = await import('../src/services/playoffBracketService');
  const participantIds = top12Players.map(p => p.id);
  await createPlayoffBracket(playoffTournament.id, participantIds);
  
  // Get all bracket matches
  const allBracketMatches = await prisma.bracketMatch.findMany({
    where: { tournamentId: playoffTournament.id },
    orderBy: [
      { round: 'asc' },
      { position: 'asc' },
    ],
  });
  
  // Tournament duration: spread matches over a reasonable period
  const playoffTournamentDurationDays = 14; // 14 days for playoff tournament
  const playoffStartDate = playoffTournamentCreatedAt;
  const playoffEndDate = new Date(playoffStartDate);
  playoffEndDate.setDate(playoffEndDate.getDate() + playoffTournamentDurationDays);
  
  // Set timestamp tracker to tournament creation time
  timestampTracker.setTime(playoffStartDate);
  
  // Track matches per player per day to ensure max 5 per day
  const playoffPlayerMatchesPerDay = new Map<number, Map<string, number>>();
  
  // Simulate matches round by round
  console.log('  Simulating matches round by round...');
  const rounds = Math.max(...allBracketMatches.map(bm => bm.round));
  
  // Track winners for each bracket match
  const bracketWinners = new Map<number, number>(); // bracketMatchId -> winnerId
  
  // Helper function to get current ratings from database
  async function getCurrentRatings(memberIds: number[]): Promise<Map<number, number>> {
    const players = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, rating: true },
    });
    const ratings = new Map<number, number>();
    players.forEach(p => ratings.set(p.id, p.rating ?? 1400));
    return ratings;
  }
  
  // Process rounds from 1 to final
  for (let round = 1; round <= rounds; round++) {
    // Reload bracket matches for current round to get updated player IDs
    const currentRoundMatches = await prisma.bracketMatch.findMany({
      where: { 
        tournamentId: playoffTournament.id,
        round: round,
      },
      orderBy: { position: 'asc' },
    });
    
    console.log(`    Round ${round}: ${currentRoundMatches.length} matches`);
    
    for (const bracketMatch of currentRoundMatches) {
      let member1Id = bracketMatch.member1Id;
      let member2Id = bracketMatch.member2Id;
      
      // Handle BYEs (member2Id === 0 or null)
      if (member2Id === 0 || member2Id === null) {
        // BYE - player1 advances automatically
        bracketWinners.set(bracketMatch.id, member1Id!);
        
        // Advance BYE winner to next round
        if (bracketMatch.nextMatchId) {
          const nextMatch = await prisma.bracketMatch.findUnique({
            where: { id: bracketMatch.nextMatchId },
          });
          if (nextMatch) {
            const isOddPosition = bracketMatch.position % 2 === 1;
            if (isOddPosition) {
              await prisma.bracketMatch.update({
                where: { id: nextMatch.id },
                data: { member1Id: member1Id! },
              });
            } else {
              await prisma.bracketMatch.update({
                where: { id: nextMatch.id },
                data: { member2Id: member1Id! },
              });
            }
          }
        }
        continue;
      }
      
      // Skip if players are not yet determined (shouldn't happen if we process in order)
      if (member1Id === null || member2Id === null) {
        console.log(`      Warning: Match ${bracketMatch.id} has null players, skipping`);
        continue;
      }
      
      // Get current ratings from database (may have changed from previous matches)
      const currentRatings = await getCurrentRatings([member1Id, member2Id]);
      const rating1 = currentRatings.get(member1Id) ?? 1400;
      const rating2 = currentRatings.get(member2Id) ?? 1400;
      
      // Simulate match probabilistically based on ratings
      const result = simulateMatch(rating1, rating2, false);
      
      // Find a date where both players have less than 5 matches
      let matchDate: Date;
      let attempts = 0;
      // Use round and position to calculate a global index for even distribution
      const globalMatchIndex = (round - 1) * 10 + bracketMatch.position; // Rough estimate for distribution
      const totalMatchesEstimate = rounds * 10; // Estimate total matches
      
      do {
        // Distribute matches evenly across tournament duration, preferring different days
        matchDate = generateDateBetween(playoffStartDate, playoffEndDate, timestampTracker, totalMatchesEstimate, globalMatchIndex, true);
        
        const dateKey = matchDate.toISOString().split('T')[0];
        const player1Count = playoffPlayerMatchesPerDay.get(member1Id)?.get(dateKey) || 0;
        const player2Count = playoffPlayerMatchesPerDay.get(member2Id)?.get(dateKey) || 0;
        
        if (player1Count < 5 && player2Count < 5) {
          if (!playoffPlayerMatchesPerDay.has(member1Id)) {
            playoffPlayerMatchesPerDay.set(member1Id, new Map());
          }
          if (!playoffPlayerMatchesPerDay.has(member2Id)) {
            playoffPlayerMatchesPerDay.set(member2Id, new Map());
          }
          playoffPlayerMatchesPerDay.get(member1Id)!.set(dateKey, player1Count + 1);
          playoffPlayerMatchesPerDay.get(member2Id)!.set(dateKey, player2Count + 1);
          break;
        }
        
        // If both players already have 5 matches on this day, advance to next day
        timestampTracker.advance(24 * 60 * 60 * 1000);
        attempts++;
      } while (attempts < 100);
      
      // Use the exact generated match date
      const matchCreatedAt = matchDate;
      
      // Ensure timestamp tracker is at least at this point for next operations
      timestampTracker.setTime(matchCreatedAt);
      timestampTracker.advance(60000); // Advance 1 minute for next match
      
      // Determine winner
      const player1Won = result.player1Sets > result.player2Sets;
      const winnerId = player1Won ? member1Id : member2Id;
      
      // Create match result
      const match = await prisma.match.create({
        data: {
          tournament: { connect: { id: playoffTournament.id } },
          member1Id: member1Id,
          member2Id: member2Id,
          player1Sets: result.player1Sets,
          player2Sets: result.player2Sets,
          createdAt: matchCreatedAt,
          updatedAt: matchCreatedAt,
        },
      });
      
      // Update bracket match to link to the created match
      await prisma.bracketMatch.update({
        where: { id: bracketMatch.id },
        data: { matchId: match.id },
      });
      
      // Track winner for next round
      bracketWinners.set(bracketMatch.id, winnerId);
      
      // Update participant ratings to current ratings before calling rating service
      // This ensures the rating service uses the most up-to-date ratings
      const participant1 = await prisma.tournamentParticipant.findFirst({
        where: {
          tournamentId: playoffTournament.id,
          memberId: member1Id,
        },
      });
      const participant2 = await prisma.tournamentParticipant.findFirst({
        where: {
          tournamentId: playoffTournament.id,
          memberId: member2Id,
        },
      });
      
      if (participant1) {
        await prisma.tournamentParticipant.update({
          where: { id: participant1.id },
          data: { playerRatingAtTime: rating1 },
        });
      }
      if (participant2) {
        await prisma.tournamentParticipant.update({
          where: { id: participant2.id },
          data: { playerRatingAtTime: rating2 },
        });
      }
      
      // Call rating service for this match (PLAYOFF uses incremental ratings)
      // This will update player ratings and create RatingHistory entries
      const { processMatchRating } = await import('../src/services/matchRatingService');
      await processMatchRating(
        member1Id,
        member2Id,
        player1Won,
        playoffTournament.id,
        match.id,
        false, // isForfeit
        true   // useIncrementalRating (for PLAYOFF tournaments)
      );
      
      // Advance winner to next round if there is one
      if (bracketMatch.nextMatchId) {
        const nextMatch = await prisma.bracketMatch.findUnique({
          where: { id: bracketMatch.nextMatchId },
        });
        if (nextMatch) {
          // Determine which position in next match (player1 or player2)
          // In standard brackets: odd positions (1,3,5...) go to player1, even (2,4,6...) go to player2
          const isOddPosition = bracketMatch.position % 2 === 1;
          
          if (isOddPosition) {
            // Winner from odd position goes to player1 of next match
            await prisma.bracketMatch.update({
              where: { id: nextMatch.id },
              data: { member1Id: winnerId },
            });
          } else {
            // Winner from even position goes to player2 of next match
            await prisma.bracketMatch.update({
              where: { id: nextMatch.id },
              data: { member2Id: winnerId },
            });
          }
        }
      }
    }
  }
  
  // Get the latest match date for tournament completion
  const playoffMatches = await prisma.match.findMany({
    where: { tournamentId: playoffTournament.id },
    orderBy: { createdAt: 'desc' },
  });
  const playoffLatestMatchDate = playoffMatches[0]?.createdAt || new Date();
  const playoffRecordedAt = timestampTracker.next(); // Ensure recordedAt is after last match
  
  // Complete the tournament
  await prisma.tournament.update({
    where: { id: playoffTournament.id },
    data: { 
      status: 'COMPLETED',
      recordedAt: playoffRecordedAt,
    },
  });
  
  // Note: Ratings are already updated after each match using USATT point exchange system
  // Final recalculation at the end of the script will ensure everything is consistent
  
  // Get the winner (final match winner)
  const finalMatch = allBracketMatches.find(bm => bm.round === rounds);
  const winnerId = finalMatch ? bracketWinners.get(finalMatch.id) : null;
  let winnerName = '';
  let winnerRating = 0;
  
  if (winnerId) {
    const winnerPlayer = await prisma.member.findUnique({
      where: { id: winnerId },
      select: { firstName: true, lastName: true, rating: true },
    });
    if (winnerPlayer) {
      winnerName = `${winnerPlayer.firstName} ${winnerPlayer.lastName}`;
      winnerRating = winnerPlayer.rating ?? 0;
    }
  }
  
  console.log(`  ✓ Created playoff bracket with ${allBracketMatches.length} bracket matches`);
  console.log(`  ✓ Simulated all matches and completed tournament`);
  if (winnerName) {
    console.log(`  ✓ Winner: ${winnerName} (${winnerRating})\n`);
  } else {
    console.log(`  ✓ Tournament completed\n`);
  }
  
  // Tournament 4: Active playoff tournament for lowest ranked 50 players with 8 seeding
  console.log('Creating active playoff tournament for lowest ranked 50 players (8 seeding)...');
  // Get lowest ranked 50 players (last 50 in sorted list)
  const bottom50Players = allPlayers.slice(-50);
  
  const activePlayoffTournamentCreatedAt = timestampTracker.next();
  const activePlayoffTournament = await prisma.tournament.create({
    data: {
      name: 'Lower Division Playoff',
      type: 'PLAYOFF',
      status: 'ACTIVE', // Not completed
      createdAt: activePlayoffTournamentCreatedAt,
      participants: {
        create: bottom50Players.map(player => ({
          memberId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          member: true,
        },
      },
    },
  });
  
  console.log(`  ✓ Created tournament "Lower Division Playoff" (ID: ${activePlayoffTournament.id})`);
  console.log(`  Participants: ${bottom50Players.length} players (lowest ranked)`);
  
  // Create bracket structure with 8 seeding
  console.log('  Creating bracket structure with 8 seeding...');
  const { generateSeeding, generateBracketPositions } = await import('../src/services/playoffBracketService');
  
  const activeParticipantIds = bottom50Players.map(p => p.id);
  const activeParticipants = activePlayoffTournament.participants;
  const seededPlayers = generateSeeding(activeParticipants);
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(activeParticipantIds.length)));
  const bracketPositions = generateBracketPositions(seededPlayers, bracketSize, 8); // 8 seeding
  
  await createPlayoffBracket(activePlayoffTournament.id, activeParticipantIds, bracketPositions);
  
  // Get all bracket matches
  const activeAllBracketMatches = await prisma.bracketMatch.findMany({
    where: { tournamentId: activePlayoffTournament.id },
    orderBy: [
      { round: 'asc' },
      { position: 'asc' },
    ],
  });
  
  // Tournament duration: spread matches over a reasonable period
  const activePlayoffTournamentDurationDays = 10; // 10 days for active playoff tournament
  const activePlayoffStartDate = activePlayoffTournamentCreatedAt;
  const activePlayoffEndDate = new Date(activePlayoffStartDate);
  activePlayoffEndDate.setDate(activePlayoffEndDate.getDate() + activePlayoffTournamentDurationDays);
  
  // Set timestamp tracker to tournament creation time
  timestampTracker.setTime(activePlayoffStartDate);
  
  // Track matches per player per day to ensure max 5 per day
  const activePlayoffPlayerMatchesPerDay = new Map<number, Map<string, number>>();
  
  // Simulate matches: complete rounds 1 and 2, and 50% of round 3
  console.log('  Simulating matches (rounds 1-2 complete, 50% of round 3)...');
  const activeRounds = Math.max(...activeAllBracketMatches.map(bm => bm.round));
  
  // Track winners for each bracket match
  const activeBracketWinners = new Map<number, number>(); // bracketMatchId -> winnerId
  
  // Helper function to get current ratings from database
  async function getCurrentRatingsActive(memberIds: number[]): Promise<Map<number, number>> {
    const players = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, rating: true },
    });
    const ratings = new Map<number, number>();
    players.forEach(p => ratings.set(p.id, p.rating ?? 1400));
    return ratings;
  }
  
  // Process rounds 1 and 2 completely, then 50% of round 3
  for (let round = 1; round <= activeRounds; round++) {
    // Reload bracket matches for current round to get updated player IDs
    const currentRoundMatches = await prisma.bracketMatch.findMany({
      where: { 
        tournamentId: activePlayoffTournament.id,
        round: round,
      },
      orderBy: { position: 'asc' },
    });
    
    // For round 3, only process 50% of matches
    let matchesToProcess = currentRoundMatches;
    if (round === 3) {
      const halfCount = Math.floor(currentRoundMatches.length / 2);
      matchesToProcess = currentRoundMatches.slice(0, halfCount);
      console.log(`    Round ${round}: ${currentRoundMatches.length} matches total, processing ${matchesToProcess.length} (50%)`);
    } else {
      console.log(`    Round ${round}: ${matchesToProcess.length} matches`);
    }
    
    for (const bracketMatch of matchesToProcess) {
      let member1Id = bracketMatch.member1Id;
      let member2Id = bracketMatch.member2Id;
      
      // Handle BYEs (member2Id === 0 or null)
      if (member2Id === 0 || member2Id === null) {
        // BYE - player1 advances automatically
        activeBracketWinners.set(bracketMatch.id, member1Id!);
        
        // Advance BYE winner to next round
        if (bracketMatch.nextMatchId) {
          const nextMatch = await prisma.bracketMatch.findUnique({
            where: { id: bracketMatch.nextMatchId },
          });
          if (nextMatch) {
            const isOddPosition = bracketMatch.position % 2 === 1;
            if (isOddPosition) {
              await prisma.bracketMatch.update({
                where: { id: nextMatch.id },
                data: { member1Id: member1Id! },
              });
            } else {
              await prisma.bracketMatch.update({
                where: { id: nextMatch.id },
                data: { member2Id: member1Id! },
              });
            }
          }
        }
        continue;
      }
      
      // Skip if players are not yet determined (shouldn't happen if we process in order)
      if (member1Id === null || member2Id === null) {
        console.log(`      Warning: Match ${bracketMatch.id} has null players, skipping`);
        continue;
      }
      
      // Get current ratings from database (may have changed from previous matches)
      const currentRatings = await getCurrentRatingsActive([member1Id, member2Id]);
      const rating1 = currentRatings.get(member1Id) ?? 1400;
      const rating2 = currentRatings.get(member2Id) ?? 1400;
      
      // Simulate match probabilistically based on ratings
      const result = simulateMatch(rating1, rating2, false);
      
      // Find a date where both players have less than 5 matches
      let matchDate: Date;
      let attempts = 0;
      // Use round and position to calculate a global index for even distribution
      const globalMatchIndex = (round - 1) * 10 + bracketMatch.position; // Rough estimate for distribution
      const totalMatchesEstimate = activeRounds * 10; // Estimate total matches
      
      do {
        // Distribute matches evenly across tournament duration, preferring different days
        matchDate = generateDateBetween(activePlayoffStartDate, activePlayoffEndDate, timestampTracker, totalMatchesEstimate, globalMatchIndex, true);
        
        const dateKey = matchDate.toISOString().split('T')[0];
        const player1Count = activePlayoffPlayerMatchesPerDay.get(member1Id)?.get(dateKey) || 0;
        const player2Count = activePlayoffPlayerMatchesPerDay.get(member2Id)?.get(dateKey) || 0;
        
        if (player1Count < 5 && player2Count < 5) {
          if (!activePlayoffPlayerMatchesPerDay.has(member1Id)) {
            activePlayoffPlayerMatchesPerDay.set(member1Id, new Map());
          }
          if (!activePlayoffPlayerMatchesPerDay.has(member2Id)) {
            activePlayoffPlayerMatchesPerDay.set(member2Id, new Map());
          }
          activePlayoffPlayerMatchesPerDay.get(member1Id)!.set(dateKey, player1Count + 1);
          activePlayoffPlayerMatchesPerDay.get(member2Id)!.set(dateKey, player2Count + 1);
          break;
        }
        
        // If both players already have 5 matches on this day, advance to next day
        timestampTracker.advance(24 * 60 * 60 * 1000);
        attempts++;
      } while (attempts < 100);
      
      // Use the exact generated match date
      const matchCreatedAt = matchDate;
      
      // Ensure timestamp tracker is at least at this point for next operations
      timestampTracker.setTime(matchCreatedAt);
      timestampTracker.advance(60000); // Advance 1 minute for next match
      
      // Determine winner
      const player1Won = result.player1Sets > result.player2Sets;
      const winnerId = player1Won ? member1Id : member2Id;
      
      // Create match result
      const match = await prisma.match.create({
        data: {
          tournament: { connect: { id: activePlayoffTournament.id } },
          member1Id: member1Id,
          member2Id: member2Id,
          player1Sets: result.player1Sets,
          player2Sets: result.player2Sets,
          createdAt: matchCreatedAt,
          updatedAt: matchCreatedAt,
        },
      });
      
      // Update bracket match to link to the created match
      await prisma.bracketMatch.update({
        where: { id: bracketMatch.id },
        data: { matchId: match.id },
      });
      
      // Track winner for next round
      activeBracketWinners.set(bracketMatch.id, winnerId);
      
      // Update participant ratings to current ratings before calling rating service
      const participant1 = await prisma.tournamentParticipant.findFirst({
        where: {
          tournamentId: activePlayoffTournament.id,
          memberId: member1Id,
        },
      });
      const participant2 = await prisma.tournamentParticipant.findFirst({
        where: {
          tournamentId: activePlayoffTournament.id,
          memberId: member2Id,
        },
      });
      
      if (participant1) {
        await prisma.tournamentParticipant.update({
          where: { id: participant1.id },
          data: { playerRatingAtTime: rating1 },
        });
      }
      if (participant2) {
        await prisma.tournamentParticipant.update({
          where: { id: participant2.id },
          data: { playerRatingAtTime: rating2 },
        });
      }
      
      // Call rating service for this match (PLAYOFF uses incremental ratings)
      // This will update player ratings and create RatingHistory entries
      const { processMatchRating: processMatchRatingActive } = await import('../src/services/matchRatingService');
      await processMatchRatingActive(
        member1Id,
        member2Id,
        player1Won,
        activePlayoffTournament.id,
        match.id,
        false, // isForfeit
        true   // useIncrementalRating (for PLAYOFF tournaments)
      );
      
      // Advance winner to next round if there is one
      if (bracketMatch.nextMatchId) {
        const nextMatch = await prisma.bracketMatch.findUnique({
          where: { id: bracketMatch.nextMatchId },
        });
        if (nextMatch) {
          const isOddPosition = bracketMatch.position % 2 === 1;
          
          if (isOddPosition) {
            await prisma.bracketMatch.update({
              where: { id: nextMatch.id },
              data: { member1Id: winnerId },
            });
          } else {
            await prisma.bracketMatch.update({
              where: { id: nextMatch.id },
              data: { member2Id: winnerId },
            });
          }
        }
      }
    }
    
    // Stop after processing round 3 (50% of it)
    if (round === 3) {
      break;
    }
  }
  
  // Tournament remains ACTIVE (not completed)
  console.log(`  ✓ Created playoff bracket with ${activeAllBracketMatches.length} bracket matches`);
  console.log(`  ✓ Simulated matches for rounds 1-2 and 50% of round 3`);
  console.log(`  ✓ Tournament remains ACTIVE (not completed)\n`);
  
  // Tournament 5: Active RoundRobin tournament with 5 players (ratings 1700-1900), 50% matches completed
  console.log('Creating active RoundRobin tournament with 5 players (ratings 1700-1900), 50% matches completed...');
  const highRatedPlayers = allPlayers.filter(
    p => p.rating !== null && p.rating >= 1700 && p.rating <= 1900
  );
  
  if (highRatedPlayers.length < 5) {
    console.log(`  ⚠️  Warning: Only found ${highRatedPlayers.length} players in range 1700-1900`);
    console.log(`  Using closest 5 players to this range...`);
    // Find closest to 1800
    const sortedByProximity = allPlayers
      .map(p => ({ member: p, distance: Math.abs((p.rating ?? 1800) - 1800) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(item => item.member);
    highRatedPlayers.length = 0;
    highRatedPlayers.push(...sortedByProximity);
  }
  
  const selectedHighRated = highRatedPlayers.slice(0, 5);
  
  const highRatedTournamentCreatedAt = timestampTracker.next();
  const highRatedTournament = await prisma.tournament.create({
    data: {
      name: 'High-Level RoundRobin',
      type: 'ROUND_ROBIN',
      status: 'ACTIVE', // Not completed
      createdAt: highRatedTournamentCreatedAt,
      participants: {
        create: selectedHighRated.map(player => ({
          memberId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          member: true,
        },
      },
    },
  });
  
  console.log(`  ✓ Created tournament "High-Level RoundRobin" (ID: ${highRatedTournament.id})`);
  console.log(`  Participants: ${selectedHighRated.map(p => `${p.firstName} ${p.lastName} (${p.rating})`).join(', ')}`);
  
  // Generate all round-robin matchups
  console.log('  Generating round-robin matchups...');
  const highRatedMatchups = generateRoundRobinMatchups(selectedHighRated.length);
  const totalMatches = highRatedMatchups.length; // 5 players = 10 matches
  const matchesToComplete = Math.floor(totalMatches * 0.5); // 50% = 5 matches
  
  const highRatedMatches: Array<{
    tournamentId: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    matchDate: Date;
  }> = [];
  
  // Tournament duration: spread matches over a reasonable period
  const highRatedTournamentDurationDays = 7; // 7 days for tournament
  const highRatedStartDate = highRatedTournamentCreatedAt;
  const highRatedEndDate = new Date(highRatedStartDate);
  highRatedEndDate.setDate(highRatedEndDate.getDate() + highRatedTournamentDurationDays);
  
  // Set timestamp tracker to tournament creation time
  timestampTracker.setTime(highRatedStartDate);
  
  // Track matches per player per day to ensure max 5 per day
  const highRatedPlayerMatchesPerDay = new Map<number, Map<string, number>>();
  
  // Generate all matchups but only complete 50%
  for (let i = 0; i < highRatedMatchups.length; i++) {
    const [idx1, idx2] = highRatedMatchups[i];
    const player1 = selectedHighRated[idx1];
    const player2 = selectedHighRated[idx2];
    const rating1 = player1.rating ?? 1800;
    const rating2 = player2.rating ?? 1800;
    const result = simulateMatch(rating1, rating2);
    
    // Only add matches that should be completed (first 50%)
    if (i < matchesToComplete) {
      // Find a date where both players have less than 5 matches
      let matchDate: Date;
      let attempts = 0;
      
      do {
        matchDate = generateDateBetween(highRatedStartDate, highRatedEndDate, timestampTracker, matchesToComplete, i, true);
        const dateKey = matchDate.toISOString().split('T')[0];
        
        const player1Count = highRatedPlayerMatchesPerDay.get(player1.id)?.get(dateKey) || 0;
        const player2Count = highRatedPlayerMatchesPerDay.get(player2.id)?.get(dateKey) || 0;
        
        if (player1Count < 5 && player2Count < 5) {
          if (!highRatedPlayerMatchesPerDay.has(player1.id)) {
            highRatedPlayerMatchesPerDay.set(player1.id, new Map());
          }
          if (!highRatedPlayerMatchesPerDay.has(player2.id)) {
            highRatedPlayerMatchesPerDay.set(player2.id, new Map());
          }
          highRatedPlayerMatchesPerDay.get(player1.id)!.set(dateKey, player1Count + 1);
          highRatedPlayerMatchesPerDay.get(player2.id)!.set(dateKey, player2Count + 1);
          break;
        }
        
        // If both players already have 5 matches on this day, advance to next day
        timestampTracker.advance(24 * 60 * 60 * 1000);
        attempts++;
      } while (attempts < 100);
      
      highRatedMatches.push({
        tournamentId: highRatedTournament.id,
        member1Id: player1.id,
        member2Id: player2.id,
        player1Sets: result.player1Sets,
        player2Sets: result.player2Sets,
        matchDate,
      });
    }
  }
  
  // Sort matches by date
  highRatedMatches.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  
  // Create only the completed matches one by one using the generated match dates
  console.log('  Creating matches...');
  for (const matchData of highRatedMatches) {
    // Use the exact generated match date
    const matchCreatedAt = matchData.matchDate;
    
    // Ensure timestamp tracker is at least at this point for next operations
    timestampTracker.setTime(matchCreatedAt);
    timestampTracker.advance(60000); // Advance 1 minute for next match
    
    await prisma.match.create({
      data: {
        tournamentId: matchData.tournamentId,
        member1Id: matchData.member1Id,
        member2Id: matchData.member2Id,
        player1Sets: matchData.player1Sets,
        player2Sets: matchData.player2Sets,
        createdAt: matchCreatedAt,
        updatedAt: matchCreatedAt,
      },
    });
  }
  
  console.log(`  ✓ Created ${highRatedMatches.length} / ${totalMatches} matches (50% completed)`);
  console.log(`  ✓ Tournament remains ACTIVE (not completed)\n`);
  
  console.log('✓ Tournaments created\n');
}

async function main() {
  try {
    // Initialize timestamp tracker - start from 1 month ago
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const timestampTracker = new TimestampTracker(startDate);
    
    // Step 1: Clear database
    await clearDatabase();
    
    // Step 2: Create System Admin member (first entry)
    console.log('=== Creating Sys Admin Member (First Entry) ===\n');
    
    const bcrypt = await import('bcryptjs');
    const adminPassword = await bcrypt.default.hash('changeme', 10);
    
    // Check if System Admin already exists
    const existingSystemAdmin = await prisma.member.findUnique({
      where: { email: 'admin@pingpong.com' },
    });
    
    if (!existingSystemAdmin) {
      // Use a transaction to ensure sequence reset and Admin creation happen atomically
      // This ensures they use the same database connection
      const admin = await prisma.$transaction(async (tx) => {
        // Reset sequence within the transaction
        await tx.$executeRawUnsafe(`ALTER SEQUENCE "members_id_seq" RESTART WITH 1;`);
        await tx.$executeRawUnsafe(`SELECT setval('members_id_seq', 1, false);`);
        
        // Create Admin within the same transaction
        return await tx.member.create({
          data: {
            firstName: 'Sys',
            lastName: 'Admin',
            email: 'admin@pingpong.com',
            gender: 'OTHER',
            password: adminPassword,
            roles: [MemberRole.ADMIN],
            isActive: true,
            rating: null, // Admin has no rating
            mustResetPassword: false, // Set to false for all users in generation script
          },
        });
      });
      
      console.log(`  ✓ Created System Admin member (admin@pingpong.com) as first entry (ID: ${admin.id})\n`);
      console.log('    - Gender: OTHER\n');
      console.log('    - Rating: NULL\n');
      console.log('    - Will be excluded from matches and tournaments\n');
    } else {
      console.log('  ✓ System Admin member already exists\n');
    }
    
    // Step 3: Create 130 players
    const players = await createPlayers();
    
    // Step 4: Generate 150 matches
    await generateMatches(players, 150, timestampTracker);
    
    // Step 5: Create tournaments
    await createTournaments(timestampTracker);
    
    // Step 6: Recalculate all ratings to ensure all matches affect ratings
    console.log('=== Recalculating All Ratings ===\n');
    console.log('  Recalculating ratings for all completed tournaments...');
    // Get all completed tournaments and recalculate in chronological order
    const allCompletedTournaments = await prisma.tournament.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { recordedAt: 'asc' },
    });
    
    const { recalculateRankings: recalcRankings } = await import('../src/services/rankingService');
    const { createRatingHistoryForRoundRobinTournament } = await import('../src/services/usattRatingService');
    
    for (const tournament of allCompletedTournaments) {
      await recalcRankings(tournament.id);
      
      // For ROUND_ROBIN tournaments, create rating history entries
      if (tournament.type === 'ROUND_ROBIN') {
        await createRatingHistoryForRoundRobinTournament(tournament.id);
      }
    }
    
    console.log(`  ✓ Recalculated ratings for ${allCompletedTournaments.length} tournaments\n`);
    
    console.log('✅ Database population complete!\n');
    
    // Summary
    const playerCount = await prisma.member.count();
    const matchCount = await prisma.match.count();
    const tournamentCount = await prisma.tournament.count();
    
    console.log('=== Summary ===');
    console.log(`Players: ${playerCount}`);
    console.log(`Matches: ${matchCount}`);
    console.log(`Tournaments: ${tournamentCount}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

