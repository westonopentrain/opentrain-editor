// --- Tiptap UI ---
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- UI Primitives ---
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import { ButtonGroup } from "@/components/tiptap-ui-primitive/button"

// --- Styles ---
import "@/components/tiptap-templates/notion-like/notion-like-editor-header.scss"

import { CollaborationUsers } from "@/components/tiptap-templates/notion-like/notion-like-editor-collaboration-users"

export function NotionEditorHeader({
  statusText,
}: {
  statusText?: string
}) {
  return (
    <header className="notion-like-editor-header">
      <div className="notion-like-editor-header-status">
        {statusText || null}
      </div>
      <Spacer />
      <div className="notion-like-editor-header-actions">
        <ButtonGroup orientation="horizontal">
          <UndoRedoButton action="undo" />
          <UndoRedoButton action="redo" />
        </ButtonGroup>

        <Separator />

        <CollaborationUsers />
      </div>
    </header>
  )
}
