import React from 'react';

type IconProps = {
  size?: number;
  color?: string;
};

export const EmptyCalendarIcon: React.FC<IconProps> = ({ size = 20, color = '#b26a00' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.5" opacity="0.7" />
    <path d="M3 9h18" stroke={color} strokeWidth="1.5" opacity="0.7" />
    <path d="M8 3v4M16 3v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    <circle cx="8" cy="14" r="1" fill={color} opacity="0.5" />
    <circle cx="12" cy="14" r="1" fill={color} opacity="0.5" />
    <circle cx="16" cy="14" r="1" fill={color} opacity="0.5" />
  </svg>
);

export const EmptyActiveIcon: React.FC<IconProps> = ({ size = 20, color = '#7b1fa2' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" opacity="0.7" />
    <path d="M10 8.5v7l5.5-3.5L10 8.5z" fill={color} opacity="0.45" />
  </svg>
);

export const EmptyCompletedIcon: React.FC<IconProps> = ({ size = 20, color = '#1976d2' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7 4h10l1 4H6l1-4zM6 9h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z"
      stroke={color}
      strokeWidth="1.5"
      strokeLinejoin="round"
      opacity="0.7"
    />
    <path d="M9 13l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
  </svg>
);

export const EmptySearchIcon: React.FC<IconProps> = ({ size = 20, color = '#1976d2' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="1.5" opacity="0.7" />
    <path d="M16 16l4.5 4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
  </svg>
);
