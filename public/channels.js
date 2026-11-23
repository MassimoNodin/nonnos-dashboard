// Brand colours for the channels and streaming services games are shown on.
// Each is a coloured badge with the service name, so Nonno can match it to what is on his TV.

const BRANDS = [
  { match: ['bein'], label: 'beIN SPORTS', bg: '#5b2a86', fg: '#ffffff' },
  { match: ['paramount'], label: 'Paramount+', bg: '#0064ff', fg: '#ffffff' },
  { match: ['kayo'], label: 'Kayo Sports', bg: '#00d26a', fg: '#04210f' },
  { match: ['fox footy', 'foxtel', 'fox sports'], label: 'Fox Footy', bg: '#d71920', fg: '#ffffff' },
  { match: ['7plus', 'channel 7', 'channel seven', 'seven'], label: 'Channel 7', bg: '#f0412e', fg: '#ffffff' },
  { match: ['network 10', 'channel 10', '10 play', '10 bold', '10 peach'], label: 'Channel 10', bg: '#00a3e0', fg: '#00263a' },
  { match: ['sbs'], label: 'SBS', bg: '#12358f', fg: '#ffffff' },
  { match: ['stan'], label: 'Stan Sport', bg: '#1f6fe5', fg: '#ffffff' },
  { match: ['optus'], label: 'Optus Sport', bg: '#ffd400', fg: '#1a1a1a' },
  { match: ['prime', 'amazon'], label: 'Prime Video', bg: '#00a8e1', fg: '#00202b' },
  { match: ['channel 9', 'nine', '9now'], label: 'Channel 9', bg: '#f5f5f5', fg: '#111111' },
];

const FALLBACK = { bg: '#e8e8e8', fg: '#111111' };

/** Colours and a tidy name for a channel; unknown channels get a plain badge with their own name. */
export function brandFor(name) {
  const key = String(name).trim().toLowerCase();
  const brand = BRANDS.find(entry => entry.match.some(word => key.includes(word)));
  return brand ? { label: brand.label, bg: brand.bg, fg: brand.fg } : { label: String(name).trim(), ...FALLBACK };
}

/** Distinct channels for a game, in the order given, capped so they fit on screen. */
export function channelsFor(game, max = 3) {
  const names = Array.isArray(game.channels) ? game.channels : [];
  const seen = new Set();
  const brands = [];
  for (const name of names) {
    if (!String(name ?? '').trim()) continue;
    const brand = brandFor(name);
    if (seen.has(brand.label)) continue;
    seen.add(brand.label);
    brands.push(brand);
  }
  return brands.slice(0, max);
}
