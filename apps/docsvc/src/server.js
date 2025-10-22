import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { docsRoutes } from './routes/docs.js';
import { healthRoutes } from './routes/health.js';
import { migrate } from './lib/migrate.js';
import { pool } from './lib/db.js';
import { listDocsByJob } from './lib/store_pg.js';

const app = Fastify({ logger: true });

const docsApiKey = process.env.DOCSVC_API_KEY;
if (!docsApiKey) {
  throw new Error('DOCSVC_API_KEY env var is required');
}

await migrate(pool);

const allowlist = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowlist.length === 0) return cb(null, true);
    cb(null, allowlist.includes(origin));
  },
  credentials: true,
});
await app.register(formbody);

app.register(healthRoutes, { prefix: '/health' });

async function requireApiKey(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const token = auth.slice('Bearer '.length).trim();
  if (token !== docsApiKey) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

app.register(
  async (instance) => {
    instance.addHook('preValidation', requireApiKey);

    await instance.register(docsRoutes);
  },
  { prefix: '/docs' }
);

app.register(
  async (instance) => {
    instance.addHook('preValidation', requireApiKey);

    instance.get('/:jobId/docs', async (request, reply) => {
      const { jobId } = request.params;
      try {
        const items = await listDocsByJob(jobId);
        return reply.send(items);
      } catch (error) {
        request.log.error(error, 'failed to list docs by job');
        return reply.code(500).send({ error: error.message });
      }
    });
  },
  { prefix: '/jobs' }
);

const port = process.env.PORT || 3001;
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`docsvc listening on ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
