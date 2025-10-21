import { getDoc, upsertDoc, listDocsByJob } from '../lib/store.js';
import { edjsToHtml, edjsToTiptap } from '../lib/converters.js';
import { asString, isTiptapDoc } from '../lib/validate.js';

export async function docsRoutes(app) {
  // GET /docs/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const doc = getDoc(id);
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
    const items = listDocsByJob(jobId);
    items.sort(
      (a, b) =>
        (a.position ?? 0) - (b.position ?? 0) ||
        String(b.updatedAt).localeCompare(String(a.updatedAt))
    );
    return { items };
  });

  // PUT /docs/:id
  app.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};
    const payload = {};

    if (typeof body.title === 'string') payload.title = body.title;
    if (typeof body.jobId === 'string') payload.jobId = body.jobId;
    if (typeof body.folderId === 'string') payload.folderId = body.folderId;
    if (Number.isFinite(body.position)) payload.position = body.position;

    if (body.tiptapJson && isTiptapDoc(body.tiptapJson)) {
      payload.tiptapJson = body.tiptapJson;
    }
    if (typeof body.htmlSnapshot === 'string') {
      payload.htmlSnapshot = body.htmlSnapshot;
    }

    const saved = upsertDoc(id, payload);
    return reply.code(200).send(saved);
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
