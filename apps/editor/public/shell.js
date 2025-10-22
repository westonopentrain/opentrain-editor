const qs = new URLSearchParams(window.location.search);
const token = qs.get('token');
if (!token) {
  document.body.innerHTML = '<p style="padding:16px;color:#b91c1c">Missing token</p>';
  throw new Error('Missing token');
}

const authHeaders = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const $list = document.getElementById('doc-list');
const $status = document.getElementById('save-status');
const $addPage = document.getElementById('add-page');

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
let docs = [];
const docMap = new Map();
const dragState = { id: null, before: false };

function getEditor() {
  const instance = window.editor;
  if (!instance) {
    throw new Error('Editor not ready');
  }
  return instance;
}

function normalizeDoc(input, fallbackIndex = 0) {
  const positionValue = Number(input?.position);
  return {
    id: input?.id,
    title: typeof input?.title === 'string' ? input.title : '',
    jobId: input?.jobId ?? null,
    folderId: typeof input?.folderId === 'string' && input.folderId.trim() ? input.folderId : null,
    position: Number.isFinite(positionValue) ? positionValue : (fallbackIndex + 1) * 100,
    createdAt: input?.createdAt ?? null,
    updatedAt: input?.updatedAt ?? null,
  };
}

function rebuildDocMap() {
  docMap.clear();
  docs.forEach((doc, index) => {
    doc.folderId = typeof doc.folderId === 'string' && doc.folderId.trim() ? doc.folderId : null;
    doc.position = Number.isFinite(Number(doc.position)) ? Number(doc.position) : (index + 1) * 100;
    docMap.set(doc.id, doc);
  });
}

function mergeDoc(saved) {
  if (!saved || !saved.id) return false;
  const existing = docMap.get(saved.id);
  if (!existing) {
    const normalized = normalizeDoc(saved, docs.length);
    docs.push(normalized);
    docMap.set(saved.id, normalized);
    return true;
  }
  const index = docs.indexOf(existing);
  const normalized = normalizeDoc({ ...existing, ...saved }, index >= 0 ? index : docs.length);
  let changed = false;
  for (const key of Object.keys(normalized)) {
    if (existing[key] !== normalized[key]) {
      existing[key] = normalized[key];
      changed = true;
    }
  }
  docMap.set(saved.id, existing);
  return changed;
}

function formatDocTitle(doc) {
  const raw = typeof doc?.title === 'string' ? doc.title.trim() : '';
  return raw || 'Untitled page';
}

function sortDocs(a, b) {
  const posA = Number.isFinite(Number(a.position)) ? Number(a.position) : 0;
  const posB = Number.isFinite(Number(b.position)) ? Number(b.position) : 0;
  if (posA !== posB) return posA - posB;
  return formatDocTitle(a).localeCompare(formatDocTitle(b));
}

function getChildren(folderId) {
  const needle = folderId ?? null;
  return docs
    .filter((doc) => (doc.folderId ?? null) === needle)
    .slice()
    .sort(sortDocs);
}

function computeNextPosition(folderId) {
  const siblings = docs.filter((doc) => (doc.folderId ?? null) === (folderId ?? null));
  if (!siblings.length) return 100;
  const max = Math.max(...siblings.map((doc) => (Number.isFinite(Number(doc.position)) ? Number(doc.position) : 0)));
  return max + 100;
}

function setActiveDoc(docId) {
  const rows = $list.querySelectorAll('.doc-row');
  rows.forEach((row) => {
    const isActive = row.dataset.id === docId;
    row.classList.toggle('active', isActive);
    const btn = row.querySelector('.doc-open');
    if (btn) {
      btn.classList.toggle('active', isActive);
    }
  });
}

function clearDropIndicators() {
  $list.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  $list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
}

function captureState(map, doc) {
  if (!doc || map.has(doc.id)) return;
  map.set(doc.id, { position: doc.position ?? 0, folderId: doc.folderId ?? null });
}

