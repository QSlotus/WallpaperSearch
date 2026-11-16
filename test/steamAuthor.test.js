const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeItem, sortItems, buildTagParams, filterItems } = require('../lib/steamAuthor');

// 真实 GetUserFiles 返回形状（截取关键字段）
const RAW = {
  publishedfileid: '3373818743',
  title: 'Sunset Cat [4K]',
  preview_url: 'https://images.steamusercontent.com/ugc/example/',
  subscriptions: 1036164,
  favorited: 4200,
  views: 35918,
  time_created: 1737771930,
  time_updated: 1737900000,
  tags: [
    { tag: 'Wallpaper', display_name: 'Wallpaper' },
    { tag: 'Scene', display_name: 'Scene' },
    { tag: 'Mature', display_name: 'Mature' },
    { tag: '3840 x 2160', display_name: '3840 x 2160' },
  ],
};

test('normalizes a real GetUserFiles item', () => {
  const item = normalizeItem(RAW);

  assert.equal(item.sharedfileId, '3373818743');
  assert.equal(item.title, 'Sunset Cat [4K]');
  assert.equal(item.ageRating, 'Mature');
  assert.equal(item.type, 'Scene');
  assert.equal(item.subscriptions, 1036164);
  assert.equal(item.timeCreated, 1737771930);
});

test('returns null for items without an id', () => {
  assert.equal(normalizeItem({}), null);
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem({ title: 'x' }), null);
});

test('falls back to Unknown when tags are missing', () => {
  const item = normalizeItem({ publishedfileid: '1', tags: [] });
  assert.equal(item.ageRating, 'Unknown');
  assert.equal(item.type, 'Unknown');
});

test('builds indexed requiredtags params the API expects', () => {
  // HTML 页面用 requiredtags[]，WebAPI 用 requiredtags[0] / [1]，混用会静默失效
  assert.deepEqual(buildTagParams({ requiredTags: 'Everyone', requiredType: 'Scene' }), {
    'requiredtags[0]': 'Everyone',
    'requiredtags[1]': 'Scene',
  });

  assert.deepEqual(buildTagParams({ requiredTags: 'Everyone', requiredType: '' }), {
    'requiredtags[0]': 'Everyone',
  });

  assert.deepEqual(buildTagParams({}), {});
});

test('filters items by keyword locally', () => {
  const items = [
    { title: 'Sunset Cat [4K]', shortDescription: 'a cat at sunset' },
    { title: 'Blue Sky [4K]', shortDescription: 'clouds' },
    { title: 'Moon Cat', shortDescription: '' },
  ];

  assert.equal(filterItems(items, 'cat').length, 2);
  assert.equal(filterItems(items, 'CAT').length, 2);
  assert.equal(filterItems(items, 'sunset').length, 1);
  assert.equal(filterItems(items, 'zzz').length, 0);
  assert.equal(filterItems(items, '').length, 3);
  assert.equal(filterItems(items, '   ').length, 3);
});

test('sorts by subscribers and by creation time', () => {
  const items = [
    { sharedfileId: 'a', subscriptions: 10, timeCreated: 300 },
    { sharedfileId: 'b', subscriptions: 300, timeCreated: 100 },
    { sharedfileId: 'c', subscriptions: 50, timeCreated: 200 },
  ];

  assert.deepEqual(
    sortItems(items, 'subscribers').map(i => i.sharedfileId),
    ['b', 'c', 'a']
  );

  assert.deepEqual(
    sortItems(items, 'recent').map(i => i.sharedfileId),
    ['a', 'c', 'b']
  );

  // default 保持接口返回顺序，且不改动原数组
  assert.deepEqual(
    sortItems(items, 'default').map(i => i.sharedfileId),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    items.map(i => i.sharedfileId),
    ['a', 'b', 'c']
  );
});
