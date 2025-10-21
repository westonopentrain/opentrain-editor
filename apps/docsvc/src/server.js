import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { docsRoutes } from './routes/docs.js';
import { healthRoutes } from './routes/health.js';

const app = Fastify({ logger: true });

// Permissive in dev; tighten later via env var ALLOWED_ORIGINS
await app.register(cors, {
  origin: (origin, cb) => cb(null, true),
  credentials: true,
});
await app.register(formbody);

app.register(healthRoutes, { prefix: '/health' });
app.register(docsRoutes, { prefix: '/docs' });

const port = process.env.PORT || 3001;
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`docsvc listening on ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
