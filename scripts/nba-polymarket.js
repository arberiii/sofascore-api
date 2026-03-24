#!/usr/bin/env node
// scripts/nba-polymarket.js
// Compare Polymarket NBA market prices (champion, conference, series) against
// implied probabilities from ESPN standings + today's DraftKings moneylines.
//
// No API key required.
// Usage:
//   node scripts/nba-polymarket.js

'use strict';
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${data.slice(0,150)}`)); }
      });
    }).on('error', reject);
  });
}

function americanToDecimal(str) {
  const n = parseInt(str, 10);
  if (isNaN(n)) return null;
  return n > 0 ? +(n / 100 + 1).toFixed(3) : +(100 / Math.abs(n) + 1).toFixed(3);
}

function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

// ── Polymarket helpers ─────────────────────────────────────────────────────

// Known stable Polymarket NBA event IDs
const NBA_EVENT_IDS = {
  champion:   27830,
  eastConf:   32755,
  westConf:   32756,
  playoffs:   63255,  // "Which teams will make the NBA Playoffs?"
};

async function fetchPolymarketNBA() {
  // Fetch game-level events (tag_slug=nba) + known season-level events in parallel
  const [tagEvents, ...idEvents] = await Promise.all([
    fetch('https://gamma-api.polymarket.com/events?tag_slug=nba&limit=50'),
    ...Object.values(NBA_EVENT_IDS).map(id => fetch(`https://gamma-api.polymarket.com/events/${id}`).catch(() => null)),
  ]);
  const seasonEvents = idEvents.filter(Boolean);
  return [...(tagEvents || []), ...seasonEvents];
}

// Pull useful fields from a Polymarket event's markets
function parseMarketOdds(markets) {
  return markets
    .filter(m => {
      const op = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
      return op.length >= 1 && parseFloat(op[0]) > 0.001;
    })
    .map(m => {
      const op = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
      const price = parseFloat(op[0]); // YES probability
      const bestBid = parseFloat(m.bestBid || 0);
      const bestAsk = parseFloat(m.bestAsk || 0);
      const midPrice = (bestBid > 0 && bestAsk > 0) ? (bestBid + bestAsk) / 2 : price;
      return {
        question: m.question || m.groupItemTitle || '',
        price: midPrice > 0 ? midPrice : price,
        decimal: midPrice > 0 ? +(1 / midPrice).toFixed(2) : +(1 / price).toFixed(2),
        liquidity: Math.round(m.liquidityNum || 0),
      };
    })
    .sort((a, b) => b.price - a.price);
}

// ── ESPN helpers ───────────────────────────────────────────────────────────

