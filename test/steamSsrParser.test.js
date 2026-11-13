const assert = require('node:assert/strict');
const test = require('node:test');
const { parseHTML } = require('linkedom');

const { parseSsrItems } = require('../lib/steamSsrParser');

// Steam 2025 改版后的结构：整包 JSON 放在 <script id="valve-ssr-data">
function createValveSsrDocument(queryData, extraData = {}) {
  const payload = {
    route: 'workshop_browse',
    renderContext: {
      localizationSettings: { languages: [] },
      queryData: JSON.stringify(queryData),
    },
    ...extraData,
  };
  const html = `<html><body><script id="valve-ssr-data" type="application/json">${JSON.stringify(
    payload
  )}</script></body></html>`;
  return parseHTML(html).document;
}

// 改版前：window.SSR.renderContext = JSON.parse("...")
function createDocument(queryData) {
  const renderContext = JSON.stringify({ queryData: JSON.stringify(queryData) });
  const argument = JSON.stringify(renderContext);
  const html = `<html><body><script>window.SSR.renderContext=JSON.parse(${argument});</script></body></html>`;
  return parseHTML(html).document;
}

function browseQueryData() {
  return {
    queries: [
      {
        queryKey: [
          'workshop_browse',
          {
            appid: 431960,
            browse_sort: 'textsearch',
            section: 'readytouseitems',
            page: 1,
            search_text: 'cat',
          },
          1,
        ],
        state: {
          data: {
            eresult: 1,
            current_page: 1,
            total_pages: 598,
            total_count: 17930,
            results: [
              {
                publishedfileid: '3373818743',
                creator: '76561198399287397',
                title: 'Sunset Cat [4K]',
                preview_url: 'https://images.steamusercontent.com/ugc/example/',
              },
            ],
            creator_player_link_details: [
              {
                public_data: {
                  steamid: '76561198399287397',
                  persona_name: 'Sean Trong',
                },
              },
            ],
          },
        },
      },
      {
        queryKey: ['PlayerLinkDetails', '76561198000000009'],
        state: {
          data: {
            public_data: { steamid: '76561198000000009', persona_name: 'Other Creator' },
          },
        },
      },
    ],
  };
}

test('parses workshop results from the valve-ssr-data script block', () => {
  const document = createValveSsrDocument(browseQueryData());

  assert.deepEqual(parseSsrItems(document), {
    items: [
      {
        title: 'Sunset Cat [4K]',
        previewImage: 'https://images.steamusercontent.com/ugc/example/',
        sharedfileId: '3373818743',
        authorName: 'Sean Trong',
      },
    ],
    maxPage: 598,
  });
});

test('keeps parsing the legacy window.SSR.renderContext format', () => {
  const document = createDocument({
    queries: [
      {
        queryKey: ['workshop_browse', { appid: 431960 }, 1],
        state: {
          data: {
            total_pages: 42,
            results: [
              {
                publishedfileid: '1234567890',
                creator: '76561198000000000',
                title: 'Test Wallpaper',
                preview_url: 'https://example.com/preview.jpg',
              },
            ],
            creator_player_link_details: [
              { public_data: { steamid: '76561198000000000', persona_name: 'Test Author' } },
            ],
          },
        },
      },
    ],
  });

  assert.deepEqual(parseSsrItems(document), {
    items: [
      {
        title: 'Test Wallpaper',
        previewImage: 'https://example.com/preview.jpg',
        sharedfileId: '1234567890',
        authorName: 'Test Author',
      },
    ],
    maxPage: 42,
  });
});

test('returns an empty result for a valid SSR query with no matches', () => {
  const document = createValveSsrDocument({
    queries: [
      {
        queryKey: ['workshop_browse', { appid: 431960 }, 1],
        state: { data: { total_pages: 0, results: [] } },
      },
    ],
  });

  assert.deepEqual(parseSsrItems(document), { items: [], maxPage: 1 });
});

test('returns null instead of throwing when the page has no SSR payload', () => {
  const { document } = parseHTML('<div class="workshopItem"></div>');
  assert.equal(parseSsrItems(document), null);
});

test('returns null instead of throwing when the SSR payload has no browse query', () => {
  const document = createValveSsrDocument({
    queries: [{ queryKey: ['apphub', 431960], state: { data: { appid: 431960 } } }],
  });

  assert.equal(parseSsrItems(document), null);
});

test('returns null when the valve-ssr-data block is not valid JSON', () => {
  const html = '<html><body><script id="valve-ssr-data">{ not json </script></body></html>';
  const { document } = parseHTML(html);

  assert.equal(parseSsrItems(document), null);
});

test('skips results without a publishedfileid', () => {
  const document = createValveSsrDocument({
    queries: [
      {
        queryKey: ['workshop_browse', {}, 1],
        state: {
          data: {
            total_pages: 3,
            results: [{ title: 'broken entry' }, { publishedfileid: '999', title: 'ok' }],
          },
        },
      },
    ],
  });

  const result = parseSsrItems(document);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sharedfileId, '999');
});
