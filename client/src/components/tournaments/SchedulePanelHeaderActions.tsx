import React from 'react';

const printButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #7b1fa2',
  borderRadius: '4px',
  backgroundColor: '#fff',
  color: '#7b1fa2',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};

interface SchedulePanelHeaderActionsProps {
  onToggleExpand: () => void;
  onPrintSchedule?: () => void;
  hideLabel?: string;
}

export const SchedulePanelHeaderActions: React.FC<SchedulePanelHeaderActionsProps> = ({
  onToggleExpand,
  onPrintSchedule,
  hideLabel = '▼ Hide Schedule',
}) => (
  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
    <button onClick={onToggleExpand} className="schedule-toggle" type="button">
      {hideLabel}
    </button>
    {onPrintSchedule && (
      <button
        onClick={onPrintSchedule}
        title="Print this schedule"
        style={printButtonStyle}
        type="button"
      >
        🖨️ Print Schedule
      </button>
    )}
  </div>
);
