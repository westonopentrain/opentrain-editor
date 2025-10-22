const qs = new URLSearchParams(window.location.search);
const token = qs.get('token');
if (!token) {
  document.body.innerHTML = '<p style="padding:16px;color:#b91c1c">Missing token</p>';
  throw new Error('Missing token');
}

const authHeaders = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const $list = document.getElementById('doc-list');
const $status = document.getElementById('save-status');

function decodeJwtPayload(t) {
  try {
    return JSON.parse(atob(t.split('.')[1]));
  } catch (err) {
    console.warn('Failed to decode token payload', err);
    return {};
  }
}

const claims = decodeJwtPayload(token);
const readOnly = String(claims?.perms || '') === 'ro';
let currentDocId = claims.docId || null;

function getEditor() {
  const instance = window.editor;
  if (!instance) {
    throw new Error('Editor not ready');
  }
  return instance;
}

async function loadDocList() {
  try {
    const jobId = claims.jobId;
    const resp = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/docs`, { headers: authHeaders() });
    if (!resp.ok) {
      throw new Error('Failed to list docs');
    }
    const arr = await resp.json();
    renderList(arr);
  } catch (err) {
    console.warn('Doc list failed', err);
    renderList([]);
  }
}

function renderList(items) {
  $list.innerHTML = '';
  const docs = Array.isArray(items) ? items.slice() : [];
  const seen = new Set(docs.map((d) => d.id));
  if (currentDocId && !seen.has(currentDocId)) {
    docs.unshift({ id: currentDocId, title: 'Current doc' });
  }
  docs.forEach((doc) => {
    if (!doc || !doc.id) return;
    const btn = document.createElement('button');
    btn.textContent = doc.title || doc.id;
    btn.dataset.id = doc.id;
    if (doc.id === currentDocId) {
      btn.classList.add('active');
    }
    btn.onclick = () => {
      if (doc.id !== currentDocId) {
        openDoc(doc.id).catch((err) => {
          console.error('Failed to open doc', err);
          setStatus('Failed to load doc');
        });
      }
    };
    $list.appendChild(btn);
  });
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

let editorReady = false;
let lastSavedHash = '';
let saveTimer = null;
let saving = false;

window.__editorShell = {
  async initAndLoad() {
    await loadDocList();
    if (!currentDocId) {
      const first = $list.querySelector('button')?.dataset.id;
      if (first) {
        currentDocId = first;
      }
    }
    if (!currentDocId) {
      const editor = getEditor();
      editor.commands.setContent('<p></p>', true);
      editorReady = true;
      return;
    }
    await openDoc(currentDocId);
  },
  onEditorUpdate() {
    if (!editorReady) return;
    queueSave();
  },
};

async function openDoc(docId) {
  currentDocId = docId;
  Array.from($list.children).forEach(b =>
    b.classList.toggle('active', b.dataset.id === docId)
  );

  let html = '<p></p>'; // default for brand-new docs

  try {
    const r = await fetch(`/api/docs/${encodeURIComponent(docId)}`, { headers: authHeaders() });

   if (r.status === 404) {
     // New document: start with empty content; autosave will create it
     setStatus('New doc — start typing');
   } else if (!r.ok) {
     const msg = await r.text().catch(() => '');
     console.error('Failed to load doc', r.status, msg);
     setStatus('Failed to load doc'); // keep editor usable anyway
   } else {
     const doc = await r.json().catch(() => null);
     if (doc && doc.htmlSnapshot) html = doc.htmlSnapshot;
     setStatus('Saved');
   }
  } catch (e) {
    console.error('Open doc error', e);
    setStatus('Ready');
  }

  // Always make the editor usable and enable autosave
  editor.commands.setContent(html, true);
  lastSavedHash = hashString(editor.getHTML());
  editorReady = true;
}

function setStatus(text) {
  $status.textContent = text;
}

function queueSave() {
  if (saving || readOnly) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    doSave().catch((err) => {
      console.error('Autosave failed', err);
    });
  }, 1200);
}

async function doSave() {
  if (!editorReady || !currentDocId || readOnly) return;
  const editor = getEditor();
  const html = editor.getHTML();
  const hash = hashString(html);
  if (hash === lastSavedHash) return;
  try {
    saving = true;
    setStatus('Saving…');
    const body = {
      title: document.title || 'OpenTrain autosave',
      jobId: claims.jobId,
      position: 1,
      htmlSnapshot: html,
    };
    const resp = await fetch(`/api/docs/${encodeURIComponent(currentDocId)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    await resp.json();
    lastSavedHash = hash;
    setStatus('Saved');
  } catch (err) {
    setStatus('Save failed — retrying…');
    setTimeout(() => {
      saving = false;
      queueSave();
    }, 2000);
    throw err;
  } finally {
    saving = false;
  }
}

window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    doSave().catch(() => {});
  }
});
