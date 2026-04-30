export const MATCH_RESULT_ALREADY_ENTERED_MESSAGE =
  'A result for this match has already been entered. Refresh the tournament to see the recorded score.';

export function isDuplicateScoreMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already been entered') ||
    normalized.includes('already has a result') ||
    normalized.includes('score was entered') ||
    normalized.includes('duplicate') ||
    normalized.includes('unique constraint')
  );
}

export function normalizeDuplicateScoreMessage(message: string): string {
  if (!isDuplicateScoreMessage(message)) {
    return message;
  }
  if (message.toLowerCase().includes('already has a result')) {
    return MATCH_RESULT_ALREADY_ENTERED_MESSAGE;
  }
  return message || MATCH_RESULT_ALREADY_ENTERED_MESSAGE;
}
