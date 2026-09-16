import pako from 'pako';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  buildInviteCode,
  buildInviteUrl,
  decodeInviteCode,
  extractInviteCode,
  generateInvitePassword,
  generateInvitePassphrase,
  inspectInviteCode,
  parseInviteInput,
  sanitizeUsername,
  INVITE_URL_PREFIX,
} from '../src/utils/inviteCode';
import { InvitePayload } from '../src/types';

const PASSPHRASE = '482913';
const PBKDF2_ITERATIONS = 200_000;

const samplePayload: InvitePayload = {
  v: 2,
  name: 'Sister',
  backendMode: 'mediarr',
  mediarrServer: null,
  jellyfin: {
    serverUrl: 'http://100.64.0.10:8096',
    username: 'sister',
    password: 'hK3!mP9@qR2#sT4$',
  },
  sonarr: {
    serverUrl: 'http://100.64.0.10:8989',
    apiKey: '0123456789abcdef0123456789abcdef',
    rootFolderPath: '/data/media/tv',
    qualityProfileId: 1,
  },
  radarr: {
    serverUrl: 'http://100.64.0.10:7878',
    apiKey: 'fedcba9876543210fedcba9876543210',
    rootFolderPath: '/data/media/movies',
    qualityProfileId: 2,
  },
};

const mediarrServerPayload: InvitePayload = {
  v: 2,
  name: 'Uncle Bob',
  backendMode: 'mediarr-server',
  mediarrServer: {
    serverUrl: 'http://100.64.0.10:5055',
    apiKey: 'abcdefabcdefabcdefabcdefabcdefab',
  },
  jellyfin: {
    serverUrl: 'http://100.64.0.10:8096',
    username: 'uncle-bob',
    password: 'zZ9!pQ2@wE4#rT6$',
  },
  sonarr: null,
  radarr: null,
};

// A payload in the previous (v1) shape: encrypted envelope over gzipped JSON.
const v1Payload: InvitePayload = {
  ...samplePayload,
  v: 1,
  backendMode: 'mediarr-server',
  mediarrServer: {
    serverUrl: 'http://100.64.0.10:5055',
    apiKey: 'abcdefabcdefabcdefabcdefabcdefab',
  },
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 0x8000)),
    );
  }
  let b64 = (globalThis as any)
    .btoa(binary)
    .split('+')
    .join('-')
    .split('/')
    .join('_');
  while (b64.endsWith('=')) {
    b64 = b64.slice(0, -1);
  }
  return b64;
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

/** Build a legacy (v0, unencrypted gzip-only) code for compat tests. */
function legacyCode(payload: InvitePayload): string {
  return toBase64Url(pako.gzip(JSON.stringify(payload)));
}

