import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveScores, fetchLiveScores, gamesToWatch, readScore } from '../src/live.js';

const fixture = (id, team, startTimeUtc, extra = {}) => ({ id, team, startTimeUtc, ...extra });
const espnEvent = (date, home, away, state = 'in', detail = "67'") => ({
  date,
  competitions: [{
    status: { type: { state, shortDetail: detail } },
    competitors: [
      { homeAway: 'home', team: { id: home[0] }, score: home[1] },
      { homeAway: 'away', team: { id: away[0] }, score: away[1] },
    ],
  }],
});

test('only watches games from just before kickoff until a few hours after', () => {
  const fixtures = [fixture('a', 'Juventus', '2026-11-22T11:30:00.000Z'), fixture('b', 'Juventus', '2026-11-29T19:45:00.000Z'), fixture('c', 'Someone', '2026-11-22T11:30:00.000Z')];
  assert.deepEqual(gamesToWatch(fixtures, Date.parse('2026-11-22T11:20:00Z')).map(item => item.id), ['a']);
  assert.deepEqual(gamesToWatch(fixtures, Date.parse('2026-11-22T11:00:00Z')).map(item => item.id), []);
  assert.deepEqual(gamesToWatch(fixtures, Date.parse('2026-11-22T15:31:00Z')).map(item => item.id), []);
});

test('reads the score from our team point of view, even as the away side', () => {
  const board = { events: [
    espnEvent('2026-11-29T19:45Z', ['2572', '1'], ['111', '2']),
    espnEvent('2026-11-29T17:00Z', ['110', '0'], ['113', '0']),
  ] };
  assert.deepEqual(readScore(board, fixture('a', 'Juventus', '2026-11-29T19:45:00.000Z')), { state: 'in', ours: 2, theirs: 1, detail: "67'" });
  assert.equal(readScore(board, fixture('a', 'Collingwood', '2026-11-29T19:45:00.000Z')), null);
});

test('ignores a game of ours on a different day', () => {
  const board = { events: [espnEvent('2026-11-27T19:45Z', ['111', '0'], ['2572', '0'])] };
  assert.equal(readScore(board, fixture('a', 'Juventus', '2026-11-29T19:45:00.000Z')), null);
});

test('fetches each scoreboard once and uses the fixture league for Italy', async () => {
  const urls = [];
  const fixtures = [
    fixture('j', 'Juventus', '2026-11-29T19:45:00.000Z'),
    fixture('i', 'Italy', '2026-11-29T19:00:00.000Z', { league: 'uefa.nations' }),
  ];
  const scores = await fetchLiveScores(fixtures, { now: Date.parse('2026-11-29T20:00:00Z'), fetchImpl: async url => {
    urls.push(url);
    if (url.includes('uefa.nations')) throw new Error('offline');
    return { ok: true, json: async () => ({ events: [espnEvent('2026-11-29T19:45Z', ['111', '1'], ['2572', '0'])] }) };
  } });
  assert.deepEqual(urls.sort(), [
    'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261129',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=20261129',
  ]);
  assert.deepEqual(scores, { j: { state: 'in', ours: 1, theirs: 0, detail: "67'" } });
});

test('caches live scores between requests', async () => {
  let calls = 0;
  const liveScores = createLiveScores({ getFixtures: async () => { calls += 1; return { fixtures: [] }; } });
  await Promise.all([liveScores(), liveScores()]);
  await liveScores();
  assert.equal(calls, 1);
});

test('asks ESPN for the US Eastern date of kickoff', async () => {
  const urls = [];
  await fetchLiveScores([fixture('m', 'Melbourne Victory', '2026-11-08T04:00:00.000Z')], {
    now: Date.parse('2026-11-08T05:00:00Z'),
    fetchImpl: async url => { urls.push(url); return { ok: true, json: async () => ({ events: [] }) }; },
  });
  assert.deepEqual(urls, ['https://site.api.espn.com/apis/site/v2/sports/soccer/aus.1/scoreboard?dates=20261107']);
});
