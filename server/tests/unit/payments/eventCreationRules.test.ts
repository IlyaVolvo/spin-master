import {
  resolveEventPriceCents,
  validatePaidEventFields,
} from '../../../src/payments/eventCreationRules';

describe('validatePaidEventFields', () => {
  it('allows non-events without name/price', () => {
    expect(
      validatePaidEventFields({
        isEvent: false,
        name: '',
        eventPriceCents: null,
      }),
    ).toBeNull();
  });

  it('requires name and non-negative price for events', () => {
    expect(
      validatePaidEventFields({
        isEvent: true,
        name: '  ',
        eventPriceCents: 1000,
      }),
    ).toMatch(/Event name is required/);

    expect(
      validatePaidEventFields({
        isEvent: true,
        name: 'Club Championship',
        eventPriceCents: null,
      }),
    ).toMatch(/Event price/);

    expect(
      validatePaidEventFields({
        isEvent: true,
        name: 'Club Championship',
        eventPriceCents: -1,
      }),
    ).toMatch(/Event price/);

    expect(
      validatePaidEventFields({
        isEvent: true,
        name: 'Club Championship',
        eventPriceCents: 0,
      }),
    ).toBeNull();

    expect(
      validatePaidEventFields({
        isEvent: true,
        name: 'Club Championship',
        eventPriceCents: 1000,
        eventCheckInLeadMinutes: 120,
        eventCheckInCloseMinutesBeforeStart: 0,
      }),
    ).toBeNull();
  });

  it('rejects negative check-in window overrides', () => {
    expect(
      validatePaidEventFields({
        isEvent: true,
        name: 'Club Championship',
        eventPriceCents: 1000,
        eventCheckInLeadMinutes: -5,
      }),
    ).toMatch(/lead minutes/);

    expect(
      validatePaidEventFields({
        isEvent: false,
        eventPriceCents: null,
        eventCheckInCloseMinutesBeforeStart: -1,
      }),
    ).toMatch(/close minutes/);
  });
});

describe('resolveEventPriceCents', () => {
  it('returns null for non-events', () => {
    expect(
      resolveEventPriceCents({
        isEvent: false,
        eventPriceCentsRaw: 500,
        defaultEventPriceCents: 1000,
      }),
    ).toBeNull();
  });

  it('uses body price or system default for events', () => {
    expect(
      resolveEventPriceCents({
        isEvent: true,
        eventPriceCentsRaw: 2500,
        defaultEventPriceCents: 1000,
      }),
    ).toBe(2500);
    expect(
      resolveEventPriceCents({
        isEvent: true,
        eventPriceCentsRaw: null,
        defaultEventPriceCents: 1000,
      }),
    ).toBe(1000);
  });
});
