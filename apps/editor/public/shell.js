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
const canonicalRootCandidate = claims.folderId
  ? `instructions-folder-${claims.folderId}`
  : (claims.jobId ? `instructions-${claims.jobId}` : null);
let rootId = null;
let docs = [];
const docMap = new Map();
const dragState = { id: null, before: false };
const expandedMainDocs = new Set();
const iconPickerState = {
  panel: null,
  docId: null,
  anchor: null,
  input: null,
  outsideHandler: null,
  keydownHandler: null,
  scrollHandler: null,
};
const EMOJI_CHOICES = [
  '📄',
  '📝',
  '📘',
  '📚',
  '✅',
  '🧠',
  '💡',
  '⭐️',
  '🔥',
  '🚀',
  '🎯',
  '🗂️',
  '📆',
  '🧩',
  '🔖',
  '📌',
  '💬',
  '🛠️',
  '⚙️',
  '🧪',
  '🗒️',
  '📈',
  '🛡️',
  '☑️',
  '🧭',
  '🌟',
  '🏁',
  '📥',
  '📤',
  '📦',
  '🪄',
  '💭',
  '🔍',
  '⏱️',
  '🌐',
  '💼',
];
const DEFAULT_DOC_ICON = 'description';
const MAX_ICON_CODEPOINTS = 2;

function createMaterialIcon(name, options = {}) {
  const span = document.createElement('span');
  span.className = 'material-symbols-outlined';
  span.textContent = name;
  span.setAttribute('aria-hidden', 'true');
  if (options.filled) {
    span.classList.add('material-icon-filled');
  }
  if (typeof options.size === 'number') {
    span.style.fontSize = `${options.size}px`;
  }
  return span;
}

function normalizeIconValue(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Array.from(trimmed).slice(0, MAX_ICON_CODEPOINTS).join('');
}

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
    icon: typeof input?.icon === 'string' ? (input.icon.trim() || null) : null,
    createdAt: input?.createdAt ?? null,
    updatedAt: input?.updatedAt ?? null,
  };
}

function rebuildDocMap() {
  docMap.clear();
  const byId = new Map();
  docs.forEach((doc, index) => {
    doc.folderId = typeof doc.folderId === 'string' && doc.folderId.trim() ? doc.folderId : null;
    doc.position = Number.isFinite(Number(doc.position)) ? Number(doc.position) : (index + 1) * 100;
    byId.set(doc.id, doc);
    docMap.set(doc.id, doc);
  });

  docs.forEach((doc) => {
    const folderId = doc.folderId;
    if (!folderId) return;
    if (folderId === doc.id) {
      doc.folderId = null;
      return;
    }
    const parent = byId.get(folderId);
    if (!parent || (parent.folderId && parent.folderId !== null)) {
      doc.folderId = null;
    }
  });
}

function isDescendant(potentialDescendantId, ancestorId) {
  if (!potentialDescendantId || !ancestorId || potentialDescendantId === ancestorId) return false;
  const visited = new Set();
  let current = docMap.get(potentialDescendantId);
  while (current && current.folderId) {
    if (current.folderId === ancestorId) return true;
    if (visited.has(current.folderId)) break;
    visited.add(current.folderId);
    current = docMap.get(current.folderId);
  }
  return false;
}

function collectDescendantIds(rootId) {
  const ids = new Set();
  if (!rootId) return ids;
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    if (ids.has(current)) continue;
    ids.add(current);
    docs.forEach((doc) => {
      if ((doc.folderId ?? null) === current) {
        stack.push(doc.id);
      }
    });
  }
  return ids;
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
  if (Object.prototype.hasOwnProperty.call(updates, 'icon')) body.icon = updates.icon;

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
  list.dataset.level = String(level);
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
  li.dataset.level = String(level);
  const isRootDoc = Boolean(rootId) && doc.id === rootId;
  const hasChildren = level < 1 && getChildren(doc.id).length > 0;
  const expanded = level === 0 ? (isRootDoc ? true : expandedMainDocs.has(doc.id)) : true;
  const childListId = `doc-children-${doc.id}`;
  li.appendChild(createRow(doc, level, { hasChildren, expanded, isRootDoc, childListId }));

  if (level < 1) {
    const childList = buildList(doc.id, level + 1);
    if (!readOnly || childList.children.length > 0) {
      if (level === 0) {
        childList.id = childListId;
        if (!isRootDoc && hasChildren) {
          childList.classList.toggle('doc-children-collapsed', !expanded);
        }
      }
      li.appendChild(childList);
    }
  }
  return li;
}

