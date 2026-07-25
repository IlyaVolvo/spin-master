import { sanitizeTournamentForPublic } from '../../src/utils/publicTournamentSanitize';

describe('sanitizeTournamentForPublic', () => {
  it('strips sensitive member fields and registrations', () => {
    const sanitized = sanitizeTournamentForPublic({
      id: 1,
      name: 'Open',
      registrations: [{ id: 9 }],
      correctionEligibility: { canCorrect: true },
      participants: [
        {
          memberId: 5,
          member: {
            id: 5,
            firstName: 'Ada',
            lastName: 'Lovelace',
            birthDate: null,
            isActive: true,
            rating: 1500,
            gender: 'FEMALE',
            email: 'ada@example.com',
            phone: '555',
            password: 'secret',
            scorePin: '1234',
            qrTokenHash: 'hash',
          },
        },
      ],
      childTournaments: [
        {
          id: 2,
          participants: [
            {
              memberId: 6,
              member: {
                id: 6,
                firstName: 'Alan',
                lastName: 'Turing',
                email: 'alan@example.com',
                password: 'secret',
                scorePin: '9999',
                rating: 1600,
                isActive: true,
                birthDate: null,
              },
            },
          ],
        },
      ],
    });

    expect(sanitized.registrations).toBeUndefined();
    expect(sanitized.correctionEligibility).toBeUndefined();
    expect(sanitized.participants[0].member).toEqual({
      id: 5,
      firstName: 'Ada',
      lastName: 'Lovelace',
      birthDate: null,
      isActive: true,
      rating: 1500,
      gender: 'FEMALE',
    });
    expect(sanitized.childTournaments[0].participants[0].member.email).toBeUndefined();
    expect(sanitized.childTournaments[0].participants[0].member.password).toBeUndefined();
    expect(sanitized.childTournaments[0].participants[0].member.scorePin).toBeUndefined();
  });
});
