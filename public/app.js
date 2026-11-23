import { channelsFor } from './channels.js';
import { TEAM_ORDER, daysBetween, isLive, opponentOf, upcomingGames } from './schedule.js';

const LOCALE = 'en-AU';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DATA_REFRESH_MS = 15 * 60 * 1000;
const LIVE_REFRESH_MS = 30 * 1000;
const REDRAW_MS = 30 * 1000;
const MAX_LIST = 8; // most games listed under the big panel; fewer if they do not fit

const TEAMS = {
  Juventus: { slug: 'juventus', initials: 'JUV' },
  Italy: { slug: 'italy', initials: 'ITA' },
  Collingwood: { slug: 'collingwood', initials: 'COL' },
  'Melbourne Victory': { slug: 'melbourne-victory', initials: 'MV' },
};

let data = null;
let live = {}; // ESPN state and score for games around kickoff, by fixture id
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

/** When a game is, in the fewest words. */
function when(game, now) {
  const kickoff = new Date(game.startTimeUtc);
  const tbc = game.timeStatus === 'tbc';
  // Placeholder times can push the date across midnight, so show TBC dates as the feed lists them.
  const zone = tbc ? 'UTC' : ZONE;
  const days = daysBetween(now, kickoff, zone);
  const on = isLive(game, now.valueOf(), live);
  return {
    on,
    flag: on ? 'live' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : null,
    day: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : format(kickoff, { weekday: 'long' }, zone),
    date: format(kickoff, { day: 'numeric', month: 'long' }, zone),
    weekdayShort: format(kickoff, { weekday: 'short' }, zone).toUpperCase(),
    dayNumber: format(kickoff, { day: 'numeric' }, zone),
    monthShort: format(kickoff, { month: 'short' }, zone).toUpperCase(),
    shortDate: format(kickoff, { weekday: 'short', day: 'numeric', month: 'short' }, zone),
    time: tbc ? null : timeParts(kickoff),
  };
}

const opponent = game => opponentOf(game).opponent;

/** Where to watch: one coloured badge for each channel or streaming service, if known. */
function channelBadges(game, size) {
  const brands = channelsFor(game, size === 'lg' ? 3 : 2);
  if (!brands.length) return null;
  const badges = brands.map(brand => el('span', { className: 'channel', style: `background:${brand.bg};color:${brand.fg}` }, brand.label));
  return el('div', { className: `channels channels-${size}` }, size === 'lg' ? el('p', { className: 'watch-on' }, 'Watch on') : null, el('div', { className: 'channel-list' }, badges));
}

function bigTime(time, className) {
  if (!time) return el('p', { className: `${className} tbc` }, 'Time TBC');
  return el('p', { className }, time.main, el('span', { className: 'period' }, time.period));
}

/** The live score, or null if none has come through (the page then just says "On now"). */
function liveScore(game) {
  const score = live[game.id];
  return score && score.ours !== null && score.theirs !== null ? score : null;
}

function heroScore(game) {
  const score = liveScore(game);
  const detail = live[game.id]?.detail;
  const badge = el('p', { className: 'on-now' }, el('span', { className: 'live-dot' }), 'ON NOW', detail ? el('span', { className: 'clock-detail' }, detail) : null);
  if (!score) return el('div', { className: 'hero-when is-live' }, badge);
  return el('div', { className: 'hero-when is-live' },
    badge,
    el('div', { className: 'scoreboard' },
      el('div', { className: 'side' }, el('p', { className: 'score' }, String(score.ours)), el('p', { className: 'side-name' }, game.team)),
      el('p', { className: 'dash' }, '–'),
      el('div', { className: 'side' }, el('p', { className: 'score' }, String(score.theirs)), el('p', { className: 'side-name' }, opponent(game)))));
}

function hero(game, now) {
  const w = when(game, now);
  return el('article', { className: `hero ${theme(game.team)}${w.flag ? ` is-${w.flag}` : ''}` },
    watermark(game.team),
    el('div', { className: 'hero-team' }, crest(game.team, 'lg'), el('p', { className: 'hero-team-name' }, game.team)),
    el('p', { className: 'hero-opponent' }, el('span', { className: 'vs' }, 'vs'), ` ${opponent(game)}`),
    w.on
      ? heroScore(game)
      : el('div', { className: 'hero-when' },
        el('div', {}, el('p', { className: 'hero-day' }, w.day), el('p', { className: 'hero-date' }, w.date)),
        bigTime(w.time, 'hero-time')),
    channelBadges(game, 'lg'));
}

function dateTile(w) {
  if (w.flag) return el('div', { className: `date-tile flag-${w.flag}` }, el('span', { className: 'tile-flag' }, w.flag === 'live' ? 'ON NOW' : w.flag === 'today' ? 'TODAY' : 'TMRW'));
  return el('div', { className: 'date-tile' },
    el('span', { className: 'tile-dow' }, w.weekdayShort),
    el('span', { className: 'tile-day' }, w.dayNumber),
    el('span', { className: 'tile-month' }, w.monthShort));
}

function row(game, now) {
  const w = when(game, now);
  const score = w.on ? liveScore(game) : null;
  return el('li', { className: `row ${theme(game.team)}${w.flag ? ` is-${w.flag}` : ''}` },
    dateTile(w),
    crest(game.team, 'md'),
    el('div', { className: 'row-main' },
      el('p', { className: 'row-team' }, game.team),
      el('p', { className: 'row-opponent' }, el('span', { className: 'vs' }, 'vs'), ` ${opponent(game)}`),
      channelBadges(game, 'sm')),
    w.on
      ? el('p', { className: 'row-time live-score' }, score ? `${score.ours} – ${score.theirs}` : 'On now')
      : bigTime(w.time, 'row-time'));
}

/** Teams that do not appear in the list get one slim line saying when they are next on. */
function laterLine(team, game, now) {
  return el('div', { className: `later-line ${theme(team)}` },
    crest(team, 'sm'),
    el('p', {}, el('strong', {}, team),
      el('span', {}, game ? `Next game ${when(game, now).shortDate} vs ${opponent(game)}` : 'No games yet')));
}

function render() {
  const now = new Date();
  const clock = timeParts(now);
  document.getElementById('clock').replaceChildren(clock.main, el('span', { className: 'period' }, clock.period));
  document.getElementById('today').textContent = format(now, { weekday: 'long', day: 'numeric', month: 'long' });
  if (!data) return;

  const games = upcomingGames(data.fixtures, now.valueOf(), live);
  document.getElementById('hero').replaceChildren(games.length
    ? hero(games[0], now)
    : el('p', { className: 'loading' }, 'No games coming up.'));

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

  // Only speak up when something is wrong.
  const status = document.getElementById('status');
  const problem = lastLoadFailed ? 'Cannot reach the dashboard right now.' : data.errors?.length ? 'Some games could not be updated.' : '';
  status.hidden = !problem;
  status.textContent = problem;
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

async function loadLive() {
  try {
    const response = await fetch('/api/live', { cache: 'no-store' });
    if (response.ok) live = await response.json();
  } catch (error) {
    console.error(error); // keep the last scores; the page still shows kickoff times
  }
  render();
}

load().then(loadLive);
setInterval(load, DATA_REFRESH_MS);
setInterval(loadLive, LIVE_REFRESH_MS);
setInterval(render, REDRAW_MS);
