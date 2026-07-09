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

export const sectionCorrectionToggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 6px',
  margin: 0,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '15px',
  lineHeight: 1,
  flexShrink: 0,
};

export const sectionCorrectionToggleInactiveStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #d0d0d0',
};

export const sectionCorrectionToggleActiveStyle: React.CSSProperties = {
  backgroundColor: '#2196f3',
  border: '1px solid #1976d2',
};

export const sectionCorrectionToggleIconColor = {
  activeFill: '#ffb300',
  activeStroke: '#1a1a1a',
  inactive: '#1a1a1a',
} as const;
