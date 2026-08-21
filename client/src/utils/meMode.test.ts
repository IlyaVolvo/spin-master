import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FULL_APP_MIN_WIDTH_PX,
  ME_COMPACT_MAX_PX,
  clearPreferFullApp,
  defaultAuthenticatedPath,
  getPreferFullApp,
  isCompactViewport,
  isPortraitViewport,
  memberHasPlayerRole,
  requiresLandscapeForFullApp,
  setPreferFullApp,
  shouldDefaultToMe,
  shouldShowMeReturnLink,
} from './meMode';
import type { Member } from './auth';

function member(partial: Partial<Member> & Pick<Member, 'id' | 'roles'>): Member {
  return {
    email: 'a@b.co',
    firstName: 'A',
    lastName: 'B',
    ...partial,
  };
}

describe('meMode', () => {
  afterEach(() => {
    clearPreferFullApp();
    vi.unstubAllGlobals();
  });

  it('isCompactViewport uses the narrower side', () => {
    expect(isCompactViewport(430, 932)).toBe(true);
    expect(isCompactViewport(932, 430)).toBe(true);
    expect(isCompactViewport(820, 1180)).toBe(false);
    expect(isCompactViewport(744, 1133)).toBe(true);
    expect(isCompactViewport(ME_COMPACT_MAX_PX, 1024)).toBe(true);
    expect(isCompactViewport(ME_COMPACT_MAX_PX + 1, 1024)).toBe(false);
  });

  it('memberHasPlayerRole is case-insensitive', () => {
    expect(memberHasPlayerRole(member({ id: 1, roles: ['Player'] }))).toBe(true);
    expect(memberHasPlayerRole(member({ id: 1, roles: ['ADMIN', 'PLAYER'] }))).toBe(true);
    expect(memberHasPlayerRole(member({ id: 1, roles: ['ADMIN'] }))).toBe(false);
    expect(memberHasPlayerRole(null)).toBe(false);
  });

  it('preferFullApp is session-scoped', () => {
    expect(getPreferFullApp()).toBe(false);
    setPreferFullApp(true);
    expect(getPreferFullApp()).toBe(true);
    clearPreferFullApp();
    expect(getPreferFullApp()).toBe(false);
  });

  it('shouldDefaultToMe requires compact Player without kiosk or preferFull', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    // re-read via explicit dims in isCompactViewport — shouldDefaultToMe uses window
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });

    const player = member({ id: 1, roles: ['PLAYER'] });
    expect(shouldDefaultToMe(player)).toBe(true);

    setPreferFullApp(true);
    expect(shouldDefaultToMe(player)).toBe(false);
    clearPreferFullApp();

    expect(shouldDefaultToMe(member({ id: 2, roles: ['ADMIN'] }))).toBe(false);
    expect(shouldDefaultToMe(member({ id: 3, roles: ['PLAYER'], kioskMode: true }))).toBe(false);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    expect(shouldDefaultToMe(player)).toBe(false);
  });

  it('shouldShowMeReturnLink for compact Player even with preferFull', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    setPreferFullApp(true);
    expect(shouldShowMeReturnLink(member({ id: 1, roles: ['PLAYER'] }))).toBe(true);
    expect(shouldShowMeReturnLink(member({ id: 2, roles: ['ADMIN'] }))).toBe(false);
  });

  it('requiresLandscapeForFullApp for portrait compact or narrow width', () => {
    expect(isPortraitViewport(390, 844)).toBe(true);
    expect(isPortraitViewport(844, 390)).toBe(false);
    expect(requiresLandscapeForFullApp(390, 844)).toBe(true);
    expect(requiresLandscapeForFullApp(844, 390)).toBe(false);
    expect(requiresLandscapeForFullApp(FULL_APP_MIN_WIDTH_PX - 1, 500)).toBe(true);
    expect(requiresLandscapeForFullApp(FULL_APP_MIN_WIDTH_PX, 500)).toBe(false);
    expect(requiresLandscapeForFullApp(1280, 800)).toBe(false);
  });
});
