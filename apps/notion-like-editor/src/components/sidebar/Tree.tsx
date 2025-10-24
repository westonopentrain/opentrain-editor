import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'

import type { SidebarDoc } from './Sidebar'

interface TreeProps {
  docs: SidebarDoc[]
  rootId: string | null
  activeDocId: string | null
  canEdit: boolean
  disableNavigation: boolean
  actionPending: boolean
  onSelect: (docId: string) => void
  onCreate: (parentId: string | null) => Promise<void> | void
  onRename: (docId: string, title: string) => Promise<boolean>
  onDelete: (docId: string) => Promise<boolean>
  pendingRenameId: string | null
  onPendingRenameHandled?: (handledId: string | null) => void
}

export function Tree(props: TreeProps) {
  const {
    docs,
    rootId,
    activeDocId,
    canEdit,
    disableNavigation,
    actionPending,
    onSelect,
    onCreate,
    onRename,
    onDelete,
    pendingRenameId,
    onPendingRenameHandled,
  } = props

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const docMap = useMemo(() => {
    const map = new Map<string, SidebarDoc>()
    docs.forEach((doc) => {
      map.set(doc.id, doc)
    })
    return map
  }, [docs])

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, SidebarDoc[]>()
    docs.forEach((doc) => {
      const parentKey = doc.parentId ?? null
      const list = map.get(parentKey)
      if (list) {
        list.push(doc)
      } else {
        map.set(parentKey, [doc])
      }
    })
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.position !== b.position) {
          return a.position - b.position
        }
        return a.title.localeCompare(b.title)
      })
    })
    return map
  }, [docs])

  useEffect(() => {
    if (!editingId) {
      return
    }
    if (!docMap.has(editingId)) {
      setEditingId(null)
      setDraftTitle('')
    }
  }, [docMap, editingId])

  useEffect(() => {
    if (!pendingRenameId) {
      return
    }
    const target = docMap.get(pendingRenameId)
    if (!target || !canEdit) {
      onPendingRenameHandled?.(pendingRenameId)
      return
    }
    setEditingId(target.id)
    setDraftTitle(target.title)
    onPendingRenameHandled?.(pendingRenameId)
  }, [pendingRenameId, docMap, canEdit, onPendingRenameHandled])

  const handleStartRename = useCallback(
    (doc: SidebarDoc) => {
      if (!canEdit) {
        return
      }
      setEditingId(doc.id)
      setDraftTitle(doc.title)
      onSelect(doc.id)
    },
    [canEdit, onSelect]
  )

  const handleRenameSubmit = useCallback(
    async (doc: SidebarDoc, title: string) => {
      const success = await onRename(doc.id, title)
      if (success) {
        setEditingId(null)
        setDraftTitle('')
      }
    },
    [onRename]
  )

  const handleDelete = useCallback(
    async (doc: SidebarDoc) => {
      const success = await onDelete(doc.id)
      if (success && editingId === doc.id) {
        setEditingId(null)
        setDraftTitle('')
      }
    },
    [editingId, onDelete]
  )

  const computeDescendantCount = useCallback(
    (docId: string) => {
      let count = 0
      const stack = [...(childrenMap.get(docId) ?? [])]
      while (stack.length) {
        const current = stack.pop()!
        count += 1
        const children = childrenMap.get(current.id)
        if (children && children.length) {
          stack.push(...children)
        }
      }
      return count
    },
    [childrenMap]
  )

  const renderNode = (node: SidebarDoc, depth: number): ReactElement => {
    const isActive = activeDocId === node.id
    const isEditing = editingId === node.id
    const nodeTitle = isEditing ? draftTitle : node.title
    const indent = `${0.75 + depth * 0.75}rem`
    const childNodes = childrenMap.get(node.id) ?? []

    const itemClassName = [
      'notion-sidebar-tree__item',
      isActive ? 'is-active' : '',
      isEditing ? 'is-editing' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const handleSelect = () => {
      if (disableNavigation) {
        return
      }
      onSelect(node.id)
    }

    const handleCreateChild = () => {
      if (!canEdit || actionPending) {
        return
      }
      void onCreate(node.id)
    }

    const handleRenameClick = () => {
      if (!canEdit || actionPending) {
        return
      }
      handleStartRename(node)
    }

    const handleDeleteClick = async () => {
      if (!canEdit || actionPending || node.id === rootId) {
        return
      }
      const descendantCount = computeDescendantCount(node.id)
      const message =
        descendantCount > 0
          ? 'Delete this page and its subpages? This cannot be undone.'
          : 'Delete this page? This cannot be undone.'
      const confirmed = window.confirm(message)
      if (!confirmed) {
        return
      }
      await handleDelete(node)
    }

    const handleInputKeyDown = async (
      event: KeyboardEvent<HTMLInputElement>
    ) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        await handleRenameSubmit(node, draftTitle)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setEditingId(null)
        setDraftTitle('')
      }
    }

    const handleBlur = async () => {
      if (!isEditing) {
        return
      }
      await handleRenameSubmit(node, draftTitle)
    }

    return (
      <div key={node.id} className="notion-sidebar-tree__node">
        <div className={itemClassName} style={{ paddingLeft: indent }}>
          {isEditing ? (
            <input
              className="notion-sidebar-tree__input"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleBlur}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="notion-sidebar-tree__title"
              onClick={handleSelect}
              disabled={disableNavigation}
              title={node.title}
            >
              {nodeTitle}
            </button>
          )}
          {canEdit ? (
            <div className="notion-sidebar-tree__actions">
              <button
                type="button"
                className="notion-sidebar-tree__action"
                onClick={handleCreateChild}
                disabled={actionPending}
                title="Add subpage"
              >
                +
              </button>
              <button
                type="button"
                className="notion-sidebar-tree__action"
                onClick={handleRenameClick}
                disabled={actionPending}
                title="Rename page"
              >
                ✎
              </button>
              <button
                type="button"
                className="notion-sidebar-tree__action"
                onClick={handleDeleteClick}
                disabled={actionPending || node.id === rootId}
                title={
                  node.id === rootId
                    ? 'Root page cannot be deleted'
                    : 'Delete page'
                }
              >
                🗑
              </button>
            </div>
          ) : null}
        </div>
        {childNodes.length ? (
          <div className="notion-sidebar-tree__children">
            {childNodes.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  const rootDoc = rootId ? docMap.get(rootId) ?? null : null
  const roots = rootDoc ? [rootDoc] : childrenMap.get(null) ?? []

  return <div className="notion-sidebar-tree">{roots.map((node) => renderNode(node, 0))}</div>
}
