import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, opponentOf, outcomeOf, teamSchedule } from '../public/schedule.js';

const game = (startTimeUtc, extra = {}) => ({ team: 'Juventus', competition: 'Serie A', homeTeam: 'Juventus', awayTeam: 'Como', startTimeUtc, homeScore: null, awayScore: null, ...extra });

test('splits a team schedule into last, live, and upcoming games', () => {
  const fixtures = [game('2026-11-08T19:45:00.000Z', { homeScore: 2, awayScore: 2 }), game('2026-11-14T19:00:00.000Z'), game('2026-11-22T11:30:00.000Z'), { ...game('2026-11-15T00:00:00.000Z'), team: 'Collingwood' }];
  const now = Date.parse('2026-11-14T20:00:00Z');
  const { last, live, upcoming } = teamSchedule(fixtures, 'Juventus', now);
  assert.equal(last.startTimeUtc, '2026-11-08T19:45:00.000Z');
  assert.equal(live.startTimeUtc, '2026-11-14T19:00:00.000Z');
  assert.deepEqual(upcoming.map(item => item.startTimeUtc), ['2026-11-22T11:30:00.000Z']);
  assert.equal(teamSchedule(fixtures, 'Juventus', Date.parse('2026-11-14T21:30:00Z')).live, null);
});

test('reports results from the team point of view', () => {
  const away = game('2026-11-08T19:45:00.000Z', { homeTeam: 'Fiorentina', awayTeam: 'Juventus', homeScore: 0, awayScore: 3 });
  assert.deepEqual(opponentOf(away), { home: false, opponent: 'Fiorentina' });
  assert.deepEqual(outcomeOf(away), { ours: 3, theirs: 0, result: 'win' });
  assert.equal(outcomeOf(game('2026-11-08T19:45:00.000Z', { homeScore: 0, awayScore: 0 })).result, 'draw');
  assert.equal(outcomeOf(game('2026-11-08T19:45:00.000Z')), null);
});

test('counts calendar days in the viewer time zone', () => {
  const now = new Date('2026-11-14T12:00:00Z'); // 11pm Saturday in Melbourne
  assert.equal(daysBetween(now, new Date('2026-11-14T13:30:00Z'), 'Australia/Melbourne'), 1);
  assert.equal(daysBetween(now, new Date('2026-11-14T12:30:00Z'), 'Australia/Melbourne'), 0);
  assert.equal(daysBetween(now, new Date('2026-11-14T13:30:00Z'), 'UTC'), 0);
});