/** Build a v1 (encrypted envelope over gzipped JSON) code for compat tests. */
async function v1EncryptedCode(
  payload: InvitePayload,
  passphrase: string,
): Promise<string> {
  const gz = pako.gzip(JSON.stringify(payload));
  const salt = new Uint8Array(16).map((_, i) => i + 1);
  const nonce = new Uint8Array(24).map((_, i) => i + 1);
  const key = await pbkdf2Async(sha256, utf8ToBytes(passphrase), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(gz);
  const iterations = new Uint8Array(4);
  new DataView(iterations.buffer).setUint32(0, PBKDF2_ITERATIONS, false);
  return toBase64Url(
    concatBytes([
      new Uint8Array([0x4d, 0x45, 1]), // "ME" + version 1
      iterations,
      salt,
      nonce,
      ciphertext,
    ]),
  );
}

describe('invite code codec (encrypted)', () => {
  test('round-trips a payload through build -> decode', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(20);
    expect(await decodeInviteCode(code, PASSPHRASE)).toEqual(samplePayload);
  });

  test('round-trips a mediarr-server payload without arr settings', async () => {
    const code = await buildInviteCode(mediarrServerPayload, PASSPHRASE);
    expect(await decodeInviteCode(code, PASSPHRASE)).toEqual(
      mediarrServerPayload,
    );
  });

  test('v2 codes are substantially shorter than v1 for the same payload', async () => {
    const v2 = await buildInviteCode(samplePayload, PASSPHRASE);
    const v1 = await v1EncryptedCode(samplePayload, PASSPHRASE);
    expect(v2.length).toBeLessThan(v1.length * 0.85);
  });

  test('is passphrase-protected: wrong passphrase fails', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    await expect(decodeInviteCode(code, '000000')).rejects.toThrow(
      /Incorrect passphrase/,
    );
  });

  test('missing passphrase fails with a helpful message', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    await expect(decodeInviteCode(code)).rejects.toThrow(/passphrase/);
  });

  test('inspectInviteCode identifies encrypted vs legacy', async () => {
    const encrypted = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(inspectInviteCode(encrypted)).toBe('encrypted');
    expect(inspectInviteCode(legacyCode(samplePayload))).toBe('legacy');
    expect(() => inspectInviteCode('AAAA')).toThrow();
  });

  test('ciphertext does not leak payload or passphrase', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(code).not.toContain('sister');
    expect(code).not.toContain('482913');
    expect(code).not.toContain('100.64');
  });

  test('random salt/nonce: same input produces different codes', async () => {
    const a = await buildInviteCode(samplePayload, PASSPHRASE);
    const b = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(a).not.toBe(b);
  });

  test('passphrases with unicode and spaces work', async () => {
    const code = await buildInviteCode(samplePayload, '  hérmana✓  ');
    expect(await decodeInviteCode(code, 'hérmana✓')).toEqual(samplePayload);
  });

  test('still decodes v1 (encrypted gzipped-JSON) codes', async () => {
    const code = await v1EncryptedCode(v1Payload, PASSPHRASE);
    expect(inspectInviteCode(code)).toBe('encrypted');
    expect(await decodeInviteCode(code, PASSPHRASE)).toEqual(v1Payload);
    await expect(decodeInviteCode(code, '000000')).rejects.toThrow(
      /Incorrect passphrase/,
    );
  });

  test('still decodes legacy unencrypted codes', async () => {
    const code = legacyCode(samplePayload);
    expect(inspectInviteCode(code)).toBe('legacy');
    expect(await decodeInviteCode(code)).toEqual(samplePayload);
    // Passphrase ignored for legacy codes.
    expect(await decodeInviteCode(code, 'anything')).toEqual(samplePayload);
  });
});

describe('invite code URL handling', () => {
  test('parses a full invite URL', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    const url = buildInviteUrl(code);
    expect(url).toBe(`${INVITE_URL_PREFIX}${code}`);
    expect(extractInviteCode(url)).toBe(code);
  });

  test('parseInviteInput handles both URL and bare code', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(
      await parseInviteInput(buildInviteUrl(code), PASSPHRASE),
    ).toEqual(samplePayload);
    expect(await parseInviteInput(`  ${code}  `, PASSPHRASE)).toEqual(
      samplePayload,
    );
  });

  test('rejects garbage input', () => {
    expect(extractInviteCode('')).toBeNull();
    expect(extractInviteCode('not a code!!')).toBeNull();
    expect(extractInviteCode('https://example.com/?c=abc')).toBeNull();
    expect(extractInviteCode('mediora://other?c=x')).toBeNull();
    expect(extractInviteCode('short')).toBeNull();
  });

  test('decodeInviteCode rejects corrupted input', async () => {
    await expect(decodeInviteCode('AAAA', PASSPHRASE)).rejects.toThrow();
  });
});

describe('invite generators', () => {
  test('password generator uses the requested length and alphabet', () => {
    const password = generateInvitePassword(16);
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[a-zA-Z0-9!@#$%]+$/);
    expect(generateInvitePassword(10)).toHaveLength(10);
  });

  test('passphrase generator produces numeric strings', () => {
    const passphrase = generateInvitePassphrase(6);
    expect(passphrase).toMatch(/^\d{6}$/);
    expect(generateInvitePassphrase(4)).toHaveLength(4);
  });

  test('sanitizeUsername produces valid Jellyfin usernames', () => {
    expect(sanitizeUsername('Sister')).toBe('sister');
    expect(sanitizeUsername('  Aunt Linda  ')).toBe('aunt-linda');
    expect(sanitizeUsername('B@d #Name!')).toBe('b-d-name');
    expect(sanitizeUsername('!!!')).toBe('user');
    expect(sanitizeUsername('')).toBe('user');
  });
});
