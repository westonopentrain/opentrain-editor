import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { NotionEditor } from './components/tiptap-templates/notion-like/notion-like-editor'
import { Sidebar, type SidebarDoc } from './components/sidebar/Sidebar'
import { uploadImage } from './lib/upload'

const AUTOSAVE_DELAY_MS = 1200
const DEFAULT_HTML = '<p></p>'

const UNTITLED_TITLE = 'Untitled'

const SESSION_EXPIRED_MESSAGE = 'Session expired — refresh this page.'

function getEditorRootEl(): HTMLElement | null {
  // TipTap renders a .ProseMirror element; select the first one in the editor pane
  return document.querySelector('.ProseMirror') as HTMLElement | null
}

function getImageFilesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = []
  // prefer .files (works for paste and drop)
  for (const f of Array.from(dt.files || [])) {
    if (f && f.type && f.type.startsWith('image/')) out.push(f)
  }
  // some browsers expose images as items (pasted images)
  if (out.length === 0 && dt.items) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f && f.type.startsWith('image/')) out.push(f)
      }
    }
  }
  return out
}

type SaveState = 'loading' | 'saving' | 'saved' | 'error'

type ScopeDocInput = Record<string, unknown> | null | undefined

interface TokenInfo {
  token: string
  docId: string
  jobId: string | null
  folderId: string | null
  scopeId: string | null
  perms: 'rw' | 'ro'
  raw: Record<string, unknown>
}

interface TokenParseResult {
  tokenInfo: TokenInfo | null
  error?: string
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = atob(padded)
    return JSON.parse(json)
  } catch (error) {
    console.warn('Failed to decode token payload', error)
    return null
  }
}

function parseTokenFromSearch(search: string): TokenParseResult {
  const params = new URLSearchParams(search)
  const rawToken = params.get('token')?.trim()

  if (!rawToken) {
    return { tokenInfo: null, error: 'Missing access token.' }
  }

  const payload = decodeJwtPayload(rawToken)
  if (!payload || typeof payload !== 'object') {
    return { tokenInfo: null, error: 'Invalid access token.' }
  }

  const docId = typeof payload.docId === 'string' ? payload.docId : null
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : null
  const folderId = typeof payload.folderId === 'string' ? payload.folderId : null
  const permsRaw =
    typeof payload.perms === 'string' ? payload.perms.toLowerCase() : 'rw'
  const perms: 'rw' | 'ro' = permsRaw === 'ro' ? 'ro' : 'rw'

  if (!docId) {
    return { tokenInfo: null, error: 'Token is missing a document id.' }
  }

  if (perms === 'rw' && !jobId && !folderId) {
    return {
      tokenInfo: null,
      error: 'Write access requires a job or folder id in the token.',
    }
  }

  const scopeId = jobId ?? (folderId ? `folder-${folderId}` : null)

  return {
    tokenInfo: {
      token: rawToken,
      docId,
      jobId,
      folderId,
      scopeId,
      perms,
      raw: payload as Record<string, unknown>,
    },
  }
}

function parseScopeDoc(input: ScopeDocInput): SidebarDoc | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const id = typeof input.id === 'string' ? input.id : null
  if (!id) {
    return null
  }

  const rawTitle =
    typeof input.title === 'string' && input.title.trim().length
      ? input.title.trim()
      : UNTITLED_TITLE

  const parentRaw = (input as { folderId?: unknown }).folderId
  const parentId =
    typeof parentRaw === 'string' && parentRaw.trim().length
      ? parentRaw.trim()
      : null

  const positionRaw = (input as { position?: unknown }).position
  const position = (() => {
    if (typeof positionRaw === 'number' && Number.isFinite(positionRaw)) {
      return positionRaw
    }
    const numeric = Number(positionRaw)
    return Number.isFinite(numeric) ? numeric : 0
  })()

  return { id, title: rawTitle, parentId, position }
}

