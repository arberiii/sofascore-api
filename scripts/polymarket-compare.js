/**
 * Polymarket EPL — live market comparison
 *
 * Fetches active Premier League markets from Polymarket's public Gamma API,
 * converts prices to decimal odds, and flags value bets based on our
 * season analysis (draw avg odds, Pinnacle baseline).
 *
 * No API key required — Gamma API is fully public.
 *
 * Usage:
 *   node scripts/polymarket-compare.js
 *   SEASON=2425 node scripts/polymarket-compare.js   # use a different season as reference
 */

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const CACHE_DIR     = path.join(__dirname, '..', '.cache');
const SEASON        = process.env.SEASON || '2526';
const GAMMA_BASE    = 'https://gamma-api.polymarket.com';
const EPL_SERIES_ID = '10188';

// ─── Fetch ────────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch (e) { reject(new Error(`JSON parse error: ${b.slice(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

// ─── Load season reference stats from cached analysis ────────────────────────
function loadSeasonReference() {
  const cacheFile = path.join(CACHE_DIR, `football-data-${SEASON}-E0.csv`);
  if (!fs.existsSync(cacheFile)) return null;

  const lines   = fs.readFileSync(cacheFile, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));
  const rows    = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/\r/g, ''));
    const row  = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  }).filter(r => r.FTR && r.PSH);

  if (!rows.length) return null;

  // Average Pinnacle draw odds across the season (our sharp reference)
  const draws = rows.filter(r => parseFloat(r.PSD) > 0);
  const avgPSD = draws.reduce((s, r) => s + parseFloat(r.PSD), 0) / draws.length;

  // Draw hit rate
  const drawRate = rows.filter(r => r.FTR === 'D').length / rows.length;

  // Average B365 draw odds
  const avgB365D = rows.filter(r => parseFloat(r.B365D) > 0)
    .reduce((s, r) => s + parseFloat(r.B365D), 0) /
    rows.filter(r => parseFloat(r.B365D) > 0).length;

  return { avgPSD, avgB365D, drawRate, games: rows.length };
}

// ─── Parse markets from an event ─────────────────────────────────────────────
function parseEvent(event) {
  const markets = event.markets || [];

  const home = markets.find(m => m.sportsMarketType === 'moneyline' && !m.slug.endsWith('-draw') && m.groupItemThreshold === '0');
  const draw = markets.find(m => m.slug.endsWith('-draw'));
  const away = markets.find(m => m.sportsMarketType === 'moneyline' && !m.slug.endsWith('-draw') && m.groupItemThreshold === '2');

  if (!home || !draw || !away) return null;

  const price   = m => parseFloat(JSON.parse(m.outcomePrices)[0]);
  const toOdds  = p => p > 0 ? (1 / p).toFixed(2) : 'N/A';
  const mid     = m => {
    const bid = parseFloat(m.bestBid  || 0);
    const ask = parseFloat(m.bestAsk  || 0);
    return bid && ask ? ((bid + ask) / 2) : price(m);
  };

  return {
    title:      event.title,
    date:       event.startTime ? event.startTime.split('T')[0] : event.eventDate,
    period:     event.period,
    score:      event.score,
    eventWeek:  event.eventWeek,
    liquidity:  event.liquidity,
    home: {
      team:   home.groupItemTitle,
      price:  mid(home),
      odds:   toOdds(mid(home)),
    },
    draw: {
      price:  mid(draw),
      odds:   toOdds(mid(draw)),
    },
    away: {
      team:   away.groupItemTitle,
      price:  mid(away),
      odds:   toOdds(away ? mid(away) : price(away)),
    },
    // sanity: prices should sum close to 1 (minus platform margin)
    impliedTotal: (mid(home) + mid(draw) + mid(away)).toFixed(3),
  };
}

