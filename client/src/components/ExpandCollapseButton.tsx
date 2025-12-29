import React from 'react';

interface ExpandCollapseButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  expandedText: string;
  collapsedText: string;
  title?: string;
}

export const ExpandCollapseButton: React.FC<ExpandCollapseButtonProps> = ({
  isExpanded,
  onToggle,
  expandedText,
  collapsedText,
  title,
}) => {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '8px 16px',
        border: '1px solid #3498db',
        borderRadius: '4px',
        backgroundColor: isExpanded ? '#3498db' : '#fff',
        color: isExpanded ? '#fff' : '#3498db',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 'bold',
        transition: 'all 0.2s ease',
      }}
      title={title}
    >
      {isExpanded ? expandedText : collapsedText}
    </button>
  );
};

