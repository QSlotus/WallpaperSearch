const assert = require('node:assert/strict');
const test = require('node:test');

const { escapeHtml, formatDescription, normalizeUrl } = require('../lib/bbcode');

test('escapes raw HTML instead of passing it through', () => {
  const output = formatDescription('<img src=x onerror="alert(1)">');

  assert.equal(output.includes('<img src=x'), false);
  assert.equal(output.includes('onerror'), true);
  assert.equal(output.includes('&lt;img'), true);
});

test('still converts supported BBCode tags', () => {
  const output = formatDescription('[h1]Title[/h1]\n[b]bold[/b] [u]under[/u] [i]italic[/i]');

  assert.equal(output.includes('<div class="bb_h1">Title</div>'), true);
  assert.equal(output.includes('<b>bold</b>'), true);
  assert.equal(output.includes('<u>under</u>'), true);
  assert.equal(output.includes('<i>italic</i>'), true);
  assert.equal(output.includes('<br>'), true);
});

test('builds links only for http(s) URLs', () => {
  const output = formatDescription('[url=https://example.com/a]safe[/url]');

  assert.equal(output.includes('href="https://example.com/a"'), true);
  assert.equal(output.includes('rel="noopener noreferrer nofollow"'), true);
});

test('drops javascript: and data: URLs', () => {
  const output = formatDescription(
    '[url=javascript:alert(1)]x[/url] [url=data:text/html,hi]y[/url] [img]javascript:alert(1)[/img]'
  );

  assert.equal(output.includes('href="javascript'), false);
  assert.equal(output.includes('href="data:'), false);
  assert.equal(output.includes('<img'), false);
  assert.equal(output.includes('>x<') || output.includes('x'), true);
});

test('adds http:// to bare domains', () => {
  assert.equal(normalizeUrl('example.com/path'), 'http://example.com/path');
});

test('escapeHtml covers quotes and ampersands', () => {
  assert.equal(escapeHtml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &#39; f');
});

test('handles null and empty descriptions', () => {
  assert.equal(formatDescription(null), '');
  assert.equal(formatDescription(undefined), '');
  assert.equal(formatDescription(''), '');
});
