import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const teams = [
  { name: 'Juventus', competition: 'Serie A', slug: 'serie-a', teamSlug: 'juventus' },
  { name: 'Collingwood', competition: 'AFL', slug: 'afl', teamSlug: 'collingwood' },
  { name: 'Melbourne Victory', competition: 'A-League Men', slug: 'aleague-men', teamSlug: 'melbourne-victory' },
];

export function normalizeFixture(match, team, season) {
  const rawDate = typeof match.DateUtc === 'string' ? match.DateUtc.replace(' ', 'T') : null;
  const date = rawDate ? new Date(rawDate) : null;
  return {
    id: `${team.slug}-${season}-${match.MatchNumber}`,
    team: team.name,
    competition: team.competition,
    season,
    round: match.RoundNumber ?? null,
    homeTeam: match.HomeTeam,
    awayTeam: match.AwayTeam,
    startTimeUtc: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null,
    timeConfirmation: 'unverified',
    venue: match.Location || null,
    homeScore: match.HomeTeamScore ?? null,
    awayScore: match.AwayTeamScore ?? null,
    source: 'Fixture Download',
  };
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
      return { fixtures: matches.map(match => normalizeFixture(match, team, season)) };
    } catch (error) {
      return { fixtures: [], error: { team: team.name, season, message: error.message } };
    }
  })));
  return {
    fetchedAt: now.toISOString(),
    fixtures: results.flatMap(result => result.fixtures).sort((first, second) => (first.startTimeUtc ?? '9999').localeCompare(second.startTimeUtc ?? '9999')),
    unavailable: results.flatMap(result => result.unavailable ? [result.unavailable] : []),
    errors: results.flatMap(result => result.error ? [result.error] : []),
  };
}

async function main() {
  const result = await collectFixtures();
  await mkdir('data', { recursive: true });
  await writeFile('data/fixtures.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Saved ${result.fixtures.length} fixtures to data/fixtures.json.`);
  if (result.unavailable.length) console.log(`${result.unavailable.length} season feeds are unavailable.`);
  if (result.errors.length) {
    console.error('Some feeds failed:', JSON.stringify(result.errors));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
