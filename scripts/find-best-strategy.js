/**
 * Find the best betting strategy for a given Premier League matchweek.
 *
 * Tests dozens of rule-based strategies (using only pre-game odds) and ranks
 * them by profit. Also finds the theoretically optimal selection.
 *
 * Usage:
 *   SEASON=2526 node scripts/find-best-strategy.js
 *   SEASON=2526 MATCHDAY=29 node scripts/find-best-strategy.js
 *   SEASON=2526 STAKE=10 node scripts/find-best-strategy.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR    = path.join(__dirname, '..', '.cache');
const STAKE        = parseFloat(process.env.STAKE || '1');
const SEASON       = process.env.SEASON || '2526';
const MATCHDAY     = process.env.MATCHDAY ? parseInt(process.env.MATCHDAY) : null;
const FORCE_REFRESH = process.argv.includes('--refresh');
const CSV_URL      = `https://www.football-data.co.uk/mmz4281/${SEASON}/E0.csv`;

// ─── Cache ────────────────────────────────────────────────────────────────────
function cacheGet(key) {
  const file = path.join(CACHE_DIR, key);
  if (!FORCE_REFRESH && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return null;
}
function cacheSet(key, data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, key), data, 'utf8');
}
async function fetchText(url, cacheKey) {
  if (cacheKey) { const c = cacheGet(cacheKey); if (c) return c; }
  const data = await new Promise((resolve, reject) => {
    https.get(url, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(b)); }).on('error', reject);
  });
  if (cacheKey) cacheSet(cacheKey, data);
  return data;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/\r/g, ''));
    const row = {};
    headers.forEach((h, i) => (row[h] = vals[i] || ''));
    return row;
  }).filter(r => r.HomeTeam);
}
function parseDate(str) {
  const [d, m, y] = str.split('/');
  if (!d) return 0;
  const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
  return new Date(year, parseInt(m) - 1, parseInt(d)).getTime();
}
function groupIntoMatchdays(rows) {
  const sorted = [...rows].sort((a, b) => parseDate(a.Date) - parseDate(b.Date));
  const matchdays = [];
  let i = 0;
  while (i < sorted.length) {
    const anchor = parseDate(sorted[i].Date);
    const batch = [];
    let j = i;
    while (j < sorted.length && parseDate(sorted[j].Date) - anchor <= 3 * 86400 * 1000) {
      batch.push(sorted[j++]);
    }
    matchdays.push(batch);
    i = j;
  }
  return matchdays;
}

// ─── Strategy evaluation ──────────────────────────────────────────────────────
function evaluate(games, stratFn) {
  let staked = 0, returned = 0, bets = 0;
  const details = games.map(g => {
    const pick = stratFn(g);
    if (!pick) return { pick: null, won: false, profit: 0, skipped: true };

    const oddsMap = { H: g.B365H, D: g.B365D, A: g.B365A };
    const odds = oddsMap[pick];
    const won  = g.FTR === pick;
    const payout = won ? STAKE * odds : 0;
    const profit = payout - STAKE;

    staked   += STAKE;
    returned += payout;
    bets++;
    return { pick, odds, won, profit, skipped: false };
  });

  const profit = returned - staked;
  const roi    = staked > 0 ? (profit / staked) * 100 : 0;
  return { staked, returned, profit, roi, bets, details };
}

// ─── Strategy definitions ─────────────────────────────────────────────────────
function buildStrategies() {
  const strategies = [];
  const add = (name, fn) => strategies.push({ name, fn });

  // ── Side strategies ──
  add('Always Home',         g => 'H');
  add('Always Away',         g => 'A');
  add('Always Draw',         g => 'D');

  // ── Odds-based selection ──
  add('Bet Favourite',       g => minKey(g));
  add('Bet Underdog',        g => maxKey(g));
  add('Bet 2nd Favourite',   g => midKey(g));

  // ── Home/Away comparison ──
  add('Home if fav over Away',  g => g.B365H <= g.B365A ? 'H' : 'A');
  add('Away if fav over Home',  g => g.B365A <= g.B365H ? 'A' : 'H');
  add('Home if fav (all)',      g => g.B365H < g.B365D && g.B365H < g.B365A ? 'H' : null);
  add('Away if fav (all)',      g => g.B365A < g.B365D && g.B365A < g.B365H ? 'A' : null);
  add('Draw if fav (all)',      g => g.B365D < g.B365H && g.B365D < g.B365A ? 'D' : null);

  // ── Home odds thresholds ──
  for (const t of [1.5, 1.75, 2.0, 2.25, 2.5, 3.0]) {
    add(`Home if odds ≤ ${t}`,  g => g.B365H <= t ? 'H' : null);
    add(`Home if odds > ${t}`,  g => g.B365H > t  ? 'H' : null);
  }

  // ── Away odds thresholds ──
  for (const t of [2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) {
    add(`Away if odds ≤ ${t}`,  g => g.B365A <= t ? 'A' : null);
    add(`Away if odds > ${t}`,  g => g.B365A > t  ? 'A' : null);
  }

  // ── Draw odds thresholds ──
  for (const t of [3.0, 3.25, 3.5, 3.75, 4.0]) {
    add(`Draw if odds ≤ ${t}`,  g => g.B365D <= t ? 'D' : null);
    add(`Draw if odds > ${t}`,  g => g.B365D > t  ? 'D' : null);
  }

  // ── Underdog combos ──
  add('Away if odds > 3.0 else Home',  g => g.B365A > 3.0  ? 'A' : 'H');
  add('Away if odds > 4.0 else Home',  g => g.B365A > 4.0  ? 'A' : 'H');
  add('Home if odds > 2.5 else Away',  g => g.B365H > 2.5  ? 'H' : 'A');
  add('Favourite excl. Draw',          g => g.B365H < g.B365A ? 'H' : 'A');

  // ── Value: implied prob < threshold ──
  for (const t of [0.4, 0.45, 0.5, 0.55, 0.6]) {
    add(`Home if implied prob < ${t}`, g => (1 / g.B365H) < t ? 'H' : null);
    add(`Away if implied prob < ${t}`, g => (1 / g.B365A) < t ? 'A' : null);
  }

  return strategies;
}

function minKey(g) {
  return [['H', g.B365H], ['D', g.B365D], ['A', g.B365A]].sort((a, b) => a[1] - b[1])[0][0];
}
function maxKey(g) {
  return [['H', g.B365H], ['D', g.B365D], ['A', g.B365A]].sort((a, b) => b[1] - a[1])[0][0];
}
function midKey(g) {
  return [['H', g.B365H], ['D', g.B365D], ['A', g.B365A]].sort((a, b) => a[1] - b[1])[1][0];
}

// ─── Optimal (exhaustive) search ──────────────────────────────────────────────
function findOptimal(games) {
  const choices = ['H', 'D', 'A'];
  let best = { profit: -Infinity, picks: [] };

  for (let i = 0; i < Math.pow(3, games.length); i++) {
    let n = i;
    const picks = games.map(() => { const c = choices[n % 3]; n = Math.floor(n / 3); return c; });
    let profit = 0;
    for (let j = 0; j < games.length; j++) {
      const g = games[j];
      const pick = picks[j];
      const odds = pick === 'H' ? g.B365H : pick === 'D' ? g.B365D : g.B365A;
      profit += g.FTR === pick ? STAKE * odds - STAKE : -STAKE;
    }
    if (profit > best.profit) best = { profit, picks };
  }
  return best;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const csv = await fetchText(CSV_URL, `football-data-${SEASON}-E0.csv`);
  const rows = parseCSV(csv);
  const matchdays = groupIntoMatchdays(rows);

  let target;
  if (MATCHDAY) {
    target = matchdays[MATCHDAY - 1];
    if (!target) { console.error(`Matchday ${MATCHDAY} not found.`); process.exit(1); }
  } else {
    target = [...matchdays].reverse().find(md => md.length >= 8 && md.every(r => r.FTR));
    if (!target) { console.error('No complete matchday found.'); process.exit(1); }
  }

  const mdNumber = matchdays.indexOf(target) + 1;
  const dates = [...new Set(target.map(r => r.Date))].join(' / ');

  // Normalise game objects
  const games = target.map(r => ({
    label:  `${r.HomeTeam} vs ${r.AwayTeam}`,
    home:   r.HomeTeam,
    away:   r.AwayTeam,
    score:  `${r.FTHG}-${r.FTAG}`,
    FTR:    r.FTR,
    B365H:  parseFloat(r.B365H) || 2,
    B365D:  parseFloat(r.B365D) || 3,
    B365A:  parseFloat(r.B365A) || 4,
  }));

  console.log(`\nMatchweek ${mdNumber}  (${dates})  —  ${games.length} games  |  stake $${STAKE}/game\n`);

  // ── Evaluate all strategies ──────────────────────────────────────────────
  const strategies = buildStrategies();
  const results = strategies
    .map(s => ({ name: s.name, ...evaluate(games, s.fn) }))
    .filter(r => r.bets > 0)
    .sort((a, b) => b.profit - a.profit);

  // ── Print top 15 ─────────────────────────────────────────────────────────
  const col  = (s, n) => String(s ?? '').padEnd(n);
  const rcol = (s, n) => String(s ?? '').padStart(n);

  console.log('TOP STRATEGIES (ranked by profit)\n');
  console.log(col('Strategy', 36) + rcol('Bets', 6) + rcol('Staked', 8) + rcol('Return', 8) + rcol('Profit', 9) + rcol('ROI', 8));
  console.log('─'.repeat(75));

  for (const r of results.slice(0, 15)) {
    const profitStr = (r.profit >= 0 ? '+' : '') + r.profit.toFixed(2);
    const roiStr    = (r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '%';
    console.log(
      col(r.name, 36) +
      rcol(r.bets, 6) +
      rcol('$' + r.staked.toFixed(2), 8) +
      rcol('$' + r.returned.toFixed(2), 8) +
      rcol(profitStr, 9) +
      rcol(roiStr, 8)
    );
  }

  // ── Best strategy detail ──────────────────────────────────────────────────
  const best = results[0];
  console.log(`\n${'─'.repeat(75)}`);
  console.log(`\nBEST STRATEGY: "${best.name}"\n`);
  console.log(col('Match', 34) + col('Score', 8) + col('Pick', 6) + col('Odds', 8) + col('Result', 8) + rcol('P&L', 7));
  console.log('─'.repeat(75));

  games.forEach((g, i) => {
    const d = best.details[i];
    if (d.skipped) {
      console.log(col(g.label, 34) + col(g.score, 8) + col('SKIP', 6));
      return;
    }
    const resultStr = d.won ? 'WIN' : (g.FTR === 'D' && d.pick !== 'D' ? 'DRAW' : 'LOSS');
    const plStr = (d.profit >= 0 ? '+' : '') + d.profit.toFixed(2);
    console.log(
      col(g.label, 34) + col(g.score, 8) +
      col(d.pick, 6) + col(d.odds.toFixed(2), 8) +
      col(resultStr, 8) + rcol(plStr, 7)
    );
  });

  // ── Optimal selection ────────────────────────────────────────────────────
  const optimal = findOptimal(games);
  const pickLabels = { H: 'Home', D: 'Draw', A: 'Away' };

  console.log(`\n${'─'.repeat(75)}`);
  console.log(`\nTHEORETICAL OPTIMUM (perfect hindsight)  →  +$${optimal.profit.toFixed(2)}\n`);
  games.forEach((g, i) => {
    const pick = optimal.picks[i];
    const odds = pick === 'H' ? g.B365H : pick === 'D' ? g.B365D : g.B365A;
    console.log(`  ${g.label.padEnd(32)}  bet ${pickLabels[pick].padEnd(5)} @ ${odds.toFixed(2)}  →  ${g.score}`);
  });
  console.log('');
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
