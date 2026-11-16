const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizePreviews } = require('../lib/steamPreviews');

// 真实接口返回的形状（3373818743 实测）
const REAL_PAYLOAD = [
  {
    previewid: '38754656',
    sortorder: 0,
    url: 'https://images.steamusercontent.com/ugc/43443618358467438/204AE1F0F54142B3670712E3546E6E2EE76D07BE/',
    size: 1615472,
    filename: '112097470_p0.jpg',
    preview_type: 0,
  },
  {
    previewid: '38756796',
    sortorder: 1,
    url: 'https://images.steamusercontent.com/ugc/43443618358892672/3E16D8FC28F403036E327F9DE307D023840369A0/',
    size: 429720,
    filename: 'a.jpg',
    preview_type: 0,
  },
  {
    previewid: '38674846',
    sortorder: 2,
    youtubevideoid: 'wbK-i4dv1Mw',
    preview_type: 1,
    external_reference: '',
  },
  {
    previewid: '38756759',
    sortorder: 2,
    url: '',
    size: 0,
    filename: 'Screenshot_3.jpg',
    preview_type: 0,
  },
];

test('extracts images and videos from a real API payload', () => {
  const { images, videos } = normalizePreviews(REAL_PAYLOAD);

  assert.equal(images.length, 2, '空 url 的条目应被过滤');
  assert.equal(videos.length, 1);
  assert.equal(
    images[0].url,
    'https://images.steamusercontent.com/ugc/43443618358467438/204AE1F0F54142B3670712E3546E6E2EE76D07BE/'
  );
  assert.equal(images[0].size, 1615472);
  assert.equal(images[0].filename, '112097470_p0.jpg');
  assert.equal(videos[0].youtubeId, 'wbK-i4dv1Mw');
});

test('sorts images by sortorder', () => {
  const { images } = normalizePreviews([
    { sortorder: 2, url: 'https://img/c', preview_type: 0 },
    { sortorder: 0, url: 'https://img/a', preview_type: 0 },
    { sortorder: 1, url: 'https://img/b', preview_type: 0 },
  ]);

  assert.deepEqual(
    images.map(image => image.url),
    ['https://img/a', 'https://img/b', 'https://img/c']
  );
});

test('returns empty lists for missing or malformed input', () => {
  for (const input of [undefined, null, [], 'nope', 42, {}]) {
    const result = normalizePreviews(input);
    assert.deepEqual(result, { images: [], videos: [] });
  }
});

test('ignores blank urls and unknown preview types', () => {
  const { images, videos } = normalizePreviews([
    { url: '   ', preview_type: 0 },
    { url: 'https://img/ok', preview_type: 0 },
    { url: 'https://img/unknown', preview_type: 7 },
    { youtubevideoid: '', preview_type: 1 },
  ]);

  assert.equal(images.length, 1);
  assert.equal(images[0].url, 'https://img/ok');
  assert.equal(videos.length, 0);
});

test('trims surrounding whitespace from urls', () => {
  const { images } = normalizePreviews([{ url: '  https://img/x  ', preview_type: 0 }]);
  assert.equal(images[0].url, 'https://img/x');
});
