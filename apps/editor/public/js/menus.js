import BubbleMenu from 'https://esm.sh/@tiptap/extension-bubble-menu@2.1.7?bundle';
import FloatingMenu from 'https://esm.sh/@tiptap/extension-floating-menu@2.1.7?bundle';

function createButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function toggleLink(editor) {
  const isActive = editor.isActive('link');
  if (isActive) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const previous = editor.getAttributes('link').href || '';
  const href = window.prompt('Link URL', previous || 'https://');
  if (href === null) return;
  const trimmed = href.trim();
  if (!trimmed) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
}

export function createMenus() {
  let enabled = true;

  const bubbleElement = document.createElement('div');
  bubbleElement.className = 'notion-menu notion-bubble-menu';
  bubbleElement.setAttribute('role', 'toolbar');

  const floatingElement = document.createElement('div');
  floatingElement.className = 'notion-menu notion-floating-menu';
  floatingElement.setAttribute('role', 'menu');

  const bubbleActions = [
    {
      name: 'bold',
      button: createButton('Bold', 'bold'),
      command: (editor) => editor.chain().focus().toggleBold().run(),
      isActive: (editor) => editor.isActive('bold'),
    },
    {
      name: 'italic',
      button: createButton('Italic', 'italic'),
      command: (editor) => editor.chain().focus().toggleItalic().run(),
      isActive: (editor) => editor.isActive('italic'),
    },
    {
      name: 'underline',
      button: createButton('Underline', 'underline'),
      command: (editor) => editor.chain().focus().toggleUnderline().run(),
      isActive: (editor) => editor.isActive('underline'),
      isAvailable: (editor) => typeof editor.commands.toggleUnderline === 'function',
    },
    {
      name: 'link',
      button: createButton('Link', 'link'),
      command: (editor) => toggleLink(editor),
      isActive: (editor) => editor.isActive('link'),
      isAvailable: (editor) => typeof editor.commands.setLink === 'function',
    },
  ];

  bubbleActions.forEach((action) => bubbleElement.appendChild(action.button));

  const floatingActions = [
    {
      name: 'paragraph',
      button: createButton('Text', 'paragraph'),
      command: (editor) => editor.chain().focus().setParagraph().run(),
      isActive: (editor) => editor.isActive('paragraph'),
    },
    {
      name: 'heading-1',
      button: createButton('H1', 'heading-1'),
      command: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 1 }),
    },
    {
      name: 'heading-2',
      button: createButton('H2', 'heading-2'),
      command: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 2 }),
    },
    {
      name: 'heading-3',
      button: createButton('H3', 'heading-3'),
      command: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 3 }),
    },
    {
      name: 'bullet-list',
      button: createButton('• List', 'bullet-list'),
      command: (editor) => editor.chain().focus().toggleBulletList().run(),
      isActive: (editor) => editor.isActive('bulletList'),
    },
    {
      name: 'ordered-list',
      button: createButton('1. List', 'ordered-list'),
      command: (editor) => editor.chain().focus().toggleOrderedList().run(),
      isActive: (editor) => editor.isActive('orderedList'),
    },
    {
      name: 'task-list',
      button: createButton('To-do', 'task-list'),
      command: (editor) => editor.chain().focus().toggleTaskList().run(),
      isActive: (editor) => editor.isActive('taskList'),
    },
    {
      name: 'quote',
      button: createButton('Quote', 'quote'),
      command: (editor) => editor.chain().focus().toggleBlockquote().run(),
      isActive: (editor) => editor.isActive('blockquote'),
    },
    {
      name: 'code-block',
      button: createButton('Code', 'code-block'),
      command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      isActive: (editor) => editor.isActive('codeBlock'),
    },
    {
      name: 'divider',
      button: createButton('Divider', 'divider'),
      command: (editor) => editor.chain().focus().setHorizontalRule().run(),
      isActive: () => false,
    },
  ];

  floatingActions.forEach((action) => floatingElement.appendChild(action.button));

  const bubbleExtension = BubbleMenu.configure({
    element: bubbleElement,
    tippyOptions: {
      duration: 120,
      placement: 'top',
      offset: [0, 8],
    },
    shouldShow: ({ editor, state }) => {
      if (!enabled || !editor.isEditable) return false;
      if (editor.state.selection.empty) return false;
      if (!editor.view || !editor.view.hasFocus()) return false;
      return true;
    },
  });

  const floatingExtension = FloatingMenu.configure({
    element: floatingElement,
    tippyOptions: {
      duration: 120,
      placement: 'left-start',
      offset: [-8, 12],
    },
    shouldShow: ({ editor, state }) => {
      if (!enabled || !editor.isEditable) return false;
      if (!state.selection.empty) return false;
      const { $from } = state.selection;
      if (!$from || !$from.parent) return false;
      const parent = $from.parent;
      const isParagraph = parent.type && parent.type.name === 'paragraph';
      const isEmpty = parent.content && parent.content.size === 0;
      return isParagraph && isEmpty;
    },
  });

  const bind = (editor) => {
    const handleBubbleClick = (event) => {
      if (!enabled || !editor.isEditable) return;
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = bubbleActions.find((item) => item.name === button.dataset.action);
      if (!action) return;
      const available = !action.isAvailable || action.isAvailable(editor);
      if (!available) return;
      event.preventDefault();
      action.command(editor);
    };

    const handleFloatingClick = (event) => {
      if (!enabled || !editor.isEditable) return;
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = floatingActions.find((item) => item.name === button.dataset.action);
      if (!action) return;
      event.preventDefault();
      action.command(editor);
    };

    bubbleElement.addEventListener('mousedown', handleBubbleClick);
    floatingElement.addEventListener('mousedown', handleFloatingClick);

    const update = () => {
      const allow = enabled && editor.isEditable;
      bubbleActions.forEach((action) => {
        const available = !action.isAvailable || action.isAvailable(editor);
        action.button.toggleAttribute('hidden', !available);
        action.button.disabled = !allow || !available;
        action.button.classList.toggle('is-active', allow && available && action.isActive && action.isActive(editor));
      });
      floatingActions.forEach((action) => {
        action.button.disabled = !allow;
        action.button.classList.toggle('is-active', allow && action.isActive && action.isActive(editor));
      });
    };

    return { update };
  };

  const setEnabled = (value) => {
    enabled = !!value;
    const display = enabled ? '' : 'none';
    bubbleElement.style.display = display;
    floatingElement.style.display = display;
    bubbleElement.classList.toggle('is-disabled', !enabled);
    floatingElement.classList.toggle('is-disabled', !enabled);
  };

  return {
    bubble: { element: bubbleElement, extension: bubbleExtension },
    floating: { element: floatingElement, extension: floatingExtension },
    bind,
    setEnabled,
    isEnabled: () => enabled,
  };
}
