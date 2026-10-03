/**
 * Paying a fee instalment, whichever way the server takes money.
 *
 * With Razorpay configured, the server opens an order, Razorpay Checkout
 * takes the payment, and the server verifies the signature and settles. On
 * the demo (no gateway) the simulated path settles at once. A server with
 * neither refuses, and says to pay at the counter.
 */
import { api, ApiError } from './api';

export interface PaidReceipt { id: string; txnId: string; receipt: string; amount: number }

type Gateway = { provider: 'razorpay'; keyId: string } | { provider: 'simulated' | 'none' };

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayCheckout { open(): void; on(event: 'payment.failed', fn: (r: { error: { description: string } }) => void): void }
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout }
}

let gateway: Promise<Gateway> | null = null;
const getGateway = () => (gateway ??= api<Gateway>('/api/student/fees/gateway').catch((e) => { gateway = null; throw e; }));

let script: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return (script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => { script = null; reject(new ApiError(503, 'Could not load the payment window. Check your connection.', 'gateway_unavailable')); };
    document.head.appendChild(s);
  }));
}

/** What is being paid: an instalment of a plan, or the balance of one fee head. */
export type PayTarget = { instalmentId: string } | { feeItemId: string };

export const payInstalment = (instalmentId: string) => pay({ instalmentId });
export const payFeeItem = (feeItemId: string) => pay({ feeItemId });

async function pay(target: PayTarget): Promise<PaidReceipt> {
  const gw = await getGateway();

  if (gw.provider !== 'razorpay') {
    return api<PaidReceipt>('/api/student/fees/pay', { method: 'POST', body: { ...target, mode: 'UPI' } });
  }

  const order = await api<{ keyId: string; orderId: string; amount: number; currency: string; description: string; prefill: Record<string, string> }>(
    '/api/student/fees/order', { method: 'POST', body: target },
  );
  await loadCheckout();

  const paid = await new Promise<RazorpayResponse>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: document.title || 'Fee payment',
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#16264A' },
      handler: resolve,
      modal: { ondismiss: () => reject(new ApiError(499, 'Payment cancelled', 'cancelled')) },
    });
    checkout.on('payment.failed', (r) => reject(new ApiError(402, r.error.description || 'Payment failed', 'payment_failed')));
    checkout.open();
  });

  return api<PaidReceipt>('/api/student/fees/verify', { method: 'POST', body: paid });
}
