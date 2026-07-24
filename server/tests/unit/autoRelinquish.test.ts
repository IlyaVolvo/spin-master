import {
  memberHasElevatedRoles,
  resolveAutoRelinquishPrivileges,
  shouldAutoEnterKioskMode,
} from '../../src/utils/autoRelinquish';

jest.mock('../../src/services/systemConfigService', () => ({
  getAuthPolicyConfig: () => ({
    autoRelinquishPrivileges: false,
    autoRelinquishIdleMinutes: 5,
  }),
}));

describe('autoRelinquish helpers', () => {
  it('detects elevated roles', () => {
    expect(memberHasElevatedRoles(['PLAYER'])).toBe(false);
    expect(memberHasElevatedRoles(['PLAYER', 'ORGANIZER'])).toBe(true);
    expect(memberHasElevatedRoles(['admin'])).toBe(true);
  });

  it('resolves override over club default', () => {
    expect(resolveAutoRelinquishPrivileges(null)).toBe(false);
    expect(resolveAutoRelinquishPrivileges(undefined)).toBe(false);
    expect(resolveAutoRelinquishPrivileges(true)).toBe(true);
    expect(resolveAutoRelinquishPrivileges(false)).toBe(false);
  });

  it('only auto-enters kiosk for elevated members with auto mode on', () => {
    expect(
      shouldAutoEnterKioskMode({ roles: ['PLAYER'], autoRelinquishPrivileges: true })
    ).toBe(false);
    expect(
      shouldAutoEnterKioskMode({ roles: ['ORGANIZER'], autoRelinquishPrivileges: true })
    ).toBe(true);
    expect(
      shouldAutoEnterKioskMode({ roles: ['ORGANIZER'], autoRelinquishPrivileges: null })
    ).toBe(false);
  });
});