async function fetchTodayGames() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const data = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`);
  return data.events || [];
}

async function fetchStandings() {
  const data = await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2025');
  const groups = data?.children || [];
  const teams = [];
  for (const conf of groups) {
    const confName = conf.name || '';
    // entries can be directly on conf.standings or nested under conf.children[].standings
    const entries = conf.standings?.entries || [];
    const allEntries = entries.length
      ? entries
      : (conf.children || []).flatMap(div => div.standings?.entries || []);
    for (const entry of allEntries) {
      const team = entry.team;
      const stats = entry.stats || [];
      const stat  = (name) => stats.find(s => s.name === name);
      teams.push({
        abbr:       team.abbreviation,
        name:       team.displayName,
        shortName:  team.shortDisplayName || team.displayName,
        conference: confName,
        wins:       +(stat('wins')?.value ?? 0),
        losses:     +(stat('losses')?.value ?? 0),
        pct:        +(stat('winPercent')?.value ?? 0),
        seed:       +(stat('playoffSeed')?.value ?? 99),
        gb:         stat('gamesBehind')?.displayValue ?? '-',
      });
    }
  }
  return teams.sort((a, b) => a.conference.localeCompare(b.conference) || a.seed - b.seed);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nFetching NBA data from Polymarket + ESPN...\n');

  const [polyEvents, todayGames, standings] = await Promise.all([
    fetchPolymarketNBA().catch(() => []),
    fetchTodayGames().catch(() => []),
    fetchStandings().catch(() => []),
  ]);

  // ── Section 1: Current NBA Standings ─────────────────────────────────────
  if (standings.length) {
    console.log('── NBA Standings (Win%) ────────────────────────────────────────────────');
    const east = standings.filter(t => t.conference.includes('East'));
    const west = standings.filter(t => t.conference.includes('West'));

    const printConf = (teams, label) => {
      console.log(`\n  ${label}`);
      console.log(`  ${pad('Team', 26)} ${rpad('W', 4)} ${rpad('L', 4)} ${rpad('Pct', 6)} ${rpad('GB', 5)}`);
      for (const t of teams.slice(0, 8)) {
        const playoff = t.wins / (t.wins + t.losses) > 0.5 ? '✓' : ' ';
        console.log(`  ${playoff} ${pad(t.shortName || t.name, 25)} ${rpad(t.wins, 4)} ${rpad(t.losses, 4)} ${rpad(t.pct.toFixed(3), 6)} ${rpad(t.gb, 5)}`);
      }
    };

    if (east.length) printConf(east, 'Eastern Conference (top 8 shown)');
    if (west.length) printConf(west, 'Western Conference (top 8 shown)');
    console.log();
  }

  // ── Section 2: Today's Games with DraftKings Odds ────────────────────────
  if (todayGames.length) {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    console.log(`── Today's Games (${dateStr}) — DraftKings odds via ESPN ───────────────`);
    console.log(`\n  ${pad('Matchup', 26)} ${pad('Status', 12)} ${rpad('Away ML', 9)} ${rpad('Home ML', 9)} ${rpad('Spread', 8)} ${rpad('Total', 7)}`);
    console.log('  ' + '─'.repeat(80));

    for (const event of todayGames) {
      const comp = event.competitions[0];
      const status = comp.status.type.shortDetail || comp.status.type.description;
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      const matchup = `${away.team.abbreviation} @ ${home.team.abbreviation}`;

      const odds = (comp.odds || [])[0];
      if (!odds) {
        console.log(`  ${pad(matchup, 26)} ${pad(status, 12)}  no odds`);
        continue;
      }

      const homeML = odds.moneyline?.home?.close?.odds ?? odds.moneyline?.home?.open?.odds ?? '-';
      const awayML = odds.moneyline?.away?.close?.odds ?? odds.moneyline?.away?.open?.odds ?? '-';
      const spread = odds.spread;
      const total  = odds.overUnder;
      const spreadStr = spread !== undefined ? (spread < 0 ? `H${spread}` : `H+${Math.abs(spread)}`) : '-';

      const homeScore = home.score !== '' ? home.score : '';
      const awayScore = away.score !== '' ? away.score : '';
      const score = (homeScore && awayScore) ? `  ${awayScore}-${homeScore}` : '';

      console.log(`  ${pad(matchup, 26)} ${pad(status, 12)} ${rpad(awayML, 9)} ${rpad(homeML, 9)} ${rpad(spreadStr, 8)} ${rpad(total || '-', 7)}${score}`);
    }
    console.log();
  } else {
    console.log('  No NBA games today.\n');
  }

  // ── Section 3: Polymarket NBA Markets ────────────────────────────────────
  console.log('── Polymarket NBA Markets ─────────────────────────────────────────────────\n');

  // Group events by type
  const tl = (e) => (e.title || '').toLowerCase();
  const championEvent    = polyEvents.find(e => tl(e).includes('nba champion') && !tl(e).includes('eastern') && !tl(e).includes('western') && !tl(e).includes('series'));
  const eastConfEvent    = polyEvents.find(e => tl(e).includes('eastern conference champion'));
  const westConfEvent    = polyEvents.find(e => tl(e).includes('western conference champion'));
  const playoffEvents    = polyEvents.filter(e => tl(e).includes('series winner'));
  const playoffPctEvent  = polyEvents.find(e => tl(e).includes('make the nba playoffs') || tl(e).includes('nba playoffs'));

  // Print champion odds
  if (championEvent) {
    const odds = parseMarketOdds(championEvent.markets || []);
    console.log('  2026 NBA Champion (Polymarket)');
    console.log(`  ${pad('Team', 32)} ${rpad('Price', 8)} ${rpad('Dec Odds', 10)} ${rpad('Liquidity', 12)}`);
    console.log('  ' + '─'.repeat(65));
    for (const o of odds.slice(0, 10)) {
      const teamName = o.question.replace('Will the ', '').replace(' win the 2026 NBA Finals?', '').trim();
      console.log(`  ${pad(teamName, 32)} ${rpad((o.price*100).toFixed(1)+'%', 8)} ${rpad(o.decimal, 10)} ${rpad('$'+o.liquidity.toLocaleString(), 12)}`);
    }
    console.log();
  }

  // Print conference champion odds side-by-side
  for (const [confEvent, label] of [[eastConfEvent, 'Eastern'], [westConfEvent, 'Western']]) {
    if (!confEvent) continue;
    const odds = parseMarketOdds(confEvent.markets || []);
    console.log(`  ${label} Conference Champion (Polymarket)`);
    console.log(`  ${pad('Team', 30)} ${rpad('Price', 8)} ${rpad('Dec Odds', 10)}`);
    console.log('  ' + '─'.repeat(50));
    for (const o of odds.slice(0, 8)) {
      const teamName = o.question.replace('Will the ', '').replace(new RegExp(`win the NBA ${label} Conference Finals.*`), '').trim();
      console.log(`  ${pad(teamName, 30)} ${rpad((o.price*100).toFixed(1)+'%', 8)} ${rpad(o.decimal, 10)}`);
    }
    console.log();
  }

  // Print playoff series markets
  if (playoffEvents.length) {
    console.log('  Active Playoff Series Markets');
    console.log(`  ${pad('Series', 40)} ${rpad('Price', 8)} ${rpad('Dec Odds', 10)} ${rpad('Liquidity', 12)}`);
    console.log('  ' + '─'.repeat(72));
    for (const ev of playoffEvents) {
      const odds = parseMarketOdds(ev.markets || []);
      for (const o of odds.slice(0, 2)) {
        const detail = o.question.replace('Will the ', '').replace(' win the', '').replace(' Series?', '').trim();
        console.log(`  ${pad(detail.slice(0, 39), 40)} ${rpad((o.price*100).toFixed(1)+'%', 8)} ${rpad(o.decimal, 10)} ${rpad('$'+o.liquidity.toLocaleString(), 12)}`);
      }
    }
    console.log();
  }

  // Print playoff qualification odds
  if (playoffPctEvent) {
    const odds = parseMarketOdds(playoffPctEvent.markets || []);
    const bubble = odds.filter(o => o.price >= 0.15 && o.price <= 0.85);
    if (bubble.length) {
      console.log('  Playoff Bubble Teams (20–80% on Polymarket)');
      console.log(`  ${pad('Team', 32)} ${rpad('Price', 8)} ${rpad('Dec Odds', 10)}`);
      console.log('  ' + '─'.repeat(52));
      for (const o of bubble) {
        const teamName = o.question.replace('Will the ', '').replace(' make the NBA Playoffs?', '').trim();
        console.log(`  ${pad(teamName, 32)} ${rpad((o.price*100).toFixed(1)+'%', 8)} ${rpad(o.decimal, 10)}`);
      }
      console.log();
    }
  }

  // ── Section 4: Value flags ────────────────────────────────────────────────
  // Compare today's game moneylines against Polymarket champion odds for those teams
  if (todayGames.length && championEvent) {
    const champOdds = parseMarketOdds(championEvent.markets || []);
    const champMap = {};
    for (const o of champOdds) {
      // Extract team name fragments for fuzzy match
      const raw = o.question.toLowerCase();
      champMap[raw] = o;
    }

    const flags = [];
    for (const event of todayGames) {
      const comp = event.competitions[0];
      const odds = (comp.odds || [])[0];
      if (!odds?.moneyline) continue;
      const status = comp.status.type.name;
      if (status !== 'STATUS_SCHEDULED') continue;

      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');

      // Find champ odds for each team
      const findChamp = (teamName) => {
        const name = teamName.toLowerCase();
        return Object.entries(champMap).find(([k]) => k.includes(name.split(' ').pop()))?.[1];
      };

      const homeChamp = findChamp(home.team.displayName);
      const awayChamp = findChamp(away.team.displayName);

      const homeML = odds.moneyline?.home?.close?.odds;
      const awayML = odds.moneyline?.away?.close?.odds;

      if (homeChamp && awayChamp && homeML && awayML) {
        // Championship market says team A has much higher probability, but game line disagrees
        const homeChampProb = homeChamp.price;
        const awayChampProb = awayChamp.price;
        const homeGameDecimal = americanToDecimal(homeML);
        const awayGameDecimal = americanToDecimal(awayML);

        const homeGameImplied = 1 / homeGameDecimal;
        const awayGameImplied = 1 / awayGameDecimal;

        // Relative champion strength ratio
        const champEdge = Math.abs(homeChampProb - awayChampProb);
        const gameEdge  = Math.abs(homeGameImplied - awayGameImplied);

        // Flag if championship odds heavily favor one team but game line is close
        if (champEdge > 0.15 && gameEdge < 0.10) {
          const favTeam = homeChampProb > awayChampProb ? home.team.abbreviation : away.team.abbreviation;
          const favChampP = Math.max(homeChampProb, awayChampProb);
          const undTeam  = homeChampProb < awayChampProb ? home.team.abbreviation : away.team.abbreviation;
          flags.push({ matchup: `${away.team.abbreviation} @ ${home.team.abbreviation}`, favTeam, undTeam, favChampP, homeML, awayML });
        }
      }
    }

    if (flags.length) {
      console.log('── Value Flags: Champ-odds vs Game-line Divergence ─────────────────────────\n');
      for (const f of flags) {
        console.log(`  ${f.matchup}`);
        console.log(`    Polymarket champ odds heavily favor ${f.favTeam} (${(f.favChampP*100).toFixed(1)}%)`);
        console.log(`    but game moneyline is close: ${f.awayML} / ${f.homeML}`);
        console.log(`    → Consider: ${f.favTeam} may be undervalued at game level\n`);
      }
    }
  }

  console.log('Run "node scripts/nba-today.js" for full game odds breakdown.\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
