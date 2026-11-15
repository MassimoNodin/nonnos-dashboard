import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFixtures, competitionName, markPlaceholderTimes, mergeWithPrevious, normalizeEspnEvent, normalizeFixture, refreshFixtures, teams } from '../src/fixtures.js';

const fixtureAt = (dateUtc, extra = {}) => ({ MatchNumber: dateUtc, DateUtc: dateUtc, HomeTeam: 'Juventus', AwayTeam: 'Other', ...extra });

test('normalizes UTC fixtures without treating scores of zero as missing', () => {
  const fixture = normalizeFixture({ MatchNumber: 3, DateUtc: '2026-11-01 04:00:00Z', HomeTeam: 'Melbourne Victory', AwayTeam: 'Other', HomeTeamScore: 0, AwayTeamScore: 1 }, teams[2], 2026);
  assert.equal(fixture.startTimeUtc, '2026-11-01T04:00:00.000Z');
  assert.equal(fixture.homeScore, 0);
  assert.equal(fixture.timeStatus, 'listed');
});

test('marks midnight UTC and long trailing runs of one kickoff time as TBC', () => {
  const feed = ['2027-01-03 19:45:00Z', '2027-01-10 17:00:00Z', '2027-01-17 00:00:00Z', '2027-07-05 02:00:00Z', '2027-07-12 02:00:00Z', '2027-07-19 02:00:00Z', '2027-07-26 02:00:00Z']
    .map(date => normalizeFixture(fixtureAt(date), teams[0], 2026));
  markPlaceholderTimes(feed);
  assert.deepEqual(feed.map(fixture => fixture.timeStatus), ['listed', 'listed', 'tbc', 'tbc', 'tbc', 'tbc', 'tbc']);
});

test('does not mark short runs or played games as TBC', () => {
  const shortRun = ['2027-04-26 09:00:00Z', '2027-05-02 05:00:00Z', '2027-05-09 05:00:00Z'].map(date => normalizeFixture(fixtureAt(date), teams[2], 2026));
  const played = ['2026-08-15 09:40:00Z', '2026-08-21 09:40:00Z', '2026-08-28 09:40:00Z', '2026-09-04 09:40:00Z']
    .map(date => normalizeFixture(fixtureAt(date, { HomeTeamScore: 90, AwayTeamScore: 80 }), teams[1], 2026));
  assert.ok(markPlaceholderTimes(shortRun).every(fixture => fixture.timeStatus === 'listed'));
  assert.ok(markPlaceholderTimes(played).every(fixture => fixture.timeStatus === 'listed'));
});

test('collects three seasons and reports unavailable and failing feeds', async () => {
  const result = await collectFixtures({ now: new Date('2026-10-30T00:00:00Z'), fetchImpl: async url => {
    if (url.includes('espn.com')) return { ok: true, json: async () => ({ events: [] }) };
    if (url.includes('2025')) return { status: 404, ok: false };
    if (url.includes('2027')) return { status: 503, ok: false };
    return { ok: true, json: async () => [{ MatchNumber: 1, DateUtc: null, HomeTeam: 'Home', AwayTeam: 'Away' }] };
  } });
  assert.equal(result.fixtures.length, 3);
  assert.equal(result.unavailable.length, 3);
  assert.equal(result.errors.length, 3);
  assert.equal(result.fixtures[0].startTimeUtc, null);
  assert.equal(result.fixtures[0].timeStatus, 'tbc');
});

test('keeps previously saved fixtures for feeds that failed', () => {
  const previous = { fixtures: [
    { id: 'a', feed: 'serie-a-2026', startTimeUtc: '2026-12-01T00:00:00.000Z' },
    { id: 'b', feed: 'afl-2026', startTimeUtc: '2026-05-01T00:00:00.000Z' },
    { id: 'espn-1', feed: 'espn-162', startTimeUtc: '2026-11-15T19:45:00.000Z' },
    { id: 'serie-a-2026-7', startTimeUtc: '2026-12-02T00:00:00.000Z' }, // saved before fixtures had a feed field
  ] };
  const fresh = { fixtures: [{ id: 'c', feed: 'afl-2026', startTimeUtc: '2026-06-01T00:00:00.000Z' }], errors: [{ feed: 'serie-a-2026' }, { feed: 'espn-162' }] };
  assert.deepEqual(mergeWithPrevious(fresh, previous).fixtures.map(fixture => fixture.id), ['c', 'espn-1', 'a', 'serie-a-2026-7']);
});

