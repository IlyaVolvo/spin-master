import { describe, expect, it } from '@jest/globals';
import {
  appendClockForUniqueness,
  ensureUniqueTournamentName,
  formatClockHhMm,
} from '../../src/utils/tournamentNameUniqueness';

describe('tournamentNameUniqueness', () => {
  const now = new Date(2026, 6, 22, 14, 5, 9); // local Jul 22 2026 14:05:09

  it('formats HH:MM with zero padding', () => {
    expect(formatClockHhMm(now)).toBe('14:05');
  });

  it('appends clock time to the base name', () => {
    expect(appendClockForUniqueness('Tournament 7/22/2026', now)).toBe('Tournament 7/22/2026 14:05');
  });

  it('returns the base name when it is unused', async () => {
    const name = await ensureUniqueTournamentName(async () => false, 'Tournament 7/22/2026', { now });
    expect(name).toBe('Tournament 7/22/2026');
  });

  it('appends HH:MM when the base name is already used', async () => {
    const existing = new Set(['Tournament 7/22/2026']);
    const name = await ensureUniqueTournamentName(
      async (n) => existing.has(n),
      'Tournament 7/22/2026',
      { now },
    );
    expect(name).toBe('Tournament 7/22/2026 14:05');
  });

  it('falls back to HH:MM:SS when HH:MM is also used', async () => {
    const existing = new Set(['Tournament 7/22/2026', 'Tournament 7/22/2026 14:05']);
    const name = await ensureUniqueTournamentName(
      async (n) => existing.has(n),
      'Tournament 7/22/2026',
      { now },
    );
    expect(name).toBe('Tournament 7/22/2026 14:05:09');
  });

  it('respects reserved names within a batch', async () => {
    const reserved = new Set<string>();
    const first = await ensureUniqueTournamentName(async () => false, 'Swiss Tournament 7/22/2026', {
      now,
      reserved,
    });
    const second = await ensureUniqueTournamentName(async () => false, 'Swiss Tournament 7/22/2026', {
      now,
      reserved,
    });
    expect(first).toBe('Swiss Tournament 7/22/2026');
    expect(second).toBe('Swiss Tournament 7/22/2026 14:05');
  });
});
