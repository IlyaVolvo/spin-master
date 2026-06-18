import React from 'react';

export type EmptyStateProps = {
  title: string;
  accentColor?: string;
  backgroundTint?: string;
  borderColor?: string;
  icon?: React.ReactNode;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  accentColor = '#666',
  backgroundTint = '#f8f9fa',
  borderColor = '#e8e8e8',
  icon,
}) => (
  <div
    style={{
      margin: '4px 0 12px',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      backgroundColor: backgroundTint,
      border: `1px dashed ${borderColor}`,
      borderRadius: '6px',
    }}
  >
    {icon && <span style={{ display: 'flex', flexShrink: 0, opacity: 0.85 }}>{icon}</span>}
    <span style={{ fontSize: '14px', color: accentColor, fontWeight: 500 }}>{title}</span>
  </div>
);