function createRow(doc, level, options = {}) {
  const row = document.createElement('div');
  row.className = 'doc-row';
  row.dataset.id = doc.id;
  row.dataset.level = String(level);
  const isRootDoc = typeof options.isRootDoc === 'boolean' ? options.isRootDoc : (Boolean(rootId) && doc.id === rootId);
  const hasChildren = Boolean(options.hasChildren);
  const expanded = Boolean(options.expanded);
  const childListId = options.childListId || '';
  if (level === 0) {
    row.classList.add('doc-row-root');
  } else {
    row.classList.add('doc-row-child');
  }

  const rowMain = document.createElement('div');
  rowMain.className = 'doc-row-main';
  row.appendChild(rowMain);

  if (!readOnly && !isRootDoc) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragend', handleDragEnd);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
  }

  const showToggle = level === 0 && hasChildren && !isRootDoc;
  if (showToggle) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'doc-toggle';
    toggleBtn.dataset.id = doc.id;
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', expanded ? 'Collapse subpages' : 'Expand subpages');
    if (childListId) {
      toggleBtn.setAttribute('aria-controls', childListId);
    }
    toggleBtn.appendChild(createMaterialIcon(expanded ? 'expand_more' : 'chevron_right'));
    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (expandedMainDocs.has(doc.id)) {
        expandedMainDocs.delete(doc.id);
      } else {
        expandedMainDocs.add(doc.id);
      }
      renderList();
    });
    rowMain.appendChild(toggleBtn);
  }

  let hasHandle = false;
  if (!readOnly && !isRootDoc) {
    const handle = document.createElement('span');
    handle.className = 'doc-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.appendChild(createMaterialIcon('drag_indicator'));
    rowMain.appendChild(handle);
    hasHandle = true;
  }

  if (!hasHandle) {
    const placeholder = document.createElement('span');
    placeholder.className = 'doc-handle doc-handle-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    rowMain.appendChild(placeholder);
  }

  const iconButton = document.createElement('button');
  iconButton.type = 'button';
  iconButton.className = 'doc-icon-button';
  iconButton.dataset.id = doc.id;
  iconButton.draggable = false;
  const titleText = formatDocTitle(doc);
  const iconValue = typeof doc.icon === 'string' ? doc.icon.trim() : '';
  if (iconValue) {
    iconButton.textContent = iconValue;
  } else {
    iconButton.classList.add('doc-icon-empty');
    iconButton.appendChild(createMaterialIcon(DEFAULT_DOC_ICON));
  }
  const iconLabel = iconValue ? `Change icon for ${titleText}` : `Add icon for ${titleText}`;
  iconButton.title = iconLabel;
  iconButton.setAttribute('aria-label', iconLabel);
  if (readOnly) {
    iconButton.disabled = true;
    iconButton.setAttribute('aria-disabled', 'true');
  } else {
    iconButton.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      openIconPicker(doc.id, iconButton);
    });
  }
  rowMain.appendChild(iconButton);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'doc-open';
  openBtn.draggable = false;
  openBtn.dataset.id = doc.id;
  openBtn.textContent = titleText;
  openBtn.title = titleText;
  openBtn.addEventListener('click', () => {
    if (doc.id !== currentDocId) {
      openDoc(doc.id).catch((err) => {
        console.error('Failed to open doc', err);
        setStatus('Failed to load doc');
      });
    }
  });
  rowMain.appendChild(openBtn);

  if (!readOnly) {
    const actions = document.createElement('div');
    actions.className = 'doc-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'doc-action doc-action-rename';
    renameBtn.draggable = false;
    renameBtn.title = 'Rename page';
    renameBtn.setAttribute('aria-label', 'Rename page');
    renameBtn.appendChild(createMaterialIcon('edit'));
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      renameDoc(doc.id);
    });
    actions.appendChild(renameBtn);

    if (level === 0) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'doc-action';
      addBtn.draggable = false;
      addBtn.title = 'Add subpage';
      addBtn.setAttribute('aria-label', 'Add subpage');
      addBtn.appendChild(createMaterialIcon('add'));
      addBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        addPage(doc.id);
      });
      actions.appendChild(addBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'doc-action doc-action-delete';
    deleteBtn.draggable = false;
    deleteBtn.appendChild(createMaterialIcon('delete'));
    if (isRootDoc) {
      deleteBtn.disabled = true;
      deleteBtn.title = 'Root instructions cannot be deleted';
      deleteBtn.setAttribute('aria-disabled', 'true');
      deleteBtn.classList.add('doc-action-disabled');
    } else {
      deleteBtn.title = 'Delete page';
      deleteBtn.setAttribute('aria-label', 'Delete page');
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        deleteDoc(doc.id);
      });
    }
    actions.appendChild(deleteBtn);

    rowMain.appendChild(actions);
  }

  if (doc.id === currentDocId) {
    row.classList.add('active');
    openBtn.classList.add('active');
  }

  return row;
}

