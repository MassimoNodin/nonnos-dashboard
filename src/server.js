import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSavedFixtures, refreshFixtures } from './fixtures.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

export function createApp({ getFixtures }) {
  return createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
      if (pathname === '/api/fixtures') {
        const data = await getFixtures();
        if (!data) return send(response, 503, 'Fixtures have not been collected yet');
        return send(response, 200, JSON.stringify(data), 'application/json; charset=utf-8');
      }
      const file = normalize(join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(PUBLIC_DIR + sep) || !TYPES[extname(file)]) return send(response, 404, 'Not found');
      return send(response, 200, await readFile(file), TYPES[extname(file)]);
    } catch (error) {
      if (error.code === 'ENOENT') return send(response, 404, 'Not found');
      console.error(error);
      return send(response, 500, 'Server error');
    }
  });
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

async function refresh() {
  try {
    const result = await refreshFixtures();
    console.log(`${new Date().toISOString()} Refreshed ${result.fixtures.length} fixtures.`);
    if (result.errors.length) console.error('Some feeds failed:', JSON.stringify(result.errors));
  } catch (error) {
    console.error('Refresh failed:', error);
  }
}

async function main() {
  const saved = await readSavedFixtures();
  const age = saved ? Date.now() - Date.parse(saved.fetchedAt) : Infinity;
  if (!(age < REFRESH_EVERY_MS)) await refresh();
  setInterval(refresh, REFRESH_EVERY_MS);

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || 'localhost';
  createApp({ getFixtures: () => readSavedFixtures() }).listen(port, host, () => {
    console.log(`Nonno's dashboard: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
