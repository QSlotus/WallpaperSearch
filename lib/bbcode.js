function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 只允许 http/https；裸域名补 http://；其余协议（javascript:、data:、file: 等）一律拒绝
function normalizeUrl(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return `http://${value.replace(/^\/+/, '')}`;
}

// 先把 Steam BBCode 描述整体转义成纯文本，再按白名单替换成少量标签，
// 这样社区作者塞进描述里的 HTML/脚本只会变成可见字符，不会被执行。
function formatDescription(description) {
  if (description == null) return '';

  let output = escapeHtml(description);

  output = output.replace(/\[h1\](.*?)\[\/h1\]/gs, '<div class="bb_h1">$1</div>');
  output = output.replace(/\[h2\](.*?)\[\/h2\]/gs, '<div class="bb_h2">$1</div>');
  output = output.replace(/\[h3\](.*?)\[\/h3\]/gs, '<div class="bb_h3">$1</div>');
  output = output.replace(/\[b\](.*?)\[\/b\]/gs, '<b>$1</b>');
  output = output.replace(/\[u\](.*?)\[\/u\]/gs, '<u>$1</u>');
  output = output.replace(/\[i\](.*?)\[\/i\]/gs, '<i>$1</i>');

  output = output.replace(/\r\n|\r|\n/g, '<br>');

  output = output.replace(/\[url=(.*?)\](.*?)\[\/url\]/gs, function (match, url, text) {
    const safe = normalizeUrl(url);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>` : text;
  });

  output = output.replace(/\[img\](.*?)\[\/img\]/gs, function (match, src) {
    const safe = normalizeUrl(src);
    return safe ? `<img src="${safe}" loading="lazy" referrerpolicy="no-referrer" alt="">` : '';
  });

  return output;
}

module.exports = { escapeHtml, formatDescription, normalizeUrl };
