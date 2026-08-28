import express from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { isAdmin } from '../utils/adminAccess';
import { actorTypeFor, canManageCoachProfile, hasPlayerRole, requireCoachOrAdmin } from '../utils/coachAccess';
import { prisma } from '../index';
import { ensureCoachProfile, getCoachProfileByMemberId, listCoachRateHistory, listTeachingCoaches, updateCoachProfile } from '../services/coachProfileService';
import {
  endCoachEditSession,
  heartbeatCoachEditSession,
  startCoachEditSession,
  isEditSessionActive,
} from '../services/coachEditSession';
import {
  cancelAvailabilityFromDate,
  cancelAvailabilityOccurrence,
  createAvailabilitySeries,
  listAvailability,
  updateOccurrenceRestrictions,
} from '../services/availabilityService';
import {
  bookIndividualLesson,
  bookIndividualSeries,
  cancelIndividualLesson,
  listCoachLessons,
  listPlayerLessons,
  reduceIndividualLessonRate,
  searchIndividualSlots,
} from '../services/individualLessonService';
import { commitAvailabilityWindows } from '../services/availabilityCommit';
import { getCoachEditorWeek, getStudentFreeWindows, getStudentLessonWeek } from '../services/coachCalendarService';
import {
  cancelGroupOccurrence,
  cancelRemainingGroupOccurrences,
  createGroupClass,
  dropGroupRegistration,
  listCoachGroupClasses,
  listPlayerGroupRegistrations,
  registerForOccurrence,
  runGroupOccurrenceBelowMin,
} from '../services/groupClassService';
import { recordLessonLifecycle } from '../services/lessonLifecycle';
import { logger } from '../utils/logger';

const router = express.Router();
router.use(authenticate);

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function asInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function resolveManagedCoach(req: AuthRequest, memberIdParam?: unknown) {
  const admin = await isAdmin(req);
  const targetMemberId = asInt(memberIdParam) || req.memberId;
  if (!targetMemberId) throw new Error('Not authenticated');
  if (!(await canManageCoachProfile(req, targetMemberId))) {
    throw Object.assign(new Error('Not allowed to manage this coach'), { status: 403 });
  }
  const profile = await ensureCoachProfile(targetMemberId);
  return { profile, admin };
}

router.get('/coaches', async (_req, res) => {
  const coaches = await listTeachingCoaches();
  res.json(coaches);
});

router.get('/me/profile', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.query.memberId);
    res.json({
      ...profile,
      bookingFrozen: isEditSessionActive(profile.editSessionUntil),
    });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not load coach profile') });
  }
});

router.post('/me/edit-session/start', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const updated = await startCoachEditSession(profile.memberId);
    res.json({ ok: true, editSessionUntil: updated.editSessionUntil, bookingFrozen: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not start editing') });
  }
});

router.post('/me/edit-session/heartbeat', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const updated = await heartbeatCoachEditSession(profile.memberId);
    res.json({ ok: true, editSessionUntil: updated.editSessionUntil, bookingFrozen: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Edit session expired') });
  }
});

router.post('/me/edit-session/end', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    await endCoachEditSession(profile.memberId);
    res.json({ ok: true, bookingFrozen: false });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not finish editing') });
  }
});

router.patch('/me/profile', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const updated = await updateCoachProfile(profile.memberId, req.body || {}, req.memberId);
    res.json(updated);
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not update coach profile') });
  }
});

router.get('/me/rate-history', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.query.memberId);
    const rows = await listCoachRateHistory(profile.id);
    res.json(rows);
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not load rate history') });
  }
});

router.get('/me/calendar', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.query.memberId);
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const data = await getCoachEditorWeek({ memberId: profile.memberId, from, to });
    if (!data) return res.status(404).json({ error: 'Coach not found' });
    res.json(data);
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not load calendar') });
  }
});

router.get('/availability', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.query.memberId);
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;
    const rows = await listAvailability(profile.id, from, to);
    res.json(rows);
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    res.status(status).json({ error: getErrorMessage(error, 'Could not load availability') });
  }
});

router.post('/availability', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const series = await createAvailabilitySeries(profile.id, req.body || {});
    res.status(201).json(series);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not create availability') });
  }
});

router.post('/availability/commit', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const windows = Array.isArray(req.body?.windows) ? req.body.windows : [];
    const result = await commitAvailabilityWindows({
      coachProfileId: profile.id,
      windows,
      actorMemberId: req.memberId!,
      actorType: actorTypeFor(req),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not save calendar') });
  }
});

