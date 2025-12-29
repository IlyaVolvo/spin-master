import React from 'react';

interface TableIconProps {
  size?: number;
  color?: string;
}

export const TableIcon: React.FC<TableIconProps> = ({ size = 20, color = '#3498db' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth="2" fill="none"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="2"/>
      <line x1="3" y1="15" x2="21" y2="15" stroke={color} strokeWidth="2"/>
      <line x1="9" y1="3" x2="9" y2="21" stroke={color} strokeWidth="2"/>
      <line x1="15" y1="3" x2="15" y2="21" stroke={color} strokeWidth="2"/>
    </svg>
  );
};

