import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const FRAME_ANCESTORS = 'frame-ancestors https://*.bubbleapps.io https://www.opentrain.ai;';

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', FRAME_ANCESTORS);
  next();
});

app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR));

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

function signToken({ userId, jobId, docId, perms = 'rw', ttlSec = 300 }) {
  return jwt.sign({ sub: userId || 'anon', jobId, docId, perms }, EMBED_JWT_SECRET, { expiresIn: ttlSec });
}

app.post('/api/issue-embed-token', (req, res) => {
  if (!EMBED_ISSUER_SECRET || req.get('X-Partner-Secret') !== EMBED_ISSUER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { userId, jobId, docId, perms, ttlSec } = req.body || {};
  if (!jobId) {
    return res.status(400).json({ error: 'jobId required' });
  }
  const token = signToken({
    userId,
    jobId,
    docId,
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
    throw new Error(`docsvc ${method} ${pathname} -> ${resp.status}: ${resp.statusText || ''} ${text}`.trim());
  }
  return await resp.json();
}

app.get('/api/docs/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await docsvc(`/docs/${encodeURIComponent(id)}`, 'GET');
    if (doc && doc.jobId && doc.jobId !== req.auth.jobId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(doc || {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.put('/api/docs/:id', verifyToken, async (req, res) => {
  if (req.auth?.perms !== 'rw') {
    return res.status(403).json({ error: 'read_only' });
  }
  try {
    const { id } = req.params;
    const payload = { ...req.body, jobId: req.auth.jobId };
    const saved = await docsvc(`/docs/${encodeURIComponent(id)}`, 'PUT', payload);
    res.json(saved || {});
  } catch (err) {
    res.status(502).json({ error: err.message });
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
