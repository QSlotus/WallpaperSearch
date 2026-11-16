const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeSearchParams, toSortValue, matchAllowedTag } = require('../lib/searchParams');

// 这一组用例对应实测过的鉴权绕过向量：
// Steam 对 requiredtags 是大小写不敏感、忽略首尾空格的宽松匹配，
// 而门禁原先用 === 'Mature' 精确比较，导致 requiredtags=mature 直接搜到成人内容。
test('normalises lowercase mature so the invite gate still fires', () => {
  for (const raw of ['mature', 'MATURE', 'Mature', '  Mature  ', 'mAtUrE']) {
    assert.equal(normalizeSearchParams({ requiredtags: raw }).requiredTags, 'Mature', raw);
  }
});

test('drops tags outside the audience whitelist instead of forwarding them', () => {
  // requiredtags=Scene / Anime 曾能把 Everyone 过滤整个替换掉，从而混入 Mature 结果
  for (const raw of ['Scene', 'Anime', 'Video', '4K', 'Everyone,Mature', 'Mature%20']) {
    const params = normalizeSearchParams({ requiredtags: raw });
    assert.equal(params.requiredTags, 'Everyone', raw);
  }
});

test('drops type values outside the type whitelist so they cannot be injected', () => {
  for (const raw of ['Mature', 'mature', 'Anime', 'Application', 'Scene,Mature']) {
    assert.equal(normalizeSearchParams({ requiredtype: raw }).requiredType, '', raw);
  }
});

test('keeps legitimate audience and type values', () => {
  assert.equal(normalizeSearchParams({ requiredtags: 'Everyone' }).requiredTags, 'Everyone');
  assert.equal(normalizeSearchParams({ requiredtags: 'questionable' }).requiredTags, 'Questionable');
  assert.equal(normalizeSearchParams({ requiredtype: 'scene' }).requiredType, 'Scene');
  assert.equal(normalizeSearchParams({ requiredtype: 'WEB' }).requiredType, 'Web');
});

test('ignores array-shaped query params', () => {
  // ?requiredtags[]=Mature 会被 Express 解析成数组
  const params = normalizeSearchParams({ requiredtags: ['Mature', 'Everyone'], requiredtype: ['Scene'] });
  assert.equal(params.requiredTags, 'Everyone');
  assert.equal(params.requiredType, '');
});

test('flags the retired Application type before the whitelist drops it', () => {
  assert.equal(normalizeSearchParams({ requiredtype: 'application' }).asksForApplication, true);
  assert.equal(normalizeSearchParams({ requiredtags: 'Application' }).asksForApplication, true);
  assert.equal(normalizeSearchParams({ requiredtype: 'Scene' }).asksForApplication, false);
});

test('hard codes section instead of forwarding user input', () => {
  assert.equal(normalizeSearchParams({ section: 'Mature' }).section, 'readytouseitems');
  assert.equal(normalizeSearchParams({ section: '../../etc' }).section, 'readytouseitems');
});

test('keeps trend sort and days together', () => {
  const params = normalizeSearchParams({ browsesort: 'trend&days=30' });
  assert.equal(params.browseSort, 'trend');
  assert.equal(params.trendDays, '30');
  assert.equal(toSortValue(params), 'trend&days=30');

  assert.equal(normalizeSearchParams({ browsesort: 'trend' }).trendDays, '7');
  assert.equal(normalizeSearchParams({}).browseSort, 'textsearch');
});

test('falls back to page 1 for invalid page values', () => {
  for (const p of ['0', '-3', 'abc', '', undefined, '1e9']) {
    assert.equal(normalizeSearchParams({ p }).page, 1, String(p));
  }
  assert.equal(normalizeSearchParams({ p: '12' }).page, 12);
});

test('matchAllowedTag is case insensitive and falls back safely', () => {
  assert.equal(matchAllowedTag('mature', ['Everyone', 'Mature'], 'Everyone'), 'Mature');
  assert.equal(matchAllowedTag('nope', ['Everyone', 'Mature'], 'Everyone'), 'Everyone');
  assert.equal(matchAllowedTag(null, ['Everyone'], 'Everyone'), 'Everyone');
});
