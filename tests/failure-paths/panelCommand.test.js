import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidUrl, normalizeHexColor } from '../../src/commands/Tools/panel.js';

test('normalizeHexColor accepts #RRGGBB and RRGGBB', () => {
  assert.equal(normalizeHexColor('#5865F2'), '#5865F2');
  assert.equal(normalizeHexColor('57F287'), '#57F287');
  assert.equal(normalizeHexColor('red'), null);
  assert.equal(normalizeHexColor('#GGG'), null);
});

test('isValidUrl accepts http/https only', () => {
  assert.equal(isValidUrl('https://cdn.discordapp.com/image.png'), true);
  assert.equal(isValidUrl('http://example.com/a.jpg'), true);
  assert.equal(isValidUrl('ftp://example.com/a.jpg'), false);
  assert.equal(isValidUrl('not-a-url'), false);
});

test('description newline escaping works', () => {
  const raw = 'Line 1\\nLine 2\\nLine 3';
  const description = raw.replace(/\\n/g, '\n');
  assert.equal(description, 'Line 1\nLine 2\nLine 3');
});