function pruneExpandedMainDocs() {
  if (!expandedMainDocs.size) return;
  const existing = new Set(docs.map((doc) => doc.id));
  expandedMainDocs.forEach((id) => {
    if (!existing.has(id) || getChildren(id).length === 0) {
      expandedMainDocs.delete(id);
    }
  });
}

function ensureAncestorsExpanded(docId) {
  if (!docId) return;
  let current = docMap.get(docId);
  const visited = new Set();
  while (current && current.folderId) {
    if (visited.has(current.folderId)) break;
    visited.add(current.folderId);
    const parent = docMap.get(current.folderId);
    if (!parent) break;
    expandedMainDocs.add(parent.id);
    current = parent;
  }
}

function closeIconPicker() {
  if (!iconPickerState.panel) return;
  if (iconPickerState.outsideHandler) {
    document.removeEventListener('mousedown', iconPickerState.outsideHandler, true);
  }
  if (iconPickerState.keydownHandler) {
    document.removeEventListener('keydown', iconPickerState.keydownHandler, true);
  }
  if (iconPickerState.scrollHandler) {
    window.removeEventListener('scroll', iconPickerState.scrollHandler, true);
  }
  window.removeEventListener('resize', closeIconPicker);
  iconPickerState.panel.remove();
  iconPickerState.panel = null;
  iconPickerState.docId = null;
  iconPickerState.anchor = null;
  iconPickerState.input = null;
  iconPickerState.outsideHandler = null;
  iconPickerState.keydownHandler = null;
  iconPickerState.scrollHandler = null;
}

function applyIconFromInput(docId, input) {
  if (!input) return;
  const normalized = normalizeIconValue(input.value);
  if (typeof normalized === 'undefined') return;
  if (!normalized) {
    setDocIcon(docId, null);
  } else {
    setDocIcon(docId, normalized);
  }
}

async function setDocIcon(docId, value) {
  if (readOnly || !docId) return;
  const normalized = value === null ? null : normalizeIconValue(value);
  if (typeof normalized === 'undefined') return;
  try {
    await persistDoc(docId, { icon: normalized });
    closeIconPicker();
    renderList();
  } catch (err) {
    console.error('Failed to update icon', err);
    window.alert('Failed to update icon. Please try again.');
  }
}

