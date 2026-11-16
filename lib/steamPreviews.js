// 通过 IPublishedFileService/GetDetails 拿工坊条目的完整预览图列表。
// 注意：ISteamRemoteStorage/GetPublishedFileDetails 的 preview_url 只是 192x192 的动态缩略图 GIF，
// 真正的大图（常见 3840x2160）只在这个接口的 previews 数组里，且必须带 WebAPI key。
const axios = require('axios');

const GET_DETAILS_URL = 'https://api.steampowered.com/IPublishedFileService/GetDetails/v1/';

// preview_type: 0 = 图片，1 = 视频（youtubevideoid）
const PREVIEW_TYPE_IMAGE = 0;
const PREVIEW_TYPE_VIDEO = 1;

// 纯函数，便于单测：过滤掉空 url 的条目，按 sortorder 排序
function normalizePreviews(previews) {
  const images = [];
  const videos = [];

  for (const preview of Array.isArray(previews) ? previews : []) {
    if (!preview) continue;

    const type = Number(preview.preview_type);

    if (type === PREVIEW_TYPE_VIDEO) {
      const youtubeId = preview.youtubevideoid;
      if (typeof youtubeId === 'string' && youtubeId) {
        videos.push({ youtubeId });
      }
      continue;
    }

    if (type !== PREVIEW_TYPE_IMAGE) continue;
    if (typeof preview.url !== 'string' || !preview.url.trim()) continue;

    images.push({
      url: preview.url.trim(),
      size: Number(preview.size) || 0,
      filename: typeof preview.filename === 'string' ? preview.filename : '',
      sortOrder: Number(preview.sortorder) || 0,
    });
  }

  images.sort((a, b) => a.sortOrder - b.sortOrder);

  return { images, videos };
}

// 没有配置 key 或请求失败时返回 null，调用方回退到缩略图 preview_url。
async function fetchPreviews(publishedFileId, { apiKey, axiosConfig } = {}) {
  const key = apiKey || process.env.STEAM_API_KEY;
  if (!key) return null;

  const response = await axios.get(GET_DETAILS_URL, {
    params: {
      'publishedfileids[0]': publishedFileId,
      includeadditionalpreviews: 'true',
      strip_description: 'true',
      key,
    },
    ...axiosConfig,
  });

  const details = response.data?.response?.publishedfiledetails?.[0];
  if (!details) return null;

  return normalizePreviews(details.previews);
}

module.exports = { fetchPreviews, normalizePreviews };
