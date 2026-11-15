// Pure helpers shared by the browser and the tests.

// How long after kickoff a game counts as "on now": football 2h15m, AFL 3h.
const SOCCER_LENGTH_MS = 2.25 * 60 * 60 * 1000;
const AFL_LENGTH_MS = 3 * 60 * 60 * 1000;

export const TEAM_ORDER = ['Juventus', 'Italy', 'Collingwood', 'Melbourne Victory'];

const start = fixture => Date.parse(fixture.startTimeUtc);
const end = fixture => start(fixture) + (fixture.competition === 'AFL' ? AFL_LENGTH_MS : SOCCER_LENGTH_MS);

export const isLive = (fixture, now = Date.now()) => start(fixture) <= now && now < end(fixture);

/** Games for every team that have not finished yet, soonest first (live games included). */
export function upcomingGames(fixtures, now = Date.now()) {
  return fixtures
    .filter(fixture => fixture.startTimeUtc && TEAM_ORDER.includes(fixture.team) && end(fixture) > now)
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
