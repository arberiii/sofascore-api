/**
 * Season analysis with a fixed weekly budget of $10.
 * Stake per game = $10 / games bet that week.
 *
 * Selective strategies (fewer bets) get a higher per-game stake,
 * which amplifies both wins and losses.
 *
 * Usage:
 *   SEASON=2526 node scripts/season-bankroll.js
 *   SEASON=2526 WEEKLY=20 node scripts/season-bankroll.js
 *   SEASON=2526 node scripts/season-bankroll.js --refresh
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR     = path.join(__dirname, '..', '.cache');
const WEEKLY        = parseFloat(process.env.WEEKLY || '10');
const SEASON        = process.env.SEASON || '2526';
const FORCE_REFRESH = process.argv.includes('--refresh');
const CSV_URL       = `https://www.football-data.co.uk/mmz4281/${SEASON}/E0.csv`;
const RESULTS_CACHE = path.join(CACHE_DIR, `season-bankroll-${SEASON}-w${WEEKLY}.json`);

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
function normalise(rows) {
  return rows.map(r => ({
    home:    r.HomeTeam,
    away:    r.AwayTeam,
    FTR:     r.FTR,
    FTHG:    parseInt(r.FTHG) || 0,
    FTAG:    parseInt(r.FTAG) || 0,
    // 1X2
    B365H:   parseFloat(r.B365H)  || 2,
    B365D:   parseFloat(r.B365D)  || 3.2,
    B365A:   parseFloat(r.B365A)  || 4,
    // Best available odds across all bookmakers
    MaxH:    parseFloat(r.MaxH)   || parseFloat(r.B365H) || 2,
    MaxD:    parseFloat(r.MaxD)   || parseFloat(r.B365D) || 3.2,
    MaxA:    parseFloat(r.MaxA)   || parseFloat(r.B365A) || 4,
    // Pinnacle (sharp bookmaker — low margin, used as reference)
    PSH:     parseFloat(r.PSH)    || null,
    PSD:     parseFloat(r.PSD)    || null,
    PSA:     parseFloat(r.PSA)    || null,
    // Over / Under 2.5 goals
    B365O:   parseFloat(r['B365>2.5']) || 1.8,
    B365U:   parseFloat(r['B365<2.5']) || 1.9,
    MaxO:    parseFloat(r['Max>2.5'])  || parseFloat(r['B365>2.5']) || 1.8,
    MaxU:    parseFloat(r['Max<2.5'])  || parseFloat(r['B365<2.5']) || 1.9,
    // Asian Handicap
    AHh:     parseFloat(r.AHh)    || 0,
    B365AHH: parseFloat(r.B365AHH) || 1.9,
    B365AHA: parseFloat(r.B365AHA) || 1.9,
  }));
}

// ─── Strategies ───────────────────────────────────────────────────────────────
function minKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>a[1]-b[1])[0][0]; }
function maxKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>b[1]-a[1])[0][0]; }
function midKey(g) { return [['H',g.B365H],['D',g.B365D],['A',g.B365A]].sort((a,b)=>a[1]-b[1])[1][0]; }

function buildStrategies() {
  const s = [];
  const add = (name, fn) => s.push({ name, fn });

  add('Always Home',                  g => 'H');
  add('Always Away',                  g => 'A');
  add('Always Draw',                  g => 'D');
  add('Bet Favourite',                g => minKey(g));
  add('Bet Underdog',                 g => maxKey(g));
  add('Bet 2nd Favourite',            g => midKey(g));
  add('Favourite excl. Draw',         g => g.B365H < g.B365A ? 'H' : 'A');
  add('Home if fav (all)',            g => g.B365H < g.B365D && g.B365H < g.B365A ? 'H' : null);
  add('Away if fav (all)',            g => g.B365A < g.B365D && g.B365A < g.B365H ? 'A' : null);
  add('Away if odds > 3.0 else Home', g => g.B365A > 3.0 ? 'A' : 'H');
  add('Away if odds > 4.0 else Home', g => g.B365A > 4.0 ? 'A' : 'H');
  add('Home if odds > 2.5 else Away', g => g.B365H > 2.5 ? 'H' : 'A');

  for (const t of [1.5, 1.75, 2.0, 2.25, 2.5, 3.0]) {
    add(`Home if odds ≤ ${t}`,  g => g.B365H <= t ? 'H' : null);
    add(`Home if odds > ${t}`,  g => g.B365H >  t ? 'H' : null);
  }
  for (const t of [2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) {
    add(`Away if odds ≤ ${t}`,  g => g.B365A <= t ? 'A' : null);
    add(`Away if odds > ${t}`,  g => g.B365A >  t ? 'A' : null);
  }
  for (const t of [3.0, 3.25, 3.5, 3.75, 4.0]) {
    add(`Draw if odds ≤ ${t}`,  g => g.B365D <= t ? 'D' : null);
  }
  for (const t of [0.35, 0.4, 0.45, 0.5, 0.55]) {
    add(`Home if impl < ${t}`,  g => (1 / g.B365H) < t ? 'H' : null);
    add(`Away if impl < ${t}`,  g => (1 / g.B365A) < t ? 'A' : null);
  }

  // ── Best available odds (Max across all bookmakers) ──
  add('Max odds: Always Home',   g => 'MH');
  add('Max odds: Always Away',   g => 'MA');
  add('Max odds: Always Draw',   g => 'MD');
  add('Max odds: Favourite',     g => [['MH',g.MaxH],['MD',g.MaxD],['MA',g.MaxA]].sort((a,b)=>a[1]-b[1])[0][0]);
  add('Max odds: 2nd Favourite', g => [['MH',g.MaxH],['MD',g.MaxD],['MA',g.MaxA]].sort((a,b)=>a[1]-b[1])[1][0]);
  add('Max odds: Underdog',      g => [['MH',g.MaxH],['MD',g.MaxD],['MA',g.MaxA]].sort((a,b)=>b[1]-a[1])[0][0]);

  // ── Over / Under 2.5 goals ──
  add('Always Over 2.5',         g => 'O');
  add('Always Under 2.5',        g => 'U');
  add('Max Over 2.5',            g => 'MO');
  add('Max Under 2.5',           g => 'MU');
  for (const t of [1.6, 1.7, 1.8, 1.9, 2.0]) {
    add(`Over if odds ≤ ${t}`,   g => g.B365O <= t ? 'O' : null);
    add(`Under if odds ≤ ${t}`,  g => g.B365U <= t ? 'U' : null);
    add(`Over if odds > ${t}`,   g => g.B365O >  t ? 'O' : null);
    add(`Under if odds > ${t}`,  g => g.B365U >  t ? 'U' : null);
  }

  // ── Asian Handicap ──
  add('AH: Always Home',         g => 'AHH');
  add('AH: Always Away',         g => 'AHA');
  add('AH: Home if B365H fav',   g => g.B365H < g.B365A ? 'AHH' : null);
  add('AH: Away if B365A fav',   g => g.B365A < g.B365H ? 'AHA' : null);

  // ── Pinnacle value: bet when B365 offers better odds than Pinnacle (sharp) ──
  // If B365 > PS, B365 is giving more value than the sharp market — potential edge
  add('Pinnacle value: Home',    g => g.PSH && g.B365H > g.PSH ? 'H' : null);
  add('Pinnacle value: Away',    g => g.PSA && g.B365A > g.PSA ? 'A' : null);
  add('Pinnacle value: Draw',    g => g.PSD && g.B365D > g.PSD ? 'D' : null);
  add('Pinnacle value: any',     g => {
    const opts = [
      g.PSH && g.B365H > g.PSH ? ['H', g.B365H - g.PSH] : null,
      g.PSD && g.B365D > g.PSD ? ['D', g.B365D - g.PSD] : null,
      g.PSA && g.B365A > g.PSA ? ['A', g.B365A - g.PSA] : null,
    ].filter(Boolean);
    if (!opts.length) return null;
    return opts.sort((a, b) => b[1] - a[1])[0][0]; // pick the biggest edge
  });

  return s;
}

// ─── Resolve odds + result for any market ────────────────────────────────────
function resolve(g, pick) {
  const goals = g.FTHG + g.FTAG;
  switch (pick) {
    case 'H':   return { odds: g.B365H, won: g.FTR === 'H', push: false };
    case 'D':   return { odds: g.B365D, won: g.FTR === 'D', push: false };
    case 'A':   return { odds: g.B365A, won: g.FTR === 'A', push: false };
    case 'MH':  return { odds: g.MaxH,  won: g.FTR === 'H', push: false };
    case 'MD':  return { odds: g.MaxD,  won: g.FTR === 'D', push: false };
    case 'MA':  return { odds: g.MaxA,  won: g.FTR === 'A', push: false };
    case 'O':   return { odds: g.B365O, won: goals > 2.5,   push: false };
    case 'U':   return { odds: g.B365U, won: goals < 2.5,   push: false };
    case 'MO':  return { odds: g.MaxO,  won: goals > 2.5,   push: false };
    case 'MU':  return { odds: g.MaxU,  won: goals < 2.5,   push: false };
    case 'AHH': { const adj = g.FTHG - g.FTAG + g.AHh; return { odds: g.B365AHH, won: adj > 0, push: adj === 0 }; }
    case 'AHA': { const adj = g.FTAG - g.FTHG - g.AHh; return { odds: g.B365AHA, won: adj > 0, push: adj === 0 }; }
    default:    return null;
  }
}

// ─── Evaluate one matchweek with $WEEKLY budget ───────────────────────────────
function evaluateMatchday(games, stratFn) {
  const picks = games.map(g => {
    const pick = stratFn(g);
    if (!pick) return null;
    const r = resolve(g, pick);
    if (!r) return null;
    return { ...r, pick };
  }).filter(Boolean);

  if (!picks.length) return { staked: 0, returned: 0, profit: 0, bets: 0, stake: 0 };

  const stake  = WEEKLY / picks.length;
  let returned = 0;
  for (const p of picks) {
    if (p.push)     returned += stake;           // stake refunded
    else if (p.won) returned += stake * p.odds;
  }
  const staked = stake * picks.length;
  return { staked, returned, profit: returned - staked, bets: picks.length, stake };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  if (!FORCE_REFRESH && fs.existsSync(RESULTS_CACHE)) {
    console.log(`\n(using cached results — run with --refresh to recompute)\n`);
    printResults(JSON.parse(fs.readFileSync(RESULTS_CACHE, 'utf8')));
    return;
  }

  console.log(`\nLoading season ${SEASON} data...`);
  const csv       = await fetchText(CSV_URL, `football-data-${SEASON}-E0.csv`);
  const rows      = parseCSV(csv);
  const matchdays = groupIntoMatchdays(rows).filter(md => md.length >= 8 && md.every(r => r.FTR));

  console.log(`Found ${matchdays.length} complete matchweeks. Computing...\n`);

  const strategies = buildStrategies();

  const summary = strategies.map(strat => {
    const weeks = matchdays.map((md, idx) => {
      const games = normalise(md);
      const r     = evaluateMatchday(games, strat.fn);
      const dates = [...new Set(md.map(g => g.Date))];
      return { mw: idx + 1, date: dates[0], ...r };
    }).filter(w => w.bets > 0);

    const totalProfit   = weeks.reduce((s, w) => s + w.profit, 0);
    const totalStaked   = weeks.reduce((s, w) => s + w.staked, 0);
    const profitWeeks   = weeks.filter(w => w.profit > 0).length;
    const avgStake      = weeks.length ? weeks.reduce((s, w) => s + w.stake, 0) / weeks.length : 0;
    const roi           = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    // Max drawdown
    let peak = 0, cumPnl = 0, maxDrawdown = 0;
    for (const w of weeks) {
      cumPnl += w.profit;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return {
      name: strat.name, weeks, totalProfit, totalStaked, roi,
      profitWeeks, weeksCovered: weeks.length, avgStake, maxDrawdown,
    };
  }).sort((a, b) => b.totalProfit - a.totalProfit);

  const payload = { season: SEASON, weekly: WEEKLY, matchweeks: matchdays.length, summary };
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_CACHE, JSON.stringify(payload, null, 2));
  console.log(`Cached to ${path.relative(process.cwd(), RESULTS_CACHE)}\n`);

  printResults(payload);
}

function printResults({ season, weekly, matchweeks, summary }) {
  const col  = (s, n) => String(s ?? '').padEnd(n);
  const rcol = (s, n) => String(s ?? '').padStart(n);

  console.log(`Season ${season}  |  ${matchweeks} matchweeks  |  $${weekly}/week budget\n`);

  // ── Leaderboard ──
  console.log('LEADERBOARD — $' + weekly + '/week  (stake = $' + weekly + ' ÷ bets that week)\n');
  console.log(
    col('Strategy', 36) +
    rcol('Wks', 5) + rcol('Avg$/bet', 10) + rcol('Invested', 10) +
    rcol('Return', 9) + rcol('Profit', 9) + rcol('ROI', 8) +
    rcol('MaxDD', 8) + rcol('WinWks', 8)
  );
  console.log('─'.repeat(103));

  for (const s of summary.slice(0, 20)) {
    const profitStr = (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2);
    const roiStr    = (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%';
    const winWkStr  = `${s.profitWeeks}/${s.weeksCovered}`;
    console.log(
      col(s.name, 36) +
      rcol(s.weeksCovered, 5) +
      rcol('$' + s.avgStake.toFixed(2), 10) +
      rcol('$' + s.totalStaked.toFixed(2), 10) +
      rcol('$' + (s.totalStaked + s.totalProfit).toFixed(2), 9) +
      rcol(profitStr, 9) +
      rcol(roiStr, 8) +
      rcol('-$' + s.maxDrawdown.toFixed(2), 8) +
      rcol(winWkStr, 8)
    );
  }

  // ── Weekly drill-down for #1 ──
  const best = summary[0];
  console.log(`\n${'─'.repeat(103)}`);
  console.log(`\nWEEKLY BREAKDOWN — "${best.name}"  ($${weekly}/week, avg $${best.avgStake.toFixed(2)}/bet)\n`);
  console.log(col('MW', 4) + col('Date', 12) + rcol('Bets', 5) + rcol('$/bet', 7) + rcol('Staked', 8) + rcol('Return', 8) + rcol('Profit', 9) + rcol('Cum. P&L', 10));
  console.log('─'.repeat(63));

  let cum = 0;
  for (const w of best.weeks) {
    cum += w.profit;
    const pStr = (w.profit >= 0 ? '+' : '') + w.profit.toFixed(2);
    const cStr = (cum >= 0 ? '+' : '') + cum.toFixed(2);
    const bar  = w.profit >= 0
      ? '▓'.repeat(Math.min(Math.round(Math.abs(w.profit / weekly) * 20), 20))
      : '░'.repeat(Math.min(Math.round(Math.abs(w.profit / weekly) * 20), 20));
    console.log(
      col(w.mw, 4) + col(w.date, 12) +
      rcol(w.bets, 5) + rcol('$' + w.stake.toFixed(2), 7) +
      rcol('$' + w.staked.toFixed(2), 8) + rcol('$' + w.returned.toFixed(2), 8) +
      rcol(pStr, 9) + rcol(cStr, 10) + '  ' + bar
    );
  }
  const tp = best.totalProfit;
  console.log('─'.repeat(63));
  console.log(
    `${''.padEnd(42)}` +
    rcol('$' + best.totalStaked.toFixed(2), 8) +
    rcol('$' + (best.totalStaked + tp).toFixed(2), 8) +
    rcol((tp >= 0 ? '+' : '') + tp.toFixed(2), 9) +
    `  ROI: ${(best.roi >= 0 ? '+' : '') + best.roi.toFixed(1)}%\n`
  );

  console.log(`Max drawdown: -$${best.maxDrawdown.toFixed(2)}  (deepest losing streak)`);
  console.log(`Total invested over season: $${best.totalStaked.toFixed(2)}  ($${weekly}/week × ${best.weeksCovered} weeks)\n`);
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
