import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
} from 'react'

import type { SidebarDoc } from './Sidebar'

const ICON_SIZE = 20

const EditIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
  >
    <path
      d="m5 17.5-.5 3.5 3.5-.5 10-10-3-3-10 10Z"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m14.5 7 2 2 1.88-1.88a1.5 1.5 0 0 0 0-2.12L16.99 2.5a1.5 1.5 0 0 0-2.12 0L13 4.38"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const DeleteIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
  >
    <path
      d="M5 7h14"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 7V5.5a2.5 2.5 0 0 1 2.5-2.5h1A2.5 2.5 0 0 1 15 5.5V7"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 11v6M12 11v6M15 11v6"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 7h10v11.5A2.5 2.5 0 0 1 14.5 21h-5A2.5 2.5 0 0 1 7 18.5V7Z"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

interface TreeProps {
  docs: SidebarDoc[]
  rootId: string | null
  activeDocId: string | null
  canEdit: boolean
  disableNavigation: boolean
  actionPending: boolean
  onSelect: (docId: string) => void
  onRename: (docId: string, title: string) => Promise<boolean>
  onDelete: (docId: string) => Promise<boolean>
  onMove: (
    docId: string,
    targetParentId: string | null,
    targetIndex: number
  ) => Promise<boolean>
  pendingRenameId: string | null
  onPendingRenameHandled?: (handledId: string | null) => void
}

