module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Sports API Proxy',
    version: '2.0.0',
    description:
      'Multi-provider sports data proxy. Choose a provider by using its route prefix.\n\n' +
      '| Provider | Prefix | Auth | Notes |\n' +
      '|---|---|---|---|\n' +
      '| football-data.org | `/api/football-data/v4` | `FOOTBALL_DATA_API_KEY` | Free tier: top competitions |\n' +
      '| API-Football | `/api/api-football/v3` | `API_FOOTBALL_KEY` | Free: 100 req/day |\n' +
      '| SofaScore | `/api/sofascore/v1` | None | Unofficial, no key needed |',
  },
  servers: [{ url: '/', description: 'Local proxy server' }],
  tags: [
    { name: 'football-data: Competitions', description: 'football-data.org — competitions and leagues' },
    { name: 'football-data: Matches', description: 'football-data.org — match fixtures and results' },
    { name: 'football-data: Teams & Players', description: 'football-data.org — teams and persons' },
    { name: 'api-football: Leagues', description: 'API-Football — leagues and seasons' },
    { name: 'api-football: Fixtures', description: 'API-Football — fixtures and live scores' },
    { name: 'api-football: Stats & Odds', description: 'API-Football — statistics, standings, predictions' },
    { name: 'sofascore: Events', description: 'SofaScore (unofficial) — live and scheduled events' },
    { name: 'sofascore: Tournaments', description: 'SofaScore (unofficial) — tournaments and standings' },
    { name: 'sofascore: Teams & Players', description: 'SofaScore (unofficial) — teams and players' },
  ],
  paths: {
    // ─── football-data.org ────────────────────────────────────────────────────
    '/api/football-data/v4/competitions': {
      get: {
        tags: ['football-data: Competitions'],
        summary: 'List available competitions',
        operationId: 'fd_listCompetitions',
        parameters: [
          {
            name: 'areas',
            in: 'query',
            description: 'Comma-separated area IDs to filter by',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'List of competitions', content: { 'application/json': { schema: { type: 'object' } } } },
          403: { description: 'Unauthorized — set FOOTBALL_DATA_API_KEY' },
        },
      },
    },
    '/api/football-data/v4/competitions/{code}': {
      get: {
        tags: ['football-data: Competitions'],
        summary: 'Get competition details',
        operationId: 'fd_getCompetition',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            description: 'Competition code (e.g. PL, CL, BL1, SA, FL1, PD)',
            schema: { type: 'string' },
            example: 'PL',
          },
        ],
        responses: {
          200: { description: 'Competition object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/competitions/{code}/standings': {
      get: {
        tags: ['football-data: Competitions'],
        summary: 'Get standings for a competition',
        operationId: 'fd_getStandings',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'PL',
          },
          {
            name: 'season',
            in: 'query',
            description: 'Season year (e.g. 2024)',
            schema: { type: 'integer' },
            example: 2024,
          },
          {
            name: 'matchday',
            in: 'query',
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: 'Standings', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/competitions/{code}/matches': {
      get: {
        tags: ['football-data: Matches'],
        summary: 'Get matches for a competition',
        operationId: 'fd_getCompetitionMatches',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'PL',
          },
          {
            name: 'season',
            in: 'query',
            schema: { type: 'integer' },
            example: 2024,
          },
          {
            name: 'matchday',
            in: 'query',
            schema: { type: 'integer' },
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'SUSPENDED', 'CANCELLED'] },
          },
          {
            name: 'dateFrom',
            in: 'query',
            description: 'YYYY-MM-DD',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'dateTo',
            in: 'query',
            description: 'YYYY-MM-DD',
            schema: { type: 'string', format: 'date' },
          },
        ],
        responses: {
          200: { description: 'Matches list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/matches': {
      get: {
        tags: ['football-data: Matches'],
        summary: 'Get matches across competitions (supports date filter)',
        operationId: 'fd_getMatches',
        parameters: [
          {
            name: 'dateFrom',
            in: 'query',
            description: 'YYYY-MM-DD',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'dateTo',
            in: 'query',
            description: 'YYYY-MM-DD',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['SCHEDULED', 'LIVE', 'IN_PLAY', 'FINISHED'] },
          },
          {
            name: 'competitions',
            in: 'query',
            description: 'Comma-separated competition codes',
            schema: { type: 'string' },
            example: 'PL,BL1',
          },
        ],
        responses: {
          200: { description: 'Matches list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/matches/{id}': {
      get: {
        tags: ['football-data: Matches'],
        summary: 'Get a single match by ID',
        operationId: 'fd_getMatch',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Match object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/teams/{id}': {
      get: {
        tags: ['football-data: Teams & Players'],
        summary: 'Get team details',
        operationId: 'fd_getTeam',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 64 },
        ],
        responses: {
          200: { description: 'Team object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/teams/{id}/matches': {
      get: {
        tags: ['football-data: Teams & Players'],
        summary: 'Get matches for a team',
        operationId: 'fd_getTeamMatches',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 64 },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Team matches', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/football-data/v4/persons/{id}': {
      get: {
        tags: ['football-data: Teams & Players'],
        summary: 'Get player (person) details',
        operationId: 'fd_getPerson',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Person object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── API-Football ─────────────────────────────────────────────────────────
    '/api/api-football/v3/leagues': {
      get: {
        tags: ['api-football: Leagues'],
        summary: 'Get leagues / cups',
        operationId: 'af_getLeagues',
        parameters: [
          { name: 'id', in: 'query', description: 'League ID', schema: { type: 'integer' } },
          { name: 'season', in: 'query', description: '4-digit year', schema: { type: 'integer' }, example: 2024 },
          { name: 'country', in: 'query', schema: { type: 'string' }, example: 'England' },
          { name: 'current', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          200: { description: 'Leagues list', content: { 'application/json': { schema: { type: 'object' } } } },
          401: { description: 'Unauthorized — set API_FOOTBALL_KEY' },
        },
      },
    },
    '/api/api-football/v3/standings': {
      get: {
        tags: ['api-football: Leagues'],
        summary: 'Get standings for a league and season',
        operationId: 'af_getStandings',
        parameters: [
          { name: 'league', in: 'query', required: true, schema: { type: 'integer' }, example: 39 },
          { name: 'season', in: 'query', required: true, schema: { type: 'integer' }, example: 2024 },
        ],
        responses: {
          200: { description: 'Standings', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/fixtures': {
      get: {
        tags: ['api-football: Fixtures'],
        summary: 'Get fixtures (supports many filters)',
        operationId: 'af_getFixtures',
        parameters: [
          { name: 'league', in: 'query', schema: { type: 'integer' }, example: 39 },
          { name: 'season', in: 'query', schema: { type: 'integer' }, example: 2024 },
          { name: 'date', in: 'query', description: 'YYYY-MM-DD', schema: { type: 'string', format: 'date' } },
          { name: 'from', in: 'query', description: 'YYYY-MM-DD', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', description: 'YYYY-MM-DD', schema: { type: 'string', format: 'date' } },
          { name: 'team', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', description: 'NS, 1H, HT, 2H, FT, etc.', schema: { type: 'string' } },
          { name: 'live', in: 'query', description: '"all" for all live fixtures', schema: { type: 'string', enum: ['all'] } },
          { name: 'last', in: 'query', description: 'Last N fixtures', schema: { type: 'integer' } },
          { name: 'next', in: 'query', description: 'Next N fixtures', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Fixtures list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/fixtures/statistics': {
      get: {
        tags: ['api-football: Fixtures'],
        summary: 'Get statistics for a fixture',
        operationId: 'af_getFixtureStatistics',
        parameters: [
          { name: 'fixture', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'team', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Fixture statistics', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/fixtures/events': {
      get: {
        tags: ['api-football: Fixtures'],
        summary: 'Get events (goals, cards, subs) for a fixture',
        operationId: 'af_getFixtureEvents',
        parameters: [
          { name: 'fixture', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'team', in: 'query', schema: { type: 'integer' } },
          { name: 'type', in: 'query', description: 'Goal, Card, subst', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/players': {
      get: {
        tags: ['api-football: Stats & Odds'],
        summary: 'Get player statistics',
        operationId: 'af_getPlayers',
        parameters: [
          { name: 'league', in: 'query', schema: { type: 'integer' }, example: 39 },
          { name: 'season', in: 'query', required: true, schema: { type: 'integer' }, example: 2024 },
          { name: 'team', in: 'query', schema: { type: 'integer' } },
          { name: 'id', in: 'query', description: 'Player ID', schema: { type: 'integer' } },
          { name: 'search', in: 'query', description: 'Player name search (min 3 chars)', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: {
          200: { description: 'Players list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/predictions': {
      get: {
        tags: ['api-football: Stats & Odds'],
        summary: 'Get match predictions',
        operationId: 'af_getPredictions',
        parameters: [
          { name: 'fixture', in: 'query', required: true, description: 'Fixture ID', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Predictions object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/api-football/v3/odds': {
      get: {
        tags: ['api-football: Stats & Odds'],
        summary: 'Get bookmaker odds for fixtures',
        operationId: 'af_getOdds',
        parameters: [
          { name: 'fixture', in: 'query', schema: { type: 'integer' } },
          { name: 'league', in: 'query', schema: { type: 'integer' } },
          { name: 'season', in: 'query', schema: { type: 'integer' } },
          { name: 'bookmaker', in: 'query', schema: { type: 'integer' } },
          { name: 'bet', in: 'query', description: 'Bet type ID (1 = Match Winner)', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Odds data', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── SofaScore (Unofficial) ───────────────────────────────────────────────
    '/api/sofascore/v1/sport/football/events/live': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get live football events',
        operationId: 'ss_getLiveEvents',
        responses: {
          200: { description: 'Live events', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/sport/football/scheduled-events/{date}': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get scheduled events for a date',
        operationId: 'ss_getScheduledEvents',
        parameters: [
          {
            name: 'date',
            in: 'path',
            required: true,
            description: 'YYYY-MM-DD',
            schema: { type: 'string', format: 'date' },
            example: '2025-03-15',
          },
        ],
        responses: {
          200: { description: 'Scheduled events', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/event/{eventId}': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get event (match) details',
        operationId: 'ss_getEvent',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Event object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/event/{eventId}/statistics': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get match statistics',
        operationId: 'ss_getEventStatistics',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Match statistics', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/event/{eventId}/shotmap': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get shot map (includes xG per shot)',
        operationId: 'ss_getEventShotmap',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Shot map with xG', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/event/{eventId}/lineups': {
      get: {
        tags: ['sofascore: Events'],
        summary: 'Get lineups for an event',
        operationId: 'ss_getEventLineups',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Lineups', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/unique-tournament/{tournamentId}/season/{seasonId}/standings/total': {
      get: {
        tags: ['sofascore: Tournaments'],
        summary: 'Get total standings for a season',
        operationId: 'ss_getStandings',
        parameters: [
          { name: 'tournamentId', in: 'path', required: true, schema: { type: 'integer' }, example: 17 },
          { name: 'seasonId', in: 'path', required: true, schema: { type: 'integer' }, example: 52186 },
        ],
        responses: {
          200: { description: 'Standings table', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/unique-tournament/{tournamentId}/seasons': {
      get: {
        tags: ['sofascore: Tournaments'],
        summary: 'Get seasons for a tournament',
        operationId: 'ss_getTournamentSeasons',
        parameters: [
          { name: 'tournamentId', in: 'path', required: true, schema: { type: 'integer' }, example: 17 },
        ],
        responses: {
          200: { description: 'Seasons list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/team/{teamId}': {
      get: {
        tags: ['sofascore: Teams & Players'],
        summary: 'Get team details',
        operationId: 'ss_getTeam',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'integer' }, example: 37 },
        ],
        responses: {
          200: { description: 'Team object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/team/{teamId}/events/last/{page}': {
      get: {
        tags: ['sofascore: Teams & Players'],
        summary: "Get team's last events (paginated)",
        operationId: 'ss_getTeamLastEvents',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'integer' }, example: 37 },
          { name: 'page', in: 'path', required: true, schema: { type: 'integer', default: 0 }, example: 0 },
        ],
        responses: {
          200: { description: 'Events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/player/{playerId}': {
      get: {
        tags: ['sofascore: Teams & Players'],
        summary: 'Get player details',
        operationId: 'ss_getPlayer',
        parameters: [
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
        ],
        responses: {
          200: { description: 'Player object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/sofascore/v1/search/multi-suggest': {
      get: {
        tags: ['sofascore: Teams & Players'],
        summary: 'Search across teams, players, and tournaments',
        operationId: 'ss_search',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'manchester' },
        ],
        responses: {
          200: { description: 'Search results', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
  },
};
