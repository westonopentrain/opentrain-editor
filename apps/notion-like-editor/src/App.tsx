import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

import { NotionEditor } from './components/tiptap-templates/notion-like/notion-like-editor'

const AUTOSAVE_DELAY_MS = 1200
const DEFAULT_HTML = '<p></p>'

type SaveState = 'loading' | 'saving' | 'saved' | 'error'

interface TokenInfo {
  token: string
  docId: string
  jobId: string | null
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
  const permsRaw =
    typeof payload.perms === 'string' ? payload.perms.toLowerCase() : 'rw'
  const perms: 'rw' | 'ro' = permsRaw === 'ro' ? 'ro' : 'rw'

  if (!docId) {
    return { tokenInfo: null, error: 'Token is missing a document id.' }
  }

  if (perms === 'rw' && !jobId) {
    return {
      tokenInfo: null,
      error: 'Write access requires a job id in the token.',
    }
  }

  return {
    tokenInfo: {
      token: rawToken,
      docId,
      jobId,
      perms,
      raw: payload as Record<string, unknown>,
    },
  }
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

  const [initialHtml, setInitialHtml] = useState<string | null>(null)
  const [docLoaded, setDocLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')

  const editorRef = useRef<Editor | null>(null)
  const lastSavedHtmlRef = useRef<string>(DEFAULT_HTML)
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!tokenInfo) {
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
    setInitialHtml(null)

    const controller = new AbortController()
    let cancelled = false

    const loadDocument = async () => {
      try {
        const response = await fetch(
          `/api/docs/${encodeURIComponent(tokenInfo.docId)}`,
          {
            headers: { Authorization: `Bearer ${tokenInfo.token}` },
            signal: controller.signal,
          }
        )

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
  }, [tokenInfo])

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
      if (!tokenInfo || isReadOnly || !docLoaded) {
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
          const response = await fetch(
            `/api/docs/${encodeURIComponent(tokenInfo.docId)}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenInfo.token}`,
              },
              body: JSON.stringify({
                title: 'OpenTrain autosave',
                jobId: tokenInfo.jobId,
                position: 1,
                htmlSnapshot: html,
              }),
            }
          )

          if (!response.ok) {
            throw new Error(`status ${response.status}`)
          }

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
    [tokenInfo, isReadOnly, docLoaded]
  )

  if (!tokenInfo) {
    return (
      <div className="notion-shell__error">
        <h1>Unable to open document</h1>
        <p>{tokenError ?? 'Missing or invalid access token.'}</p>
      </div>
    )
  }

  const canEdit = !isReadOnly && docLoaded && !loadError
  const bannerMessage = loadError ?? saveError ?? null

  const statusLabel = useMemo(() => {
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
  }, [docLoaded, isReadOnly, loadError, saveState])

  return (
    <div className="notion-shell">
      {bannerMessage ? (
        <div className="notion-shell__banner">{bannerMessage}</div>
      ) : null}
      <NotionEditor
        room={tokenInfo.docId}
        placeholder="Start writing..."
        statusText={statusLabel}
        editable={canEdit}
        onEditorCreate={handleEditorCreate}
        onEditorUpdate={handleEditorUpdate}
      />
    </div>
  )
}

export default App
