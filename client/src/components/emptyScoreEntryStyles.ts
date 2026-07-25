import type React from 'react';

/** Shared styling for the two-cell “enter score” placeholder. */
export const emptyScoreEntryButtonStyle: React.CSSProperties = {
  padding: 0,
  border: '1px solid #888',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'stretch',
  width: '48px',
  height: '20px',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

export const emptyScoreEntryCellStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: '#fff',
  minHeight: '100%',
};

export const emptyScoreEntryLeftCellStyle: React.CSSProperties = {
  ...emptyScoreEntryCellStyle,
  borderRight: '1px solid #888',
};
