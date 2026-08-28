import type { CSSProperties } from 'react';
import { formatSlotRange } from './availabilityDraft';

export default function LessonSlotCaption(props: {
  name: string;
  startTime: string;
  endTime: string;
  height: number;
  color?: string;
}) {
  const range = formatSlotRange(props.startTime, props.endTime);
  const full = `${props.name} ${range}`.trim();
  const twoLines = props.height >= 36 && Boolean(props.name);
  const color = props.color || '#111';
  const lineStyle: CSSProperties = {
    fontWeight: 700,
    lineHeight: 1.15,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    color,
  };
  return (
    <div
      title={full}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 3px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {twoLines ? (
        <>
          <div style={{ ...lineStyle, fontSize: 14 }}>{props.name}</div>
          <div style={{ ...lineStyle, fontSize: 13 }}>{range}</div>
        </>
      ) : (
        <div style={{ ...lineStyle, fontSize: 14 }}>{props.name ? full : range}</div>
      )}
    </div>
  );
}
