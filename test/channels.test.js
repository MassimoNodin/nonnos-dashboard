import test from 'node:test';
import assert from 'node:assert/strict';
import { brandFor, channelsFor } from '../public/channels.js';

test('known channels get a tidy name and brand colours, whatever the source calls them', () => {
  assert.equal(brandFor('BEIN Sports Connect').label, 'beIN SPORTS');
  assert.equal(brandFor('Paramount+ Australia').label, 'Paramount+');
  assert.equal(brandFor('Fox Footy (Foxtel)').label, 'Fox Footy');
  assert.equal(brandFor('7plus').label, 'Channel 7');
  assert.match(brandFor('Kayo').bg, /^#[0-9a-f]{6}$/i);
});

test('unknown channels still show, under their own name, in a plain badge', () => {
  assert.equal(brandFor('  Local Sports TV ').label, 'Local Sports TV');
});

test('lists several channels per game, without repeats, up to the limit', () => {
  const game = { channels: ['Kayo', 'Foxtel', 'Channel 7', '7plus', ''] };
  assert.deepEqual(channelsFor(game).map(brand => brand.label), ['Kayo Sports', 'Fox Footy', 'Channel 7']);
  assert.equal(channelsFor(game, 2).length, 2);
  assert.deepEqual(channelsFor({}), []);
  assert.deepEqual(channelsFor({ channels: null }), []);
});
