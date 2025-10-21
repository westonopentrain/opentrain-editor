# Security and Content Security Policy

Securing an iframe-based editor involves hardening both the deployed site and the embedding Bubble page.

## Render Headers

`render.yaml` sets the following headers:

- `Content-Security-Policy: frame-ancestors https://*.bubbleapps.io https://*.opentrain.ai;`
  - Prevents unauthorized sites from embedding the editor.
- `Cache-Control: no-store` (on `index.html`)
  - Ensures new deployments take effect immediately.

Add additional CSP directives when you introduce external services (e.g., Cloudinary). Render's static sites support multiple header entries, so you can append directives like `img-src https://res.cloudinary.com data:` as needed.

## postMessage Origin Checks

Within `public/main.js`, add origin validation before processing messages when deploying to production. Keep an allowlist of trusted domains (Render preview URL, custom domain) to guard against malicious scripts posting commands to the editor.

Likewise, update the Bubble plugin's `onMessage` handler to ignore events from unknown origins.

## Sanitization in Bubble

When rendering HTML in Bubble, sanitize it before injecting into the DOM. Options include:

- Using Bubble's built-in rich text elements with sanitized input.
- Sanitizing server-side using libraries like DOMPurify (via a serverless function) and storing the sanitized HTML.
- Rendering HTML within an iframe that enforces a strict CSP.

## Additional Recommendations

- Serve the Render site over HTTPS only.
- Consider enabling [Subresource Integrity](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity) if you self-host the CDN bundles in the future.
- Log `postMessage` events during development to audit interactions before enabling production restrictions.
