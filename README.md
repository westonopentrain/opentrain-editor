# OpenTrain Monorepo

This repository hosts the two OpenTrain content applications and their shared tooling:

- **apps/editor** — the Render-hosted static Tiptap editor embedded in Bubble.
- **apps/docsvc** — a lightweight Fastify web API for document storage, migrations, and future AI workflows.
- **packages/shared** — reusable utilities (Editor.js converters, shared types) consumed by both apps.

Keeping everything together provides a single source of truth for Render deployments, Bubble integrations, and future AI agents that need full project context.

## Repository Layout

```
apps/
  editor/    # static Tiptap editor, no build step required
  docsvc/    # Fastify JSON API for documents and migrations
packages/
  shared/    # Editor.js converters + shared types
render.yaml  # Render blueprint with both services
```

Community docs (`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`) stay at the repo root.

## Quick Start

### Editor (apps/editor)

The editor remains a static site served directly from `apps/editor/public/`.

```bash
# from repository root
cd apps/editor
# deploy instructions
cat docs/render-deploy.md
```

Deploy to Render Static Sites with no build step. The Bubble integration guide lives at [`apps/editor/docs/bubble-integration.md`](apps/editor/docs/bubble-integration.md).

### Document Service (apps/docsvc)

The document service is a small Fastify server that stores documents in memory today and will grow into a full persistence + AI backend later.

```bash
cd apps/docsvc
npm install
npm run dev
```

Endpoints:

- `GET /health` — readiness probe.
- `GET /docs/:id` — fetch a document by id.
- `GET /docs?jobId=...` — list documents for a Bubble job.
- `PUT /docs/:id` — upsert metadata, Tiptap JSON, and HTML snapshot.
- `POST /docs/migrate/editorjs` — convert Editor.js payloads using shared helpers.

See [`apps/docsvc/README.md`](apps/docsvc/README.md) and [`apps/docsvc/openapi.yaml`](apps/docsvc/openapi.yaml) for details.

### Shared Utilities (packages/shared)

Shared converters and types are exported from `@opentrain/shared` so both the editor and the service can use the same transformations.

```js
import { edjsToHtml, edjsToTiptap } from '@opentrain/shared';
```

The source code lives under [`packages/shared/src`](packages/shared/src).

## Render Blueprint

[`render.yaml`](render.yaml) describes both services for Render. It points each service at its subdirectory with `rootDir` and uses `buildFilter.paths` so only relevant changes trigger redeploys.

## Bubble Embedding

Bubble embeds the editor via an iframe and the message contract documented in [`apps/editor/docs/bubble-integration.md`](apps/editor/docs/bubble-integration.md) and [`apps/editor/docs/message-api.md`](apps/editor/docs/message-api.md). No changes are required for existing Bubble integrations.

## Migration Helpers

Editor.js migration scripts now live in the shared package. Refer to [`apps/editor/docs/migration-editorjs.md`](apps/editor/docs/migration-editorjs.md) for usage recipes and to [`packages/shared/src`](packages/shared/src) for implementation details.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening issues or pull requests. By participating you agree to follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License — see [`LICENSE`](LICENSE) for details.
