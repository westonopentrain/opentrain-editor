import { getDoc, upsertDoc, listDocsByJob, deleteDocCascade } from '../lib/store_pg.js';
import { edjsToHtml, edjsToTiptap } from '../lib/converters.js';
import { asString, isTiptapDoc } from '../lib/validate.js';

export async function docsRoutes(app) {
  // GET /docs/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const doc = await getDoc(id);
    if (!doc) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return doc;
  });

  // GET /docs?jobId=...
  app.get('/', async (request) => {
    const jobId = asString(request.query.jobId, null);
    if (!jobId) {
      return { items: [] };
    }
    const items = await listDocsByJob(jobId);
    return { items };
  });

  // PUT /docs/:id
  app.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};
    const payload = {};
    const maxSize = 1024 * 1024; // ~1MB

    if (typeof body.title === 'string') payload.title = body.title;
    if (typeof body.jobId === 'string') payload.jobId = body.jobId;
    if (typeof body.folderId === 'string') payload.folderId = body.folderId;
    if (Number.isFinite(body.position)) payload.position = body.position;

    let tiptapCandidate = body.tiptapJson;
    if (typeof tiptapCandidate === 'string') {
      if (Buffer.byteLength(tiptapCandidate, 'utf8') > maxSize) {
        return reply.code(413).send({ error: 'tiptapJson payload too large' });
      }
      try {
        tiptapCandidate = JSON.parse(tiptapCandidate);
      } catch (error) {
        return reply.code(400).send({ error: 'Invalid tiptapJson JSON' });
      }
    }
    if (tiptapCandidate) {
      const serialized = JSON.stringify(tiptapCandidate);
      if (Buffer.byteLength(serialized, 'utf8') > maxSize) {
        return reply.code(413).send({ error: 'tiptapJson payload too large' });
      }
      if (!isTiptapDoc(tiptapCandidate)) {
        return reply.code(400).send({ error: 'Invalid tiptapJson document' });
      }
      payload.tiptapJson = tiptapCandidate;
    }
    if (typeof body.htmlSnapshot === 'string') {
      if (Buffer.byteLength(body.htmlSnapshot, 'utf8') > maxSize) {
        return reply.code(413).send({ error: 'htmlSnapshot payload too large' });
      }
      payload.htmlSnapshot = body.htmlSnapshot;
    }

    const saved = await upsertDoc(id, payload);
    return reply.code(200).send(saved);
  });

  // DELETE /docs/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await deleteDocCascade(id);
    if (!result.deletedIds.includes(id)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.code(200).send(result);
  });

  // POST /docs/migrate/editorjs
  app.post('/migrate/editorjs', async (request, reply) => {
    const edjs = request.body?.edjs;
    const blocks = edjs?.blocks;
    if (!edjs || !Array.isArray(blocks)) {
      return reply.code(400).send({ error: 'Invalid Editor.js payload' });
    }

    try {
      const tiptapJson = edjsToTiptap(edjs);
      const html = edjsToHtml(blocks);
      return { tiptapJson, html };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Conversion failed' });
    }
  });
}
