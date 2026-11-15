// Pure helpers shared by the browser and the tests.

// How long after kickoff a game counts as "on now": football 2h15m, AFL 3h.
const SOCCER_LENGTH_MS = 2.25 * 60 * 60 * 1000;
const AFL_LENGTH_MS = 3 * 60 * 60 * 1000;

export const TEAM_ORDER = ['Juventus', 'Italy', 'Collingwood', 'Melbourne Victory'];

const start = fixture => Date.parse(fixture.startTimeUtc);
const end = fixture => start(fixture) + (fixture.competition === 'AFL' ? AFL_LENGTH_MS : SOCCER_LENGTH_MS);

// `live` holds ESPN's state for games around kickoff, keyed by fixture id ('pre', 'in', or 'post').
// When ESPN knows, it wins over the usual game length, so extra time or a long AFL game stays on.

export function isLive(fixture, now = Date.now(), live = {}) {
  const state = live[fixture.id]?.state;
  if (state) return state === 'in';
  return start(fixture) <= now && now < end(fixture);
}

function notFinished(fixture, now, live) {
  const state = live[fixture.id]?.state;
  if (state === 'in') return true;
  if (state === 'post') return false;
  return end(fixture) > now;
}

/** Games for every team that have not finished yet, soonest first (live games included). */
export function upcomingGames(fixtures, now = Date.now(), live = {}) {
  return fixtures
    .filter(fixture => fixture.startTimeUtc && TEAM_ORDER.includes(fixture.team) && notFinished(fixture, now, live))
    .sort((a, b) => start(a) - start(b) || TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));
}

export function opponentOf(fixture) {
  const home = fixture.homeTeam === fixture.team;
  return { home, opponent: home ? fixture.awayTeam : fixture.homeTeam };
}

/** Whole calendar days between two instants in the given time zone. */
export function daysBetween(from, to, timeZone) {
  const dayNumber = instant => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    return Date.parse(`${parts}T00:00:00Z`) / 86_400_000;
  };
  return Math.round(dayNumber(to) - dayNumber(from));
}
