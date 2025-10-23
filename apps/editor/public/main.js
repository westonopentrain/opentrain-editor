import { Editor, Extension } from 'https://esm.sh/@tiptap/core@2.1.7?bundle';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.1.7?bundle';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.1.7?bundle';
import Heading from 'https://esm.sh/@tiptap/extension-heading@2.1.7?bundle';
import BulletList from 'https://esm.sh/@tiptap/extension-bullet-list@2.1.7?bundle';
import OrderedList from 'https://esm.sh/@tiptap/extension-ordered-list@2.1.7?bundle';
import TaskList from 'https://esm.sh/@tiptap/extension-task-list@2.1.7?bundle';
import TaskItem from 'https://esm.sh/@tiptap/extension-task-item@2.1.7?bundle';
import HorizontalRule from 'https://esm.sh/@tiptap/extension-horizontal-rule@2.1.7?bundle';
import Link from 'https://esm.sh/@tiptap/extension-link@2.1.7?bundle';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.1.7?bundle';
import Image from 'https://esm.sh/@tiptap/extension-image@2.1.7?bundle';
import Table from 'https://esm.sh/@tiptap/extension-table@2.1.7?bundle';
import TableRow from 'https://esm.sh/@tiptap/extension-table-row@2.1.7?bundle';
import TableHeader from 'https://esm.sh/@tiptap/extension-table-header@2.1.7?bundle';
import TableCell from 'https://esm.sh/@tiptap/extension-table-cell@2.1.7?bundle';
import Dropcursor from 'https://esm.sh/@tiptap/extension-dropcursor@2.1.7?bundle';
import Gapcursor from 'https://esm.sh/@tiptap/extension-gapcursor@2.1.7?bundle';
import { Plugin } from 'https://esm.sh/prosemirror-state@1.4.3';
import SlashMenu from './js/slash-menu.js';
import { createMenus } from './js/menus.js';

const iconSpriteTarget = document.createElement('div');
iconSpriteTarget.hidden = true;
fetch('icons.svg')
  .then((res) => res.text())
  .then((svg) => {
    iconSpriteTarget.innerHTML = svg;
    document.body.prepend(iconSpriteTarget);
  })
  .catch((err) => {
    console.warn('Failed to load icons.svg', err);
  });

const editorElement = document.getElementById('editor');
const imageInput = document.getElementById('image-input');
const menusHost = document.getElementById('menus');

if (!editorElement) {
  throw new Error('Editor element not found');
}

const createId = () => 'node-' + Math.random().toString(36).slice(2, 10);

const UniqueId = Extension.create({
  name: 'uniqueId',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          id: {
            default: null,
            rendered: true,
            parseHTML: (element) => element.getAttribute('id'),
            renderHTML: (attributes) => (attributes.id ? { id: attributes.id } : {}),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.length) return null;
          let tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (['heading', 'paragraph'].includes(node.type.name) && !node.attrs.id) {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: createId() });
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});

const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
};

const debouncedChange = debounce(() => {
  postChange();
}, 1500);

const menus = createMenus();
if (menusHost) {
  menusHost.append(menus.bubble.element, menus.floating.element);
}

let menuBinding = null;
let interactionsEnabled = !detectInitialReadOnly();
let editorInstance = null;

const editor = new Editor({
  element: editorElement,
  autofocus: true,
  extensions: [
    StarterKit.configure({
      history: true,
      heading: false,
      bulletList: false,
      orderedList: false,
      horizontalRule: false,
    }),
    Placeholder.configure({ placeholder: 'Type ‘/’ for commands…' }),
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList,
    OrderedList,
    TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
    TaskItem.configure({ nested: true }),
    HorizontalRule,
    Link.configure({
      openOnClick: false,
      autolink: true,
      validate: (href) => /^https?:\/\//i.test(href),
    }),
    Underline,
    Image.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Dropcursor.configure({ color: '#2563eb', width: 2 }),
    Gapcursor,
    SlashMenu.configure({ isEnabled: () => interactionsEnabled && editorInstance?.isEditable !== false }),
    menus.bubble.extension,
    menus.floating.extension,
    UniqueId,
  ],
  content: '<p></p>',
  onCreate() {
    postReady();
  },
  onSelectionUpdate() {
    postSelection();
    menuBinding?.update();
  },
  onUpdate() {
    debouncedChange();
    menuBinding?.update();
    if (window.__editorShell && typeof window.__editorShell.onEditorUpdate === 'function') {
      window.__editorShell.onEditorUpdate();
    }
  },
});

