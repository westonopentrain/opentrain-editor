# OpenTrain Document Service (docsvc)

A lightweight Fastify API that persists documents to Postgres and powers the future persistence and AI backend for OpenTrain content workflows.

## Getting Started

```bash
cd apps/docsvc
npm install
npm run dev
```

The server listens on `http://localhost:3001` by default. Use `npm start` for production-like runs without file watching.

## Endpoints

| Method | Path                     | Description |
| ------ | ------------------------ | ----------- |
| GET    | `/health`                | Health check returning `{ ok: true }`. |
| GET    | `/docs/:id`              | Retrieve a single document by id. Returns 404 when missing. |
| GET    | `/docs?jobId=JOB_ID`     | List documents for a Bubble job. Sorted by `position`, then `updatedAt` descending. |
| PUT    | `/docs/:id`              | Upsert document metadata, `tiptapJson`, and `htmlSnapshot`. |
| POST   | `/docs/migrate/editorjs` | Convert an Editor.js payload into Tiptap JSON and HTML using shared helpers. |

### Example Requests

```bash
# Upsert a document
curl -X PUT http://localhost:3001/docs/doc-123 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${DOCSVC_API_KEY}' \
  -d '{
    "title": "Role description",
    "jobId": "job-001",
    "tiptapJson": { "type": "doc", "content": [] },
    "htmlSnapshot": "<p></p>"
  }'

# Fetch a document
curl -H 'Authorization: Bearer ${DOCSVC_API_KEY}' http://localhost:3001/docs/doc-123

# Convert Editor.js payload
curl -X POST http://localhost:3001/docs/migrate/editorjs \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${DOCSVC_API_KEY}' \
  -d '{ "edjs": { "blocks": [{ "type": "paragraph", "data": { "text": "Hello" } }] } }'
```

## Authentication and CORS

- `/docs/*` routes require a bearer token: include `Authorization: Bearer ${DOCSVC_API_KEY}` in every request. `/health` remains public for uptime checks.
- `ALLOWED_ORIGINS` controls which browser origins Fastify will accept. Provide a comma-separated list (e.g. `https://*.bubbleapps.io,https://opentrain-editor-shell.onrender.com`). When empty, any origin is accepted (useful for local development).

## Shared Utilities

`docsvc` imports the conversion helpers from `@opentrain/shared` (see [`packages/shared`](../../packages/shared)) so that the editor and backend use the exact same transformations.

## OpenAPI

[`openapi.yaml`](openapi.yaml) documents the current routes and schemas.
