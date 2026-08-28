import { useEffect, useState } from 'react';

export default function CancelLessonDialog(props: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (props.open) setReason('');
  }, [props.open]);
  if (!props.open) return null;
  const trimmed = reason.trim();
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
      onClick={props.busy ? undefined : props.onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: '100%', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Cancel lesson</h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#546e7a' }}>
          Please say why you are cancelling. The coach will be notified and this time becomes available again.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Reason"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" disabled={props.busy} onClick={props.onClose}>
            Keep lesson
          </button>
          <button
            type="button"
            disabled={props.busy || !trimmed}
            onClick={() => props.onConfirm(trimmed)}
          >
            {props.busy ? 'Cancelling…' : 'Cancel lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
