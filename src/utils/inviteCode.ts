import pako from 'pako';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { InvitePayload } from '../types';

/**
 * Invite code utilities.
 *
 * An invite code is a compact, shareable string that carries everything a
 * device needs to replicate the owner's Mediora setup:
 *
 *   - Jellyfin server URL + a freshly created user/password
 *   - Sonarr URL + API key + root folder + quality profile
 *   - Radarr URL + API key + root folder + quality profile
 *
 * Encoding (v1): the JSON payload is gzipped (pako) and encrypted with
 * XChaCha20-Poly1305 using a key derived from a passphrase via
 * PBKDF2-SHA256. The envelope is:
 *
 *   magic "ME" (2) | version (1) | iterations BE32 (4) | salt (16) |
 *   nonce (24) | ciphertext || auth tag (16)
 *
 * ...then base64url-encoded and wrapped in a custom URL
 * (`mediora://invite?c=<code>`) so it can be deep-linked, sent over
 * iMessage, or displayed as a QR code.
 *
 * The passphrase is chosen when the invite is generated and shared
 * out-of-band (never inside the link/QR). Both the code and the passphrase
 * are required to redeem, so leaking one of the two is not enough.
 *
 * Legacy codes (v0: base64url of gzip, no encryption) are still accepted.
 */

export const INVITE_URL_SCHEME = 'mediora';
export const INVITE_URL_HOST = 'invite';
export const INVITE_QUERY_KEY = 'c';

export const INVITE_URL_PREFIX = `${INVITE_URL_SCHEME}://${INVITE_URL_HOST}?${INVITE_QUERY_KEY}=`;

/** PBKDF2-SHA256 iterations. Stored in the envelope so it can be raised later. */
const PBKDF2_ITERATIONS = 200_000;
const KEY_LENGTH = 32; // 256-bit key for XChaCha20
const SALT_LENGTH = 16;
const NONCE_LENGTH = 24; // XChaCha20 nonce
const ENVELOPE_MAGIC = [0x4d, 0x45]; // "ME" (Mediora Encrypted)
const ENVELOPE_VERSION = 1;

export type InviteCodeKind = 'encrypted' | 'legacy';

// ---------------------------------------------------------------------------
// Small byte / encoding helpers
// ---------------------------------------------------------------------------

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  // String.fromCharCode.apply blows the stack on large arrays, so chunk it.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return binary;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = (globalThis as any).atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  const b64 = (globalThis as any).btoa(bytesToBinaryString(bytes));
  let result = b64.split('+').join('-').split('/').join('_');
  while (result.endsWith('=')) {
    result = result.slice(0, -1);
  }
  return result;
}

function fromBase64Url(value: string): Uint8Array {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return base64ToBytes(b64);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt + compress + encode a payload into a bare invite code string.
 * Requires the passphrase that the invitee will need to enter to redeem.
 */
export async function buildInviteCode(
  payload: InvitePayload,
  passphrase: string,
): Promise<string> {
  const plaintext = pako.gzip(JSON.stringify(payload));
  const salt = getRandomBytes(SALT_LENGTH);
  const nonce = getRandomBytes(NONCE_LENGTH);

  // Trim here too so build/decode derive identical keys.
  const key = await pbkdf2Async(sha256, utf8ToBytes(passphrase.trim()), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });

  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

  const iterationsBytes = new Uint8Array(4);
  new DataView(iterationsBytes.buffer).setUint32(0, PBKDF2_ITERATIONS, false);

  const envelope = concatBytes([
    Uint8Array.from(ENVELOPE_MAGIC),
    Uint8Array.from([ENVELOPE_VERSION]),
    iterationsBytes,
    salt,
    nonce,
    ciphertext,
  ]);

  return toBase64Url(envelope);
}

/** Wrap a bare code into a deep-linkable invite URL. */
export function buildInviteUrl(code: string): string {
  return `${INVITE_URL_PREFIX}${code}`;
}

/**
 * Parse user input (pasted/typed) into an invite code.
 * Accepts either the full `mediora://invite?c=...` URL or the bare code.
 */
export function extractInviteCode(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  // Full deep-link URL form
  const lower = trimmed.toLowerCase();
  if (lower.startsWith(`${INVITE_URL_SCHEME}://`)) {
    // Host must be exactly "invite" (e.g. mediora://invite?c=CODE).
    const rest = trimmed.slice(`${INVITE_URL_SCHEME}://`.length);
    let hostEnd = rest.length;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '/' || rest[i] === '?') {
        hostEnd = i;
        break;
      }
    }
    const host = rest.slice(0, hostEnd).toLowerCase();
    if (host !== INVITE_URL_HOST) {
      return null;
    }

    const query = trimmed.split('?', 2)[1];
    if (!query) return null;
    for (const part of query.split('&')) {
      const eqIndex = part.indexOf('=');
      const key = (eqIndex === -1 ? part : part.slice(0, eqIndex)).trim();
      if (key.toLowerCase() === INVITE_QUERY_KEY && eqIndex !== -1) {
        const value = decodeURIComponent(part.slice(eqIndex + 1).trim());
        if (value) return value;
      }
    }
    return null;
  }

  // Bare code (base64url: letters, digits, '-' and '_')
  if (/^[A-Za-z0-9\-_]+$/.test(trimmed) && trimmed.length >= 20) {
    return trimmed;
  }

  return null;
}

