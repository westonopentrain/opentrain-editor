# OpenTrain Editor

> Render-hosted, Bubble-embedded Tiptap surface for OpenTrain content workflows.

## Purpose

OpenTrain Editor is a lightweight micro-app that delivers a fully featured [Tiptap](https://tiptap.dev/) editing experience inside Bubble applications. It ships as a static site so it can be deployed on Render without a build pipeline, while still exposing a rich message API for orchestrating content flows, AI patches, and future collaboration.

```
Bubble page (parent) <iframe> ─────▶ Render static site (child)
          ▲                                      │
          └──── postMessage JSON ◀───────────────┘
```

No Tiptap Cloud or account is required for the initial setup. Collaboration can be added later following the guidance in [`docs/collaboration-later.md`](docs/collaboration-later.md).

## Quick Start

1. Clone the repository and move into `apps/editor`.
2. Review [`docs/render-deploy.md`](docs/render-deploy.md) to configure a Render Static Site.
3. Deploy the `public/` directory to Render. No build step is required.
4. Configure the Bubble plugin element using [`docs/bubble-integration.md`](docs/bubble-integration.md).
5. Test messaging against the parent Bubble page with the recipes in [`docs/message-api.md`](docs/message-api.md).

## Documentation Map

- [`docs/overview.md`](docs/overview.md) — architecture overview and rationale.
- [`docs/render-deploy.md`](docs/render-deploy.md) — deploying on Render Static Sites.
- [`docs/bubble-integration.md`](docs/bubble-integration.md) — Bubble plugin element setup with full code.
- [`docs/message-api.md`](docs/message-api.md) — iframe messaging contract.
- [`docs/migration-editorjs.md`](docs/migration-editorjs.md) — converting Editor.js data to Tiptap.
- [`docs/images-and-uploads.md`](docs/images-and-uploads.md) — managing images today and tomorrow.
- [`docs/collaboration-later.md`](docs/collaboration-later.md) — enabling collaboration in the future.
- [`docs/ai-roadmap.md`](docs/ai-roadmap.md) — AI augmentation strategy.
- [`docs/security-and-csp.md`](docs/security-and-csp.md) — security hardening and CSP guidance.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common issues and fixes.

## Quick Verification After Deploy

1. Visit the Render Static Site URL directly. You should see the Notion-style editor with floating/bubble menus and the slash command prompt.
2. In a Bubble preview, load the private plugin element configured with your Render URL. Confirm the editor reports `{ type: "ready" }` by observing the `is_ready` state.
3. Type into the editor and verify that `{ type: "change" }` messages populate the Bubble states `json` and `html`.
4. Trigger the `insert_image` action in Bubble with a public image URL and confirm the image appears in the editor.
5. Refresh the page and replay saved JSON using the `load_json` action to confirm content persistence.

## Read-only & Styling Notes

- Pass `{ type: 'load', readOnly: true }` to the iframe (or use an `rw`/`ro` token via the shell) to toggle the editor between editable and read-only modes. The shell also respects `editor.setEditable(false)` when you need to lock the surface.
- Notion-inspired layout rules live in [`public/css/notion.css`](public/css/notion.css). Update that file to adjust spacing, typography, or menu appearance without touching the JavaScript bundle.

## Keyboard Shortcuts

The editor enables Tiptap's default shortcuts for bold (`Mod+B`), italic (`Mod+I`), underline (`Mod+U`), strike (`Mod+Shift+X`), headings (`Mod+Alt+1…6`), lists (`Mod+Shift+7/8/9`), undo (`Mod+Z`), redo (`Mod+Shift+Z`), and more. Refer to the Tiptap documentation for the full list.
