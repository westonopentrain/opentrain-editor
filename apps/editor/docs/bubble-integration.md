# Bubble Integration Guide

This guide walks through embedding the Render-hosted editor inside Bubble using a private plugin element. The plugin loads the editor in an iframe and exchanges messages via `postMessage`.

## 1. Create a Private Plugin

1. In Bubble, go to **Plugins** → **Add plugin** → **New plugin** → **Private**.
2. Provide a name such as `OpenTrain Editor`.
3. Save the plugin and open it to create a new **Element** named `opentrain_editor`.

### Element Properties

Add the following properties (all text unless noted):

- `editor_url` (Text) — the Render deployment URL, e.g. `https://opentrain-editor-shell.onrender.com`.
- `docId` (Text) — optional identifier passed to the iframe query string.
- `initial_json` (Long text) — serialized Tiptap JSON string.
- `initial_html` (Long text) — HTML fallback when JSON is absent.
- `read_only` (Yes/No) — controls read-only mode.

### Element States

- `json` (Long text) — stores the latest editor JSON string.
- `html` (Long text) — stores the latest HTML snapshot.
- `is_ready` (Yes/No) — indicates when the iframe reports it is ready.

### Element Event

- `onChange` — triggered whenever the editor posts a `{ type: "change" }` message.

### Element Actions

Create the following actions on the element:

- `load_json(json)`
- `load_html(html)`
- `insert_image(url)`
- `focus()`

## 2. Paste the Element Code

Use the following code in the Bubble plugin editor.

### Initialize

```js
function(instance, context) {
  const frame = document.createElement('iframe');
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.border = '0';

  const base = context.properties.editor_url || '';
  const url = base + (base.includes('?') ? '&' : '?') + 'docId=' + encodeURIComponent(context.properties.docId || '');
  frame.src = url;

  instance.canvas.append(frame);
  instance.data.frame = frame;

  instance.data.onMessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'ready') {
      instance.publishState('is_ready', true);
      return;
    }
    if (msg.type === 'change') {
      try { instance.publishState('json', JSON.stringify(msg.json)); } catch {}
      instance.publishState('html', msg.html || '');
      instance.triggerEvent('onChange');
    }
  };
  window.addEventListener('message', instance.data.onMessage);

  instance.publishState('is_ready', false);
}
```

### Update

```js
function(instance, properties, context) {
  const cw = instance.data.frame && instance.data.frame.contentWindow;
  if (!cw) return;

  const payload = { type: 'load', readOnly: !!properties.read_only };
  if (properties.initial_json) {
    try { payload.json = JSON.parse(properties.initial_json); } catch {}
  } else if (properties.initial_html) {
    payload.html = properties.initial_html;
  }
  cw.postMessage(payload, '*');
}
```

### Actions

```js
function load_json(instance, properties) {
  const cw = instance.data.frame && instance.data.frame.contentWindow;
  if (!cw) return;
  let json = null;
  try { json = JSON.parse(properties.json); } catch { return; }
  cw.postMessage({ type: 'load', json }, '*');
}

function load_html(instance, properties) {
  const cw = instance.data.frame && instance.data.frame.contentWindow;
  if (!cw) return;
  cw.postMessage({ type: 'load', html: properties.html }, '*');
}

function insert_image(instance, properties) {
  const cw = instance.data.frame && instance.data.frame.contentWindow;
  if (!cw || !properties.url) return;
  cw.postMessage({ type: 'insertImage', src: properties.url }, '*');
}

function focus(instance) {
  instance.data.frame && instance.data.frame.contentWindow && instance.data.frame.contentWindow.focus();
}
```

## 3. Embed on a Page

1. Install the plugin in your Bubble app and add the `opentrain_editor` element to a page.
2. Set the `editor_url` property to the Render deployment URL.
3. Optionally pass a `docId` and initial JSON or HTML.
4. Bind the `json` and `html` states to your data source to save drafts.
5. Use the `onChange` event to trigger workflows, such as saving `tiptap_json` and `html_snapshot` fields and incrementing a `version` number.
6. Call actions like `load_json`, `load_html`, or `insert_image` within Bubble workflows as needed.

## 4. Origin Validation (Recommended)

The provided code accepts messages from any origin. In production, validate `e.origin` in `instance.data.onMessage` and restrict `postMessage` calls to trusted origins (e.g., your Render domain) before deploying to production.
