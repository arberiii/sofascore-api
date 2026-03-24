/**
 * Backtest: "Bet $1 on every home/away team" — Premier League
 *
 * Uses football-data.co.uk (free, no key required) for results + pre-game Bet365 odds.
 *
 * Usage:
 *   node scripts/backtest-home.js                          # last matchweek, home side
 *   SIDE=away node scripts/backtest-home.js                # bet every away team
 *   SIDE=home STAKE=5 node scripts/backtest-home.js        # $5 per game
 *   SEASON=2324 node scripts/backtest-home.js              # 2023/24 season
 *   MATCHDAY=29 node scripts/backtest-home.js              # specific matchweek
 *   node scripts/backtest-home.js --refresh                # force re-fetch CSV
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const FORCE_REFRESH = process.argv.includes('--refresh');

const STAKE    = parseFloat(process.env.STAKE || '1');
const SIDE     = (process.env.SIDE || 'home').toLowerCase(); // 'home' or 'away'
// Season code: 2526 = 2025/26, 2425 = 2024/25, 2324 = 2023/24, etc.
const SEASON   = process.env.SEASON || '2526';
const MATCHDAY = process.env.MATCHDAY ? parseInt(process.env.MATCHDAY) : null;

if (SIDE !== 'home' && SIDE !== 'away') {
  console.error('SIDE must be "home" or "away"');
  process.exit(1);
}

const ODDS_COL = SIDE === 'home' ? 'B365H' : 'B365A';
const WIN_FTR  = SIDE === 'home' ? 'H' : 'A';
const TEAM_COL = SIDE === 'home' ? 'HomeTeam' : 'AwayTeam';

// football-data.co.uk CSV — E0 = English Premier League
const CSV_URL = `https://www.football-data.co.uk/mmz4281/${SEASON}/E0.csv`;

// ─── Cache helpers ────────────────────────────────────────────────────────────
function cacheGet(key) {
  const file = path.join(CACHE_DIR, key);
  if (!FORCE_REFRESH && fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8');
  }
  return null;
}

function cacheSet(key, data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, key), data, 'utf8');
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchText(url, cacheKey) {
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log(`(using cached data — run with --refresh to re-fetch)\n`);
      return cached;
    }
  }

  const data = await new Promise((resolve, reject) => {
    https.get(url, res => {
      let buf = '';
      res.on('data', chunk => (buf += chunk));
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });

  if (cacheKey) cacheSet(cacheKey, data);
  return data;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/\r/g, ''));
    const row = {};
    headers.forEach((h, i) => (row[h] = vals[i] || ''));
    return row;
  }).filter(r => r.HomeTeam); // skip empty rows
}

// ─── Group matches into matchdays by date ─────────────────────────────────────
// football-data.co.uk doesn't include matchday numbers, so we group by
// "batches of 10" sorted by date — each batch is one matchweek.
function groupIntoMatchdays(rows) {
  const sorted = [...rows].sort((a, b) => parseDate(a.Date) - parseDate(b.Date));
  const matchdays = [];
  let i = 0;
  while (i < sorted.length) {
    // Grab games that share the same date cluster (within 3 days of the first game)
    const anchor = parseDate(sorted[i].Date);
    const batch = [];
    let j = i;
    while (j < sorted.length) {
      const d = parseDate(sorted[j].Date);
      if (d - anchor <= 3 * 86400 * 1000) {
        batch.push(sorted[j]);
        j++;
      } else break;
    }
    matchdays.push(batch);
    i = j;
  }
  return matchdays;
}

function parseDate(str) {
  // Handles DD/MM/YY and DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length !== 3) return 0;
  const [d, m, y] = parts;
  const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
  return new Date(year, parseInt(m) - 1, parseInt(d)).getTime();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\nStrategy : bet $${STAKE} on every ${SIDE.toUpperCase()} team`);
  console.log(`Season   : ${SEASON}`);
  console.log(`Fetching Premier League data from football-data.co.uk...\n`);

  const csv = await fetchText(CSV_URL, `football-data-${SEASON}-E0.csv`);
  const rows = parseCSV(csv);
  const matchdays = groupIntoMatchdays(rows);

  let target;
  if (MATCHDAY) {
    target = matchdays[MATCHDAY - 1];
    if (!target) { console.error(`Matchday ${MATCHDAY} not found.`); process.exit(1); }
  } else {
    // Last complete matchday
    target = [...matchdays].reverse().find(md => md.length >= 8 && md.every(r => r.FTR));
    if (!target) { console.error('No complete matchday found.'); process.exit(1); }
  }

  const mdNumber = matchdays.indexOf(target) + 1;
  const dates = [...new Set(target.map(r => r.Date))].join(' / ');
  console.log(`Matchweek ${mdNumber}  (${dates})\n`);

  const results = [];
  let totalStaked = 0;
  let totalReturn = 0;

  for (const r of target) {
    const odds  = parseFloat(r[ODDS_COL]) || null;
    const won   = r.FTR === WIN_FTR;
    const payout = won && odds ? STAKE * odds : 0;
    const profit = payout - STAKE;

    totalStaked += STAKE;
    totalReturn += payout;

    results.push({
      home:  r.HomeTeam,
      away:  r.AwayTeam,
      bet:   r[TEAM_COL],
      score: `${r.FTHG}-${r.FTAG}`,
      odds,
      won,
      payout,
      profit,
    });
  }

  // ─── Print table ────────────────────────────────────────────────────────────
  const col  = (s, n) => String(s ?? '').padEnd(n);
  const rcol = (s, n) => String(s ?? '').padStart(n);
  const oddsLabel = `B365 ${SIDE.charAt(0).toUpperCase() + SIDE.slice(1)}`;

  console.log(
    col('Home', 22) + col('Away', 22) + col('Score', 8) +
    col(oddsLabel, 12) + col('Result', 8) + rcol('P&L', 8)
  );
  console.log('─'.repeat(80));

  for (const r of results) {
    const oddsStr = r.odds ? r.odds.toFixed(2) : 'N/A';
    const result  = r.won ? 'WIN' : (r.score.split('-')[0] === r.score.split('-')[1] ? 'DRAW' : 'LOSS');
    const plStr   = (r.profit >= 0 ? '+' : '') + r.profit.toFixed(2);

    console.log(
      col(r.home, 22) + col(r.away, 22) + col(r.score, 8) +
      col(oddsStr, 12) + col(result, 8) + rcol(plStr, 7)
    );
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  const totalProfit   = totalReturn - totalStaked;
  const roi           = ((totalProfit / totalStaked) * 100).toFixed(1);
  const wins          = results.filter(r => r.won).length;
  const withOdds      = results.filter(r => r.odds);
  const avgOdds       = withOdds.length
    ? (withOdds.reduce((s, r) => s + r.odds, 0) / withOdds.length).toFixed(2)
    : 'N/A';
  const impliedWinPct = withOdds.length
    ? ((withOdds.reduce((s, r) => s + 1 / r.odds, 0) / withOdds.length) * 100).toFixed(1)
    : 'N/A';

  console.log('─'.repeat(80));
  console.log(`\nSummary (betting ${SIDE} team every game)`);
  console.log(`  Games              : ${results.length}`);
  console.log(`  ${SIDE.charAt(0).toUpperCase() + SIDE.slice(1)} wins       : ${wins}/${results.length} (${((wins / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Avg Bet365 odds    : ${avgOdds}`);
  console.log(`  Implied win %      : ${impliedWinPct}%`);
  console.log(`  Staked             : $${totalStaked.toFixed(2)}`);
  console.log(`  Return             : $${totalReturn.toFixed(2)}`);
  console.log(`  Profit             : ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`);
  console.log(`  ROI                : ${roi}%\n`);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
