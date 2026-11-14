import { TEAM_ORDER, daysBetween, isLive, opponentOf, upcomingGames } from './schedule.js';

const LOCALE = 'en-AU';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DATA_REFRESH_MS = 15 * 60 * 1000;
const REDRAW_MS = 30 * 1000;
const MAX_LIST = 8; // most games listed under the big panel; fewer if they do not fit

let data = null;
let lastLoadFailed = false;

const format = (date, options, timeZone = ZONE) => new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).format(date);
const clockTime = date => format(date, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap]m)$/i, ' $1');
const themeOf = team => `theme-${team.toLowerCase().replace(/[^a-z]+/g, '-')}`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false && child !== ''));
  return node;
}

/** Words for the day and time of a game, relative to now. */
function when(game, now) {
  const kickoff = new Date(game.startTimeUtc);
  const tbc = game.timeStatus === 'tbc';
  // Placeholder times can push the date across midnight, so show TBC dates as the feed lists them.
  const zone = tbc ? 'UTC' : ZONE;
  const days = daysBetween(now, kickoff, zone);
  const live = isLive(game, now.valueOf());
  const relative = live ? 'Playing now!' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : null;
  return {
    live,
    soon: live || days <= 1,
    relative,
    longDay: format(kickoff, { weekday: 'long', day: 'numeric', month: 'long' }, zone),
    shortDay: format(kickoff, { weekday: 'short', day: 'numeric', month: 'short' }, zone),
    time: tbc ? null : clockTime(kickoff),
    until: live || days <= 1 ? null : days <= 13 ? `In ${days} days` : days <= 60 ? `In ${Math.round(days / 7)} weeks` : `In about ${Math.round(days / 30.4)} months`,
  };
}

function matchup(game) {
  const { home, opponent } = opponentOf(game);
  return { label: home ? 'Home' : 'Away', text: home ? `vs ${opponent}` : `at ${opponent}` };
}

function teamTag(game) {
  return el('p', { className: 'team-tag' },
    el('span', { className: 'team-name' }, game.team),
    el('span', { className: 'competition' }, game.competition));
}

function hero(game, now) {
  const time = when(game, now);
  const match = matchup(game);
  return el('article', { className: `hero ${themeOf(game.team)}${time.soon ? ' is-soon' : ''}` },
    el('p', { className: 'eyebrow' }, time.live ? 'On now' : 'Next game'),
    teamTag(game),
    el('p', { className: 'hero-day' }, time.relative ? `${time.relative} · ${time.longDay}` : time.longDay),
    time.live ? null : el('p', { className: time.time ? 'hero-time' : 'hero-time tbc' }, time.time ?? 'Time not announced yet'),
    el('p', { className: 'hero-match' }, el('span', { className: 'badge' }, match.label), ` ${match.text}`),
    game.venue && el('p', { className: 'hero-venue' }, game.venue),
    time.until && el('p', { className: 'hero-until' }, time.until));
}

function row(game, now) {
  const time = when(game, now);
  const match = matchup(game);
  return el('li', { className: `row ${themeOf(game.team)}${time.soon ? ' is-soon' : ''}` },
    el('div', { className: 'row-when' },
      el('p', { className: 'row-day' }, time.relative ?? time.shortDay),
      el('p', { className: time.time ? 'row-time' : 'row-time tbc' }, time.live ? 'On now' : time.time ?? 'Time TBC')),
    el('div', { className: 'row-what' },
      teamTag(game),
      el('p', { className: 'row-match' }, el('span', { className: 'badge' }, match.label), ` ${match.text}`),
      game.venue && el('p', { className: 'row-venue' }, game.venue)));
}

/** Teams that do not appear in the list get one line saying when they are next on. */
function laterLine(team, game) {
  if (!game) return el('p', { className: `later-line ${themeOf(team)}` }, el('strong', {}, team), ' · no games listed yet');
  const time = when(game, new Date());
  return el('p', { className: `later-line ${themeOf(team)}` },
    el('strong', {}, team), ` · next game ${time.shortDay} · ${matchup(game).text}${game.venue ? `, ${game.venue}` : ''}`);
}

function render() {
  const now = new Date();
  document.getElementById('clock').textContent = clockTime(now);
  document.getElementById('today').textContent = format(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('zone').textContent = ZONE.split('/').pop().replace(/_/g, ' ');
  if (!data) return;

  const games = upcomingGames(data.fixtures, now.valueOf());
  document.getElementById('hero').replaceChildren(games.length
    ? hero(games[0], now)
    : el('p', { className: 'loading' }, 'No games are listed right now.'));

  // Lines for teams missing from the list take space too, so recompute them as rows are dropped.
  const list = document.getElementById('list');
  const later = document.getElementById('later');
  let count = Math.min(MAX_LIST, games.length - 1);
  do {
    const shown = games.slice(0, count + 1);
    list.replaceChildren(...shown.slice(1).map(game => row(game, now)));
    const missing = TEAM_ORDER.filter(team => !shown.some(game => game.team === team));
    later.replaceChildren(...missing.map(team => laterLine(team, games.find(game => game.team === team))));
  } while (count-- > 1 && list.scrollHeight > list.clientHeight + 1);
  document.getElementById('list-title').hidden = list.children.length === 0;

  const updated = new Date(data.fetchedAt);
  const status = document.getElementById('status');
  status.className = lastLoadFailed || data.errors?.length ? 'warn' : '';
  status.textContent = `Updated ${format(updated, { weekday: 'short', day: 'numeric', month: 'short' })} at ${clockTime(updated)}.`
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
    if (!data) document.getElementById('hero').replaceChildren(el('p', { className: 'loading' }, 'Cannot load the games right now. Trying again soon…'));
  }
  render();
}

load();
setInterval(load, DATA_REFRESH_MS);
setInterval(render, REDRAW_MS);
