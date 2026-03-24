// Provider configurations
// Each provider defines its base URL, route prefix, and how to build auth headers.
// Set the corresponding env var to enable authenticated access.

const PROVIDERS = {
  'football-data': {
    name: 'football-data.org',
    base: 'https://api.football-data.org/v4',
    routePrefix: '/api/football-data/v4',
    envKey: 'FOOTBALL_DATA_API_KEY',
    getHeaders: () => {
      const key = process.env.FOOTBALL_DATA_API_KEY;
      return key ? { 'X-Auth-Token': key } : {};
    },
  },
  'api-football': {
    name: 'API-Football',
    base: 'https://v3.football.api-sports.io',
    routePrefix: '/api/api-football/v3',
    envKey: 'API_FOOTBALL_KEY',
    getHeaders: () => {
      const key = process.env.API_FOOTBALL_KEY;
      return key ? { 'x-apisports-key': key } : {};
    },
  },
  sofascore: {
    name: 'SofaScore (Unofficial)',
    base: 'https://www.sofascore.com/api/v1',
    routePrefix: '/api/sofascore/v1',
    envKey: null,
    getHeaders: () => ({
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Referer: 'https://www.sofascore.com/',
      Origin: 'https://www.sofascore.com',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    }),
  },
};

module.exports = PROVIDERS;
