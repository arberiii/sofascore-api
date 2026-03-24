#!/usr/bin/env node
// scripts/nba-today.js
// Today's NBA games with moneyline, spread, and total odds from ESPN/DraftKings
// No API key required.
//
// Usage:
//   node scripts/nba-today.js
//   DATE=20260325 node scripts/nba-today.js

'use strict';
const https = require('https');

const DATE = process.env.DATE || (() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
})();

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}\n${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

// Convert American odds string ("+310", "-425") to decimal odds
function americanToDecimal(str) {
  const n = parseInt(str, 10);
  if (isNaN(n)) return null;
  return n > 0 ? +(n / 100 + 1).toFixed(3) : +(100 / Math.abs(n) + 1).toFixed(3);
}

// Convert American odds to implied probability (with juice stripped)
function americanToImplied(str) {
  const n = parseInt(str, 10);
  if (isNaN(n)) return null;
  const raw = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  return raw;
}

// Remove vig: given two raw implied probs, normalize to sum=1
function noVig(p1, p2) {
  const total = p1 + p2;
  return [p1 / total, p2 / total];
}

function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

async function main() {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${DATE}`;
  let data;
  try {
    data = await fetch(url);
  } catch (e) {
    console.error('Failed to fetch ESPN data:', e.message);
    process.exit(1);
  }

  const events = data.events || [];
  if (!events.length) {
    console.log(`No NBA games on ${DATE.slice(0,4)}-${DATE.slice(4,6)}-${DATE.slice(6,8)}.`);
    return;
  }

  const dateStr = `${DATE.slice(0,4)}-${DATE.slice(4,6)}-${DATE.slice(6,8)}`;
  console.log(`\nNBA Games — ${dateStr}  (odds: DraftKings via ESPN)\n`);

  const header = `${pad('Matchup', 36)} ${pad('Status', 10)} ${rpad('Away ML', 9)} ${rpad('Home ML', 9)} ${rpad('Spread', 8)} ${rpad('Total', 8)  }  Away dec  Home dec  Away%  Home%`;
  console.log(header);
  console.log('─'.repeat(header.length));

  const gameSummaries = [];

  for (const event of events) {
    const comp = event.competitions[0];
    const status = comp.status.type.description;
    const statusShort = comp.status.type.shortDetail || status;

    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    const homeScore = home?.score ?? '';
    const awayScore = away?.score ?? '';

    const matchup = `${away.team.abbreviation} @ ${home.team.abbreviation}`;

    const odds = (comp.odds || [])[0];
    if (!odds || !odds.moneyline) {
      const score = (homeScore !== '' ? `${awayScore}-${homeScore}` : '');
      console.log(`${pad(matchup, 36)} ${pad(status, 10)}  (no odds available)${score ? '  ' + score : ''}`);
      continue;
    }

    const ml = odds.moneyline;
    const homeML = ml?.home?.close?.odds ?? ml?.home?.open?.odds ?? null;
    const awayML = ml?.away?.close?.odds ?? ml?.away?.open?.odds ?? null;

    const spread = odds.spread;
    const total = odds.overUnder;

    const spreadStr = spread !== undefined
      ? (spread < 0 ? `H ${spread}` : `A ${spread > 0 ? '-'+spread : spread}`)
      : '-';

    const homeDec = homeML ? americanToDecimal(homeML) : null;
    const awayDec = awayML ? americanToDecimal(awayML) : null;

    let homeP = null, awayP = null;
    if (homeML && awayML) {
      const [ap, hp] = noVig(americanToImplied(awayML), americanToImplied(homeML));
      awayP = ap; homeP = hp;
    }

    const isFav = home.homeAway === 'home' && odds.homeTeamOdds?.favorite;
    const gameTime = new Date(comp.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

    const scoreStr = (status === 'Final' || status === 'Final/OT')
      ? `  FINAL: ${awayScore}-${homeScore}`
      : `  ${gameTime}`;

    const line = [
      pad(matchup, 36),
      pad(statusShort.slice(0,10), 10),
      rpad(awayML || '-', 9),
      rpad(homeML || '-', 9),
      rpad(spread !== undefined ? (spread < 0 ? `H${spread}` : `H+${Math.abs(spread)}`) : '-', 8),
      rpad(total !== undefined ? `${total}` : '-', 8),
      rpad(awayDec || '-', 8),
      rpad(homeDec || '-', 8),
      rpad(awayP ? `${(awayP*100).toFixed(1)}%` : '-', 7),
      rpad(homeP ? `${(homeP*100).toFixed(1)}%` : '-', 7),
    ].join('  ');

    console.log(line + scoreStr);

    gameSummaries.push({ matchup, away: away.team.displayName, home: home.team.displayName, homeML, awayML, homeDec, awayDec, homeP, awayP, spread, total, status });
  }

  // Summary: flag potential value situations
  const upcoming = gameSummaries.filter(g => g.status === 'Scheduled' && g.homeML && g.awayML);
  if (upcoming.length) {
    console.log('\n── Strategy flags ───────────────────────────────────────────');
    for (const g of upcoming) {
      const lines = [];

      // Big underdog (>+300 away, >+300 home)
      if (parseInt(g.awayML) >= 300) lines.push(`UNDERDOG away (${g.awayML}) — ${g.away}`);
      if (parseInt(g.homeML) >= 300) lines.push(`UNDERDOG home (${g.homeML}) — ${g.home}`);

      // Moderate favourite (spread -3 to -7 = sweet spot in empirical ATS studies)
      if (g.spread !== undefined && g.spread >= -7 && g.spread <= -3) {
        lines.push(`MODERATE FAV home (spread ${g.spread}) — ${g.home}`);
      }
      if (g.spread !== undefined && -g.spread >= -7 && -g.spread <= -3 && !g.home) {
        lines.push(`MODERATE FAV away (spread ${-g.spread}) — ${g.away}`);
      }

      if (lines.length) {
        console.log(`\n  ${g.matchup}`);
        for (const l of lines) console.log(`    • ${l}`);
      }
    }
    if (!upcoming.some(g => {
      const aw = parseInt(g.awayML) >= 300;
      const hw = parseInt(g.homeML) >= 300;
      const mf = g.spread !== undefined && g.spread >= -7 && g.spread <= -3;
      return aw || hw || mf;
    })) {
      console.log('  No strong flags today.');
    }
  }

  console.log();
}

main().catch(e => { console.error(e.message); process.exit(1); });
