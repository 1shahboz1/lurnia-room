'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import Header from '@/components/Header'
import VirtualRoom from '@/components/VirtualRoom'
import { InventorySheet } from '@/components/ui/inventory-sheet'
import InspectorPanel from '@/components/inspector/InspectorPanel'
import Terminal from '@/components/Terminal'
import { Toaster, toast } from 'react-hot-toast'
import { computeSpawnPosition } from '@/utils/spawn-manager'
import type { RoomConfig, RoomObject } from '@/utils/glb-loader'

export default function ClientDesignSandbox({ engineConfig, slug }: { engineConfig: any; slug: string }) {
  // Enable phase/flow engines for design sandbox pages
  useEffect(() => {
    try { (window as any).__ENABLE_PHASES__ = true } catch {}
  }, [])

  type UIMode = 'design' | 'view'
  const [mode, setMode] = useState<UIMode>('design')
  const [inventoryVisible, setInventoryVisible] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [selectedModelCoordinates, setSelectedModelCoordinates] = useState<{ name: string; center: { x: number; y: number; z: number } } | null>(null)

  // Allow in-room UI (Phase UI / ToolsDrawer) to toggle overlays while in View mode.
  useEffect(() => {
    const onInspector = () => setInspectorOpen((o) => !o)
    const onTerminal = () => setTerminalVisible((v) => !v)
    window.addEventListener('ui:inspector:toggle', onInspector as any)
    window.addEventListener('ui:terminal:toggle', onTerminal as any)
    return () => {
      window.removeEventListener('ui:inspector:toggle', onInspector as any)
      window.removeEventListener('ui:terminal:toggle', onTerminal as any)
    }
  }, [])

  // Local mutable config so inventory can add items at runtime
  const [config, setConfig] = useState<RoomConfig>(engineConfig as RoomConfig)

  const currentRoomItems = useMemo(() => {
    return (config?.objects || [])
      .filter((o: any) => o?.type === 'model')
      .map((o: any) => o.modelName || o.id)
  }, [config])

  const handleAddToRoom = useCallback((item: { name: string; displayName: string; relativePath?: string; category?: string }) => {
    setConfig(prev => {
      if (!prev) return prev as any
      const modelPath = item.relativePath ? `inventory/${item.relativePath.replace('.glb','')}` : item.name
      const objectId = `inventory-${item.name}-${Date.now()}`
      const roomDims = (prev as any).roomStructure?.dimensions || { width: 30, height: 9, depth: 24 }
      const existing = (prev.objects || []).filter((o: any) => o.type === 'model') as RoomObject[]
      const [sx, sy, sz] = computeSpawnPosition({
        roomDimensions: { width: roomDims.width, depth: roomDims.depth, height: roomDims.height },
        existingObjects: existing.map(o => ({ position: o.position as [number, number, number] })),
        gridStep: 2.0,
        margin: 3.0,
      })
      const randomRotation = Math.random() * Math.PI * 2
      const newObj: RoomObject = {
        id: objectId,
        type: 'model',
        modelName: modelPath,
        position: [sx, sy, sz],
        rotation: [0, randomRotation, 0],
        scale: 1,
        interactive: true,
        physics: undefined,
        metadata: { title: item.displayName, fromInventory: true, originalPath: item.relativePath, category: item.category || 'misc' }
      }
      return { ...prev, objects: [...(prev.objects || []), newObj] } as RoomConfig
    })
  }, [])


  const publishToDisk = useCallback(async () => {
    // Stage/save latest transforms into localStorage first
    try { (window as any).__saveRoomLayout?.() } catch {}

    const key = `roomLayout:${config?.id || slug}`

    // __saveRoomLayout writes after a small timeout; wait briefly
    await new Promise((r) => setTimeout(r, 120))

    let raw: string | null = null
    try { raw = localStorage.getItem(key) } catch {}
    if (!raw) {
      toast.error('Nothing to publish yet (no saved layout found).')
      return
    }

    try {
      const res = await fetch('/api/design/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, layout: raw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        const msg = json?.error || `Publish failed (${res.status})`
        toast.error(msg)
        if (Array.isArray(json?.missingAssets) && json.missingAssets.length) {
          console.warn('Missing assets:', json.missingAssets)
        }
        return
      }

      // Clear local layout to avoid duplicate models on reload
      try { localStorage.removeItem(key) } catch {}

      toast.success(`Published ${json.devicesWritten || 0} device(s) to ${slug}.source.json — reloading…`)
      setTimeout(() => {
        try { window.location.reload() } catch {}
      }, 600)
    } catch (e: any) {
      console.error('Publish failed', e)
      toast.error(e?.message || 'Publish failed')
    }
  }, [slug, config?.id])

  return (
    <div className="h-screen w-full relative bg-black text-white">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header
          onInventoryToggle={() => setInventoryVisible(v => !v)}
          onSaveClick={() => {
            publishToDisk()
          }}
          onResetClick={() => {
            try {
              ;(window as any).__resetRoomLayout?.()
              setConfig(prev => {
                if (!prev) return prev as any
                return { ...prev, objects: (prev.objects || []).filter(o => (o as any).type !== 'model') }
              })
              toast.success('Room reset (cleared items)')
            } catch (e) {
              console.error('Reset failed', e)
              toast.error('Failed to reset')
            }
          }}
          onDeleteClick={() => {
            try {
              const id = (window as any).__getSelectedModelId?.()
              if (!id) {
                toast.error('Select a model to delete')
                return
              }
              ;(window as any).__deleteSelectedModel?.()
              setConfig(prev => {
                if (!prev) return prev as any
                return { ...prev, objects: (prev.objects || []).filter(o => o.id !== id) }
              })
              toast.success('Item deleted')
            } catch (e) {
              console.error('Delete failed', e)
              toast.error('Failed to delete')
            }
          }}
          roomId={config?.id || slug}
          mode={mode}
          onModeChange={(m) => { setMode(m); if (m !== 'view') setInspectorOpen(false) }}
          onInspectorToggle={() => setInspectorOpen((o) => !o)}
          onTerminalToggle={() => setTerminalVisible((v) => !v)}
          selectedModelCoordinates={selectedModelCoordinates}
        />
      </div>

      {/* Room */}
      <ErrorBoundary>
        <VirtualRoom
          config={config}
          initialQuality="medium"
          editModeEnabled={mode === 'design'}
          cameraControlsEnabled={!previewModalOpen}
          showCenterDebug={false}
          onSelectedModelInfo={setSelectedModelCoordinates}
        />
      </ErrorBoundary>

      {/* Inventory */}
      <InventorySheet
        isOpen={inventoryVisible}
        onOpenChange={setInventoryVisible}
        onAddToRoom={handleAddToRoom}
        currentRoomItems={currentRoomItems}
        onPreviewModalChange={setPreviewModalOpen}
      />

      {/* Inspector */}
      <InspectorPanel
        open={mode === 'view' && inspectorOpen}
        onOpenChange={setInspectorOpen}
        roomId={config?.id}
        objects={config?.objects}
      />

      {/* Terminal */}
      <Terminal
        visible={terminalVisible}
        roomId={config?.id}
        roomObjects={config?.objects}
        onClose={() => setTerminalVisible(false)}
        onStartPhase={(effect) => {
          try { window.dispatchEvent(new CustomEvent('phase:run', { detail: { id: effect.phase } })) } catch {}
        }}
      />

      {/* Toasts */}
      <Toaster position="bottom-right" />

      {/* Tiny badge so it's obvious this is /design */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50">
        <div className="text-xs text-gray-200 bg-black/60 border border-gray-700 rounded-lg px-3 py-2 backdrop-blur-sm">
          Design Sandbox: <span className="font-mono">{slug}.source.json</span>
        </div>
      </div>
    </div>
  )
}
