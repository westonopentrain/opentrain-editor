import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core"

/**
 * Matches common Loom URLs:
 *  - https://www.loom.com/share/<id>
 *  - https://loom.com/share/<id>
 *  - https://www.loom.com/embed/<id>
 */
const LOOM_URL_RE =
  /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([A-Za-z0-9_-]+)(?:\?[^\s]*)?/i

function toEmbedUrl(input: string): string | null {
  const m = input.match(LOOM_URL_RE)
  if (!m) return null
  const id = m[1]
  return `https://www.loom.com/embed/${id}`
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    loomEmbed: {
      setLoomEmbed: (url: string) => ReturnType
    }
  }
}

/**
 * Block, atom node that renders a responsive iframe.
 */
export const LoomEmbed = Node.create({
  name: "loomEmbed",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => {
          const src = (el as HTMLElement).getAttribute("src") || ""
          return src.startsWith("https://www.loom.com/embed/") ? src : null
        },
        renderHTML: (attrs) => ({ src: attrs.src }),
      },
      url: {
        default: null, // original share URL if we have it
      },
      title: {
        default: "Loom video",
      },
    }
  },

  parseHTML() {
    // Accept only iframes we tagged and/or with a Loom embed src
    return [
      { tag: "iframe[data-embed=\"loom\"]" },
      {
        tag: "iframe",
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute("src") || ""
          return src.startsWith("https://www.loom.com/embed/") ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    // Wrap with aspect-ratio box
    return [
      "div",
      { class: "embed-loom" },
      [
        "iframe",
        mergeAttributes(
          {
            "data-embed": "loom",
            allow:
              "autoplay; encrypted-media; picture-in-picture; fullscreen;",
            frameborder: "0",
            allowfullscreen: "true",
            title: HTMLAttributes.title || "Loom video",
          },
          HTMLAttributes
        ),
      ],
    ]
  },

  addCommands() {
    return {
      setLoomEmbed:
        (url: string) =>
        ({ chain }) => {
          const embed = toEmbedUrl(url)
          if (!embed) return false
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { src: embed, url },
            })
            .run()
        },
    }
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: LOOM_URL_RE,
        type: this.type,
        getAttributes: (match) => {
          const full = match[0]
          const embed = toEmbedUrl(full)
          return embed ? { src: embed, url: full } : false
        },
      }),
    ]
  },
})

export default LoomEmbed
