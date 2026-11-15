import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, isLive, opponentOf, upcomingGames } from '../public/schedule.js';

const game = (team, competition, startTimeUtc, extra = {}) => ({ team, competition, homeTeam: team, awayTeam: 'Other', startTimeUtc, ...extra });

test('lists unfinished games for all teams in kickoff order, including live ones', () => {
  const fixtures = [
    game('Melbourne Victory', 'A-League Men', '2026-11-21T04:00:00.000Z'),
    game('Juventus', 'Serie A', '2026-11-08T19:45:00.000Z'), // finished
    game('Collingwood', 'AFL', '2026-11-14T18:00:00.000Z'), // started 2h ago, AFL still going
    game('Juventus', 'Serie A', '2026-11-22T11:30:00.000Z'),
    game('Juventus', 'Serie A', null),
    game('Someone Else', 'Serie A', '2026-11-16T00:00:00.000Z'),
  ];
  const now = Date.parse('2026-11-14T20:00:00Z');
  const games = upcomingGames(fixtures, now);
  assert.deepEqual(games.map(item => item.startTimeUtc), ['2026-11-14T18:00:00.000Z', '2026-11-21T04:00:00.000Z', '2026-11-22T11:30:00.000Z']);
  assert.equal(isLive(games[0], now), true);
  assert.equal(isLive(games[1], now), false);
});

test('a soccer game drops off the list once it has had time to finish', () => {
  const fixtures = [game('Juventus', 'Serie A', '2026-11-14T18:00:00.000Z')];
  assert.equal(upcomingGames(fixtures, Date.parse('2026-11-14T20:00:00Z')).length, 1);
  assert.equal(upcomingGames(fixtures, Date.parse('2026-11-14T20:30:00Z')).length, 0);
});

test('describes home and away games from the team point of view', () => {
  assert.deepEqual(opponentOf(game('Juventus', 'Serie A', null, { homeTeam: 'Como', awayTeam: 'Juventus' })), { home: false, opponent: 'Como' });
  assert.deepEqual(opponentOf(game('Juventus', 'Serie A', null)), { home: true, opponent: 'Other' });
});

test('counts calendar days in the viewer time zone', () => {
  const now = new Date('2026-11-14T12:00:00Z'); // 11pm Saturday in Melbourne
  assert.equal(daysBetween(now, new Date('2026-11-14T13:30:00Z'), 'Australia/Melbourne'), 1);
  assert.equal(daysBetween(now, new Date('2026-11-14T12:30:00Z'), 'Australia/Melbourne'), 0);
  assert.equal(daysBetween(now, new Date('2026-11-14T13:30:00Z'), 'UTC'), 0);
});

test('ESPN live state overrides the usual game length', () => {
  const fixture = { ...game('Juventus', 'Serie A', '2026-11-14T18:00:00.000Z'), id: 'g1' };
  const afterUsualEnd = Date.parse('2026-11-14T20:30:00Z');
  assert.equal(upcomingGames([fixture], afterUsualEnd).length, 0);
  assert.equal(upcomingGames([fixture], afterUsualEnd, { g1: { state: 'in' } }).length, 1, 'extra time keeps it on');
  assert.equal(isLive(fixture, afterUsualEnd, { g1: { state: 'in' } }), true);
  const duringGame = Date.parse('2026-11-14T19:00:00Z');
  assert.equal(upcomingGames([fixture], duringGame, { g1: { state: 'post' } }).length, 0, 'finished early per ESPN');
  assert.equal(isLive(fixture, duringGame, { g1: { state: 'pre' } }), false, 'kickoff delayed');
});
