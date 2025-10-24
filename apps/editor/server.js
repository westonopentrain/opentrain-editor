import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
app.use(express.json({ limit: '2mb' }));
app.use(cors());
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const NOTION_DIST_DIR = path.resolve(__dirname, '../notion-like-editor/dist');
const FRAME_ANCESTORS = 'frame-ancestors https://*.bubbleapps.io https://www.opentrain.ai;';
const IMG_SRC = "img-src 'self' data: blob:;";
const CSP_DIRECTIVES = `${FRAME_ANCESTORS} ${IMG_SRC}`;

app.use((req, res, next) => {
  const existing = (res.getHeader('Content-Security-Policy') || '').toString();
  const full = [existing, FRAME_ANCESTORS, IMG_SRC]
    .filter(Boolean)
    .join(' ')
    .trim();
  res.setHeader('Content-Security-Policy', full);
  next();
});

app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR));

app.use('/notion', express.static(NOTION_DIST_DIR, { extensions: ['html'] }));
app.get(['/notion', '/notion/*'], (_req, res) => {
  res.sendFile(path.join(NOTION_DIST_DIR, 'index.html'));
});

app.get('/notion/app', (req, res) => {
  const token = (req.query.token || '').toString();
  res
    .type('html')
    .send(`<!doctype html>
  <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OpenTrain Notion Editor</title>
  <style>html,body,iframe{height:100%;width:100%;margin:0;border:0}</style></head>
  <body><iframe src="/notion/?token=${encodeURIComponent(
      token
    )}" allow="clipboard-write *"></iframe></body></html>`);
});

const DOCSVC_URL = process.env.DOCSVC_URL || 'https://opentrain-docsvc.onrender.com';
const DOCSVC_API_KEY = process.env.DOCSVC_API_KEY;
const EMBED_ISSUER_SECRET = process.env.EMBED_ISSUER_SECRET;
const EMBED_JWT_SECRET = process.env.EMBED_JWT_SECRET || 'change-me';

if (!DOCSVC_API_KEY) {
  console.warn('[editor-shell] DOCSVC_API_KEY env var is not set; doc requests will fail.');
}
if (!EMBED_ISSUER_SECRET) {
  console.warn('[editor-shell] EMBED_ISSUER_SECRET env var is not set; /api/issue-embed-token will be disabled.');
}

function signToken({ userId, jobId, docId, folderId, perms = 'rw', ttlSec = 300 }) {
  const payload = {
    sub: userId || 'anon',
    jobId,
    docId,
    folderId,
    perms,
  };
  return jwt.sign(payload, EMBED_JWT_SECRET, { expiresIn: ttlSec });
}

