const assert = require('node:assert/strict');
const test = require('node:test');

const { parseSteamProfile } = require('../lib/steamProfileParser');

test('parses the current Steam avatar while ignoring frame markup', () => {
  const html = `
    <span class="actual_persona_name">Test Creator</span>
    <div class="playerAvatarAutoSizeInner">
      <div class="profile_avatar_frame">
        <picture>
          <source srcset="https://cdn.example/frame-static.png">
          <img src="https://cdn.example/frame.png">
        </picture>
      </div>
      <picture>
        <source srcset="https://cdn.example/avatar.jpg">
        <img srcset="https://cdn.example/avatar.jpg">
      </picture>
    </div>`;

  assert.deepEqual(parseSteamProfile(html), {
    creatorName: 'Test Creator',
    avatarUrl: 'https://cdn.example/avatar.jpg',
  });
});

test('parses a legacy profile without an avatar frame', () => {
  const html = `
    <span class="actual_persona_name">Legacy Creator</span>
    <div class="playerAvatarAutoSizeInner">
      <img src="https://cdn.example/legacy-avatar.jpg">
    </div>`;

  assert.deepEqual(parseSteamProfile(html), {
    creatorName: 'Legacy Creator',
    avatarUrl: 'https://cdn.example/legacy-avatar.jpg',
  });
});

test('uses profile metadata when the avatar container is unavailable', () => {
  const html = `
    <meta property="og:title" content="Steam Community :: Metadata Creator">
    <meta property="og:image" content="https://cdn.example/metadata-avatar.jpg">`;

  assert.deepEqual(parseSteamProfile(html), {
    creatorName: 'Metadata Creator',
    avatarUrl: 'https://cdn.example/metadata-avatar.jpg',
  });
});
