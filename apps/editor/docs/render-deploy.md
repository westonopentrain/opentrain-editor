# Deploying to Render Static Sites

Follow these steps to publish the editor as a static site on Render.

## 1. Create the Service

1. Sign in to [Render](https://render.com/).
2. Click **New +** → **Static Site**.
3. Point Render at this repository (`opentrain-editor`).
4. Use the following settings:
   - **Name:** `opentrain-editor`
   - **Branch:** `main` (or the branch you wish to deploy)
   - **Build Command:** leave empty (no build step required)
   - **Publish Directory:** `public`

Render will deploy the files in `apps/editor/public/` directly to a CDN-backed static site.

## 2. Configure Headers via `render.yaml`

The repository includes a monorepo `render.yaml` blueprint that sets the Content Security Policy and cache headers for the static site service:

```yaml
services:
  - type: web
    name: opentrain-editor
    runtime: static
    rootDir: apps/editor
    buildCommand: ""
    staticPublishPath: public
    headers:
      - path: /*
        name: Content-Security-Policy
        value: frame-ancestors https://*.bubbleapps.io https://*.opentrain.ai;
      - path: /index.html
        name: Cache-Control
        value: no-store
```

When the service is created, Render applies these headers automatically.

- **Content-Security-Policy** ensures only Bubble domains and the OpenTrain domain may embed the editor in an iframe.
- **Cache-Control** on `index.html` disables caching so updates propagate immediately, while other assets remain cached by default.

## 3. Environment Variables (Optional)

If you later add features that require configuration (for example, a Cloudinary key), store them as environment variables in Render and consume them via query parameters or a configuration endpoint. The static version does not require any environment variables.

## 4. Post-Deploy Checklist

1. Open the Render URL directly to confirm the editor loads.
2. Verify the browser developer tools show the CSP header on responses.
3. Embed the URL inside Bubble and check for any blocked requests or console warnings.
4. Test postMessage events using the guidance in [`docs/message-api.md`](message-api.md).

Render redeploys automatically whenever you push changes to the configured branch.
