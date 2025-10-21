# Message API

The Bubble parent window communicates with the editor via `window.postMessage`. All messages are JSON objects with a `type` property. Messages should be validated by origin in production. The examples below use `*` for clarity, but restrict to your Render domain whenever possible.

## Incoming Messages (Parent ➜ Editor)

### `load`

```json
{ "type": "load", "readOnly": false, "json": { … }, "html": "<p>optional</p>" }
```

- `readOnly` (boolean, optional) — toggles read-only mode.
- `json` (object, optional) — Tiptap JSON to load. Preferred format.
- `html` (string, optional) — HTML fallback when JSON is unavailable.

### `insertImage`

```json
{ "type": "insertImage", "src": "https://example.com/image.png" }
```

Inserts an image node with the specified source URL.

### `insertContent`

```json
{ "type": "insertContent", "jsonOrHtml": { … } }
```

Accepts either Tiptap JSON or an HTML string. The editor detects the payload type and inserts at the current selection.

### `scrollToAnchor`

```json
{ "type": "scrollToAnchor", "id": "section-intro" }
```

Scrolls the editor container to the element matching the provided `id`. The custom Unique ID extension ensures headings and paragraphs receive stable IDs for anchor targeting.

### `applyPatch`

```json
{ "type": "applyPatch", "jsonOrHtml": { … } }
```

Reserved for future AI-driven patches. The current implementation inserts the supplied content at the current selection with a TODO for ID-targeted updates.

## Outgoing Messages (Editor ➜ Parent)

### `ready`

```json
{ "type": "ready" }
```

Emitted once the editor initializes, signaling Bubble to enable interactions.

### `change`

```json
{ "type": "change", "json": { … }, "html": "<p>…</p>" }
```

Emitted after user edits. Updates are debounced by 1500 ms to limit message traffic. Both Tiptap JSON and HTML snapshots are included for downstream use.

### `selection`

```json
{ "type": "selection", "selectedText": "Example", "from": 10, "to": 17 }
```

Optional message emitted when the selection changes. Useful for enabling contextual UI in Bubble.

## Security Considerations

- Always validate `event.origin` in both the Bubble plugin and the editor before trusting data.
- Consider generating a shared secret or token to authenticate messages for production workloads.
- Sanitize HTML before rendering it in viewer contexts. Bubble can use server-side HTML sanitizers or dedicated plugins.
