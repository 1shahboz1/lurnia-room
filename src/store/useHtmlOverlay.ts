"use client"

import { useSyncExternalStore } from "react"

export type HtmlOverlayState = {
  visible: boolean
  query: string // e.g. "?id=pkt-001&protocol=DNS"
  selectedId?: string
  suppressUntil?: number
}

const store = {
  state: { visible: false, query: "" } as HtmlOverlayState,
  listeners: new Set<() => void>(),
  set(partial: Partial<HtmlOverlayState>) {
    store.state = { ...store.state, ...partial }
    store.listeners.forEach((l) => l())
  },
}

export function useHtmlOverlay() {
  const subscribe = (l: () => void) => {
    store.listeners.add(l)
    return () => store.listeners.delete(l)
  }
  const snapshot = useSyncExternalStore(subscribe, () => store.state, () => store.state)
  const show = (queryParams: Record<string, string | number | boolean>) => {
    const entries = Object.entries(queryParams)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&")
    const qs = entries ? `?${entries}` : ""
    const selectedId = typeof (queryParams as any).listId === 'string' ? String((queryParams as any).listId) : (typeof queryParams.id === 'string' ? String(queryParams.id) : undefined)
    const same = store.state.visible && store.state.query === qs && store.state.selectedId === selectedId
    if (same) {
      store.set({ suppressUntil: Date.now() + 600 })
      return
    }
    store.set({ visible: true, query: qs, selectedId, suppressUntil: Date.now() + 600 })
  }
  const hide = () => store.set({ visible: false, selectedId: undefined })
  return { ...snapshot, show, hide }
}

export function showHtmlOverlay(queryParams: Record<string, string | number | boolean>) {
  const entries = Object.entries(queryParams)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
  const qs = entries ? `?${entries}` : ""
  const selectedId = typeof (queryParams as any).listId === 'string' ? String((queryParams as any).listId) : (typeof queryParams.id === 'string' ? String(queryParams.id) : undefined)
  const same = store.state.visible && store.state.query === qs && store.state.selectedId === selectedId
  if (same) {
    store.set({ suppressUntil: Date.now() + 600 })
    return
  }
  store.set({ visible: true, query: qs, selectedId, suppressUntil: Date.now() + 600 })
}

export function hideHtmlOverlay() {
  store.set({ visible: false, selectedId: undefined })
}

export function getHtmlOverlayState() {
  return store.state
}