// ─── Value flag ───────────────────────────────────────────────────────────────
// A draw is "value" when Polymarket's implied draw probability
// is lower than our sharp Pinnacle baseline (season avg).
function valueFlag(polyPrice, refOdds) {
  if (!refOdds) return '';
  const refProb   = 1 / refOdds;
  const polyProb  = polyPrice;
  const edge      = ((refProb - polyProb) * 100).toFixed(1);
  if (parseFloat(edge) >= 2)  return `VALUE +${edge}%`;
  if (parseFloat(edge) <= -2) return `FADE  ${edge}%`;
  return '';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\nFetching active EPL markets from Polymarket...\n');

  const events = await get(
    `${GAMMA_BASE}/events?series_id=${EPL_SERIES_ID}&active=true&closed=false&limit=50`
  );

  if (!events.length) {
    console.log('No active EPL markets found right now.');
    return;
  }

  const ref = loadSeasonReference();
  const parsed = events.map(parseEvent).filter(Boolean);

  // Sort: upcoming first, then by date
  parsed.sort((a, b) => {
    const order = { 'PRE': 0, 'LIVE': 1, 'POST': 2 };
    const pa = order[a.period] ?? 3, pb = order[b.period] ?? 3;
    if (pa !== pb) return pa - pb;
    return a.date.localeCompare(b.date);
  });

  const col  = (s, n) => String(s ?? '').padEnd(n);
  const rcol = (s, n) => String(s ?? '').padStart(n);

  // ── Reference stats ──
  if (ref) {
    console.log(`Reference (${SEASON} season, ${ref.games} games):`);
    console.log(`  Avg Pinnacle draw odds : ${ref.avgPSD.toFixed(2)}  (implied ${(100/ref.avgPSD).toFixed(1)}%)`);
    console.log(`  Avg B365 draw odds     : ${ref.avgB365D.toFixed(2)}  (implied ${(100/ref.avgB365D).toFixed(1)}%)`);
    console.log(`  Actual draw rate       : ${(ref.drawRate * 100).toFixed(1)}%\n`);
  }

  // ── Market table ──
  console.log(
    col('Match', 42) + col('Date', 12) + col('Status', 8) +
    col('Home odds', 11) + col('Draw odds', 11) + col('Away odds', 11) +
    col('∑', 7) + col('Draw value', 14) + col('Liquidity', 10)
  );
  console.log('─'.repeat(116));

  for (const g of parsed) {
    const flag = ref ? valueFlag(g.draw.price, ref.avgPSD) : '';
    const statusStr = g.period === 'LIVE' ? `LIVE ${g.score}` :
                      g.period === 'POST' ? `FT ${g.score}` : 'PRE';

    console.log(
      col(g.title, 42) + col(g.date, 12) + col(statusStr, 8) +
      col(g.home.odds, 11) + col(g.draw.odds, 11) + col(g.away.odds, 11) +
      col(g.impliedTotal, 7) +
      col(flag, 14) +
      rcol('$' + Math.round(g.liquidity), 9)
    );
  }

  // ── Value summary ──
  if (ref) {
    const valueBets = parsed.filter(g => {
      const edge = (1 / ref.avgPSD) - g.draw.price;
      return edge >= 0.02;
    });

    if (valueBets.length) {
      console.log(`\n── VALUE DRAWS (Polymarket price < Pinnacle baseline of ${(100/ref.avgPSD).toFixed(1)}%) ──\n`);
      for (const g of valueBets) {
        const polyOdds   = (1 / g.draw.price).toFixed(2);
        const edgePct    = ((1/ref.avgPSD - g.draw.price) * 100).toFixed(1);
        console.log(`  ${g.title.padEnd(42)}  Draw @ ${polyOdds} odds  (edge: +${edgePct}%  liq: $${Math.round(g.liquidity)})`);
      }
    } else {
      console.log(`\nNo value draws found vs Pinnacle baseline (${(100/ref.avgPSD).toFixed(1)}% implied prob).`);
    }
  }

  console.log('');
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
