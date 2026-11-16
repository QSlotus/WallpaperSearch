// 只允许回到站内相对路径，避免开放重定向 / 响应头注入
function safeNextPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return fallback;
  if (!trimmed.startsWith('/')) return fallback;
  // "//evil.com" 与 "/\evil.com" 都会被浏览器当成协议相对 URL
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  if (trimmed.includes('\\')) return fallback;
  if (/[\r\n\t]/.test(trimmed)) return fallback;

  return trimmed;
}

module.exports = { safeNextPath };
