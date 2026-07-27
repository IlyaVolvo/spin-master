import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  canEnterBrowseKiosk,
  canEnterCheckinKiosk,
  type KioskKind,
} from '../utils/auth';
import { enterKioskMode } from '../utils/kioskEntry';
import { getErrorMessage } from '../utils/errorHandler';

const headerLinkStyle = (active = false): CSSProperties => ({
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: active ? 700 : 500,
  lineHeight: 1.2,
  color: active ? '#fff' : 'rgba(255, 255, 255, 0.75)',
  background: active ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  borderRadius: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

/** Header entry beside Public: Admin → check-in, Organizer → browse (chooser if both). */
export function PlayersKioskEntryButton() {
  const navigate = useNavigate();
  const canCheckin = canEnterCheckinKiosk();
  const canBrowse = canEnterBrowseKiosk();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!canCheckin && !canBrowse) return null;

  const start = async (kind: KioskKind) => {
    setLoading(true);
    setError('');
    try {
      const path = await enterKioskMode({ kind });
      setOpen(false);
      navigate(path, { replace: true });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to enter kiosk mode'));
    } finally {
      setLoading(false);
    }
  };

  const onlyOne = (canCheckin && !canBrowse) || (!canCheckin && canBrowse);

  const onClick = () => {
    if (onlyOne) {
      void start(canCheckin ? 'checkin' : 'browse');
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="app-header-public-link"
        onClick={onClick}
        disabled={loading}
        title="Enter kiosk mode"
        style={{
          ...headerLinkStyle(false),
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '…' : 'Kiosk'}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '400px', width: '100%', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Enter kiosk mode</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Choose how this terminal should be used.
            </p>
            {error && (
              <div style={{ color: '#c0392b', marginBottom: '12px', fontSize: '13px' }}>{error}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {canCheckin && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void start('checkin')}
                  style={{
                    padding: '12px 16px',
                    fontSize: '15px',
                    fontWeight: 600,
                    backgroundColor: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Check-in
                </button>
              )}
              {canBrowse && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void start('browse')}
                  style={{
                    padding: '12px 16px',
                    fontSize: '15px',
                    fontWeight: 600,
                    backgroundColor: '#2980b9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Browse
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => setOpen(false)}
                style={{
                  padding: '10px',
                  background: 'transparent',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
