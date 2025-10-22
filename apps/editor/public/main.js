import { Editor, Extension } from 'https://esm.sh/@tiptap/core@2.1.7?bundle';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.1.7?bundle';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.1.7?bundle';
import CharacterCount from 'https://esm.sh/@tiptap/extension-character-count@2.1.7?bundle';
import TextAlign from 'https://esm.sh/@tiptap/extension-text-align@2.1.7?bundle';
import TextStyle from 'https://esm.sh/@tiptap/extension-text-style@2.1.7?bundle';
import FontFamily from 'https://esm.sh/@tiptap/extension-font-family@2.1.7?bundle';
import Color from 'https://esm.sh/@tiptap/extension-color@2.1.7?bundle';
import Highlight from 'https://esm.sh/@tiptap/extension-highlight@2.1.7?bundle';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.1.7?bundle';
import Link from 'https://esm.sh/@tiptap/extension-link@2.1.7?bundle';
import Subscript from 'https://esm.sh/@tiptap/extension-subscript@2.1.7?bundle';
import Superscript from 'https://esm.sh/@tiptap/extension-superscript@2.1.7?bundle';
import Image from 'https://esm.sh/@tiptap/extension-image@2.1.7?bundle';
import Table from 'https://esm.sh/@tiptap/extension-table@2.1.7?bundle';
import TableRow from 'https://esm.sh/@tiptap/extension-table-row@2.1.7?bundle';
import TableCell from 'https://esm.sh/@tiptap/extension-table-cell@2.1.7?bundle';
import TableHeader from 'https://esm.sh/@tiptap/extension-table-header@2.1.7?bundle';
import TaskList from 'https://esm.sh/@tiptap/extension-task-list@2.1.7?bundle';
import TaskItem from 'https://esm.sh/@tiptap/extension-task-item@2.1.7?bundle';
import Dropcursor from 'https://esm.sh/@tiptap/extension-dropcursor@2.1.7?bundle';
import Gapcursor from 'https://esm.sh/@tiptap/extension-gapcursor@2.1.7?bundle';
import HorizontalRule from 'https://esm.sh/@tiptap/extension-horizontal-rule@2.1.7?bundle';
import HardBreak from 'https://esm.sh/@tiptap/extension-hard-break@2.1.7?bundle';
import BubbleMenu from 'https://esm.sh/@tiptap/extension-bubble-menu@2.1.7?bundle';
import FloatingMenu from 'https://esm.sh/@tiptap/extension-floating-menu@2.1.7?bundle';
import Mention from 'https://esm.sh/@tiptap/extension-mention@2.1.7?bundle';
import Suggestion from 'https://esm.sh/@tiptap/suggestion@2.1.7?bundle';
import CodeBlockLowlight from 'https://esm.sh/@tiptap/extension-code-block-lowlight@2.1.7?bundle';
import { lowlight } from 'https://esm.sh/lowlight@2.9.0/lib/common.js';
import { Plugin } from 'https://esm.sh/prosemirror-state@1.4.3';

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
        appendTransaction: (transactions, oldState, newState) => {
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

const SlashCommand = Extension.create({
  name: 'slash-command',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: true,
        items: ({ query }) => {
          const list = [
            { title: 'Paragraph', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run() },
            { title: 'Heading 1', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run() },
            { title: 'Heading 2', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run() },
            { title: 'Bullet List', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
            { title: 'Ordered List', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
            { title: 'Task List', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
            { title: 'Horizontal Rule', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
            { title: 'Blockquote', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
          ];
          return list.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
        },
        render: () => {
          const menu = document.createElement('div');
          menu.className = 'tiptap__slash-menu';
          menu.setAttribute('role', 'listbox');

          return {
            onStart: (props) => {
              menu.innerHTML = '';
              props.items.forEach((item, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = item.title;
                button.dataset.index = String(index);
                button.setAttribute('role', 'option');
                button.addEventListener('mousedown', (event) => {
                  event.preventDefault();
                  item.command(props);
                });
                menu.append(button);
              });
              document.body.append(menu);
              const rect = props.clientRect && props.clientRect();
              const left = rect ? rect.left : 0;
              const top = rect ? rect.top : 0;
              Object.assign(menu.style, {
                position: 'absolute',
                left: `${left}px`,
                top: `${top + 20}px`,
              });
            },
            onUpdate: (props) => {
              menu.innerHTML = '';
              props.items.forEach((item, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = item.title;
                button.dataset.index = String(index);
                button.setAttribute('role', 'option');
                button.addEventListener('mousedown', (event) => {
                  event.preventDefault();
                  item.command(props);
                });
                menu.append(button);
              });
              const rect = props.clientRect && props.clientRect();
              const left = rect ? rect.left : 0;
              const top = rect ? rect.top : 0;
              Object.assign(menu.style, {
                position: 'absolute',
                left: `${left}px`,
                top: `${top + 20}px`,
              });
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                menu.remove();
                return true;
              }
              return false;
            },
            onExit: () => {
              menu.remove();
            },
          };
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({ editor: this.editor, ...this.options.suggestion }),
    ];
  },
});

const mentionItems = [
  { id: 'alice', label: 'Alice Example' },
  { id: 'bob', label: 'Bob Trainer' },
  { id: 'carla', label: 'Carla Coach' },
  { id: 'dmitri', label: 'Dmitri Editor' },
];

const mentionSuggestion = {
  items: ({ query }) => {
    return mentionItems
      .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  },
  render: () => {
    const root = document.createElement('div');
    root.className = 'tiptap__slash-menu';
    root.setAttribute('role', 'listbox');
    return {
      onStart: (props) => {
        renderMention(root, props);
      },
      onUpdate: (props) => {
        renderMention(root, props);
      },
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          root.remove();
          return true;
        }
        return false;
      },
      onExit: () => {
        root.remove();
      },
    };
  },
  command: ({ editor, range, props: item }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([{ type: 'mention', attrs: { id: item.id, label: item.label } }, { type: 'text', text: ' ' }])
      .run();
  },
};

function renderMention(root, props) {
  root.innerHTML = '';
  props.items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.dataset.index = String(index);
    button.setAttribute('role', 'option');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      props.command(item);
    });
    root.append(button);
  });
  document.body.append(root);
  const rect = props.clientRect();
  if (rect) {
    Object.assign(root.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
    });
  }
}

