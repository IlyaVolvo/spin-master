import React from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Minimal Stripe Checkout return page — members pay via emailed link;
 * success/cancel URLs land here with nothing more than a close hint.
 */
export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const paymentId = params.get('paymentId');

  const headline =
    status === 'success'
      ? 'Payment submitted'
      : status === 'cancel'
        ? 'Payment cancelled'
        : 'Payment';

  const detail =
    status === 'success'
      ? 'If payment succeeded, your club plan will update shortly. You can close this page.'
      : status === 'cancel'
        ? 'No charge was completed. You can close this page and try again from the club app if needed.'
        : 'You can close this page and return to the club app.';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f4f6f7',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          width: '100%',
          background: '#fff',
          borderRadius: '8px',
          padding: '28px 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <h1 style={{ margin: '0 0 12px', fontSize: '22px', color: '#2c3e50' }}>{headline}</h1>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: '#555' }}>{detail}</p>
        {paymentId ? (
          <p style={{ margin: '16px 0 0', fontSize: '12px', color: '#888' }}>
            Reference: {paymentId}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default PaymentReturnPage;
