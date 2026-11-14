import { TEAM_ORDER, daysBetween, isLive, opponentOf, upcomingGames } from './schedule.js';

const LOCALE = 'en-AU';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DATA_REFRESH_MS = 15 * 60 * 1000;
const REDRAW_MS = 30 * 1000;
const MAX_LIST = 8; // most games listed under the big panel; fewer if they do not fit

const TEAMS = {
  Juventus: { slug: 'juventus', initials: 'JUV' },
  Collingwood: { slug: 'collingwood', initials: 'COL' },
  'Melbourne Victory': { slug: 'melbourne-victory', initials: 'MV' },
};

let data = null;
let lastLoadFailed = false;

const format = (date, options, timeZone = ZONE) => new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).format(date);

/** "3:00" and "pm" separately, so the period can be set smaller. */
function timeParts(date) {
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).formatToParts(date);
  const main = parts.filter(part => ['hour', 'literal', 'minute'].includes(part.type)).map(part => part.value).join('').trim();
  const period = parts.find(part => part.type === 'dayPeriod')?.value.toLowerCase() ?? '';
  return { main, period };
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false && child !== ''));
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function pinIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z');
  svg.append(path);
  return svg;
}

const theme = team => `t-${TEAMS[team]?.slug ?? 'other'}`;

function crest(team, size) {
  const info = TEAMS[team];
  const holder = el('div', { className: `crest crest-${size}` });
  const fallback = () => holder.replaceChildren(el('span', { className: 'crest-initials' }, info?.initials ?? team.slice(0, 3).toUpperCase()));
  if (!info) fallback();
  else holder.append(el('img', { src: `/logos/${info.slug}.svg`, alt: `${team} logo`, onerror: fallback }));
  return holder;
}

function watermark(team) {
  const info = TEAMS[team];
  return info ? el('img', { className: 'watermark', src: `/logos/${info.slug}.svg`, alt: '', onerror() { this.remove(); } }) : null;
}

function venueLine(game, className) {
  return game.venue ? el('p', { className: `venue ${className}` }, pinIcon(), el('span', {}, game.venue)) : null;
}

/** Everything the page says about when a game is. */
function when(game, now) {
  const kickoff = new Date(game.startTimeUtc);
  const tbc = game.timeStatus === 'tbc';
  // Placeholder times can push the date across midnight, so show TBC dates as the feed lists them.
  const zone = tbc ? 'UTC' : ZONE;
  const days = daysBetween(now, kickoff, zone);
  const live = isLive(game, now.valueOf());
  return {
    live,
    days,
    flag: live ? 'live' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : null,
    weekday: format(kickoff, { weekday: 'long' }, zone),
    weekdayShort: format(kickoff, { weekday: 'short' }, zone).toUpperCase(),
    dayMonth: format(kickoff, { day: 'numeric', month: 'long' }, zone),
    dayNumber: format(kickoff, { day: 'numeric' }, zone),
    monthShort: format(kickoff, { month: 'short' }, zone).toUpperCase(),
    shortDate: format(kickoff, { weekday: 'short', day: 'numeric', month: 'short' }, zone),
    time: tbc ? null : timeParts(kickoff),
    countdown: live ? 'Playing now' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
      : days <= 13 ? `In ${days} days` : days <= 60 ? `In ${Math.round(days / 7)} weeks` : `In ${Math.round(days / 30.4)} months`,
  };
}

function versus(game) {
  const { home, opponent } = opponentOf(game);
  return { home, opponent, word: home ? 'vs' : 'at', label: home ? 'Home' : 'Away' };
}

function bigTime(time, className) {
  if (!time) return el('p', { className: `${className} tbc` }, 'TBC');
  return el('p', { className }, time.main, el('span', { className: 'period' }, time.period));
}

