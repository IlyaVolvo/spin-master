/**
 * Pure validation for paid-event fields on PRE_REGISTRATION create/update.
 * Returns an error message or null when valid.
 */
export function validatePaidEventFields(params: {
  isEvent: boolean;
  name?: unknown;
  eventPriceCents: number | null;
  eventCheckInLeadMinutes?: number | null;
  eventCheckInCloseMinutesBeforeStart?: number | null;
}): string | null {
  if (!params.isEvent) {
    if (params.eventCheckInLeadMinutes != null && params.eventCheckInLeadMinutes < 0) {
      return 'Event check-in lead minutes must be >= 0';
    }
    if (
      params.eventCheckInCloseMinutesBeforeStart != null &&
      params.eventCheckInCloseMinutesBeforeStart < 0
    ) {
      return 'Event check-in close minutes must be >= 0';
    }
    return null;
  }

  if (params.eventPriceCents == null || params.eventPriceCents < 0) {
    return 'Event price (cents) is required for paid events';
  }
  if (!(typeof params.name === 'string' && params.name.trim())) {
    return 'Event name is required for paid events';
  }
  if (params.eventCheckInLeadMinutes != null && params.eventCheckInLeadMinutes < 0) {
    return 'Event check-in lead minutes must be >= 0';
  }
  if (
    params.eventCheckInCloseMinutesBeforeStart != null &&
    params.eventCheckInCloseMinutesBeforeStart < 0
  ) {
    return 'Event check-in close minutes must be >= 0';
  }
  return null;
}

/** Resolve cents for create: event uses body or default; non-event is null. */
export function resolveEventPriceCents(params: {
  isEvent: boolean;
  eventPriceCentsRaw: number | null;
  defaultEventPriceCents: number;
}): number | null {
  if (!params.isEvent) return null;
  return params.eventPriceCentsRaw ?? params.defaultEventPriceCents;
}