router.post('/availability/occurrences/:id/cancel', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid occurrence' });
    const occ = await prisma.coachAvailabilityOccurrence.findUnique({
      where: { id },
      include: { series: { include: { coach: true } } },
    });
    if (!occ) return res.status(404).json({ error: 'Not found' });
    if (!(await canManageCoachProfile(req, occ.series.coach.memberId))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const { occurrence, lessons } = await cancelAvailabilityOccurrence(id, req.memberId || null);
    for (const lesson of lessons) {
      await cancelIndividualLesson({
        lessonId: lesson.id,
        actorMemberId: req.memberId!,
        actorType: actorTypeFor(req),
        isAdmin: true,
      });
    }
    await recordLessonLifecycle({
      action: 'AVAILABILITY_CANCEL',
      actorType: actorTypeFor(req),
      actorMemberId: req.memberId,
      entityType: 'availability_occurrence',
      entityId: occurrence.id,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not cancel') });
  }
});

router.post('/availability/series/:id/cancel-future', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    const from = String(req.body?.from || '');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({ error: 'Series id and from date are required' });
    }
    const series = await prisma.coachAvailabilitySeries.findUnique({ where: { id }, include: { coach: true } });
    if (!series) return res.status(404).json({ error: 'Not found' });
    if (!(await canManageCoachProfile(req, series.coach.memberId))) return res.status(403).json({ error: 'Not allowed' });
    const result = await cancelAvailabilityFromDate(id, from);
    for (const occ of result.occurrences) {
      for (const lesson of occ.individualLessons) {
        await cancelIndividualLesson({
          lessonId: lesson.id,
          actorMemberId: req.memberId!,
          actorType: actorTypeFor(req),
          isAdmin: true,
        });
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not cancel future dates') });
  }
});

router.patch('/availability/occurrences/:id', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid occurrence' });
    const occ = await prisma.coachAvailabilityOccurrence.findUnique({
      where: { id },
      include: { series: { include: { coach: true } } },
    });
    if (!occ) return res.status(404).json({ error: 'Not found' });
    if (!(await canManageCoachProfile(req, occ.series.coach.memberId))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const updated = await updateOccurrenceRestrictions(id, req.body || {});
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not update') });
  }
});

router.get('/individual/week', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.query.playerMemberId) || req.memberId;
    if (playerMemberId !== req.memberId && !admin) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const coachProfileId = asInt(req.query.coachProfileId) || undefined;
    const data = await getStudentLessonWeek({ playerMemberId, from, to, coachProfileId });
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not load availability') });
  }
});

router.get('/individual/windows', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.query.playerMemberId) || req.memberId;
    if (playerMemberId !== req.memberId && !admin) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    if (!from) return res.status(400).json({ error: 'from is required' });
    const coachProfileId = asInt(req.query.coachProfileId) || undefined;
    const data = await getStudentFreeWindows({ playerMemberId, from, to, coachProfileId });
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not load availability') });
  }
});

router.post('/individual/search', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.body?.playerMemberId) || req.memberId;
    if (playerMemberId !== req.memberId && !admin) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const matches = await searchIndividualSlots({
      playerMemberId,
      durationMinutes: Number(req.body?.durationMinutes),
      timeRanges: Array.isArray(req.body?.timeRanges) ? req.body.timeRanges : [],
      coachProfileIds: Array.isArray(req.body?.coachProfileIds) ? req.body.coachProfileIds.map(Number) : undefined,
      bypassEligibility: admin,
    });
    res.json(matches);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Search failed') });
  }
});

router.post('/individual', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.body?.playerMemberId) || req.memberId;
    const placing = playerMemberId !== req.memberId;
    if (placing && !admin && !(await canManageCoachProfile(req, (await prisma.coachProfile.findUnique({ where: { id: Number(req.body?.coachProfileId) } }))?.memberId || 0))) {
      return res.status(403).json({ error: 'Not allowed to place this player' });
    }
    if (!placing && !hasPlayerRole(req) && !admin) {
      return res.status(403).json({ error: 'Player role required' });
    }
    const result = await bookIndividualLesson({
      actorMemberId: req.memberId,
      actorType: actorTypeFor(req),
      playerMemberId,
      coachProfileId: Number(req.body?.coachProfileId),
      clubDate: String(req.body?.clubDate),
      startTime: String(req.body?.startTime),
      durationMinutes: Number(req.body?.durationMinutes),
      reminderHours: Number(req.body?.reminderHours || 0),
      bypassEligibility: placing || admin,
      initiatedBy: admin ? 'ADMIN' : 'MEMBER',
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not book lesson') });
  }
});