const bubbleMenuElement = document.createElement('div');
bubbleMenuElement.className = 'tiptap__bubble-menu';
bubbleMenuElement.innerHTML = `
  <button data-command="toggleBold" type="button">Bold</button>
  <button data-command="toggleItalic" type="button">Italic</button>
  <button data-command="toggleUnderline" type="button">Underline</button>
  <button data-command="toggleLink" type="button">Link</button>
`;

const floatingMenuElement = document.createElement('div');
floatingMenuElement.className = 'tiptap__floating-menu';
floatingMenuElement.innerHTML = `
  <button data-command="setHeading" data-level="2" type="button">H2</button>
  <button data-command="setHeading" data-level="3" type="button">H3</button>
  <button data-command="toggleBulletList" type="button">• List</button>
  <button data-command="setHorizontalRule" type="button">HR</button>
`;

const editorElement = document.getElementById('editor');
const imageInput = document.getElementById('image-input');
const toolbarButtons = Array.from(document.querySelectorAll('.toolbar button'));
const characterCount = document.getElementById('character-count');

const mentionExtension = Mention.configure({
  HTMLAttributes: { class: 'mention' },
  suggestion: mentionSuggestion,
});

const debouncedChange = debounce(() => {
  postChange();
}, 1500);

const editor = new Editor({
  element: editorElement,
  autofocus: true,
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      history: true,
      dropcursor: false,
      gapcursor: false,
      // ⬇️ prevent duplicates (we include explicit variants below)
      horizontalRule: false,
      hardBreak: false,
      codeBlock: false,
    }),
    Placeholder.configure({ placeholder: 'Write something brilliant…' }),
    CharacterCount.configure({ limit: 10000 }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    FontFamily,
    Color,
    Highlight,
    Underline,
    Subscript,
    Superscript,
    Link.configure({
      openOnClick: false,
      autolink: true,
      validate: (href) => /^https?:\/\//.test(href),
    }),
    Image.configure({ inline: false, allowBase64: true }),
    TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Dropcursor.configure({ color: '#2563eb', width: 2 }),
    Gapcursor,
    HorizontalRule,
    HardBreak,
    CodeBlockLowlight.configure({ lowlight }),
    // mentionExtension,        // ← temporarily disabled
    BubbleMenu.configure({ element: bubbleMenuElement }),
    FloatingMenu.configure({ element: floatingMenuElement }),
    // SlashCommand,            // ← temporarily disabled
    UniqueId,
  ],
  content: '',
  onCreate() {
    postReady();
    updateToolbarState();
    try { updateCharacterCount(); } catch (e) {}
  },
  onSelectionUpdate() {
    updateToolbarState();
    postSelection();
  },
  onUpdate() {
    try { updateCharacterCount(); } catch (e) {}
    debouncedChange();
  },
});

