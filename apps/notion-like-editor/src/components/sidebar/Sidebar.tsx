import { useCallback } from 'react'

import { Tree } from './Tree'
import './sidebar.css'

export interface SidebarDoc {
  id: string
  title: string
  parentId: string | null
  position: number
}

interface SidebarProps {
  docs: SidebarDoc[]
  rootId: string | null
  activeDocId: string | null
  loading: boolean
  actionPending: boolean
  canEdit: boolean
  disableNavigation: boolean
  onSelect: (docId: string) => void
  onCreate: (parentId: string | null) => Promise<void> | void
  onRename: (docId: string, title: string) => Promise<boolean>
  onDelete: (docId: string) => Promise<boolean>
  onMove: (
    docId: string,
    targetParentId: string | null,
    targetIndex: number
  ) => Promise<boolean>
  error?: string | null
  pendingRenameId: string | null
  onPendingRenameHandled?: (handledId: string | null) => void
}

export function Sidebar(props: SidebarProps) {
  const {
    docs,
    rootId,
    activeDocId,
    loading,
    actionPending,
    canEdit,
    disableNavigation,
    onSelect,
    onCreate,
    onRename,
    onDelete,
    onMove,
    error,
    pendingRenameId,
    onPendingRenameHandled,
  } = props

  const handleCreateRoot = useCallback(() => {
    void onCreate(null)
  }, [onCreate])

  const disableCreate =
    !canEdit || actionPending || disableNavigation || loading

  const showEmptyState = !loading && docs.length === 0

  return (
    <aside className="notion-shell__sidebar notion-sidebar">
      <div className="notion-sidebar__header">
        <h2 className="notion-sidebar__title">Pages</h2>
        {canEdit ? (
          <button
            type="button"
            className="notion-sidebar__create-button"
            onClick={handleCreateRoot}
            disabled={disableCreate}
          >
            New page
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="notion-sidebar__error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="notion-sidebar__tree">
        {loading ? (
          <div className="notion-sidebar__empty">Loading pages…</div>
        ) : showEmptyState ? (
          <div className="notion-sidebar__empty">No pages yet.</div>
        ) : (
          <Tree
            docs={docs}
            rootId={rootId}
            activeDocId={activeDocId}
            canEdit={canEdit}
            disableNavigation={disableNavigation}
            actionPending={actionPending}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
            pendingRenameId={pendingRenameId}
            onPendingRenameHandled={onPendingRenameHandled}
          />
        )}
      </div>
    </aside>
  )
}

export default Sidebar
