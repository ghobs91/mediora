import pako from 'pako';
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

const samplePayload: InvitePayload = {
  v: 1,
  name: 'Sister',
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

const PASSPHRASE = '482913';

/** Build a legacy (v0, unencrypted gzip-only) code for compat tests. */
function legacyCode(payload: InvitePayload): string {
  const gz = pako.gzip(JSON.stringify(payload));
  let binary = '';
  for (let i = 0; i < gz.length; i += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(gz.subarray(i, i + 0x8000)),
    );
  }
  const b64 = (globalThis as any).btoa(binary)
    .split('+')
    .join('-')
    .split('/')
    .join('_');
  let code = b64;
  while (code.endsWith('=')) {
    code = code.slice(0, -1);
  }
  return code;
}

describe('invite code codec (encrypted)', () => {
  test('round-trips a payload through build -> decode', async () => {
    const code = await buildInviteCode(samplePayload, PASSPHRASE);
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(20);
    expect(await decodeInviteCode(code, PASSPHRASE)).toEqual(samplePayload);
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