/**
 * Identify whether a bare code is passphrase-encrypted (v1 envelope) or a
 * legacy unencrypted (gzip-only) code. Throws if the code is neither.
 */
export function inspectInviteCode(code: string): InviteCodeKind {
  const bytes = fromBase64Url(code.trim());
  if (bytes.length < 2) {
    throw new Error('That doesn\'t look like a valid invite code.');
  }
  if (bytes[0] === ENVELOPE_MAGIC[0] && bytes[1] === ENVELOPE_MAGIC[1]) {
    return 'encrypted';
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return 'legacy';
  }
  throw new Error('That doesn\'t look like a valid invite code.');
}

function validatePayload(parsed: unknown): InvitePayload {
  if (!parsed || typeof parsed !== 'object' || !(parsed as any).jellyfin) {
    throw new Error('Invite code is missing required data');
  }

  const payload = parsed as InvitePayload;
  if (
    !payload.jellyfin.serverUrl ||
    !payload.jellyfin.username ||
    !payload.jellyfin.password
  ) {
    throw new Error('Invite code is missing Jellyfin credentials');
  }

  return payload;
}

function decodeLegacyCode(bytes: Uint8Array): InvitePayload {
  const json = pako.ungzip(bytes, { to: 'string' });
  return validatePayload(JSON.parse(json));
}

/**
 * Decrypt + decompress an invite code back into its payload.
 * Passphrase is required for encrypted codes and ignored for legacy ones.
 */
export async function decodeInviteCode(
  code: string,
  passphrase?: string,
): Promise<InvitePayload> {
  const bytes = fromBase64Url(code.trim());

  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return decodeLegacyCode(bytes);
  }

  if (
    bytes.length < 2 ||
    bytes[0] !== ENVELOPE_MAGIC[0] ||
    bytes[1] !== ENVELOPE_MAGIC[1]
  ) {
    throw new Error('That doesn\'t look like a valid invite code.');
  }

  const version = bytes[2];
  if (version !== ENVELOPE_VERSION) {
    throw new Error(
      `This invite code was created by a newer version of Mediora (v${version}). Update the app to redeem it.`,
    );
  }

  if (!passphrase || !passphrase.trim()) {
    throw new Error(
      'This invite code is protected with a passphrase. Enter the passphrase shared with you separately.',
    );
  }

  const iterations = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(3, false);
  const salt = bytes.subarray(7, 7 + SALT_LENGTH);
  const nonce = bytes.subarray(7 + SALT_LENGTH, 7 + SALT_LENGTH + NONCE_LENGTH);
  const ciphertext = bytes.subarray(7 + SALT_LENGTH + NONCE_LENGTH);

  const key = await pbkdf2Async(sha256, utf8ToBytes(passphrase.trim()), salt, {
    c: iterations,
    dkLen: KEY_LENGTH,
  });

  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  } catch {
    throw new Error('Incorrect passphrase — could not decrypt the invite code.');
  }

  let json: string;
  try {
    json = pako.ungzip(plaintext, { to: 'string' });
  } catch {
    throw new Error('Incorrect passphrase — could not decrypt the invite code.');
  }

  return validatePayload(JSON.parse(json));
}

/** Parse a URL or bare code and decode it in one step. */
export async function parseInviteInput(
  input: string,
  passphrase?: string,
): Promise<InvitePayload> {
  const code = extractInviteCode(input);
  if (!code) {
    throw new Error(
      'That doesn\'t look like a valid invite code. Check the code or link and try again.',
    );
  }
  return decodeInviteCode(code, passphrase);
}

/**
 * Consume an invite deep-link URL exactly once. Onboarding renders first on
 * cold start (when no setup exists) and the navigator mounts right after
 * onboarding unmounts — without this guard the same initial URL would be
 * processed twice and re-open the redeem screen after a successful redeem.
 * Distinct URLs (e.g. a second invite opened later) still pass through.
 */
let consumedInviteUrl: string | null = null;

export function consumeInviteUrl(
  url: string | null | undefined,
): string | null {
  if (!url || url === consumedInviteUrl) return null;
  const code = extractInviteCode(url);
  if (!code) return null;
  consumedInviteUrl = url;
  return code;
}

/** Generate a random, human-typeable password (no ambiguous characters). */
export function generateInvitePassword(length: number = 16): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
  const randomValues = new Uint32Array(length);
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  let password = '';
  for (let i = 0; i < length; i++) {
    password += alphabet[randomValues[i] % alphabet.length];
  }
  return password;
}

/**
 * Generate a short numeric passphrase for an invite. Numeric so it is easy to
 * type on the Apple TV remote. Uses rejection sampling to avoid modulo bias.
 */
export function generateInvitePassphrase(length: number = 6): string {
  const bytes = getRandomBytes(length);
  let result = '';
  for (const byte of bytes) {
    // Values >= 250 would bias 0-5; resample.
    let value = byte;
    while (value >= 250) {
      value = getRandomBytes(1)[0];
    }
    result += String(value % 10);
  }
  return result;
}

/** Turn an invitee's display name into a Jellyfin username. */
export function sanitizeUsername(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'user';
}
