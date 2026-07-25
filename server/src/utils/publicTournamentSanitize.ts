const MEMBER_PUBLIC_FIELDS = new Set([
  'id',
  'firstName',
  'lastName',
  'birthDate',
  'isActive',
  'rating',
  'gender',
]);

function sanitizeMember(member: any): any {
  if (!member || typeof member !== 'object') return member;
  const sanitized: Record<string, unknown> = {};
  for (const key of MEMBER_PUBLIC_FIELDS) {
    if (key in member) {
      sanitized[key] = member[key];
    }
  }
  return sanitized;
}

/** Strip secrets and non-results fields from enriched tournament trees. */
export function sanitizeTournamentForPublic(tournament: any): any {
  if (!tournament || typeof tournament !== 'object') return tournament;

  const {
    registrations: _registrations,
    correctionEligibility: _correctionEligibility,
    ...rest
  } = tournament;

  const sanitized: any = { ...rest };

  if (Array.isArray(sanitized.participants)) {
    sanitized.participants = sanitized.participants.map((participant: any) => ({
      ...participant,
      member: sanitizeMember(participant.member),
    }));
  }

  if (Array.isArray(sanitized.childTournaments)) {
    sanitized.childTournaments = sanitized.childTournaments.map((child: any) =>
      sanitizeTournamentForPublic(child),
    );
  }

  return sanitized;
}
