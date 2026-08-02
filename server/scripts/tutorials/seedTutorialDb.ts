/**
 * Seed pinned tutorial data into DATABASE_URL_TUTORIAL (already migrated/reset).
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { assertTutorialDatabaseUrl, redactDatabaseUrl } from './lib/safety';
import {
  TUTORIAL_CHECKIN_MEMBER,
  TUTORIAL_CLUB_NAME,
  TUTORIAL_EMAILS,
  TUTORIAL_PASSWORD,
  TUTORIAL_SCORE_PIN,
} from './lib/constants';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const POINT_RULES = [
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
  { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100 },
];

function qrHash(suffix: string): string {
  return createHash('sha256').update(`role-tutorial:${suffix}:v1`).digest('hex');
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const MEMBER_SPECS = [
  {
    email: TUTORIAL_EMAILS.player,
    firstName: 'Tutorial',
    lastName: 'PlayerOnly',
    roles: ['PLAYER'] as string[],
    rating: 1500,
    qrSuffix: 'player',
  },
  {
    email: TUTORIAL_EMAILS.organizer,
    firstName: 'Tutorial',
    lastName: 'Organizer',
    roles: ['PLAYER', 'ORGANIZER'] as string[],
    rating: 1650,
    qrSuffix: 'organizer',
  },
  {
    email: TUTORIAL_EMAILS.admin,
    firstName: 'Tutorial',
    lastName: 'Administrator',
    // ORGANIZER included so admin can enter tournament scores (product gate is organizer).
    roles: ['PLAYER', 'ADMIN', 'ORGANIZER'] as string[],
    rating: 1800,
    qrSuffix: 'admin',
  },
] as const;

/** Extra roster so tournament UIs look populated. */
const EXTRA_PLAYERS = [
  ['Alex', 'Rivera', 1420],
  ['Blair', 'Chen', 1580],
  ['Casey', 'Nguyen', 1710],
  ['Drew', 'Patel', 1355],
  ['Eden', 'Brooks', 1625],
  ['Finley', 'Ortiz', 1490],
] as const;

