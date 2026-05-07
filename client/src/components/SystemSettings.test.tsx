import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SystemSettings from './SystemSettings';

const mockConfig = {
  branding: { clubName: 'Initial Club' },
  authPolicy: { minimumPasswordLength: 6, passwordResetTokenTtlHours: 1 },
  preregistration: {
    defaultTournamentOffsetDays: 1,
    defaultTournamentTime: '18:00',
    registrationDeadlineOffsetMinutes: 30,
    cancelReasonPresets: ['Tournament cancelled by organizer'],
  },
  ratingValidation: {
    ratingInputMin: 0,
    ratingInputMax: 9999,
    suspiciousRatingMin: 800,
    suspiciousRatingMax: 2100,
  },
  tournamentRules: {
    roundRobin: { minPlayers: 3, maxPlayers: 32 },
    playoff: { minPlayers: 2, seedDivisor: 4 },
    swiss: { minPlayers: 6, pairByRating: true, maxRoundsDivisor: 2 },
    multiRoundRobins: { minPlayers: 6, minGroupSize: 3, minGroups: 2 },
    preliminary: {
      groupSizeMin: 3,
      groupSizeMax: 12,
      groupSizeDefault: 4,
      finalRoundRobinSizeDefault: 6,
      reservedFinalSpotsForAutoQualified: 6,
    },
    matchScore: { min: 0, max: 10, allowEqualScores: false },
  },
  clientRuntime: {
    tournamentsListCacheTtlMs: 30000,
    socketReconnectionDelayMs: 1000,
    socketReconnectionAttempts: 5,
  },
};

const loadAdminSystemConfig = vi.fn();
const saveAdminSystemConfig = vi.fn();

vi.mock('../utils/auth', () => ({
  isAdmin: () => true,
}));

vi.mock('../utils/systemConfig', () => ({
  loadAdminSystemConfig: () => loadAdminSystemConfig(),
  saveAdminSystemConfig: (config: unknown) => saveAdminSystemConfig(config),
}));

describe('SystemSettings', () => {
  it('loads admin settings and saves edited values', async () => {
    loadAdminSystemConfig.mockResolvedValue(structuredClone(mockConfig));
    saveAdminSystemConfig.mockImplementation(async (config) => config);

    render(<SystemSettings />);

    const clubName = await screen.findByDisplayValue('Initial Club');
    fireEvent.change(clubName, { target: { value: 'Updated Club' } });
    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(saveAdminSystemConfig).toHaveBeenCalled();
    });
    expect(saveAdminSystemConfig.mock.calls[0][0].branding.clubName).toBe('Updated Club');
    expect(await screen.findByText('System settings saved')).toBeInTheDocument();
  });
});
