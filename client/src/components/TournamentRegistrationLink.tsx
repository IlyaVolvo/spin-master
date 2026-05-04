import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

const TournamentRegistrationLink: React.FC = () => {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');
  const [message, setMessage] = useState(action ? 'Processing...' : 'Please choose how to respond to this invitation.');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitResponse = async (nextAction: 'register' | 'decline') => {
    setIsSubmitting(true);
    setMessage(nextAction === 'register' ? 'Registering...' : 'Declining invitation...');
    try {
      const encodedCode = encodeURIComponent(code || '');
      const endpoint = nextAction === 'decline'
        ? `/tournaments/register/${encodedCode}/decline`
        : `/tournaments/register/${encodedCode}`;
      const response = await api.post(endpoint);
      setMessage(response.data?.message || (nextAction === 'decline' ? 'Invitation declined.' : 'You are registered for the tournament.'));
      setIsError(false);
    } catch (err: any) {
      setMessage(err.response?.data?.error || err.response?.data?.message || 'Registration response could not be completed.');
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (action === 'register' || action === 'decline') {
      void submitResponse(action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, code]);

  return (
    <div className="container" style={{ maxWidth: '640px', marginTop: '80px' }}>
      <div className="card">
        <h2>Tournament Registration</h2>
        <div className={isError ? 'error-message' : 'success-message'}>{message}</div>
        {!action && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              className="button-3d"
              disabled={isSubmitting}
              onClick={() => void submitResponse('register')}
            >
              Register
            </button>
            <button
              type="button"
              className="button-filter"
              disabled={isSubmitting}
              onClick={() => void submitResponse('decline')}
            >
              Decline Invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentRegistrationLink;