function normalizeScopeDocs(
  payload: unknown,
  rootId: string | null
): SidebarDoc[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const normalized = payload
    .map((value) => parseScopeDoc(value))
    .filter((value): value is SidebarDoc => Boolean(value))

  if (!rootId) {
    return normalized
  }

  const byId = new Map(normalized.map((doc) => [doc.id, doc]))
  if (!byId.has(rootId)) {
    return normalized
  }

  const allowed = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (allowed.has(current)) {
      continue
    }
    allowed.add(current)
    normalized.forEach((doc) => {
      if (doc.parentId === current) {
        stack.push(doc.id)
      }
    })
  }

  return normalized.filter((doc) => allowed.has(doc.id))
}

function determineInitialActiveDoc(
  docs: SidebarDoc[],
  rootId: string | null,
  urlDocId: string | null,
  tokenDocId: string | null
): string | null {
  const candidates = [urlDocId, tokenDocId, rootId]
  for (const candidate of candidates) {
    if (candidate && docs.some((doc) => doc.id === candidate)) {
      return candidate
    }
  }
  return docs.length ? docs[0]!.id : null
}

function determineFallbackActiveDoc(
  docs: SidebarDoc[],
  rootId: string | null,
  currentActive: string | null
): string | null {
  if (currentActive && docs.some((doc) => doc.id === currentActive)) {
    return currentActive
  }
  if (rootId && docs.some((doc) => doc.id === rootId)) {
    return rootId
  }
  return docs.length ? docs[0]!.id : null
}

function collectDescendantIds(docs: SidebarDoc[], docId: string): Set<string> {
  const result = new Set<string>()
  const stack = [docId]
  while (stack.length) {
    const current = stack.pop()!
    if (result.has(current)) {
      continue
    }
    result.add(current)
    docs.forEach((doc) => {
      if (doc.parentId === current) {
        stack.push(doc.id)
      }
    })
  }
  return result
}

interface MoveUpdate {
  id: string
  position: number
  parentId: string | null
}

interface MoveResult {
  nextDocs: SidebarDoc[]
  updates: MoveUpdate[]
}

function applyMove(
  docs: SidebarDoc[],
  docId: string,
  targetParentId: string | null,
  targetIndex: number
): MoveResult | null {
  const doc = docs.find((item) => item.id === docId)
  if (!doc) {
    return null
  }

  const normalizedTargetParent = targetParentId ?? null
  if (normalizedTargetParent === docId) {
    return null
  }

  const descendants = collectDescendantIds(docs, docId)
  if (normalizedTargetParent && descendants.has(normalizedTargetParent)) {
    return null
  }

  const currentParent = doc.parentId ?? null
  const siblings = docs.filter(
    (item) => (item.parentId ?? null) === currentParent
  )
  const currentIndex = siblings.findIndex((item) => item.id === docId)
  if (currentIndex === -1) {
    return null
  }

  const targetSiblingsBase = docs.filter(
    (item) => (item.parentId ?? null) === normalizedTargetParent
  )
  const targetLength = targetSiblingsBase.length
  const clampedIndex = Math.max(
    0,
    Math.min(Math.floor(targetIndex), targetLength)
  )

  let insertIndex = clampedIndex
  if (normalizedTargetParent === currentParent && currentIndex < insertIndex) {
    insertIndex -= 1
  }
  if (insertIndex < 0) {
    insertIndex = 0
  }

  const nextDocs = docs.map((item) => ({ ...item }))
  const docCopy = nextDocs.find((item) => item.id === docId)
  if (!docCopy) {
    return null
  }

  const targetSiblings = nextDocs.filter(
    (item) => (item.parentId ?? null) === normalizedTargetParent && item.id !== docId
  )
  if (insertIndex > targetSiblings.length) {
    insertIndex = targetSiblings.length
  }

  if (normalizedTargetParent === currentParent && insertIndex === currentIndex) {
    return null
  }

  targetSiblings.splice(insertIndex, 0, docCopy)

  const updateMap = new Map<string, MoveUpdate>()

  const assignPositions = (
    list: SidebarDoc[],
    parentId: string | null
  ) => {
    list.forEach((item, index) => {
      const nextPosition = (index + 1) * 100
      const existingParent = item.parentId ?? null
      if (
        item.position !== nextPosition ||
        existingParent !== parentId
      ) {
        item.position = nextPosition
        item.parentId = parentId
        updateMap.set(item.id, {
          id: item.id,
          position: nextPosition,
          parentId,
        })
      }
    })
  }

  assignPositions(targetSiblings, normalizedTargetParent)

  if (normalizedTargetParent !== currentParent) {
    const oldSiblings = nextDocs.filter(
      (item) => (item.parentId ?? null) === currentParent && item.id !== docId
    )
    assignPositions(oldSiblings, currentParent)
  }

  return { nextDocs, updates: Array.from(updateMap.values()) }
}

