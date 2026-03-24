#!/usr/bin/env node
// scripts/nba-backtest.js
// Backtest NBA betting strategies using ESPN historical scores.
// Since ESPN doesn't provide historical odds, strategies use:
//   - Home/Away win rates
//   - Favourite/Underdog based on cached spread data (if available)
//   - Season record as a proxy for team strength
//
// For any date range, fetches game results and evaluates strategy P&L
// assuming a fixed payoff model (moneyline odds approximated from spread).
//
// Usage:
//   node scripts/nba-backtest.js
//   SEASON=2024 STAKE=10 node scripts/nba-backtest.js
//   FROM=20241101 TO=20250401 node scripts/nba-backtest.js
//
// Note: ESPN doesn't provide historical moneyline odds, so P&L is computed
// using a fair-odds model approximated from the ATS spread when available,
// otherwise assuming -110 juice (decimal 1.909) for each side.

'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const SEASON   = parseInt(process.env.SEASON || '2024', 10);
const STAKE    = parseFloat(process.env.STAKE  || '10');
const REFRESH  = process.argv.includes('--refresh');

// Season date ranges
const SEASON_DATES = {
  2024: { from: '20241022', to: '20250414' },
  2023: { from: '20231024', to: '20240414' },
  2022: { from: '20221018', to: '20230409' },
};

const DEFAULT = SEASON_DATES[SEASON] || SEASON_DATES[2024];
const FROM = process.env.FROM || DEFAULT.from;
const TO   = process.env.TO   || DEFAULT.to;

