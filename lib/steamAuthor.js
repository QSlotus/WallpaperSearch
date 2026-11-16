// 取「某个创作者上传的全部作品」。
// 用 IPublishedFileService/GetUserFiles：它是唯一支持按作者过滤的官方接口，
// 标签过滤参数是 requiredtags[0]、requiredtags[1]（HTML 页面那套 requiredtags[] 在这里无效）。
// 注意：sort_method 参数实测无效，所以排序在本地做（items 里带 subscriptions / time_created）。
const axios = require('axios');

const GET_USER_FILES_URL = 'https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/';
const WORKSHOP_APP_ID = '431960';
const MAX_ITEMS = 100;

const AUDIENCE_TAGS = ['Everyone', 'Questionable', 'Mature'];
const TYPE_TAGS = ['Scene', 'Video', 'Web'];
const SORT_MODES = ['default', 'subscribers', 'recent'];

function pickTag(tags, allowed) {
  const names = (Array.isArray(tags) ? tags : []).map(tag =>
    String(tag?.tag || tag || '').toLowerCase()
  );
  return allowed.find(candidate => names.includes(candidate.toLowerCase())) || null;
}

function normalizeItem(raw) {
  if (!raw || !raw.publishedfileid) return null;

  const tags = Array.isArray(raw.tags) ? raw.tags : [];

  return {
    sharedfileId: String(raw.publishedfileid),
    title: raw.title || 'Unknown Title',
    previewImage: raw.preview_url || '',
    ageRating: pickTag(tags, AUDIENCE_TAGS) || 'Unknown',
    type: pickTag(tags, TYPE_TAGS) || 'Unknown',
    subscriptions: Number(raw.subscriptions) || 0,
    favorites: Number(raw.favorited) || 0,
    views: Number(raw.views) || 0,
    timeCreated: Number(raw.time_created) || 0,
    timeUpdated: Number(raw.time_updated) || 0,
  };
}

function buildTagParams({ requiredTags, requiredType }) {
  const tags = [requiredTags, requiredType].filter(Boolean);
  const params = {};
  tags.forEach((tag, index) => {
    params[`requiredtags[${index}]`] = tag;
  });
  return params;
}

// 排序在本地做：GetUserFiles 的 sort_method 无效
function sortItems(items, mode) {
  const sorted = [...items];

  if (mode === 'subscribers') {
    sorted.sort((a, b) => b.subscriptions - a.subscriptions || b.timeCreated - a.timeCreated);
  } else if (mode === 'recent') {
    sorted.sort((a, b) => b.timeCreated - a.timeCreated);
  }

  return sorted;
}

async function fetchAuthorFiles(steamId, { apiKey, requiredTags, requiredType, axiosConfig } = {}) {
  const key = apiKey || process.env.STEAM_API_KEY;
  if (!key) return null;

  const response = await axios.get(GET_USER_FILES_URL, {
    params: {
      key,
      steamid: steamId,
      appid: WORKSHOP_APP_ID,
      page: 1,
      numperpage: MAX_ITEMS,
      return_tags: 'true',
      return_short_description: 'true',
      ...buildTagParams({ requiredTags, requiredType }),
    },
    ...axiosConfig,
  });

  const payload = response.data?.response;
  if (!payload) return null;

  const items = (payload.publishedfiledetails || []).map(normalizeItem).filter(Boolean);

  return {
    total: Number(payload.total) || items.length,
    truncated: Number(payload.total) > items.length,
    items,
  };
}

module.exports = {
  fetchAuthorFiles,
  sortItems,
  normalizeItem,
  buildTagParams,
  SORT_MODES,
  MAX_ITEMS,
};
