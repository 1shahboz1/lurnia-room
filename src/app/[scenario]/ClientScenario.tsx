'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import VirtualRoom from '@/components/VirtualRoom'
import Terminal from '@/components/Terminal'
import Header from '@/components/Header'
import InspectorPanel from '@/components/inspector/InspectorPanel'
import { InventorySheet } from '@/components/ui/inventory-sheet'
import { computeSpawnPosition } from '@/utils/spawn-manager'
import type { RoomConfig, RoomObject } from '@/utils/glb-loader'

export default function ClientScenario({ engineConfig, slug }: { engineConfig: any; slug: string }) {
  // Enable phase/flow engines for scenario pages (PhaseRunner on by default)
  useEffect(() => {
    try { (window as any).__ENABLE_PHASES__ = true } catch {}
  }, [])

  const [terminalVisible, setTerminalVisible] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inventoryVisible, setInventoryVisible] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  type UIMode = 'design' | 'view'
  // Scenario pages (final rooms) are view-only by default.
  const mode: UIMode = 'view'

  // Seed local saved layout for this scenario BEFORE VirtualRoom mounts
  const [seedReady, setSeedReady] = useState(false)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      // Only seed when explicitly requested via ?seedLayoutFrom=...; never auto-seed for specific slugs
      const seedFrom = params.get('seedLayoutFrom') || ''
      const targetKey = `roomLayout:${engineConfig?.id || slug}`
      const hasTarget = !!localStorage.getItem(targetKey)
      if (!hasTarget && seedFrom) {
        const sourceKey = `roomLayout:${seedFrom}`
        const src = localStorage.getItem(sourceKey)
        if (src) {
          localStorage.setItem(targetKey, src)
          console.log('🧩 LAYOUT_SEED applied', { from: sourceKey, to: targetKey })
        } else {
          console.log('🧩 LAYOUT_SEED skipped (missing source)', { from: sourceKey })
        }
      }
    } catch (e) {
      console.warn('LAYOUT_SEED failed', e)
    } finally {
      setSeedReady(true)
    }
  }, [engineConfig?.id, slug])

  // Hide center spheres by default (still visible when a model is selected in Design mode)
  const showCenter = false

  // Maintain a local, mutable copy so inventory can add items at runtime
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

  // Allow in-room UI (Phase UI / ToolsDrawer) to toggle global overlays.
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

  // Track whether the user has ever pressed Start in this session.
  // The very first Start does not need a preceding Stop; doing Stop-first can cause a brief flicker.
  const hasStartedOnceRef = React.useRef(false)

  return (
    <div className="h-screen w-full relative bg-black text-white">
      {/* Header with minimal controls for scenarios */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header
          onInventoryToggle={() => setInventoryVisible(v => !v)}
          roomId={config?.id || slug}
          mode={mode}
          onInspectorToggle={() => setInspectorOpen((o) => !o)}
          onTerminalToggle={() => setTerminalVisible((v) => !v)}
          onStartOverride={() => {
            // Start the currently selected phase.
            // Only restart (stop → start) if we've already started at least once.
            if (hasStartedOnceRef.current) {
              try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'stop' } })) } catch {}
            }
            try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'start' } })) } catch {}
            hasStartedOnceRef.current = true
          }}
        />
      </div>

      {seedReady ? (
        <>
          <ErrorBoundary>
            <VirtualRoom
              config={config}
              initialQuality="medium"
              editModeEnabled={false}
              cameraControlsEnabled={!previewModalOpen}
              showCenterDebug={showCenter}
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

          {/* Inspector - original UI */}
          <InspectorPanel
            open={inspectorOpen}
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
        </>
      ) : (
        <div className="h-full w-full grid place-items-center">Seeding layout…</div>
      )}
    </div>
  )
}
