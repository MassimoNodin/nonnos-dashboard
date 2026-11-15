import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fixtures.json');

// A trailing run of at least this many unplayed fixtures sharing one UTC kickoff
// time is treated as Fixture Download filler rather than real scheduled times.
const PLACEHOLDER_RUN = 4;

/** Club teams, from the Fixture Download feeds (one feed per league season). */
export const teams = [
  { name: 'Juventus', competition: 'Serie A', slug: 'serie-a', teamSlug: 'juventus' },
  { name: 'Collingwood', competition: 'AFL', slug: 'afl', teamSlug: 'collingwood' },
  { name: 'Melbourne Victory', competition: 'A-League Men', slug: 'aleague-men', teamSlug: 'melbourne-victory' },
];

/**
 * National teams, from ESPN's public team schedule (no key needed). It covers every
 * competition a national team plays in: qualifiers, Nations League, friendlies, and tournaments.
 */
export const nationalTeams = [
  { name: 'Italy', espnId: 162 },
];

export function normalizeFixture(match, team, season) {
  const rawDate = typeof match.DateUtc === 'string' ? match.DateUtc.replace(' ', 'T') : null;
  const date = rawDate ? new Date(rawDate) : null;
  const startTimeUtc = date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
  return {
    id: `${team.slug}-${season}-${match.MatchNumber}`,
    feed: `${team.slug}-${season}`,
    team: team.name,
    competition: team.competition,
    season,
    round: match.RoundNumber ?? null,
    homeTeam: match.HomeTeam,
    awayTeam: match.AwayTeam,
    startTimeUtc,
    // 'listed': the feed gives a specific time (still check official sources).
    // 'tbc': the time is missing or looks like a placeholder.
    timeStatus: startTimeUtc ? 'listed' : 'tbc',
    venue: match.Location || null,
    homeScore: match.HomeTeamScore ?? null,
    awayScore: match.AwayTeamScore ?? null,
    source: 'Fixture Download',
  };
}

const isPlayed = fixture => fixture.homeScore !== null && fixture.awayScore !== null;
const timeOfDay = fixture => fixture.startTimeUtc?.slice(11, 16);

/** Marks kickoff times that are probably placeholders. Expects fixtures from one feed. */
export function markPlaceholderTimes(fixtures) {
  const sorted = [...fixtures].sort((a, b) => (a.startTimeUtc ?? '').localeCompare(b.startTimeUtc ?? ''));
  for (const fixture of sorted) {
    if (!isPlayed(fixture) && timeOfDay(fixture) === '00:00') fixture.timeStatus = 'tbc';
  }
  const run = [];
  for (const fixture of sorted.reverse()) {
    if (isPlayed(fixture) || !fixture.startTimeUtc) break;
    if (run.length && timeOfDay(run[0]) !== timeOfDay(fixture)) break;
    run.push(fixture);
  }
  if (run.length >= PLACEHOLDER_RUN) for (const fixture of run) fixture.timeStatus = 'tbc';
  return fixtures;
}

/** Shorter names for ESPN's competition labels. */
export function competitionName(league = '') {
  if (/friendly/i.test(league)) return 'Friendly';
  if (/^WCQ\b|world cup qual/i.test(league)) return 'World Cup qualifier';
  if (/^(EUROQ|EURO Q)|euro.*qualif/i.test(league)) return 'Euro qualifier';
  if (/world cup/i.test(league)) return 'World Cup';
  return league || 'International';
}