async function persistDoc(id, updates) {
  const body = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'title')) body.title = updates.title;
  if (Object.prototype.hasOwnProperty.call(updates, 'position')) body.position = updates.position;
  if (Object.prototype.hasOwnProperty.call(updates, 'folderId')) body.folderId = updates.folderId;
  if (Object.prototype.hasOwnProperty.call(updates, 'htmlSnapshot')) body.htmlSnapshot = updates.htmlSnapshot;

  const resp = await fetch(`/api/docs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => 'Failed to save document');
    throw new Error(text || 'Failed to save document');
  }
  const saved = await resp.json().catch(() => null);
  if (saved) {
    mergeDoc(saved);
  }
  return saved;
}

async function persistOrderChanges(beforeState) {
  if (!beforeState || beforeState.size === 0) return;
  const updates = [];
  beforeState.forEach((prev, id) => {
    const doc = docMap.get(id);
    if (!doc) return;
    const folderId = doc.folderId ?? null;
    if (doc.position !== prev.position || folderId !== prev.folderId) {
      const payload = { position: doc.position };
      if (folderId !== prev.folderId) {
        payload.folderId = folderId;
      }
      updates.push({ id, payload });
    }
  });

  for (const update of updates) {
    await persistDoc(update.id, update.payload);
  }
}

function buildList(folderId, level) {
  const list = document.createElement('ul');
  list.className = level === 0 ? 'doc-tree' : 'doc-children';
  list.dataset.folderId = folderId || '';
  if (!readOnly) {
    list.addEventListener('dragover', handleListDragOver);
    list.addEventListener('dragleave', handleListDragLeave);
    list.addEventListener('drop', handleListDrop);
  }
  const children = getChildren(folderId);
  children.forEach((doc) => {
    list.appendChild(buildNode(doc, level));
  });
  return list;
}

function buildNode(doc, level) {
  const li = document.createElement('li');
  li.className = 'doc-node';
  li.dataset.id = doc.id;
  li.appendChild(createRow(doc));

  const childList = buildList(doc.id, level + 1);
  if (!readOnly || childList.children.length > 0) {
    li.appendChild(childList);
  }
  return li;
}

function createRow(doc) {
  const row = document.createElement('div');
  row.className = 'doc-row';
  row.dataset.id = doc.id;

  if (!readOnly) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragend', handleDragEnd);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
  }

  if (!readOnly) {
    const handle = document.createElement('span');
    handle.className = 'doc-handle';
    handle.textContent = '⋮⋮';
    handle.setAttribute('aria-hidden', 'true');
    row.appendChild(handle);
  }

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'doc-open';
  openBtn.draggable = false;
  openBtn.dataset.id = doc.id;
  openBtn.textContent = formatDocTitle(doc);
  openBtn.title = formatDocTitle(doc);
  openBtn.addEventListener('click', () => {
    if (doc.id !== currentDocId) {
      openDoc(doc.id).catch((err) => {
        console.error('Failed to open doc', err);
        setStatus('Failed to load doc');
      });
    }
  });
  row.appendChild(openBtn);

  if (!readOnly) {
    const actions = document.createElement('div');
    actions.className = 'doc-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'doc-action';
    renameBtn.draggable = false;
    renameBtn.title = 'Rename page';
    renameBtn.setAttribute('aria-label', 'Rename page');
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      renameDoc(doc.id);
    });
    actions.appendChild(renameBtn);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'doc-action';
    addBtn.draggable = false;
    addBtn.title = 'Add subpage';
    addBtn.setAttribute('aria-label', 'Add subpage');
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      addPage(doc.id);
    });
    actions.appendChild(addBtn);

    row.appendChild(actions);
  }

  if (doc.id === currentDocId) {
    row.classList.add('active');
    openBtn.classList.add('active');
  }

  return row;
}

function parseListResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

async function loadDocList() {
  const jobId = claims.jobId;
  if (!jobId) {
    renderList([]);
    return;
  }
  try {
    const resp = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/docs`, { headers: authHeaders() });
    if (!resp.ok) {
      throw new Error('Failed to list docs');
    }
    const payload = await resp.json().catch(() => []);
    const arr = parseListResponse(payload);
    renderList(arr);
  } catch (err) {
    console.warn('Doc list failed', err);
    renderList([]);
  }
}

function renderList(items) {
  if (Array.isArray(items)) {
    const filtered = items.filter((item) => item && item.id);
    const normalized = filtered.map((item, index) => normalizeDoc(item, index));
    const hasCurrent = currentDocId && normalized.some((doc) => doc.id === currentDocId);
    if (currentDocId && !hasCurrent) {
      normalized.unshift(normalizeDoc({ id: currentDocId, title: 'Current page', position: -1, folderId: null }, 0));
    }
    docs = normalized;
  }

  rebuildDocMap();
  clearDropIndicators();
  $list.innerHTML = '';
  const tree = buildList(null, 0);
  $list.appendChild(tree);

  if (!docs.length) {
    const empty = document.createElement('p');
    empty.className = 'doc-empty-state';
    empty.textContent = readOnly ? 'No pages available.' : 'No pages yet. Create one to get started.';
    $list.appendChild(empty);
  }

  setActiveDoc(currentDocId);
}

