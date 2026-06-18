import React from 'react';

export type TriStateCheckboxValue = 'off' | 'on' | 'partial';

type TriStateCheckboxProps = {
  value: TriStateCheckboxValue;
  accentColor?: string;
};

export const TriStateCheckbox: React.FC<TriStateCheckboxProps> = ({
  value,
  accentColor = '#1976d2',
}) => (
  <span
    role="checkbox"
    aria-checked={value === 'on' ? true : value === 'partial' ? 'mixed' : false}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '14px',
      height: '14px',
      border: `1.5px solid ${value === 'off' ? '#888' : accentColor}`,
      borderRadius: '2px',
      backgroundColor: value === 'partial' ? accentColor : 'white',
      flexShrink: 0,
    }}
  >
    {value === 'on' && (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2 5.2 L4.2 7.5 L8 2.8"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);
