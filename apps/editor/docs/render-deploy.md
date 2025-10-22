# Deploying the Editor Shell to Render

The editor shell now runs as a Node web service that proxies Bubble requests to the document service and serves the iframe app from `apps/editor/public`. Follow the steps below to stand up the service on Render using the repository blueprint.

## 1. Confirm the Blueprint Definition

The monorepo `render.yaml` defines the service as `opentrain-editor-shell`:

```yaml
services:
  - type: web
    name: opentrain-editor-shell
    runtime: node
    rootDir: apps/editor
    plan: starter
    buildCommand: "npm install"
    startCommand: "npm start"
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: DOCSVC_URL
        value: https://opentrain-docsvc.onrender.com
      - key: DOCSVC_API_KEY
        sync: false
      - key: EMBED_ISSUER_SECRET
        sync: false
      - key: EMBED_JWT_SECRET
        sync: false
```

If you previously deployed the static site named `opentrain-editor`, keep it in place so Render does not attempt to mutate the service type. The shell runs under the new name `opentrain-editor-shell`.

## 2. Sync the Blueprint

1. Sign in to [Render](https://render.com/).
2. Open **Blueprints → OpenTrain Doc Editor** (or the blueprint tied to this repo).
3. Click **Manual Sync**. Render will create (or update) the `opentrain-editor-shell` web service without modifying the legacy static deployment.

## 3. Configure Environment Variables

After the service is created, set the following variables on `opentrain-editor-shell`:

| Variable | Description |
| --- | --- |
| `DOCSVC_URL` | Public URL of the document service (e.g. `https://opentrain-docsvc.onrender.com`). |
| `DOCSVC_API_KEY` | Bearer token the shell uses to call the document service. Reuse the existing docsvc key. |
| `EMBED_ISSUER_SECRET` | Shared secret required to call `/api/issue-embed-token`. Bubble includes this in the `X-Partner-Secret` header. |
| `EMBED_JWT_SECRET` | Secret the shell uses to sign and verify embed tokens. |

All other defaults from the blueprint can remain unchanged.

## 4. Post-Deploy Checklist

1. Visit `https://opentrain-editor-shell.onrender.com/app` and confirm the shell responds (it should report a missing token until embedded).
2. Issue a token manually to smoke-test the flow:
   ```bash
   curl -sX POST https://opentrain-editor-shell.onrender.com/api/issue-embed-token \
     -H 'Content-Type: application/json' \
     -H 'X-Partner-Secret: ${EMBED_ISSUER_SECRET}' \
     -d '{"userId":"demo","jobId":"job-001","docId":"doc-123","ttlSec":3600}'
   ```
3. Paste the returned token into `https://opentrain-editor-shell.onrender.com/app?token=<TOKEN>` and verify the iframe loads.
4. Embed the new URL inside Bubble and confirm autosave + sidebar updates work end-to-end.

Render will redeploy the service automatically whenever you push to the tracked branch.
