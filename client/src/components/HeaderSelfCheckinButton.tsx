import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getMember } from '../utils/auth';
import { getErrorMessage } from '../utils/errorHandler';
import { clearAllScrollPositions, clearAllUIStates } from '../utils/scrollPosition';
import { connectSocket, getSocket } from '../utils/socket';
import type { EventCheckInOption } from './players/CheckinKioskUI';

type ConfirmKind = 'check-in' | 'check-out';

type HeaderSelfCheckinButtonProps = {
  controlStyle: CSSProperties;
};

export function HeaderSelfCheckinButton({ controlStyle }: HeaderSelfCheckinButtonProps) {
  const navigate = useNavigate();
  const [present, setPresent] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [eventOptions, setEventOptions] = useState<EventCheckInOption[]>([]);
  const [selectedEventTournamentId, setSelectedEventTournamentId] = useState<number | null>(null);

  const selectedEvent =
    eventOptions.find((e) => e.tournamentId === selectedEventTournamentId) || null;
  const registerEventOptions = eventOptions.filter((e) => e.mode === 'register_and_pay');

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

  const openConfirm = () => {
    if (busy || loadingStatus) return;
    setError('');
    setPaymentRequired(false);
    setSelectedEventTournamentId(null);
    setConfirmKind(present ? 'check-out' : 'check-in');
  };

  useEffect(() => {
    if (confirmKind !== 'check-in') {
      setEventOptions([]);
      setSelectedEventTournamentId(null);
      return;
    }
    const memberId = getMember()?.id;
    if (memberId == null) return;
    let cancelled = false;
    api.get<{ events?: EventCheckInOption[] }>('/club/event-checkin-options', { params: { memberId } })
      .then((res) => {
        if (cancelled) return;
        const events = Array.isArray(res.data?.events) ? res.data.events : [];
        setEventOptions(events);
        setSelectedEventTournamentId(null);
      })
      .catch(() => {
        if (!cancelled) setEventOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmKind]);

  const closeConfirm = () => {
    if (busy) return;
    setConfirmKind(null);
    setError('');
    setPaymentRequired(false);
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
    setConfirmKind(null);
    setError('');
    setPaymentRequired(false);
    await refreshStatus();
  };

  const confirmToggle = async () => {
    if (!confirmKind || busy) return;
    setBusy(true);
    setError('');
    setPaymentRequired(false);
    try {
      if (confirmKind === 'check-in' && selectedEvent?.mode === 'register_and_pay') {
        await startEventOnlineRegister(selectedEvent.tournamentId);
        return;
      }

      const body: { eventTournamentId?: number; eventMode?: string } = {};
      if (selectedEventTournamentId != null) {
        body.eventTournamentId = selectedEventTournamentId;
        if (selectedEvent?.mode) {
          body.eventMode = selectedEvent.mode;
        }
      }
      const res = await api.post('/club/self/toggle', body);
      const action = res.data?.action as string | undefined;
      if (action === 'CHECK_IN') setPresent(true);
      else if (action === 'CHECK_OUT') setPresent(false);
      else await refreshStatus();
      setConfirmKind(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string; action?: string } } })
        ?.response?.status;
      const data = (err as { response?: { data?: { message?: string; action?: string } } })?.response?.data;
      if (status === 402 || data?.action === 'PAYMENT_REQUIRED') {
        setPaymentRequired(true);
        setError(data?.message || 'Payment required before check-in.');
      } else {
        setError(getErrorMessage(err, confirmKind === 'check-out' ? 'Check-out failed' : 'Check-in failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const openOwnPlan = () => {
    const member = getMember();
    if (!member) return;
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    setConfirmKind(null);
    navigate('/players', {
      state: { openOwnPlan: true, memberId: member.id },
      replace: false,
    });
  };

  const title = present ? 'Checked in — click to check out' : 'Not checked in — click to check in';
  const askingOut = confirmKind === 'check-out';

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
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

      {confirmKind && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeConfirm}
        >
          <div
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="self-checkin-dialog-title"
          >
            <h3 id="self-checkin-dialog-title" style={{ marginTop: 0 }}>
              {askingOut ? 'Check out now?' : paymentRequired ? 'Check-in blocked' : 'Check in now?'}
            </h3>
            {!paymentRequired && (
              <p style={{ fontSize: '14px', color: '#555', marginTop: 0 }}>
                {askingOut
                  ? 'You will leave Present for today. You can check in again later if you return.'
                  : 'Mark yourself Present at the club for today.'}
              </p>
            )}
            {!askingOut && !paymentRequired && eventOptions.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  Check-in type
                </label>
                <select
                  value={selectedEventTournamentId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedEventTournamentId(value === '' ? null : Number(value));
                  }}
                  disabled={busy}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                >
                  <option value="">Regular admission</option>
                  {eventOptions.map((event) => {
                    const price =
                      event.eventPriceCents != null
                        ? ` ($${(event.eventPriceCents / 100).toFixed(2)})`
                        : '';
                    const optionLabel =
                      event.mode === 'register_and_pay'
                        ? `Register & pay event: ${event.name || `#${event.tournamentId}`}${price}`
                        : `Event check-in: ${event.name || `#${event.tournamentId}`}`;
                    return (
                      <option key={`${event.mode || 'check'}-${event.tournamentId}`} value={event.tournamentId}>
                        {optionLabel}
                      </option>
                    );
                  })}
                </select>
                {selectedEvent?.clubChargeWarning && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#856404' }}>
                    {selectedEvent.clubChargeWarning}
                  </p>
                )}
              </div>
            )}
            {error ? (
              <div style={{ color: '#c0392b', marginBottom: '12px', fontSize: '14px' }}>{error}</div>
            ) : null}
            {paymentRequired && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', color: '#555', marginTop: 0 }}>
                  Choose regular admission (club plan / visit) or a planned event.
                </p>
                {registerEventOptions.length > 0 && (
                  <div
                    style={{
                      marginBottom: '10px',
                      padding: '10px',
                      backgroundColor: '#f5eef8',
                      border: '1px solid #d7bde2',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#6c3483', marginBottom: '8px' }}>
                      Planned events
                    </div>
                    {registerEventOptions.map((event) => {
                      const price =
                        event.eventPriceCents != null
                          ? ` ($${(event.eventPriceCents / 100).toFixed(2)})`
                          : '';
                      return (
                        <button
                          key={event.tournamentId}
                          type="button"
                          className="success"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            setError('');
                            void startEventOnlineRegister(event.tournamentId)
                              .catch((err: unknown) => {
                                setError(getErrorMessage(err, 'Event registration failed'));
                              })
                              .finally(() => setBusy(false));
                          }}
                          style={{ width: '100%', marginBottom: '8px' }}
                        >
                          Register & pay {event.name || `Event #${event.tournamentId}`}{price}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={closeConfirm} disabled={busy}>
                Cancel
              </button>
              {paymentRequired ? (
                <button type="button" className="success" onClick={openOwnPlan} disabled={busy}>
                  Pay for admission
                </button>
              ) : (
                <button
                  type="button"
                  className="success"
                  onClick={() => void confirmToggle()}
                  disabled={busy}
                >
                  {busy
                    ? 'Working…'
                    : selectedEvent?.mode === 'register_and_pay'
                      ? 'Register & pay'
                      : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
