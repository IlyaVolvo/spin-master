import type { CSSProperties } from 'react';
import { formatSlotClock } from './availabilityDraft';

const CELL_H = 18;

export default function HoverTimeHint(props: {
  time: string;
  offsetMinutes: number;
  style?: CSSProperties;
}) {
  const top = (props.offsetMinutes / 15) * CELL_H;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        height: CELL_H,
        pointerEvents: 'none',
        zIndex: 7,
        ...props.style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background: 'rgba(20, 40, 50, 0.55)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 3,
          transform: 'translateX(-50%)',
          background: 'rgba(20, 40, 50, 0.92)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: '16px',
          padding: '0 6px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        {formatSlotClock(props.time)}
      </div>
    </div>
  );
}
