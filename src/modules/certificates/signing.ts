import crypto from 'node:crypto';
import { currentTenant, prisma } from '../../db.js';
import { env } from '../../env.js';

/**
 * The institution's certificate signing keys, and the signature itself.
 *
 * Ed25519: a certificate signed with the private key can be checked by anyone
 * holding the public key, which /api/verify/keys publishes — so an employer
 * or a university need not trust this server's word, only its key.
 *
 * Where the private key lives:
 *  - CERT_SIGNING_KEY set (PKCS#8 PEM): the key is held in the environment
 *    and never written to the database; only its public half is filed.
 *  - otherwise a key is made on first use and kept in the institute's own
 *    database. An administrator can rotate it; retired keys keep verifying.
 */

export interface SigningKey { id: string; privateKey: crypto.KeyObject; publicKeyPem: string }

const ALG = 'Ed25519';
const kidFor = (publicKeyPem: string) => `k-${crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16)}`;

function envKey(): { privateKey: crypto.KeyObject; publicKeyPem: string } | null {
  if (!env.CERT_SIGNING_KEY) return null;
  // Accept the PEM as is, with escaped newlines, or base64-encoded whole.
  const raw = env.CERT_SIGNING_KEY.includes('BEGIN') ? env.CERT_SIGNING_KEY.replace(/\\n/g, '\n') : Buffer.from(env.CERT_SIGNING_KEY, 'base64').toString('utf8');
  const privateKey = crypto.createPrivateKey(raw);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('CERT_SIGNING_KEY must be an Ed25519 private key');
  return { privateKey, publicKeyPem: crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString() };
}

const active = new Map<string, SigningKey>();
const tenantKey = () => currentTenant()?.slug ?? 'default';

/** The key that signs now, making one if the institute has none. */
export async function signingKey(): Promise<SigningKey> {
  const cached = active.get(tenantKey());
  if (cached) return cached;

  const fromEnv = envKey();
  if (fromEnv) {
    const id = kidFor(fromEnv.publicKeyPem);
    await prisma.certificateSigningKey.upsert({ where: { id }, update: {}, create: { id, algorithm: ALG, publicKey: fromEnv.publicKeyPem, privateKey: null } });
    const key = { id, privateKey: fromEnv.privateKey, publicKeyPem: fromEnv.publicKeyPem };
    active.set(tenantKey(), key);
    return key;
  }

  let row = await prisma.certificateSigningKey.findFirst({ where: { retiredAt: null, privateKey: { not: null } }, orderBy: { createdAt: 'desc' } });
  if (!row) row = await createKey();
  const key = { id: row.id, privateKey: crypto.createPrivateKey(row.privateKey!), publicKeyPem: row.publicKey };
  active.set(tenantKey(), key);
  return key;
}

async function createKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return prisma.certificateSigningKey.create({
    data: { id: kidFor(publicKeyPem), algorithm: ALG, publicKey: publicKeyPem, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() },
  });
}

/**
 * Retires the signing key and makes a new one. Certificates already issued
 * keep verifying against the retired key; new ones are signed by the new key.
 */
export async function rotateKey() {
  if (env.CERT_SIGNING_KEY) throw new Error('The signing key is held in CERT_SIGNING_KEY; rotate it there');
  await prisma.certificateSigningKey.updateMany({ where: { retiredAt: null }, data: { retiredAt: new Date() } });
  active.delete(tenantKey());
  const row = await createKey();
  active.set(tenantKey(), { id: row.id, privateKey: crypto.createPrivateKey(row.privateKey!), publicKeyPem: row.publicKey });
  return row;
}

/** Every key, public halves only. */
export async function publicKeys() {
  await signingKey(); // an institute that has never issued still publishes the key it will sign with
  const rows = await prisma.certificateSigningKey.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, algorithm: true, publicKey: true, createdAt: true, retiredAt: true } });
  return rows.map((r) => {
    const jwk = crypto.createPublicKey(r.publicKey).export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
    return { kid: r.id, alg: 'EdDSA', algorithm: r.algorithm, kty: jwk.kty, crv: jwk.crv, x: jwk.x, publicKeyPem: r.publicKey, createdAt: r.createdAt, retiredAt: r.retiredAt, signing: r.retiredAt === null };
  });
}

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface CertificatePayload {
  v: 1;
  institution: { name: string; code: string };
  serialNo: string;
  type: string;
  title: string;
  statement: string;
  recipient: { name: string; ref: string | null };
  fields: Array<[string, string]>;
  issuedAt: string;
  validUntil: string | null;
  issuer: { name: string; title: string };
}

/** JSON with its keys sorted at every level, so the same certificate always gives the same bytes. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (data: string | Buffer | Uint8Array) => crypto.createHash('sha256').update(data).digest('hex');

export function sign(payload: CertificatePayload, key: SigningKey) {
  const bytes = Buffer.from(canonical(payload), 'utf8');
  return { payloadHash: sha256(bytes), signature: crypto.sign(null, bytes, key.privateKey).toString('base64url') };
}

/** Checks a stored signature against the payload rebuilt from the stored record. */
export function verifySignature(payload: CertificatePayload, signature: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(canonical(payload), 'utf8'), crypto.createPublicKey(publicKeyPem), Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}
