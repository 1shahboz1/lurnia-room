'use client'

import * as React from 'react'
import '@/utils/exactRestore'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import VirtualRoom from '@/components/VirtualRoom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Header from '@/components/Header';
import { InventorySheet } from '@/components/ui/inventory-sheet';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { getRoomByTemplate } from '@/config/rooms';
import { loadRoomDescription, convertRoomDescriptionToConfig } from '@/utils/room-loader'
import { RoomConfig, RoomObject } from '@/utils/glb-loader'
import { computeSpawnPosition } from '@/utils/spawn-manager'
import InspectorPanel from '@/components/inspector/InspectorPanel'
import Terminal from '@/components/Terminal'
import type { EmitPacketsEffect, StartPhaseEffect } from '@/types/terminal'

export default function RoomPage() {
  
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedModels, setLoadedModels] = useState<Set<string>>(new Set())
  const [loadingStartTime] = useState(() => Date.now())
  const [minimumLoadingElapsed, setMinimumLoadingElapsed] = useState(false)
  const [skipButtonVisible, setSkipButtonVisible] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [inventoryVisible, setInventoryVisible] = useState(false)
  type UIMode = 'design' | 'view'
  const [mode, setMode] = useState<UIMode>('design') // Start with Design by default
  const editModeEnabled = mode === 'design' // mapping: Design => edit-enabled; View/Interact => view-only
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [terminalVisible, setTerminalVisible] = useState(false)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🧪 Inspector open state changed:', { inspectorOpen, mode })
    }
  }, [inspectorOpen, mode])
  const [loadingInventoryItems, setLoadingInventoryItems] = useState<Set<string>>(new Set())
  const [selectedModelCoordinates, setSelectedModelCoordinates] = useState<{ name: string; center: { x: number; y: number; z: number } } | null>(null)
  const [showCenterSpheresDebug, setShowCenterSpheresDebug] = useState(false)
  
  // Track inventory visibility changes (debug logs removed)
  // useEffect(() => {
  //   console.log('🔧 Inventory visibility changed:', inventoryVisible)
  // }, [inventoryVisible])
  // Removed forceUpdate state - it was causing excessive re-renders
  
  // Function to scan for additional GLB models in /public/models/
  const scanForAdditionalModels = useCallback(async (): Promise<RoomObject[]> => {
    // Inventory-only mode: disable scanning /public/models to avoid noisy logs and extra network calls
    return []
  }, [])
  
  useEffect(() => {
    const loadRoomWithAutoDetection = async () => {
      try {
        // Load the networking lab v1 room with all the structure
        const description = await loadRoomDescription('networking-lab-v1')
        const baseConfig = convertRoomDescriptionToConfig(description)
        
        // Scan for additional GLB models
        const additionalModels = await scanForAdditionalModels()
        
        // Combine base config with additional models
        const enhancedConfig: RoomConfig = {
          ...baseConfig,
          objects: [...baseConfig.objects, ...additionalModels]
        }
        
        // Log summary of loaded room
        if (additionalModels.length > 0 && process.env.NODE_ENV === 'development') {
          console.log(`✅ Room loaded: ${baseConfig.objects.length} base + ${additionalModels.length} auto-detected = ${enhancedConfig.objects.length} total models`)
        }
        
        setRoomConfig(enhancedConfig)
      } catch (err) {
        console.warn('Failed to load room description, falling back to template:', err)
        
        // Try to add auto-detected models to fallback template too
        const additionalModels = await scanForAdditionalModels()
        
        const fallbackConfig = getRoomByTemplate('learning-space', {
          environment: {
            lighting: 'bright',
            background: '#ffffff',
            shadows: true
          },
          camera: {
            position: [0, 1.8, 8],
            target: [0, 1.65, 0],
            fov: 75
          }
        })
        
        // Add additional models to fallback config too
        const enhancedFallbackConfig: RoomConfig = {
          ...fallbackConfig,
          objects: [...fallbackConfig.objects, ...additionalModels]
        }
        
        setRoomConfig(enhancedFallbackConfig)
      }
    }
    
    // Initialize clean state for loading
    setLoadedModels(new Set())
    setIsInitialLoad(true)
    setMinimumLoadingElapsed(false)
    setSkipButtonVisible(false)
    
    loadRoomWithAutoDetection()
    
    // Ensure minimum loading time for better UX (show progress)
    const minLoadingTimer = setTimeout(() => {
      setMinimumLoadingElapsed(true)
    }, 1500) // 1.5 seconds minimum
    
    // Show skip button only after 3 seconds (for testing and loading issues)
    const skipButtonTimer = setTimeout(() => {
      setSkipButtonVisible(true)
    }, 3000) // 3 seconds delay
    
    // Auto-disable initial load after 3 seconds
    const autoCompleteTimer = setTimeout(() => {
      setIsInitialLoad(false)
    }, 3000) // 3 seconds auto-complete
    
    return () => {
      clearTimeout(minLoadingTimer)
      clearTimeout(skipButtonTimer)
      clearTimeout(autoCompleteTimer)
    }
  }, [])
  
  // Check URL parameters for debug features
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const debugCenter = params.get('showCenter') === 'true'
      if (debugCenter) {
        setShowCenterSpheresDebug(true)
        console.log('🟢 DEBUG: Enabled center spheres for all models via URL parameter')
      }
    }
  }, [])
  
  // Note: Server labels are now assigned directly in VirtualRoom.tsx
  
  // Removed forced periodic updates - they cause excessive logging
  
  // Handle model load events - FIXED: Removed roomConfig dependency to prevent re-renders
  const handleModelLoad = useCallback((modelId: string) => {
    setLoadedModels(prev => {
      // During initial load, allow all models to be added
      // Only prevent duplicates if this is a repeat call after skip button was used
      const shouldIgnoreDuplicate = !isInitialLoad && prev.has(modelId);
      
      if (shouldIgnoreDuplicate) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔄 Ignoring duplicate load for: ${modelId}`);
        }
        return prev;
      }
      
      const newSet = new Set(prev).add(modelId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📦 Model loaded: ${modelId}`);
        console.log(`🔄 Progress: ${newSet.size} models loaded`);
        
        // Check if we should mark initial loading as complete
        // Only complete initial load when we have a reasonable number of models loaded
        // We expect at least 3-4 models for the base room
        if (newSet.size >= 3) {
          setIsInitialLoad(prevInitial => {
            if (prevInitial) {
              console.log(`✅ Marking initial load as complete after ${newSet.size} models loaded`);
              return false;
            }
            return prevInitial;
          });
        }
      }
      
      // Remove from loading inventory items if this was an inventory item
      setLoadingInventoryItems(prev => {
        if (prev.has(modelId)) {
          const updated = new Set(prev)
          updated.delete(modelId)
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Finished loading inventory item: ${modelId}`, {
              remainingItems: Array.from(updated)
            })
          }
          
          // Toast notification moved to prevent render phase updates
          
          return updated
        }
        return prev
      })
      
      return newSet;
    });
  }, [isInitialLoad])

  // Add inventory item to room - FIXED: Removed roomConfig dependency
  const handleAddToRoom = useCallback((item: { name: string; displayName: string; relativePath?: string; category?: string; [key: string]: any }) => {
    // Use relativePath for inventory items, fallback to name for regular models
    // Remove .glb extension since GLB loader adds it automatically
    const modelPath = item.relativePath 
      ? `inventory/${item.relativePath.replace('.glb', '')}` 
      : item.name

    const objectId = `inventory-${item.name}-${Date.now()}`

    // Track this inventory item as loading
    setLoadingInventoryItems(prev => {
      const newSet = new Set(Array.from(prev))
      newSet.add(objectId)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Starting to load inventory item: ${objectId}`, {
          loadingItems: Array.from(newSet)
        })
      }
      return newSet
    })
    
    // Ensure initial load is marked as complete when adding inventory items
    setIsInitialLoad(false)

    setRoomConfig(prev => {
      if (!prev) {
        console.warn('Cannot add item to room: roomConfig is null')
        return prev
      }

      // Compute a safe spawn position inside the current room bounds using a simple grid
      const roomDims = (prev.roomStructure?.dimensions) || { width: 30, height: 9, depth: 24 }
      const existing = prev.objects.filter(o => o.type === 'model') as RoomObject[]
      const [sx, sy, sz] = computeSpawnPosition({
        roomDimensions: { width: roomDims.width, depth: roomDims.depth, height: roomDims.height },
        existingObjects: existing.map(o => ({ position: o.position as [number, number, number] })),
        gridStep: 2.0,
        margin: 3.0,
      })

      const randomRotation = Math.random() * Math.PI * 2 // Random Y rotation for variety

      const newRoomObject: RoomObject = {
        id: objectId,
        type: 'model' as const,
        modelName: modelPath,
        position: [sx, sy, sz],
        rotation: [0, randomRotation, 0] as [number, number, number],
        scale: 1,
        interactive: true,
        physics: undefined,
        metadata: {
          title: item.displayName,
          description: `Added from inventory: ${item.displayName}`,
          fromInventory: true,
          originalPath: item.relativePath,
          category: item.category || 'misc'
        }
      }

      console.log(`✅ Added ${item.displayName} to room`)
      return {
        ...prev,
        objects: [...prev.objects, newRoomObject]
      }
    })
    
    // Notification removed for cleaner UX
  }, [])
  
  const handleModelError = useCallback((modelId: string, errorMessage: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`❌ PAGE: Model error callback triggered for: ${modelId}`, errorMessage)
    }
    
    // Remove from loading inventory items and show error toast if this was an inventory item
    setLoadingInventoryItems(prev => {
      if (prev.has(modelId)) {
        const updated = new Set(prev)
        updated.delete(modelId)
        
        // Error toast removed to prevent render phase updates
        
        return updated
      }
      return prev
    })
    
    setLoadedModels(prev => {
      // Prevent duplicate error handling
      if (prev.has(modelId)) {
        return prev;
      }
      
      const newSet = new Set(prev).add(modelId); // Count as "loaded" to update progress
      if (process.env.NODE_ENV === 'development') {
        console.log(`📈 PAGE: Progress update (including failed) - ${newSet.size} models processed`);
      }
      return newSet;
    })
  }, [])

  // Get current room items for inventory panel
  const currentRoomItems = useMemo(() => {
    if (!roomConfig) return []
    return roomConfig.objects
      .filter(obj => obj.type === 'model')
      .map(obj => obj.modelName || obj.id)
  }, [roomConfig])
  
  // Create a stable callback that doesn't change between renders
  const inventoryToggleRef = useRef<() => void>()
  if (!inventoryToggleRef.current) {
    inventoryToggleRef.current = () => {
      console.log('📦 INVENTORY: Toggle function called, current state:', inventoryVisible)
      setInventoryVisible(prev => {
        const newValue = !prev
        console.log('📦 INVENTORY: Changing visibility from', prev, 'to', newValue)
        return newValue
      })
    }
  }
  const handleInventoryToggle = inventoryToggleRef.current
  
  // Removed debug props tracker
  
  if (!roomConfig) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading room configuration...</p>
          {error && (
            <p className="text-red-400 mt-2 text-sm">{error}</p>
          )}
        </div>
      </div>
    )
  }
  
  // Calculate loading progress with multiple completion criteria
  const totalModels = roomConfig.objects.filter(obj => obj.type === 'model').length
  const modelObjects = roomConfig.objects.filter(obj => obj.type === 'model')
  const loadedCount = loadedModels.size
  const loadingTimeElapsed = Date.now() - loadingStartTime
  
  // Multiple ways to consider loading complete:
  const hasTimedOut = loadingTimeElapsed > 5000 // 5 second timeout (reduced)
  const modelsLoaded = loadedCount >= totalModels
  const minimumTimeElapsed = loadingTimeElapsed > 1500 // 1.5 second minimum
  
  // Loading is complete if ANY of these conditions are true:
  const isFullyLoaded = totalModels > 0 && (
    hasTimedOut ||  // Timeout fallback
    (modelsLoaded && minimumLoadingElapsed) || // Models loaded + minimum UI time
    (minimumTimeElapsed && loadingTimeElapsed > 4000) // Fallback: just wait 4 seconds
  )
  
  // Removed problematic logging that was causing hooks violations
  
  // Simple timeout-based loading screen (3 seconds max)
  const showLoadingScreen = isInitialLoad && loadingTimeElapsed < 3000 && totalModels > 0
  
  // Debug logging removed - flicker issues resolved
  
  // Debug logging minimized - only log if loading screen is active (should be rare now)
  if (showLoadingScreen && process.env.NODE_ENV === 'development') {
    console.log('🏠🚨 Loading screen active:', {
      isInitialLoad,
      totalModels,
      loadedCount,
      isFullyLoaded
    })
  }

  return (
    <div className="h-screen w-full relative bg-black text-white">
      {/* Header - positioned absolutely to not take layout space */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header 
          onInventoryToggle={handleInventoryToggle} 
          onSaveClick={() => {
            try {
              (window as any).__saveRoomLayout?.()
              toast.success('Room design saved')
            } catch (e) {
              console.error('Save failed', e)
              toast.error('Failed to save')
            }
          }}
          onResetClick={() => {
            try {
              // Clear persisted layout so nothing is restored on next load
              (window as any).__resetRoomLayout?.()
              // Remove all current GLB model objects from the room now
              setRoomConfig(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  objects: prev.objects.filter(o => o.type !== 'model')
                }
              })
              toast.success('Room reset: all items removed')
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
              setRoomConfig(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  objects: prev.objects.filter(o => o.id !== id)
                }
              })
              toast.success('Item deleted from room')
            } catch (e) {
              console.error('Delete failed', e)
              toast.error('Failed to delete item')
            }
          }}
          roomId={roomConfig?.id}
          mode={mode}
          onModeChange={(m) => { setMode(m); if (m !== 'view') setInspectorOpen(false) }}
          onInspectorToggle={() => setInspectorOpen((o) => !o)}
          onTerminalToggle={() => setTerminalVisible((v) => !v)}
          selectedModelCoordinates={selectedModelCoordinates}
        />
      </div>
      
      {/* Loading screen overlay removed */}
      
      {/* Subtle loading indicator for inventory items (notifications removed for cleaner UX) */}
      {loadingInventoryItems.size > 0 && (
        <div className="absolute top-20 right-4 z-30 bg-black/70 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center space-x-2 text-sm text-gray-200">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
            <span>Loading {loadingInventoryItems.size} item{loadingInventoryItems.size > 1 ? 's' : ''}...</span>
          </div>
        </div>
      )}
      
      {/* VirtualRoom renders immediately (hidden during loading) */}
      <ErrorBoundary>
        <VirtualRoom 
          config={roomConfig} 
          initialQuality="medium"
          onModelLoad={handleModelLoad}
          onModelError={handleModelError}
          editModeEnabled={editModeEnabled}
          cameraControlsEnabled={!previewModalOpen}
          showCenterDebug={showCenterSpheresDebug}
          onSelectedModelInfo={setSelectedModelCoordinates}
        />
      </ErrorBoundary>

      {/* Add rotation test panel for debugging - TEMPORARILY DISABLED */}
      {/* <RotationTestPanel /> */}
      
      {/* Inventory Sheet */}
      <InventorySheet
        isOpen={inventoryVisible}
        onOpenChange={setInventoryVisible}
        onAddToRoom={handleAddToRoom}
        currentRoomItems={currentRoomItems}
        onPreviewModalChange={setPreviewModalOpen}
      />

      {/* Inspector Panel */}
      <InspectorPanel 
        open={mode === 'view' && inspectorOpen} 
        onOpenChange={(v) => { 
          console.log('🧪 InspectorPanel onOpenChange called:', v); 
          setInspectorOpen(v); 
        }} 
        roomId={roomConfig?.id}
        objects={roomConfig?.objects}
      />
      
      {/* Terminal */}
      <Terminal
        visible={terminalVisible}
        roomId={roomConfig?.id}
        roomObjects={roomConfig?.objects}
        onClose={() => setTerminalVisible(false)}
        onEmitPackets={(effect: EmitPacketsEffect) => {
          console.log('[Terminal] Emit packets (disabled):', effect)
          // Packet animations disabled for terminal commands
          // TODO: Re-enable when packet routing issues are resolved
          /*
          if (typeof window !== 'undefined' && effect.path && effect.path.length >= 2) {
            const HOP_DELAY = 450
            
            effect.path.forEach((node, index) => {
              if (index < effect.path.length - 1) {
                const from = effect.path[index]
                const to = effect.path[index + 1]
                
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('terminal-packet', {
                    detail: {
                      from,
                      to,
                      style: effect.style,
                      hopIndex: index,
                      totalHops: effect.path.length - 1
                    }
                  }))
                }, index * HOP_DELAY)
              }
            })
          }
          */
        }}
        onStartPhase={(effect: StartPhaseEffect) => {
          console.log('[Terminal] Start phase:', effect.phase)
          // Trigger phase change via global event  
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('terminal-phase', {
              detail: { phase: effect.phase }
            }))
          }
        }}
      />
      

      {/* Toast Notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: 'hsl(var(--primary))',
              secondary: 'hsl(var(--primary-foreground))',
            },
          },
        }}
      />
    </div>
  );
}

