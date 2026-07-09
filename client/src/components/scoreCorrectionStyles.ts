import type React from 'react';

export const correctableCellOutlineStyle: React.CSSProperties = {
  outline: '2px dashed #e67e22',
  outlineOffset: '-2px',
  borderRadius: '4px',
  boxSizing: 'border-box',
  position: 'relative',
  cursor: 'pointer',
};

export const correctionModeBannerStyle: React.CSSProperties = {
  padding: '6px 10px',
  marginBottom: '10px',
  fontSize: '12px',
  borderRadius: '4px',
  backgroundColor: '#fef5e7',
  border: '1px solid #e67e22',
  color: '#7d4e0f',
};

export const correctionModeBannerBlockedStyle: React.CSSProperties = {
  ...correctionModeBannerStyle,
  backgroundColor: '#fdecea',
  border: '1px solid #e74c3c',
  color: '#c0392b',
};

export const correctionPencilStyle: React.CSSProperties = {
  position: 'absolute',
  top: '1px',
  right: '2px',
  fontSize: '10px',
  lineHeight: 1,
  opacity: 0.85,
  pointerEvents: 'none',
};
