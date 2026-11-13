// Steam 创意工坊浏览页的 SSR 数据有两种投放方式：
//   v2（2025 年末改版后）：<script id="valve-ssr-data" type="application/json"> 里是整包 JSON，
//                         数据路径为 data.renderContext.queryData（字符串）
//   v1（改版前）：window.SSR.renderContext = JSON.parse("...") 内联赋值
// 两种方式内部的 queries / queryKey / state.data 结构一致，queryKey 仍为 workshop_browse。
const RENDER_CONTEXT_PATTERN =
  /window\.SSR\.renderContext\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)\s*;/s;

const SSR_DATA_SCRIPT_ID = 'valve-ssr-data';
const BROWSE_QUERY_KEY = 'workshop_browse';

function safeJsonParse(value) {
  if (typeof value !== 'string') return value == null ? null : value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// v2：整包 SSR JSON
function readValveSsrData(document) {
  for (const script of document.querySelectorAll('script')) {
    if (script.getAttribute('id') !== SSR_DATA_SCRIPT_ID) continue;
    const parsed = safeJsonParse((script.textContent || '').trim());
    if (parsed) return parsed;
  }
  return null;
}

// v1：内联的 window.SSR.renderContext = JSON.parse("...")
function readLegacyRenderContext(document) {
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent || '';
    if (!text.includes('window.SSR')) continue;
    const match = text.match(RENDER_CONTEXT_PATTERN);
    if (!match) continue;
    const serialized = safeJsonParse(match[1]);
    if (!serialized) continue;
    const renderContext = safeJsonParse(serialized);
    if (renderContext) return renderContext;
  }
  return null;
}

function parseRenderContext(document) {
  const ssrData = readValveSsrData(document);
  if (ssrData && ssrData.renderContext) return ssrData.renderContext;
  return readLegacyRenderContext(document);
}

function extractQueries(renderContext) {
  const queryData = safeJsonParse(renderContext?.queryData);
  return Array.isArray(queryData?.queries) ? queryData.queries : [];
}

function findBrowseData(queries) {
  const browseQuery = queries.find(
    query =>
      query.queryKey?.[0] === BROWSE_QUERY_KEY && Array.isArray(query.state?.data?.results)
  );
  return browseQuery ? browseQuery.state.data : null;
}

function buildCreatorNameMap(queries, browseData) {
  const creatorNames = new Map();

  for (const creator of browseData.creator_player_link_details || []) {
    const publicData = creator?.public_data;
    if (publicData?.steamid && publicData?.persona_name) {
      creatorNames.set(String(publicData.steamid), publicData.persona_name);
    }
  }

  for (const query of queries) {
    if (query.queryKey?.[0] !== 'PlayerLinkDetails') continue;
    const publicData = query.state?.data?.public_data;
    if (publicData?.steamid && publicData?.persona_name) {
      creatorNames.set(String(publicData.steamid), publicData.persona_name);
    }
  }

  return creatorNames;
}

// 解析成功返回 { items, maxPage }；页面上没有可识别的 SSR 数据结构时返回 null，
// 由调用方决定是回退到旧 DOM 解析还是报错——这里不抛异常。
function parseSsrItems(document) {
  if (!document) return null;

  const renderContext = parseRenderContext(document);
  if (!renderContext) return null;

  const queries = extractQueries(renderContext);
  const browseData = findBrowseData(queries);
  if (!browseData) return null;

  const creatorNames = buildCreatorNameMap(queries, browseData);

  const items = browseData.results
    .filter(result => result?.publishedfileid)
    .map(result => ({
      title: result.title || 'Unknown Title',
      previewImage: result.preview_url || '',
      sharedfileId: String(result.publishedfileid),
      authorName: creatorNames.get(String(result.creator)) || 'Unknown Author',
    }));

  const totalPages = Number.parseInt(browseData.total_pages, 10);

  return {
    items,
    maxPage: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
}

module.exports = { parseSsrItems };
