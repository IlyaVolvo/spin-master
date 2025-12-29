import React from 'react';

interface BracketIconProps {
  size?: number;
  color?: string;
}

export const BracketIcon: React.FC<BracketIconProps> = ({ size = 20, color = '#3498db' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left bracket structure - shows tournament bracket progression */}
      {/* Round 1 matches (left side) */}
      <rect x="2" y="4" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="2" y="8" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="2" y="12" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="2" y="16" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      
      {/* Connection lines to Round 2 */}
      <line x1="6" y1="5" x2="6" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="13" x2="6" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      
      {/* Round 2 matches */}
      <rect x="6" y="6" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="6" y="14" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      
      {/* Connection line to Final */}
      <line x1="10" y1="7" x2="10" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      
      {/* Final match */}
      <rect x="10" y="10" width="4" height="2" rx="0.5" stroke={color} strokeWidth="2" fill="none"/>
      
      {/* Right bracket structure - mirror */}
      <rect x="18" y="4" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="18" y="8" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="18" y="12" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="18" y="16" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      
      <line x1="18" y1="5" x2="18" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="13" x2="18" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      
      <rect x="14" y="6" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="14" y="14" width="4" height="2" rx="0.5" stroke={color} strokeWidth="1.5" fill="none"/>
      
      <line x1="14" y1="7" x2="14" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
};

