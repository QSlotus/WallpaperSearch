const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const axios = require('axios');

const MODULE_PATH = require.resolve('../lib/cookieManager');

function encryptValue(value, key, aad) {
  const nonce = crypto.randomBytes(12);
  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, nonce);

  if (aad) {
    cipher.setAAD(Buffer.from(aad));
  }

  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64');
}

test('parses v2 encrypted cookies with supported AAD fallback', () => {
  const key = 'test-encryption-key';
  const { parseEncryptedCookieFile } = require(MODULE_PATH);
  const result = parseEncryptedCookieFile(
    {
      version: 2,
      encrypted_cookies: {
        steamLoginSecure: encryptValue('secure-cookie', key, 'steam-cookie-v2'),
        sessionid: encryptValue('session-cookie', key, 'steam-cookie-v1'),
      },
      updated_at: '2026-08-05T00:00:00Z',
    },
    key
  );

  assert.deepEqual(result, {
    steamLoginSecure: 'secure-cookie',
    sessionid: 'session-cookie',
    updatedAt: '2026-08-05T00:00:00Z',
  });
});

test('parses the legacy v1 encrypted cookie format', () => {
  const key = 'legacy-key';
  const { parseEncryptedCookieFile } = require(MODULE_PATH);
  const result = parseEncryptedCookieFile(
    { encrypted_cookie: encryptValue('legacy-cookie', key, 'steam-cookie-v1') },
    key
  );

  assert.equal(result.steamLoginSecure, 'legacy-cookie');
  assert.equal(result.sessionid, '');
});

test('caches downloads and supports a forced refresh', async (t) => {
  const originalGet = axios.get;
  const originalKey = process.env.COOKIE_ENCRYPT_KEY;
  const key = 'cache-test-key';
  let requests = 0;

  process.env.COOKIE_ENCRYPT_KEY = key;
  axios.get = async () => {
    requests += 1;
    return {
      data: {
        encrypted_cookies: {
          steamLoginSecure: encryptValue(`secure-${requests}`, key, 'steam-cookie-v2'),
          sessionid: encryptValue(`session-${requests}`, key, 'steam-cookie-v2'),
        },
      },
    };
  };

  delete require.cache[MODULE_PATH];
  const { getDecryptedCookies, refreshCookies } = require(MODULE_PATH);

  t.after(() => {
    axios.get = originalGet;
    if (originalKey === undefined) {
      delete process.env.COOKIE_ENCRYPT_KEY;
    } else {
      process.env.COOKIE_ENCRYPT_KEY = originalKey;
    }
    delete require.cache[MODULE_PATH];
  });

  const first = await getDecryptedCookies();
  const cached = await getDecryptedCookies();
  const refreshed = await refreshCookies();

  assert.equal(requests, 2);
  assert.equal(cached, first);
  assert.equal(first.steamLoginSecure, 'secure-1');
  assert.equal(refreshed.steamLoginSecure, 'secure-2');
});

test('requires COOKIE_ENCRYPT_KEY', async (t) => {
  const originalKey = process.env.COOKIE_ENCRYPT_KEY;
  delete process.env.COOKIE_ENCRYPT_KEY;
  delete require.cache[MODULE_PATH];

  t.after(() => {
    if (originalKey !== undefined) process.env.COOKIE_ENCRYPT_KEY = originalKey;
    delete require.cache[MODULE_PATH];
  });

  const { getDecryptedCookies } = require(MODULE_PATH);
  await assert.rejects(getDecryptedCookies(), /COOKIE_ENCRYPT_KEY/);
});
