import { describe, expect, it } from 'vitest';
import { formatMoney } from './formatMoney';
import { buildFinalizeSuccessMessage } from './finalizeRegistrationMessages';

describe('formatMoney', () => {
  it('formats cents as USD', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1000)).toBe('$10.00');
    expect(formatMoney(1250)).toBe('$12.50');
  });

  it('clamps negative cents to zero', () => {
    expect(formatMoney(-50)).toBe('$0.00');
  });
});

describe('buildFinalizeSuccessMessage', () => {
  it('returns base message when no warnings', () => {
    expect(buildFinalizeSuccessMessage('Tournament created.', {})).toBe('Tournament created.');
    expect(buildFinalizeSuccessMessage('Tournament created.', { warnings: [] })).toBe(
      'Tournament created.',
    );
  });

  it('appends string warnings', () => {
    expect(
      buildFinalizeSuccessMessage('Tournament created.', {
        warnings: ['Event fee was unpaid for 1 player.', '', 12],
      }),
    ).toBe('Tournament created. Event fee was unpaid for 1 player.');
  });
});