async function renameDoc(id) {
  if (readOnly) return;
  const doc = docMap.get(id);
  const currentTitle = doc ? doc.title : '';
  const next = window.prompt('Rename page', (currentTitle || '').trim() || 'Untitled page');
  if (next === null) return;
  const title = next.trim();
  if (!title) {
    window.alert('Title cannot be empty.');
    return;
  }
  try {
    await persistDoc(id, { title });
    renderList();
    if (currentDocId === id) {
      document.title = title;
    }
  } catch (err) {
    console.error('Failed to rename page', err);
    window.alert('Failed to rename page. Please try again.');
  }
}

function createDocId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `doc-${crypto.randomUUID()}`;
  }
  return `doc-${Math.random().toString(36).slice(2, 10)}`;
}

async function addPage(parentId = null) {
  if (readOnly) return;
  const defaultTitle = parentId ? 'New subpage' : 'New page';
  const input = window.prompt('Page title', defaultTitle);
  if (input === null) return;
  const title = input.trim() || defaultTitle;
  const id = createDocId();
  const position = computeNextPosition(parentId);
  const payload = { title, position };
  if (parentId) {
    payload.folderId = parentId;
  }
  try {
    await persistDoc(id, payload);
    currentDocId = id;
    renderList();
    await openDoc(id);
  } catch (err) {
    console.error('Failed to create page', err);
    window.alert('Failed to create page. Please try again.');
  }
}

async function moveDocRelative(dragId, targetId, before) {
  if (!dragId || !targetId || dragId === targetId) return;
  const dragDoc = docMap.get(dragId);
  const targetDoc = docMap.get(targetId);
  if (!dragDoc || !targetDoc) return;

  const targetFolder = targetDoc.folderId ?? null;
  const oldFolder = dragDoc.folderId ?? null;

  const siblings = docs.filter((doc) => (doc.folderId ?? null) === targetFolder && doc.id !== dragId);
  const targetIndex = siblings.findIndex((doc) => doc.id === targetId);
  if (targetIndex === -1) return;
  const insertIndex = before ? targetIndex : targetIndex + 1;
  siblings.splice(insertIndex, 0, dragDoc);

  const beforeState = new Map();
  siblings.forEach((doc, index) => {
    captureState(beforeState, doc);
    doc.position = (index + 1) * 100;
    doc.folderId = targetFolder;
  });

  if (targetFolder !== oldFolder) {
    const oldSiblings = docs.filter((doc) => (doc.folderId ?? null) === oldFolder && doc.id !== dragId);
    oldSiblings.forEach((doc, index) => {
      captureState(beforeState, doc);
      doc.position = (index + 1) * 100;
      doc.folderId = oldFolder;
    });
  }

  renderList();
  try {
    await persistOrderChanges(beforeState);
  } catch (err) {
    console.error('Failed to reorder pages', err);
    window.alert('Failed to update page order. The list will be reloaded.');
    await loadDocList();
  }
}

async function moveDocToFolderEnd(dragId, folderId) {
  if (!dragId) return;
  const dragDoc = docMap.get(dragId);
  if (!dragDoc) return;
  const targetFolder = folderId ?? null;
  const oldFolder = dragDoc.folderId ?? null;

  const beforeState = new Map();
  const targetSiblings = docs.filter((doc) => (doc.folderId ?? null) === targetFolder && doc.id !== dragId);
  targetSiblings.push(dragDoc);
  targetSiblings.forEach((doc, index) => {
    captureState(beforeState, doc);
    doc.position = (index + 1) * 100;
    doc.folderId = targetFolder;
  });

  if (targetFolder !== oldFolder) {
    const oldSiblings = docs.filter((doc) => (doc.folderId ?? null) === oldFolder && doc.id !== dragId);
    oldSiblings.forEach((doc, index) => {
      captureState(beforeState, doc);
      doc.position = (index + 1) * 100;
      doc.folderId = oldFolder;
    });
  }

  renderList();
  try {
    await persistOrderChanges(beforeState);
  } catch (err) {
    console.error('Failed to reorder pages', err);
    window.alert('Failed to update page order. The list will be reloaded.');
    await loadDocList();
  }
}

