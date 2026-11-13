const crypto = require('crypto');
const https = require('https');
const axios = require('axios');

const CACHE_TTL_MS = 30 * 60 * 1000;
const AAD_CANDIDATES = ['steam-cookie-v2', 'steam-cookie-v1', undefined];
// 默认严格校验证书。只有在被本机 hosts 劫持（如 Watt Toolkit）的环境里调试时，
// 才允许显式设置 ALLOW_INSECURE_TLS=1 关掉校验；生产环境绝不应开启。
const httpsAgent =
  process.env.ALLOW_INSECURE_TLS === '1'
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

let cachedCredentials = null;
let lastFetchTime = 0;
let pendingRequest = null;

function getCookieFileUrl() {
  const owner = process.env.COOKIE_REPO_OWNER || 'QSlotus';
  const repo = process.env.COOKIE_REPO_NAME || 'auto-we';
  const filePath = process.env.COOKIE_FILE_PATH || 'cookie.enc.json';
  const encodedPath = filePath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/main/${encodedPath}`;
}

async function downloadCookieFile() {
  const url = getCookieFileUrl();
  console.log(`[CookieManager] Fetching encrypted cookie file: ${url}`);

  const response = await axios.get(url, {
    headers: { 'User-Agent': 'WallpaperSearch' },
    ...(httpsAgent ? { httpsAgent } : {}),
    timeout: 15_000,
  });

  if (!response.data || typeof response.data !== 'object') {
    throw new Error('Encrypted cookie file did not contain a JSON object');
  }

  return response.data;
}

function decryptValue(encryptedBase64, key, aad) {
  if (typeof encryptedBase64 !== 'string' || !encryptedBase64) {
    throw new Error('Encrypted cookie value is missing');
  }

  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const combined = Buffer.from(encryptedBase64, 'base64');

  if (combined.length < 28) {
    throw new Error(`Encrypted cookie value is too short (${combined.length} bytes)`);
  }

  const nonce = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonce);

  decipher.setAuthTag(authTag);
  if (aad) {
    decipher.setAAD(Buffer.from(aad));
  }

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decryptWithSupportedAad(encryptedValue, key) {
  let lastError;

  for (const aad of AAD_CANDIDATES) {
    try {
      return decryptValue(encryptedValue, key, aad);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to decrypt cookie with a supported AAD: ${lastError?.message || 'unknown error'}`);
}

function parseEncryptedCookieFile(data, encryptKey) {
  let steamLoginSecure;
  let sessionid = '';

  if (data.encrypted_cookies) {
    steamLoginSecure = decryptWithSupportedAad(
      data.encrypted_cookies.steamLoginSecure,
      encryptKey
    );

    if (data.encrypted_cookies.sessionid) {
      sessionid = decryptWithSupportedAad(data.encrypted_cookies.sessionid, encryptKey);
    }
  } else if (data.encrypted_cookie) {
    steamLoginSecure = decryptValue(data.encrypted_cookie, encryptKey, 'steam-cookie-v1');
  } else {
    throw new Error('Unrecognized encrypted cookie file format');
  }

  if (!steamLoginSecure) {
    throw new Error('Decrypted steamLoginSecure cookie is empty');
  }

  return {
    steamLoginSecure,
    sessionid,
    updatedAt: data.updated_at || 'unknown',
  };
}

async function fetchAndDecryptCookies(encryptKey) {
  const data = await downloadCookieFile();
  const credentials = parseEncryptedCookieFile(data, encryptKey);

  cachedCredentials = credentials;
  lastFetchTime = Date.now();
  console.log(`[CookieManager] Cookies refreshed (source updated at: ${credentials.updatedAt})`);

  return credentials;
}

async function getDecryptedCookies(force = false) {
  const encryptKey = process.env.COOKIE_ENCRYPT_KEY;
  if (!encryptKey) {
    throw new Error('COOKIE_ENCRYPT_KEY environment variable is not set');
  }

  if (!force && cachedCredentials && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedCredentials;
  }

  if (!force && pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = fetchAndDecryptCookies(encryptKey);
  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

async function refreshCookies() {
  cachedCredentials = null;
  lastFetchTime = 0;
  return getDecryptedCookies(true);
}

function getCookieHeader(credentials) {
  return `sessionid=${credentials.sessionid}; steamLoginSecure=${credentials.steamLoginSecure}`;
}

module.exports = {
  decryptValue,
  getCookieHeader,
  getDecryptedCookies,
  parseEncryptedCookieFile,
  refreshCookies,
};
