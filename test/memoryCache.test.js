const assert = require('node:assert/strict');
const test = require('node:test');

const { MemoryCache } = require('../lib/memoryCache');

test('stores and returns values', () => {
  const cache = new MemoryCache({ ttlMs: 1000 });
  cache.set('a', { items: [1, 2, 3] });

  assert.deepEqual(cache.get('a'), { items: [1, 2, 3] });
  assert.equal(cache.get('missing'), undefined);
});

test('expires entries after the ttl', async () => {
  const cache = new MemoryCache({ ttlMs: 30 });
  cache.set('a', 1);

  assert.equal(cache.get('a'), 1);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(cache.get('a'), undefined);
});

test('evicts the oldest entry when maxEntries is exceeded', () => {
  const cache = new MemoryCache({ ttlMs: 1000, maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);

  assert.equal(cache.size, 2);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
});

test('reading an entry refreshes its recency', () => {
  const cache = new MemoryCache({ ttlMs: 1000, maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);

  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('b'), undefined);
});
