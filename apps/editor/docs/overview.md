# Overview

## Architecture

OpenTrain Editor runs as a static site hosted on Render. The deployed site is embedded inside Bubble via an `<iframe>`. The Bubble page (parent) and the editor (child) communicate exclusively with [`window.postMessage`](https://developer.mozilla.org/docs/Web/API/Window/postMessage) to keep concerns separated. All state changes flow through this channel so the Bubble application can save drafts, drive workflows, and respond to editor events.

```
Bubble (parent) ── postMessage ──▶ Editor (Render)
         ▲                        │
         └──── postMessage ◀──────┘
```

The `apps/editor/public/` directory contains all runtime assets. Because the project is deployed as a static site there is no server-side logic within this app.

## Why Tiptap

Tiptap is a headless, extensible editor built on ProseMirror. It provides:

- Composable extensions for rich text, tables, media, collaboration, and AI features.
- ProseMirror JSON output that captures document structure for downstream processing.
- A large ecosystem, active maintenance, and a permissive license.

We load extensions from an ESM CDN (esm.sh) so we can include most official packages without bundling. If an extension fails to load, the editor logs a warning and continues operating with the available feature set.

## Extension Strategy

The editor initializes `StarterKit` and layers additional extensions: text formatting, headings, lists, tables, media, mentions, inline menus, slash commands, and a custom stable-ID plugin. Each extension is imported via CDN and configured inside `public/main.js`.

## Future Bundling Path

While the initial deployment avoids a build step, the codebase is structured to support future bundling when needed. To migrate:

1. Introduce a `src/` directory and install dependencies with a package manager.
2. Replace CDN imports with package imports.
3. Use Vite, Parcel, or another bundler to output to `public/` or a `dist/` directory.
4. Update Render to build the project before publishing.

Until then, the static approach keeps deployment simple and transparent.