async function main() {
  const tutorialUrl = assertTutorialDatabaseUrl(process.env.DATABASE_URL_TUTORIAL);
  // Force Prisma to the tutorial DB even if DATABASE_URL is set to something else.
  process.env.DATABASE_URL = tutorialUrl;

  console.log('[tutorials:seed] Target:', redactDatabaseUrl(tutorialUrl));

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TUTORIAL_PASSWORD, 10);
    const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');

    await prisma.pointExchangeRule.createMany({
      data: POINT_RULES.map((r) => ({ ...r, effectiveFrom })),
    });

    await prisma.systemConfig.create({
      data: {
        id: 'system',
        branding: toJson({
          clubName: TUTORIAL_CLUB_NAME,
          clubTimezone: 'America/Los_Angeles',
        }),
        authPolicy: toJson({
          minimumPasswordLength: 6,
          passwordResetTokenTtlHours: 1,
          pinLength: 4,
          autoRelinquishPrivileges: false,
          autoRelinquishIdleMinutes: 0,
        }),
        preregistration: toJson({
          defaultTournamentOffsetDays: 1,
          defaultTournamentTime: '18:00',
          registrationDeadlineOffsetMinutes: 30,
          cancelReasonPresets: [
            'Tournament cancelled by organizer',
            'Not enough registered players',
          ],
        }),
        ratingValidation: toJson({
          ratingInputMin: 0,
          ratingInputMax: 9999,
          suspiciousRatingMin: 800,
          suspiciousRatingMax: 2100,
        }),
        tournamentRules: toJson({}),
        clientRuntime: toJson({}),
        clubPlans: toJson({
          segments: ['Regular', 'Junior'],
          visitPricingFormula: {
            Regular: { basePricePerVisitCents: 1000, exponent: 0.08 },
            Junior: { basePricePerVisitCents: 600, exponent: 0.08 },
          },
        }),
        publicAccess: toJson({ achievements: {} }),
        payments: toJson({
          providerId: 'test',
          defaultOnlinePayConsent: true,
          adminNotifyEmails: [],
          notifyAdminsOnCourtesy: true,
          courtesyGraceDays: 7,
          courtesyExtraVisits: 3,
          newMemberTrialDays: 0,
          reminders: {
            checkInBannerEnabled: true,
            emailEnabled: false,
            periodDaysBeforeExpiry: 14,
            visitPackVisitsRemaining: 2,
          },
          providers: {
            test: {
              confirmDelayMeanMs: 500,
              confirmDelayStdDevMs: 100,
            },
          },
        }),
      },
    });

    const monthlyPlan = await prisma.clubPlan.create({
      data: {
        familyKey: 'monthly',
        name: 'Monthly membership',
        kind: 'TIME',
        segment: 'Regular',
        priceCents: 8000,
        currency: 'USD',
        durationUnit: 'MONTH',
        durationValue: 1,
        visitCount: null,
        isActive: true,
        sortOrder: 1,
      },
    });
    const visitPackPlan = await prisma.clubPlan.create({
      data: {
        familyKey: 'visit-pack-5',
        name: '5-visit pack',
        kind: 'VISIT',
        segment: 'Regular',
        priceCents: 4000,
        currency: 'USD',
        durationUnit: null,
        durationValue: null,
        visitCount: 5,
        isActive: true,
        sortOrder: 2,
      },
    });

    for (const s of MEMBER_SPECS) {
      await prisma.member.create({
        data: {
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName,
          birthDate: new Date('1992-06-01'),
          gender: 'MALE',
          password: passwordHash,
          roles: [...s.roles],
          rating: s.rating,
          isActive: true,
          qrTokenHash: qrHash(s.qrSuffix),
          scorePin: TUTORIAL_SCORE_PIN,
          mustResetPassword: false,
        },
      });
      console.log('  member:', s.email, s.roles.join('+'));
    }

    const rosterIds: number[] = [];
    let i = 0;
    for (const [firstName, lastName, rating] of EXTRA_PLAYERS) {
      i += 1;
      const m = await prisma.member.create({
        data: {
          email: `tutorial-roster-${i}@spin-master.local`,
          firstName,
          lastName,
          birthDate: new Date('1990-01-15'),
          gender: 'NOT_SPECIFIED',
          password: passwordHash,
          roles: ['PLAYER'],
          rating,
          isActive: true,
          qrTokenHash: qrHash(`roster-${i}`),
          scorePin: TUTORIAL_SCORE_PIN,
          mustResetPassword: false,
        },
      });
      rosterIds.push(m.id);
    }

    const player = await prisma.member.findUniqueOrThrow({
      where: { email: TUTORIAL_EMAILS.player },
    });
    const organizer = await prisma.member.findUniqueOrThrow({
      where: { email: TUTORIAL_EMAILS.organizer },
    });
    const activeParticipants = [player.id, organizer.id, ...rosterIds.slice(0, 4)];

    const active = await prisma.tournament.create({
      data: {
        name: 'Tutorial Active Round Robin',
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: {
          create: activeParticipants.map((memberId) => ({
            memberId,
            playerRatingAtTime: 1500,
          })),
        },
      },
    });

    const future = new Date();
    future.setDate(future.getDate() + 7);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);
    await prisma.tournament.create({
      data: {
        name: 'Tutorial Pre-Registration Event',
        type: 'ROUND_ROBIN',
        status: 'PRE_REGISTRATION',
        tournamentDate: future,
        registrationDeadline: deadline,
        maxParticipants: 16,
      },
    });

    // Completed RR with a full scored matrix — used for score-correction showcase.
    // Must remain the latest rating event for its participants (no later history).
    const completedParticipants = [player.id, ...rosterIds.slice(0, 3)];
    const completed = await prisma.tournament.create({
      data: {
        name: 'Tutorial Completed Round Robin',
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: {
          create: completedParticipants.map((memberId) => ({
            memberId,
            playerRatingAtTime: 1500,
          })),
        },
      },
    });
    const completedScores: Array<[number, number]> = [
      [3, 1],
      [3, 0],
      [3, 2],
      [3, 1],
      [3, 0],
      [3, 1],
    ];
    let scoreIdx = 0;
    for (let a = 0; a < completedParticipants.length; a++) {
      for (let b = a + 1; b < completedParticipants.length; b++) {
        const [player1Sets, player2Sets] = completedScores[scoreIdx++] ?? [3, 1];
        await prisma.match.create({
          data: {
            tournamentId: completed.id,
            member1Id: completedParticipants[a],
            member2Id: completedParticipants[b],
            player1Sets,
            player2Sets,
            player1Forfeit: false,
            player2Forfeit: false,
            notPlayed: false,
          },
        });
      }
    }
    const recordedAt = new Date();
    await prisma.tournament.update({
      where: { id: completed.id },
      data: { status: 'COMPLETED', recordedAt },
    });
    const { createRatingHistoryForRoundRobinTournament } = await import(
      '../../src/services/usattRatingService'
    );
    await createRatingHistoryForRoundRobinTournament(completed.id);
    const { recalculateRankings } = await import('../../src/services/rankingService');
    await recalculateRankings(completed.id);

    const admin = await prisma.member.findUniqueOrThrow({
      where: { email: TUTORIAL_EMAILS.admin },
    });
    const clubDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Organizer has an active monthly entitlement (player does not — plan UI shows purchase).
    const validFrom = new Date();
    validFrom.setDate(validFrom.getDate() - 5);
    const validTo = new Date();
    validTo.setDate(validTo.getDate() + 25);
    await prisma.clubEntitlement.create({
      data: {
        memberId: organizer.id,
        type: 'MONTHLY',
        status: 'CURRENT',
        label: 'Monthly membership',
        validFrom,
        validTo,
        amountPaidCents: 8000,
        familyKey: 'monthly',
        active: true,
        planId: monthlyPlan.id,
        planSegment: 'Regular',
      },
    });

    // Visit pack for the kiosk check-in showcase member (not present today).
    const checkinMember = await prisma.member.findFirstOrThrow({
      where: {
        firstName: TUTORIAL_CHECKIN_MEMBER.firstName,
        lastName: TUTORIAL_CHECKIN_MEMBER.lastName,
      },
    });
    await prisma.clubEntitlement.create({
      data: {
        memberId: checkinMember.id,
        type: 'VISIT_PACK',
        status: 'CURRENT',
        label: '5-visit pack',
        validFrom,
        validTo: null,
        visitsRemaining: 5,
        visitsTotal: 5,
        amountPaidCents: 4000,
        familyKey: 'visit-pack-5',
        active: true,
        planId: visitPackPlan.id,
        planSegment: 'Regular',
      },
    });

    await prisma.clubPayment.create({
      data: {
        memberId: organizer.id,
        amountCents: 8000,
        listAmountCents: 8000,
        creditAppliedCents: 0,
        currency: 'USD',
        provider: 'manual',
        status: 'SUCCEEDED',
        purpose: 'Monthly membership',
        metadata: { tutorialSeed: true },
      },
    });
    // Pending cash payment on a roster member (not the tutorial player) so Payment Log
    // still has a clear/reject example while the player plan showcase can select a plan.
    await prisma.clubPayment.create({
      data: {
        memberId: rosterIds[0],
        amountCents: 4000,
        listAmountCents: 4000,
        creditAppliedCents: 0,
        currency: 'USD',
        provider: 'manual',
        status: 'PENDING',
        purpose: '5-visit pack (cash)',
        metadata: { tutorialSeed: true, awaitingClear: true },
      },
    });

    // Open visit for a roster member + admin already present for Attendance Log / kiosk.
    await prisma.clubVisit.create({
      data: {
        memberId: rosterIds[0],
        clubDate,
        checkInAt: new Date(),
        dailyPaymentApplied: true,
      },
    });
    await prisma.clubVisit.create({
      data: {
        memberId: admin.id,
        clubDate,
        checkInAt: new Date(Date.now() - 60 * 60 * 1000),
        dailyPaymentApplied: true,
      },
    });
    // Rejected check-in example for filters
    await prisma.clubVisit.create({
      data: {
        memberId: player.id,
        clubDate,
        checkInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        checkOutAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        rejectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        rejectionReason: 'Payment required',
        dailyPaymentApplied: false,
      },
    });

    console.log('[tutorials:seed] Club:', TUTORIAL_CLUB_NAME);
    console.log(
      '[tutorials:seed] Sample tournaments: active id',
      active.id,
      '+ prereg + completed id',
      completed.id,
      '(scored)',
    );
    console.log('[tutorials:seed] Payments + visits for clubDate', clubDate);
    console.log('[tutorials:seed] Password (all tutorial accounts):', TUTORIAL_PASSWORD);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
