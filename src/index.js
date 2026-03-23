const express = require('express');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./openapi');

const app = express();
const PORT = process.env.PORT || 3000;

const SOFASCORE_BASE = 'https://www.sofascore.com/api/v1';

// Headers that mimic a real browser to avoid 403s from SofaScore
const PROXY_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

// ─── Swagger UI ──────────────────────────────────────────────────────────────
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'SofaScore API Docs',
    customCss: `
      .topbar { background-color: #0a4595; }
      .topbar-wrapper img { display: none; }
      .topbar-wrapper::after { content: 'SofaScore API'; color: white; font-size: 1.4rem; font-weight: bold; padding-left: 10px; }
    `,
    swaggerOptions: {
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        req.headers['Accept'] = 'application/json';
        return req;
      },
    },
  })
);

// ─── Raw OpenAPI spec endpoint ────────────────────────────────────────────────
app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

// ─── Proxy handler ────────────────────────────────────────────────────────────
async function proxyToSofaScore(req, res) {
  // Build upstream URL: strip our /api/v1 prefix and forward the rest
  const upstreamPath = req.originalUrl.replace(/^\/api\/v1/, '');
  const upstreamUrl = `${SOFASCORE_BASE}${upstreamPath}`;

  console.log(`[PROXY] ${req.method} ${req.originalUrl} → ${upstreamUrl}`);

  try {
    const response = await axios.get(upstreamUrl, {
      headers: PROXY_HEADERS,
      timeout: 10000,
      // Decompress automatically
      decompress: true,
    });

    // Forward status and JSON body
    res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      console.error(`[PROXY ERROR] ${err.response.status} from SofaScore: ${upstreamUrl}`);
      res
        .status(err.response.status)
        .json({ error: 'SofaScore returned an error', status: err.response.status, url: upstreamUrl });
    } else if (err.code === 'ECONNABORTED') {
      console.error(`[PROXY TIMEOUT] ${upstreamUrl}`);
      res.status(504).json({ error: 'Request to SofaScore timed out', url: upstreamUrl });
    } else {
      console.error(`[PROXY NETWORK ERROR] ${err.message}`);
      res.status(502).json({ error: 'Network error reaching SofaScore', message: err.message });
    }
  }
}

// ─── Mount proxy for all /api/v1/* routes ─────────────────────────────────────
app.get('/api/v1/*', proxyToSofaScore);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'SofaScore API Proxy',
    docs: '/docs',
    spec: '/openapi.json',
    health: '/health',
    example_endpoints: [
      '/api/v1/sport/football/events/live',
      '/api/v1/sport/football/scheduled-events/2025-03-15',
      '/api/v1/unique-tournament/17',
      '/api/v1/unique-tournament/17/season/52186/standings/total',
      '/api/v1/event/12436896',
      '/api/v1/player/874655',
      '/api/v1/team/37',
      '/api/v1/search/multi-suggest?q=haaland',
    ],
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n SofaScore API Proxy running`);
  console.log(` Swagger UI  → http://localhost:${PORT}/docs`);
  console.log(` Health      → http://localhost:${PORT}/health`);
  console.log(` OpenAPI spec→ http://localhost:${PORT}/openapi.json`);
  console.log(` Proxy base  → http://localhost:${PORT}/api/v1/...\n`);
});
