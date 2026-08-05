const assert = require('node:assert/strict');
const test = require('node:test');
const { parseHTML } = require('linkedom');

const { parseSsrItems } = require('../lib/steamSsrParser');

function createDocument(queryData) {
  const renderContext = JSON.stringify({ queryData: JSON.stringify(queryData) });
  const argument = JSON.stringify(renderContext);
  const html = `<html><body><script>window.SSR.renderContext=JSON.parse(${argument});</script></body></html>`;
  return parseHTML(html).document;
}

test('parses workshop results from the current Steam SSR response', () => {
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
              {
                public_data: {
                  steamid: '76561198000000000',
                  persona_name: 'Test Author',
                },
              },
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
  const document = createDocument({
    queries: [
      {
        queryKey: ['workshop_browse', {}, 1],
        state: { data: { total_pages: 0, results: [] } },
      },
    ],
  });

  assert.deepEqual(parseSsrItems(document), { items: [], maxPage: 1 });
});

test('returns null for the legacy Steam HTML format', () => {
  const { document } = parseHTML('<div class="workshopItem"></div>');
  assert.equal(parseSsrItems(document), null);
});
