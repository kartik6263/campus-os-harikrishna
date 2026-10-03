import crypto from 'node:crypto';
import { env } from '../env.js';
import { ApiError } from './http.js';

/**
 * Razorpay, over its REST API (no SDK needed).
 *
 * Configured by RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET; the webhook by
 * RAZORPAY_WEBHOOK_SECRET. Amounts on the ledger are whole rupees; Razorpay
 * counts in paise.
 */
export const razorpayEnabled = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

const API = 'https://api.razorpay.com/v1';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(503, 'Could not reach the payment gateway. Try again.', 'gateway_unavailable');
  }
  const body = (await res.json().catch(() => null)) as T & { error?: { description?: string } };
  if (!res.ok) {
    console.error('[razorpay]', res.status, body?.error);
    throw new ApiError(502, body?.error?.description ?? 'The payment gateway refused the request', 'gateway_error');
  }
  return body;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string;
}

export function createOrder(rupees: number, receipt: string, notes: Record<string, string>) {
  return call<RazorpayOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: rupees * 100, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
  });
}

export const fetchOrder = (id: string) => call<RazorpayOrder>(`/orders/${encodeURIComponent(id)}`);
export const fetchPayment = (id: string) => call<RazorpayPayment>(`/payments/${encodeURIComponent(id)}`);

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** The signature Checkout hands back: HMAC-SHA256 of "order_id|payment_id" under the key secret. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex');
  return /^[0-9a-f]+$/i.test(signature) && safeEqualHex(expected, signature);
}

/** A webhook's X-Razorpay-Signature: HMAC-SHA256 of the raw body under the webhook secret. */
export function webhookSignatureValid(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return /^[0-9a-f]+$/i.test(signature) && safeEqualHex(expected, signature);
}
