import { buildTournamentRegistrationLink } from '../../src/services/mailService';

describe('tournament registration mail service', () => {
  const previousClientUrl = process.env.CLIENT_URL;

  afterEach(() => {
    if (previousClientUrl === undefined) {
      delete process.env.CLIENT_URL;
    } else {
      process.env.CLIENT_URL = previousClientUrl;
    }
  });

  it('builds a one-click registration link using CLIENT_URL', () => {
    process.env.CLIENT_URL = 'https://club.example.com/';

    expect(buildTournamentRegistrationLink('abc 123')).toBe(
      'https://club.example.com/tournament-registration/abc%20123'
    );
  });
});
