# SofaScore API

An unofficial SofaScore API proxy with interactive Swagger UI documentation **and an MCP server** for use with AI assistants (Claude, Cursor, etc.). All requests are proxied to `https://www.sofascore.com/api/v1` with proper browser headers, giving you a local REST interface, a live "Try it out" explorer, and 26 MCP tools.

> **Disclaimer:** This is not affiliated with or endorsed by SofaScore. Use of this project is subject to [SofaScore's Terms of Service](https://www.sofascore.com/news/terms-of-service). Do not use it for commercial purposes or in ways that violate their ToS. Be mindful of request frequency — aggressive polling may get your IP rate-limited.

---

## Features

- Full **OpenAPI 3.0** specification covering 22 endpoints
- Interactive **Swagger UI** at `/docs` — try every endpoint from your browser
- **MCP server** with 26 tools — plug directly into Claude, Cursor, or any MCP-compatible AI assistant
- **Proxy server** with browser-like headers to avoid 403s
- Covers **Sports, Tournaments, Events/Matches, Players, Teams, and Search**
- Graceful error handling with descriptive JSON error responses
- Zero config — runs with a single command

---

## Requirements

- Node.js 18+
- npm

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-username/sofascore-api.git
cd sofascore-api

# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Or run with a custom port
PORT=3001 npm start

# Development mode with auto-reload
npm run dev

# Start the MCP server (stdio)
npm run mcp
```

Once running, open:

| URL | Description |
|-----|-------------|
| `http://localhost:3000/docs` | Swagger UI — interactive docs |
| `http://localhost:3000/openapi.json` | Raw OpenAPI 3.0 spec |
| `http://localhost:3000/health` | Health check |
| `http://localhost:3000/` | Root — lists example endpoints |

---

## Project Structure

```
sofascore-api/
├── src/
│   ├── index.js       # Express server, proxy handler, Swagger UI mount
│   └── openapi.js     # Full OpenAPI 3.0 specification
├── mcp/
│   └── index.mjs      # MCP server with 26 tools (stdio transport)
├── package.json
├── .gitignore
└── README.md
```

---

## MCP Server

The MCP (Model Context Protocol) server exposes all SofaScore endpoints as **tools** that AI assistants can call directly. It uses stdio transport — no HTTP port needed.

### Running the MCP server

```bash
npm run mcp
```

Or invoke directly:

```bash
node mcp/index.mjs
```

### Connecting to Claude Desktop

Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sofascore": {
      "command": "node",
      "args": ["/absolute/path/to/sofascore-api/mcp/index.mjs"]
    }
  }
}
```

### Connecting to Claude Code (CLI)

```bash
claude mcp add sofascore node /absolute/path/to/sofascore-api/mcp/index.mjs
```

### Connecting to Cursor

Add to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "sofascore": {
      "command": "node",
      "args": ["/absolute/path/to/sofascore-api/mcp/index.mjs"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_live_events` | All currently live matches for a sport |
| `get_scheduled_events` | All matches on a given date |
| `get_sport_categories` | Categories/regions for a sport |
| `get_unique_tournaments` | All tournaments for a sport |
| `get_tournament` | Tournament details by ID |
| `get_tournament_seasons` | Available seasons for a tournament |
| `get_standings` | League table for a tournament season |
| `get_tournament_statistics` | Player stats for a season (sortable, filterable) |
| `get_event` | Match details (score, status, teams, venue) |
| `get_event_lineups` | Starting XIs, formations, player ratings |
| `get_event_shotmap` | Shot map with coordinates and xG |
| `get_event_graph` | Match momentum graph over time |
| `get_event_statistics` | Possession, xG, shots, passes, corners, etc. |
| `get_event_average_positions` | Average player positions on the pitch |
| `get_event_player_heatmap` | Player touch heatmap for a match |
| `get_event_player_rating_breakdown` | Player rating breakdown for a match |
| `get_player` | Player profile (name, position, team, nationality) |
| `get_player_statistics_seasons` | All seasons a player has stats for |
| `get_player_season_statistics` | Player stats for a specific tournament season |
| `get_player_season_heatmap` | Player touch heatmap across a full season |
| `get_player_last_events` | Player's recent matches (paginated) |
| `get_team` | Team details (name, country, manager, stadium) |
| `get_team_players` | Full squad list |
| `get_team_last_events` | Team's recent results (paginated) |
| `get_team_next_events` | Team's upcoming fixtures (paginated) |
| `search` | Search for players, teams, and tournaments by name |

### Example prompts once connected

Once the MCP server is connected to your AI assistant, you can ask things like:

- *"What football matches are live right now?"*
- *"Show me the Premier League standings"*
- *"Get the lineups and shot map for the Brighton vs Liverpool match"*
- *"What are West Ham's next 5 fixtures?"*
- *"Find the squad for team ID 37"*

---

## API Reference

All endpoints are mounted under `/api/v1/` and proxied to SofaScore's equivalent path.

### Sports & Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sport/{sport}/categories` | All categories for a sport |
| GET | `/api/v1/sport/{sport}/events/live` | Live events for a sport |
| GET | `/api/v1/sport/{sport}/scheduled-events/{date}` | Scheduled events on a date (YYYY-MM-DD) |

**Supported sports:** `football`, `basketball`, `tennis`, `cricket`, `esports`

---

