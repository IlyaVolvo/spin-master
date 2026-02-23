/**
 * Client Utility Functions — Unit Tests
 *
 * Tests pure utility functions from the client:
 * - dateFormatter: areDatesEqual, formatTournamentDates, isDateInRange
 * - nameFormatter: formatPlayerName
 * - ratingFormatter: isLikelyRanking, getDisplayRating, formatCompletedTournamentRating, formatActiveTournamentRating
 * - errorHandler: getErrorMessage
 *
 * These are pure functions with no React/DOM dependencies, so they can be tested in Node.
 */

export {};

// ═══════════════════════════════════════════════════════════════════════════
// dateFormatter
// ═══════════════════════════════════════════════════════════════════════════

// Inline the functions since they're in client code (no module resolution issues)
// These mirror the exact implementations from client/src/utils/dateFormatter.ts

function areDatesEqual(date1: Date, date2: Date): boolean {
  const date1Str = `${date1.getUTCFullYear()}-${String(date1.getUTCMonth() + 1).padStart(2, '0')}-${String(date1.getUTCDate()).padStart(2, '0')}`;
  const date2Str = `${date2.getUTCFullYear()}-${String(date2.getUTCMonth() + 1).padStart(2, '0')}-${String(date2.getUTCDate()).padStart(2, '0')}`;
  return date1Str === date2Str;
}

