// 搜索参数规范化。
// 安全要点：requiredtags / requiredtype 会被透传给 Steam 的 requiredtags[]，
// 而 Steam 对标签大小写和首尾空格是宽松匹配的（实测 requiredtags=mature 能搜到 Mature 内容）。
// 因此这里必须做「白名单 + 规范化」，不能只把用户输入原样往下传：
//   1) requiredtags=mature / "Mature " 会被规范成 Mature，从而正确触发邀请码门禁
//   2) requiredtags=Anime / Scene 这类非观众级标签会被丢弃回落到 Everyone，
//      否则绕过 Everyone 过滤（实测 Scene 结果里混着 6.2 万条 Mature）
const AUDIENCE_TAGS = ['Everyone', 'Questionable', 'Mature'];
const TYPE_TAGS = ['Scene', 'Video', 'Web'];

const DEFAULT_SECTION = 'readytouseitems';
const DEFAULT_SORT = 'textsearch';
const DEFAULT_TREND_DAYS = '7';
const RETIRED_TYPES = ['application'];

function matchAllowedTag(value, allowedTags, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const matched = allowedTags.find(tag => tag.toLowerCase() === trimmed.toLowerCase());
  return matched || fallback;
}

function normalizeSearchParams(query = {}) {
  const rawPage = Number.parseInt(query.p, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawTags = typeof query.requiredtags === 'string' ? query.requiredtags : '';
  const rawType = typeof query.requiredtype === 'string' ? query.requiredtype : '';

  // 表单里 browsesort 的值形如 "trend&days=7"，这里拆回 sort + days 两段
  let browseSort = typeof query.browsesort === 'string' ? query.browsesort.trim() : '';
  let trendDays = typeof query.days === 'string' ? query.days.trim() : '';
  const trendMatch = browseSort.match(/^trend(?:\s*&\s*days=(-?\d+))?$/);

  if (trendMatch) {
    browseSort = 'trend';
    if (!trendDays && trendMatch[1]) trendDays = trendMatch[1];
    if (!trendDays) trendDays = DEFAULT_TREND_DAYS;
  } else if (!browseSort) {
    browseSort = DEFAULT_SORT;
  }

  return {
    searchText: typeof query.searchtext === 'string' ? query.searchtext.trim() : '',
    requiredTags: matchAllowedTag(rawTags, AUDIENCE_TAGS, 'Everyone'),
    requiredType: matchAllowedTag(rawType, TYPE_TAGS, ''),
    // section 不透传用户输入，避免把任意值塞进上游 URL
    section: DEFAULT_SECTION,
    page,
    browseSort,
    trendDays,
    // Application 类型已被 Steam 下架，单独给提示（白名单会把它丢弃，所以要在规范化前判断）
    asksForApplication: [rawTags, rawType].some(
      value => RETIRED_TYPES.includes(value.trim().toLowerCase())
    ),
  };
}

// 回填到表单/分页链接的 sort 值，保持与 option 的 value 一致
function toSortValue(params) {
  return params.browseSort === 'trend' ? `trend&days=${params.trendDays}` : params.browseSort;
}

module.exports = { normalizeSearchParams, toSortValue, matchAllowedTag, AUDIENCE_TAGS, TYPE_TAGS };
