import { NodeSelection, type Selection } from "@tiptap/pm/state"
import type { JSONContent, Editor } from "@tiptap/react"
import { isTextSelection, isNodeSelection, posToDOMRect } from "@tiptap/react"

// TipTap Collaboration
export const TIPTAP_COLLAB_DOC_PREFIX =
  import.meta.env.VITE_TIPTAP_COLLAB_DOC_PREFIX || ""
export const TIPTAP_COLLAB_APP_ID =
  import.meta.env.VITE_TIPTAP_COLLAB_APP_ID || ""
export const TIPTAP_COLLAB_TOKEN =
  import.meta.env.VITE_TIPTAP_COLLAB_TOKEN || ""

// TipTap AI
export const TIPTAP_AI_APP_ID = import.meta.env.VITE_TIPTAP_AI_APP_ID || ""
export const TIPTAP_AI_TOKEN = import.meta.env.VITE_TIPTAP_AI_TOKEN || ""

export const USE_JWT_TOKEN_API_ENDPOINT =
  import.meta.env.VITE_USE_JWT_TOKEN_API_ENDPOINT || ""

export const TIPTAP_COLLAB_IS_CONFIGURED = Boolean(
  (TIPTAP_COLLAB_DOC_PREFIX && TIPTAP_COLLAB_APP_ID && TIPTAP_COLLAB_TOKEN) ||
    USE_JWT_TOKEN_API_ENDPOINT
)

export const TIPTAP_AI_IS_CONFIGURED = Boolean(
  (TIPTAP_AI_APP_ID && TIPTAP_AI_TOKEN) || USE_JWT_TOKEN_API_ENDPOINT
)

const NODE_TYPE_LABELS: Record<string, string> = {
  paragraph: "text",
  codeBlock: "Codeblock",
}
export type OverflowPosition = "none" | "top" | "bottom" | "both"

/**
 * Utility function to get URL parameters
 */
export const getUrlParam = (param: string): string | null => {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  return params.get(param)
}

/**
 * Returns a display name for the current node in the editor
 * @param editor The Tiptap editor instance
 * @returns The display name of the current node
 */
export const getNodeDisplayName = (editor: Editor | null): string => {
  if (!editor) return "Node"

  const { selection } = editor.state

  if (selection instanceof NodeSelection) {
    const nodeType = selection.node.type.name
    return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
  }

  const { $anchor } = selection
  const nodeType = $anchor.parent.type.name
  return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
}

/**
 * Removes empty paragraph nodes from content
 */
export const removeEmptyParagraphs = (content: JSONContent) => ({
  ...content,
  content: content.content?.filter(
    (node) =>
      node.type !== "paragraph" ||
      node.content?.some((child) => child.text?.trim() || child.type !== "text")
  ),
})

/**
 * Determines how a target element overflows relative to a container element
 */
export function getElementOverflowPosition(
  targetElement: Element,
  containerElement: HTMLElement
): OverflowPosition {
  const targetBounds = targetElement.getBoundingClientRect()
  const containerBounds = containerElement.getBoundingClientRect()

  const isOverflowingTop = targetBounds.top < containerBounds.top
  const isOverflowingBottom = targetBounds.bottom > containerBounds.bottom

  if (isOverflowingTop && isOverflowingBottom) return "both"
  if (isOverflowingTop) return "top"
  if (isOverflowingBottom) return "bottom"
  return "none"
}

/**
 * Checks if the current selection is valid for a given editor
 */
export const isSelectionValid = (
  editor: Editor | null,
  selection?: Selection,
  excludedNodeTypes: string[] = ["imageUpload", "horizontalRule"]
): boolean => {
  if (!editor) return false
  if (!selection) selection = editor.state.selection

  const { state } = editor
  const { doc } = state
  const { empty, from, to } = selection

  const isEmptyTextBlock =
    !doc.textBetween(from, to).length && isTextSelection(selection)
  const isCodeBlock =
    selection.$from.parent.type.spec.code ||
    (isNodeSelection(selection) && selection.node.type.spec.code)
  const isExcludedNode =
    isNodeSelection(selection) &&
    excludedNodeTypes.includes(selection.node.type.name)

  return !empty && !isEmptyTextBlock && !isCodeBlock && !isExcludedNode
}

/**
 * Checks if the current text selection is valid for editing
 * - Not empty
 * - Not a code block
 * - Not a node selection
 */
export const isTextSelectionValid = (editor: Editor | null): boolean => {
  if (!editor) return false
  const { state } = editor
  const { selection } = state
  const isValid =
    isTextSelection(selection) &&
    !selection.empty &&
    !selection.$from.parent.type.spec.code &&
    !isNodeSelection(selection)

  return isValid
}

/**
 * Gets the bounding rect of the current selection in the editor.
 */
export const getSelectionBoundingRect = (editor: Editor): DOMRect | null => {
  const { state } = editor.view
  const { selection } = state
  const { ranges } = selection

  const from = Math.min(...ranges.map((range) => range.$from.pos))
  const to = Math.max(...ranges.map((range) => range.$to.pos))

  if (isNodeSelection(selection)) {
    const node = editor.view.nodeDOM(from) as HTMLElement
    if (node) {
      return node.getBoundingClientRect()
    }
  }

  return posToDOMRect(editor.view, from, to)
}

/**
 * Generates a deterministic avatar URL from a user name
 */
export const getAvatar = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }

  const randomFraction = (Math.abs(hash) % 1000000) / 1000000
  const id = 1 + Math.floor(randomFraction * 20)
  const idString = id.toString().padStart(2, "0")
  return `/avatars/memoji_${idString}.png`
}

/**
 * Fetch collaboration JWT token from the API
 */
export const fetchCollabToken = async () => {
  if (!TIPTAP_COLLAB_IS_CONFIGURED) {
    return null
  }

  if (USE_JWT_TOKEN_API_ENDPOINT) {
    try {
      // Example API endpoint that returns a JWT token.
      // TODO: implement this API endpoint in your app
      const response = await fetch(`/api/collaboration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`)
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error("Failed to fetch collaboration token:", error)
      return null
    }
  }

  if (!TIPTAP_COLLAB_TOKEN) {
    return null
  }

  return TIPTAP_COLLAB_TOKEN
}

/**
 * Fetch AI JWT token from the API
 */
export const fetchAiToken = async () => {
  if (!TIPTAP_AI_IS_CONFIGURED) {
    return null
  }

  if (USE_JWT_TOKEN_API_ENDPOINT) {
    try {
      // Example API endpoint that returns a JWT token.
      // TODO: implement this API endpoint in your app
      const response = await fetch(`/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`)
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error("Failed to fetch AI token:", error)
      return null
    }
  }

  if (!TIPTAP_AI_TOKEN) {
    return null
  }

  return TIPTAP_AI_TOKEN
}
