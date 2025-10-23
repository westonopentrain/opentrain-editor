import * as React from "react"
import { Doc as YDoc } from "yjs"

export type CollabContextValue = {
  provider: null
  ydoc: YDoc
  hasCollab: boolean
}

const defaultYDoc = new YDoc()

export const CollabContext = React.createContext<CollabContextValue>({
  hasCollab: false,
  provider: null,
  ydoc: defaultYDoc,
})

export const CollabConsumer = CollabContext.Consumer

export const useCollab = (): CollabContextValue => {
  const context = React.useContext(CollabContext)
  if (!context) {
    throw new Error("useCollab must be used within an CollabProvider")
  }
  return context
}

export function CollabProvider({
  children,
}: Readonly<{ children: React.ReactNode; room: string }>) {
  const value = React.useMemo<CollabContextValue>(() => ({
    hasCollab: false,
    provider: null,
    ydoc: defaultYDoc,
  }), [])

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
}
