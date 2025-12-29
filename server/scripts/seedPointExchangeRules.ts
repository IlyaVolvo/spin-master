/**
 * Seed script to populate initial point exchange rules
 * These match the hardcoded values in the original getPointExchange function
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

const rules = [
  { minDiff: 0, maxDiff: 12, expectedPoints: 8, upsetPoints: 8 },
  { minDiff: 13, maxDiff: 37, expectedPoints: 7, upsetPoints: 10 },
  { minDiff: 38, maxDiff: 62, expectedPoints: 6, upsetPoints: 13 },
  { minDiff: 63, maxDiff: 87, expectedPoints: 5, upsetPoints: 16 },
  { minDiff: 88, maxDiff: 112, expectedPoints: 4, upsetPoints: 20 },
  { minDiff: 113, maxDiff: 137, expectedPoints: 3, upsetPoints: 25 },
  { minDiff: 138, maxDiff: 162, expectedPoints: 2, upsetPoints: 30 },
  { minDiff: 163, maxDiff: 187, expectedPoints: 2, upsetPoints: 35 },
  { minDiff: 188, maxDiff: 212, expectedPoints: 1, upsetPoints: 40 },
  { minDiff: 213, maxDiff: 237, expectedPoints: 1, upsetPoints: 45 },
  { minDiff: 238, maxDiff: 262, expectedPoints: 0, upsetPoints: 50 },
  { minDiff: 263, maxDiff: 287, expectedPoints: 0, upsetPoints: 55 },
  { minDiff: 288, maxDiff: 312, expectedPoints: 0, upsetPoints: 60 },
  { minDiff: 313, maxDiff: 337, expectedPoints: 0, upsetPoints: 65 },
  { minDiff: 338, maxDiff: 362, expectedPoints: 0, upsetPoints: 70 },
  { minDiff: 363, maxDiff: 387, expectedPoints: 0, upsetPoints: 75 },
  { minDiff: 388, maxDiff: 412, expectedPoints: 0, upsetPoints: 80 },
  { minDiff: 413, maxDiff: 437, expectedPoints: 0, upsetPoints: 85 },
  { minDiff: 438, maxDiff: 462, expectedPoints: 0, upsetPoints: 90 },
  { minDiff: 463, maxDiff: 487, expectedPoints: 0, upsetPoints: 95 },
  { minDiff: 488, maxDiff: 512, expectedPoints: 0, upsetPoints: 100 },
  { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100 }, // For differences > 512
];

async function main() {
  console.log('\n=== Seeding Point Exchange Rules ===\n');

  const effectiveFrom = new Date(); // All rules become effective from now

  // Check if rules already exist
  const existingRules = await prisma.pointExchangeRule.findMany({
    where: { effectiveFrom },
  });

  if (existingRules.length > 0) {
    console.log(`Found ${existingRules.length} existing rules with effectiveFrom = ${effectiveFrom.toISOString()}`);
    console.log('Skipping seed - rules already exist. To re-seed, delete existing rules first.\n');
    return;
  }

  console.log(`Creating ${rules.length} point exchange rules...\n`);

  for (const rule of rules) {
    await prisma.pointExchangeRule.create({
      data: {
        ...rule,
        effectiveFrom,
      },
    });
    console.log(`  Created rule: diff ${rule.minDiff}-${rule.maxDiff}: expected=${rule.expectedPoints}, upset=${rule.upsetPoints}`);
  }

  console.log(`\n✅ Successfully seeded ${rules.length} point exchange rules!\n`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Error seeding point exchange rules:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