function handleDragStart(event) {
  if (readOnly) return;
  const id = event.currentTarget.dataset.id;
  dragState.id = id;
  dragState.before = false;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
  event.currentTarget.classList.add('dragging');
}

function handleDragEnd(event) {
  if (readOnly) return;
  event.currentTarget.classList.remove('dragging');
  dragState.id = null;
  dragState.before = false;
  clearDropIndicators();
}

function handleDragOver(event) {
  if (readOnly || !dragState.id) return;
  const id = event.currentTarget.dataset.id;
  if (!id || id === dragState.id) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2;
  dragState.before = before;
  clearDropIndicators();
  event.currentTarget.classList.add(before ? 'drop-before' : 'drop-after');
  event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
  if (readOnly) return;
  event.currentTarget.classList.remove('drop-before', 'drop-after');
}

async function handleDrop(event) {
  if (readOnly || !dragState.id) return;
  event.preventDefault();
  event.stopPropagation();
  const targetId = event.currentTarget.dataset.id;
  const dragId = dragState.id;
  const before = dragState.before;
  dragState.id = null;
  dragState.before = false;
  clearDropIndicators();
  await moveDocRelative(dragId, targetId, before);
}

function handleListDragOver(event) {
  if (readOnly || !dragState.id) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drop-target');
  event.dataTransfer.dropEffect = 'move';
}

function handleListDragLeave(event) {
  if (readOnly) return;
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drop-target');
  }
}

async function handleListDrop(event) {
  if (readOnly || !dragState.id) return;
  event.preventDefault();
  event.stopPropagation();
  const folderId = event.currentTarget.dataset.folderId || null;
  const dragId = dragState.id;
  dragState.id = null;
  dragState.before = false;
  event.currentTarget.classList.remove('drop-target');
  clearDropIndicators();
  await moveDocToFolderEnd(dragId, folderId);
}

function setStatus(text) {
  if ($status) {
    $status.textContent = text;
  }
}

let editorReady = false;
let lastSavedHash = '';
let saveTimer = null;
let saving = false;

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
    const meta = docMap.get(currentDocId);
    const payload = {
      title: (meta && meta.title && meta.title.trim()) ? meta.title : document.title || 'OpenTrain autosave',
      htmlSnapshot: html,
    };
    if (meta && Number.isFinite(Number(meta.position))) {
      payload.position = Number(meta.position);
    }
    if (meta && meta.folderId !== null) {
      payload.folderId = meta.folderId;
    }
    await persistDoc(currentDocId, payload);
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

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

async function openDoc(docId) {
  currentDocId = docId;
  setActiveDoc(docId);
  const meta = docMap.get(docId);
  document.title = meta ? formatDocTitle(meta) : 'OpenTrain Editor';

  let html = '<p></p>';
  try {
    const resp = await fetch(`/api/docs/${encodeURIComponent(docId)}`, { headers: authHeaders() });
    if (resp.status === 404) {
      setStatus('New doc — start typing');
    } else if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      console.error('Failed to load doc', resp.status, msg);
      setStatus('Failed to load doc');
    } else {
      const doc = await resp.json().catch(() => null);
      if (doc && doc.htmlSnapshot) {
        html = doc.htmlSnapshot;
      }
      if (doc) {
        const changed = mergeDoc(doc);
        if (changed) {
          renderList();
        }
        if (doc.title) {
          document.title = doc.title;
        }
        setStatus('Saved');
      } else {
        setStatus('Ready');
      }
    }
  } catch (err) {
    console.error('Open doc error', err);
    setStatus('Ready');
  }

  const editor = getEditor();
  editor.commands.setContent(html, true);
  lastSavedHash = hashString(editor.getHTML());
  editorReady = true;
}

window.__editorShell = {
  async initAndLoad() {
    await loadDocList();
    if (!currentDocId) {
      const first = getChildren(null)[0];
      if (first) {
        currentDocId = first.id;
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

if ($addPage) {
  if (readOnly) {
    $addPage.disabled = true;
    $addPage.title = 'Read-only mode';
  } else {
    $addPage.addEventListener('click', () => addPage());
  }
}

window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    doSave().catch(() => {});
  }
});