type DropIndicator = {
  id: string
  position: 'before' | 'after'
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
    onRename,
    onDelete,
    onMove,
    pendingRenameId,
    onPendingRenameHandled,
  } = props

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set()
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null
  )
  const [childDropTarget, setChildDropTarget] = useState<string | null>(null)
  const [rootDropActive, setRootDropActive] = useState(false)

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

  const rootDoc = useMemo(
    () => (rootId ? docMap.get(rootId) ?? null : null),
    [docMap, rootId]
  )

  const roots = useMemo(
    () => (rootDoc ? [rootDoc] : childrenMap.get(null) ?? []),
    [rootDoc, childrenMap]
  )

  const depthMap = useMemo(() => {
    const map = new Map<string, number>()
    const stack: Array<{ node: SidebarDoc; depth: number }> = []
    roots.forEach((node) => {
      stack.push({ node, depth: 0 })
    })

    while (stack.length > 0) {
      const { node, depth } = stack.pop()!
      const existingDepth = map.get(node.id)
      if (existingDepth !== undefined && existingDepth <= depth) {
        continue
      }
      map.set(node.id, depth)
      const children = childrenMap.get(node.id) ?? []
      children.forEach((child) => {
        stack.push({ node: child, depth: depth + 1 })
      })
    }

    return map
  }, [roots, childrenMap])

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

  useEffect(() => {
    if (!activeDocId) {
      return
    }
    setCollapsedIds((prev) => {
      let changed = false
      const next = new Set(prev)
      let currentId: string | null = activeDocId
      const visited = new Set<string>()
      while (currentId) {
        const parentId: string | null =
          docMap.get(currentId)?.parentId ?? null
        if (!parentId || visited.has(parentId)) {
          break
        }
        if (next.has(parentId)) {
          next.delete(parentId)
          changed = true
        }
        visited.add(parentId)
        currentId = parentId
      }
      return changed ? next : prev
    })
  }, [activeDocId, docMap])

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

  const toggleCollapsed = useCallback((docId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }, [])

  const allowDrag = canEdit && !actionPending && !disableNavigation

  const wouldCreateCycle = useCallback(
    (dragId: string, targetParentId: string | null) => {
      if (!targetParentId) {
        return false
      }
      let current: string | null = targetParentId
      const visited = new Set<string>()
      while (current) {
        if (current === dragId) {
          return true
        }
        if (visited.has(current)) {
          break
        }
        visited.add(current)
        const parent = docMap.get(current)
        current = parent?.parentId ?? null
      }
      return false
    },
    [docMap]
  )

  const canDropIntoParent = useCallback(
    (dragId: string | null, parentId: string | null) => {
      if (!dragId) {
        return false
      }
      if (parentId === dragId) {
        return false
      }
      if (parentId) {
        const parentDepth = depthMap.get(parentId) ?? 0
        if (parentDepth >= 1) {
          return false
        }
      }
      if (wouldCreateCycle(dragId, parentId)) {
        return false
      }
      return true
    },
    [depthMap, wouldCreateCycle]
  )

  const canDropAlongside = useCallback(
    (dragId: string | null, targetId: string) => {
      if (!dragId || dragId === targetId) {
        return false
      }
      const targetDoc = docMap.get(targetId)
      if (!targetDoc) {
        return false
      }
      const targetParent = targetDoc.parentId ?? null
      if (targetParent === dragId) {
        return false
      }
      if (wouldCreateCycle(dragId, targetParent)) {
        return false
      }
      return true
    },
    [docMap, wouldCreateCycle]
  )

  const rootDropParentId = rootDoc ? rootDoc.id : null

  const handleRootDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!allowDrag || !draggingId) {
        return
      }
      if (!canDropIntoParent(draggingId, rootDropParentId)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setDropIndicator(null)
      setChildDropTarget(null)
      setRootDropActive(true)
      event.dataTransfer.dropEffect = 'move'
    },
    [allowDrag, canDropIntoParent, draggingId, rootDropParentId]
  )

  const handleRootDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null
    if (!related || !event.currentTarget.contains(related)) {
      setRootDropActive(false)
    }
  }, [])

  const handleRootDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!draggingId) {
        return
      }
      if (!canDropIntoParent(draggingId, rootDropParentId)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setRootDropActive(false)
      setDropIndicator(null)
      setChildDropTarget(null)

      const siblings =
        rootDropParentId !== null
          ? childrenMap.get(rootDropParentId) ?? []
          : childrenMap.get(null) ?? []

      const dragId = draggingId

      if (rootDropParentId) {
        setCollapsedIds((prev) => {
          if (!prev.has(rootDropParentId)) {
            return prev
          }
          const next = new Set(prev)
          next.delete(rootDropParentId)
          return next
        })
      }

      await onMove(dragId, rootDropParentId, siblings.length)
    },
    [draggingId, canDropIntoParent, rootDropParentId, childrenMap, onMove]
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
    const indent = `${1 + depth * 0.75}rem`
    const childNodes = childrenMap.get(node.id) ?? []
    const isCollapsible = childNodes.length > 0
    const isCollapsed = isCollapsible && collapsedIds.has(node.id)
    const isRootDoc = Boolean(rootId && node.id === rootId)
    const allowNodeDrag = allowDrag && !isRootDoc && !isEditing

    const nodeClassName = [
      'notion-sidebar-tree__node',
      dropIndicator?.id === node.id && dropIndicator.position === 'before'
        ? 'is-drop-before'
        : '',
      dropIndicator?.id === node.id && dropIndicator.position === 'after'
        ? 'is-drop-after'
        : '',
      draggingId === node.id ? 'is-dragging' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const itemClassName = [
      'notion-sidebar-tree__item',
      isActive ? 'is-active' : '',
      isEditing ? 'is-editing' : '',
      allowNodeDrag ? 'is-draggable' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const childrenClassName = [
      'notion-sidebar-tree__children',
      isCollapsed ? 'is-collapsed' : '',
      childDropTarget === node.id ? 'is-drop-target' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const handleSelect = () => {
      if (disableNavigation) {
        return
      }
      onSelect(node.id)
    }

    const handleRenameClick = async () => {
      if (!canEdit || actionPending) {
        return
      }
      if (isEditing) {
        await handleRenameSubmit(node, draftTitle)
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

    const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
      if (!allowNodeDrag) {
        return
      }
      setDraggingId(node.id)
      setDropIndicator(null)
      setChildDropTarget(null)
      setRootDropActive(false)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', node.id)
    }

    const handleDragEnd = () => {
      setDraggingId((current) => (current === node.id ? null : current))
      setDropIndicator((current) =>
        current && current.id === node.id ? null : current
      )
      setChildDropTarget((current) =>
        current === node.id ? null : current
      )
      setRootDropActive(false)
    }

    const handleDragOverItem = (event: DragEvent<HTMLDivElement>) => {
      if (!allowDrag || !draggingId || draggingId === node.id) {
        return
      }
      if (!canDropAlongside(draggingId, node.id)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      const before = event.clientY < rect.top + rect.height / 2
      setDropIndicator({ id: node.id, position: before ? 'before' : 'after' })
      setChildDropTarget(null)
      setRootDropActive(false)
      event.dataTransfer.dropEffect = 'move'
    }

    const handleDragLeaveItem = (event: DragEvent<HTMLDivElement>) => {
      if (!draggingId) {
        return
      }
      const related = event.relatedTarget as Node | null
      if (related && event.currentTarget.contains(related)) {
        return
      }
      setDropIndicator((current) =>
        current && current.id === node.id ? null : current
      )
    }

    const handleDropOnItem = async (event: DragEvent<HTMLDivElement>) => {
      const dragId = draggingId
      if (!dragId || !canDropAlongside(dragId, node.id)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const indicator = dropIndicator
      setDropIndicator(null)
      setChildDropTarget(null)
      setRootDropActive(false)
      if (!indicator) {
        return
      }
      const parentKey = node.parentId ?? null
      const siblings = childrenMap.get(parentKey) ?? []
      const targetIndex = siblings.findIndex((child) => child.id === node.id)
      if (targetIndex === -1) {
        return
      }
      const insertIndex =
        indicator.position === 'before' ? targetIndex : targetIndex + 1
      await onMove(dragId, parentKey, insertIndex)
    }

    const handleChildrenDragOver = (event: DragEvent<HTMLDivElement>) => {
      if (!allowDrag || !draggingId) {
        return
      }
      if (!canDropIntoParent(draggingId, node.id)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setDropIndicator(null)
      setChildDropTarget(node.id)
      setRootDropActive(false)
      event.dataTransfer.dropEffect = 'move'
    }

    const handleChildrenDragLeave = (event: DragEvent<HTMLDivElement>) => {
      const related = event.relatedTarget as Node | null
      if (related && event.currentTarget.contains(related)) {
        return
      }
      setChildDropTarget((current) => (current === node.id ? null : current))
    }

    const handleChildrenDrop = async (event: DragEvent<HTMLDivElement>) => {
      const dragId = draggingId
      if (!dragId || !canDropIntoParent(dragId, node.id)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setChildDropTarget((current) => (current === node.id ? null : current))
      setDropIndicator(null)
      setRootDropActive(false)
      const targetChildren = childrenMap.get(node.id) ?? []
      setCollapsedIds((prev) => {
        if (!prev.has(node.id)) {
          return prev
        }
        const next = new Set(prev)
        next.delete(node.id)
        return next
      })
      await onMove(dragId, node.id, targetChildren.length)
    }

    return (
      <div key={node.id} className={nodeClassName}>
        <div
          className={itemClassName}
          style={{ paddingLeft: indent }}
          draggable={allowNodeDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={allowDrag ? handleDragOverItem : undefined}
          onDragLeave={allowDrag ? handleDragLeaveItem : undefined}
          onDrop={allowDrag ? handleDropOnItem : undefined}
        >
          <div className="notion-sidebar-tree__item-row">
            {isCollapsible ? (
              <button
                type="button"
                className={`notion-sidebar-tree__toggle${
                  isCollapsed ? ' is-collapsed' : ''
                }`}
                onClick={() => toggleCollapsed(node.id)}
                aria-label={
                  isCollapsed ? 'Expand subpages' : 'Collapse subpages'
                }
                aria-expanded={!isCollapsed}
                onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation()
                }}
              >
                <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span>
              </button>
            ) : (
              <span className="notion-sidebar-tree__toggle notion-sidebar-tree__toggle--spacer" />
            )}
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
                  className="notion-sidebar-tree__icon-button"
                  onClick={handleRenameClick}
                  disabled={actionPending}
                  title="Rename page"
                  aria-label="Rename page"
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="notion-sidebar-tree__icon-button"
                  onClick={handleDeleteClick}
                  disabled={actionPending || node.id === rootId}
                  title={
                    node.id === rootId
                      ? 'Root page cannot be deleted'
                      : 'Delete page'
                  }
                  aria-label={
                    node.id === rootId
                      ? 'Root page cannot be deleted'
                      : 'Delete page'
                  }
                >
                  <DeleteIcon />
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={childrenClassName}
          onDragOver={allowDrag ? handleChildrenDragOver : undefined}
          onDragLeave={allowDrag ? handleChildrenDragLeave : undefined}
          onDrop={allowDrag ? handleChildrenDrop : undefined}
        >
          {!isCollapsed
            ? childNodes.map((child) => renderNode(child, depth + 1))
            : null}
        </div>
      </div>
    )
  }

  const canShowRootDrop =
    allowDrag && draggingId !== null && canDropIntoParent(draggingId, rootDropParentId)

  return (
    <div className="notion-sidebar-tree">
      {roots.map((node) => renderNode(node, 0))}
      {canShowRootDrop ? (
        <div
          className={`notion-sidebar-tree__root-drop${
            rootDropActive ? ' is-drop-target' : ''
          }`}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          {rootDropActive ? 'Drop here to move to main pages' : null}
        </div>
      ) : null}
    </div>
  )
}
