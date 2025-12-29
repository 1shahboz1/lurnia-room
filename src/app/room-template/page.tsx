"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import VirtualRoom from "@/components/VirtualRoom";
import ErrorBoundary from "@/components/ErrorBoundary";
import Header from "@/components/Header";
import InspectorPanel from "@/components/inspector/InspectorPanel";
import Terminal from "@/components/Terminal";
import { InventorySheet } from "@/components/ui/inventory-sheet";
import type { RoomConfig } from "@/utils/glb-loader";
import { Toaster } from "react-hot-toast";

export default function RoomTemplatePage() {
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI state mirroring /room for buttons and panels
  type UIMode = 'design' | 'view'
  const [mode, setMode] = useState<UIMode>('design')
  const editModeEnabled = mode === 'design'
  const [inventoryVisible, setInventoryVisible] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [selectedModelCoordinates, setSelectedModelCoordinates] = useState<{ name: string; center: { x: number; y: number; z: number } } | null>(null)

  // Template currentRoomItems (no inventory add yet — keep empty list)
  const currentRoomItems = useMemo(() => {
    if (!config) return []
    return (config.objects || [])
      .filter((o: any) => o.type === 'model')
      .map((o: any) => o.modelName || o.id)
  }, [config])

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/rooms/room-template.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load room-template.json: ${res.status}`);
        const json = (await res.json()) as RoomConfig;
        if (!cancelled) setConfig(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load template");
      }
    }
    load();
    return () => { cancelled = true };
  }, []);

  if (error) {
    return (
      <div className="h-screen w-full grid place-items-center bg-black text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Room Template</h1>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-screen w-full grid place-items-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4" />
          <p className="text-gray-300">Loading room template...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative bg-black text-white">
      {/* Header with buttons (inventory, save, reset, delete, mode, inspector, terminal) */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header
          onInventoryToggle={() => setInventoryVisible(v => !v)}
          onSaveClick={() => { try { (window as any).__saveRoomLayout?.() } catch {} }}
          onResetClick={() => { try { (window as any).__resetRoomLayout?.() } catch {} }}
          onDeleteClick={() => { try { (window as any).__deleteSelectedModel?.() } catch {} }}
          roomId={config?.id}
          mode={mode}
          onModeChange={(m) => { setMode(m); if (m !== 'view') setInspectorOpen(false) }}
          onInspectorToggle={() => setInspectorOpen(o => !o)}
          onTerminalToggle={() => setTerminalVisible(v => !v)}
          selectedModelCoordinates={selectedModelCoordinates}
        />
      </div>

      <ErrorBoundary>
        <VirtualRoom
          config={config}
          initialQuality="medium"
          onModelLoad={() => {}}
          onModelError={() => {}}
          editModeEnabled={editModeEnabled}
          cameraControlsEnabled={!previewModalOpen}
          showCenterDebug={false}
          onSelectedModelInfo={setSelectedModelCoordinates}
        />
      </ErrorBoundary>

      {/* Inventory (no-op add for template) */}
      <InventorySheet
        isOpen={inventoryVisible}
        onOpenChange={setInventoryVisible}
        onAddToRoom={() => { /* no-op in template */ }}
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

      {/* Terminal (effects wired same as /room: startPhase only) */}
      <Terminal
        visible={terminalVisible}
        roomId={config?.id}
        roomObjects={config?.objects}
        onClose={() => setTerminalVisible(false)}
        onEmitPackets={() => { /* disabled in template for now */ }}
        onStartPhase={(effect: any) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('terminal-phase', { detail: { phase: effect.phase } }))
          }
        }}
      />

      {/* Toasts */}
      <Toaster position="bottom-right" />
    </div>
  );
}
