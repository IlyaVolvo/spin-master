import { useEffect, useState } from 'react';
import { BoundedNumericInput } from '../BoundedNumericInput';
import { formatMoney } from '../../utils/formatMoney';

export default function ReserveLessonDialog(props: {
  open: boolean;
  busy?: boolean;
  coachName: string;
  whenLabel: string;
  priceCents: number;
  maxWeeks: number;
  onCancel: () => void;
  onReserve: (weeks: number) => void;
}) {
  const maxWeeks = Math.max(1, Math.floor(props.maxWeeks) || 1);
  const locked = maxWeeks <= 1;
  const [weeks, setWeeks] = useState(maxWeeks);

  useEffect(() => {
    if (props.open) setWeeks(maxWeeks);
  }, [props.open, maxWeeks]);

  if (!props.open) return null;

  const count = Math.min(maxWeeks, Math.max(1, Math.floor(weeks) || 1));
  const totalCents = props.priceCents * count;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 30, 40, 0.35)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={props.busy ? undefined : props.onCancel}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: '100%', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Reserve lesson</h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#546e7a' }}>
          {props.coachName} · {props.whenLabel}
        </p>
        <div style={{ opacity: locked ? 0.55 : 1 }}>
          <BoundedNumericInput
            label="Weeks"
            value={count}
            min={1}
            max={maxWeeks}
            disabled={locked || props.busy}
            onChange={(value) => {
              if (locked) return;
              const next = Math.floor(Number(value) || 0);
              if (next >= 1 && next <= maxWeeks) setWeeks(next);
            }}
            hintExtra={locked ? 'Only this week is available' : `Up to ${maxWeeks} consecutive weeks`}
            inputStyle={locked ? { backgroundColor: '#eceff1', color: '#78909c' } : undefined}
          />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#546e7a' }}>
          {count === 1
            ? formatMoney(props.priceCents)
            : `${count} × ${formatMoney(props.priceCents)} = ${formatMoney(totalCents)}`}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" disabled={props.busy} onClick={() => props.onReserve(count)}>
            {props.busy ? 'Reserving…' : `Reserve ${count} ${count === 1 ? 'week' : 'weeks'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
