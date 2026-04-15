import React from 'react';
import type { PendingPlayerData, SimilarName } from '../../types/member';

export interface SimilarNamesConfirmationModalProps {
  pendingPlayerData: PendingPlayerData;
  similarNames: SimilarName[];
  onCancel: () => void;
  onModifyName: () => void;
  onConfirmAdd: () => void;
}

export const SimilarNamesConfirmationModal: React.FC<SimilarNamesConfirmationModalProps> = ({
  pendingPlayerData,
  similarNames,
  onCancel,
  onModifyName,
  onConfirmAdd,
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
      zIndex: 10001,
    }}
  >
    <div className="card" style={{ maxWidth: '500px', width: '90%', position: 'relative' }}>
      <h3 style={{ marginBottom: '15px', color: '#e67e22' }}>⚠️ Similar Player Names Found</h3>
      <p style={{ marginBottom: '15px' }}>
        You&apos;re trying to add:{' '}
        <strong>
          {pendingPlayerData.firstName} {pendingPlayerData.lastName}
        </strong>
        {pendingPlayerData.rating && ` (Rating: ${pendingPlayerData.rating})`}
      </p>
      <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>Similar existing players:</p>
      <ul style={{ marginBottom: '20px', paddingLeft: '20px' }}>
        {similarNames.map((similar, index) => (
          <li key={index} style={{ marginBottom: '8px' }}>
            <strong>{similar.name}</strong> ({similar.similarity}% similar)
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ backgroundColor: '#95a5a6', color: 'white' }}>
          Cancel
        </button>
        <button type="button" onClick={onModifyName} style={{ backgroundColor: '#3498db', color: 'white' }}>
          Modify Name
        </button>
        <button type="button" onClick={onConfirmAdd} style={{ backgroundColor: '#27ae60', color: 'white' }}>
          Confirm & Add
        </button>
      </div>
    </div>
  </div>
);