function openIconPicker(docId, anchor) {
  if (readOnly) return;
  const doc = docMap.get(docId);
  if (!doc || !anchor) return;
  closeIconPicker();

  const panel = document.createElement('div');
  panel.className = 'icon-picker';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', `Select icon for ${formatDocTitle(doc)}`);

  const title = document.createElement('p');
  title.className = 'icon-picker-title';
  title.textContent = 'Select an icon';
  panel.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'icon-picker-grid';
  EMOJI_CHOICES.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-emoji';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      setDocIcon(docId, emoji);
    });
    grid.appendChild(btn);
  });
  panel.appendChild(grid);

  const inputRow = document.createElement('div');
  inputRow.className = 'icon-picker-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'icon-picker-input';
  input.placeholder = 'Paste emoji…';
  input.maxLength = 8;
  if (typeof doc.icon === 'string') {
    input.value = doc.icon;
  }
  inputRow.appendChild(input);

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'icon-picker-apply';
  applyBtn.textContent = 'Set';
  applyBtn.addEventListener('click', () => {
    applyIconFromInput(docId, input);
  });
  inputRow.appendChild(applyBtn);
  panel.appendChild(inputRow);

  const footer = document.createElement('div');
  footer.className = 'icon-picker-footer';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'icon-picker-clear';
  clearBtn.textContent = 'Remove icon';
  clearBtn.addEventListener('click', () => {
    setDocIcon(docId, null);
  });
  footer.appendChild(clearBtn);

  const hint = document.createElement('span');
  hint.className = 'icon-picker-hint';
  hint.textContent = 'Esc to close';
  footer.appendChild(hint);

  panel.appendChild(footer);
  document.body.appendChild(panel);

  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  let top = window.scrollY + anchorRect.bottom + 8;
  let left = window.scrollX + anchorRect.left + anchorRect.width / 2 - panelRect.width / 2;
  const minLeft = window.scrollX + 16;
  const maxLeft = window.scrollX + viewportWidth - panelRect.width - 16;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = Math.max(maxLeft, minLeft);
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;

  iconPickerState.panel = panel;
  iconPickerState.docId = docId;
  iconPickerState.anchor = anchor;
  iconPickerState.input = input;

  const outsideHandler = (event) => {
    if (!iconPickerState.panel) return;
    if (iconPickerState.panel.contains(event.target)) return;
    if (iconPickerState.anchor && iconPickerState.anchor.contains(event.target)) return;
    closeIconPicker();
  };
  const keydownHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeIconPicker();
      return;
    }
    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      applyIconFromInput(docId, input);
    }
  };
  const scrollHandler = () => {
    closeIconPicker();
  };

  document.addEventListener('mousedown', outsideHandler, true);
  document.addEventListener('keydown', keydownHandler, true);
  window.addEventListener('resize', closeIconPicker);
  window.addEventListener('scroll', scrollHandler, true);

  iconPickerState.outsideHandler = outsideHandler;
  iconPickerState.keydownHandler = keydownHandler;
  iconPickerState.scrollHandler = scrollHandler;

  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function parseListResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

async function ensureRoot() {
  if (rootId) {
    return rootId;
  }
  const resp = await fetch('/api/scope/ensure-root', {
    method: 'POST',
    headers: authHeaders(),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(payload?.error || 'ensure-root failed');
  }
  if (payload && payload.rootId) {
    rootId = payload.rootId;
  }
  return rootId;
}

function collectDocsUnderRoot(arr) {
  if (!Array.isArray(arr)) return [];
  const byId = new Map();
  arr.forEach((doc) => {
    if (doc && doc.id) {
      byId.set(doc.id, doc);
    }
  });

  if (!rootId) {
    if (canonicalRootCandidate && byId.has(canonicalRootCandidate)) {
      rootId = canonicalRootCandidate;
    } else {
      let fallbackRoot = arr.find((doc) => {
        if (!doc || !doc.id) return false;
        const isTopLevel = (doc.folderId ?? null) === null;
        if (!isTopLevel) return false;
        const title = typeof doc.title === 'string' ? doc.title.trim() : '';
        return title === 'Instructions' || title === 'Root';
      });
      if (!fallbackRoot) {
        fallbackRoot = arr.find((doc) => doc && doc.id && (doc.folderId ?? null) === null);
      }
      if (fallbackRoot) {
        rootId = fallbackRoot.id;
      }
    }
  } else if (canonicalRootCandidate && byId.has(canonicalRootCandidate) && rootId !== canonicalRootCandidate) {
    rootId = canonicalRootCandidate;
  } else if (!byId.has(rootId)) {
    rootId = null;
  }

  if (!rootId || !byId.has(rootId)) {
    return arr.filter((doc) => doc && doc.id);
  }

  const allowed = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    arr.forEach((doc) => {
      if (!doc || !doc.id) return;
      const folderId = typeof doc.folderId === 'string' ? doc.folderId : null;
      if (folderId === current && !allowed.has(doc.id)) {
        allowed.add(doc.id);
        stack.push(doc.id);
      }
    });
  }

  const filtered = arr.filter((doc) => doc && doc.id && allowed.has(doc.id));
  filtered.sort((a, b) => {
    if (!a || !b) return 0;
    if (a.id === rootId && b.id !== rootId) return -1;
    if (b.id === rootId && a.id !== rootId) return 1;
    const posA = Number.isFinite(Number(a.position)) ? Number(a.position) : 0;
    const posB = Number.isFinite(Number(b.position)) ? Number(b.position) : 0;
    if (posA !== posB) return posA - posB;
    const titleA = typeof a.title === 'string' ? a.title : '';
    const titleB = typeof b.title === 'string' ? b.title : '';
    return titleA.localeCompare(titleB);
  });
  return filtered;
}

