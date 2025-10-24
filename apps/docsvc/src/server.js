import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
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
await app.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

app.post(
  '/assets',
  { preHandler: requireApiKey },
  async (request, reply) => {
    const parts = request.parts();
    let fileBuffer = null;
    let filename = 'upload';
    let mime = 'application/octet-stream';
    let size = 0;
    const fields = {};

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        filename = part.filename || filename;
        mime = part.mimetype || mime;
        const chunks = [];
        for await (const chunk of part.file) {
          size += chunk.length;
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
      } else if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'file_required' });
    }

    const id = `a_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const jobId = fields.jobId || null;
    const folderId = fields.folderId || null;
    const docId = fields.docId || null;

    try {
      await pool.query(
        `INSERT INTO assets (id, job_id, folder_id, doc_id, filename, mime, size, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, jobId, folderId, docId, filename, mime, size, fileBuffer]
      );
    } catch (error) {
      request.log.error(error, 'failed to insert asset');
      return reply.code(500).send({ error: 'asset_insert_failed' });
    }

    return reply.send({ id, filename, mime, size });
  }
);

app.get('/assets/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const result = await pool.query(
      'SELECT mime, size, data FROM assets WHERE id = $1',
      [id]
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const { mime, size, data } = result.rows[0];
    reply.header('Content-Type', mime);
    reply.header('Content-Length', size);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(data);
  } catch (error) {
    request.log.error(error, 'failed to fetch asset');
    return reply.code(500).send({ error: 'asset_fetch_failed' });
  }
});

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
