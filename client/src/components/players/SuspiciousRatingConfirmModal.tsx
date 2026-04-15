import React from 'react';

export interface SuspiciousRatingConfirmModalProps {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SuspiciousRatingConfirmModal: React.FC<SuspiciousRatingConfirmModalProps> = ({
  message,
  onCancel,
  onConfirm,
}) => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10002,
    }}
  >
    <div className="card" style={{ maxWidth: '460px', width: '90%', position: 'relative' }}>
      <h3 style={{ marginBottom: '12px', color: '#e67e22' }}>Confirm Unusual Rating</h3>
      <p style={{ marginBottom: '20px' }}>{message}</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="button-filter" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button-3d" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </div>
  </div>
);
