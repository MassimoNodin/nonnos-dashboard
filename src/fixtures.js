import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fixtures.json');

// A trailing run of at least this many unplayed fixtures sharing one UTC kickoff
// time is treated as Fixture Download filler rather than real scheduled times.
const PLACEHOLDER_RUN = 4;

export const teams = [
  { name: 'Juventus', competition: 'Serie A', slug: 'serie-a', teamSlug: 'juventus' },
  { name: 'Collingwood', competition: 'AFL', slug: 'afl', teamSlug: 'collingwood' },
  { name: 'Melbourne Victory', competition: 'A-League Men', slug: 'aleague-men', teamSlug: 'melbourne-victory' },
];

export function normalizeFixture(match, team, season) {
  const rawDate = typeof match.DateUtc === 'string' ? match.DateUtc.replace(' ', 'T') : null;
  const date = rawDate ? new Date(rawDate) : null;
  const startTimeUtc = date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
  return {
    id: `${team.slug}-${season}-${match.MatchNumber}`,
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

export async function collectFixtures({ fetchImpl = fetch, now = new Date() } = {}) {
  const year = now.getUTCFullYear();
  const results = await Promise.all(teams.flatMap(team => [year - 1, year, year + 1].map(async season => {
    const url = `https://fixturedownload.com/feed/json/${team.slug}-${season}/${team.teamSlug}`;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (response.status === 404) return { fixtures: [], unavailable: { team: team.name, season } };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const matches = await response.json();
      if (!Array.isArray(matches)) throw new Error('Unexpected feed format');
      return { fixtures: markPlaceholderTimes(matches.map(match => normalizeFixture(match, team, season))) };
    } catch (error) {
      return { fixtures: [], error: { team: team.name, season, message: error.message } };
    }
  })));
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

/** Keeps previously saved fixtures for any team season whose feed failed this time. */
export function mergeWithPrevious(result, previous) {
  if (!previous?.fixtures?.length || !result.errors.length) return result;
  const failed = new Set(result.errors.map(error => `${error.team}|${error.season}`));
  const kept = previous.fixtures.filter(fixture => failed.has(`${fixture.team}|${fixture.season}`));
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