router.post('/individual/series', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.body?.playerMemberId) || req.memberId;
    const result = await bookIndividualSeries({
      actorMemberId: req.memberId,
      actorType: actorTypeFor(req),
      playerMemberId,
      coachProfileId: Number(req.body?.coachProfileId),
      startTime: String(req.body?.startTime),
      durationMinutes: Number(req.body?.durationMinutes),
      weekdays: req.body?.weekdays,
      intervalWeeks: req.body?.intervalWeeks,
      startsOn: String(req.body?.startsOn),
      untilOn: req.body?.untilOn,
      reminderHours: Number(req.body?.reminderHours || 0),
      bypassEligibility: playerMemberId !== req.memberId || admin,
      initiatedBy: admin ? 'ADMIN' : 'MEMBER',
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not book series') });
  }
});

router.post('/individual/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id || !req.memberId) return res.status(400).json({ error: 'Invalid lesson' });
    const result = await cancelIndividualLesson({
      lessonId: id,
      actorMemberId: req.memberId,
      actorType: actorTypeFor(req),
      isAdmin: await isAdmin(req),
      cancelReason: typeof req.body?.reason === 'string' ? req.body.reason : req.body?.cancelReason,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not cancel') });
  }
});

router.post('/individual/:id/reduce-rate', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id || !req.memberId) return res.status(400).json({ error: 'Invalid lesson' });
    const updated = await reduceIndividualLessonRate({
      lessonId: id,
      hourlyRateCents: Number(req.body?.hourlyRateCents),
      actorMemberId: req.memberId,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not reduce rate') });
  }
});

router.get('/mine', async (req: AuthRequest, res) => {
  if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
  const [lessons, classes] = await Promise.all([
    listPlayerLessons(req.memberId),
    listPlayerGroupRegistrations(req.memberId),
  ]);
  res.json({ lessons, classes });
});

router.get('/teaching', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.query.memberId);
    const [lessons, classes] = await Promise.all([
      listCoachLessons(profile.id),
      listCoachGroupClasses(profile.id),
    ]);
    res.json({ lessons, classes });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not load schedule') });
  }
});

router.post('/group-classes', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { profile } = await resolveManagedCoach(req, req.body?.memberId);
    const created = await createGroupClass({
      creatorCoachProfileId: profile.id,
      actorMemberId: req.memberId!,
      title: String(req.body?.title || ''),
      durationMinutes: Number(req.body?.durationMinutes),
      pricePerOccurrenceCents: Math.round(Number(req.body?.priceDollars || 0) * 100) || Number(req.body?.pricePerOccurrenceCents),
      minParticipants: Number(req.body?.minParticipants),
      maxParticipants: Number(req.body?.maxParticipants),
      ratingMin: req.body?.ratingMin,
      ratingMax: req.body?.ratingMax,
      ageMin: req.body?.ageMin,
      ageMax: req.body?.ageMax,
      intervalWeeks: req.body?.intervalWeeks,
      startsOn: String(req.body?.startsOn),
      untilOn: req.body?.untilOn,
      slots: Array.isArray(req.body?.slots) ? req.body.slots : [],
      additionalCoachProfileIds: req.body?.additionalCoachProfileIds,
      splitPercents: req.body?.splitPercents,
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not create class') });
  }
});

router.post('/group-occurrences/:id/register', async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) return res.status(401).json({ error: 'Not authenticated' });
    const id = asInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid occurrence' });
    const admin = await isAdmin(req);
    const playerMemberId = asInt(req.body?.playerMemberId) || req.memberId;
    const placing = playerMemberId !== req.memberId;
    if (placing) {
      const occ = await prisma.groupClassOccurrence.findUnique({
        where: { id },
        include: { groupClass: { include: { coaches: { include: { coachProfile: true } } } } },
      });
      const coachMemberIds = occ?.groupClass.coaches.map((c) => c.coachProfile.memberId) || [];
      const allowed = admin || (req.memberId != null && coachMemberIds.includes(req.memberId));
      if (!allowed) return res.status(403).json({ error: 'Not allowed to place this player' });
    }
    const result = await registerForOccurrence({
      occurrenceId: id,
      playerMemberId,
      actorMemberId: req.memberId,
      actorType: actorTypeFor(req),
      bypassEligibility: placing || admin,
      waitlistIfFull: Boolean(req.body?.waitlistIfFull),
      initiatedBy: admin ? 'ADMIN' : 'MEMBER',
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not register') });
  }
});