app.post('/api/issue-embed-token', (req, res) => {
  if (!EMBED_ISSUER_SECRET || req.get('X-Partner-Secret') !== EMBED_ISSUER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { userId, jobId, docId, folderId, perms, ttlSec } = req.body || {};
  if (!jobId && !folderId) {
    return res.status(400).json({ error: 'jobId or folderId required' });
  }
  const token = signToken({
    userId,
    jobId,
    docId,
    folderId,
    perms: perms === 'ro' ? 'ro' : 'rw',
    ttlSec: ttlSec || 300
  });
  res.json({ token });
});

function verifyToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'missing token' });
  }
  try {
    req.auth = jwt.verify(token, EMBED_JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

async function docsvc(pathname, method = 'GET', body) {
  if (!DOCSVC_API_KEY) {
    throw new Error('DOCSVC_API_KEY env var is required');
  }
  const resp = await fetch(`${DOCSVC_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${DOCSVC_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const error = new Error(
      `docsvc ${method} ${pathname} -> ${resp.status}: ${resp.statusText || ''} ${text}`.trim()
    );
    error.status = resp.status;
    error.statusText = resp.statusText;
    error.body = text;
    throw error;
  }
  return await resp.json();
}

function effectiveJobId(auth) {
  if (!auth) return null;
  if (auth.folderId) {
    return `folder-${auth.folderId}`;
  }
  return auth.jobId || null;
}

function canonicalRootId(auth) {
  if (!auth) return null;
  if (auth.folderId) {
    return `instructions-folder-${auth.folderId}`;
  }
  if (auth.jobId) {
    return `instructions-${auth.jobId}`;
  }
  return null;
}

async function ensureRootDoc(auth) {
  const scopeJobId = effectiveJobId(auth);
  const canonicalId = canonicalRootId(auth);
  if (!scopeJobId || !canonicalId) {
    throw new Error('invalid_scope');
  }
  try {
    const existing = await docsvc(`/docs/${encodeURIComponent(canonicalId)}`, 'GET');
    if (existing) {
      return existing;
    }
  } catch (err) {
    if (err.status && err.status !== 404) {
      throw err;
    }
  }
  const payload = { title: 'Instructions', jobId: scopeJobId, position: 0, htmlSnapshot: '<p></p>' };
  return docsvc(`/docs/${encodeURIComponent(canonicalId)}`, 'PUT', payload);
}

app.post('/api/assets', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file_required' });
    }

    if (!DOCSVC_API_KEY) {
      throw new Error('DOCSVC_API_KEY env var is required');
    }

    const scopeJobId = effectiveJobId(req.auth) || null;
    const { originalname, mimetype, buffer, size } = req.file;
    const filename = originalname || 'upload';
    const contentType = mimetype || 'application/octet-stream';

    const form = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    form.append('file', blob, filename);
    if (scopeJobId) form.append('jobId', scopeJobId);
    if (req.auth?.folderId) form.append('folderId', req.auth.folderId);
    if (req.auth?.docId) form.append('docId', req.auth.docId);

    const resp = await fetch(`${DOCSVC_URL}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DOCSVC_API_KEY}` },
      body: form,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`docsvc assets POST -> ${resp.status}: ${txt}`);
    }

    const payload = await resp.json().catch(() => ({}));
    const id = payload?.id;
    if (!id) {
      return res.status(502).json({ error: 'invalid_asset_response' });
    }

    const url = `/assets/${encodeURIComponent(id)}`;
    return res.json({ id, url, filename, mimetype: contentType, size });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: message });
  }
});

app.get('/assets/:id', async (req, res) => {
  try {
    const upstream = await fetch(
      `${DOCSVC_URL}/assets/${encodeURIComponent(req.params.id)}`
    );
    if (!upstream.ok) {
      return res.sendStatus(upstream.status);
    }

    res.set(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/octet-stream'
    );
    res.set(
      'Cache-Control',
      upstream.headers.get('cache-control') || 'public, max-age=31536000, immutable'
    );

    const body = upstream.body;
    if (!body) {
      return res.sendStatus(502);
    }

    if (typeof body.pipe === 'function') {
      body.pipe(res);
      return;
    }

    return Readable.fromWeb(body).pipe(res);
  } catch (err) {
    return res.sendStatus(502);
  }
});

app.get('/api/docs/:id', verifyToken, async (req, res) => {
  try {
    const scopeJobId = effectiveJobId(req.auth);
    if (!scopeJobId) {
      return res.status(400).json({ error: 'invalid_scope' });
    }
    const { id } = req.params;
    const doc = await docsvc(`/docs/${encodeURIComponent(id)}`, 'GET');
    if (doc && doc.jobId && doc.jobId !== scopeJobId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(doc || {});
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.status(err?.status || 502).json({ error: err.message });
  }
});

app.put('/api/docs/:id', verifyToken, async (req, res) => {
  if (req.auth?.perms !== 'rw') {
    return res.status(403).json({ error: 'read_only' });
  }
  try {
    const { id } = req.params;
    const scopeJobId = effectiveJobId(req.auth);
    if (!scopeJobId) {
      return res.status(400).json({ error: 'invalid_scope' });
    }
    const payload = { ...req.body, jobId: scopeJobId };
    const saved = await docsvc(`/docs/${encodeURIComponent(id)}`, 'PUT', payload);
    res.json(saved || {});
  } catch (err) {
    res.status(err?.status || 502).json({ error: err.message });
  }
});

app.delete('/api/docs/:id', verifyToken, async (req, res) => {
  if (req.auth?.perms !== 'rw') {
    return res.status(403).json({ error: 'read_only' });
  }
  if (!DOCSVC_API_KEY) {
    return res.status(503).json({ error: 'doc_service_unavailable' });
  }
  try {
    const { id } = req.params;
    const canonicalRoot = canonicalRootId(req.auth);
    if (canonicalRoot && id === canonicalRoot) {
      return res.status(400).json({ error: 'cannot_delete_root' });
    }
    const scopeJobId = effectiveJobId(req.auth);
    if (!scopeJobId) {
      return res.status(400).json({ error: 'invalid_scope' });
    }
    const headers = {
      Authorization: `Bearer ${DOCSVC_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const docResp = await fetch(`${DOCSVC_URL}/docs/${encodeURIComponent(id)}`, { method: 'GET', headers });
    if (docResp.status === 404) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (!docResp.ok) {
      const text = await docResp.text().catch(() => '');
      throw new Error(`docsvc GET /docs/${id} -> ${docResp.status}: ${text}`.trim());
    }
    const doc = await docResp.json().catch(() => ({}));
    if (doc?.jobId && doc.jobId !== scopeJobId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const delResp = await fetch(`${DOCSVC_URL}/docs/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    if (delResp.status === 404) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (!delResp.ok) {
      const text = await delResp.text().catch(() => '');
      throw new Error(`docsvc DELETE /docs/${id} -> ${delResp.status}: ${text}`.trim());
    }
    const payload = await delResp.json().catch(() => ({}));
    res.json(payload || {});
  } catch (err) {
    res.status(err?.status || 502).json({ error: err.message });
  }
});

app.post('/api/scope/ensure-root', verifyToken, async (req, res) => {
  try {
    const scopeJobId = effectiveJobId(req.auth);
    const rootId = canonicalRootId(req.auth);
    if (!scopeJobId || !rootId) {
      return res.status(400).json({ error: 'invalid_scope' });
    }
    const root = await ensureRootDoc(req.auth);
    res.json({ rootId: root?.id || rootId });
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) });
  }
});

app.get('/api/scope/docs', verifyToken, async (req, res) => {
  try {
    const scopeJobId = effectiveJobId(req.auth);
    const rootId = canonicalRootId(req.auth);
    if (!scopeJobId || !rootId) {
      return res.status(400).json({ error: 'invalid_scope' });
    }
    const root = await ensureRootDoc(req.auth);
    let docs;
    try {
      docs = await docsvc(`/jobs/${encodeURIComponent(scopeJobId)}/docs`, 'GET');
    } catch (err) {
      if (err.status === 404) {
        docs = root ? [root] : [];
      } else {
        throw err;
      }
    }
    res.json(Array.isArray(docs) ? docs : []);
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) });
  }
});

app.post('/api/scope/pages', verifyToken, async (req, res) => {
  if (req.auth?.perms !== 'rw') {
    return res.status(403).json({ error: 'read_only' });
  }

  try {
    const scopeJobId = effectiveJobId(req.auth);
    const canonicalRoot = canonicalRootId(req.auth);
    if (!scopeJobId || !canonicalRoot) {
      return res.status(400).json({ error: 'invalid_scope' });
    }

    const { title, parentId, rootId } = req.body || {};
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'title required' });
    }

    const ensuredRoot = await ensureRootDoc(req.auth);
    const fallbackRootId = ensuredRoot?.id || canonicalRoot;
    const targetParentId =
      typeof parentId === 'string' && parentId.trim()
        ? parentId.trim()
        : typeof rootId === 'string' && rootId.trim()
          ? rootId.trim()
          : fallbackRootId;

    if (!targetParentId) {
      return res.status(400).json({ error: 'invalid_parent' });
    }

    let position = 100;
    try {
      const docs = await docsvc(`/jobs/${encodeURIComponent(scopeJobId)}/docs`, 'GET');
      const siblings = Array.isArray(docs)
        ? docs.filter((d) => {
            const folderId = typeof d?.folderId === 'string' ? d.folderId : null;
            return folderId === targetParentId;
          })
        : [];
      if (siblings.length) {
        position = Math.max(...siblings.map((d) => Number(d?.position) || 0)) + 100;
      }
    } catch (err) {
      if (!err.status || err.status !== 404) throw err;
    }

    const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      title: trimmedTitle,
      jobId: scopeJobId,
      folderId: targetParentId,
      position,
      htmlSnapshot: '<p></p>',
    };

    const doc = await docsvc(`/docs/${encodeURIComponent(id)}`, 'PUT', payload);
    return res.json(doc);
  } catch (err) {
    return res.status(err?.status || 502).json({ error: err.message || String(err) });
  }
});


app.get('/api/jobs/:jobId/docs', verifyToken, async (req, res) => {
  const { jobId } = req.params;
  if (jobId !== req.auth.jobId) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const list = await docsvc(`/jobs/${encodeURIComponent(jobId)}/docs`, 'GET');
    res.json(Array.isArray(list) ? list : []);
  } catch (err) {
    res.json([]);
  }
});

app.get('/app', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'app.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Editor shell listening on :${PORT}`);
});
