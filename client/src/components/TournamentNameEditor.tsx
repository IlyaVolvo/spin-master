import React from 'react';

interface TournamentNameEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const TournamentNameEditor: React.FC<TournamentNameEditorProps> = ({
  value,
  onChange,
  onSave,
  onCancel,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        style={{ fontSize: '12px', padding: '6px 12px' }}
      >
        Save
      </button>
      <button
        onClick={onCancel}
        style={{ fontSize: '12px', padding: '6px 12px' }}
      >
        Cancel
      </button>
    </div>
  );
};