### Tournaments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/config/unique-tournaments/{language}/{sport}` | All tournaments for a sport and language |
| GET | `/api/v1/unique-tournament/{tournamentId}` | Tournament details |
| GET | `/api/v1/unique-tournament/{tournamentId}/seasons` | All seasons for a tournament |
| GET | `/api/v1/unique-tournament/{tournamentId}/season/{seasonId}/standings/total` | League table / standings |
| GET | `/api/v1/unique-tournament/{tournamentId}/season/{seasonId}/statistics` | Player stats for a season |

**Common tournament IDs:**

| ID | Tournament |
|----|------------|
| 17 | Premier League |
| 8 | LaLiga |
| 23 | Serie A |
| 35 | Bundesliga |
| 34 | Ligue 1 |
| 7 | UEFA Champions League |

**Season statistics query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `100` | Number of results |
| `offset` | `0` | Pagination offset |
| `order` | `-rating` | Sort field (prefix `-` for descending) |
| `accumulation` | `total` | `total`, `perGame`, or `per90` |
| `fields` | — | Comma-separated stat fields to include |
| `filters` | — | Filter expression e.g. `position.in.G~D~M~F` |

---

### Events (Matches)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/event/{eventId}` | Match details (teams, score, status, tournament) |
| GET | `/api/v1/event/{eventId}/lineups` | Starting lineups, formations, player ratings |
| GET | `/api/v1/event/{eventId}/shotmap` | Shot map with coordinates, xG, shot type |
| GET | `/api/v1/event/{eventId}/graph` | Match momentum graph over time |
| GET | `/api/v1/event/{eventId}/average-positions` | Average player positions on the pitch |
| GET | `/api/v1/event/{eventId}/statistics` | Match stats (possession, xG, shots, passes, etc.) |
| GET | `/api/v1/event/{eventId}/player/{playerId}/heatmap` | Player heatmap for a specific match |
| GET | `/api/v1/event/{eventId}/player/{playerId}/rating-breakdown` | Player rating breakdown for a match |

To find an event ID, use the scheduled events or live events endpoints first.

---

### Players

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/player/{playerId}` | Player profile (name, position, team, nationality) |
| GET | `/api/v1/player/{playerId}/statistics/seasons` | All seasons the player has stats for |
| GET | `/api/v1/player/{playerId}/unique-tournament/{tournamentId}/season/{seasonId}/statistics/overall` | Player stats for a specific season |
| GET | `/api/v1/player/{playerId}/unique-tournament/{tournamentId}/season/{seasonId}/heatmap/overall` | Season heatmap |
| GET | `/api/v1/player/{playerId}/events/last/{page}` | Player's recent matches (paginated, page starts at 0) |

---

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/team/{teamId}` | Team details (name, sport, country, manager) |
| GET | `/api/v1/team/{teamId}/players` | Full squad list |
| GET | `/api/v1/team/{teamId}/events/last/{page}` | Recent matches (paginated) |
| GET | `/api/v1/team/{teamId}/events/next/{page}` | Upcoming fixtures (paginated) |

---

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/search/multi-suggest?q={query}` | Search across all entity types |
| GET | `/api/v1/search/player-team-tournament?q={query}` | Search players, teams, tournaments |

> Note: Search endpoints may return 403 from SofaScore depending on your network/IP. Use team/player/event endpoints directly when you have IDs.

---

## Usage Examples

```bash
# Live football matches right now
curl http://localhost:3000/api/v1/sport/football/events/live

# All football matches on a specific date
curl http://localhost:3000/api/v1/sport/football/scheduled-events/2026-03-22

# Premier League details
curl http://localhost:3000/api/v1/unique-tournament/17

# Premier League 2024/25 standings
curl http://localhost:3000/api/v1/unique-tournament/17/season/52186/standings/total

# Match details (Brighton 2-1 Liverpool)
curl http://localhost:3000/api/v1/event/14024015

# Match lineups
curl http://localhost:3000/api/v1/event/14024015/lineups

# Match shot map
curl http://localhost:3000/api/v1/event/14024015/shotmap

# Match statistics
curl http://localhost:3000/api/v1/event/14024015/statistics

# Player profile
curl http://localhost:3000/api/v1/player/930997

# Team details
curl http://localhost:3000/api/v1/team/37

# Team squad
curl http://localhost:3000/api/v1/team/37/players

# Team's last 10 fixtures
curl http://localhost:3000/api/v1/team/37/events/last/0

# Search
curl "http://localhost:3000/api/v1/search/multi-suggest?q=manchester"
```

---

## How It Works

1. The Express server receives requests at `/api/v1/*`
2. It strips the `/api/v1` prefix and forwards the request to `https://www.sofascore.com/api/v1`
3. Browser-like headers (`User-Agent`, `Referer`, `Origin`) are injected to pass SofaScore's Varnish/CDN checks
4. The JSON response is forwarded back with the original status code
5. Errors are caught and returned as structured JSON with the upstream status code

```
Client → localhost:3000/api/v1/event/123
           ↓ proxy
       sofascore.com/api/v1/event/123
           ↓ response
Client ← JSON data
```

---

## Error Responses

| Status | Meaning |
|--------|---------|
| `403` | SofaScore blocked the request (rate limit or IP block) |
| `404` | Resource not found on SofaScore |
| `429` | Too many requests — slow down |
| `502` | Network error reaching SofaScore |
| `504` | Request to SofaScore timed out (10s limit) |

All errors return JSON:
```json
{
  "error": "SofaScore returned an error",
  "status": 403,
  "url": "https://www.sofascore.com/api/v1/..."
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to run the server on |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and routing |
| `axios` | HTTP client for proxying requests |
| `swagger-ui-express` | Serves the interactive Swagger UI |
| `nodemon` *(dev)* | Auto-restarts server on file changes |
