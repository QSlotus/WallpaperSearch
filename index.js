require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local', override: true });

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const axios = require('axios');
const { parseHTML } = require('linkedom');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const { formatDescription } = require('./lib/bbcode');
const { MemoryCache } = require('./lib/memoryCache');
const { getCookieHeader, getDecryptedCookies } = require('./lib/cookieManager');
const { parseSsrItems } = require('./lib/steamSsrParser');
const { parseSteamProfile } = require('./lib/steamProfileParser');
const { fetchPreviews } = require('./lib/steamPreviews');
const { normalizeSearchParams, toSortValue } = require('./lib/searchParams');

const WORKSHOP_APP_ID = '431960';
const STEAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const UPSTREAM_TIMEOUT_MS = readNumberEnv('UPSTREAM_TIMEOUT_MS', 15_000);
const SEARCH_CACHE_TTL_MS = readNumberEnv('SEARCH_CACHE_TTL_MS', 5 * 60 * 1000);
const ITEM_CACHE_TTL_MS = readNumberEnv('ITEM_CACHE_TTL_MS', 10 * 60 * 1000);
const DISPLAY_TZ_OFFSET_HOURS = (() => {
  const raw = Number(process.env.DISPLAY_TZ_OFFSET_HOURS);
  return Number.isFinite(raw) ? raw : 8;
})();

const searchCache = new MemoryCache({ ttlMs: SEARCH_CACHE_TTL_MS, maxEntries: 300 });
const itemCache = new MemoryCache({ ttlMs: ITEM_CACHE_TTL_MS, maxEntries: 300 });

// 默认严格校验证书；仅在本机被 hosts 劫持时用 ALLOW_INSECURE_TLS=1 临时放开
const insecureHttpsAgent =
  process.env.ALLOW_INSECURE_TLS === '1'
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

function requestOptions(extra = {}) {
  return insecureHttpsAgent ? { ...extra, httpsAgent: insecureHttpsAgent } : extra;
}

// 常量时间比较，避免用 === 比较邀请码时泄露前缀长度
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function hasMatureAccess(cookies = {}) {
  const inviteCode = process.env.INVITE_CODE;
  if (!inviteCode) return false;
  return safeEqual(cookies.code, inviteCode);
}

// 只保留状态码/错误码/消息，避免把带 Cookie 的 axios config 打进日志
function describeError(error) {
  const status = error?.response?.status;
  const code = error?.code;
  const message = error?.message || String(error);
  return [status ? `status=${status}` : '', code ? `code=${code}` : '', message]
    .filter(Boolean)
    .join(' ');
}

function logUpstreamFailure(label, error) {
  console.error(`[Upstream] ${label} failed: ${describeError(error)}`);
}

function logParseFailure(label, html) {
  const length = typeof html === 'string' ? html.length : 0;
  const hasSsrData = typeof html === 'string' && html.includes('valve-ssr-data');
  const hasLegacySsr = typeof html === 'string' && html.includes('window.SSR');
  console.error(
    `[Parser] ${label} could not be parsed (bytes=${length}, valveSsrData=${hasSsrData}, legacySsr=${hasLegacySsr})`
  );
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.render('home', { title: 'Wallpaper Search' });
});

app.get('/search', async (req, res) => {
  const params = normalizeSearchParams(req.query);
  const result = await handleSearch(params, req.cookies);

  // 只有 Everyone 且成功的响应才允许进公共缓存：
  // Mature 会绕过邀请码，Questionable 同样不适合放进 CDN
  const publiclyCacheable = !result.error && params.requiredTags === 'Everyone';
  res.set(
    'Cache-Control',
    publiclyCacheable ? 'public, max-age=300, stale-while-revalidate=600' : 'private, no-store'
  );

  res.render('search-results', {
    title: 'Search Results - Wallpaper Search',
    items: result.items,
    searchtext: params.searchText,
    requiredtags: params.requiredTags,
    requiredtype: params.requiredType,
    section: params.section,
    page: params.page,
    maxPage: result.maxPage,
    browsesort: toSortValue(params),
    error: result.error,
    errorAction: result.errorAction,
  });
});