if (typeof window._openTrainWireEditor === 'function') {
  window._openTrainWireEditor(editor);
  console.log('[OpenTrain] Bridge wired');
} else {
  console.warn('[OpenTrain] Bridge function not found on window');
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

const postChange = () => {
  const json = editor.getJSON();
  const html = editor.getHTML();
  console.debug('[OpenTrain child/main.js] → parent: change', {
    htmlLen: html.length,
  });
  window.parent?.postMessage({ type: 'change', json, html }, '*'); // TODO: restrict origin to Bubble domains.
};

const postReady = () => {
  window.parent?.postMessage({ type: 'ready' }, '*');
};

const postSelection = () => {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, ' ');
  window.parent?.postMessage({ type: 'selection', selectedText, from, to }, '*');
};

function updateToolbarState() {
  toolbarButtons.forEach((button) => {
    const command = button.dataset.command;
    let isActive = false;
    switch (command) {
      case 'toggleBold':
        isActive = editor.isActive('bold');
        break;
      case 'toggleItalic':
        isActive = editor.isActive('italic');
        break;
      case 'toggleUnderline':
        isActive = editor.isActive('underline');
        break;
      case 'toggleStrike':
        isActive = editor.isActive('strike');
        break;
      case 'toggleCode':
        isActive = editor.isActive('code');
        break;
      case 'setHeading':
        isActive = editor.isActive('heading', { level: Number(button.dataset.level) });
        break;
      case 'setTextAlign':
        isActive = editor.isActive({ textAlign: button.dataset.align });
        break;
      case 'toggleBulletList':
        isActive = editor.isActive('bulletList');
        break;
      case 'toggleOrderedList':
        isActive = editor.isActive('orderedList');
        break;
      case 'toggleTaskList':
        isActive = editor.isActive('taskList');
        break;
      case 'toggleBlockquote':
        isActive = editor.isActive('blockquote');
        break;
      case 'toggleLink':
        isActive = editor.isActive('link');
        break;
    }
    button.classList.toggle('is-active', !!isActive);
  });
}

function updateCharacterCount() {
  try {
    const mod = editor?.storage?.characterCount;
    const count = (mod && typeof mod.characters === 'function')
      ? mod.characters()
      : (editor?.state?.doc?.textContent || '').length;
    if (typeof characterCount !== 'undefined' && characterCount) {
      characterCount.textContent = `${count} character${count === 1 ? '' : 's'}`;
    }
  } catch (e) {
    // no-op; don’t block onUpdate
  }
}

