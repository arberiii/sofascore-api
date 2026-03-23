module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'SofaScore Unofficial API',
    version: '1.0.0',
    description:
      'Unofficial SofaScore API wrapper. All requests are proxied to `https://www.sofascore.com/api/v1`. ' +
      'This is NOT an official SofaScore product. Use responsibly.',
    contact: { email: '' },
    license: { name: 'MIT' },
  },
  servers: [{ url: '/api/v1', description: 'Local proxy server' }],
  tags: [
    { name: 'Sports & Categories', description: 'Sports, categories and live events' },
    { name: 'Tournaments', description: 'Tournament and league data' },
    { name: 'Events', description: 'Match / event data' },
    { name: 'Players', description: 'Player statistics and data' },
    { name: 'Teams', description: 'Team information' },
    { name: 'Search', description: 'Search across players, teams and tournaments' },
  ],
  paths: {
    // ─── Sports & Categories ──────────────────────────────────────────────
    '/sport/{sport}/categories': {
      get: {
        tags: ['Sports & Categories'],
        summary: 'Get all categories for a sport',
        operationId: 'getSportCategories',
        parameters: [
          {
            name: 'sport',
            in: 'path',
            required: true,
            description: 'Sport slug',
            schema: { type: 'string', enum: ['football', 'basketball', 'tennis', 'cricket', 'esports'] },
            example: 'football',
          },
        ],
        responses: {
          200: { description: 'List of categories', content: { 'application/json': { schema: { type: 'object' } } } },
          429: { description: 'Rate limited by SofaScore' },
        },
      },
    },
    '/sport/{sport}/events/live': {
      get: {
        tags: ['Sports & Categories'],
        summary: 'Get live events for a sport',
        operationId: 'getLiveEvents',
        parameters: [
          {
            name: 'sport',
            in: 'path',
            required: true,
            description: 'Sport slug',
            schema: { type: 'string', enum: ['football', 'basketball', 'tennis', 'cricket', 'esports'] },
            example: 'football',
          },
        ],
        responses: {
          200: { description: 'Live events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/sport/{sport}/scheduled-events/{date}': {
      get: {
        tags: ['Sports & Categories'],
        summary: 'Get scheduled events for a sport on a given date',
        operationId: 'getScheduledEvents',
        parameters: [
          {
            name: 'sport',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['football', 'basketball', 'tennis', 'cricket', 'esports'] },
            example: 'football',
          },
          {
            name: 'date',
            in: 'path',
            required: true,
            description: 'Date in YYYY-MM-DD format',
            schema: { type: 'string', format: 'date' },
            example: '2025-03-15',
          },
        ],
        responses: {
          200: { description: 'Scheduled events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── Tournaments ──────────────────────────────────────────────────────
    '/config/unique-tournaments/{language}/{sport}': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get all unique tournaments for a sport and language',
        operationId: 'getUniqueTournaments',
        parameters: [
          {
            name: 'language',
            in: 'path',
            required: true,
            description: 'Language code (e.g. en, pt, es)',
            schema: { type: 'string' },
            example: 'en',
          },
          {
            name: 'sport',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['football', 'basketball', 'tennis'] },
            example: 'football',
          },
        ],
        responses: {
          200: { description: 'Tournaments list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/unique-tournament/{tournamentId}': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get tournament details',
        operationId: 'getTournament',
        parameters: [
          {
            name: 'tournamentId',
            in: 'path',
            required: true,
            description: 'Tournament ID (e.g. 17 = Premier League)',
            schema: { type: 'integer' },
            example: 17,
          },
        ],
        responses: {
          200: { description: 'Tournament object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/unique-tournament/{tournamentId}/seasons': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get seasons for a tournament',
        operationId: 'getTournamentSeasons',
        parameters: [
          {
            name: 'tournamentId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 17,
          },
        ],
        responses: {
          200: { description: 'Seasons list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/unique-tournament/{tournamentId}/season/{seasonId}/standings/total': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get total standings for a season',
        operationId: 'getStandingsTotal',
        parameters: [
          {
            name: 'tournamentId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 17,
          },
          {
            name: 'seasonId',
            in: 'path',
            required: true,
            description: 'Season ID (e.g. 52186 = PL 2024/25)',
            schema: { type: 'integer' },
            example: 52186,
          },
        ],
        responses: {
          200: { description: 'Standings table', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/unique-tournament/{tournamentId}/season/{seasonId}/statistics': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get player statistics for a tournament season',
        operationId: 'getTournamentSeasonStatistics',
        parameters: [
          {
            name: 'tournamentId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 17,
          },
          {
            name: 'seasonId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 52186,
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 100 },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 0 },
          },
          {
            name: 'order',
            in: 'query',
            required: false,
            description: 'Sort order, prefix with - for descending (e.g. -rating)',
            schema: { type: 'string', default: '-rating' },
          },
          {
            name: 'accumulation',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['total', 'perGame', 'per90'], default: 'total' },
          },
          {
            name: 'fields',
            in: 'query',
            required: false,
            description: 'Comma-separated stat fields',
            schema: { type: 'string' },
          },
          {
            name: 'filters',
            in: 'query',
            required: false,
            description: 'Filter expression (e.g. position.in.G~D~M~F)',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Player stats list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── Events / Matches ────────────────────────────────────────────────
    '/event/{eventId}': {
      get: {
        tags: ['Events'],
        summary: 'Get event (match) details',
        operationId: 'getEvent',
        parameters: [
          {
            name: 'eventId',
            in: 'path',
            required: true,
            description: 'Event/Match ID',
            schema: { type: 'integer' },
            example: 12436896,
          },
        ],
        responses: {
          200: { description: 'Event object', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { description: 'Event not found' },
        },
      },
    },
    '/event/{eventId}/lineups': {
      get: {
        tags: ['Events'],
        summary: 'Get lineups for an event',
        operationId: 'getEventLineups',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Lineups', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/shotmap': {
      get: {
        tags: ['Events'],
        summary: 'Get shot map for an event',
        operationId: 'getEventShotmap',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Shot map data', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/graph': {
      get: {
        tags: ['Events'],
        summary: 'Get match momentum graph for an event',
        operationId: 'getEventGraph',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Momentum graph data', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/average-positions': {
      get: {
        tags: ['Events'],
        summary: 'Get average player positions for an event',
        operationId: 'getEventAveragePositions',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Average positions', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/statistics': {
      get: {
        tags: ['Events'],
        summary: 'Get match statistics for an event',
        operationId: 'getEventStatistics',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
        ],
        responses: {
          200: { description: 'Match statistics', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/player/{playerId}/heatmap': {
      get: {
        tags: ['Events'],
        summary: 'Get player heatmap for a specific event',
        operationId: 'getEventPlayerHeatmap',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
        ],
        responses: {
          200: { description: 'Heatmap coordinates', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/event/{eventId}/player/{playerId}/rating-breakdown': {
      get: {
        tags: ['Events'],
        summary: 'Get player rating breakdown for a specific event',
        operationId: 'getEventPlayerRatingBreakdown',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'integer' }, example: 12436896 },
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
        ],
        responses: {
          200: { description: 'Rating breakdown', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── Players ──────────────────────────────────────────────────────────
    '/player/{playerId}': {
      get: {
        tags: ['Players'],
        summary: 'Get player details',
        operationId: 'getPlayer',
        parameters: [
          {
            name: 'playerId',
            in: 'path',
            required: true,
            description: 'Player ID (e.g. 874655 = Erling Haaland)',
            schema: { type: 'integer' },
            example: 874655,
          },
        ],
        responses: {
          200: { description: 'Player object', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { description: 'Player not found' },
        },
      },
    },
    '/player/{playerId}/statistics/seasons': {
      get: {
        tags: ['Players'],
        summary: 'Get all seasons a player has statistics for',
        operationId: 'getPlayerStatisticsSeasons',
        parameters: [
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
        ],
        responses: {
          200: { description: 'Seasons list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/player/{playerId}/unique-tournament/{tournamentId}/season/{seasonId}/statistics/overall': {
      get: {
        tags: ['Players'],
        summary: 'Get player statistics for a specific tournament season',
        operationId: 'getPlayerSeasonStatistics',
        parameters: [
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
          { name: 'tournamentId', in: 'path', required: true, schema: { type: 'integer' }, example: 17 },
          { name: 'seasonId', in: 'path', required: true, schema: { type: 'integer' }, example: 52186 },
        ],
        responses: {
          200: { description: 'Player season stats', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/player/{playerId}/unique-tournament/{tournamentId}/season/{seasonId}/heatmap/overall': {
      get: {
        tags: ['Players'],
        summary: 'Get player season heatmap',
        operationId: 'getPlayerSeasonHeatmap',
        parameters: [
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
          { name: 'tournamentId', in: 'path', required: true, schema: { type: 'integer' }, example: 17 },
          { name: 'seasonId', in: 'path', required: true, schema: { type: 'integer' }, example: 52186 },
        ],
        responses: {
          200: { description: 'Season heatmap', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/player/{playerId}/events/last/{page}': {
      get: {
        tags: ['Players'],
        summary: "Get player's last events (paginated)",
        operationId: 'getPlayerLastEvents',
        parameters: [
          { name: 'playerId', in: 'path', required: true, schema: { type: 'integer' }, example: 874655 },
          { name: 'page', in: 'path', required: true, schema: { type: 'integer', default: 0 }, example: 0 },
        ],
        responses: {
          200: { description: 'Events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── Teams ────────────────────────────────────────────────────────────
    '/team/{teamId}': {
      get: {
        tags: ['Teams'],
        summary: 'Get team details',
        operationId: 'getTeam',
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            description: 'Team ID (e.g. 37 = Manchester City)',
            schema: { type: 'integer' },
            example: 37,
          },
        ],
        responses: {
          200: { description: 'Team object', content: { 'application/json': { schema: { type: 'object' } } } },
          404: { description: 'Team not found' },
        },
      },
    },
    '/team/{teamId}/players': {
      get: {
        tags: ['Teams'],
        summary: 'Get squad (players) for a team',
        operationId: 'getTeamPlayers',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'integer' }, example: 37 },
        ],
        responses: {
          200: { description: 'Squad list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/team/{teamId}/events/last/{page}': {
      get: {
        tags: ['Teams'],
        summary: "Get team's last events (paginated)",
        operationId: 'getTeamLastEvents',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'integer' }, example: 37 },
          { name: 'page', in: 'path', required: true, schema: { type: 'integer', default: 0 }, example: 0 },
        ],
        responses: {
          200: { description: 'Events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/team/{teamId}/events/next/{page}': {
      get: {
        tags: ['Teams'],
        summary: "Get team's upcoming events (paginated)",
        operationId: 'getTeamNextEvents',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'integer' }, example: 37 },
          { name: 'page', in: 'path', required: true, schema: { type: 'integer', default: 0 }, example: 0 },
        ],
        responses: {
          200: { description: 'Upcoming events list', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ─── Search ───────────────────────────────────────────────────────────
    '/search/multi-suggest': {
      get: {
        tags: ['Search'],
        summary: 'Search across teams, players, and tournaments',
        operationId: 'searchMulti',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            description: 'Search query string',
            schema: { type: 'string' },
            example: 'manchester',
          },
        ],
        responses: {
          200: { description: 'Search results', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/search/player-team-tournament': {
      get: {
        tags: ['Search'],
        summary: 'Search players, teams and tournaments',
        operationId: 'searchPlayerTeamTournament',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            example: 'haaland',
          },
        ],
        responses: {
          200: { description: 'Search results', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
  },
};
