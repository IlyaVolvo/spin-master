import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { formatMoney } from '../utils/formatMoney';

type RegisterResponse = {
  status?: string;
  message?: string;
  checkout?: {
    checkoutUrl?: string;
    instructions?: string;
    method?: string;
    amountCents?: number;
  } | null;
  tournament?: {
    isEvent?: boolean;
    eventPriceCents?: number | null;
    name?: string | null;
  };
  clubChargeWarning?: string | null;
};

type PreviewResponse = {
  status?: string;
  tournament?: {
    id: number;
    name?: string | null;
    isEvent?: boolean;
    eventPriceCents?: number | null;
    tournamentDate?: string | null;
    registrationDeadline?: string | null;
    status?: string;
  };
  eventPayment?: { status?: string } | null;
  clubChargeWarning?: string | null;
  eventCheckInWindowOpen?: boolean;
};

const TournamentRegistrationLink: React.FC = () => {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');
  const [message, setMessage] = useState(
    action ? 'Processing...' : 'Loading invitation…',
  );
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [eventInfo, setEventInfo] = useState<{
    isEvent: boolean;
    priceCents: number | null;
    name: string | null;
  } | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutHint, setCheckoutHint] = useState<string | null>(null);
  const [clubChargeWarning, setClubChargeWarning] = useState<string | null>(null);

  const applyEventFromTournament = (tournament?: {
    isEvent?: boolean;
    eventPriceCents?: number | null;
    name?: string | null;
  } | null) => {
    if (tournament?.isEvent) {
      setEventInfo({
        isEvent: true,
        priceCents: tournament.eventPriceCents ?? null,
        name: tournament.name ?? null,
      });
    }
  };

  const applyRegisterResponse = (response: RegisterResponse) => {
    applyEventFromTournament(response.tournament);
    if (response.status) {
      setRegistrationStatus(response.status);
    }
    if (typeof response.clubChargeWarning === 'string' && response.clubChargeWarning.trim()) {
      setClubChargeWarning(response.clubChargeWarning.trim());
    }
    const url = response.checkout?.checkoutUrl;
    if (typeof url === 'string' && url.trim()) {
      setCheckoutUrl(url.trim());
      setCheckoutHint(null);
      setMessage(response.message || 'Complete payment to finish event registration.');
      setIsError(false);
      return true;
    }
    setCheckoutUrl(null);
    if (response.status === 'PENDING' || response.tournament?.isEvent) {
      const method = response.checkout?.method;
      const instructions =
        typeof response.checkout?.instructions === 'string'
          ? response.checkout.instructions.trim()
          : '';
      setCheckoutHint(
        instructions ||
          (method === 'cash'
            ? 'Payment is pending at the club (cash). An organizer can record payment, or pay online if enabled on your account.'
            : 'Payment is pending. Use Pay / Complete from the tournament page if needed.'),
      );
      setMessage(response.message || 'Registration pending payment for this event.');
    } else {
      setCheckoutHint(null);
      setMessage(response.message || 'You are registered for the tournament.');
    }
    setIsError(false);
    return false;
  };

  const submitResponse = async (nextAction: 'register' | 'decline') => {
    setIsSubmitting(true);
    setMessage(nextAction === 'register' ? 'Registering...' : 'Declining invitation...');
    setCheckoutUrl(null);
    setCheckoutHint(null);
    try {
      const encodedCode = encodeURIComponent(code || '');
      const endpoint = nextAction === 'decline'
        ? `/tournaments/register/${encodedCode}/decline`
        : `/tournaments/register/${encodedCode}`;
      const response = await api.post<RegisterResponse>(endpoint);
      if (nextAction === 'decline') {
        setRegistrationStatus('DECLINED');
        setMessage(response.data?.message || 'Invitation declined.');
        setIsError(false);
        return;
      }
      const redirected = applyRegisterResponse(response.data || {});
      if (redirected && response.data?.checkout?.checkoutUrl) {
        window.location.assign(response.data.checkout.checkoutUrl);
      }
    } catch (err: any) {
      setMessage(err.response?.data?.error || err.response?.data?.message || 'Registration response could not be completed.');
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (!code) {
        setMessage('Registration link is invalid.');
        setIsError(true);
        setPreviewLoaded(true);
        return;
      }
      try {
        const encodedCode = encodeURIComponent(code);
        const response = await api.get<PreviewResponse>(`/tournaments/register/${encodedCode}`);
        if (cancelled) return;
        applyEventFromTournament(response.data?.tournament);
        if (response.data?.status) {
          setRegistrationStatus(response.data.status);
        }
        if (typeof response.data?.clubChargeWarning === 'string' && response.data.clubChargeWarning.trim()) {
          setClubChargeWarning(response.data.clubChargeWarning.trim());
        } else {
          setClubChargeWarning(null);
        }
        const name = response.data?.tournament?.name || 'this tournament';
        const isEvent = response.data?.tournament?.isEvent === true;
        const price = response.data?.tournament?.eventPriceCents;
        if (response.data?.status === 'REGISTERED') {
          setMessage(
            isEvent
              ? `You are registered for event ${name}.`
              : `You are already registered for ${name}.`,
          );
        } else if (response.data?.status === 'PENDING') {
          setMessage(`Payment pending for event ${name}.`);
          setCheckoutHint('Complete payment online or ask an organizer to record cash payment.');
        } else if (response.data?.status === 'DECLINED') {
          setMessage(`You declined ${name}. You can register again before the deadline if spots remain.`);
        } else if (isEvent) {
          setMessage(
            price != null
              ? `Confirm registration for paid event ${name} (${formatMoney(price)}).`
              : `Confirm registration for paid event ${name}.`,
          );
        } else {
          setMessage(`Please choose how to respond to the invitation for ${name}.`);
        }
        setIsError(false);
      } catch (err: any) {
        if (cancelled) return;
        setMessage(err.response?.data?.error || 'Registration link is invalid or expired.');
        setIsError(true);
      } finally {
        if (!cancelled) setPreviewLoaded(true);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!previewLoaded) return;
    if (action === 'register' || action === 'decline') {
      void submitResponse(action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, code, previewLoaded]);

  const isEvent = eventInfo?.isEvent === true;
  const canRespond =
    previewLoaded &&
    !isError &&
    registrationStatus !== 'REGISTERED' &&
    registrationStatus !== 'DECLINED';

  return (
    <div className="container" style={{ maxWidth: '640px', marginTop: '80px' }}>
      <div className="card">
        <h2>{isEvent ? 'Event Registration' : 'Tournament Registration'}</h2>
        {isEvent && (
          <div style={{ marginBottom: '12px', fontSize: '14px', color: '#555' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#6c3483',
              color: 'white',
              marginRight: '8px',
            }}>
              Event
            </span>
            {eventInfo?.name && <span style={{ marginRight: '8px' }}>{eventInfo.name}</span>}
            {eventInfo?.priceCents != null && (
              <strong>{formatMoney(eventInfo.priceCents)}</strong>
            )}
            {registrationStatus === 'PENDING' && (
              <span style={{ marginLeft: '8px', color: '#856404', fontWeight: 600 }}>
                Payment pending
              </span>
            )}
          </div>
        )}
        <div className={isError ? 'error-message' : 'success-message'}>{message}</div>
        {clubChargeWarning && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              color: '#856404',
              fontSize: '14px',
            }}
          >
            {clubChargeWarning}
          </div>
        )}
        {checkoutHint && (
          <p style={{ marginTop: '12px', fontSize: '14px', color: '#555' }}>{checkoutHint}</p>
        )}
        {checkoutUrl && (
          <div style={{ marginTop: '16px' }}>
            <a
              href={checkoutUrl}
              className="button-3d"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              Continue to payment
            </a>
          </div>
        )}
        {!action && canRespond && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              className="button-3d"
              disabled={isSubmitting || !previewLoaded}
              onClick={() => void submitResponse('register')}
            >
              {isEvent
                ? (eventInfo?.priceCents != null
                  ? `Register & pay ${formatMoney(eventInfo.priceCents)}`
                  : 'Register & pay')
                : 'Register'}
            </button>
            <button
              type="button"
              className="button-filter"
              disabled={isSubmitting || !previewLoaded}
              onClick={() => void submitResponse('decline')}
            >
              Decline Invitation
            </button>
          </div>
        )}
        {!action && registrationStatus === 'PENDING' && isEvent && (
          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="button-3d"
              disabled={isSubmitting}
              onClick={() => void submitResponse('register')}
            >
              Retry payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentRegistrationLink;
