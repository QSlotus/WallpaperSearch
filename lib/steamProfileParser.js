const { parseHTML } = require('linkedom');

function parseSrcset(srcset) {
  if (!srcset) return null;

  const candidates = srcset
    .split(',')
    .map(candidate => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);

  return candidates.at(-1) || null;
}

function getElementImageUrl(element) {
  if (!element) return null;
  return element.getAttribute('src') || parseSrcset(element.getAttribute('srcset'));
}

function findAvatarUrl(avatarContainer, frameContainer) {
  if (!avatarContainer) return null;

  const images = Array.from(avatarContainer.querySelectorAll('img')).filter(
    image => !frameContainer?.contains(image)
  );
  const image = images.find(getElementImageUrl);
  if (image) return getElementImageUrl(image);

  const sources = Array.from(avatarContainer.querySelectorAll('source')).filter(
    source => !frameContainer?.contains(source)
  );
  const preferredSource = sources.find(source => !source.hasAttribute('media')) || sources[0];
  return getElementImageUrl(preferredSource);
}

function parseSteamProfile(html) {
  const { document } = parseHTML(html);
  const nickname = document.querySelector('span.actual_persona_name')?.textContent.trim();
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const avatarContainer = document.querySelector('div.playerAvatarAutoSizeInner');
  const frameContainer = avatarContainer?.querySelector('.profile_avatar_frame');
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');

  return {
    creatorName: nickname || ogTitle?.replace(/^Steam Community\s*::\s*/, '') || null,
    avatarUrl: findAvatarUrl(avatarContainer, frameContainer) || ogImage || null,
  };
}

module.exports = { parseSteamProfile };