async function loadDocList() {
  try {
    const resp = await fetch('/api/scope/docs', { headers: authHeaders() });
    if (!resp.ok) {
      throw new Error('Failed to list docs');
    }
    const payload = await resp.json().catch(() => []);
    const arr = parseListResponse(payload);
    const scoped = collectDocsUnderRoot(arr);
    renderList(scoped);
  } catch (err) {
    console.warn('Doc list failed', err);
    renderList([]);
  }
}

function renderList(items) {
  const previousScrollTop = $list ? $list.scrollTop : 0;
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
  pruneExpandedMainDocs();
  ensureAncestorsExpanded(currentDocId);
  closeIconPicker();
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
  if (Number.isFinite(previousScrollTop)) {
    $list.scrollTop = previousScrollTop;
  }
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

  const isTopLevel = !parentId;
  let targetParentId = parentId;

  if (isTopLevel) {
    try {
      await ensureRoot();
    } catch (err) {
      console.error('Failed to ensure root page', err);
      window.alert('Unable to prepare instructions root. Please try again.');
      return;
    }
    if (!rootId) {
      window.alert('Unable to determine root page.');
      return;
    }
    targetParentId = rootId;
  } else {
    const parent = docMap.get(parentId);
    if (!parent || (parent.folderId && parent.folderId !== null)) {
      window.alert('Subpages can only be added to main pages.');
      return;
    }
  }

  const defaultTitle = parentId ? 'New subpage' : 'New page';
  const input = window.prompt('Page title', defaultTitle);
  if (input === null) return;
  const title = input.trim() || defaultTitle;

  if (isTopLevel) {
    try {
      const resp = await fetch('/api/scope/pages', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, rootId }),
      });
      if (!resp.ok) {
        const msg = await resp.text().catch(() => '');
        throw new Error(msg || 'Failed to create page');
      }
      const created = await resp.json().catch(() => null);
      if (created && created.id) {
        mergeDoc(created);
        currentDocId = created.id;
        renderList();
        await openDoc(created.id);
      } else {
        await loadDocList();
      }
    } catch (err) {
      console.error('Failed to create page', err);
      window.alert('Failed to create page. Please try again.');
    }
    return;
  }

  const id = createDocId();
  const position = computeNextPosition(targetParentId);
  const payload = { title, position };
  if (targetParentId) {
    payload.folderId = targetParentId;
  }
  try {
    await persistDoc(id, payload);
    if (targetParentId) {
      expandedMainDocs.add(targetParentId);
    }
    currentDocId = id;
    renderList();
    await openDoc(id);
  } catch (err) {
    console.error('Failed to create page', err);
    window.alert('Failed to create page. Please try again.');
  }
}