editorInstance = editor;

menuBinding = menus.bind(editor);
syncMenuAvailability();

const nativeSetEditable = editor.setEditable.bind(editor);
editor.setEditable = function setEditableProxy(value, emitUpdate = true) {
  const result = nativeSetEditable(value, emitUpdate);
  syncMenuAvailability();
  return result;
};

if (!interactionsEnabled) {
  editor.setEditable(false);
}


window.editor = editor;

if (window.__editorShell && typeof window.__editorShell.initAndLoad === 'function') {
  Promise.resolve()
    .then(() => window.__editorShell.initAndLoad())
    .catch((err) => console.error('Editor shell init failed', err));
}

if (typeof window._openTrainWireEditor === 'function') {
  window._openTrainWireEditor(editor);
  console.debug('[OpenTrain child/main] bridge wired');
} else {
  console.warn('[OpenTrain child/main] bridge function not found on window');
}

if (imageInput) {
  imageInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const src = await uploadImage(file);
    editor.chain().focus().setImage({ src }).run();
  });
}

editorElement.addEventListener('paste', handlePasteOrDrop);
editorElement.addEventListener('drop', handlePasteOrDrop);

window.addEventListener('message', (event) => {
  const msg = event.data || {};
  console.debug('[OpenTrain child/main.js] ← parent:', msg);
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'load': {
      if (typeof msg.readOnly === 'boolean') {
        interactionsEnabled = !msg.readOnly;
        editor.setEditable(!msg.readOnly);
        syncMenuAvailability();
      }
      if (msg.json) {
        editor.commands.setContent(msg.json);
      } else if (msg.html) {
        editor.commands.setContent(msg.html, true);
      }
      const used = msg.html ? 'html' : (msg.json ? 'json' : 'none');
      const htmlLen = typeof msg.html === 'string' ? msg.html.length : 0;
      console.debug('[OpenTrain child/main.js] ← parent: load', {
        used,
        htmlLen,
      });
      break;
    }
    case 'insertImage':
      if (msg.src) {
        editor.chain().focus().setImage({ src: msg.src }).run();
      }
      break;
    case 'insertContent':
      if (typeof msg.jsonOrHtml === 'string') {
        editor.chain().focus().insertContent(msg.jsonOrHtml).run();
      } else if (msg.jsonOrHtml) {
        editor.chain().focus().insertContent(msg.jsonOrHtml).run();
      }
      break;
    case 'scrollToAnchor':
      if (msg.id) {
        const target = editorElement.querySelector(`#${CSS.escape(msg.id)}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      break;
    case 'applyPatch': {
      const payload = msg.jsonOrHtml;
      if (!payload) break;
      editor.chain().focus().insertContent(payload).run();
      console.info('applyPatch received - TODO: target nodes by stable id');
      break;
    }
    default:
      break;
  }
});

const url = new URL(window.location.href);
const initialJson = url.searchParams.get('json');
if (initialJson) {
  try {
    editor.commands.setContent(JSON.parse(initialJson));
  } catch (error) {
    console.warn('Failed to parse initial json param', error);
  }
}

function detectInitialReadOnly() {
  try {
    if (typeof window.__EDITOR_READ_ONLY === 'boolean') {
      return window.__EDITOR_READ_ONLY;
    }
    const token = new URL(window.location.href).searchParams.get('token');
    if (!token) return false;
    const [, payload] = token.split('.');
    if (!payload) return false;
    const decoded = JSON.parse(atob(payload));
    return String(decoded?.perms || '').toLowerCase() === 'ro';
  } catch (err) {
    return false;
  }
}

function syncMenuAvailability() {
  const allow = interactionsEnabled && editor.isEditable;
  menus.setEnabled(allow);
  menuBinding?.update();
}

async function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handlePasteOrDrop(event) {
  const items = event.clipboardData?.items || event.dataTransfer?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        uploadImage(file).then((src) => editor.chain().focus().setImage({ src }).run());
      }
    }
  }
}

function postChange() {
  const json = editor.getJSON();
  const html = editor.getHTML();
  console.debug('[OpenTrain child/main] → parent: change', { htmlLen: html.length });
  window.parent?.postMessage({ type: 'change', json, html }, '*');
}

function postReady() {
  console.debug('[OpenTrain child/main] → parent: ready');
  window.parent?.postMessage({ type: 'ready' }, '*');
}

function postSelection() {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, ' ');
  window.parent?.postMessage({ type: 'selection', selectedText, from, to }, '*');
}
