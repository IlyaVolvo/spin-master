import { useHostOnDutyText } from '../utils/useHostOnDuty';

const headerPillStyle = {
  display: 'inline-block' as const,
  boxSizing: 'border-box' as const,
  padding: '6px 16px',
  backgroundColor: '#2c3e50',
  color: 'white',
  borderRadius: '999px',
  fontSize: '17px',
  fontWeight: 600,
  letterSpacing: '0.02em',
  lineHeight: 1.25,
  whiteSpace: 'nowrap' as const,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const headerPillSecondaryStyle = {
  fontSize: '12px',
  fontWeight: 500,
  color: 'rgba(255, 255, 255, 0.8)',
  letterSpacing: '0.01em',
  marginLeft: '0.35em',
};

/** Host on duty in the main app club header row (pill, matches club name / user chips). */
export function AppHeaderHostOnDuty() {
  const hostText = useHostOnDutyText();
  if (!hostText) return null;

  return (
    <span
      className="app-header-club app-header-club-host"
      style={headerPillStyle}
      title={`Host: ${hostText}`}
    >
      Host
      <span style={headerPillSecondaryStyle}>({hostText})</span>
    </span>
  );
}
