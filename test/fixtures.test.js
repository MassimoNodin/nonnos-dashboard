import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFixtures, normalizeFixture, teams } from '../src/fixtures.js';

test('normalizes UTC fixtures without treating scores of zero as missing', () => {
  const fixture = normalizeFixture({ MatchNumber: 3, DateUtc: '2026-11-01 04:00:00Z', HomeTeam: 'Melbourne Victory', AwayTeam: 'Other', HomeTeamScore: 0, AwayTeamScore: 1 }, teams[2], 2026);
  assert.equal(fixture.startTimeUtc, '2026-11-01T04:00:00.000Z');
  assert.equal(fixture.homeScore, 0);
  assert.equal(fixture.timeConfirmation, 'unverified');
});

test('collects three seasons and reports unavailable and failing feeds', async () => {
  const result = await collectFixtures({ now: new Date('2026-10-30T00:00:00Z'), fetchImpl: async url => {
    if (url.includes('2025')) return { status: 404, ok: false };
    if (url.includes('2027')) return { status: 503, ok: false };
    return { ok: true, json: async () => [{ MatchNumber: 1, DateUtc: null, HomeTeam: 'Home', AwayTeam: 'Away' }] };
  } });
  assert.equal(result.fixtures.length, 3);
  assert.equal(result.unavailable.length, 3);
  assert.equal(result.errors.length, 3);
  assert.equal(result.fixtures[0].startTimeUtc, null);
});
