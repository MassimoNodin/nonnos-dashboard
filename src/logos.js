import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Club crests are trademarks, so they are downloaded on first run into the
// git-ignored data folder instead of being committed to the repository.
export const LOGO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'logos');

export const LOGO_SOURCES = {
  juventus: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Juventus_FC_-_logo_black_%28Italy%2C_2020%29.svg',
  italy: 'https://upload.wikimedia.org/wikipedia/commons/b/bf/Logo_Italy_National_Football_Team_-_2023.svg',
  collingwood: 'https://upload.wikimedia.org/wikipedia/en/a/a6/Collingwood_Football_Club_Logo_%282017%E2%80%93present%29.svg',
  'melbourne-victory': 'https://upload.wikimedia.org/wikipedia/en/9/95/Melbourne_Victory.svg',
};

const USER_AGENT = 'nonnos-dashboard/1.0 (personal fixtures dashboard)';

/** Downloads any missing crest. Failures are reported, not thrown; the page falls back to initials. */
export async function ensureLogos({ dir = LOGO_DIR, fetchImpl = fetch } = {}) {
  await mkdir(dir, { recursive: true });
  const failed = [];
  for (const [slug, url] of Object.entries(LOGO_SOURCES)) {
    const file = join(dir, `${slug}.svg`);
    if (await readFile(file).then(() => true, () => false)) continue;
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const svg = await response.text();
      if (!/<svg[\s>]/i.test(svg)) throw new Error('Not an SVG file');
      await writeFile(file, svg);
    } catch (error) {
      failed.push({ slug, message: error.message });
    }
  }
  return { failed };
}
