// Pure helpers shared by the browser and the tests.

const GAME_LENGTH_MS = {
  'Serie A': 2.25 * 60 * 60 * 1000,
  'A-League Men': 2.25 * 60 * 60 * 1000,
  AFL: 3 * 60 * 60 * 1000,
};

export const TEAM_ORDER = ['Juventus', 'Collingwood', 'Melbourne Victory'];

const start = fixture => Date.parse(fixture.startTimeUtc);
const end = fixture => start(fixture) + (GAME_LENGTH_MS[fixture.competition] ?? GAME_LENGTH_MS.AFL);

/** Splits one team's fixtures into the last finished game, a live game, and upcoming games. */
export function teamSchedule(fixtures, team, now = Date.now()) {
  const games = fixtures
    .filter(fixture => fixture.team === team && fixture.startTimeUtc)
    .sort((a, b) => start(a) - start(b));
  const finished = games.filter(game => end(game) <= now);
  return {
    last: finished.at(-1) ?? null,
    live: games.find(game => start(game) <= now && now < end(game)) ?? null,
    upcoming: games.filter(game => start(game) > now),
  };
}

export function opponentOf(fixture) {
  const home = fixture.homeTeam === fixture.team;
  return { home, opponent: home ? fixture.awayTeam : fixture.homeTeam };
}

export function outcomeOf(fixture) {
  if (fixture.homeScore === null || fixture.awayScore === null) return null;
  const { home } = opponentOf(fixture);
  const ours = home ? fixture.homeScore : fixture.awayScore;
  const theirs = home ? fixture.awayScore : fixture.homeScore;
  return { ours, theirs, result: ours > theirs ? 'win' : ours < theirs ? 'loss' : 'draw' };
}

/** Whole calendar days between two instants in the given time zone. */
export function daysBetween(from, to, timeZone) {
  const dayNumber = instant => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    return Date.parse(`${parts}T00:00:00Z`) / 86_400_000;
  };
  return Math.round(dayNumber(to) - dayNumber(from));
}