app.get('/item/:id', async (req, res) => {
  const sharedfileId = String(req.params.id || '');
  if (!/^\d{1,20}$/.test(sharedfileId)) {
    return res.status(404).render('404', { title: '404 - Page Not Found' });
  }

  let item = itemCache.get(sharedfileId);
  if (!item) {
    item = await handleItemDetail(sharedfileId);
    if (item) itemCache.set(sharedfileId, item);
  }

  if (!item) {
    return res.status(404).render('404', { title: '404 - Page Not Found' });
  }

  // Mature 条目的详情页同样要门禁：否则搜索被拦住，攻击者仍可凭 ID 直接看内容
  if (item.ageRating === 'Mature' && !hasMatureAccess(req.cookies)) {
    res.set('Cache-Control', 'private, no-store');
    return res.status(403).render('content-locked', {
      title: 'Mature content locked - Wallpaper Search',
    });
  }

  // Mature 页一律不进公共缓存，否则授权用户访问后会把缓存喂给未授权用户
  res.set(
    'Cache-Control',
    item.ageRating === 'Mature'
      ? 'private, no-store'
      : 'public, max-age=600, stale-while-revalidate=1800'
  );
  res.render('item-detail', {
    title: `${item.title} - Wallpaper Search`,
    item: { ...item, description: formatDescription(item.description) },
  });
});

app.get('/invite-code', (req, res) => {
  const userCode = req.cookies.code;
  const correctInviteCode = process.env.INVITE_CODE;
  res.set('Cache-Control', 'private, no-store');
  res.render('invite-code', { title: 'Invite Code', code: userCode, correctInviteCode });
});

