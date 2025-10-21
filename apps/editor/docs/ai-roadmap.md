# AI Roadmap

The editor's ProseMirror JSON output unlocks downstream AI features. Each node can include metadata such as stable IDs, text content, and marks, enabling granular operations on the document.

## Embeddings and Retrieval

- Generate embeddings per block (paragraph, heading, list item) using the text content in ProseMirror JSON.
- Store embeddings alongside the node `attrs.id` so AI services can reference specific sections.
- During retrieval, supply the Bubble page with relevant block IDs and fetch the HTML or JSON snippets to display context-aware suggestions.

## Patch Strategy

1. Bubble or a backend service generates an AI suggestion targeting a specific block ID.
2. Construct a message `{ type: 'applyPatch', jsonOrHtml: ... }` that contains the new content.
3. The editor replaces or inserts content at the targeted block. The current implementation logs a TODO; extend it to find nodes by `attrs.id` using the stable IDs provided by the custom extension.

## Future Enhancements

- Capture revision history and diff nodes to visualize AI changes before applying them.
- Introduce a comment or suggestion mode driven by AI outputs.
- Combine Y.js collaboration with AI assistants for co-editing experiences.

## Implementation Notes

- Maintain deterministic IDs across conversions and migrations so AI agents can rely on them.
- Normalize whitespace and punctuation when generating embeddings to reduce noise.
- Consider storing both HTML and JSON snapshots so AI tools can work with either format.