function App() {
  const tokenResult = useMemo<TokenParseResult>(() => {
    if (typeof window === 'undefined') {
      return { tokenInfo: null, error: 'Missing access token.' }
    }
    return parseTokenFromSearch(window.location.search)
  }, [])

  const tokenInfo = tokenResult.tokenInfo
  const tokenError = tokenResult.error
  const isReadOnly = tokenInfo?.perms !== 'rw'

  const initialDocFromUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const params = new URLSearchParams(window.location.search)
    const docParam = params.get('doc')?.trim()
    return docParam && docParam.length ? docParam : null
  }, [])

  const [initialHtml, setInitialHtml] = useState<string | null>(null)
  const [docLoaded, setDocLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')

  const [rootId, setRootId] = useState<string | null>(null)
  const [docs, setDocs] = useState<SidebarDoc[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [activeInitialized, setActiveInitialized] = useState(false)
  const [sidebarLoading, setSidebarLoading] = useState(true)
  const [sidebarActionPending, setSidebarActionPending] = useState(false)
  const [sidebarError, setSidebarError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null)

  const editorRef = useRef<Editor | null>(null)
  const lastSavedHtmlRef = useRef<string>(DEFAULT_HTML)
  const saveTimerRef = useRef<number | null>(null)
  const activeDocIdRef = useRef<string | null>(null)
  const rootIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    activeDocIdRef.current = activeDocId
  }, [activeDocId])

  useEffect(() => {
    rootIdRef.current = rootId
  }, [rootId])

  useEffect(() => {
    if (!tokenInfo) {
      setDocs([])
      setRootId(null)
      setActiveDocId(null)
      setActiveInitialized(false)
      setSessionExpired(false)
    }
  }, [tokenInfo])

  useEffect(() => {
    if (!tokenInfo) {
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const loadScope = async () => {
      setSidebarLoading(true)
      setSidebarError(null)

      try {
        const ensureResp = await fetch('/api/scope/ensure-root', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenInfo.token}` },
          signal: controller.signal,
        })

        if (ensureResp.status === 401) {
          if (!cancelled) {
            setSessionExpired(true)
            setSidebarError(SESSION_EXPIRED_MESSAGE)
          }
          return
        }

        if (!ensureResp.ok) {
          throw new Error(`ensure-root failed: ${ensureResp.status}`)
        }

        const ensureData = await ensureResp.json().catch(() => ({}))
        const ensuredRootId =
          typeof ensureData?.rootId === 'string' ? ensureData.rootId : null

        const docsResp = await fetch('/api/scope/docs', {
          headers: { Authorization: `Bearer ${tokenInfo.token}` },
          signal: controller.signal,
        })

        if (docsResp.status === 401) {
          if (!cancelled) {
            setSessionExpired(true)
            setSidebarError(SESSION_EXPIRED_MESSAGE)
          }
          return
        }

        if (!docsResp.ok) {
          throw new Error(`scope docs failed: ${docsResp.status}`)
        }

        const docsPayload = await docsResp.json().catch(() => [])
        if (cancelled) {
          return
        }

        const normalizedDocs = normalizeScopeDocs(docsPayload, ensuredRootId)
        setRootId(ensuredRootId)
        setDocs(normalizedDocs)

        const currentActive = activeDocIdRef.current
        let nextActive: string | null

        if (!activeInitialized) {
          nextActive = determineInitialActiveDoc(
            normalizedDocs,
            ensuredRootId,
            initialDocFromUrl,
            tokenInfo.docId
          )
          setActiveInitialized(true)
        } else {
          nextActive = determineFallbackActiveDoc(
            normalizedDocs,
            ensuredRootId,
            currentActive
          )
        }

        if (nextActive !== currentActive) {
          setActiveDocId(nextActive)
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) {
          return
        }
        console.error('Failed to load scope docs', error)
        setSidebarError('Unable to load pages for this scope.')
      } finally {
        if (!cancelled) {
          setSidebarLoading(false)
        }
      }
    }

    loadScope()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tokenInfo, initialDocFromUrl, activeInitialized])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!activeDocId) {
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (params.get('doc') === activeDocId) {
      return
    }
    params.set('doc', activeDocId)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}`
    )
  }, [activeDocId])

  useEffect(() => {
    if (!tokenInfo || !activeDocId) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    setLoadError(null)
    setSaveError(null)
    setSaveState('loading')
    setDocLoaded(false)
    setInitialHtml(DEFAULT_HTML)
    lastSavedHtmlRef.current = DEFAULT_HTML

    const controller = new AbortController()
    let cancelled = false
    const currentDocId = activeDocId

    const loadDocument = async () => {
      try {
        const response = await fetch(`/api/docs/${encodeURIComponent(currentDocId)}`, {
          headers: { Authorization: `Bearer ${tokenInfo.token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          if (!cancelled) {
            setSessionExpired(true)
            setLoadError(SESSION_EXPIRED_MESSAGE)
            setSaveState('error')
          }
          return
        }

        if (response.status === 404) {
          if (cancelled) return
          lastSavedHtmlRef.current = DEFAULT_HTML
          setInitialHtml(DEFAULT_HTML)
          setDocLoaded(true)
          setSaveState('saved')
          return
        }

        if (!response.ok) {
          throw new Error(`status ${response.status}`)
        }

        const data = await response.json().catch(() => ({}))
        const htmlSnapshot =
          typeof data?.htmlSnapshot === 'string' ? data.htmlSnapshot : ''
        const html = htmlSnapshot.trim().length ? htmlSnapshot : DEFAULT_HTML

        if (cancelled) return

        lastSavedHtmlRef.current = html
        setInitialHtml(html)
        setDocLoaded(true)
        setSaveState('saved')
      } catch (error) {
        if (controller.signal.aborted || cancelled) {
          return
        }
        console.error('Failed to load document', error)
        setLoadError('Unable to load the requested document.')
        setSaveState('error')
      }
    }

    loadDocument()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tokenInfo, activeDocId])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || initialHtml === null) {
      return
    }

    const currentHtml = editor.getHTML()
    if (currentHtml === initialHtml) {
      return
    }

    editor.commands.setContent(initialHtml, { emitUpdate: false })
  }, [initialHtml])

  // --- Paste images
  useEffect(() => {
    const el = getEditorRootEl()
    if (!el) return

    const onPaste = async (e: ClipboardEvent) => {
      if (!editorRef.current) return
      if (!tokenInfo || isReadOnly) return

      const dt = e.clipboardData
      if (!dt) return

      const images = getImageFilesFromDataTransfer(dt)
      if (!images.length) return

      e.preventDefault()

      setSaveState('saving')
      try {
        let oversize = false
        for (const file of images) {
          if (file.size > 10 * 1024 * 1024) {
            oversize = true
            continue
          }
          const { url } = await uploadImage(file)
          editorRef.current
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name })
            .run()
        }
        if (oversize) {
          setSaveState('error')
          setSaveError('Image exceeds 10MB limit.')
        } else {
          setSaveState('saved')
          setSaveError(null)
        }
      } catch (err) {
        console.error(err)
        setSaveState('error')
        setSaveError('Image upload failed.')
      }
    }

    el.addEventListener('paste', onPaste as any)
    return () => el.removeEventListener('paste', onPaste as any)
  }, [tokenInfo, isReadOnly, activeDocId])

  // --- Drag & Drop images
  useEffect(() => {
    const el = getEditorRootEl()
    if (!el) return

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return
      const images = getImageFilesFromDataTransfer(dt)
      if (images.length) {
        e.preventDefault()
        dt.dropEffect = 'copy'
      }
    }

    const onDrop = async (e: DragEvent) => {
      if (!editorRef.current) return
      if (!tokenInfo || isReadOnly) return

      const dt = e.dataTransfer
      if (!dt) return
      const images = getImageFilesFromDataTransfer(dt)
      if (!images.length) return

      e.preventDefault()

      setSaveState('saving')
      try {
        let oversize = false
        for (const file of images) {
          if (file.size > 10 * 1024 * 1024) {
            oversize = true
            continue
          }
          const { url } = await uploadImage(file)
          editorRef.current
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name })
            .run()
        }
        if (oversize) {
          setSaveState('error')
          setSaveError('Image exceeds 10MB limit.')
        } else {
          setSaveState('saved')
          setSaveError(null)
        }
      } catch (err) {
        console.error(err)
        setSaveState('error')
        setSaveError('Image upload failed.')
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [tokenInfo, isReadOnly, activeDocId])

  const handleEditorCreate = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      if (initialHtml !== null) {
        editor.commands.setContent(initialHtml, { emitUpdate: false })
      }
    },
    [initialHtml]
  )

  const handleEditorUpdate = useCallback(
    (editor: Editor) => {
      if (!tokenInfo || isReadOnly || !docLoaded || sessionExpired) {
        return
      }

      const currentDocId = activeDocIdRef.current
      if (!currentDocId) {
        return
      }

      const html = editor.getHTML()
      if (html === lastSavedHtmlRef.current) {
        if (saveTimerRef.current === null) {
          setSaveState('saved')
        }
        return
      }

      setSaveError(null)
      setSaveState('saving')

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/docs/${encodeURIComponent(currentDocId)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenInfo.token}`,
            },
            body: JSON.stringify({
              title: 'OpenTrain autosave',
              htmlSnapshot: html,
            }),
          })

          if (response.status === 401) {
            setSessionExpired(true)
            setSaveState('error')
            setSaveError(SESSION_EXPIRED_MESSAGE)
            return
          }

          if (!response.ok) {
            throw new Error(`status ${response.status}`)
          }

          await response.json().catch(() => null)
          lastSavedHtmlRef.current = html
          setSaveState('saved')
          setSaveError(null)
        } catch (error) {
          console.error('Failed to autosave document', error)
          setSaveState('error')
          setSaveError('Autosave failed. Changes may not be saved.')
        } finally {
          if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
          }
        }
      }, AUTOSAVE_DELAY_MS)
    },
    [tokenInfo, isReadOnly, docLoaded, sessionExpired]
  )

  const handleSelectDoc = useCallback(
    (docId: string) => {
      if (activeDocIdRef.current === docId) {
        return
      }
      if (saveState === 'saving' || sidebarActionPending) {
        return
      }
      setActiveDocId(docId)
    },
    [saveState, sidebarActionPending]
  )

  const refreshDocs = useCallback(async () => {
    if (!tokenInfo) {
      return
    }
    try {
      const response = await fetch('/api/scope/docs', {
        headers: { Authorization: `Bearer ${tokenInfo.token}` },
      })
      if (response.status === 401) {
        setSessionExpired(true)
        setSidebarError(SESSION_EXPIRED_MESSAGE)
        return
      }
      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }
      const payload = await response.json().catch(() => [])
      const normalized = normalizeScopeDocs(payload, rootIdRef.current)
      setDocs(normalized)
      const nextActive = determineFallbackActiveDoc(
        normalized,
        rootIdRef.current,
        activeDocIdRef.current
      )
      if (nextActive !== activeDocIdRef.current) {
        setActiveDocId(nextActive)
      }
    } catch (error) {
      console.error('Failed to refresh docs', error)
      setSidebarError('Unable to refresh pages. Please try again.')
    }
  }, [tokenInfo])

  const handleCreatePage = useCallback(
    async (parentId: string | null) => {
      if (!tokenInfo || isReadOnly) {
        return
      }
      const targetParentId = parentId ?? rootIdRef.current
      if (!targetParentId) {
        setSidebarError('Unable to determine parent page.')
        return
      }

      setSidebarError(null)
      setSidebarActionPending(true)

      try {
        const response = await fetch('/api/scope/pages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenInfo.token}`,
          },
          body: JSON.stringify({ title: UNTITLED_TITLE, parentId: targetParentId }),
        })

        if (response.status === 401) {
          setSessionExpired(true)
          setSidebarError(SESSION_EXPIRED_MESSAGE)
          return
        }

        if (response.status === 403) {
          setSidebarError('This session is read-only.')
          return
        }

        if (!response.ok) {
          throw new Error(`status ${response.status}`)
        }

        const createdPayload = await response.json().catch(() => null)
        const createdDoc = parseScopeDoc(createdPayload)

        if (!createdDoc) {
          await refreshDocs()
          return
        }

        setDocs((prevDocs) => [...prevDocs, createdDoc])
        setActiveDocId(createdDoc.id)
        setPendingRenameId(createdDoc.id)
      } catch (error) {
        console.error('Failed to create page', error)
        setSidebarError('Unable to create page. Please try again.')
      } finally {
        setSidebarActionPending(false)
      }
    },
    [tokenInfo, isReadOnly, refreshDocs]
  )

  const handleRenamePage = useCallback(
    async (docId: string, title: string): Promise<boolean> => {
      if (!tokenInfo || isReadOnly) {
        return false
      }

      const trimmed = title.trim() || UNTITLED_TITLE
      const existing = docs.find((doc) => doc.id === docId)
      if (!existing) {
        return false
      }
      if (existing.title === trimmed) {
        return true
      }

      setSidebarError(null)
      setSidebarActionPending(true)

      try {
        const response = await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenInfo.token}`,
          },
          body: JSON.stringify({ title: trimmed }),
        })

        if (response.status === 401) {
          setSessionExpired(true)
          setSidebarError(SESSION_EXPIRED_MESSAGE)
          return false
        }

        if (response.status === 403) {
          setSidebarError('This session is read-only.')
          return false
        }

        if (!response.ok) {
          throw new Error(`status ${response.status}`)
        }

        await response.json().catch(() => null)
        setDocs((prevDocs) =>
          prevDocs.map((doc) =>
            doc.id === docId ? { ...doc, title: trimmed } : doc
          )
        )
        return true
      } catch (error) {
        console.error('Failed to rename page', error)
        setSidebarError('Unable to rename page. Please try again.')
        return false
      } finally {
        setSidebarActionPending(false)
      }
    },
    [tokenInfo, isReadOnly, docs]
  )

  const handleMovePage = useCallback(
    async (
      docId: string,
      targetParentId: string | null,
      targetIndex: number
    ): Promise<boolean> => {
      if (!tokenInfo || isReadOnly) {
        return false
      }

      const moveResult = applyMove(docs, docId, targetParentId, targetIndex)
      if (!moveResult) {
        return false
      }

      setDocs(moveResult.nextDocs)

      if (!moveResult.updates.length) {
        return true
      }
      setSidebarError(null)
      setSidebarActionPending(true)

      try {
        for (const update of moveResult.updates) {
          const response = await fetch(
            `/api/docs/${encodeURIComponent(update.id)}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenInfo.token}`,
              },
              body: JSON.stringify({
                position: update.position,
                folderId: update.parentId,
              }),
            }
          )

          if (response.status === 401) {
            setSessionExpired(true)
            setSidebarError(SESSION_EXPIRED_MESSAGE)
            await refreshDocs()
            return false
          }

          if (response.status === 403) {
            setSidebarError('This session is read-only.')
            await refreshDocs()
            return false
          }

          if (!response.ok) {
            throw new Error(`status ${response.status}`)
          }

          await response.json().catch(() => null)
        }

        return true
      } catch (error) {
        console.error('Failed to reorder pages', error)
        setSidebarError('Unable to reorder pages. Please try again.')
        await refreshDocs()
        return false
      } finally {
        setSidebarActionPending(false)
      }
    },
    [
      docs,
      tokenInfo,
      isReadOnly,
      refreshDocs,
      setSessionExpired,
      setSidebarError,
      setSidebarActionPending,
      setDocs,
    ]
  )

  const handleDeletePage = useCallback(
    async (docId: string): Promise<boolean> => {
      if (!tokenInfo || isReadOnly) {
        return false
      }

      setSidebarError(null)
      setSidebarActionPending(true)

      try {
        const response = await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenInfo.token}` },
        })

        if (response.status === 401) {
          setSessionExpired(true)
          setSidebarError(SESSION_EXPIRED_MESSAGE)
          return false
        }

        if (response.status === 403) {
          setSidebarError('This session is read-only.')
          return false
        }

        if (response.status !== 404 && !response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || `status ${response.status}`)
        }

        let removedActive = false
        let fallbackId: string | null = activeDocIdRef.current

        setDocs((prevDocs) => {
          const target = prevDocs.find((doc) => doc.id === docId)
          if (!target) {
            return prevDocs
          }

          const descendants = collectDescendantIds(prevDocs, docId)
          removedActive = fallbackId ? descendants.has(fallbackId) : false

          const filtered = prevDocs.filter((doc) => !descendants.has(doc.id))

          if (removedActive) {
            const parentId = target.parentId
            if (parentId && filtered.some((doc) => doc.id === parentId)) {
              fallbackId = parentId
            } else if (
              rootIdRef.current &&
              filtered.some((doc) => doc.id === rootIdRef.current)
            ) {
              fallbackId = rootIdRef.current
            } else {
              fallbackId = filtered.length ? filtered[0]!.id : null
            }
          }

          return filtered
        })

        if (removedActive) {
          setActiveDocId(fallbackId ?? null)
        }

        return true
      } catch (error) {
        console.error('Failed to delete page', error)
        setSidebarError('Unable to delete page. Please try again.')
        await refreshDocs()
        return false
      } finally {
        setSidebarActionPending(false)
      }
    },
    [tokenInfo, isReadOnly, refreshDocs]
  )

  const handlePendingRenameHandled = useCallback(
    (handledId: string | null) => {
      setPendingRenameId((current) => {
        if (!current) {
          return null
        }
        if (!handledId || current === handledId) {
          return null
        }
        return current
      })
    },
    []
  )

  useEffect(() => {
    const nextActive = determineFallbackActiveDoc(
      docs,
      rootIdRef.current,
      activeDocIdRef.current
    )
    if (nextActive !== activeDocIdRef.current) {
      setActiveDocId(nextActive)
    }
  }, [docs])

  if (!tokenInfo) {
    return (
      <div className="notion-shell__error">
        <h1>Unable to open document</h1>
        <p>{tokenError ?? 'Missing or invalid access token.'}</p>
      </div>
    )
  }

  const canEditDocument =
    !isReadOnly && docLoaded && !loadError && !sessionExpired

  const bannerMessage = sessionExpired
    ? SESSION_EXPIRED_MESSAGE
    : loadError ?? saveError ?? null

  const statusLabel = useMemo(() => {
    if (sessionExpired) {
      return 'Session expired'
    }
    if (loadError) {
      return 'Load failed'
    }
    if (isReadOnly) {
      return docLoaded ? 'View only' : 'Loading…'
    }
    switch (saveState) {
      case 'loading':
        return 'Loading…'
      case 'saving':
        return 'Saving…'
      case 'error':
        return 'Save failed'
      case 'saved':
      default:
        return docLoaded ? 'Saved' : 'Loading…'
    }
  }, [sessionExpired, loadError, isReadOnly, docLoaded, saveState])

  const disableNavigation =
    sessionExpired || saveState === 'saving' || sidebarActionPending || sidebarLoading

  return (
    <div className="notion-shell">
      {bannerMessage ? (
        <div className="notion-shell__banner">{bannerMessage}</div>
      ) : null}
      <div className="notion-shell__body">
        <Sidebar
          docs={docs}
          rootId={rootId}
          activeDocId={activeDocId}
          loading={sidebarLoading}
          actionPending={sidebarActionPending}
          canEdit={!isReadOnly && !sessionExpired}
          disableNavigation={disableNavigation}
          onSelect={handleSelectDoc}
          onCreate={handleCreatePage}
          onRename={handleRenamePage}
          onDelete={handleDeletePage}
          onMove={handleMovePage}
          error={sidebarError}
          pendingRenameId={pendingRenameId}
          onPendingRenameHandled={handlePendingRenameHandled}
        />
        <div className="notion-shell__editor">
          <NotionEditor
            room={activeDocId ?? tokenInfo.docId}
            placeholder="Start writing..."
            statusText={statusLabel}
            editable={canEditDocument}
            onEditorCreate={handleEditorCreate}
            onEditorUpdate={handleEditorUpdate}
          />
        </div>
      </div>
    </div>
  )
}

export default App
