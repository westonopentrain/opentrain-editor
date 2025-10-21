# Troubleshooting

Use this checklist to diagnose common issues when embedding the editor.

## Mixed Content Warnings

- Ensure both Bubble and the Render site load over HTTPS.
- Replace any `http://` image URLs with `https://` equivalents.

## Blocked Iframe

- Check browser console for CSP violations. The Render header only allows Bubble and OpenTrain domains to embed the editor.
- Confirm the Bubble plugin is loading the correct `editor_url` (no trailing spaces).

## No `ready` Event

- Verify the iframe URL loads correctly in a separate tab.
- Check browser console for failed CDN imports. Network issues can prevent the editor from initializing.
- Make sure `window.addEventListener('message', …)` is attached before the iframe loads.

## Changes Not Saving

- Confirm the Bubble `onChange` workflow is triggered by logging output.
- Ensure the Bubble plugin states `json` and `html` are bound to database fields.
- Remember that updates are debounced by 1500 ms. Wait for the debounce window to elapse.

## Large Images Slow the Page

- Data URLs increase page weight. Configure Cloudinary (see [`docs/images-and-uploads.md`](images-and-uploads.md)).
- Resize images client-side before uploading if necessary.

## CSP Errors for External Services

- Update `render.yaml` with additional `img-src`, `connect-src`, or `script-src` directives when integrating third-party services.
- Confirm Bubble also allows the Render domain in its CSP settings (if using Bubble's CSP feature).

## Slash Command Not Appearing

- The slash menu appears when typing `/` at the start of a paragraph. Ensure focus is in an empty paragraph.
- Check console logs for any errors in the custom slash command extension.
