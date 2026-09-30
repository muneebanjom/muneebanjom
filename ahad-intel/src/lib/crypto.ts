import crypto from 'node:crypto';
import { env } from './env';

/**
 * Envelope encryption for PII (contact email/phone) and integration credentials.
 *
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 * Algorithm: AES-256-GCM with a 32-byte key from APP_ENCRYPTION_KEY (base64).
 *
 * In development without a key, values are stored with a `plain.` prefix so the
 * app still runs — production refuses to boot without a key (see env.ts).
 */
const PREFIX = 'v1';
const PLAIN = 'plain';

function key(): Buffer | null {
  const raw = env().APP_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return buf;
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return null;
  const k = key();
  if (!k) return `${PLAIN}.${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts[0] === PLAIN) return Buffer.from(parts[1] ?? '', 'base64').toString('utf8');
  if (parts[0] !== PREFIX || parts.length !== 4) return null;
  const k = key();
  if (!k) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Deterministic, non-reversible lookup key for dedupe without decrypting. */
export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const secret = env().APP_ENCRYPTION_KEY ?? env().AUTH_SECRET;
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

/** Mask PII for display to users without `pii:read`, and for audit payloads. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return '•••';
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  return `${'•'.repeat(Math.max(phone.length - 4, 4))}${phone.slice(-4)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Deterministic PRNG so a given day's feed is reproducible. */
export function seededRandom(seed: string): () => number {
  let h = crypto.createHash('sha256').update(seed).digest().readUInt32BE(0) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 0xffffffff;
  };
}
