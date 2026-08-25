import { useHostOnDutyText } from '../../utils/useHostOnDuty';

export function MeHostOnDutyLabel() {
  const hostText = useHostOnDutyText();
  if (!hostText) return null;

  return (
    <span
      style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#5a6a7a',
      }}
      title={`Host: ${hostText}`}
    >
      Host: {hostText}
    </span>
  );
}