function execToolbarCommand(button) {
  const command = button.dataset.command;
  switch (command) {
    case 'toggleBold':
      editor.chain().focus().toggleBold().run();
      break;
    case 'toggleItalic':
      editor.chain().focus().toggleItalic().run();
      break;
    case 'toggleUnderline':
      editor.chain().focus().toggleUnderline().run();
      break;
    case 'toggleStrike':
      editor.chain().focus().toggleStrike().run();
      break;
    case 'toggleCode':
      editor.chain().focus().toggleCode().run();
      break;
    case 'setHeading':
      editor.chain().focus().setHeading({ level: Number(button.dataset.level) }).run();
      break;
    case 'setTextAlign':
      editor.chain().focus().setTextAlign(button.dataset.align).run();
      break;
    case 'toggleBulletList':
      editor.chain().focus().toggleBulletList().run();
      break;
    case 'toggleOrderedList':
      editor.chain().focus().toggleOrderedList().run();
      break;
    case 'toggleTaskList':
      editor.chain().focus().toggleTaskList().run();
      break;
    case 'toggleBlockquote':
      editor.chain().focus().toggleBlockquote().run();
      break;
    case 'setHorizontalRule':
      editor.chain().focus().setHorizontalRule().run();
      break;
    case 'toggleLink': {
      const previousUrl = editor.getAttributes('link').href;
      const url = window.prompt('Enter URL', previousUrl || 'https://');
      if (url === null) return;
      if (url === '') {
        editor.chain().focus().unsetLink().run();
      } else {
        editor.chain().focus().setLink({ href: url }).run();
      }
      break;
    }
    case 'unsetLink':
      editor.chain().focus().unsetLink().run();
      break;
    case 'insertImage':
      openImagePicker();
      break;
    case 'insertTable':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case 'addColumnBefore':
      editor.chain().focus().addColumnBefore().run();
      break;
    case 'addColumnAfter':
      editor.chain().focus().addColumnAfter().run();
      break;
    case 'deleteColumn':
      editor.chain().focus().deleteColumn().run();
      break;
    case 'addRowBefore':
      editor.chain().focus().addRowBefore().run();
      break;
    case 'addRowAfter':
      editor.chain().focus().addRowAfter().run();
      break;
    case 'deleteRow':
      editor.chain().focus().deleteRow().run();
      break;
    case 'deleteTable':
      editor.chain().focus().deleteTable().run();
      break;
    case 'undo':
      editor.chain().focus().undo().run();
      break;
    case 'redo':
      editor.chain().focus().redo().run();
      break;
    default:
      console.warn('Unknown command', command);
  }
  updateToolbarState();
}

toolbarButtons.forEach((button) => {
  button.addEventListener('click', () => execToolbarCommand(button));
});

bubbleMenuElement.querySelectorAll('button').forEach((button) => {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    execToolbarCommand(button);
  });
});

floatingMenuElement.querySelectorAll('button').forEach((button) => {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    execToolbarCommand(button);
  });
});

async function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openImagePicker() {
  imageInput.value = '';
  imageInput.click();
}

imageInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const src = await uploadImage(file);
  editor.chain().focus().setImage({ src }).run();
});

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

editorElement.addEventListener('paste', handlePasteOrDrop);
editorElement.addEventListener('drop', handlePasteOrDrop);

window.addEventListener('message', (event) => {
  const msg = event.data || {};
  console.debug('[OpenTrain child/main.js] ← parent:', msg);
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'load': {
      if (typeof msg.readOnly === 'boolean') {
        editor.setEditable(!msg.readOnly);
      }
      if (msg.json) {
        editor.commands.setContent(msg.json);
      } else if (msg.html) {
        editor.commands.setContent(msg.html, true);
      }
      const from = msg.html ? 'html' : (msg.json ? 'json' : 'none');
      const htmlLen = typeof msg.html === 'string' ? msg.html.length : 0;
      console.debug('[OpenTrain child/main.js] content set', {
        from,
        htmlLen,
      });
      break;
    }
    case 'insertImage':
      if (msg.src) {
        editor.chain().focus().setImage({ src: msg.src }).run();
      }
      break;
    case 'insertContent': {
      if (typeof msg.jsonOrHtml === 'string') {
        editor.chain().focus().insertContent(msg.jsonOrHtml).run();
      } else if (msg.jsonOrHtml) {
        editor.chain().focus().insertContent(msg.jsonOrHtml).run();
      }
      break;
    }
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
      if (typeof payload === 'string') {
        editor.chain().focus().insertContent(payload).run();
      } else {
        editor.chain().focus().insertContent(payload).run();
      }
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

const menusHost = document.getElementById('menus');
if (menusHost) {
  menusHost.append(bubbleMenuElement, floatingMenuElement);
}
