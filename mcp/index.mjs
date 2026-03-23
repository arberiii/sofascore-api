import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import axios from 'axios';

// ─── SofaScore client ─────────────────────────────────────────────────────────

const BASE = 'https://www.sofascore.com/api/v1';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
};

async function sofascore(path) {
  const url = `${BASE}${path}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 10_000, decompress: true });
  return res.data;
}

// Helper: return a compact JSON string as MCP text content
function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(e) {
  const message = e?.response
    ? `SofaScore error ${e.response.status}: ${JSON.stringify(e.response.data)}`
    : e.message;
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'sofascore-api',
  version: '1.0.0',
  description:
    'Unofficial SofaScore MCP server. Fetch live scores, match stats, standings, player data, and more.',
});

// ── Sports & Categories ───────────────────────────────────────────────────────

server.tool(
  'get_sport_categories',
  'Get all categories (countries/regions) for a sport',
  { sport: z.enum(['football', 'basketball', 'tennis', 'cricket', 'esports']).describe('Sport slug') },
  async ({ sport }) => {
    try { return ok(await sofascore(`/sport/${sport}/categories`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_live_events',
  'Get all currently live events for a sport',
  { sport: z.enum(['football', 'basketball', 'tennis', 'cricket', 'esports']).describe('Sport slug') },
  async ({ sport }) => {
    try { return ok(await sofascore(`/sport/${sport}/events/live`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_scheduled_events',
  'Get all scheduled events for a sport on a specific date',
  {
    sport: z.enum(['football', 'basketball', 'tennis', 'cricket', 'esports']).describe('Sport slug'),
    date: z.string().describe('Date in YYYY-MM-DD format'),
  },
  async ({ sport, date }) => {
    try { return ok(await sofascore(`/sport/${sport}/scheduled-events/${date}`)); } catch (e) { return err(e); }
  }
);

// ── Tournaments ───────────────────────────────────────────────────────────────

server.tool(
  'get_unique_tournaments',
  'Get all unique tournaments for a sport (optionally filtered by language)',
  {
    sport: z.enum(['football', 'basketball', 'tennis']).describe('Sport slug'),
    language: z.string().default('en').describe('Language code, e.g. en, pt, es'),
  },
  async ({ sport, language }) => {
    try { return ok(await sofascore(`/config/unique-tournaments/${language}/${sport}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_tournament',
  'Get details for a tournament by ID. Common IDs: 17=Premier League, 8=LaLiga, 23=Serie A, 35=Bundesliga, 34=Ligue 1, 7=Champions League',
  { tournament_id: z.number().int().describe('Tournament ID') },
  async ({ tournament_id }) => {
    try { return ok(await sofascore(`/unique-tournament/${tournament_id}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_tournament_seasons',
  'Get all available seasons for a tournament',
  { tournament_id: z.number().int().describe('Tournament ID') },
  async ({ tournament_id }) => {
    try { return ok(await sofascore(`/unique-tournament/${tournament_id}/seasons`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_standings',
  'Get the league table / standings for a tournament season. Example: tournament_id=17, season_id=52186 for PL 2024/25',
  {
    tournament_id: z.number().int().describe('Tournament ID'),
    season_id: z.number().int().describe('Season ID'),
  },
  async ({ tournament_id, season_id }) => {
    try { return ok(await sofascore(`/unique-tournament/${tournament_id}/season/${season_id}/standings/total`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_tournament_statistics',
  'Get player statistics for a tournament season with filtering and sorting options',
  {
    tournament_id: z.number().int().describe('Tournament ID'),
    season_id: z.number().int().describe('Season ID'),
    limit: z.number().int().default(20).describe('Number of results (default 20)'),
    offset: z.number().int().default(0).describe('Pagination offset'),
    order: z.string().default('-rating').describe('Sort field, prefix - for descending. E.g. -goals, -rating'),
    accumulation: z.enum(['total', 'perGame', 'per90']).default('total').describe('Stat accumulation type'),
    filters: z.string().optional().describe('Filter expression e.g. position.in.G~D~M~F'),
  },
  async ({ tournament_id, season_id, limit, offset, order, accumulation, filters }) => {
    try {
      const params = new URLSearchParams({ limit, offset, order, accumulation });
      if (filters) params.set('filters', filters);
      return ok(await sofascore(`/unique-tournament/${tournament_id}/season/${season_id}/statistics?${params}`));
    } catch (e) { return err(e); }
  }
);

// ── Events / Matches ──────────────────────────────────────────────────────────

server.tool(
  'get_event',
  'Get full details for a match/event: teams, score, status, tournament, venue',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_lineups',
  'Get starting lineups, formations, substitutes, and player ratings for a match',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/lineups`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_shotmap',
  'Get the shot map for a match: all shots with coordinates, xG, outcome, and body part',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/shotmap`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_graph',
  'Get the match momentum / performance graph over time for a match',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/graph`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_statistics',
  'Get full match statistics: possession, xG, shots, passes, fouls, corners, etc.',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/statistics`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_average_positions',
  'Get average pitch positions for all players during a match',
  { event_id: z.number().int().describe('Event/match ID') },
  async ({ event_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/average-positions`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_player_heatmap',
  'Get a player\'s touch heatmap for a specific match',
  {
    event_id: z.number().int().describe('Event/match ID'),
    player_id: z.number().int().describe('Player ID'),
  },
  async ({ event_id, player_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/player/${player_id}/heatmap`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_event_player_rating_breakdown',
  'Get the rating breakdown for a player in a specific match (passes, dribbles, defensive actions, etc.)',
  {
    event_id: z.number().int().describe('Event/match ID'),
    player_id: z.number().int().describe('Player ID'),
  },
  async ({ event_id, player_id }) => {
    try { return ok(await sofascore(`/event/${event_id}/player/${player_id}/rating-breakdown`)); } catch (e) { return err(e); }
  }
);

// ── Players ───────────────────────────────────────────────────────────────────

server.tool(
  'get_player',
  'Get a player\'s profile: name, position, nationality, current team, market value',
  { player_id: z.number().int().describe('Player ID') },
  async ({ player_id }) => {
    try { return ok(await sofascore(`/player/${player_id}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_player_statistics_seasons',
  'Get all seasons a player has recorded statistics in',
  { player_id: z.number().int().describe('Player ID') },
  async ({ player_id }) => {
    try { return ok(await sofascore(`/player/${player_id}/statistics/seasons`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_player_season_statistics',
  'Get detailed statistics for a player in a specific tournament season',
  {
    player_id: z.number().int().describe('Player ID'),
    tournament_id: z.number().int().describe('Tournament ID'),
    season_id: z.number().int().describe('Season ID'),
  },
  async ({ player_id, tournament_id, season_id }) => {
    try {
      return ok(await sofascore(`/player/${player_id}/unique-tournament/${tournament_id}/season/${season_id}/statistics/overall`));
    } catch (e) { return err(e); }
  }
);

server.tool(
  'get_player_season_heatmap',
  'Get a player\'s touch heatmap across an entire tournament season',
  {
    player_id: z.number().int().describe('Player ID'),
    tournament_id: z.number().int().describe('Tournament ID'),
    season_id: z.number().int().describe('Season ID'),
  },
  async ({ player_id, tournament_id, season_id }) => {
    try {
      return ok(await sofascore(`/player/${player_id}/unique-tournament/${tournament_id}/season/${season_id}/heatmap/overall`));
    } catch (e) { return err(e); }
  }
);

server.tool(
  'get_player_last_events',
  'Get a player\'s most recent matches (paginated, page 0 = latest)',
  {
    player_id: z.number().int().describe('Player ID'),
    page: z.number().int().default(0).describe('Page number (0-indexed)'),
  },
  async ({ player_id, page }) => {
    try { return ok(await sofascore(`/player/${player_id}/events/last/${page}`)); } catch (e) { return err(e); }
  }
);

// ── Teams ─────────────────────────────────────────────────────────────────────

server.tool(
  'get_team',
  'Get team details: name, sport, country, manager, stadium',
  { team_id: z.number().int().describe('Team ID') },
  async ({ team_id }) => {
    try { return ok(await sofascore(`/team/${team_id}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_team_players',
  'Get the full squad for a team',
  { team_id: z.number().int().describe('Team ID') },
  async ({ team_id }) => {
    try { return ok(await sofascore(`/team/${team_id}/players`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_team_last_events',
  'Get a team\'s recent match results (paginated, page 0 = latest)',
  {
    team_id: z.number().int().describe('Team ID'),
    page: z.number().int().default(0).describe('Page number (0-indexed)'),
  },
  async ({ team_id, page }) => {
    try { return ok(await sofascore(`/team/${team_id}/events/last/${page}`)); } catch (e) { return err(e); }
  }
);

server.tool(
  'get_team_next_events',
  'Get a team\'s upcoming fixtures (paginated, page 0 = next)',
  {
    team_id: z.number().int().describe('Team ID'),
    page: z.number().int().default(0).describe('Page number (0-indexed)'),
  },
  async ({ team_id, page }) => {
    try { return ok(await sofascore(`/team/${team_id}/events/next/${page}`)); } catch (e) { return err(e); }
  }
);

// ── Search ────────────────────────────────────────────────────────────────────

server.tool(
  'search',
  'Search SofaScore for players, teams, and tournaments by name',
  { query: z.string().describe('Search term, e.g. "manchester", "haaland", "premier league"') },
  async ({ query }) => {
    try { return ok(await sofascore(`/search/multi-suggest?q=${encodeURIComponent(query)}`)); } catch (e) { return err(e); }
  }
);

// ─── Connect and run ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
