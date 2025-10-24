"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import type { Editor } from "@tiptap/react"

import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Card, CardBody, CardItemGroup } from "@/components/tiptap-ui-primitive/card"
import { Input, InputGroup } from "@/components/tiptap-ui-primitive/input"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"

import "@/components/tiptap-ui/slash-dropdown-menu/loom-url-prompt.scss"

interface PromptState {
  open: boolean
  value: string
  error: string | null
  editor: Editor | null
}

const defaultState: PromptState = {
  open: false,
  value: "",
  error: null,
  editor: null,
}

export function useLoomUrlPrompt() {
  const [state, setState] = React.useState<PromptState>(defaultState)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const closePrompt = React.useCallback(() => {
    setState(defaultState)
  }, [])

  const requestLoomUrl = React.useCallback((editor: Editor) => {
    setState({ open: true, value: "", error: null, editor })
  }, [])

  const handleSubmit = React.useCallback(() => {
    if (!state.editor) return

    const url = state.value.trim()
    if (!url) {
      setState((prev) => ({ ...prev, error: "Please enter a Loom URL." }))
      return
    }

    const ok = state.editor.commands.setLoomEmbed(url)
    if (!ok) {
      setState((prev) => ({
        ...prev,
        error: "That does not look like a Loom URL.",
      }))
      return
    }

    closePrompt()
  }, [closePrompt, state.editor, state.value])

  const handleCancel = React.useCallback(() => {
    closePrompt()
  }, [closePrompt])

  React.useEffect(() => {
    if (!state.open) return
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [state.open])

  const promptNode = state.open
    ? createPortal(
        <div
          className="loom-url-prompt-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={handleCancel}
        >
          <div
            className="loom-url-prompt-card"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Card>
              <CardBody>
                <CardItemGroup orientation="vertical">
                  <div className="loom-url-prompt-heading">Embed Loom video</div>
                  <InputGroup>
                    <Input
                      ref={inputRef}
                      type="url"
                      placeholder="https://www.loom.com/share/your-video"
                      value={state.value}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          value: event.target.value,
                          error: null,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          handleSubmit()
                        } else if (event.key === "Escape") {
                          event.preventDefault()
                          handleCancel()
                        }
                      }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                    />
                  </InputGroup>

                  {state.error && (
                    <div className="loom-url-prompt-error" role="alert">
                      {state.error}
                    </div>
                  )}

                  <Spacer orientation="vertical" size="1rem" />

                  <ButtonGroup orientation="horizontal" className="loom-url-prompt-actions">
                    <Button data-style="ghost" type="button" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button data-style="primary" type="button" onClick={handleSubmit}>
                      Embed
                    </Button>
                  </ButtonGroup>
                </CardItemGroup>
              </CardBody>
            </Card>
          </div>
        </div>,
        document.body
      )
    : null

  return { requestLoomUrl, promptNode }
}
