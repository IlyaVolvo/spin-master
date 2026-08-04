import React from 'react';

interface TournamentNameEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export const TournamentNameEditor: React.FC<TournamentNameEditorProps> = ({
  value,
  onChange,
  onSave,
  onCancel,
  busy = false,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (busy) return;
    if (e.key === 'Enter') {
      onSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
        style={{
          padding: '6px 12px',
          fontSize: '18px',
          fontWeight: 'bold',
          border: '1px solid #ddd',
          borderRadius: '4px',
          flex: 1,
          maxWidth: '400px',
        }}
        autoFocus
        placeholder="Tournament name (optional)"
      />
      <button
        onClick={onSave}
        className="success"
        disabled={busy}
        style={{ fontSize: '12px', padding: '6px 12px', cursor: busy ? 'not-allowed' : undefined }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        style={{ fontSize: '12px', padding: '6px 12px', cursor: busy ? 'not-allowed' : undefined }}
      >
        Cancel
      </button>
    </div>
  );
};

