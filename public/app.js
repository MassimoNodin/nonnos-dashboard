import { TEAM_ORDER, daysBetween, opponentOf, outcomeOf, teamSchedule } from './schedule.js';

const LOCALE = 'en-AU';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DATA_REFRESH_MS = 15 * 60 * 1000;
const REDRAW_MS = 30 * 1000;

const TEAM_STYLE = {
  Juventus: '#111',
  Collingwood: '#111',
  'Melbourne Victory': '#0b2a5b',
};

let data = null;
let lastLoadFailed = false;

const format = (date, options, timeZone = ZONE) => new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).format(date);
const fullDate = (date, timeZone) => format(date, { weekday: 'long', day: 'numeric', month: 'long' }, timeZone);
const clockTime = date => format(date, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap]m)$/i, ' $1');

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'style') Object.assign(node.style, value);
    else node[key] = value;
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false));
  return node;
}

function untilText(days) {
  if (days <= 14) return `In ${days} days`;
  if (days <= 60) return `In ${Math.round(days / 7)} weeks`;
  return `In about ${Math.round(days / 30.4)} months (off-season)`;
}

function dayLabel(game, now) {
  const kickoff = new Date(game.startTimeUtc);
  const days = daysBetween(now, kickoff, ZONE);
  if (game.timeStatus === 'tbc') return { text: `Around ${fullDate(kickoff, 'UTC')}`, until: untilText(days), soon: false };
  if (days === 0) return { text: 'Today', soon: true };
  if (days === 1) return { text: `Tomorrow, ${fullDate(kickoff)}`, soon: true };
  return { text: fullDate(kickoff), until: untilText(days), soon: false };
}

function opponentLine(game) {
  const { home, opponent } = opponentOf(game);
  return el('p', { className: 'opponent' }, `${home ? 'vs' : 'at'} ${opponent}`,
    el('span', { className: 'badge' }, home ? 'Home' : 'Away'));
}

function nextGame(game, now) {
  if (!game) return el('section', { className: 'next' },
    el('p', { className: 'label' }, 'Next game'),
    el('p', { className: 'when-day' }, 'No games listed yet'));
  const day = dayLabel(game, now);
  const tbc = game.timeStatus === 'tbc';
  return el('section', { className: 'next' },
    el('p', { className: 'label' }, 'Next game'),
    el('p', { className: `when-day${day.soon ? ' soon' : ''}` }, day.text),
    day.until && el('p', { className: 'until' }, day.until),
    el('p', { className: `when-time${tbc ? ' tbc' : ''}` }, tbc ? 'Time not announced yet' : clockTime(new Date(game.startTimeUtc))),
    opponentLine(game),
    game.venue && el('p', { className: 'where' }, game.venue));
}

function liveGame(game) {
  return el('section', { className: 'next' },
    el('p', { className: 'live' }, 'Playing now!'),
    el('p', { className: 'when-day' }, `Started at ${clockTime(new Date(game.startTimeUtc))}`),
    opponentLine(game),
    game.venue && el('p', { className: 'where' }, game.venue));
}

function lastGame(game) {
  if (!game) return null;
  const outcome = outcomeOf(game);
  const { home, opponent } = opponentOf(game);
  const when = format(new Date(game.startTimeUtc), { weekday: 'short', day: 'numeric', month: 'short' });
  const words = { win: 'Won', loss: 'Lost', draw: 'Draw' };
  return el('section', { className: 'last' },
    el('p', { className: 'label' }, `Last game · ${when}`),
    outcome
      ? el('p', { className: 'score' },
        el('span', { className: `outcome ${outcome.result}` }, words[outcome.result]), ` ${outcome.ours} – ${outcome.theirs} ${home ? 'vs' : 'at'} ${opponent}`)
      : el('p', { className: 'score' }, `${home ? 'vs' : 'at'} ${opponent} · score not in yet`));
}

function laterGames(games) {
  if (!games.length) return null;
  return el('section', { className: 'later' },
    el('p', { className: 'label' }, 'After that'),
    el('ul', {}, games.map(game => {
      const { home, opponent } = opponentOf(game);
      const kickoff = new Date(game.startTimeUtc);
      const tbc = game.timeStatus === 'tbc';
      const when = tbc
        ? `${format(kickoff, { weekday: 'short', day: 'numeric', month: 'short' }, 'UTC')} · time TBC`
        : `${format(kickoff, { weekday: 'short', day: 'numeric', month: 'short' })} · ${clockTime(kickoff)}`;
      return el('li', {}, el('span', {}, `${home ? 'vs' : 'at'} ${opponent}`), el('span', {}, when));
    })));
}

function teamCard(team, now) {
  const fixtures = data.fixtures.filter(fixture => fixture.team === team);
  const competition = fixtures.at(-1)?.competition ?? '';
  const { last, live, upcoming } = teamSchedule(fixtures, team, now.valueOf());
  const next = upcoming[0];
  const isToday = live || (next && next.timeStatus !== 'tbc' && daysBetween(now, new Date(next.startTimeUtc), ZONE) === 0);
  const card = el('article', { className: `card${isToday ? ' is-today' : ''}` },
    el('div', { className: 'card-head' }, el('h2', {}, team), el('p', {}, competition)),
    live ? liveGame(live) : nextGame(next, now),
    laterGames(upcoming.slice(live ? 0 : 1, live ? 2 : 3)),
    lastGame(last));
  card.style.setProperty('--team-stripe', TEAM_STYLE[team]);
  return card;
}

function render() {
  const now = new Date();
  document.getElementById('today').textContent = fullDate(now);
  document.getElementById('clock').textContent = clockTime(now);
  document.getElementById('zone').textContent = ZONE;
  if (!data) return;

  document.getElementById('teams').replaceChildren(...TEAM_ORDER.map(team => teamCard(team, now)));

  const updated = new Date(data.fetchedAt);
  const status = document.getElementById('status');
  status.className = lastLoadFailed || data.errors?.length ? 'warn' : '';
  status.textContent = `Game list updated ${format(updated, { weekday: 'short', day: 'numeric', month: 'short' })} at ${clockTime(updated)}.`
    + (data.errors?.length ? ' Some teams could not be updated; showing the last saved games.' : '')
    + (lastLoadFailed ? ' Cannot reach the dashboard server right now.' : '');
}

async function load() {
  try {
    const response = await fetch('/api/fixtures', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    lastLoadFailed = false;
  } catch (error) {
    console.error(error);
    lastLoadFailed = true;
    if (!data) document.getElementById('teams').replaceChildren(el('p', { className: 'loading' }, 'Cannot load the games right now. Trying again soon…'));
  }
  render();
}

load();
setInterval(load, DATA_REFRESH_MS);
setInterval(render, REDRAW_MS);
