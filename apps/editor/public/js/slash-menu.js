import { Extension } from 'https://esm.sh/@tiptap/core@2.1.7?bundle';
import Suggestion from 'https://esm.sh/@tiptap/suggestion@2.1.7?bundle';

const DEFAULT_COMMANDS = [
  {
    key: 'paragraph',
    title: 'Paragraph',
    description: 'Plain text',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    key: 'heading-1',
    title: 'Heading 1',
    description: 'Large section title',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    key: 'heading-2',
    title: 'Heading 2',
    description: 'Medium section title',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    key: 'heading-3',
    title: 'Heading 3',
    description: 'Small section title',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    key: 'bullet-list',
    title: 'Bulleted list',
    description: 'Start a bulleted list',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: 'ordered-list',
    title: 'Numbered list',
    description: 'Start a numbered list',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: 'task-list',
    title: 'To-do list',
    description: 'Track tasks with checkboxes',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: 'blockquote',
    title: 'Quote',
    description: 'Capture a quote',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    key: 'code-block',
    title: 'Code block',
    description: 'Insert formatted code',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: 'divider',
    title: 'Divider',
    description: 'Insert a horizontal rule',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

function createRenderer(isEnabled) {
  const root = document.createElement('div');
  root.className = 'notion-menu notion-slash-menu';
  root.setAttribute('role', 'listbox');

  let items = [];
  let selectedIndex = 0;

  const updateSelected = () => {
    const buttons = Array.from(root.querySelectorAll('button[data-index]'));
    buttons.forEach((button, index) => {
      const isActive = index === selectedIndex;
      button.classList.toggle('is-active', isActive);
      if (isActive) {
        button.setAttribute('aria-selected', 'true');
        button.setAttribute('tabindex', '0');
      } else {
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('tabindex', '-1');
      }
    });
  };

  const runCommand = (item, props) => {
    if (!item || typeof item.command !== 'function') return;
    item.command(props);
  };

  const positionMenu = (clientRectFn) => {
    const rect = typeof clientRectFn === 'function' ? clientRectFn() : null;
    if (!rect) return;
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.bottom + 8}px`;
  };

  const renderItems = (props) => {
    items = props.items || [];
    selectedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0));

    if (!items.length) {
      if (root.parentNode) {
        root.remove();
      }
      return;
    }

    root.innerHTML = '';
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.className = 'notion-menu__item';
      button.setAttribute('role', 'option');

      const title = document.createElement('span');
      title.className = 'notion-menu__title';
      title.textContent = item.title;
      button.appendChild(title);

      if (item.description) {
        const hint = document.createElement('span');
        hint.className = 'notion-menu__description';
        hint.textContent = item.description;
        button.appendChild(hint);
      }

      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (!isEnabled()) return;
        runCommand(item, props);
        root.remove();
      });

      root.appendChild(button);
    });

    if (!root.parentNode) {
      document.body.appendChild(root);
    }

    positionMenu(props.clientRect);
    updateSelected();
  };

  return {
    onStart(props) {
      if (!isEnabled()) return;
      selectedIndex = 0;
      renderItems(props);
    },
    onUpdate(props) {
      if (!isEnabled()) {
        if (root.parentNode) {
          root.remove();
        }
        return;
      }
      renderItems(props);
    },
    onKeyDown(props) {
      if (!root.parentNode) return false;
      if (!isEnabled()) return false;
      if (!items.length) return false;
      const { event } = props;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelected();
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelected();
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = items[selectedIndex];
        if (item) {
          runCommand(item, props);
          root.remove();
        }
        return true;
      }
      if (event.key === 'Escape') {
        root.remove();
        return true;
      }
      return false;
    },
    onExit() {
      if (root.parentNode) {
        root.remove();
      }
    },
  };
}

const SlashMenu = Extension.create({
  name: 'slash-menu',
  addOptions() {
    return {
      isEnabled: () => true,
      commandList: DEFAULT_COMMANDS,
      suggestion: {
        char: '/',
        startOfLine: false,
        allowSpaces: true,
      },
    };
  },
  addProseMirrorPlugins() {
    const extension = this;
    return [
      Suggestion({
        editor: extension.editor,
        char: extension.options.suggestion.char,
        startOfLine: extension.options.suggestion.startOfLine,
        allowSpaces: extension.options.suggestion.allowSpaces,
        items: ({ query }) => {
          if (!extension.options.isEnabled() || !extension.editor.isEditable) {
            return [];
          }
          const normalized = normalizeQuery(query);
          const commands = Array.isArray(extension.options.commandList)
            ? extension.options.commandList
            : DEFAULT_COMMANDS;
          return commands
            .filter((item) => item && typeof item.title === 'string')
            .filter((item) => {
              if (!normalized) return true;
              const haystack = [item.title, item.description, item.key]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              return haystack.includes(normalized);
            })
            .slice(0, 10);
        },
        render: () => createRenderer(() => extension.options.isEnabled() && extension.editor.isEditable),
      }),
    ];
  },
});

export default SlashMenu;