function hero(game, now) {
  const w = when(game, now);
  const v = versus(game);
  const chip = el('span', { className: `chip${w.flag ? ` chip-${w.flag}` : ''}` }, w.live ? el('span', { className: 'live-dot' }) : null, w.countdown);
  return el('article', { className: `hero ${theme(game.team)}${w.flag ? ` is-${w.flag}` : ''}` },
    watermark(game.team),
    el('div', { className: 'hero-top' }, el('p', { className: 'eyebrow' }, w.live ? 'On now' : 'Next game'), chip),
    el('div', { className: 'hero-team' },
      crest(game.team, 'lg'),
      el('div', {},
        el('p', { className: 'hero-team-name' }, game.team),
        el('p', { className: 'hero-meta' }, `${game.competition} · ${v.label} game`))),
    el('p', { className: 'hero-opponent' }, el('span', { className: 'vs' }, v.word), ` ${v.opponent}`),
    el('div', { className: 'hero-when' },
      el('div', { className: 'hero-date' },
        el('p', { className: 'hero-weekday' }, w.flag === 'today' || w.flag === 'live' ? 'Today' : w.flag === 'tomorrow' ? 'Tomorrow' : w.weekday),
        el('p', { className: 'hero-daymonth' }, w.flag ? `${w.weekday} ${w.dayMonth}` : w.dayMonth)),
      w.live ? el('p', { className: 'hero-time live-now' }, 'LIVE') : bigTime(w.time, 'hero-time')),
    !w.live && !w.time ? el('p', { className: 'hero-note' }, 'Start time not announced yet') : null,
    venueLine(game, 'hero-venue'));
}

function dateTile(w) {
  if (w.flag) return el('div', { className: `date-tile flag-${w.flag}` }, el('span', { className: 'tile-flag' }, w.flag === 'live' ? 'LIVE' : w.flag === 'today' ? 'TODAY' : 'TMRW'));
  return el('div', { className: 'date-tile' },
    el('span', { className: 'tile-dow' }, w.weekdayShort),
    el('span', { className: 'tile-day' }, w.dayNumber),
    el('span', { className: 'tile-month' }, w.monthShort));
}

function row(game, now) {
  const w = when(game, now);
  const v = versus(game);
  return el('li', { className: `row ${theme(game.team)}${w.flag ? ` is-${w.flag}` : ''}` },
    dateTile(w),
    crest(game.team, 'md'),
    el('div', { className: 'row-main' },
      el('p', { className: 'row-team' }, game.team, el('span', { className: 'row-tag' }, v.label)),
      el('p', { className: 'row-opponent' }, el('span', { className: 'vs' }, v.word), ` ${v.opponent}`),
      venueLine(game, 'row-venue')),
    w.live ? el('p', { className: 'row-time live-now' }, 'LIVE') : bigTime(w.time, 'row-time'));
}

/** Teams that do not appear in the list get one slim line saying when they are next on. */
function laterLine(team, game, now) {
  const text = game
    ? `${when(game, now).days > 30 ? 'Season break · back' : 'Next game'} ${when(game, now).shortDate}, ${versus(game).word} ${versus(game).opponent}`
    : 'No games listed yet';
  return el('div', { className: `later-line ${theme(team)}` },
    crest(team, 'sm'),
    el('p', {}, el('strong', {}, team), el('span', {}, text)));
}

function greeting(now) {
  const hour = Number(format(now, { hour: 'numeric', hourCycle: 'h23' }));
  return hour < 12 ? 'Buongiorno, Nonno' : hour < 18 ? 'Buon pomeriggio, Nonno' : 'Buonasera, Nonno';
}

function render() {
  const now = new Date();
  const clock = timeParts(now);
  document.getElementById('clock').replaceChildren(clock.main, el('span', { className: 'period' }, clock.period));
  document.getElementById('greeting').textContent = greeting(now);
  document.getElementById('today').textContent = format(now, { weekday: 'long', day: 'numeric', month: 'long' });
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
    later.replaceChildren(...missing.map(team => laterLine(team, games.find(game => game.team === team), now)));
  } while (count-- > 1 && list.scrollHeight > list.clientHeight + 1);
  document.getElementById('list-title').hidden = list.children.length === 0;

  const updated = new Date(data.fetchedAt);
  const status = document.getElementById('status');
  status.className = lastLoadFailed || data.errors?.length ? 'warn' : '';
  status.textContent = `Updated ${format(updated, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`
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
