/**
 * Season-wide strategy analysis — Premier League
 *
 * Runs every strategy across every matchweek, aggregates results,
 * and ranks strategies by total profit and consistency.
 *
 * Caches both the raw CSV and the computed per-matchweek results.
 *
 * Usage:
 *   SEASON=2526 node scripts/season-analysis.js
 *   SEASON=2425 node scripts/season-analysis.js
 *   SEASON=2526 node scripts/season-analysis.js --refresh   # recompute cache
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR     = path.join(__dirname, '..', '.cache');
const STAKE         = parseFloat(process.env.STAKE || '1');
const SEASON        = process.env.SEASON || '2526';
const FORCE_REFRESH = process.argv.includes('--refresh');
const CSV_URL       = `https://www.football-data.co.uk/mmz4281/${SEASON}/E0.csv`;
const RESULTS_CACHE = path.join(CACHE_DIR, `season-analysis-${SEASON}.json`);

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
  }).filter(r => r.HomeTeam && r.FTR);
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

// ─── Strategies ───────────────────────────────────────────────────────────────
function buildStrategies() {
  const s = [];
  const add = (name, fn) => s.push({ name, fn });

  add('Always Home',                   g => 'H');
  add('Always Away',                   g => 'A');
  add('Always Draw',                   g => 'D');
  add('Bet Favourite',                 g => minKey(g));
  add('Bet Underdog',                  g => maxKey(g));
  add('Bet 2nd Favourite',             g => midKey(g));
  add('Home if fav (all)',             g => g.B365H < g.B365D && g.B365H < g.B365A ? 'H' : null);
  add('Away if fav (all)',             g => g.B365A < g.B365D && g.B365A < g.B365H ? 'A' : null);
  add('Draw if fav (all)',             g => g.B365D < g.B365H && g.B365D < g.B365A ? 'D' : null);
  add('Favourite excl. Draw',          g => g.B365H < g.B365A ? 'H' : 'A');
  add('Away if odds > 3.0 else Home',  g => g.B365A > 3.0 ? 'A' : 'H');
  add('Away if odds > 4.0 else Home',  g => g.B365A > 4.0 ? 'A' : 'H');
  add('Home if odds > 2.5 else Away',  g => g.B365H > 2.5 ? 'H' : 'A');

  for (const t of [1.5, 1.75, 2.0, 2.25, 2.5, 3.0]) {
    add(`Home if odds ≤ ${t}`,   g => g.B365H <= t ? 'H' : null);
    add(`Home if odds > ${t}`,   g => g.B365H >  t ? 'H' : null);
  }
  for (const t of [2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) {
    add(`Away if odds ≤ ${t}`,   g => g.B365A <= t ? 'A' : null);
    add(`Away if odds > ${t}`,   g => g.B365A >  t ? 'A' : null);
  }
  for (const t of [3.0, 3.25, 3.5, 3.75, 4.0]) {
    add(`Draw if odds ≤ ${t}`,   g => g.B365D <= t ? 'D' : null);
  }
  for (const t of [0.35, 0.4, 0.45, 0.5, 0.55]) {
    add(`Home if impl < ${t}`,   g => (1 / g.B365H) < t ? 'H' : null);
    add(`Away if impl < ${t}`,   g => (1 / g.B365A) < t ? 'A' : null);
  }

  return s;
}

function minKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>a[1]-b[1])[0][0]; }
function maxKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>b[1]-a[1])[0][0]; }
function midKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>a[1]-b[1])[1][0]; }

function normalise(rows) {
  return rows.map(r => ({
    home:  r.HomeTeam, away: r.AwayTeam,
    FTR:   r.FTR,
    B365H: parseFloat(r.B365H) || 2,
    B365D: parseFloat(r.B365D) || 3.2,
    B365A: parseFloat(r.B365A) || 4,
  }));
}

function evaluateMatchday(games, stratFn) {
  let staked = 0, returned = 0, bets = 0;
  for (const g of games) {
    const pick = stratFn(g);
    if (!pick) continue;
    const odds = pick === 'H' ? g.B365H : pick === 'D' ? g.B365D : g.B365A;
    const won  = g.FTR === pick;
    staked   += STAKE;
    returned += won ? STAKE * odds : 0;
    bets++;
  }
  return { staked, returned, profit: returned - staked, bets };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  // ── Check computed cache ──
  if (!FORCE_REFRESH && fs.existsSync(RESULTS_CACHE)) {
    console.log(`\n(using cached season analysis — run with --refresh to recompute)\n`);
    printResults(JSON.parse(fs.readFileSync(RESULTS_CACHE, 'utf8')));
    return;
  }

  // ── Fetch + parse CSV ──
  console.log(`\nLoading season ${SEASON} data...`);
  const csv  = await fetchText(CSV_URL, `football-data-${SEASON}-E0.csv`);
  const rows = parseCSV(csv);
  const matchdays = groupIntoMatchdays(rows).filter(md => md.length >= 8 && md.every(r => r.FTR));

  console.log(`Found ${matchdays.length} complete matchweeks. Computing strategies...\n`);

  const strategies = buildStrategies();

  // ── Compute per-matchweek results for every strategy ──
  // Shape: { strategyName -> [{ mw, profit, bets, staked, returned }, ...] }
  const byStrategy = {};
  for (const strat of strategies) {
    byStrategy[strat.name] = matchdays.map((games, idx) => {
      const r = evaluateMatchday(normalise(games), strat.fn);
      const dates = [...new Set(games.map(g => g.Date))].join('/');
      return { mw: idx + 1, dates, ...r };
    }).filter(r => r.bets > 0);
  }

  // ── Aggregate season totals ──
  const summary = Object.entries(byStrategy).map(([name, weeks]) => {
    const totalProfit  = weeks.reduce((s, w) => s + w.profit, 0);
    const totalStaked  = weeks.reduce((s, w) => s + w.staked, 0);
    const totalBets    = weeks.reduce((s, w) => s + w.bets, 0);
    const profitWeeks  = weeks.filter(w => w.profit > 0).length;
    const roi          = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const weeksCovered = weeks.length;
    return { name, totalProfit, totalStaked, totalBets, roi, profitWeeks, weeksCovered, weeks };
  }).sort((a, b) => b.totalProfit - a.totalProfit);

  const payload = { season: SEASON, matchweeks: matchdays.length, summary };

  // ── Cache computed results ──
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_CACHE, JSON.stringify(payload, null, 2));
  console.log(`Results cached to ${path.relative(process.cwd(), RESULTS_CACHE)}\n`);

  printResults(payload);
}

function printResults({ season, matchweeks, summary }) {
  const col  = (s, n) => String(s ?? '').padEnd(n);
  const rcol = (s, n) => String(s ?? '').padStart(n);

  console.log(`Season ${season}  |  ${matchweeks} complete matchweeks  |  $${STAKE}/bet\n`);

  // ── Season leaderboard ──
  console.log('SEASON LEADERBOARD (top 20 by total profit)\n');
  console.log(
    col('Strategy', 36) +
    rcol('Bets', 6) + rcol('Staked', 9) + rcol('Return', 9) +
    rcol('Profit', 9) + rcol('ROI', 8) +
    rcol('Win wks', 9) + rcol('Wks', 5)
  );
  console.log('─'.repeat(91));

  for (const s of summary.slice(0, 20)) {
    const profitStr = (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2);
    const roiStr    = (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%';
    const winWkStr  = `${s.profitWeeks}/${s.weeksCovered}`;
    console.log(
      col(s.name, 36) +
      rcol(s.totalBets, 6) + rcol('$' + s.totalStaked.toFixed(0), 9) +
      rcol('$' + (s.totalStaked + s.totalProfit).toFixed(2), 9) +
      rcol(profitStr, 9) + rcol(roiStr, 8) +
      rcol(winWkStr, 9) + rcol(s.weeksCovered, 5)
    );
  }

  // ── Most consistent (best win-week ratio, min 10 bets/wk average) ──
  const consistent = [...summary]
    .filter(s => s.totalBets / s.weeksCovered >= 3)
    .sort((a, b) => (b.profitWeeks / b.weeksCovered) - (a.profitWeeks / a.weeksCovered));

  console.log('\n' + '─'.repeat(91));
  console.log('\nMOST CONSISTENT (best profitable-week %, min 3 bets/wk avg)\n');
  console.log(col('Strategy', 36) + rcol('Win wks', 9) + rcol('Win %', 8) + rcol('Total P&L', 11) + rcol('ROI', 8));
  console.log('─'.repeat(72));
  for (const s of consistent.slice(0, 10)) {
    const winPct    = ((s.profitWeeks / s.weeksCovered) * 100).toFixed(1);
    const profitStr = (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2);
    const roiStr    = (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%';
    console.log(
      col(s.name, 36) + rcol(`${s.profitWeeks}/${s.weeksCovered}`, 9) +
      rcol(winPct + '%', 8) + rcol(profitStr, 11) + rcol(roiStr, 8)
    );
  }

  // ── Weekly P&L for the #1 strategy ──
  const best = summary[0];
  console.log(`\n${'─'.repeat(91)}`);
  console.log(`\nWEEKLY P&L — "${best.name}"\n`);
  console.log(col('MW', 5) + col('Dates', 22) + rcol('Bets', 5) + rcol('Profit', 9) + rcol('Cum. P&L', 10));
  console.log('─'.repeat(51));

  let cumulative = 0;
  for (const w of best.weeks) {
    cumulative += w.profit;
    const pStr = (w.profit >= 0 ? '+' : '') + w.profit.toFixed(2);
    const cStr = (cumulative >= 0 ? '+' : '') + cumulative.toFixed(2);
    const bar  = w.profit >= 0 ? '▓'.repeat(Math.min(Math.round(w.profit * 2), 20)) : '░'.repeat(Math.min(Math.round(Math.abs(w.profit) * 2), 20));
    console.log(col(w.mw, 5) + col(w.dates, 22) + rcol(w.bets, 5) + rcol(pStr, 9) + rcol(cStr, 10) + '  ' + bar);
  }

  const tp = best.totalProfit;
  console.log('─'.repeat(51));
  console.log(`${''.padEnd(27)}${rcol('TOTAL', 5)}${rcol((tp >= 0 ? '+' : '') + tp.toFixed(2), 9)}  ROI: ${(best.roi >= 0 ? '+' : '') + best.roi.toFixed(1)}%\n`);
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
