import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeId, socialType, publicUrl, uniqueMedia} from '../frontend/js/media-utils.js';

test('YouTube links accept exact trusted hosts and valid video identifiers', () => {
  for (const url of ['https://youtu.be/WvY89k6jhHI?si=abc', 'https://youtube.com/shorts/WvY89k6jhHI', 'https://www.youtube.com/watch?v=WvY89k6jhHI', 'https://www.youtube.com/embed/WvY89k6jhHI']) assert.equal(youtubeId(url), 'WvY89k6jhHI');
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=WvY89k6jhHI', 'https://evil.test/shorts/WvY89k6jhHI', 'https://youtu.be/invalid', 'http://youtu.be/WvY89k6jhHI', 'https://user:secret@youtu.be/WvY89k6jhHI']) assert.equal(youtubeId(url), null);
});

test('social profiles and posts are distinguished without guessing content', () => {
  assert.equal(socialType('https://www.youtube.com/@MaduraiRamakrishnan'), 'youtube-profile');
  assert.equal(socialType('https://www.instagram.com/madurai.ramakrishnan/'), 'instagram-profile');
  assert.equal(socialType('https://www.instagram.com/reel/test_id/'), 'instagram-post');
  assert.equal(socialType('https://instagram.com/accounts/'), null);
  assert.equal(socialType('https://instagram.com.evil.test/madurai.ramakrishnan/'), null);
  assert.equal(publicUrl('javascript:alert(1)'), null);
});

test('repeat YouTube entries deduplicate across URL formats while retaining the saved record', () => {
  const saved = {id:'original', title:'Saved title', body:'Saved description', url:'https://youtu.be/WvY89k6jhHI?si=original'};
  const duplicate = {id:'duplicate', url:'https://www.youtube.com/shorts/WvY89k6jhHI'};
  const next = {id:'next', url:'https://youtu.be/u1xtTwJ9ujk'};
  assert.deepEqual(uniqueMedia([saved, duplicate, next]), [saved, next]);
});
