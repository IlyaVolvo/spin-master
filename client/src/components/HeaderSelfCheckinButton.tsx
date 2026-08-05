import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getMember } from '../utils/auth';
import { getErrorMessage } from '../utils/errorHandler';
import { clearAllScrollPositions, clearAllUIStates } from '../utils/scrollPosition';
import { connectSocket, getSocket } from '../utils/socket';
import {
  type CheckInOption,
  checkInExecuteIntent,
  shouldShowCheckInSelector,
} from '../utils/checkInOptions';
import { CheckInOptionMenu } from './CheckInOptionSelect';

type HeaderSelfCheckinButtonProps = {
  controlStyle: CSSProperties;
};

export function HeaderSelfCheckinButton({ controlStyle }: HeaderSelfCheckinButtonProps) {
  const navigate = useNavigate();
  const [present, setPresent] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOptions, setMenuOptions] = useState<CheckInOption[] | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get('/club/self/today');
      setPresent(res.data?.present === true);
    } catch {
      // Keep last known state on transient errors.
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const memberId = getMember()?.id;
    if (!socket || memberId == null) return;

    const onVisitUpdated = (event: { memberId?: number; present?: boolean }) => {
      if (event?.memberId !== memberId) return;
      if (typeof event.present === 'boolean') {
        setPresent(event.present);
      } else {
        void refreshStatus();
      }
    };

    socket.on('club:visitUpdated', onVisitUpdated);
    return () => {
      socket.off('club:visitUpdated', onVisitUpdated);
    };
  }, [refreshStatus]);

  const openOwnPlan = () => {
    const member = getMember();
    if (!member) return;
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    setMenuOptions(null);
    navigate('/players', {
      state: { openOwnPlan: true, memberId: member.id },
      replace: false,
    });
  };

  const startEventOnlineRegister = async (tournamentId: number) => {
    const response = await api.post(`/tournaments/${tournamentId}/register`);
    const checkoutUrl = response.data?.checkout?.checkoutUrl;
    const clubChargeWarning =
      typeof response.data?.clubChargeWarning === 'string'
        ? response.data.clubChargeWarning.trim()
        : '';
    if (typeof checkoutUrl === 'string' && checkoutUrl.trim()) {
      if (clubChargeWarning) {
        window.sessionStorage.setItem(
          `eventClubChargeWarning:${tournamentId}`,
          clubChargeWarning,
        );
      }
      window.location.assign(checkoutUrl);
      return;
    }
    setMenuOptions(null);
    setError('');
    await refreshStatus();
  };

  const executeOption = async (option: CheckInOption) => {
    const intent = checkInExecuteIntent(option);
    if (!intent) {
      setError('That check-in option is not available yet.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (intent.type === 'buy_plan') {
        openOwnPlan();
        return;
      }
      if (intent.type === 'register_and_pay') {
        await startEventOnlineRegister(intent.tournamentId);
        return;
      }

      const body: { eventTournamentId?: number; eventMode?: string } = {};
      if (intent.type === 'event_check_in') {
        body.eventTournamentId = intent.tournamentId;
        body.eventMode = 'event_check_in';
      }
      const res = await api.post('/club/self/toggle', body);
      const action = res.data?.action as string | undefined;
      if (action === 'CHECK_IN') setPresent(true);
      else if (action === 'CHECK_OUT') setPresent(false);
      else await refreshStatus();
      setMenuOptions(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string; action?: string } } })
        ?.response?.status;
      const data = (err as { response?: { data?: { message?: string; action?: string; error?: string } } })
        ?.response?.data;
      if (status === 402 || data?.action === 'PAYMENT_REQUIRED') {
        setError(data?.message || 'Payment required before check-in.');
        setMenuOptions(null);
        openOwnPlan();
        return;
      }
      setError(getErrorMessage(err, data?.error || 'Check-in failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleIconClick = async () => {
    if (busy || loadingStatus) return;
    setError('');

    if (present) {
      setBusy(true);
      try {
        const res = await api.post('/club/self/toggle', {});
        const action = res.data?.action as string | undefined;
        if (action === 'CHECK_OUT') setPresent(false);
        else if (action === 'CHECK_IN') setPresent(true);
        else await refreshStatus();
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Check-out failed'));
      } finally {
        setBusy(false);
      }
      return;
    }

    const memberId = getMember()?.id;
    if (memberId == null) return;

    setBusy(true);
    try {
      const res = await api.get<{ options?: CheckInOption[] }>('/club/event-checkin-options', {
        params: { memberId },
      });
      const options = Array.isArray(res.data?.options) ? res.data.options : [];

      if (shouldShowCheckInSelector(options)) {
        setMenuOptions(options);
        return;
      }

      setError('No check-in options available.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load check-in options'));
    } finally {
      setBusy(false);
    }
  };

  const title = present ? 'Checked in — click to check out' : 'Not checked in — click to check in';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleIconClick()}
        disabled={loadingStatus || busy}
        title={title}
        aria-label={title}
        aria-pressed={present}
        style={{
          ...controlStyle,
          backgroundColor: present ? 'rgba(39, 174, 96, 0.45)' : 'rgba(255, 255, 255, 0.1)',
          color: present ? '#d5f5e3' : '#b0b0b0',
          border: present ? '1px solid rgba(46, 204, 113, 0.85)' : 'none',
          borderRadius: '4px',
          cursor: loadingStatus || busy ? 'wait' : 'pointer',
          fontWeight: 700,
          transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
          opacity: loadingStatus ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (loadingStatus || busy) return;
          e.currentTarget.style.backgroundColor = present
            ? 'rgba(39, 174, 96, 0.6)'
            : 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = present
            ? 'rgba(39, 174, 96, 0.45)'
            : 'rgba(255, 255, 255, 0.1)';
        }}
      >
        📍
      </button>

      {error ? (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 20001,
            background: '#fdecea',
            color: '#c0392b',
            border: '1px solid #f5b7b1',
            borderRadius: '6px',
            padding: '10px 14px',
            maxWidth: '320px',
            fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
          role="alert"
        >
          {error}
          <button
            type="button"
            onClick={() => setError('')}
            style={{
              marginLeft: '10px',
              border: 'none',
              background: 'transparent',
              color: '#922b21',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      {menuOptions && (
        <CheckInOptionMenu
          options={menuOptions}
          busy={busy}
          onCancel={() => {
            if (busy) return;
            setMenuOptions(null);
          }}
          onSelect={(option) => {
            void executeOption(option);
          }}
        />
      )}
    </>
  );
}