test('normalizes ESPN national team games, including unconfirmed times and results', () => {
  const event = (id, date, extra = {}) => ({
    id, date, league: { name: 'UEFA Nations League' },
    competitions: [{
      timeValid: true, venue: { fullName: 'King Baudouin Stadium' }, status: { type: { completed: false } },
      competitors: [{ homeAway: 'home', team: { displayName: 'Belgium' } }, { homeAway: 'away', team: { displayName: 'Italy' } }],
      ...extra,
    }],
  });
  const upcoming = normalizeEspnEvent(event('1', '2026-11-15T19:45Z'), { name: 'Italy', espnId: 162 });
  assert.equal(upcoming.startTimeUtc, '2026-11-15T19:45:00.000Z');
  assert.equal(upcoming.awayTeam, 'Italy');
  assert.equal(upcoming.timeStatus, 'listed');
  assert.equal(upcoming.homeScore, null);
  assert.equal(normalizeEspnEvent(event('2', '2027-03-26T00:00Z', { timeValid: false }), { name: 'Italy', espnId: 162 }).timeStatus, 'tbc');
  const played = normalizeEspnEvent(event('3', '2026-11-12T19:45Z', {
    status: { type: { completed: true } },
    competitors: [{ homeAway: 'home', team: { displayName: 'Italy' }, score: { value: 3 } }, { homeAway: 'away', team: { displayName: 'France' }, score: { value: 0 } }],
  }), { name: 'Italy', espnId: 162 });
  assert.deepEqual([played.homeScore, played.awayScore], [3, 0]);
});

test('shortens ESPN competition names', () => {
  assert.equal(competitionName("Men's International Friendly"), 'Friendly');
  assert.equal(competitionName('WCQ - UEFA'), 'World Cup qualifier');
  assert.equal(competitionName('UEFA Nations League'), 'UEFA Nations League');
});

test('a refresh while offline does not wipe the saved file', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'nonno-')), 'fixtures.json');
  const saved = { fetchedAt: '2026-11-01T00:00:00.000Z', fixtures: [{ id: 'serie-a-2026-1', team: 'Juventus', season: 2026, startTimeUtc: '2026-12-01T00:00:00.000Z' }], unavailable: [], errors: [] };
  await writeFile(file, JSON.stringify(saved));
  await refreshFixtures({ file, now: new Date('2026-11-14T00:00:00Z'), fetchImpl: async () => { throw new Error('offline'); } });
  const written = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(written.fixtures.map(fixture => fixture.id), ['serie-a-2026-1']);
  assert.equal(written.errors.length, 10);
});

test('downloads missing logos, keeps existing ones, and rejects non-SVG responses', async () => {
  const { ensureLogos, LOGO_SOURCES } = await import('../src/logos.js');
  const dir = await mkdtemp(join(tmpdir(), 'nonno-logos-'));
  await writeFile(join(dir, 'juventus.svg'), '<svg>kept</svg>');
  const requested = [];
  const { failed } = await ensureLogos({ dir, fetchImpl: async url => {
    requested.push(url);
    return { ok: true, text: async () => (url === LOGO_SOURCES.collingwood ? '<svg>pies</svg>' : '<html>error page</html>') };
  } });
  assert.equal(requested.length, Object.keys(LOGO_SOURCES).length - 1);
  assert.equal(await readFile(join(dir, 'juventus.svg'), 'utf8'), '<svg>kept</svg>');
  assert.equal(await readFile(join(dir, 'collingwood.svg'), 'utf8'), '<svg>pies</svg>');
  assert.deepEqual(failed.map(item => item.slug), ['italy', 'melbourne-victory']);
  assert.ok(failed.every(item => item.message === 'Not an SVG file'));
});
