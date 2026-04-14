import React from 'react';

/** Formats a rating delta for display (+5, -3, 0, —). */
export function formatRatingDelta(change: number | null | undefined): string {
  if (change === null || change === undefined) return '—';
  if (change === 0) return '0';
  return change > 0 ? `+${change}` : `${change}`;
}

/**
 * One cell: resulting rating plus optional ± change (no separate before/after columns).
 * Uses `ratingBefore` when `ratingChange` is missing (legacy rows or API inference).
 */
export function RatingWithChangeCell(props: {
  rating: number | null;
  ratingChange: number | null | undefined;
  ratingBefore?: number | null;
}): React.ReactElement {
  const { rating, ratingChange, ratingBefore } = props;
  const effectiveChange =
    ratingChange !== null && ratingChange !== undefined
      ? ratingChange
      : rating != null && ratingBefore != null
        ? rating - ratingBefore
        : null;

  if (rating === null) {
    return <span>—</span>;
  }
  if (effectiveChange === null) {
    return <span style={{ fontWeight: 600 }}>{rating}</span>;
  }
  const color =
    effectiveChange > 0 ? '#27ae60' : effectiveChange < 0 ? '#e74c3c' : '#666';
  return (
    <>
      <span style={{ fontWeight: 600 }}>{rating}</span>{' '}
      <span style={{ color, fontWeight: 500 }}>
        ({formatRatingDelta(effectiveChange)})
      </span>
    </>
  );
}
