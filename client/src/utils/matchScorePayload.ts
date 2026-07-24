import { getMember, isOrganizer, isKioskMode } from './auth';

export type InvalidScorePins = { member1: boolean; member2: boolean };

/** Attach participant PINs when in kiosk mode (server validates). */
export function attachScorePinsIfNeeded(
  apiData: Record<string, unknown>,
  pins: { member1Pin?: string; member2Pin?: string } | undefined
): void {
  if (!isKioskMode()) return;
  if (pins?.member1Pin?.trim()) {
    apiData.member1Pin = pins.member1Pin.trim();
  }
  if (pins?.member2Pin?.trim()) {
    apiData.member2Pin = pins.member2Pin.trim();
  }
}

/** Organizers or kiosk may edit any match; players may edit only matches they are in. */
export function canOpenTournamentMatchEditor(member1Id: number, member2Id: number | null): boolean {
  if (isOrganizer() || isKioskMode()) return true;
  const me = getMember()?.id;
  if (!me) return false;
  if (member2Id == null || member2Id === 0) return false;
  return me === member1Id || me === member2Id;
}

/** Show PIN fields only in kiosk mode for two-player matches. */
export function shouldShowScorePinsForMatchEdit(editing: {
  member1Id: number;
  member2Id: number;
}): boolean {
  if (!isKioskMode()) return false;
  if (editing.member2Id == null || editing.member2Id === 0) return false;
  return true;
}

function isInvalidScorePins(value: unknown): value is InvalidScorePins {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.member1 === 'boolean' && typeof v.member2 === 'boolean';
}

/** True when an API/error message is a score-PIN auth failure (shown on fields, not as a page banner). */
export function isScorePinAuthErrorMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  return /incorrect pin|invalid (participant|player) pin/i.test(message);
}

/** Error that carries which participant PIN fields failed (never invents both sides). */
export class ScorePinAuthError extends Error {
  readonly invalidPins: InvalidScorePins;

  constructor(message: string, invalidPins: InvalidScorePins) {
    super(message);
    this.name = 'ScorePinAuthError';
    this.invalidPins = {
      member1: invalidPins.member1 === true,
      member2: invalidPins.member2 === true,
    };
  }
}

/** Extract which participant PINs failed — only from explicit server/client flags, never from message alone. */
export function parseInvalidScorePinsFromError(err: unknown): InvalidScorePins | null {
  if (!err || typeof err !== 'object') return null;

  if (err instanceof ScorePinAuthError) {
    return err.invalidPins;
  }

  const anyErr = err as {
    invalidPins?: unknown;
    response?: { data?: { invalidPins?: unknown } };
    cause?: unknown;
  };

  if (isInvalidScorePins(anyErr.invalidPins)) {
    return {
      member1: anyErr.invalidPins.member1 === true,
      member2: anyErr.invalidPins.member2 === true,
    };
  }

  const dataPins = anyErr.response?.data?.invalidPins;
  if (isInvalidScorePins(dataPins)) {
    return {
      member1: dataPins.member1 === true,
      member2: dataPins.member2 === true,
    };
  }

  if (anyErr.cause) {
    return parseInvalidScorePinsFromError(anyErr.cause);
  }

  return null;
}

export function enrichErrorWithInvalidScorePins(err: unknown, fallbackMessage: string): Error {
  const data = (err as { response?: { data?: { error?: string; invalidPins?: unknown } } })?.response?.data;
  const message =
    (typeof data?.error === 'string' && data.error) ||
    (err instanceof Error && err.message) ||
    fallbackMessage;

  const pinsFromBody = isInvalidScorePins(data?.invalidPins)
    ? {
        member1: data!.invalidPins!.member1 === true,
        member2: data!.invalidPins!.member2 === true,
      }
    : null;
  const pins = pinsFromBody || parseInvalidScorePinsFromError(err);

  if (pins && (pins.member1 || pins.member2)) {
    return new ScorePinAuthError(message, pins);
  }

  return new Error(message);
}
