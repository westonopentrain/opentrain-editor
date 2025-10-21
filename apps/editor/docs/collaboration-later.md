# Collaboration Roadmap

Real-time collaboration is optional for the initial release but easy to add later thanks to Tiptap's Y.js integration and Tiptap Cloud offerings.

## Option 1: Self-Hosted with Y.js

1. Install `@tiptap/extension-collaboration` and `yjs` when you introduce a bundler.
2. Use a shared Y.Doc and persistence provider (e.g., y-websocket or y-webrtc) to synchronize document state between clients.
3. Manage awareness (cursors, presence) with `@tiptap/extension-collaboration-cursor`.
4. Host the WebSocket server separately (Render, Fly, or other providers).

## Option 2: Tiptap Cloud

1. Sign up for [Tiptap Cloud](https://tiptap.dev/cloud).
2. Replace the current editor initialization with the Cloud starter code, reusing the message API for parent communication.
3. Configure access control via the Cloud dashboard and use the `docId` query string to scope documents.

## Considerations

- **Authentication:** Bubble should issue tokens that grant access to collaborative sessions.
- **Persistence:** Decide whether Bubble or a dedicated service stores the ProseMirror JSON between sessions.
- **Latency:** Test collaboration performance within Bubble's iframe constraints.

This document serves as a placeholder. When collaboration work begins, create a dedicated implementation plan and update the editor accordingly.
