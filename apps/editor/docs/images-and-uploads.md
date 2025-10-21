# Images and Uploads

The editor defaults to data URL images for simplicity. This keeps the static deployment dependency-free and works for quick prototyping. However, production apps should adopt a CDN-backed upload workflow.

## Default Behavior

- Clicking the **Insert image** button opens a file picker.
- Dropping or pasting an image file automatically reads the file as a data URL and inserts it into the document.
- Data URLs are stored inline, so large images may increase document size quickly.

## Replacing Data URLs with Cloudinary (Optional)

1. Create a Cloudinary account and note your unsigned upload preset.
2. Replace the `uploadImage(file)` function inside `public/main.js` with the following snippet:

```js
async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'YOUR_PRESET');

  const res = await fetch('https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload', {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  return json.secure_url;
}
```

3. The editor already awaits the function and inserts the returned URL into the image node.

## Handling Paste and Drop

The editor listens for `paste` and `drop` events on the root element. When an image file is detected it is passed to `uploadImage(file)`. The default implementation resolves with a data URL; swapping in Cloudinary (or another service) pushes the image to external storage before insertion.

## Future Enhancements

- Support progress indicators during uploads.
- Add retry logic or error messages in the toolbar.
- Store metadata (dimensions, alt text) alongside the URL.
