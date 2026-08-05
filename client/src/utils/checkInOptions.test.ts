import { describe, expect, it } from 'vitest';
import {
  type CheckInOption,
  actionableCheckInOptions,
  checkInExecuteIntent,
  defaultCheckInOption,
  formatCheckInOptionLabel,
  formatOpensAtLabel,
  shouldShowCheckInSelector,
} from './checkInOptions';

function option(overrides: Partial<CheckInOption> & Pick<CheckInOption, 'id' | 'kind'>): CheckInOption {
  return {
    label: overrides.label || overrides.id,
    actionable: overrides.actionable ?? true,
    prepaid: overrides.prepaid ?? false,
    ...overrides,
  };
}

describe('checkInOptions helpers', () => {
  it('formats opens-at as local at hh:mm', () => {
    const label = formatOpensAtLabel('2026-08-05T17:00:00.000Z');
    expect(label).toMatch(/^at /);
  });

  it('appends at hh:mm for disabled upcoming events', () => {
    const label = formatCheckInOptionLabel(
      option({
        id: 'event:1',
        kind: 'event_check_in',
        name: 'Club Championship',
        label: 'Event: Club Championship',
        actionable: false,
        disabledReason: 'window_not_open',
        opensAt: '2026-08-05T17:00:00.000Z',
      }),
    );
    expect(label).toMatch(/^Club Championship — at /);
  });

  it('defaults to first actionable option', () => {
    const options = [
      option({
        id: 'event:1',
        kind: 'event_check_in',
        actionable: false,
        prepaid: true,
      }),
      option({ id: 'regular', kind: 'regular', actionable: true }),
      option({ id: 'buy_plan', kind: 'buy_plan', actionable: true }),
    ];
    expect(defaultCheckInOption(options)?.id).toBe('regular');
    expect(actionableCheckInOptions(options).map((o) => o.id)).toEqual(['regular', 'buy_plan']);
  });

  it('shows selector whenever any option is available', () => {
    expect(shouldShowCheckInSelector([])).toBe(false);
    expect(shouldShowCheckInSelector([option({ id: 'regular', kind: 'regular' })])).toBe(true);
    expect(
      shouldShowCheckInSelector([
        option({ id: 'event:1', kind: 'event_check_in' }),
        option({ id: 'regular', kind: 'regular' }),
      ]),
    ).toBe(true);
  });

  it('maps execute intents', () => {
    expect(checkInExecuteIntent(option({ id: 'regular', kind: 'regular' }))).toEqual({
      type: 'regular',
    });
    expect(checkInExecuteIntent(option({ id: 'buy_plan', kind: 'buy_plan' }))).toEqual({
      type: 'buy_plan',
    });
    expect(
      checkInExecuteIntent(
        option({
          id: 'event:35',
          kind: 'event_check_in',
          tournamentId: 35,
        }),
      ),
    ).toEqual({ type: 'event_check_in', tournamentId: 35 });
    expect(
      checkInExecuteIntent(
        option({
          id: 'event:35',
          kind: 'register_and_pay',
          tournamentId: 35,
        }),
      ),
    ).toEqual({ type: 'register_and_pay', tournamentId: 35 });
    expect(
      checkInExecuteIntent(
        option({
          id: 'event:35',
          kind: 'event_check_in',
          tournamentId: 35,
          actionable: false,
        }),
      ),
    ).toBeNull();
  });
});