export function normalizeEspnEvent(event, team) {
  const competition = event.competitions?.[0] ?? {};
  const side = homeAway => competition.competitors?.find(entry => entry.homeAway === homeAway);
  const home = side('home');
  const away = side('away');
  const date = new Date(event.date);
  const startTimeUtc = Number.isNaN(date.valueOf()) ? null : date.toISOString();
  const completed = competition.status?.type?.completed === true;
  const score = entry => {
    const value = Number(typeof entry?.score === 'object' ? entry.score?.value : entry?.score);
    return completed && Number.isFinite(value) ? value : null;
  };
  return {
    id: `espn-${event.id}`,
    feed: `espn-${team.espnId}`,
    team: team.name,
    competition: competitionName(event.league?.name ?? event.league?.abbreviation),
    season: event.season?.year ?? null,
    round: null,
    homeTeam: home?.team?.displayName ?? null,
    awayTeam: away?.team?.displayName ?? null,
    startTimeUtc,
    timeStatus: startTimeUtc && competition.timeValid !== false ? 'listed' : 'tbc',
    venue: competition.venue?.fullName || null,
    homeScore: score(home),
    awayScore: score(away),
    source: 'ESPN',
  };
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function collectClubFeed(fetchImpl, team, season) {
  const feed = `${team.slug}-${season}`;
  try {
    const matches = await fetchJson(fetchImpl, `https://fixturedownload.com/feed/json/${feed}/${team.teamSlug}`);
    if (!Array.isArray(matches)) throw new Error('Unexpected feed format');
    return { fixtures: markPlaceholderTimes(matches.map(match => normalizeFixture(match, team, season))) };
  } catch (error) {
    if (error.status === 404) return { fixtures: [], unavailable: { team: team.name, season, feed } };
    return { fixtures: [], error: { team: team.name, season, feed, message: error.message } };
  }
}

async function collectNationalFeed(fetchImpl, team) {
  const feed = `espn-${team.espnId}`;
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${team.espnId}/schedule`;
  try {
    // The plain schedule lists results; fixture=true lists games still to be played.
    const responses = await Promise.all([fetchJson(fetchImpl, base), fetchJson(fetchImpl, `${base}?fixture=true`)]);
    if (!responses.every(body => Array.isArray(body?.events))) throw new Error('Unexpected feed format');
    const byId = new Map();
    for (const event of responses.flatMap(body => body.events)) byId.set(event.id, event);
    return { fixtures: [...byId.values()].map(event => normalizeEspnEvent(event, team)) };
  } catch (error) {
    return { fixtures: [], error: { team: team.name, season: null, feed, message: error.message } };
  }
}

export async function collectFixtures({ fetchImpl = fetch, now = new Date() } = {}) {
  const year = now.getUTCFullYear();
  const results = await Promise.all([
    ...teams.flatMap(team => [year - 1, year, year + 1].map(season => collectClubFeed(fetchImpl, team, season))),
    ...nationalTeams.map(team => collectNationalFeed(fetchImpl, team)),
  ]);
  return {
    fetchedAt: now.toISOString(),
    fixtures: sortFixtures(results.flatMap(result => result.fixtures)),
    unavailable: results.flatMap(result => result.unavailable ? [result.unavailable] : []),
    errors: results.flatMap(result => result.error ? [result.error] : []),
  };
}

function sortFixtures(fixtures) {
  return fixtures.sort((first, second) => (first.startTimeUtc ?? '9999').localeCompare(second.startTimeUtc ?? '9999'));
}

// Files saved before fixtures had a feed field: the id is "<feed>-<match number>".
const feedOf = fixture => fixture.feed ?? String(fixture.id).replace(/-[^-]+$/, '');

/** Keeps previously saved fixtures for any feed that failed this time. */
export function mergeWithPrevious(result, previous) {
  if (!previous?.fixtures?.length || !result.errors.length) return result;
  const failed = new Set(result.errors.map(error => error.feed));
  const kept = previous.fixtures.filter(fixture => failed.has(feedOf(fixture)));
  return { ...result, fixtures: sortFixtures([...result.fixtures, ...kept]) };
}

export async function readSavedFixtures(file = DATA_FILE) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function refreshFixtures({ file = DATA_FILE, ...options } = {}) {
  const previous = await readSavedFixtures(file).catch(() => null);
  const result = mergeWithPrevious(await collectFixtures(options), previous);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function main() {
  const result = await refreshFixtures();
  console.log(`Saved ${result.fixtures.length} fixtures to ${DATA_FILE}.`);
  if (result.unavailable.length) console.log(`${result.unavailable.length} season feeds are unavailable (probably not published yet).`);
  if (result.errors.length) {
    console.error('Some feeds failed; kept previously saved fixtures for them:', JSON.stringify(result.errors));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
