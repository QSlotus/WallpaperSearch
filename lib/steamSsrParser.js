const RENDER_CONTEXT_PATTERN =
  /window\.SSR\.renderContext\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)\s*;/s;

function parseRenderContext(document) {
  for (const script of document.querySelectorAll('script')) {
    const match = (script.textContent || '').match(RENDER_CONTEXT_PATTERN);
    if (!match) continue;

    const serializedContext = JSON.parse(match[1]);
    return JSON.parse(serializedContext);
  }

  return null;
}

function parseSsrItems(document) {
  const renderContext = parseRenderContext(document);
  if (!renderContext) return null;

  const queryData =
    typeof renderContext.queryData === 'string'
      ? JSON.parse(renderContext.queryData)
      : renderContext.queryData;
  const queries = Array.isArray(queryData?.queries) ? queryData.queries : [];
  const browseQuery = queries.find(
    query =>
      query.queryKey?.[0] === 'workshop_browse' &&
      Array.isArray(query.state?.data?.results)
  );

  if (!browseQuery) {
    throw new Error('Steam SSR response did not contain workshop browse results');
  }

  const browseData = browseQuery.state.data;
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
