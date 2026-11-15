// Live scores from ESPN's public scoreboards (no key needed). Only games around
// their kickoff time are looked up, so nothing is fetched on days without games.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const WATCH_BEFORE_MS = 15 * 60 * 1000;
const WATCH_AFTER_MS = 4 * 60 * 60 * 1000;

/** Where each team's games appear on ESPN. Italy's league changes per game, so it comes from the fixture. */
export const LIVE_SOURCES = {
  Juventus: { path: () => 'soccer/ita.1', teamId: '111' },
  Italy: { path: fixture => (fixture.league ? `soccer/${fixture.league}` : null), teamId: '162' },
  Collingwood: { path: () => 'australian-football/afl', teamId: '17' },
  'Melbourne Victory': { path: () => 'soccer/aus.1', teamId: '5328' },
};

/** Games that could be on now: from 15 minutes before kickoff to 4 hours after. */
export function gamesToWatch(fixtures, now = Date.now()) {
  return fixtures.filter(fixture => {
    const start = Date.parse(fixture.startTimeUtc);
    return LIVE_SOURCES[fixture.team] && start - WATCH_BEFORE_MS <= now && now < start + WATCH_AFTER_MS;
  });
}

// ESPN files games under their US Eastern date and does not accept date ranges.
const espnDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).replace(/-/g, '');

function scoreboardUrl(fixture) {
  const path = LIVE_SOURCES[fixture.team].path(fixture);
  if (!path) return null;
  return `${ESPN}/${path}/scoreboard?dates=${espnDate(Date.parse(fixture.startTimeUtc))}`;
}

/** Finds the team's game nearest the fixture's kickoff and reads its state and score. */
export function readScore(scoreboard, fixture) {
  const { teamId } = LIVE_SOURCES[fixture.team];
  const start = Date.parse(fixture.startTimeUtc);
  const candidates = (scoreboard?.events ?? [])
    .filter(event => event.competitions?.[0]?.competitors?.some(entry => String(entry.team?.id) === teamId))
    .sort((a, b) => Math.abs(Date.parse(a.date) - start) - Math.abs(Date.parse(b.date) - start));
  const event = candidates[0];
  if (!event || Math.abs(Date.parse(event.date) - start) > 12 * 60 * 60 * 1000) return null;
  const competition = event.competitions[0];
  const ours = competition.competitors.find(entry => String(entry.team?.id) === teamId);
  const theirs = competition.competitors.find(entry => entry !== ours);
  const score = entry => {
    const value = Number(typeof entry?.score === 'object' ? entry.score?.value : entry?.score);
    return Number.isFinite(value) ? value : null;
  };
  return {
    state: competition.status?.type?.state ?? event.status?.type?.state ?? 'pre', // 'pre', 'in', or 'post'
    ours: score(ours),
    theirs: score(theirs),
    detail: competition.status?.type?.shortDetail ?? null, // e.g. "67'", "HT", "Q3 12:34"
  };
}

/** Returns live state and scores keyed by fixture id, for games happening around now. */
export async function fetchLiveScores(fixtures, { fetchImpl = fetch, now = Date.now() } = {}) {
  const watched = gamesToWatch(fixtures, now).map(fixture => ({ fixture, url: scoreboardUrl(fixture) })).filter(item => item.url);
  const boards = new Map();
  await Promise.all([...new Set(watched.map(item => item.url))].map(async url => {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) boards.set(url, await response.json());
    } catch {
      // A missing score just means the page shows the kickoff time instead.
    }
  }));
  const scores = {};
  for (const { fixture, url } of watched) {
    const score = boards.has(url) ? readScore(boards.get(url), fixture) : null;
    if (score) scores[fixture.id] = score;
  }
  return scores;
}

/** Caches lookups so many open screens do not multiply requests to ESPN. */
export function createLiveScores({ getFixtures, ttlMs = 30_000, fetchImpl = fetch } = {}) {
  let cached = { at: 0, scores: {} };
  let pending = null;
  return async function liveScores() {
    if (Date.now() - cached.at < ttlMs) return cached.scores;
    pending ??= (async () => {
      const data = await getFixtures();
      const scores = data ? await fetchLiveScores(data.fixtures, { fetchImpl }) : {};
      cached = { at: Date.now(), scores };
      return scores;
    })().finally(() => { pending = null; });
    return pending;
  };
}
