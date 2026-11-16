const assert = require('node:assert/strict');
const test = require('node:test');

const { safeNextPath } = require('../lib/redirect');

test('keeps in-site relative paths', () => {
  assert.equal(safeNextPath('/item/123'), '/item/123');
  assert.equal(safeNextPath('/search?searchtext=cat&requiredtags=Mature'), '/search?searchtext=cat&requiredtags=Mature');
  assert.equal(safeNextPath('/'), '/');
});

test('rejects absolute and protocol-relative urls', () => {
  for (const value of [
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    '\\\\evil.example.com',
    'javascript:alert(1)',
    'data:text/html,hi',
    '/path\\to',
  ]) {
    assert.equal(safeNextPath(value), '/', value);
  }
});

test('rejects empty, non-string and oversized values', () => {
  for (const value of [undefined, null, '', '   ', 42, {}, '/' + 'a'.repeat(3000)]) {
    assert.equal(safeNextPath(value), '/', String(value));
  }
});

test('rejects header injection attempts', () => {
  assert.equal(safeNextPath('/ok\r\nSet-Cookie: x=1'), '/');
  assert.equal(safeNextPath('/ok\n/x'), '/');
});

test('honours a custom fallback', () => {
  assert.equal(safeNextPath('//evil', '/search'), '/search');
});