app.post('/submit-invite-code', (req, res) => {
  const inviteCode = req.body.inviteCode;
  const correctInviteCode = process.env.INVITE_CODE;

  if (inviteCode === correctInviteCode) {
    res.cookie('code', inviteCode, { maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } else {
    res.set('Cache-Control', 'private, no-store');
    res.render('invite-code', {
      title: 'Invite Code',
      error: 'The invite code is incorrect. Please try again.',
      correctInviteCode,
    });
  }
});

app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

// 本地直接运行时启动监听；Serverless 平台只导出 Express app。
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

// ---------------------------------------------------------------------------
// 搜索参数（规范化与白名单在 lib/searchParams.js）
// ---------------------------------------------------------------------------

function buildSteamBrowseUrl(params) {
  const url = new URL('https://steamcommunity.com/workshop/browse/');
  url.searchParams.set('appid', WORKSHOP_APP_ID);
  url.searchParams.set('searchtext', params.searchText);
  url.searchParams.set('section', params.section);
  url.searchParams.set('p', String(params.page));
  url.searchParams.set('browsesort', params.browseSort);

  if (params.browseSort === 'trend') {
    url.searchParams.set('days', String(params.trendDays));
  }
  if (params.requiredTags) {
    url.searchParams.append('requiredtags[]', params.requiredTags);
  }
  if (params.requiredType) {
    url.searchParams.append('requiredtags[]', params.requiredType);
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// 搜索
// ---------------------------------------------------------------------------

async function handleSearch(params, cookies = {}) {
  const matureRequest = params.requiredTags === 'Mature';
  const inviteCode = process.env.INVITE_CODE;

  if (matureRequest && !(inviteCode && safeEqual(cookies.code, inviteCode))) {
    return {
      items: [],
      maxPage: 1,
      mature: true,
      error: 'Mature search is locked.',
      errorAction: 'invite',
    };
  }

  // Wallpaper Engine 2.8.42 起永久移除 Application 类型（工坊侧已清空），
  // 老链接或手工构造的参数会拿到 0 条，这里直接说明原因而不是白跑一次上游请求
  const asksForApplication = params.asksForApplication === true;

  if (asksForApplication) {
    return {
      items: [],
      maxPage: 1,
      mature: matureRequest,
      error:
        'Application wallpapers were permanently removed from the Workshop by Wallpaper Engine 2.8.42 and can no longer be searched.',
    };
  }

  const cacheKey = JSON.stringify([
    params.searchText,
    params.requiredTags,
    params.requiredType,
    params.section,
    params.page,
    params.browseSort,
    params.trendDays,
    matureRequest,
  ]);

  const cached = searchCache.get(cacheKey);
  if (cached) return { ...cached, mature: matureRequest };

  const steamUrl = buildSteamBrowseUrl(params);

  let html;
  try {
    const cookieHeader = getCookieHeader(await getDecryptedCookies());
    const response = await axios.get(
      steamUrl,
      requestOptions({
        headers: {
          Cookie: cookieHeader,
          'User-Agent': STEAM_USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: UPSTREAM_TIMEOUT_MS,
      })
    );
    html = response.data;
  } catch (error) {
    logUpstreamFailure('workshop search', error);
    return {
      items: [],
      maxPage: 1,
      mature: matureRequest,
      error: `Steam is not responding right now (${describeError(error)}). Please try again later.`,
    };
  }

  const parsed = parseItems(html);
  if (!parsed) {
    logParseFailure('workshop search', html);
    return {
      items: [],
      maxPage: 1,
      mature: matureRequest,
      error: 'Steam returned a page this app could not read. The upstream layout may have changed.',
    };
  }

  const result = { items: parsed.items, maxPage: parsed.maxPage };
  if (result.items.length > 0) searchCache.set(cacheKey, result);
  return { ...result, mature: matureRequest };
}

// 解析失败返回 null（调用方据此报错），不再把异常吞成“空结果”
function parseItems(html) {
  if (typeof html !== 'string' || !html) return null;

  const { document } = parseHTML(html);

  const ssrItems = parseSsrItems(document);
  if (ssrItems) return ssrItems;

  // 旧版 DOM 兜底：Steam 2025 改版后已不再输出这些 class，保留仅作兼容
  const items = [];
  document.querySelectorAll('.workshopItem').forEach(item => {
    const sharedfileId = item.querySelector('.ugc')?.dataset.publishedfileid || '';
    if (!sharedfileId) return;
    items.push({
      title: item.querySelector('.workshopItemTitle')?.textContent.trim() || 'Unknown Title',
      previewImage: item.querySelector('.workshopItemPreviewImage')?.src || '',
      sharedfileId,
      authorName:
        item.querySelector('.workshop_author_link')?.textContent.trim() || 'Unknown Author',
    });
  });

  if (items.length === 0) return null;
  return { items, maxPage: parseLegacyMaxPage(document) };
}

function parseLegacyMaxPage(document) {
  const pagingControls = document.querySelector('.workshopBrowsePagingControls');
  if (!pagingControls || pagingControls.innerHTML.trim() === '') return 1;

  const nextPageBtn = Array.from(pagingControls.querySelectorAll('.pagebtn')).find(
    btn => btn.textContent.trim() === '>'
  );

  if (nextPageBtn && !nextPageBtn.classList.contains('disabled')) {
    const prevLink = nextPageBtn.previousElementSibling;
    if (prevLink && prevLink.classList.contains('pagelink')) {
      const parsed = Number.parseInt(prevLink.textContent.trim().replace(/,/g, ''), 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const lastNumberNode = Array.from(pagingControls.childNodes).find(
    node => node.nodeType === 3 && /\d+/.test(node.textContent.trim())
  );
  if (lastNumberNode) {
    const parsed = Number.parseInt(lastNumberNode.textContent.trim().replace(/,/g, ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
}

// ---------------------------------------------------------------------------
// 详情
// ---------------------------------------------------------------------------

async function handleItemDetail(sharedfileId) {
  const steamApiUrl = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
  const data = new URLSearchParams({
    itemcount: 1,
    'publishedfileids[0]': sharedfileId,
  });

  let cookieHeader = '';
  try {
    cookieHeader = getCookieHeader(await getDecryptedCookies());
  } catch (error) {
    logUpstreamFailure('decrypt workshop cookies', error);
  }

  let itemDetails;
  try {
    const response = await axios.post(
      steamApiUrl,
      data,
      requestOptions({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: UPSTREAM_TIMEOUT_MS,
      })
    );
    itemDetails = response.data?.response?.publishedfiledetails?.[0];
  } catch (error) {
    logUpstreamFailure('workshop item details', error);
    return null;
  }

  // result === 9 (k_EResultFileNotFound)：条目不存在或已删除
  if (!itemDetails || itemDetails.result === 9) return null;

  const creatorId = itemDetails.creator;
  if (!creatorId) return null;

  const creatorProfileUrl = `https://steamcommunity.com/profiles/${creatorId}`;

  let typeValue = 'Unknown';
  let ageRatingValue = 'Unknown';

  for (const tag of Array.isArray(itemDetails.tags) ? itemDetails.tags : []) {
    const tagName = String(tag?.tag || '').toLowerCase();
    if (['scene', 'video', 'application', 'web'].includes(tagName)) typeValue = tag.tag;
    if (['everyone', 'questionable', 'mature'].includes(tagName)) ageRatingValue = tag.tag;
  }

  // 作者资料与预览大图互不依赖，并行抓取，任一失败都不影响主信息
  const [profile, previews] = await Promise.all([
    fetchCreatorProfile(creatorProfileUrl, cookieHeader),
    fetchItemPreviews(sharedfileId),
  ]);

  const gallery = previews?.images ?? [];
  const previewVideos = previews?.videos ?? [];

  return {
    id: itemDetails.publishedfileid,
    title: itemDetails.title || 'Unknown Title',
    description: itemDetails.description || 'No description available',
    // 优先用 previews 里的大图（常见 3840x2160）；拿不到才退回 192x192 的动态缩略图
    previewImage: gallery[0]?.url || itemDetails.preview_url || '',
    gallery,
    previewVideos,
    fileSize: formatFileSize(itemDetails.file_size || 0),
    timeCreated: formatDateTime(itemDetails.time_created),
    timeUpdated: formatDateTime(itemDetails.time_updated),
    type: typeValue,
    ageRating: ageRatingValue,
    currentSubscribers: itemDetails.subscriptions || 'N/A',
    currentFavorites: itemDetails.favorited || 'N/A',
    creatorAvatarUrl: profile?.avatarUrl || null,
    creatorName: profile?.creatorName || null,
    creatorProfileUrl,
  };
}

async function fetchCreatorProfile(profileUrl, cookieHeader) {
  try {
    const response = await axios.get(
      profileUrl,
      requestOptions({
        headers: { Cookie: cookieHeader, 'User-Agent': STEAM_USER_AGENT },
        timeout: UPSTREAM_TIMEOUT_MS,
      })
    );
    return parseSteamProfile(response.data);
  } catch (error) {
    // 作者主页抓不到不影响主信息展示
    logUpstreamFailure('creator profile', error);
    return null;
  }
}

async function fetchItemPreviews(sharedfileId) {
  try {
    return await fetchPreviews(sharedfileId, {
      axiosConfig: requestOptions({ timeout: UPSTREAM_TIMEOUT_MS }),
    });
  } catch (error) {
    // 没有 key 或上游失败时静默降级为缩略图
    logUpstreamFailure('workshop previews', error);
    return null;
  }
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 Bytes';

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const index = Math.min(Math.floor(Math.log(value) / Math.log(k)), units.length - 1);
  const size = value / Math.pow(k, index);
  const decimals = size < 10 ? 3 : 2;

  return `${size.toFixed(decimals)} ${units[index]}`;
}

// 固定按 UTC+8 展示，不依赖服务器时区（Vercel 上是 UTC）
function formatDateTime(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';

  const shifted = new Date(seconds * 1000 + DISPLAY_TZ_OFFSET_HOURS * 3600 * 1000);
  if (Number.isNaN(shifted.getTime())) return 'Unknown';

  const pad = value => String(value).padStart(2, '0');
  const date = `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`;
  const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  const zone = `UTC${DISPLAY_TZ_OFFSET_HOURS >= 0 ? '+' : ''}${DISPLAY_TZ_OFFSET_HOURS}`;

  return `${date} ${time} (${zone})`;
}

module.exports = app;