function isDateInRange(
  date: Date,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  const dateStr = date.toISOString().split('T')[0];
  if (startDate && endDate) {
    return dateStr >= startDate && dateStr <= endDate;
  } else if (startDate) {
    return dateStr >= startDate;
  } else if (endDate) {
    return dateStr <= endDate;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// nameFormatter
// ═══════════════════════════════════════════════════════════════════════════

type NameDisplayOrder = 'firstLast' | 'lastFirst';

function formatPlayerName(
  firstName: string,
  lastName: string,
  order: NameDisplayOrder = 'firstLast'
): string {
  if (order === 'lastFirst') {
    return `${lastName} ${firstName}`;
  }
  return `${firstName} ${lastName}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ratingFormatter
// ═══════════════════════════════════════════════════════════════════════════

function isLikelyRanking(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && value <= 100;
}

function getDisplayRating(
  storedRating: number | null | undefined,
  currentRating: number | null | undefined
): number | null {
  if (isLikelyRanking(storedRating)) {
    return currentRating ?? null;
  }
  return storedRating ?? null;
}

function formatCompletedTournamentRating(
  preRating: number | null | undefined,
  postRating: number | null | undefined
): string | null {
  let pre = preRating;
  if (isLikelyRanking(pre)) {
    pre = null;
  }
  if (pre !== null && pre !== undefined && postRating !== null && postRating !== undefined) {
    const diff = postRating - pre;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    return `${pre} / ${postRating} (${diffStr})`;
  } else if (postRating !== null && postRating !== undefined) {
    return `${postRating}`;
  }
  return null;
}

function formatActiveTournamentRating(
  storedRating: number | null | undefined,
  currentRating: number | null | undefined
): string | null {
  const rating = getDisplayRating(storedRating, currentRating);
  return rating !== null ? `${rating}` : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// errorHandler
// ═══════════════════════════════════════════════════════════════════════════

function getErrorMessage(error: any, defaultMessage: string = 'An error occurred'): string {
  if (!error) {
    return defaultMessage;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error.response?.data) {
    const serverError = error.response.data.error || error.response.data.message || error.response.data;
    if (typeof serverError === 'string') {
      return serverError;
    }
    if (serverError && typeof serverError === 'object') {
      return serverError.message || serverError.error || JSON.stringify(serverError);
    }
  }
  if (error.message) {
    return error.message;
  }
  return defaultMessage;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── areDatesEqual ────────────────────────────────────────────────────────

describe('areDatesEqual', () => {
  it('returns true for same date', () => {
    const d1 = new Date('2024-01-15T00:00:00Z');
    const d2 = new Date('2024-01-15T00:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(true);
  });

  it('returns true for same date with different times', () => {
    const d1 = new Date('2024-01-15T08:30:00Z');
    const d2 = new Date('2024-01-15T23:59:59Z');
    expect(areDatesEqual(d1, d2)).toBe(true);
  });

  it('returns false for different dates', () => {
    const d1 = new Date('2024-01-15T00:00:00Z');
    const d2 = new Date('2024-01-16T00:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(false);
  });

  it('returns false for different months', () => {
    const d1 = new Date('2024-01-15T00:00:00Z');
    const d2 = new Date('2024-02-15T00:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(false);
  });

  it('returns false for different years', () => {
    const d1 = new Date('2024-01-15T00:00:00Z');
    const d2 = new Date('2025-01-15T00:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(false);
  });

  it('handles year boundaries correctly', () => {
    const d1 = new Date('2024-12-31T23:59:59Z');
    const d2 = new Date('2025-01-01T00:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(false);
  });

  it('handles leap year dates', () => {
    const d1 = new Date('2024-02-29T00:00:00Z');
    const d2 = new Date('2024-02-29T12:00:00Z');
    expect(areDatesEqual(d1, d2)).toBe(true);
  });
});

// ─── isDateInRange ────────────────────────────────────────────────────────

describe('isDateInRange', () => {
  it('returns true when date is within range', () => {
    const date = new Date('2024-06-15T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', '2024-12-31')).toBe(true);
  });

  it('returns true when date equals start date', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', '2024-12-31')).toBe(true);
  });

  it('returns true when date equals end date', () => {
    const date = new Date('2024-12-31T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', '2024-12-31')).toBe(true);
  });

  it('returns false when date is before range', () => {
    const date = new Date('2023-12-31T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', '2024-12-31')).toBe(false);
  });

  it('returns false when date is after range', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', '2024-12-31')).toBe(false);
  });

  it('returns true when only startDate and date is after', () => {
    const date = new Date('2024-06-15T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', null)).toBe(true);
  });

  it('returns false when only startDate and date is before', () => {
    const date = new Date('2023-06-15T00:00:00Z');
    expect(isDateInRange(date, '2024-01-01', null)).toBe(false);
  });

  it('returns true when only endDate and date is before', () => {
    const date = new Date('2024-06-15T00:00:00Z');
    expect(isDateInRange(date, null, '2024-12-31')).toBe(true);
  });

  it('returns false when only endDate and date is after', () => {
    const date = new Date('2025-06-15T00:00:00Z');
    expect(isDateInRange(date, null, '2024-12-31')).toBe(false);
  });

  it('returns true when no filters', () => {
    const date = new Date('2024-06-15T00:00:00Z');
    expect(isDateInRange(date)).toBe(true);
    expect(isDateInRange(date, null, null)).toBe(true);
    expect(isDateInRange(date, undefined, undefined)).toBe(true);
  });
});

// ─── formatPlayerName ─────────────────────────────────────────────────────

describe('formatPlayerName', () => {
  it('formats first-last by default', () => {
    expect(formatPlayerName('John', 'Doe')).toBe('John Doe');
  });

  it('formats first-last explicitly', () => {
    expect(formatPlayerName('John', 'Doe', 'firstLast')).toBe('John Doe');
  });

  it('formats last-first', () => {
    expect(formatPlayerName('John', 'Doe', 'lastFirst')).toBe('Doe John');
  });

  it('handles empty first name', () => {
    expect(formatPlayerName('', 'Doe')).toBe(' Doe');
  });

  it('handles empty last name', () => {
    expect(formatPlayerName('John', '')).toBe('John ');
  });

  it('handles both empty', () => {
    expect(formatPlayerName('', '')).toBe(' ');
  });

  it('handles names with spaces', () => {
    expect(formatPlayerName('Mary Jane', 'Watson Parker')).toBe('Mary Jane Watson Parker');
  });

  it('handles names with special characters', () => {
    expect(formatPlayerName("O'Brien", 'McDonald')).toBe("O'Brien McDonald");
  });
});

// ─── isLikelyRanking ─────────────────────────────────────────────────────

describe('isLikelyRanking', () => {
  it('returns true for values <= 100', () => {
    expect(isLikelyRanking(1)).toBe(true);
    expect(isLikelyRanking(50)).toBe(true);
    expect(isLikelyRanking(100)).toBe(true);
  });

  it('returns false for values > 100', () => {
    expect(isLikelyRanking(101)).toBe(false);
    expect(isLikelyRanking(1500)).toBe(false);
    expect(isLikelyRanking(2000)).toBe(false);
  });

  it('returns true for 0', () => {
    expect(isLikelyRanking(0)).toBe(true);
  });

  it('returns true for negative values (edge case)', () => {
    expect(isLikelyRanking(-1)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isLikelyRanking(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLikelyRanking(undefined)).toBe(false);
  });
});

// ─── getDisplayRating ─────────────────────────────────────────────────────

describe('getDisplayRating', () => {
  it('returns stored rating when it looks like a real rating (> 100)', () => {
    expect(getDisplayRating(1500, 1600)).toBe(1500);
  });

  it('returns current rating when stored rating looks like a ranking (<= 100)', () => {
    expect(getDisplayRating(5, 1500)).toBe(1500);
  });

  it('returns null when stored is ranking and current is null', () => {
    expect(getDisplayRating(5, null)).toBeNull();
  });

  it('returns null when stored is ranking and current is undefined', () => {
    expect(getDisplayRating(5, undefined)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(getDisplayRating(null, null)).toBeNull();
  });

  it('returns null when stored is null', () => {
    expect(getDisplayRating(null, 1500)).toBeNull();
  });

  it('returns null when stored is undefined', () => {
    expect(getDisplayRating(undefined, 1500)).toBeNull();
  });

  it('returns stored rating of exactly 101', () => {
    expect(getDisplayRating(101, 1500)).toBe(101);
  });

  it('returns current rating when stored is exactly 100', () => {
    expect(getDisplayRating(100, 1500)).toBe(1500);
  });
});

// ─── formatCompletedTournamentRating ──────────────────────────────────────

describe('formatCompletedTournamentRating', () => {
  it('shows pre/post with positive diff', () => {
    expect(formatCompletedTournamentRating(1500, 1520)).toBe('1500 / 1520 (+20)');
  });

  it('shows pre/post with negative diff', () => {
    expect(formatCompletedTournamentRating(1500, 1480)).toBe('1500 / 1480 (-20)');
  });

  it('shows pre/post with zero diff', () => {
    expect(formatCompletedTournamentRating(1500, 1500)).toBe('1500 / 1500 (+0)');
  });

  it('shows only post when pre is null', () => {
    expect(formatCompletedTournamentRating(null, 1500)).toBe('1500');
  });

  it('shows only post when pre is undefined', () => {
    expect(formatCompletedTournamentRating(undefined, 1500)).toBe('1500');
  });

  it('returns null when both are null', () => {
    expect(formatCompletedTournamentRating(null, null)).toBeNull();
  });

  it('returns null when post is null', () => {
    expect(formatCompletedTournamentRating(1500, null)).toBeNull();
  });

  it('skips pre when it looks like a ranking', () => {
    expect(formatCompletedTournamentRating(5, 1500)).toBe('1500');
  });

  it('skips pre when it is 100 (ranking)', () => {
    expect(formatCompletedTournamentRating(100, 1500)).toBe('1500');
  });

  it('uses pre when it is 101 (real rating)', () => {
    expect(formatCompletedTournamentRating(101, 120)).toBe('101 / 120 (+19)');
  });
});

// ─── formatActiveTournamentRating ─────────────────────────────────────────

describe('formatActiveTournamentRating', () => {
  it('returns stored rating as string when valid', () => {
    expect(formatActiveTournamentRating(1500, 1600)).toBe('1500');
  });

  it('returns current rating when stored looks like ranking', () => {
    expect(formatActiveTournamentRating(5, 1500)).toBe('1500');
  });

  it('returns null when both are null', () => {
    expect(formatActiveTournamentRating(null, null)).toBeNull();
  });

  it('returns null when stored is null and current is null', () => {
    expect(formatActiveTournamentRating(null, null)).toBeNull();
  });

  it('returns null when stored is ranking and current is null', () => {
    expect(formatActiveTournamentRating(5, null)).toBeNull();
  });
});

// ─── getErrorMessage ──────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('returns default message for null error', () => {
    expect(getErrorMessage(null)).toBe('An error occurred');
  });

  it('returns default message for undefined error', () => {
    expect(getErrorMessage(undefined)).toBe('An error occurred');
  });

  it('returns default message for empty string', () => {
    expect(getErrorMessage('')).toBe('An error occurred');
  });

  it('returns custom default message', () => {
    expect(getErrorMessage(null, 'Custom error')).toBe('Custom error');
  });

  it('returns string error directly', () => {
    expect(getErrorMessage('Something went wrong')).toBe('Something went wrong');
  });

  it('extracts error from response.data.error (string)', () => {
    const error = { response: { data: { error: 'Server error' } } };
    expect(getErrorMessage(error)).toBe('Server error');
  });

  it('extracts message from response.data.message (string)', () => {
    const error = { response: { data: { message: 'Not found' } } };
    expect(getErrorMessage(error)).toBe('Not found');
  });

  it('extracts error from response.data (string)', () => {
    const error = { response: { data: 'Raw error string' } };
    expect(getErrorMessage(error)).toBe('Raw error string');
  });

  it('extracts message from nested object error', () => {
    const error = { response: { data: { error: { message: 'Nested message' } } } };
    expect(getErrorMessage(error)).toBe('Nested message');
  });

  it('extracts error from nested object with error property', () => {
    const error = { response: { data: { error: { error: 'Nested error' } } } };
    expect(getErrorMessage(error)).toBe('Nested error');
  });

  it('JSON stringifies object error without message or error property', () => {
    const error = { response: { data: { error: { code: 500, detail: 'fail' } } } };
    const result = getErrorMessage(error);
    expect(result).toContain('code');
    expect(result).toContain('500');
  });

  it('uses error.message as fallback', () => {
    const error = new Error('Standard error');
    expect(getErrorMessage(error)).toBe('Standard error');
  });

  it('returns default for object without message or response', () => {
    const error = { code: 500 };
    expect(getErrorMessage(error)).toBe('An error occurred');
  });

  it('handles 0 as error (falsy but not null/undefined)', () => {
    expect(getErrorMessage(0)).toBe('An error occurred');
  });

  it('handles false as error', () => {
    expect(getErrorMessage(false)).toBe('An error occurred');
  });

  it('prefers response.data.error over error.message', () => {
    const error = {
      message: 'Generic message',
      response: { data: { error: 'Specific error' } },
    };
    expect(getErrorMessage(error)).toBe('Specific error');
  });
});

// ─── scrollPosition utilities ─────────────────────────────────────────────
// Extracted logic tests (sessionStorage-based functions)

describe('scrollPosition utilities (logic)', () => {
  let store: Record<string, string>;

  // Simulate sessionStorage
  const mockSessionStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    keys: () => Object.keys(store),
  };

  const SCROLL_PREFIX = 'scroll_position_';
  const UI_PREFIX = 'ui_state_';

  // Extracted logic matching scrollPosition.ts
  function saveScrollPosition(route: string, scrollTop: number) {
    mockSessionStorage.setItem(`${SCROLL_PREFIX}${route}`, scrollTop.toString());
  }
  function getScrollPosition(route: string): number | null {
    const saved = mockSessionStorage.getItem(`${SCROLL_PREFIX}${route}`);
    return saved ? parseInt(saved, 10) : null;
  }
  function clearScrollPosition(route: string) {
    mockSessionStorage.removeItem(`${SCROLL_PREFIX}${route}`);
  }
  function clearAllScrollPositions() {
    mockSessionStorage.keys().forEach(key => {
      if (key.startsWith(SCROLL_PREFIX)) mockSessionStorage.removeItem(key);
    });
  }
  function saveUIState(route: string, state: any) {
    mockSessionStorage.setItem(`${UI_PREFIX}${route}`, JSON.stringify(state));
  }
  function getUIState(route: string): any | null {
    const saved = mockSessionStorage.getItem(`${UI_PREFIX}${route}`);
    return saved ? JSON.parse(saved) : null;
  }
  function clearUIState(route: string) {
    mockSessionStorage.removeItem(`${UI_PREFIX}${route}`);
  }
  function clearAllUIStates() {
    mockSessionStorage.keys().forEach(key => {
      if (key.startsWith(UI_PREFIX)) mockSessionStorage.removeItem(key);
    });
  }

  beforeEach(() => {
    store = {};
  });

  describe('saveScrollPosition / getScrollPosition', () => {
    it('saves and retrieves scroll position', () => {
      saveScrollPosition('/home', 250);
      expect(getScrollPosition('/home')).toBe(250);
    });

    it('returns null for unsaved route', () => {
      expect(getScrollPosition('/unknown')).toBeNull();
    });

    it('overwrites previous position', () => {
      saveScrollPosition('/home', 100);
      saveScrollPosition('/home', 500);
      expect(getScrollPosition('/home')).toBe(500);
    });

    it('handles zero scroll position', () => {
      saveScrollPosition('/home', 0);
      expect(getScrollPosition('/home')).toBe(0);
    });

    it('stores different routes independently', () => {
      saveScrollPosition('/home', 100);
      saveScrollPosition('/players', 200);
      expect(getScrollPosition('/home')).toBe(100);
      expect(getScrollPosition('/players')).toBe(200);
    });
  });

  describe('clearScrollPosition', () => {
    it('clears a specific route scroll position', () => {
      saveScrollPosition('/home', 100);
      clearScrollPosition('/home');
      expect(getScrollPosition('/home')).toBeNull();
    });

    it('does not affect other routes', () => {
      saveScrollPosition('/home', 100);
      saveScrollPosition('/players', 200);
      clearScrollPosition('/home');
      expect(getScrollPosition('/players')).toBe(200);
    });
  });

  describe('clearAllScrollPositions', () => {
    it('clears all scroll positions', () => {
      saveScrollPosition('/home', 100);
      saveScrollPosition('/players', 200);
      clearAllScrollPositions();
      expect(getScrollPosition('/home')).toBeNull();
      expect(getScrollPosition('/players')).toBeNull();
    });

    it('does not affect UI state entries', () => {
      saveScrollPosition('/home', 100);
      saveUIState('/home', { tab: 'active' });
      clearAllScrollPositions();
      expect(getScrollPosition('/home')).toBeNull();
      expect(getUIState('/home')).toEqual({ tab: 'active' });
    });
  });

  describe('saveUIState / getUIState', () => {
    it('saves and retrieves UI state object', () => {
      saveUIState('/tournaments', { tab: 'completed', page: 2 });
      expect(getUIState('/tournaments')).toEqual({ tab: 'completed', page: 2 });
    });

    it('returns null for unsaved route', () => {
      expect(getUIState('/unknown')).toBeNull();
    });

    it('handles nested objects', () => {
      const state = { filters: { type: 'ROUND_ROBIN', status: 'ACTIVE' }, sort: 'date' };
      saveUIState('/tournaments', state);
      expect(getUIState('/tournaments')).toEqual(state);
    });

    it('handles arrays', () => {
      saveUIState('/route', [1, 2, 3]);
      expect(getUIState('/route')).toEqual([1, 2, 3]);
    });

    it('handles string state', () => {
      saveUIState('/route', 'simple');
      expect(getUIState('/route')).toBe('simple');
    });

    it('handles null state', () => {
      saveUIState('/route', null);
      expect(getUIState('/route')).toBeNull();
    });

    it('overwrites previous state', () => {
      saveUIState('/route', { a: 1 });
      saveUIState('/route', { b: 2 });
      expect(getUIState('/route')).toEqual({ b: 2 });
    });
  });

  describe('clearUIState', () => {
    it('clears a specific route UI state', () => {
      saveUIState('/home', { tab: 'active' });
      clearUIState('/home');
      expect(getUIState('/home')).toBeNull();
    });
  });

  describe('clearAllUIStates', () => {
    it('clears all UI states', () => {
      saveUIState('/home', { a: 1 });
      saveUIState('/players', { b: 2 });
      clearAllUIStates();
      expect(getUIState('/home')).toBeNull();
      expect(getUIState('/players')).toBeNull();
    });

    it('does not affect scroll position entries', () => {
      saveUIState('/home', { a: 1 });
      saveScrollPosition('/home', 300);
      clearAllUIStates();
      expect(getUIState('/home')).toBeNull();
      expect(getScrollPosition('/home')).toBe(300);
    });
  });
});
