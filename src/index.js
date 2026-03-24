const express = require('express');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./openapi');
const PROVIDERS = require('./providers');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Swagger UI ──────────────────────────────────────────────────────────────
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Sports API Proxy Docs',
    swaggerOptions: { tryItOutEnabled: true },
  })
);

// ─── Raw OpenAPI spec endpoint ────────────────────────────────────────────────
app.get('/openapi.json', (_req, res) => res.json(openApiSpec));

// ─── Build proxy handler for a given provider ────────────────────────────────
function makeProxyHandler(provider) {
  return async function (req, res) {
    const upstreamPath = req.originalUrl.replace(provider.routePrefix, '');
    const upstreamUrl = `${provider.base}${upstreamPath}`;

    console.log(`[PROXY:${provider.name}] ${req.method} ${req.originalUrl} → ${upstreamUrl}`);

    try {
      const response = await axios.get(upstreamUrl, {
        headers: provider.getHeaders(),
        timeout: 10000,
        decompress: true,
      });
      res.status(response.status).json(response.data);
    } catch (err) {
      if (err.response) {
        console.error(`[PROXY ERROR] ${err.response.status} from ${provider.name}: ${upstreamUrl}`);
        res.status(err.response.status).json({
          error: `${provider.name} returned an error`,
          status: err.response.status,
          url: upstreamUrl,
        });
      } else if (err.code === 'ECONNABORTED') {
        res.status(504).json({ error: 'Request timed out', url: upstreamUrl });
      } else {
        console.error(`[PROXY NETWORK ERROR] ${err.message}`);
        res.status(502).json({ error: 'Network error', message: err.message });
      }
    }
  };
}

// ─── Mount proxy routes for all providers ────────────────────────────────────
for (const provider of Object.values(PROVIDERS)) {
  app.get(`${provider.routePrefix}/*`, makeProxyHandler(provider));
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      name: p.name,
      prefix: p.routePrefix,
      configured: p.envKey ? !!process.env[p.envKey] : true,
    })),
  })
);

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Sports API Proxy',
    docs: '/docs',
    spec: '/openapi.json',
    health: '/health',
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([id, p]) => [
        id,
        {
          name: p.name,
          prefix: p.routePrefix,
          configured: p.envKey ? !!process.env[p.envKey] : true,
        },
      ])
    ),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n Sports API Proxy running on port ${PORT}`);
  console.log(` Swagger UI  → http://localhost:${PORT}/docs`);
  console.log(` Health      → http://localhost:${PORT}/health\n`);
  for (const [, provider] of Object.entries(PROVIDERS)) {
    const status = provider.envKey
      ? process.env[provider.envKey]
        ? '[configured]'
        : '[no API key]'
      : '[no key needed]';
    console.log(` ${provider.name.padEnd(28)} ${status.padEnd(16)} ${provider.routePrefix}/...`);
  }
  console.log('');
});
