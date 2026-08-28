import express from 'express';
import { optionalAuthenticate, type AuthRequest } from '../middleware/auth';
import { getPublicCoachCalendar } from '../services/coachCalendarService';
import { getGroupClassByCode } from '../services/groupClassService';
import { listTeachingCoaches } from '../services/coachProfileService';

const router = express.Router();

router.get('/coaches', async (_req, res) => {
  const coaches = await listTeachingCoaches();
  res.json(
    coaches.map((c) => ({
      id: c.memberId,
      coachProfileId: c.id,
      firstName: c.member.firstName,
      lastName: c.member.lastName,
      rating: c.member.rating,
      hourlyRateCents: c.hourlyRateCents,
      bio: c.bio,
    })),
  );
});

router.get('/coaches/:id', optionalAuthenticate, async (req: AuthRequest, res) => {
  const memberId = Number(req.params.id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return res.status(400).json({ error: 'Invalid coach' });
  }
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const data = await getPublicCoachCalendar({
    memberId,
    from,
    to,
    viewerMemberId: req.memberId || null,
  });
  if (!data) return res.status(404).json({ error: 'Coach not found' });
  res.json(data);
});

router.get('/classes/:code', async (req, res) => {
  const cls = await getGroupClassByCode(String(req.params.code || ''));
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  res.json({
    id: cls.id,
    publicCode: cls.publicCode,
    title: cls.title,
    durationMinutes: cls.durationMinutes,
    pricePerOccurrenceCents: cls.pricePerOccurrenceCents,
    minParticipants: cls.minParticipants,
    maxParticipants: cls.maxParticipants,
    ratingMin: cls.ratingMin,
    ratingMax: cls.ratingMax,
    ageMin: cls.ageMin,
    ageMax: cls.ageMax,
    intervalWeeks: cls.intervalWeeks,
    startsOn: cls.startsOn,
    untilOn: cls.untilOn,
    coaches: cls.coaches.map((c) => ({
      coachProfileId: c.coachProfileId,
      firstName: c.coachProfile.member.firstName,
      lastName: c.coachProfile.member.lastName,
      splitPercent: c.splitPercent,
    })),
    slots: cls.slots,
    occurrences: cls.occurrences.map((o) => ({
      id: o.id,
      clubDate: o.clubDate,
      startTime: o.startTime,
      endTime: o.endTime,
      registered: o.registrations.filter((r) => r.status === 'REGISTERED').map((r) => ({
        id: r.member.id,
        firstName: r.member.firstName,
        lastName: r.member.lastName,
      })),
      waitlistCount: o.registrations.filter((r) => r.status === 'WAITLIST').length,
    })),
  });
});

export default router;