async function deleteDoc(id) {
  if (readOnly) return;
  const doc = docMap.get(id);
  if (!doc) return;
  if (rootId && id === rootId) {
    window.alert('Root instructions cannot be deleted.');
    return;
  }
  const descendantIds = collectDescendantIds(id);
  const hasChildren = Array.from(descendantIds).some((docId) => docId !== id);
  const message = hasChildren
    ? 'Delete this page and its subpages? This cannot be undone.'
    : 'Delete this page? This cannot be undone.';
  const confirmed = window.confirm(message);
  if (!confirmed) return;

  const previousCurrent = currentDocId;
  const removedCurrent = descendantIds.has(currentDocId);
  if (removedCurrent) {
    currentDocId = null;
  }

  try {
    const resp = await fetch(`/api/docs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (resp.status === 404) {
      console.warn('Delete page: already removed', id);
    } else if (!resp.ok) {
      const text = await resp.text().catch(() => 'Failed to delete page');
      throw new Error(text || 'Failed to delete page');
    } else {
      await resp.json().catch(() => null);
    }

    await loadDocList();

    if (removedCurrent || !currentDocId || !docMap.has(currentDocId)) {
      currentDocId = null;
      const next = getChildren(null)[0] || docs[0] || null;
      if (next) {
        await openDoc(next.id);
      } else {
        const editor = getEditor();
        editor.commands.setContent('<p></p>', true);
        document.title = 'OpenTrain Editor';
        editorReady = true;
        lastSavedHash = hashString(editor.getHTML());
        setStatus(readOnly ? 'Ready' : 'New doc — start typing');
      }
    } else {
      setActiveDoc(currentDocId);
    }
  } catch (err) {
    console.error('Failed to delete page', err);
    window.alert('Failed to delete page. Please try again.');
    if (removedCurrent && previousCurrent) {
      currentDocId = previousCurrent;
    }
    await loadDocList();
    if (currentDocId) {
      setActiveDoc(currentDocId);
    }
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
  if (folderId && folderId === dragId) return;
  const dragDoc = docMap.get(dragId);
  if (!dragDoc) return;
  const targetFolder = folderId ?? null;
  if (targetFolder) {
    const folderDoc = docMap.get(targetFolder);
    if (!folderDoc || (folderDoc.folderId && folderDoc.folderId !== null)) {
      return;
    }
    if (isDescendant(targetFolder, dragId)) {
      return;
    }
  }
  if (targetFolder) {
    expandedMainDocs.add(targetFolder);
  }
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
  const level = Number(event.currentTarget.dataset.level || '0');
  if (Number.isFinite(level) && level >= 2) return;
  const folderId = event.currentTarget.dataset.folderId || null;
  if (!folderId && rootId && dragState.id !== rootId) {
    return;
  }
  if (folderId) {
    if (folderId === dragState.id) return;
    const folderDoc = docMap.get(folderId);
    if (!folderDoc || (folderDoc.folderId && folderDoc.folderId !== null)) return;
    if (isDescendant(folderId, dragState.id)) return;
  }
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
  const level = Number(event.currentTarget.dataset.level || '0');
  if (Number.isFinite(level) && level >= 2) return;
  const folderId = event.currentTarget.dataset.folderId || null;
  if (!folderId && rootId && dragState.id !== rootId) {
    event.currentTarget.classList.remove('drop-target');
    return;
  }
  if (folderId) {
    if (folderId === dragState.id) {
      event.currentTarget.classList.remove('drop-target');
      return;
    }
    const folderDoc = docMap.get(folderId);
    if (!folderDoc || (folderDoc.folderId && folderDoc.folderId !== null) || isDescendant(folderId, dragState.id)) {
      event.currentTarget.classList.remove('drop-target');
      return;
    }
  }
  event.preventDefault();
  event.stopPropagation();
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
  const expandedBefore = expandedMainDocs.size;
  ensureAncestorsExpanded(docId);
  if (expandedMainDocs.size !== expandedBefore) {
    renderList();
  } else {
    setActiveDoc(docId);
  }
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
    if (claims.perms === 'rw') {
      try {
        await ensureRoot();
      } catch (err) {
        console.error('Failed to ensure instructions root', err);
        setStatus('Unable to prepare instructions root');
      }
    }
    await loadDocList();
    if (!currentDocId) {
      if (rootId && docMap.has(rootId)) {
        currentDocId = rootId;
      } else {
        const first = getChildren(null)[0];
        if (first) {
          currentDocId = first.id;
        }
      }
    }
    if (!currentDocId) {
      const editor = getEditor();
      editor.commands.setContent('<p></p>', true);
      document.title = 'OpenTrain Editor';
      editorReady = true;
      setStatus(readOnly ? 'Ready' : 'New doc — start typing');
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
    $addPage.style.display = 'none';
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
