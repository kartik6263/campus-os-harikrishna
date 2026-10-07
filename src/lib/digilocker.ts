import crypto from 'node:crypto';
import { env } from '../env.js';
import { currentTenant } from '../db.js';
import { ApiError } from './http.js';

/**
 * DigiLocker, as a Requester, over its OAuth 2.0 API with PKCE.
 *
 * The person signs in at DigiLocker and consents; DigiLocker sends them back
 * to the web app with a one-time code, which this server exchanges (with the
 * client secret, never seen by a browser) for a token good for one pull of
 * their identity, their e-Aadhaar summary and the list of documents issued to
 * them. The token is used once and dropped.
 *
 * Configured by DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET, issued to
 * the institute on partners.digilocker.gov.in with the redirect URI below
 * registered against them.
 */
export const digilockerEnabled = () => Boolean(env.DIGILOCKER_CLIENT_ID && env.DIGILOCKER_CLIENT_SECRET);

/** Where DigiLocker sends the person back: the web app, which hands the code to us. */
export function redirectUri(): string {
  if (env.DIGILOCKER_REDIRECT_URI) return env.DIGILOCKER_REDIRECT_URI;
  const tenant = currentTenant();
  const base = tenant && env.APP_URL_TEMPLATE ? env.APP_URL_TEMPLATE.replace('{slug}', tenant.slug) : env.APP_URL;
  return base.replace(/\/?$/, '/');
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** A fresh PKCE pair (RFC 7636, S256). */
export function pkce() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string, redirect: string): string {
  const u = new URL(`${env.DIGILOCKER_API_BASE}/1/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.DIGILOCKER_CLIENT_ID!);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export interface DigilockerToken {
  access_token: string;
  digilockerid?: string;
  name?: string;
  dob?: string;
  gender?: string;
  eaadhaar?: string;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${env.DIGILOCKER_API_BASE}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ApiError(502, 'DigiLocker could not be reached. Please try again in a few minutes.');
  }
}

/** Trades the one-time code for a token. */
export async function exchangeCode(code: string, verifier: string, redirect: string): Promise<DigilockerToken> {
  const res = await call('/1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.DIGILOCKER_CLIENT_ID!,
      client_secret: env.DIGILOCKER_CLIENT_SECRET!,
      redirect_uri: redirect,
      code_verifier: verifier,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<DigilockerToken> & { error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new ApiError(502, `DigiLocker refused the sign-in: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}. Please start again.`);
  }
  return body as DigilockerToken;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The account's own details, for when the token response leaves them out. */
export async function fetchUser(token: string): Promise<Partial<DigilockerToken>> {
  const res = await call('/1/user', { headers: bearer(token) });
  if (!res.ok) throw new ApiError(502, `DigiLocker did not return your details (HTTP ${res.status}).`);
  return (await res.json()) as Partial<DigilockerToken>;
}

export interface IssuedDoc {
  name: string;
  uri: string;
  doctype: string;
  description: string;
  issuer: string;
  issuerid: string;
  date: string;
}

/** Documents issued into the person's DigiLocker by government and other issuers. */
export async function fetchIssued(token: string): Promise<IssuedDoc[]> {
  const res = await call('/2/files/issued', { headers: bearer(token) });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => ({}))) as { items?: Array<Partial<IssuedDoc>> };
  return (body.items ?? []).map((d) => ({
    name: String(d.name ?? ''),
    uri: String(d.uri ?? ''),
    doctype: String(d.doctype ?? ''),
    description: String(d.description ?? ''),
    issuer: String(d.issuer ?? ''),
    issuerid: String(d.issuerid ?? ''),
    date: String(d.date ?? ''),
  }));
}

/** An issued document's machine-readable XML, signed by its issuer. */
export async function fetchXml(token: string, uri: string): Promise<string | null> {
  const res = await call(`/1/xml/${encodeURIComponent(uri)}`, { headers: bearer(token) });
  return res.ok ? res.text() : null;
}

/**
 * The e-Aadhaar's demographic summary. Aadhaar is never stored: only the last
 * four digits of the masked number, the name and the date of birth on it.
 */
export async function fetchEaadhaar(token: string): Promise<{ last4: string | null; name: string | null; dob: string | null } | null> {
  const res = await call('/3/xml/eaadhaar', { headers: bearer(token) });
  if (!res.ok) return null;
  const xml = await res.text();
  const attr = (tag: string, name: string) => xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;
  const uid = attr('UidData', 'uid') ?? attr('KycRes', 'uid');
  const dob = attr('Poi', 'dob');
  return {
    last4: uid ? uid.replace(/\D/g, '').slice(-4) || null : null,
    name: attr('Poi', 'name'),
    // e-Aadhaar writes DD-MM-YYYY; keep DigiLocker's DDMMYYYY throughout.
    dob: dob ? dob.replace(/\D/g, '') : null,
  };
}

// ─── The Academic Bank of Credits ID ──────────────────────────────────────────

/** The ABC ID (now the APAAR ID) is twelve digits. */
export const ABC_ID = /^\d{12}$/;
export const cleanAbcId = (raw: string) => raw.replace(/[\s-]/g, '');

/** Whether an issued document is the ABC / APAAR ID card. */
export function isAbcCard(d: IssuedDoc): boolean {
  return /^(ABCID|ABCCD|APAAR|APAARID|APAID)$/i.test(d.doctype)
    || /academic bank of credit|apaar/i.test(`${d.issuer} ${d.name} ${d.description}`);
}

/** Reads the twelve-digit ID off the card: its URI first, else its signed XML. */
export async function abcIdFrom(token: string, card: IssuedDoc): Promise<string | null> {
  const fromUri = card.uri.match(/(?:^|\D)(\d{12})$/)?.[1];
  if (fromUri) return fromUri;
  const xml = await fetchXml(token, card.uri);
  if (!xml) return null;
  const named = xml.match(/\b(?:abc_?id|abcAccountId|apaar_?id|apaarId)\s*=\s*"([\d\s-]{12,16})"/i)?.[1]
    ?? xml.match(/<(?:abc_?id|apaar_?id)\b[^>]*>([\d\s-]{12,16})</i)?.[1];
  const id = named ? cleanAbcId(named) : null;
  return id && ABC_ID.test(id) ? id : null;
}

// ─── Matching against the institution's record ────────────────────────────────

const HONORIFIC = /^(mr|mrs|ms|miss|dr|prof|shri|smt|kumari|km|sri|late)$/;

const nameTokens = (name: string) =>
  name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t && !HONORIFIC.test(t));

/**
 * Whether two spellings name the same person: the same words in any order,
 * or one a fuller form of the other (a middle name the record leaves out).
 * Initials match the word they abbreviate.
 */
export function namesMatch(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const pool = [...long];
  for (const t of short) {
    const i = pool.findIndex((p) => p === t || (t.length === 1 && p.startsWith(t)) || (p.length === 1 && t.startsWith(p)));
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  // Two words must agree, unless the shorter name is a single word.
  return short.length >= Math.min(2, long.length);
}

/**
 * A stored date as DDMMYYYY on the Indian calendar. Dates of birth are kept
 * as midnight IST (18:30 UTC the day before), so reading them in UTC would
 * be a day early; a UTC midnight reads the same either way.
 */
export function istDate(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${String(ist.getUTCDate()).padStart(2, '0')}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${ist.getUTCFullYear()}`;
}

/** DigiLocker's DDMMYYYY against a stored date of birth. */
export function dobMatches(dl: string, dob: Date): boolean {
  const d = dl.replace(/\D/g, '');
  return d.length === 8 && d === istDate(dob);
}
