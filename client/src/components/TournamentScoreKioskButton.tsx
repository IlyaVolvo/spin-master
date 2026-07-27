import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canEnterTournamentScoreKiosk } from '../utils/auth';
import { enterKioskMode } from '../utils/kioskEntry';
import { getErrorMessage } from '../utils/errorHandler';

/** ACTIVE tournament detail: Organizer enters locked score-entry kiosk. */
export function TournamentScoreKioskButton({ tournamentId }: { tournamentId: number }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!canEnterTournamentScoreKiosk()) return null;

  const onClick = async () => {
    setLoading(true);
    try {
      const path = await enterKioskMode({ kind: 'tournamentScore', tournamentId });
      navigate(path, { replace: true });
    } catch (err: unknown) {
      window.alert(getErrorMessage(err, 'Failed to enter score kiosk'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={loading}
      title="Enter score-entry kiosk for this tournament"
      style={{
        padding: '6px 12px',
        fontSize: '13px',
        fontWeight: 600,
        backgroundColor: '#c0392b',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? '…' : 'Score kiosk'}
    </button>
  );
}
