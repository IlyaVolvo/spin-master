import type { ChangeEvent } from 'react';

/**
 * Shared Shift+click range selection for list checkboxes (tournament pick, stats, history, etc.).
 */

/** Use in checkbox `onChange` when forwarding Shift for range selection. */
export function shiftKeyFromCheckboxChange(e: ChangeEvent<HTMLInputElement>): boolean {
  return (e.nativeEvent as MouseEvent).shiftKey;
}

/**
 * When Shift+clicking between two rows, returns the inclusive slice of visibleOrderedIds
 * between the anchor and the clicked id. Returns null if range selection should not apply.
 */
export function getShiftRangeSlice(
  shiftKey: boolean | undefined,
  anchorId: number | null,
  clickedId: number,
  visibleOrderedIds: number[] | undefined
): number[] | null {
  if (!shiftKey || anchorId === null || !visibleOrderedIds?.length) {
    return null;
  }
  const lastIdx = visibleOrderedIds.indexOf(anchorId);
  const currIdx = visibleOrderedIds.indexOf(clickedId);
  if (lastIdx === -1 || currIdx === -1 || lastIdx === currIdx) {
    return null;
  }
  const start = Math.min(lastIdx, currIdx);
  const end = Math.max(lastIdx, currIdx);
  return visibleOrderedIds.slice(start, end + 1);
}

/**
 * Range add/remove: if the clicked row is selected, remove every id in rangeIds from the selection;
 * otherwise add every id in rangeIds (set union). Used for stats and history opponents.
 */
export function toggleRangeInSelection(
  selectedIds: number[],
  clickedId: number,
  rangeIds: number[]
): number[] {
  const isDeselecting = selectedIds.includes(clickedId);
  if (isDeselecting) {
    const rangeSet = new Set(rangeIds);
    return selectedIds.filter((id) => !rangeSet.has(id));
  }
  const next = [...selectedIds];
  for (const id of rangeIds) {
    if (!next.includes(id)) {
      next.push(id);
    }
  }
  return next;
}

/**
 * Like toggleRangeInSelection, but when adding, only ids for which canAddId returns true are appended.
 * Removal still clears every id in rangeIds from the selection (full slice). Used for tournament picks
 * where inactive rows in the range must not be added.
 */
export function toggleRangeInSelectionWithAddGate(
  selectedIds: number[],
  clickedId: number,
  rangeIds: number[],
  canAddId: (id: number) => boolean
): number[] {
  const isDeselecting = selectedIds.includes(clickedId);
  if (isDeselecting) {
    const rangeSet = new Set(rangeIds);
    return selectedIds.filter((id) => !rangeSet.has(id));
  }
  const next = [...selectedIds];
  for (const id of rangeIds) {
    if (!next.includes(id) && canAddId(id)) {
      next.push(id);
    }
  }
  return next;
}

/** Same as toggleRangeInSelection but for `Set` selection (export modal, chart series toggles). */
export function toggleRangeInSelectionSet(
  selectedIds: Set<number>,
  clickedId: number,
  rangeIds: number[]
): Set<number> {
  const isDeselecting = selectedIds.has(clickedId);
  const next = new Set(selectedIds);
  if (isDeselecting) {
    for (const id of rangeIds) {
      next.delete(id);
    }
  } else {
    for (const id of rangeIds) {
      next.add(id);
    }
  }
  return next;
}
