import api from './api';
import { connectSocket } from './socket';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type PaymentUpdate = {
  id: number;
  memberId: number;
  status: PaymentStatus;
  amountCents: number;
  provider?: string | null;
  purpose?: string | null;
};

export type WaitForPaymentOptions = {
  paymentId: number;
  /** Max wait for socket event (default 90s). */
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: PaymentStatus) => void;
};

function isTerminal(status: string): status is PaymentStatus {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * Wait for payment confirmation via Socket.io `payment:updated`.
 * One status GET only if the socket event is missed before timeout.
 */
export async function waitForPaymentUpdate(
  options: WaitForPaymentOptions,
): Promise<PaymentUpdate> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const socket = connectSocket();
  if (!socket) {
    throw new Error('Unable to connect for payment updates');
  }

  options.onStatus?.('PENDING');

  return new Promise<PaymentUpdate>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      socket.off('payment:updated', onPaymentUpdated);
      options.signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };

    const finish = (result: PaymentUpdate) => {
      if (settled) return;
      settled = true;
      cleanup();
      options.onStatus?.(result.status);
      resolve(result);
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onPaymentUpdated = (payload: PaymentUpdate) => {
      if (Number(payload?.id) !== options.paymentId) return;
      if (!isTerminal(payload.status)) return;
      finish({
        id: payload.id,
        memberId: payload.memberId,
        status: payload.status,
        amountCents: payload.amountCents,
        provider: payload.provider,
        purpose: payload.purpose,
      });
    };

    const onAbort = () => {
      fail(new DOMException('Aborted', 'AbortError'));
    };

    const timer = setTimeout(() => {
      void (async () => {
        try {
          // Missed socket event — single reconcile read, not a poll loop
          const res = await api.get(`/payments/${options.paymentId}`);
          const data = res.data as PaymentUpdate;
          if (isTerminal(data.status)) {
            finish(data);
            return;
          }
          finish({
            id: data.id,
            memberId: data.memberId,
            status: (data.status as PaymentStatus) || 'PENDING',
            amountCents: data.amountCents,
            provider: data.provider,
            purpose: data.purpose,
          });
        } catch (err) {
          fail(err);
        }
      })();
    }, timeoutMs);

    socket.on('payment:updated', onPaymentUpdated);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    // Catch confirmations that landed before the listener was attached
    void (async () => {
      try {
        const res = await api.get(`/payments/${options.paymentId}`);
        const data = res.data as PaymentUpdate;
        if (!settled && isTerminal(data.status)) {
          finish(data);
        }
      } catch {
        // ignore; socket / timeout still in play
      }
    })();
  });
}