const CACHE_DIR  = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, `nba-espn-${SEASON}.json`);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${data.slice(0,100)}`)); }
      });
    }).on('error', reject);
  });
}

// Generate all dates in range YYYYMMDD
function* dateRange(from, to) {
  let cur = new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}`);
  const end = new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}`);
  while (cur <= end) {
    yield `${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,'0')}${String(cur.getDate()).padStart(2,'0')}`;
    cur.setDate(cur.getDate() + 1);
  }
}

async function loadGames() {
  if (!REFRESH && fs.existsSync(CACHE_FILE)) {
    process.stderr.write(`Using cached data: ${CACHE_FILE}\n`);
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  }

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const games = [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  const dates = [...dateRange(FROM, Math.min(TO, todayStr) < TO ? Math.min(TO, todayStr) : TO)];
  let fetched = 0;

  process.stderr.write(`Fetching ${SEASON}-${SEASON+1} season: ${dates.length} days to check...\n`);

  for (const date of dates) {
    if (date > todayStr) break;
    try {
      const data = await fetchUrl(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
      );
      const events = data.events || [];
      for (const event of events) {
        const comp = event.competitions[0];
        const status = comp.status.type.name;
        if (status !== 'STATUS_FINAL') continue;

        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        const homeScore = parseInt(home.score, 10);
        const awayScore = parseInt(away.score, 10);
        if (isNaN(homeScore) || isNaN(awayScore)) continue;

        const odds = (comp.odds || [])[0];
        const spread = odds?.spread; // negative = home is favored
        const total  = odds?.overUnder;
        const homeML = odds?.moneyline?.home?.close?.odds;
        const awayML = odds?.moneyline?.away?.close?.odds;

        games.push({
          date,
          homeTeam: home.team.abbreviation,
          awayTeam: away.team.abbreviation,
          homeScore,
          awayScore,
          homeWon: homeScore > awayScore,
          spread: spread ?? null,
          total: total ?? null,
          homeML: homeML ?? null,
          awayML: awayML ?? null,
        });
      }
      fetched++;
      if (fetched % 50 === 0) process.stderr.write(`  ${fetched}/${dates.length} dates fetched, ${games.length} games so far\n`);
      // Brief pause to be polite
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      // skip dates that error
    }
  }

  process.stderr.write(`Done. ${games.length} games fetched.\n`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(games, null, 2));
  return games;
}

// Convert American odds string to decimal, defaulting to -110 (1.909) if missing
function americanToDecimal(str, fallback = 1.909) {
  if (!str) return fallback;
  const n = parseInt(str, 10);
  if (isNaN(n)) return fallback;
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

// Spread to approximate win probability (simplified linear model)
// spread = home spread (negative = home is favorite)
function spreadToWinProb(spread) {
  if (spread === null) return 0.5;
  // Each point ≈ 3% edge; ±14 spread ≈ 85%/15%
  const p = 0.5 - spread * 0.03;
  return Math.max(0.1, Math.min(0.9, p));
}

// Group games into weekly batches
function groupByWeek(games) {
  const weeks = {};
  for (const g of games) {
    const d = new Date(`${g.date.slice(0,4)}-${g.date.slice(4,6)}-${g.date.slice(6,8)}`);
    const weekNum = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / (7 * 86400000));
    const key = `${d.getFullYear()}-W${String(weekNum).padStart(2,'0')}`;
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(g);
  }
  return weeks;
}

// Strategies: return array of picks [{team: 'home'|'away', decimalOdds}]
const strategies = {
  'Always Home': (games) => games.map(g => ({
    pick: 'home', dec: americanToDecimal(g.homeML), won: g.homeWon
  })),
  'Always Away': (games) => games.map(g => ({
    pick: 'away', dec: americanToDecimal(g.awayML), won: !g.homeWon
  })),
  'Bet Favourite': (games) => games
    .filter(g => g.spread !== null)
    .map(g => {
      const homeFav = g.spread < 0;
      return { pick: homeFav ? 'home' : 'away', dec: americanToDecimal(homeFav ? g.homeML : g.awayML), won: homeFav ? g.homeWon : !g.homeWon };
    }),
  'Bet Underdog': (games) => games
    .filter(g => g.spread !== null)
    .map(g => {
      const homeFav = g.spread < 0;
      return { pick: homeFav ? 'away' : 'home', dec: americanToDecimal(homeFav ? g.awayML : g.homeML), won: homeFav ? !g.homeWon : g.homeWon };
    }),
  'Small Fav (spread -1 to -5)': (games) => games
    .filter(g => g.spread !== null && g.spread >= -5 && g.spread < 0)
    .map(g => ({ pick: 'home', dec: americanToDecimal(g.homeML), won: g.homeWon })),
  'Big Underdog (spread > +7)': (games) => games
    .filter(g => g.spread !== null && g.spread > 7)
    .map(g => ({ pick: 'home', dec: americanToDecimal(g.homeML), won: g.homeWon })),
  'Away Underdog (spread > +4)': (games) => games
    .filter(g => g.spread !== null && g.spread > 4)
    .map(g => ({ pick: 'away', dec: americanToDecimal(g.awayML), won: !g.homeWon })),
  'Over 220.5': (games) => games
    .filter(g => g.total !== null)
    .map(g => ({ pick: 'over', dec: 1.909, won: (g.homeScore + g.awayScore) > g.total })),
  'Under 230.5': (games) => games
    .filter(g => g.total !== null)
    .map(g => ({ pick: 'under', dec: 1.909, won: (g.homeScore + g.awayScore) < g.total })),
};

function evalStrategy(picks, totalStake) {
  if (!picks.length) return { bets: 0, profit: 0, roi: 0, winRate: 0, maxDD: 0, winWeeks: 0 };
  let profit = 0, wins = 0, maxDD = 0, peak = 0;
  for (const p of picks) {
    const stake = totalStake / picks.length * picks.length / picks.length; // per-bet stake
    if (p.won) { profit += (p.dec - 1) * totalStake / picks.length; wins++; }
    else        { profit -= totalStake / picks.length; }
    peak = Math.max(peak, profit);
    maxDD = Math.max(maxDD, peak - profit);
  }
  return {
    bets: picks.length,
    profit: +profit.toFixed(2),
    roi: +((profit / (totalStake / picks.length * picks.length)) * 100).toFixed(1),
    winRate: +((wins / picks.length) * 100).toFixed(1),
    maxDD: +maxDD.toFixed(2),
  };
}

function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

async function main() {
  const games = await loadGames();

  const completedGames = games.filter(g => g.homeScore !== undefined && !isNaN(g.homeScore));
  console.log(`\nNBA Backtest — ${SEASON}-${String(SEASON+1).slice(-2)} season`);
  console.log(`Games with results: ${completedGames.length}`);
  console.log(`Stake per game: $${STAKE}\n`);

  // Season-level results
  const results = [];
  for (const [name, fn] of Object.entries(strategies)) {
    const picks = fn(completedGames);
    const r = evalStrategy(picks, STAKE);
    results.push({ name, ...r });
  }

  results.sort((a, b) => b.profit - a.profit);

  console.log('── Season Leaderboard ─────────────────────────────────────────────────────');
  console.log(`${pad('Strategy', 34)} ${rpad('Bets', 6)} ${rpad('Profit', 8)} ${rpad('ROI%', 7)} ${rpad('WinRate', 8)} ${rpad('MaxDD', 7)}`);
  console.log('─'.repeat(78));
  for (const r of results) {
    const profitStr = (r.profit >= 0 ? '+' : '') + r.profit.toFixed(2);
    console.log(`${pad(r.name, 34)} ${rpad(r.bets, 6)} ${rpad(profitStr, 8)} ${rpad(r.roi + '%', 7)} ${rpad(r.winRate + '%', 8)} ${rpad('$' + r.maxDD, 7)}`);
  }

  // Weekly breakdown for best strategy
  const best = results[0];
  console.log(`\n── Weekly P&L: "${best.name}" ─────────────────────────────`);
  const weeks = groupByWeek(completedGames);

  const stratFn = strategies[best.name];
  let cumulative = 0;
  let winWeeks = 0, totalWeeks = 0;

  for (const [weekKey, wGames] of Object.entries(weeks).sort()) {
    const picks = stratFn(wGames);
    if (!picks.length) continue;
    const r = evalStrategy(picks, STAKE);
    cumulative += r.profit;
    totalWeeks++;
    if (r.profit > 0) winWeeks++;
    const bar = r.profit >= 0
      ? '+' + '█'.repeat(Math.min(20, Math.round(r.profit / (STAKE * 0.5))))
      : '-' + '░'.repeat(Math.min(20, Math.round(Math.abs(r.profit) / (STAKE * 0.5))));
    const profitStr = (r.profit >= 0 ? '+' : '') + r.profit.toFixed(2);
    console.log(`  ${weekKey}  ${rpad(r.bets + ' bets', 8)}  ${rpad(profitStr, 8)}  cumul: ${rpad((cumulative >= 0 ? '+' : '') + cumulative.toFixed(2), 9)}  ${bar}`);
  }

  console.log(`\n  Win weeks: ${winWeeks}/${totalWeeks}  (${((winWeeks/totalWeeks)*100).toFixed(0)}%)`);
  console.log(`  Total profit: ${cumulative >= 0 ? '+' : ''}${cumulative.toFixed(2)} on $${STAKE}/game stake\n`);

  // Note about odds accuracy
  if (completedGames.filter(g => g.homeML).length < completedGames.length * 0.5) {
    console.log('Note: Most historical games lack DraftKings moneyline data from ESPN.');
    console.log('      P&L computed using -110 juice (1.909 decimal) as a fallback.\n');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