router.post('/group-registrations/:id/drop', async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id || !req.memberId) return res.status(400).json({ error: 'Invalid registration' });
    await dropGroupRegistration({
      registrationId: id,
      actorMemberId: req.memberId,
      actorType: actorTypeFor(req),
      isAdmin: await isAdmin(req),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not drop') });
  }
});

router.post('/group-occurrences/:id/cancel', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id || !req.memberId) return res.status(400).json({ error: 'Invalid occurrence' });
    const profile = await getCoachProfileByMemberId(req.memberId);
    await cancelGroupOccurrence({
      occurrenceId: id,
      actorMemberId: req.memberId,
      isAdmin: await isAdmin(req),
      actorCoachProfileId: profile?.id ?? null,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not cancel class') });
  }
});

router.post('/group-occurrences/:id/run-below-min', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    if (!id || !req.memberId) return res.status(400).json({ error: 'Invalid occurrence' });
    const profile = await getCoachProfileByMemberId(req.memberId);
    const updated = await runGroupOccurrenceBelowMin({
      occurrenceId: id,
      actorMemberId: req.memberId,
      isAdmin: await isAdmin(req),
      actorCoachProfileId: profile?.id ?? null,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not confirm class') });
  }
});

router.post('/group-classes/:id/cancel-remaining', requireCoachOrAdmin, async (req: AuthRequest, res) => {
  try {
    const id = asInt(req.params.id);
    const from = String(req.body?.from || '');
    if (!id || !req.memberId || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({ error: 'Class id and from date are required' });
    }
    const profile = await getCoachProfileByMemberId(req.memberId);
    const result = await cancelRemainingGroupOccurrences({
      classId: id,
      fromClubDate: from,
      actorMemberId: req.memberId,
      isAdmin: await isAdmin(req),
      actorCoachProfileId: profile?.id ?? null,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not cancel remaining weeks') });
  }
});

router.get('/lifecycle', async (req: AuthRequest, res) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    const rows = await prisma.lessonLifecycleEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json(rows);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Could not load log') });
  }
});

router.get('/reports.csv', async (req: AuthRequest, res) => {
  try {
    const admin = await isAdmin(req);
    const from = String(req.query.from || '1970-01-01');
    const to = String(req.query.to || '9999-12-31');
    const profile = req.memberId ? await getCoachProfileByMemberId(req.memberId) : null;
    const lessons = await prisma.individualLesson.findMany({
      where: {
        clubDate: { gte: from, lte: to },
        ...(admin ? {} : profile ? { coachProfileId: profile.id } : { playerMemberId: req.memberId || 0 }),
      },
      include: {
        player: { select: { firstName: true, lastName: true } },
        coach: { include: { member: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ clubDate: 'asc' }, { startTime: 'asc' }],
    });
    const groupRegs = await prisma.groupClassRegistration.findMany({
      where: {
        occurrence: {
          clubDate: { gte: from, lte: to },
          ...(admin ? {} : profile ? { groupClass: { coaches: { some: { coachProfileId: profile.id } } } } : {}),
        },
        ...(admin || profile ? {} : { memberId: req.memberId || 0 }),
      },
      include: {
        member: { select: { firstName: true, lastName: true } },
        occurrence: {
          include: {
            groupClass: {
              include: {
                creator: { include: { member: { select: { firstName: true, lastName: true } } } },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    const header = 'date,start,end,type,status,player,coach,priceCents\n';
    const individualRows = lessons.map((l) =>
      [
        l.clubDate,
        l.startTime,
        l.endTime,
        'individual',
        l.status,
        `${l.player.firstName} ${l.player.lastName}`,
        `${l.coach.member.firstName} ${l.coach.member.lastName}`,
        l.priceCents,
      ].join(','),
    );
    const groupRows = groupRegs.map((r) =>
      [
        r.occurrence.clubDate,
        r.occurrence.startTime,
        r.occurrence.endTime,
        'group',
        r.status,
        `${r.member.firstName} ${r.member.lastName}`,
        `${r.occurrence.groupClass.creator.member.firstName} ${r.occurrence.groupClass.creator.member.lastName}`,
        r.priceCents,
      ].join(','),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="lessons.csv"');
    res.send(header + [...individualRows, ...groupRows].join('\n') + '\n');
  } catch (error) {
    logger.error('Lesson CSV failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ error: 'Could not export' });
  }
});

export default router;
