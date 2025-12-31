'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Html, Billboard, Text, RoundedBox } from '@react-three/drei'
import { Physics, RigidBody } from '@react-three/rapier'
import { Suspense, useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { OptimizedModel, RoomConfig, useRoomManager, ModelQuality, availableModels } from '@/utils/glb-loader'
import { DynamicRoomStructure } from './DynamicRoomStructure'
import type { RoomDescription } from '@/utils/room-loader'
import type { GLTF } from 'three-stdlib'
import { QualityEnhancer, QualitySelector, QualityPreset, qualityPresets, PerformanceHUD, usePerformanceMonitor } from './QualityEnhancer'
import PerformanceStatsHUD, { PerformanceStatsCollector, usePerformanceStats } from './PerformanceStats'
import { SmartLightingSystem, VolumetricLight, temperatureToRGB } from './AdvancedLighting'
import { useTextureManagerGlobalStats } from './TextureManager'
import CameraCollision from './CameraCollision'
import ContactShadowsSystem from './ContactShadowsSystem'
import * as THREE from 'three'
import RotationGizmo from '@/components/gizmo/RotationGizmo'
import VerticalTranslateArrow from '@/components/gizmo/VerticalTranslateArrow'
import PacketInRoom from '@/components/packet/PacketInRoom'
import GLBLabel from '@/components/GLBLabel'
import DesktopMetaDataBoard from '@/components/desktop/DesktopMetaDataBoard'
import NetworkLine from '@/components/network/NetworkLine'
import PacketHop from '@/components/network/PacketHop'
import PortIndicatorManager from '@/components/PortIndicatorManager'
import { usePacketAnimation } from '@/hooks/usePacketAnimation'
import LaptopMetaDataBoard from '@/components/laptop/LaptopMetaDataBoard'
import ServerMetaDataBoard from '@/components/server/ServerMetaDataBoard'
import RouterMetaDataBoard from '@/components/router/RouterMetaDataBoard'
import FirewallMetaDataBoard from '@/components/firewall/FirewallMetaDataBoard'
import SwitchMetaDataBoard from '@/components/switch/SwitchMetaDataBoard'
import InspectionZone from '@/components/firewall/InspectionZone'
import FirewallStatusLight from '@/components/firewall/FirewallStatusLight'
import WebServerEmitSimulation from '@/components/server/WebServerEmitSimulation'
import FirewallRulesOverlay from '@/components/firewall/FirewallRulesOverlay'
import FirewallMissionOverlay from '@/components/firewall/FirewallMissionOverlay'
import RoomMissionOverlay from '@/components/missions/RoomMissionOverlay'
import LiveFlowHUD from '@/components/LiveFlowHUD'
import VpnTunnel from '@/components/vpn/VpnTunnel'
import EavesdropperSimulation from '@/components/vpn/EavesdropperSimulation'
import { DeviceAddons } from '@/engine/registry'
import { evaluateFirewallRules, type FirewallTraffic } from '@/engine/firewall/rules'
import { showFirewallRulesPanel, useFirewallRules } from '@/store/useFirewallRules'
import PhaseIndicator from '@/components/ui/PhaseIndicator'
import PrimaryActionPanel from '@/components/ui/PrimaryActionPanel'
import ToolsDrawer from '@/components/ui/ToolsDrawer'


// Room environment configurations - balanced for quality and wave elimination
const environments = {
  bright: {
    intensity: 1.0,
    background: '#ffffff',
    ambient: 0.5,  // +0.1 for carpet light absorption
    shadows: false
  },
  dim: {
    intensity: 0.8,
    background: '#2c3e50',
    ambient: 0.4,  // +0.1 for carpet light absorption
    shadows: false
  },
  ambient: {
    intensity: 0.9,
    background: '#34495e',
    ambient: 0.5,  // +0.1 for carpet light absorption
    shadows: false
  },
  dramatic: {
    intensity: 1.0,
    background: '#1a1a1a',
    ambient: 0.4,  // +0.1 for carpet light absorption
    shadows: false
  }
}

// Loading component
function LoadingScreen({ progress }: { progress: number }) {
  return (
    <Html center>
      <div className="bg-black/80 text-white p-6 rounded-lg backdrop-blur-sm max-w-md">
        <h3 className="text-xl font-bold mb-4">Loading Virtual Room...</h3>
        <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-300">{progress}% complete</p>
      </div>
    </Html>
  )
}

// Interactive model with info panel
interface InteractiveModelProps {
  id: string
  modelName: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  quality?: ModelQuality
  enablePhysics?: boolean
  editModeEnabled?: boolean
  onLoad?: (id: string, gltf: GLTF) => void
  onError?: (id: string, error: string) => void
  selected?: boolean
  onModelClick?: (id: string) => void
  onSelectedModelInfo?: (info: { name: string; center: { x: number; y: number; z: number } } | null) => void
  roomDimensions?: { width: number; height: number; depth: number }
  showCenterDebug?: boolean
  onTransformChange?: (
    pos: [number, number, number],
    rot?: [number, number, number],
    scl?: number | [number, number, number],
    world?: {
      position: [number, number, number]
      quaternion: [number, number, number, number]
      scale: [number, number, number]
      center?: [number, number, number]
    }
  ) => void
  savedOverride?: { 
    position: [number, number, number], 
    rotation?: [number, number, number], 
    scale?: number | [number, number, number],
    worldPosition?: [number, number, number]
    worldQuaternion?: [number, number, number, number]
    worldScale?: [number, number, number]
    worldCenter?: [number, number, number]
  }
  restoreTrace?: boolean
  onRestoreApplied?: (id: string) => void
  restorePhase?: boolean
  category?: string
  customLabel?: string
  hideLabel?: boolean
  aliasName?: string
  roomId?: string
  deviceMeta?: Record<string, any>
}

function InteractiveModel({
  id,
  modelName,
  position,
  rotation,
  scale = 1,
  quality = 'medium',
  enablePhysics = false,
  editModeEnabled = false,
  onLoad,
  onError,
  selected = false,
  onModelClick,
  onSelectedModelInfo,
  roomDimensions,
  showCenterDebug = false,
  onTransformChange,
  savedOverride,
  restoreTrace = false,
  onRestoreApplied,
  restorePhase = false,
  category,
  customLabel,
  hideLabel = false,
  aliasName,
  roomId,
  deviceMeta,
}: InteractiveModelProps) {
  // Clamp configuration
  const CLAMP = useMemo(() => ({
    EPS: 0.01,            // 1 cm deadzone for X/Z clamp
    EPS_Y: 0.002,         // 2 mm for floor lift
    MARGIN_IN: 0.25,      // target margin when clamping
    MARGIN_OUT: 0.22,     // hysteresis (looser) for in-bounds checks
    RESTORE_GUARD_XZ: 0.08 // skip horizontal clamp for restored items unless > 8 cm violation
  }), [])
  const [hovered, setHovered] = useState(false)
  const [metadataVisible, setMetadataVisible] = useState(false)
  const isVpnRoom = roomId === 'vpn'
  
  // Nudge models slightly off wall planes to avoid z-fighting and ensure proper stacking (e.g., Speaker < Smart Board)
  const adjustedInitialPosition = useMemo<[number, number, number]>(() => {
    // Never auto-nudge when restoring from a saved layout
    if (savedOverride?.position) {
      if (restoreTrace) {
        try { console.log('🧩 RESTORE_TRACE/autoNudgeSkipped', { id, reason: 'savedOverride', pos: savedOverride.position }) } catch {}
      }
      return position
    }
    const eps = 0.05
    const nudge = 0.02
    let [x, y, z] = position
    if (roomDimensions) {
      const halfX = roomDimensions.width / 2
      const halfZ = roomDimensions.depth / 2
      const before = { x, y, z }
      if (Math.abs(x + halfX) < eps) x += nudge      // West wall -> push +X into room
      else if (Math.abs(x - halfX) < eps) x -= nudge // East wall -> push -X
      if (Math.abs(z + halfZ) < eps) z += nudge      // North wall -> push +Z
      else if (Math.abs(z - halfZ) < eps) z -= nudge // South wall -> push -Z
      if (restoreTrace && (x !== before.x || z !== before.z)) {
        try { console.log('🧩 RESTORE_TRACE/autoNudgeApplied', { id, from: before, to: { x, y, z } }) } catch {}
      }
    }
    return [x, y, z]
  }, [position, roomDimensions, savedOverride?.position, restoreTrace, id])
  const [currentPosition, setCurrentPosition] = useState<[number, number, number]>(adjustedInitialPosition)
  const [currentRotation, setCurrentRotation] = useState<[number, number, number]>(rotation || [0, 0, 0])
  const [currentScale, setCurrentScale] = useState(scale)
const modelRef = useRef<THREE.Group>(null) // This becomes the PivotGroup
  // Queue management for post-stabilize clamp(s)
  const clampTokenRef = useRef(0)
  const rafClampIdRef = useRef<number | null>(null)
  const timeoutClampIdRef = useRef<any | null>(null)
  const cancelSoftClampOnly = useCallback(() => {
    if (rafClampIdRef.current != null) {
      try { cancelAnimationFrame(rafClampIdRef.current) } catch {}
    }
    if (timeoutClampIdRef.current != null) {
      try { clearTimeout(timeoutClampIdRef.current) } catch {}
    }
    rafClampIdRef.current = null
    timeoutClampIdRef.current = null
    clampTokenRef.current++
    // try { console.log('⏹️ CANCEL_SOFT_CLAMP_ONLY', { id }) } catch {}
  }, [id])
  const scheduleClamp = useCallback((cb: () => void, delayMs = 0) => {
    // Cancel any previously queued clamp; only the latest should run
    cancelSoftClampOnly()
    const token = ++clampTokenRef.current
    const run = () => {
      if (clampTokenRef.current !== token) return
      cb()
    }
    if (delayMs > 0) {
      timeoutClampIdRef.current = setTimeout(() => {
        rafClampIdRef.current = requestAnimationFrame(run)
      }, delayMs)
    } else {
      rafClampIdRef.current = requestAnimationFrame(run)
    }
  }, [cancelSoftClampOnly])
  const contentGroupRef = useRef<THREE.Group>(null) // This holds the actual model content
  const [pivotOffset, setPivotOffset] = useState<THREE.Vector3 | null>(null) // Offset to center the model
  const [pivotApplied, setPivotApplied] = useState(false)
  const [centerReady, setCenterReady] = useState(false)
  const [modelBoundingBox, setModelBoundingBox] = useState<THREE.Box3 | null>(null)
  const [modelTopY, setModelTopY] = useState<number | null>(null)
  const [labelCenter, setLabelCenter] = useState<THREE.Vector3>(new THREE.Vector3()) // State for label position
  const restoreAppliedFlagRef = useRef(false)
  const postStabilizeOnceRef = useRef(false)
  const centerCorrectedRef = useRef(false)
  const modelInfo = availableModels[modelName as keyof typeof availableModels]

  // Arrow drag bookkeeping (for vertical translate arrow)
  const arrowDragActiveRef = useRef(false)
  const arrowStartCenterRef = useRef<THREE.Vector3>(new THREE.Vector3())

  // Gizmo center in world space (live): provided by GLB loader (matches green sphere).
  const gizmoCenterRef = useRef<THREE.Vector3>(new THREE.Vector3())
  useEffect(() => {
    if (!selected) {
      // Optional: reset gizmo center when deselected
      // Note: We don't reset centerReady here because labels should remain visible
      // gizmoCenterRef.current.set(0, 0, 0)
    }
  }, [selected])
  
  // Update world-space top Y when center becomes ready
  useEffect(() => {
    if (centerReady && contentGroupRef.current && modelTopY === null) {
      contentGroupRef.current.updateMatrixWorld(true)
      const worldBox = new THREE.Box3().setFromObject(contentGroupRef.current)
      if (isFinite(worldBox.max.y)) {
        setModelTopY(worldBox.max.y)
        // console.log('🏷️ Label TopY updated:', { id, worldMaxY: worldBox.max.y })
      } else {
        // Fallback: some models can produce invalid bounds; still render a label using center as an approximation.
        const cy = (gizmoCenterRef.current && isFinite(gizmoCenterRef.current.y)) ? gizmoCenterRef.current.y : 0
        setModelTopY(cy + 0.8)
      }
    }
  }, [centerReady, modelTopY, id])

  
  useEffect(() => {
    // Register initial transform so it can be saved even if user doesn't move it
    onTransformChange?.(currentPosition, currentRotation, currentScale)
  }, [])
  
  // Helpers to compute and apply world transforms
  const getWorldTransform = useCallback(() => {
    if (!modelRef.current) return undefined
    modelRef.current.updateMatrixWorld(true)
    const wp = new THREE.Vector3(); const wq = new THREE.Quaternion(); const ws = new THREE.Vector3()
    modelRef.current.getWorldPosition(wp)
    modelRef.current.getWorldQuaternion(wq)
    modelRef.current.getWorldScale(ws)
    const centerArr: [number, number, number] | undefined = gizmoCenterRef.current
      ? [gizmoCenterRef.current.x, gizmoCenterRef.current.y, gizmoCenterRef.current.z]
      : undefined
    return {
      position: [wp.x, wp.y, wp.z] as [number, number, number],
      quaternion: [wq.x, wq.y, wq.z, wq.w] as [number, number, number, number],
      scale: [ws.x, ws.y, ws.z] as [number, number, number],
      center: centerArr,
    }
  }, [])

  const applySavedWorldTransform = useCallback((world: { position: [number, number, number]; quaternion?: [number, number, number, number]; scale?: [number, number, number] }) => {
    if (!modelRef.current) return
    const target = modelRef.current
    target.updateMatrixWorld(true)
    const parent = target.parent
    const parentInv = new THREE.Matrix4()
    if (parent) parent.updateMatrixWorld(true)
    if (parent) parentInv.copy(parent.matrixWorld).invert()

    const wp = new THREE.Vector3().fromArray(world.position)
    const wq = new THREE.Quaternion()
    if (world.quaternion) { wq.set(world.quaternion[0], world.quaternion[1], world.quaternion[2], world.quaternion[3]) } else { wq.identity() }
    const ws = new THREE.Vector3(...(world.scale ?? [1,1,1]))

    console.log('🧩 RESTORE_TRACE/applyWorld: input', { id, world })

    const worldM = new THREE.Matrix4().compose(wp, wq, ws)
    const localM = new THREE.Matrix4().multiplyMatrices(parentInv, worldM)
    localM.decompose(target.position, target.quaternion, target.scale)
    target.updateMatrixWorld(true)

    // Mirror into React state
    setCurrentPosition([target.position.x, target.position.y, target.position.z])
    const e = new THREE.Euler().setFromQuaternion(target.quaternion, 'XYZ')
    setCurrentRotation([e.x, e.y, e.z])

    // Log result
    logWorldState('afterApplyWorld')
  }, [])

  // PIVOT WRAPPER APPROACH: Calculate and apply pivot offset when model loads
  // This creates a "pivot group" structure where:
  // - modelRef (PivotGroup) = the selectable/transformable node at geometric center
  // - contentGroupRef (ContentGroup) = offset to center the actual model geometry
  // This ensures rotation happens around the true geometric center, not the GLB's origin
  const calculatePivotOffset = (gltf: GLTF) => {
    if (!contentGroupRef.current) return
    
    // Calculate the bounding box of the actual GLB content
    let box = new THREE.Box3()
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    
    // Special handling for server model with extreme outliers (same logic as TransformGizmo)
    if (modelName?.includes('server') || modelName?.includes('Server')) {
      const positions: number[] = []
      gltf.scene.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          const worldPos = new THREE.Vector3()
          child.getWorldPosition(worldPos)
          positions.push(worldPos.y)
        }
      })
      
      if (positions.length > 0) {
        const sortedY = [...positions].sort((a, b) => a - b)
        const median = sortedY[Math.floor(sortedY.length / 2)]
        const q1 = sortedY[Math.floor(sortedY.length * 0.25)]
        const q3 = sortedY[Math.floor(sortedY.length * 0.75)]
        const iqr = q3 - q1
        const outlierThreshold = 3 * iqr
        
        gltf.scene.traverse((child: any) => {
          if (child.isMesh && child.geometry) {
            const worldPos = new THREE.Vector3()
            child.getWorldPosition(worldPos)
            
            if (Math.abs(worldPos.y - median) <= outlierThreshold) {
              const meshBox = new THREE.Box3().setFromObject(child)
              box.union(meshBox)
            }
          }
        })
      }
      
      if (box.isEmpty()) {
        box = new THREE.Box3().setFromObject(gltf.scene)
      }
    } else {
      box = new THREE.Box3().setFromObject(gltf.scene)
    }
    
    // Simple pivot wrapper: center geometry
    const center = box.getCenter(new THREE.Vector3())
    const minY = box.min.y
    // Store bounding box for label positioning
    setModelBoundingBox(box.clone())
    
    // Calculate world-space bounding box for reliable label positioning
    // This accounts for wrapper position/scale and gives actual visual height
    if (contentGroupRef.current) {
      contentGroupRef.current.updateMatrixWorld(true)
      const worldBox = new THREE.Box3().setFromObject(contentGroupRef.current)
      if (isFinite(worldBox.max.y)) {
        setModelTopY(worldBox.max.y)
        if (restoreTrace) {
          try { console.log('🧩 RESTORE_TRACE/pivot', { id, center: { x: center.x, y: center.y, z: center.z }, minY, localMaxY: box.max.y, worldMaxY: worldBox.max.y }) } catch {}
        }
      }
    }
    
    // NOTE: Don't set blueWireframeCenter here - it should come from BlueBoundingBoxOutline
    // which includes the correct offsetY calculation
    
    if (modelRef.current && contentGroupRef.current) {
      // Update matrix to ensure correct transforms
      modelRef.current.updateMatrixWorld(true)
      
      // Convert world center to parent's local space
      const centerInParent = modelRef.current.worldToLocal(center.clone())
      
      // Store the offset and apply it to center the content
      const offset = centerInParent.clone().negate()
      setPivotOffset(offset)
      
      // Apply the offset to center the model content around the pivot
      contentGroupRef.current.position.copy(offset)
      
      // Mark pivot as applied
      setPivotApplied(true)
      if (restoreTrace) {
        try {
          const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
          console.log('🧩 RESTORE_TRACE/pivotApplied', { id, dtMs: Number((t1 - t0).toFixed(2)), offset: { x: offset.x, y: offset.y, z: offset.z } })
        } catch {}
      }
      
      if (savedOverride?.position) {
// Re-apply saved position precisely after pivot is set
        scheduleClamp(() => {
          if (modelRef.current) {
            // Apply saved local position
            // Prefer world transform if provided
            if (!restoreAppliedFlagRef.current && savedOverride?.worldPosition && savedOverride?.worldQuaternion && savedOverride?.worldScale) {
              applySavedWorldTransform({ position: savedOverride.worldPosition, quaternion: savedOverride.worldQuaternion, scale: savedOverride.worldScale })
              restoreAppliedFlagRef.current = true
            } else {
              modelRef.current.position.set(savedOverride.position[0], savedOverride.position[1], savedOverride.position[2])
              modelRef.current.updateMatrixWorld(true)
              setCurrentPosition(savedOverride.position)
            }
            // Broadcast restored transform so parent stages it for Save
            const wt = getWorldTransform()
            onTransformChange?.(savedOverride.position, currentRotation as [number, number, number], currentScale, wt)
            logWorldState('afterRestoreStage')

            if (restoreTrace) {
              try { console.log('🧩 RESTORE_TRACE/applySaved', { id, saved: { pos: savedOverride.position, rot: savedOverride.rotation, scale: savedOverride.scale }, currentScale }) } catch {}
            }

            // Notify parent that saved transform has been applied post-pivot
            try { onRestoreApplied?.(id) } catch {}

// Light, one-time soft clamp after world transform settles
            scheduleClamp(() => {
              try { console.log('🧩 RESTORE_TRACE/softClampSchedule', { id }) } catch {}
              try { clampInsideRoomBoundsSoft() } catch {}
              try { logWorldState('afterSoftClamp') } catch {}
              // Chain a post-stabilize apply + floor lift guarded by the same token
              const token = clampTokenRef.current
              rafClampIdRef.current = requestAnimationFrame(() => {
                if (clampTokenRef.current !== token) return
                if (!postStabilizeOnceRef.current && savedOverride?.worldPosition && savedOverride?.worldQuaternion && savedOverride?.worldScale) {
                  postStabilizeOnceRef.current = true
                  try {
                    applySavedWorldTransform({ position: savedOverride.worldPosition, quaternion: savedOverride.worldQuaternion, scale: savedOverride.worldScale })
                    logWorldState('afterPostStabilizeApply')
                    floorLiftOnly()
                    logWorldState('afterPostStabilizeFloorLift')
                  } catch {}
                }
              })
            })

            // Previously we skipped vertical clamping once; now we always enforce floor by min.y
            if (restoreTrace) {
              try { console.log('🧩 RESTORE_TRACE/floorClampPolicy', { id, note: 'Always clamp Y by bbox.min.y to floor' }) } catch {}
            }
          }
        })
      } else {
// No saved override -> clamp to ensure in-bounds (single stabilized pass)
        clampInsideRoomBounds()
        scheduleClamp(() => clampInsideRoomBounds())
        // After clamp stabilizes, stage the final transform so Save captures base models too
        scheduleClamp(() => {
          if (modelRef.current) {
            const p = modelRef.current.position
            setCurrentPosition([p.x, p.y, p.z])
            const wt = getWorldTransform()
            onTransformChange?.([p.x, p.y, p.z], currentRotation as [number, number, number], currentScale, wt)
          }
        }, 40)
      }
    }
  }
  // Helper: floor-lift only (no X/Z), used during restore to avoid horizontal relocation
const floorLiftOnly = useCallback(() => {
    if (!roomDimensions || !modelRef.current || !contentGroupRef.current) return
    // Recompute latest matrices and AABB right before lifting
    modelRef.current.updateMatrixWorld(true)
    contentGroupRef.current.updateMatrixWorld(true)
    const worldBoxBefore = new THREE.Box3().setFromObject(contentGroupRef.current)
    if (!isFinite(worldBoxBefore.min.y)) return
    const yLift = Math.max(0 - worldBoxBefore.min.y, 0)
    if (yLift > CLAMP.EPS_Y) {
      modelRef.current.position.y += yLift
      modelRef.current.updateMatrixWorld(true)
      contentGroupRef.current.updateMatrixWorld(true)
      const worldBoxAfter = new THREE.Box3().setFromObject(contentGroupRef.current)
      const np: [number, number, number] = [
        modelRef.current.position.x,
        modelRef.current.position.y,
        modelRef.current.position.z,
      ]
      setCurrentPosition(np)
      const wt = getWorldTransform()
      onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)
      // if (process.env.NODE_ENV === 'development' || restoreTrace) {
      //   try { console.log('🧭 FLOOR_LIFT_APPLIED', { id, dy: Number(yLift.toFixed(3)), eps: CLAMP.EPS_Y, minY_before: Number(worldBoxBefore.min.y.toFixed(4)), minY_after: Number(worldBoxAfter.min.y.toFixed(4)) }) } catch {}
      // }
    } else {
      // if (process.env.NODE_ENV === 'development' || restoreTrace) {
      //   try { console.log('🧭 FLOOR_LIFT_NOOP', { id, dy: Number(yLift.toFixed(3)), eps: CLAMP.EPS_Y, minY_before: Number(worldBoxBefore.min.y.toFixed(4)) }) } catch {}
      // }
    }
  }, [roomDimensions, getWorldTransform, onTransformChange, currentRotation, currentScale, restoreTrace, id, CLAMP])

  // Keep model fully inside room bounds by clamping its world-space bounding box
const clampInsideRoomBounds = useCallback((opts?: { strictXZ?: boolean }) => {
    if (!roomDimensions || !modelRef.current || !contentGroupRef.current) return
    if (process.env.NODE_ENV === 'development' || restoreTrace) {
      try {
        const p = modelRef.current.position
        console.log('🧱 HARD CLAMP: before', { id, pos: { x: p.x.toFixed(3), y: p.y.toFixed(3), z: p.z.toFixed(3) } })
      } catch {}
    }

    // Ensure matrices are up to date
    modelRef.current.updateMatrixWorld(true)
    contentGroupRef.current.updateMatrixWorld(true)

    // Compute world-space bounding box of the entire model content (including any child scales)
    const worldBox = new THREE.Box3().setFromObject(contentGroupRef.current)
    if (!isFinite(worldBox.min.x) || !isFinite(worldBox.max.x)) return

    const halfRoomX = Math.max(0, roomDimensions.width / 2)
    const halfRoomZ = Math.max(0, roomDimensions.depth / 2)
    const ceilingY = Math.max(0, roomDimensions.height || 0)

    const minAllowedX = -halfRoomX + CLAMP.MARGIN_IN
    const maxAllowedX = +halfRoomX - CLAMP.MARGIN_IN
    const minAllowedZ = -halfRoomZ + CLAMP.MARGIN_IN
    const maxAllowedZ = +halfRoomZ - CLAMP.MARGIN_IN
    const minAllowedY = 0
    const maxAllowedY = Math.max(0, (ceilingY || 0) - CLAMP.MARGIN_IN)

    // If restoring from saved layout, trust horizontal pose unless significantly out.
    // But for user-driven changes (drag end / scale), force strict clamping so the scene
    // doesn't later "jump" on reload when savedOverride is absent.
    const strictXZ = !!opts?.strictXZ
    const guard = (axShift: number) => {
      if (strictXZ) return Math.abs(axShift) >= CLAMP.EPS
      return (restorePhase && savedOverride)
        ? (Math.abs(axShift) >= CLAMP.RESTORE_GUARD_XZ)
        : (Math.abs(axShift) >= CLAMP.EPS)
    }

    let shiftX = 0
    if (worldBox.min.x < minAllowedX) shiftX += (minAllowedX - worldBox.min.x)
    if (worldBox.max.x > maxAllowedX) shiftX -= (worldBox.max.x - maxAllowedX)
    if (!guard(shiftX)) shiftX = 0

    let shiftZ = 0
    if (worldBox.min.z < minAllowedZ) shiftZ += (minAllowedZ - worldBox.min.z)
    if (worldBox.max.z > maxAllowedZ) shiftZ -= (worldBox.max.z - maxAllowedZ)
    if (!guard(shiftZ)) shiftZ = 0

    let shiftY = 0
    if (worldBox.min.y < minAllowedY - CLAMP.EPS) shiftY += (minAllowedY - worldBox.min.y)
    if (worldBox.max.y > maxAllowedY + CLAMP.EPS) shiftY -= (worldBox.max.y - maxAllowedY)
    if (Math.abs(shiftY) < CLAMP.EPS) shiftY = 0

    const shift = new THREE.Vector3(shiftX, shiftY, shiftZ)

    if (shift.lengthSq() > 0) {
      modelRef.current.position.add(shift)
      const np: [number, number, number] = [
        modelRef.current.position.x,
        modelRef.current.position.y,
        modelRef.current.position.z,
      ]
      setCurrentPosition(np)
      // Inform parent so layout map reflects clamped position before Save
      {
        const wt = getWorldTransform()
        onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)
        logWorldState('afterHardClamp')
      }

      if (process.env.NODE_ENV === 'development' || restoreTrace) {
        try {
          const p = modelRef.current.position
          console.log('🧱 HARD CLAMP: applied', {
            id,
            shift: { x: shift.x.toFixed(3), y: shift.y.toFixed(3), z: shift.z.toFixed(3) },
            newPos: { x: p.x.toFixed(3), y: p.y.toFixed(3), z: p.z.toFixed(3) }
          })
        } catch {}
      }
    } else {
      if (process.env.NODE_ENV === 'development' || restoreTrace) {
        try { console.log('🧱 HARD CLAMP: no-op', { id }) } catch {}
      }
    }
  }, [roomDimensions, id, restoreTrace, onTransformChange, currentRotation, currentScale, restorePhase, savedOverride, CLAMP])

  // Soft, one-time clamp for restored items: only nudge back inside if clearly out of bounds
const clampInsideRoomBoundsSoft = useCallback(() => {
    if (!roomDimensions || !modelRef.current || !contentGroupRef.current) return

    if (process.env.NODE_ENV === 'development' || restoreTrace) {
      try {
        const p = modelRef.current.position
        console.log('🧭 SOFT CLAMP: before', { id, pos: { x: p.x.toFixed(3), y: p.y.toFixed(3), z: p.z.toFixed(3) } })
      } catch {}
    }

    // Ensure matrices are up to date
    modelRef.current.updateMatrixWorld(true)
    contentGroupRef.current.updateMatrixWorld(true)

    const worldBox = new THREE.Box3().setFromObject(contentGroupRef.current)
    if (!isFinite(worldBox.min.x) || !isFinite(worldBox.max.x)) return

    const halfRoomX = Math.max(0, roomDimensions.width / 2)
    const halfRoomZ = Math.max(0, roomDimensions.depth / 2)
    const ceilingY = Math.max(0, roomDimensions.height || 0)

    // Allowed ranges with hysteresis: we treat being inside the looser OUT margin as "ok"
    const minAllowedX_in = -halfRoomX + CLAMP.MARGIN_IN
    const maxAllowedX_in = +halfRoomX - CLAMP.MARGIN_IN
    const minAllowedZ_in = -halfRoomZ + CLAMP.MARGIN_IN
    const maxAllowedZ_in = +halfRoomZ - CLAMP.MARGIN_IN

    const minAllowedX_ok = -halfRoomX + CLAMP.MARGIN_OUT
    const maxAllowedX_ok = +halfRoomX - CLAMP.MARGIN_OUT
    const minAllowedZ_ok = -halfRoomZ + CLAMP.MARGIN_OUT
    const maxAllowedZ_ok = +halfRoomZ - CLAMP.MARGIN_OUT

    const minAllowedY = 0
    const maxAllowedY = Math.max(0, (ceilingY || 0) - CLAMP.MARGIN_IN)

    // Always perform floor lift; horizontal only if outside by guard/EPS
    let yLift = Math.max(0 - worldBox.min.y, 0)

    // Determine X/Z shifts against edges only (no center)
    let shiftX = 0
    if (worldBox.min.x < minAllowedX_ok - CLAMP.EPS) shiftX += (minAllowedX_in - worldBox.min.x)
    if (worldBox.max.x > maxAllowedX_ok + CLAMP.EPS) shiftX -= (worldBox.max.x - maxAllowedX_in)
    let shiftZ = 0
    if (worldBox.min.z < minAllowedZ_ok - CLAMP.EPS) shiftZ += (minAllowedZ_in - worldBox.min.z)
    if (worldBox.max.z > maxAllowedZ_ok + CLAMP.EPS) shiftZ -= (worldBox.max.z - maxAllowedZ_in)

    // Guardrail: for restored items, ignore small horizontal corrections
    if (restorePhase && savedOverride) {
      if (Math.abs(shiftX) < CLAMP.RESTORE_GUARD_XZ) shiftX = 0
      if (Math.abs(shiftZ) < CLAMP.RESTORE_GUARD_XZ) shiftZ = 0
    } else {
      if (Math.abs(shiftX) < CLAMP.EPS) shiftX = 0
      if (Math.abs(shiftZ) < CLAMP.EPS) shiftZ = 0
    }

    const shiftY = (() => {
      let sy = 0
      if (worldBox.min.y < minAllowedY - CLAMP.EPS) sy += (minAllowedY - worldBox.min.y)
      if (worldBox.max.y > maxAllowedY + CLAMP.EPS) sy -= (worldBox.max.y - maxAllowedY)
      // Prefer floor-lift first
      if (sy === 0 && yLift > CLAMP.EPS) sy = yLift
      if (Math.abs(sy) < CLAMP.EPS) sy = 0
      return sy
    })()

    const shift = new THREE.Vector3(shiftX, shiftY, shiftZ)

    if (shift.lengthSq() > 0) {
      if (process.env.NODE_ENV === 'development' || restoreTrace) {
        console.log(
          `🧭 SOFT CLAMP: edge-based nudging ${id}`,
          {
            shift: { x: shift.x.toFixed(3), y: shift.y.toFixed(3), z: shift.z.toFixed(3) },
            worldBoxMin: { x: worldBox.min.x.toFixed(3), y: worldBox.min.y.toFixed(3), z: worldBox.min.z.toFixed(3) },
            worldBoxMax: { x: worldBox.max.x.toFixed(3), y: worldBox.max.y.toFixed(3), z: worldBox.max.z.toFixed(3) }
          }
        )
      }
      modelRef.current.position.add(shift)
      const np: [number, number, number] = [
        modelRef.current.position.x,
        modelRef.current.position.y,
        modelRef.current.position.z,
      ]
      setCurrentPosition(np)
      // Reflect clamped position to layout map immediately
      {
        const wt = getWorldTransform()
        onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)
        logWorldState('afterSoftClampApplied')
      }
    } else {
      // If no horizontal move, still apply pure floor-lift if needed
      if (yLift > CLAMP.EPS) {
        modelRef.current.position.y += yLift
        const np: [number, number, number] = [
          modelRef.current.position.x,
          modelRef.current.position.y,
          modelRef.current.position.z,
        ]
        setCurrentPosition(np)
        const wt = getWorldTransform()
        onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)
        logWorldState('afterSoftFloorLift')
      }
    }
  }, [roomDimensions, id, onTransformChange, currentRotation, currentScale, restoreTrace, getWorldTransform, restorePhase, savedOverride, CLAMP])
  
  
  // Simple click handler like the original
  const handleClick = useCallback((event: any) => {
    event?.stopPropagation?.()

    // If gizmo is hovered or dragging, give it priority and ignore model clicks
    const globalState = (typeof window !== 'undefined') ? (window as any).globalGizmoState : undefined
    if (globalState?.isDragging || globalState?.isHovering) {
      return
    }
    
    if (editModeEnabled && onModelClick) {
      // Toggle selection
      const newSelected = !selected
      onModelClick(id) // This will toggle the selection state
      
      console.log(`🕱️ ${newSelected ? 'Selected' : 'Deselected'} ${modelInfo?.name || modelName}`)
    } else if (!editModeEnabled) {
      console.log(`🕱️ Clicked on ${modelInfo?.name || modelName}`)
    }
  }, [editModeEnabled, onModelClick, selected, id, modelInfo?.name, modelName])
  
  
  // Handle transform changes from gizmo (like the original)
  const handleTransformChange = (newPosition: [number, number, number], newRotation: [number, number, number]) => {
    setCurrentPosition(newPosition)
    setCurrentRotation(newRotation)
    const wt = getWorldTransform()
    onTransformChange?.(newPosition, newRotation, currentScale, wt)
    console.log(`🔄 Model ${id} transformed to [${newPosition[0].toFixed(2)}, ${newPosition[1].toFixed(2)}, ${newPosition[2].toFixed(2)}]`)
  }
  
  
  
  const logTransform = (tag: string) => {
    try {
      if (!modelRef.current || !contentGroupRef.current) return
      const p = modelRef.current.position
      const wb = new THREE.Box3().setFromObject(contentGroupRef.current)
      // console.log(`🧩 RESTORE_DEBUG/${tag}`, {
      //   id,
      //   localPos: { x: p.x.toFixed(3), y: p.y.toFixed(3), z: p.z.toFixed(3) },
      //   worldBoxMin: { x: wb.min.x.toFixed(3), y: wb.min.y.toFixed(3), z: wb.min.z.toFixed(3) },
      //   worldBoxMax: { x: wb.max.x.toFixed(3), y: wb.max.y.toFixed(3), z: wb.max.z.toFixed(3) }
      // })
    } catch {}
  }

  const logWorldState = (tag: string) => {
    try {
      if (!modelRef.current || !contentGroupRef.current) return
      modelRef.current.updateMatrixWorld(true)
      contentGroupRef.current.updateMatrixWorld(true)
      const wt = getWorldTransform()
      const wb = new THREE.Box3().setFromObject(contentGroupRef.current)
      // console.log(`🧩 RESTORE_WORLD/${tag}`, {
      //   id,
      //   world: wt,
      //   worldBoxMin: { x: wb.min.x.toFixed(3), y: wb.min.y.toFixed(3), z: wb.min.z.toFixed(3) },
      //   worldBoxMax: { x: wb.max.x.toFixed(3), y: wb.max.y.toFixed(3), z: wb.max.z.toFixed(3) }
      // })
    } catch {}
  }

  const handleModelLoad = (gltf: GLTF) => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const DEBUG = params?.get('debug') === '1' || !!w.__DEBUG__
      if (DEBUG) console.log(`🔗 GLBModel: handleModelLoad called for ${id}`)
    } catch {}
    
    // First, let the normal onLoad handler run
    if (onLoad) {
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const DEBUG = params?.get('debug') === '1' || !!w.__DEBUG__
        if (DEBUG) console.log(`🔗 GLBModel: Calling onLoad callback for ${id}`)
      } catch {}
      onLoad(id, gltf)
    }
    
// Then calculate and apply the pivot offset immediately (no delay)
    calculatePivotOffset(gltf)
    // Snapshot after pivot calculation
    scheduleClamp(() => { logTransform('afterPivot'); logWorldState('afterPivot') })
  }

  // Flush latest transform into layout map when saving
  useEffect(() => {
    const handler = () => {
      // Ensure matrices are up-to-date
      try { modelRef.current?.updateMatrixWorld(true) } catch {}
      try { contentGroupRef.current?.updateMatrixWorld(true) } catch {}

      // Use live Object3D transforms (state can be 1-frame stale during/after direct-manipulation drags)
      const livePos: [number, number, number] = (() => {
        const p = modelRef.current?.position
        return p ? [p.x, p.y, p.z] : (currentPosition as [number, number, number])
      })()
      const liveRot: [number, number, number] = (() => {
        if (modelRef.current) {
          const e = new THREE.Euler().setFromQuaternion(modelRef.current.quaternion, 'XYZ')
          return [e.x, e.y, e.z]
        }
        return currentRotation as [number, number, number]
      })()
      const liveScale = currentScale

      // Prefer the same center the user sees (green sphere) when saving.
      // If it's not ready yet, fall back to bbox center of the rendered content.
      let centerArr: [number, number, number] | undefined
      if (centerReady) {
        try {
          const c = gizmoCenterRef.current
          if (c && isFinite(c.x) && isFinite(c.y) && isFinite(c.z)) {
            centerArr = [c.x, c.y, c.z]
          }
        } catch {}
      }
      if (!centerArr) {
        try {
          if (contentGroupRef.current) {
            const box = new THREE.Box3().setFromObject(contentGroupRef.current)
            if (isFinite(box.min.x) && isFinite(box.max.x)) {
              const c = box.getCenter(new THREE.Vector3())
              centerArr = [c.x, c.y, c.z]
            }
          }
        } catch {}
      }

      const toVec3 = (s: any): [number, number, number] => {
        if (Array.isArray(s)) return [Number(s[0] ?? 1), Number(s[1] ?? 1), Number(s[2] ?? 1)]
        if (typeof s === 'number') return [s, s, s]
        return [1, 1, 1]
      }

      const wt = getWorldTransform() || {
        position: livePos,
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
        scale: toVec3(liveScale),
      }
      const worldWithCenter = { ...wt, center: centerArr ?? (wt as any).center }
      onTransformChange?.(livePos, liveRot, liveScale, worldWithCenter)
    }
    try { document.addEventListener('forceLayoutStage', handler as any) } catch {}
    return () => { try { document.removeEventListener('forceLayoutStage', handler as any) } catch {} }
  }, [currentPosition, currentRotation, currentScale, onTransformChange, getWorldTransform, centerReady])
  
  const isUnitScale = useCallback((s: any) => {
    if (Array.isArray(s)) return (Math.abs((s[0] ?? 1) - 1) < 1e-6) && (Math.abs((s[1] ?? 1) - 1) < 1e-6) && (Math.abs((s[2] ?? 1) - 1) < 1e-6)
    if (typeof s === 'number') return Math.abs(s - 1) < 1e-6
    return true
  }, [])
  const shouldDisableAutoScale = savedOverride ? !isUnitScale(currentScale) : false

  const idCenterRef = useRef<THREE.Group>(null)
  const aliasCenterRef = useRef<THREE.Group>(null)
  // Canonical alias derived from id (strip -https suffix) so flows can use router1/switch1/etc.
  const canonicalAlias = useMemo(() => {
    try {
      if (id && typeof id === 'string' && id.endsWith('-https')) return id.slice(0, -6)
    } catch {}
    return undefined
  }, [id])
  const canonicalCenterRef = useRef<THREE.Group>(null)
  const anchorTmpRef = useRef(new THREE.Vector3())

  useEffect(() => {
    // alias logging removed
  }, [aliasName, id])

  // Keep live anchors "{id}-center", "{alias}-center", and canonical "{id-without-suffix}-center" aligned to green-sphere world center
  useFrame(() => {
    if (modelRef.current) {
      // Avoid per-frame allocations: copy into a persistent temp vector.
      const local = anchorTmpRef.current.copy(gizmoCenterRef.current)
      modelRef.current.worldToLocal(local)
      if (idCenterRef.current) idCenterRef.current.position.copy(local)
      if (aliasName && aliasCenterRef.current) aliasCenterRef.current.position.copy(local)
      if (canonicalAlias && canonicalCenterRef.current) canonicalCenterRef.current.position.copy(local)
    }
  })

  const model = (
    <group 
      ref={modelRef}
      name={id}
      position={currentPosition}
      rotation={currentRotation}
    >
      <group name={`${id}-center`} ref={idCenterRef} />
      {aliasName ? <group name={aliasName} /> : null}
      {aliasName ? <group name={`${aliasName}-center`} ref={aliasCenterRef} /> : null}
      {canonicalAlias ? <group name={canonicalAlias} /> : null}
      {canonicalAlias ? <group name={`${canonicalAlias}-center`} ref={canonicalCenterRef} /> : null}
      {/* Content Group - holds the actual model and gets offset to center the geometry */}
      <group ref={contentGroupRef}>
        {/* Per-model suspense without a visual placeholder to avoid any pre-load relocation */}
        <Suspense fallback={null}>
          <OptimizedModel
            name={modelInfo?.name || modelName}
            basePath={modelName}
            position={[0, 0, 0]} // Position is handled by the parent groups
            rotation={[0, 0, 0]}  // Rotation is handled by the parent groups
            scale={currentScale}
            quality={quality}
            interactive={true}
            onClick={handleClick}
            onHover={setHovered}
            onLoad={handleModelLoad}
            onError={(error) => onError?.(id, error)}
            showSelectionOutline={selected && editModeEnabled} // Blue wireframe when selected in edit mode
            showCenter={selected && editModeEnabled} // Green center sphere when selected in edit mode
            showCenterAlways={showCenterDebug} // Always show center sphere in debug mode
            parentGroupRef={contentGroupRef}
            disableAutoScale={!!savedOverride}
onCenterCalculated={(worldCenter) => {
              gizmoCenterRef.current.copy(worldCenter)
              setLabelCenter(worldCenter.clone()) // Update label center state
              setCenterReady(true)
              // One-time center correction to match saved world center exactly
              if (!centerCorrectedRef.current && savedOverride?.worldCenter && modelRef.current) {
                const desired = new THREE.Vector3().fromArray(savedOverride.worldCenter)
                const delta = new THREE.Vector3().subVectors(desired, worldCenter)
                if (delta.lengthSq() > 0) {
                  modelRef.current.position.add(delta)
                  modelRef.current.updateMatrixWorld(true)
                  const np: [number, number, number] = [
                    modelRef.current.position.x,
                    modelRef.current.position.y,
                    modelRef.current.position.z,
                  ]
                  setCurrentPosition(np)
                  const wt = getWorldTransform()
                  onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)
                  // Any transform invalidates queued soft clamp only (floor-lift remains independent)
                  cancelSoftClampOnly()
                }
                centerCorrectedRef.current = true
                if (restoreTrace) {
                  try { console.log('🧩 RESTORE_TRACE/centerCorrected', { id, delta: { x: delta.x.toFixed(3), y: delta.y.toFixed(3), z: delta.z.toFixed(3) } }) } catch {}
                }
              }
              // Always run an immediate, independent floor-lift after center is known (idempotent)
              try { floorLiftOnly() } catch {}
            }}
            suppressRender={!pivotApplied}
onPositionChange={(np, isDragging) => {
              // Apply immediately to the Object3D (React state can lag during pointer-driven drags)
              if (modelRef.current) {
                modelRef.current.position.set(np[0], np[1], np[2])
                modelRef.current.updateMatrixWorld(true)
              }

              // Single source of truth: parent owns translation. Mirror into state.
              setCurrentPosition(np)
              setLabelCenter(gizmoCenterRef.current.clone()) // Update label position when model moves
              const wt = getWorldTransform()
              onTransformChange?.(np, currentRotation as [number, number, number], currentScale, wt)

              // Any transform invalidates queued clamp
cancelSoftClampOnly()

              if (isDragging) {
                // During active dragging, skip clamping to avoid jitter/flicker
                console.log(`📐 onPositionChange(${id}): drag active, skipping clamp`, { np })
              } else {
                // Always clamp on drag end / programmatic updates so users don't get a surprise clamp on reload
                console.log(`📐 onPositionChange(${id}): scheduling clamp`, { np })
                scheduleClamp(() => {
                  clampInsideRoomBounds({ strictXZ: true })
                  console.log(`📐 clampInsideRoomBounds(${id}): done`)
                })
              }
            }}
onScaleChange={(ns) => {
              setCurrentScale(ns as any)
              const wt = getWorldTransform()
              onTransformChange?.(currentPosition, currentRotation, ns, wt)
              // Any transform invalidates queued clamp
cancelSoftClampOnly()
              // Clamp after scale change to keep within bounds
              scheduleClamp(() => clampInsideRoomBounds({ strictXZ: true }))
            }}
          />
        </Suspense>
      </group>
      
      {/* Drag functionality integrated into the model click handler */}
    </group>
  )
  
  if (enablePhysics) {
    return (
      <group>
        <RigidBody type="fixed" colliders="hull">
          {model}
        </RigidBody>
        {selected && editModeEnabled && centerReady && (
          <>
            <RotationGizmo
              center={gizmoCenterRef.current}
              centerRef={gizmoCenterRef}
              target={modelRef}
              axes={["y", "x", "z"]}
              colors={{ y: "#ff0000", x: "#00ff00", z: "#0080ff" }}
              activeColors={{ y: "#ff8080", x: "#80ff80", z: "#80b3ff" }}
              radius={0.9}
              thickness={0.014}
              hitScale={2.4}
              maintainWorldSize={true}
              renderOrder={3000}
              depthTest={false}
              depthWrite={false}
              applyToTarget={true}
              onRotate={() => {
            if (modelRef.current) {
              const e = new THREE.Euler().setFromQuaternion(modelRef.current.quaternion, 'XYZ')
              const nr: [number, number, number] = [e.x, e.y, e.z]
              setCurrentRotation(nr)
              const wt = getWorldTransform()
              onTransformChange?.(currentPosition, nr, currentScale, wt)

              // Any transform invalidates queued clamp
              cancelSoftClampOnly()
              // Debounce: clamp only after rotation settles to avoid jitter while dragging the ring
              scheduleClamp(() => clampInsideRoomBounds({ strictXZ: true }), 60)
            }
              }}
            />
            <VerticalTranslateArrow
              axis="y"
              centerRef={gizmoCenterRef}
              target={modelRef}
              color="#00ff00"
              length={0.975}
              shaftRadius={0.012}
              headLength={0.208}
              headRadius={0.029}
              hitScale={1.96}
              maintainWorldSize={true}
              renderOrder={2100}
              depthTest={false}
              depthWrite={false}
onTranslate={(nextLocalPos, isDragging, worldDelta) => {
                // Apply immediately to the Object3D to avoid setState lag
                if (modelRef.current) {
                  modelRef.current.position.set(nextLocalPos[0], nextLocalPos[1], nextLocalPos[2])
                  modelRef.current.updateMatrixWorld(true)
                }
                // Mirror into React state
                setCurrentPosition(nextLocalPos)

                // Any transform invalidates queued clamp
cancelSoftClampOnly()

                // Keep gizmo center in perfect lockstep using TOTAL world delta from drag start
                if (worldDelta) {
                  if (!arrowDragActiveRef.current) {
                    arrowDragActiveRef.current = true
                    arrowStartCenterRef.current.copy(gizmoCenterRef.current)
                  }
                  const newCenter = new THREE.Vector3().copy(arrowStartCenterRef.current).add(worldDelta)
                  gizmoCenterRef.current.copy(newCenter)
                  setLabelCenter(newCenter.clone()) // Update label when arrow translates
                }

                if (!isDragging) {
                  arrowDragActiveRef.current = false
                  scheduleClamp(() => {
                    clampInsideRoomBounds({ strictXZ: true })
                  })
                }
              }}
            />
          </>
        )}
        
      {selected && modelInfo?.description && (
        <Html position={[currentPosition[0], currentPosition[1] + 2, currentPosition[2]]}>
          <div className="bg-black/90 text-white p-3 rounded shadow-lg max-w-xs">
            <h4 className="font-bold">{modelInfo?.name || modelName}</h4>
            <p className="text-sm text-gray-300">{modelInfo?.description}</p>
            <div className="text-xs text-blue-300 mt-1">
              Quality: {quality} • Physics: enabled
            </div>
          </div>
        </Html>
      )}
      
      {/* GLB Label with category logo and text */}
      {!hideLabel && category && centerReady && modelTopY !== null && (
        <GLBLabel
          text={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return customLabel || 'Internet'
            if (norm === 'server') return customLabel || 'Servers'
            return customLabel || raw
          })()}
          category={category}
          centerPosition={labelCenter}
          modelTopY={modelTopY}
          visible={true}
          // Disable occlusion for elements near the VPN tunnel so their labels remain visible.
          occlude={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return false
            if (id === 'desktop1' || id === 'firewall1') return false
            return true
          })()}
          alignTo={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return 'center'
            if (id === 'desktop1') return 'center'
            return 'top'
          })()}
          yOffset={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return 0.45
            if (id === 'desktop1') return 0.85

            if (id === 'firewall1') return 0.9
            return 0.5
          })()}
          showMetadataToggle={category === 'desktop' || category === 'desktops' || category === 'laptop' || category === 'laptops' || category === 'server' || category === 'servers' || category === 'router' || category === 'routers' || category === 'firewall' || category === 'firewalls' || category === 'Firewall' || category === 'switch' || category === 'switches'}
          metadataVisible={metadataVisible}
          onToggleMetadata={() => setMetadataVisible(!metadataVisible)}
        />
      )}

      {/* Desktop Metadata Board */}
      {category && (category === 'desktop' || category === 'desktops') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <DesktopMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            desktopData={(() => {
              if (!isVpnRoom || !deviceMeta) return undefined
              const net = (deviceMeta as any).net || {}
              const rawIfaces = Array.isArray(net.interfaces) ? net.interfaces : []
              return {
                id,
                type: String((deviceMeta as any).type || 'desktop'),
                label: String(customLabel || (deviceMeta as any).title || 'Desktop'),
                os: String((deviceMeta as any).os || 'Unknown'),
                interfaces: rawIfaces.map((i: any) => ({
                  id: i?.id,
                  name: i?.name,
                  kind: i?.kind,
                  ip: i?.ip,
                  gateway: i?.gateway,
                })),
                capabilities: String((deviceMeta as any).capabilities || ''),
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Laptop Metadata Board */}
      {category && (category === 'laptop' || category === 'laptops') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <LaptopMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            laptopData={{
              id: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'laptop1' : 'laptop2',
              type: 'laptop',
              label: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'Client Laptop A' : 'Client Laptop B',
              os: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'Windows 11' : 'macOS Sonoma',
              interfaces: {
                id: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'laptop1.eth0' : 'laptop2.eth0',
                name: 'eth0',
                kind: 'eth',
                ip: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? '192.168.1.10' : '192.168.1.11'
              },
              capabilities: 'http, dns, tls, ping'
            }}
          />
        </Billboard>
      )}
      
      {/* Server Metadata Board */}
      {category && (category === 'server' || category === 'servers') && metadataVisible && centerReady && (() => {
        const getServerData = () => {
          if (customLabel === 'DNS Server' || id.includes('1761163254060')) {
            return {
              id: 'dns1',
              type: 'server',
              label: 'DNS Server',
              os: 'Bind9 on Ubuntu 22.04',
              interfaces: { id: 'dns1.eth0', name: 'eth0', kind: 'eth', ip: '8.8.8.8' },
              capabilities: 'dns, cache, recursive, authoritative'
            }
          } else if (customLabel === 'CDN Edge' || id.includes('1761163253314')) {
            return {
              id: 'cdn1',
              type: 'server',
              label: 'CDN Edge Node',
              os: 'CloudLinux 9 + Nginx',
              interfaces: { id: 'cdn1.eth0', name: 'eth0', kind: 'eth', ip: '203.0.113.100' },
              capabilities: 'cache, http, https, tls, cdn, gzip'
            }
          } else if (customLabel === 'Web Server' || id.includes('1761163250434')) {
            return {
              id: 'web1',
              type: 'server',
              label: 'Web Server (Origin)',
              os: 'Ubuntu 20.04 + Nginx',
              interfaces: { id: 'web1.eth0', name: 'eth0', kind: 'eth', ip: '172.217.12.14' },
              capabilities: 'http, https, tls, etag, cache-control'
            }
          }
          return null
        }

        const serverData = (() => {
          if (!isVpnRoom || !deviceMeta) return null
          const net = (deviceMeta as any).net || {}
          const rawIfaces = Array.isArray(net.interfaces) ? net.interfaces : []
          const primary = rawIfaces[0] || {}
          return {
            id,
            type: String((deviceMeta as any).type || 'server'),
            label: String(customLabel || (deviceMeta as any).title || 'Server'),
            os: String((deviceMeta as any).os || 'Unknown'),
            interfaces: {
              id: String(primary.id || `${id}.eth0`),
              name: String(primary.name || 'eth0'),
              kind: String(primary.kind || 'lan'),
              ip: String(primary.ip || ''),
            },
            capabilities: String((deviceMeta as any).capabilities || ''),
          }
        })() ?? getServerData()

        return serverData ? (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
            <ServerMetaDataBoard
              visible={true}
              position={[0, 0, 0]}
              offsetRight={2.0}
              serverData={serverData}
            />
          </Billboard>
        ) : null
      })()}
      
      {/* Router Metadata Board */}
      {category && (category === 'router' || category === 'routers') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <RouterMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            routerData={(() => {
              if (isVpnRoom && deviceMeta) {
                const net = (deviceMeta as any).net || {}
                const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
                if (ifaces.length) {
                  return {
                    id,
                    type: String((deviceMeta as any).type || 'router'),
                    label: String(customLabel || (deviceMeta as any).title || 'Router'),
                    os: String((deviceMeta as any).os || 'Unknown'),
                    interfaces: ifaces.map((i: any) => ({ name: String(i?.name || ''), type: String(i?.type || ''), ip: String(i?.ip || '') })),
                    capabilities: String((deviceMeta as any).capabilities || ''),
                  }
                }
              }
              return {
                id: 'router1',
                type: 'router',
                label: 'Edge Router',
                os: 'Cisco IOS-XE 17.9',
                interfaces: [
                  { name: 'Gi0/0', type: 'LAN', ip: '192.168.10.1' },
                  { name: 'Gi0/1', type: 'WAN', ip: '203.0.113.2' }
                ],
                capabilities: 'routing, nat'
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Firewall Metadata Board */}
      {category && (category === 'firewall' || category === 'firewalls' || category === 'Firewall') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <FirewallMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            firewallData={(() => {
              if (isVpnRoom && deviceMeta) {
                const net = (deviceMeta as any).net || {}
                const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
                if (ifaces.length) {
                  return {
                    id,
                    type: String((deviceMeta as any).type || 'firewall'),
                    label: String(customLabel || (deviceMeta as any).title || 'Firewall'),
                    os: String((deviceMeta as any).os || 'Unknown'),
                    interfaces: ifaces.map((i: any) => ({ name: String(i?.name || ''), type: String(i?.type || ''), ip: String(i?.ip || '') })),
                    capabilities: String((deviceMeta as any).capabilities || ''),
                  }
                }
              }
              return {
                id: 'firewall1',
                type: 'firewall',
                label: 'Perimeter Firewall',
                os: 'FortiOS 7.4',
                interfaces: [
                  { name: 'inside', type: 'LAN', ip: '192.168.10.254' },
                  { name: 'outside', type: 'WAN', ip: '203.0.113.1' }
                ],
                capabilities: 'firewall, tls-inspect'
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Switch Metadata Board */}
      {category && (category === 'switch' || category === 'switches') && metadataVisible && centerReady && (
        <Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <SwitchMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            switchData={(() => {
              if (isVpnRoom && deviceMeta) {
                const net = (deviceMeta as any).net || {}
                const ports = Array.isArray(net.ports) ? net.ports : (Array.isArray(net.interfaces) ? net.interfaces : [])
                if (ports.length) {
                  return {
                    id,
                    type: String((deviceMeta as any).type || 'switch'),
                    label: String(customLabel || (deviceMeta as any).title || 'Switch'),
                    os: String((deviceMeta as any).os || 'Unknown'),
                    interfaces: ports.map((p: any) => ({ name: String(p?.name || ''), type: String(p?.type || ''), info: String(p?.info || '') })),
                    mgmt_ip: String(net.mgmtIp || net.mgmt_ip || ''),
                    capabilities: String((deviceMeta as any).capabilities || ''),
                  }
                }
              }
              return {
                id: 'switch1',
                type: 'switch',
                label: 'Access Switch',
                os: 'Cisco IOS 15.2',
                interfaces: [
                  { name: 'Gi0/1', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/2', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/3', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/24', type: 'Uplink', info: '' }
                ],
                mgmt_ip: '192.168.10.1',
                capabilities: 'switching, vlan'
              }
            })()}
          />
        </Billboard>
      )}

      {/* Device add-ons via registry (non-physics branch) */}
      {category && centerReady && (() => {
        const addons = DeviceAddons.get(category)
        if (!addons.length) return null
        const ctx = {
          alias: id,
          category,
          center: [labelCenter.x, labelCenter.y, labelCenter.z] as [number, number, number],
          modelTopY: modelTopY ?? undefined,
          selected,
          metadataVisible,
          customLabel,
        }
        return addons.map((fn, i) => (
<group key={`addon-${id}-${i}`}>
            {fn(ctx)}
          </group>
        ))
      })()}
    </group>
  )
}
  
  return (
    <group>
      {model}
      {selected && editModeEnabled && centerReady && (
        <>
          <RotationGizmo
            center={gizmoCenterRef.current}
            centerRef={gizmoCenterRef}
            target={modelRef}
            axes={["y", "x", "z"]}
            colors={{ y: "#ff0000", x: "#00ff00", z: "#0080ff" }}
            activeColors={{ y: "#ff8080", x: "#80ff80", z: "#80b3ff" }}
            radius={0.9}
            thickness={0.014}
            hitScale={2.4}
            maintainWorldSize={true}
            renderOrder={3000}
            depthTest={false}
            depthWrite={false}
            applyToTarget={true}
            onRotate={() => {
              if (modelRef.current) {
                const e = new THREE.Euler().setFromQuaternion(modelRef.current.quaternion, 'XYZ')
                const nr: [number, number, number] = [e.x, e.y, e.z]
                setCurrentRotation(nr)
                const wt = getWorldTransform()
                onTransformChange?.(currentPosition, nr, currentScale, wt)

                // Any transform invalidates queued clamp
                cancelSoftClampOnly()
                // Debounce: clamp only after rotation settles to avoid jitter while dragging the ring
                scheduleClamp(() => clampInsideRoomBounds({ strictXZ: true }), 60)
              }
            }}
          />
          <VerticalTranslateArrow
            axis="y"
            centerRef={gizmoCenterRef}
            target={modelRef}
            color="#00ff00"
            length={0.975}
            shaftRadius={0.012}
            headLength={0.208}
            headRadius={0.029}
            hitScale={1.96}
            maintainWorldSize={true}
            renderOrder={2100}
            depthTest={false}
            depthWrite={false}
onTranslate={(nextLocalPos, isDragging, worldDelta) => {
              // Apply immediately to the Object3D to avoid setState lag
              if (modelRef.current) {
                modelRef.current.position.set(nextLocalPos[0], nextLocalPos[1], nextLocalPos[2])
                modelRef.current.updateMatrixWorld(true)
              }
              // Mirror into React state
              setCurrentPosition(nextLocalPos)

              // Any transform invalidates queued clamp
cancelSoftClampOnly()

              // Keep gizmo center in perfect lockstep using TOTAL world delta from drag start
              if (worldDelta) {
                if (!arrowDragActiveRef.current) {
                  arrowDragActiveRef.current = true
                  arrowStartCenterRef.current.copy(gizmoCenterRef.current)
                }
                const newCenter = new THREE.Vector3().copy(arrowStartCenterRef.current).add(worldDelta)
                gizmoCenterRef.current.copy(newCenter)
                setLabelCenter(newCenter.clone()) // Update label when arrow translates
              }

              if (!isDragging) {
                arrowDragActiveRef.current = false
                scheduleClamp(() => {
                  clampInsideRoomBounds({ strictXZ: true })
                })
              }
            }}
          />
        </>
      )}
      {selected && modelInfo?.description && (
        <Html position={[currentPosition[0], currentPosition[1] + 2, currentPosition[2]]}>
          <div className="bg-black/90 text-white p-3 rounded shadow-lg max-w-xs">
            <h4 className="font-bold">{modelInfo?.name || modelName}</h4>
            <p className="text-sm text-gray-300">{modelInfo?.description}</p>
            <div className="text-xs text-blue-300 mt-1">
              Quality: {quality}
            </div>
          </div>
        </Html>
      )}
      
      {/* GLB Label with category logo and text */}
      {!hideLabel && category && centerReady && modelTopY !== null && (
        <GLBLabel
          text={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return customLabel || 'Internet'
            if (norm === 'desktop') return customLabel || 'Desktop'
            if (norm === 'laptop') return customLabel || 'Laptop'
            if (norm === 'switch') return customLabel || 'Switch'
            if (norm === 'router') return customLabel || 'Router'
            if (norm === 'firewall') return customLabel || 'Firewall'
            if (norm === 'server') return customLabel || 'Servers'
            return customLabel || raw
          })()}
          category={category}
          centerPosition={labelCenter}
          modelTopY={modelTopY}
          visible={true}
          // Disable occlusion for elements near the VPN tunnel so their labels remain visible.
          occlude={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return false
            if (id === 'desktop1' || id === 'firewall1') return false
            return true
          })()}
          alignTo={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return 'center'
            if (id === 'desktop1') return 'center'
            return 'top'
          })()}
          yOffset={(() => {
            const raw = String(category || '')
            const lc = raw.toLowerCase()
            const norm = (lc === 'switches') ? 'switch' : (lc.endsWith('s') ? lc.slice(0, -1) : lc)
            if (norm === 'earth') return 0.45
            if (id === 'desktop1') return 0.7

            if (id === 'firewall1') return 0.9
            return 0.5
          })()}
          showMetadataToggle={category === 'desktop' || category === 'desktops' || category === 'laptop' || category === 'laptops' || category === 'server' || category === 'servers' || category === 'router' || category === 'routers' || category === 'firewall' || category === 'firewalls' || category === 'Firewall' || category === 'switch' || category === 'switches'}
          metadataVisible={metadataVisible}
          onToggleMetadata={() => setMetadataVisible(!metadataVisible)}
        />
      )}
      
      {/* Desktop Metadata Board */}
      {category && (category === 'desktop' || category === 'desktops') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <DesktopMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            desktopData={(() => {
              const meta: any = deviceMeta || {}
              const net = meta.net || {}
              const rawIfaces = Array.isArray(net.interfaces) ? net.interfaces : []
              if (!meta.os && !meta.capabilities && !rawIfaces.length) return undefined
              return {
                id,
                type: String(meta.type || 'desktop'),
                label: String(customLabel || meta.title || 'Desktop'),
                os: String(meta.os || 'Unknown'),
                interfaces: rawIfaces.map((i: any, idx: number) => ({
                  id: String(i?.id || `${id}.eth${idx}`),
                  name: String(i?.name || `eth${idx}`),
                  kind: String(i?.kind || ''),
                  ip: String(i?.ip || ''),
                  gateway: String(i?.gateway || ''),
                })),
                capabilities: String(meta.capabilities || ''),
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Laptop Metadata Board */}
      {category && (category === 'laptop' || category === 'laptops') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <LaptopMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            laptopData={{
              id: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'laptop1' : 'laptop2',
              type: 'laptop',
              label: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'Client Laptop A' : 'Client Laptop B',
              os: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'Windows 11' : 'macOS Sonoma',
              interfaces: {
                id: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? 'laptop1.eth0' : 'laptop2.eth0',
                name: 'eth0',
                kind: 'eth',
                ip: customLabel === 'Client Laptop A' || id.includes('1761097022716') ? '192.168.1.10' : '192.168.1.11'
              },
              capabilities: 'http, dns, tls, ping'
            }}
          />
        </Billboard>
      )}
      
      {/* Server Metadata Board */}
      {category && (category === 'server' || category === 'servers') && metadataVisible && centerReady && (() => {
        const getServerData = () => {
          // Prefer JSON-provided metadata (rooms can define their own IPs/OS/etc)
          const meta: any = deviceMeta || {}
          const net = meta.net || {}
          const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
          const primary = ifaces[0] || {}
          if (meta.os || meta.capabilities || ifaces.length) {
            return {
              id,
              type: String(meta.type || 'server'),
              label: String(customLabel || meta.title || 'Server'),
              os: String(meta.os || 'Unknown'),
              interfaces: {
                id: String(primary.id || `${id}.eth0`),
                name: String(primary.name || 'eth0'),
                kind: String(primary.kind || 'eth'),
                ip: String(primary.ip || ''),
              },
              capabilities: String(meta.capabilities || ''),
            }
          }

          // Fallback legacy labels
          if (customLabel === 'Web Server' || customLabel === 'DNS Server') {
            return {
              id: 'web1',
              type: 'server',
              label: 'Web Server (Origin)',
              os: 'Ubuntu 20.04 + Nginx',
              interfaces: { id: 'web1.eth0', name: 'eth0', kind: 'eth', ip: '172.217.12.14' },
              capabilities: 'http, https, tls, etag, cache-control'
            }
          } else if (customLabel === 'CDN Edge') {
            return {
              id: 'cdn1',
              type: 'server',
              label: 'CDN Edge Node',
              os: 'CloudLinux 9 + Nginx',
              interfaces: { id: 'cdn1.eth0', name: 'eth0', kind: 'eth', ip: '203.0.113.100' },
              capabilities: 'cache, http, https, tls, cdn, gzip'
            }
          }
          return null
        }
        const serverData = getServerData()
        return serverData ? (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
            <ServerMetaDataBoard
              visible={true}
              position={[0, 0, 0]}
              offsetRight={2.0}
              serverData={serverData}
            />
          </Billboard>
        ) : null
      })()}
      
      {/* Router Metadata Board */}
      {category && (category === 'router' || category === 'routers') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <RouterMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            routerData={(() => {
              const meta: any = deviceMeta || {}
              const net = meta.net || {}
              const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
              if (meta.os || meta.capabilities || ifaces.length) {
                return {
                  id,
                  type: String(meta.type || 'router'),
                  label: String(customLabel || meta.title || 'Router'),
                  os: String(meta.os || 'Unknown'),
                  interfaces: ifaces.map((i: any) => ({
                    name: String(i?.name || ''),
                    type: String(i?.type || ''),
                    ip: String(i?.ip || ''),
                  })),
                  capabilities: String(meta.capabilities || ''),
                }
              }
              return {
                id: 'router1',
                type: 'router',
                label: 'Edge Router',
                os: 'Cisco IOS-XE 17.9',
                interfaces: [
                  { name: 'Gi0/0', type: 'LAN', ip: '192.168.10.1' },
                  { name: 'Gi0/1', type: 'WAN', ip: '203.0.113.2' }
                ],
                capabilities: 'routing, nat'
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Firewall Metadata Board */}
      {category && (category === 'firewall' || category === 'firewalls' || category === 'Firewall') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <FirewallMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            firewallData={(() => {
              const meta: any = deviceMeta || {}
              const net = meta.net || {}
              const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
              if (meta.os || meta.capabilities || ifaces.length) {
                return {
                  id,
                  type: String(meta.type || 'firewall'),
                  label: String(customLabel || meta.title || 'Firewall'),
                  os: String(meta.os || 'Unknown'),
                  interfaces: ifaces.map((i: any) => ({
                    name: String(i?.name || ''),
                    type: String(i?.type || ''),
                    ip: String(i?.ip || ''),
                  })),
                  capabilities: String(meta.capabilities || ''),
                }
              }
              return {
                id: 'firewall1',
                type: 'firewall',
                label: 'Perimeter Firewall',
                os: 'FortiOS 7.4',
                interfaces: [
                  { name: 'inside', type: 'LAN', ip: '192.168.10.254' },
                  { name: 'outside', type: 'WAN', ip: '203.0.113.1' }
                ],
                capabilities: 'firewall, tls-inspect'
              }
            })()}
          />
        </Billboard>
      )}
      
      {/* Switch Metadata Board */}
      {category && (category === 'switch' || category === 'switches') && metadataVisible && centerReady && (
<Billboard follow position={[labelCenter.x, (modelTopY ?? labelCenter.y) + 1.2, labelCenter.z]}>
          <SwitchMetaDataBoard
            visible={true}
            position={[0, 0, 0]}
            offsetRight={2.0}
            switchData={(() => {
              const meta: any = deviceMeta || {}
              const net = meta.net || {}
              const ports = Array.isArray(net.ports) ? net.ports : (Array.isArray(net.interfaces) ? net.interfaces : [])
              if (meta.os || meta.capabilities || ports.length || net.mgmtIp || net.mgmt_ip) {
                return {
                  id,
                  type: String(meta.type || 'switch'),
                  label: String(customLabel || meta.title || 'Switch'),
                  os: String(meta.os || 'Unknown'),
                  interfaces: ports.map((p: any) => ({
                    name: String(p?.name || ''),
                    type: String(p?.type || ''),
                    info: String(p?.info || ''),
                  })),
                  mgmt_ip: String(net.mgmtIp || net.mgmt_ip || ''),
                  capabilities: String(meta.capabilities || ''),
                }
              }
              return {
                id: 'switch1',
                type: 'switch',
                label: 'Access Switch',
                os: 'Cisco IOS 15.2',
                interfaces: [
                  { name: 'Gi0/1', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/2', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/3', type: 'LAN', info: 'VLAN 10' },
                  { name: 'Gi0/24', type: 'Uplink', info: '' }
                ],
                mgmt_ip: '192.168.10.1',
                capabilities: 'switching, vlan'
              }
            })()}
          />
        </Billboard>
      )}

      {/* Device add-ons via registry (non-physics branch) */}
      {category && centerReady && (() => {
        const addons = DeviceAddons.get(category)
        if (!addons.length) return null
        const ctx = {
          alias: id,
          category,
          center: [labelCenter.x, labelCenter.y, labelCenter.z] as [number, number, number],
          modelTopY: modelTopY ?? undefined,
          selected,
          metadataVisible,
          customLabel,
        }
        return addons.map((fn, i) => (
<group key={`addon-${id}-${i}`}>
            {fn(ctx)}
          </group>
        ))
      })()}
    </group>
  )
}

// Room structure selector - uses dynamic room structure or fallback
// Memoized to avoid re-rendering heavy static geometry when only simulation/flow state changes.
const RoomStructure = memo(function RoomStructure({
  config,
  hiddenDecorIds,
}: {
  config: RoomConfig
  hiddenDecorIds?: Set<string> | string[]
}) {
  return <DynamicRoomStructure config={config} hiddenDecorIds={hiddenDecorIds} />
})

// Global stats initializer
function GlobalStatsInitializer() {
  useTextureManagerGlobalStats()
  usePerformanceStats()
  return null
}

// Render debug probe: counts renderer.render() calls per frame and can force-clear
function RenderDebugProbe() {
  const { gl } = useThree()
  const frameIdRef = useRef(0)
  const callsThisFrameRef = useRef(0)
  const patchedRef = useRef(false)
  const lastLogAtRef = useRef(0)

  // Flags via URL or window
  const flags = useMemo(() => {
    let probe = false
    let hardClear = false
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      if (w.__RENDER_PROBE__ != null) probe = !!w.__RENDER_PROBE__
      if (w.__RENDER_HARD_CLEAR__ != null) hardClear = !!w.__RENDER_HARD_CLEAR__
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('renderProbe') === '1') probe = true
        if (params.get('hardClear') === '1') hardClear = true
      }
    } catch {}
    return { probe, hardClear }
  }, [])

  useEffect(() => {
    if (patchedRef.current) return
    // Patch renderer.render to count calls
    const r: any = gl as any
    const orig = r.render?.bind(gl)
    if (typeof orig === 'function') {
      r.__origRender__ = orig
      r.render = (...args: any[]) => {
        callsThisFrameRef.current++
        return orig(...args)
      }
      patchedRef.current = true
    }
    return () => {
      try {
        if ((gl as any).__origRender__) (gl as any).render = (gl as any).__origRender__
      } catch {}
    }
  }, [gl])

  // Start of each frame: optionally clear, and log previous frame's render count
  useFrame((state) => {
    if (flags.hardClear) {
      try { gl.autoClear = true; gl.clear(true, true, true) } catch {}
    }
    if (flags.probe) {
      const t = state.clock.elapsedTime
      if (t - lastLogAtRef.current > 0.5) {
        lastLogAtRef.current = t
        console.log('🧪 RENDER_PROBE/frameCalls', { calls: callsThisFrameRef.current })
      }
    }
    callsThisFrameRef.current = 0
    frameIdRef.current++
  }, -1000) // very early in the frame

  return null
}

// Debug: optionally hide all transparent meshes (to rule out glass/overlay ghosting)
function HideTransparentDebug() {
  const { scene } = useThree()
  const appliedRef = useRef(false)
  const flags = useMemo(() => {
    let hide = false
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      if (w.__HIDE_TRANSPARENT__ != null) hide = !!w.__HIDE_TRANSPARENT__
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('hideTransparent') === '1') hide = true
      }
    } catch {}
    return { hide }
  }, [])

  useEffect(() => {
    if (!flags.hide || appliedRef.current) return
    const hidden: any[] = []
    scene.traverse((obj) => {
      const mesh = obj as any
      if (mesh?.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        let hasTransparent = false
        for (const m of mats) {
          if (!m) continue
          const t = (m.transparent === true) || (typeof m.opacity === 'number' && m.opacity < 1)
          if (t) { hasTransparent = true; break }
        }
        if (hasTransparent) {
          mesh.visible = false
          hidden.push({ name: mesh.name, uuid: mesh.uuid })
        }
      }
    })
    if (hidden.length) {
      console.warn('🕶️ HIDE_TRANSPARENT applied', { count: hidden.length })
    }
    appliedRef.current = true
  }, [flags.hide, scene])
  return null
}

// Performance monitor within Three.js scene
function ScenePerformanceMonitor({
  onPerformanceUpdate
}: {
  onPerformanceUpdate: (fps: number) => void
}) {
  const { fps } = usePerformanceMonitor()
  
  useEffect(() => {
    onPerformanceUpdate(fps)
  }, [fps, onPerformanceUpdate])
  
  return null
}

let ROOMSCENE_INSTANCE_SEQ = 0

// Enhanced room scene with advanced lighting and quality
function RoomScene({ 
  config, 
  quality, 
  onLoad, 
  onError,
  qualityPreset = 'potato' as QualityPreset,
  onPerformanceUpdate,
  onFlowUpdate,
  onAttackCompromised,
  onAttackBlocked,
  onVpnBlocked,
  onVpnAllowed,
  flowState,
  editModeEnabled = false,
  selectedModelId,
  setSelectedModelId,
  selectedModelInfo,
  setSelectedModelInfo,
  showCenterDebug = false,
  savedLayout,
  onLayoutChange,
  devPerformanceMode = false,
  restoreTrace = false,
  onRestoreApplied,
  restorePhase = false,
  isolatePacket = false,
  isFullyLoaded,
}: {
  config: RoomConfig
  quality: ModelQuality
  onLoad: (id: string, gltf: GLTF) => void
  onError: (id: string, error: string) => void
  qualityPreset?: QualityPreset
  onPerformanceUpdate?: (fps: number) => void
  onFlowUpdate?: (state: any) => void
  onAttackCompromised?: (detail: { matchedRuleIndex: number | null; matchedRuleId: string | null }) => void
  onAttackBlocked?: (detail: { matchedRuleIndex: number | null; matchedRuleId: string | null }) => void
  onVpnBlocked?: (detail: { srcIp: string; dstIp: string; protocol: string; port: number; reason: string }) => void
  onVpnAllowed?: (detail: { srcIp: string; dstIp: string; protocol: string; port: number; reason: string }) => void
  flowState?: any
  editModeEnabled?: boolean
  selectedModelId?: string | null
  setSelectedModelId?: (id: string | null) => void
  selectedModelInfo?: { name: string; center: { x: number; y: number; z: number } } | null
  setSelectedModelInfo?: (info: { name: string; center: { x: number; y: number; z: number } } | null) => void
  showCenterDebug?: boolean
  savedLayout?: Record<string, any> | null
  onLayoutChange?: (entry: { 
    id: string, 
    modelName?: string, 
    position: [number, number, number], 
    rotation?: [number, number, number], 
    scale?: number | [number, number, number],
    worldPosition?: [number, number, number],
    worldQuaternion?: [number, number, number, number],
    worldScale?: [number, number, number],
    worldCenter?: [number, number, number],
    category?: string,
    customLabel?: string
  }) => void
  devPerformanceMode?: boolean
  restoreTrace?: boolean
  onRestoreApplied?: (id: string) => void
  restorePhase?: boolean
  isolatePacket?: boolean
  isFullyLoaded: boolean
}) {
  const envCfg = environments[config.environment?.lighting || 'bright']
  // Access scene to detect anchor readiness for robust flow start
  const { scene, camera } = useThree()
  const earliestStartAtRef = useRef<number>(0)

  // Phase DSL enable flag (must opt-in to avoid interfering with legacy demos)
  const phasesEnabled = useMemo(() => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      return !!w.__ENABLE_PHASES__ || params?.get('phases') === '1'
    } catch { return false }
  }, [])

  // Decor visibility controlled by Phase DSL actions
  const [hiddenDecorIds, setHiddenDecorIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!phasesEnabled) return
    const onVis = (e: any) => {
      const d = e?.detail || {}
      setHiddenDecorIds(prev => {
        const next = new Set(prev)
        if (Array.isArray(d.hide)) d.hide.forEach((id: string) => next.add(id))
        if (Array.isArray(d.show)) d.show.forEach((id: string) => next.delete(id))
        return next
      })
    }
    window.addEventListener('decor-visibility', onVis as any)
    return () => window.removeEventListener('decor-visibility', onVis as any)
  }, [phasesEnabled])

  // Optional: skip rendering base config models via ?base=0 (or window.__SKIP_BASE__=true)
  const skipBaseModels = useMemo(() => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      return params?.get('base') === '0' || !!w.__SKIP_BASE__
    } catch { return false }
  }, [])

  // Phase HUD text control
  const [phaseHudText, setPhaseHudText] = useState<string | null>(null)
  const phaseHudClearTimerRef = useRef<any>(null)
  useEffect(() => {
    if (!phasesEnabled) return
    const onHud = (e: any) => {
      const t = e?.detail?.text
      const next = typeof t === 'string' ? t : null
      setPhaseHudText(next)
      try { if (phaseHudClearTimerRef.current) clearTimeout(phaseHudClearTimerRef.current) } catch {}
      phaseHudClearTimerRef.current = null
      if (next) {
        phaseHudClearTimerRef.current = setTimeout(() => setPhaseHudText(null), 3500)
      }
    }
    window.addEventListener('hud:text', onHud as any)
    return () => {
      window.removeEventListener('hud:text', onHud as any)
      try { if (phaseHudClearTimerRef.current) clearTimeout(phaseHudClearTimerRef.current) } catch {}
      phaseHudClearTimerRef.current = null
    }
  }, [phasesEnabled])

  // Phase preflight anchor audit: logs presence of anchors for the selected phase's flow
  useEffect(() => {
    if (!phasesEnabled) return
    const flowsAny: any[] = Array.isArray((config as any)?.flows) ? (config as any).flows : []
    const phasesAny: any[] = Array.isArray((config as any)?.phases) ? (config as any).phases : []
    const findFlow = (id: string) => flowsAny.find((f: any) => f?.id === id)
    const onRun = (e: any) => {
      try {
        const phaseId = e?.detail?.id
        const phase = phasesAny.find((p: any) => p?.id === phaseId)
        if (!phase) return
        const play = (phase.actions || []).find((a: any) => a?.playFlow)
        const flowId = play?.playFlow
        if (!flowId) return
        const flow = findFlow(flowId)
        if (!flow || !Array.isArray(flow.path)) return
        const anchors = Array.from(new Set(flow.path)).map((v: any) => String(v))
        const results = anchors.map((name) => ({
          name,
          found: !!scene.getObjectByName(`${name}-center`) || !!scene.getObjectByName(name)
        }))
        console.log('[AUDIT] phase:', phaseId, 'flow:', flowId, 'anchors:', results)
      } catch {}
    }
    window.addEventListener('phase:run', onRun as any)
    return () => { try { window.removeEventListener('phase:run', onRun as any) } catch {} }
  }, [phasesEnabled, config, scene])


  // RoomScene mount diagnostics
  const roomSceneInstId = useRef<number>(++ROOMSCENE_INSTANCE_SEQ)
  useEffect(() => {
    const id = roomSceneInstId.current
    const w: any = typeof window !== 'undefined' ? window : {}
    w.__ROOMSCENE_COUNT__ = (w.__ROOMSCENE_COUNT__ || 0) + 1
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const DEBUG = params.get('debug') === '1' || !!(w.__DEBUG__)
      if (DEBUG) console.log(`[DBG] RoomScene MOUNT #${id} (total: ${w.__ROOMSCENE_COUNT__})`)
    }
    return () => {
      w.__ROOMSCENE_COUNT__ = Math.max(0, (w.__ROOMSCENE_COUNT__ || 1) - 1)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const DEBUG = params.get('debug') === '1' || !!(w.__DEBUG__)
        if (DEBUG) console.log(`[DBG] RoomScene UNMOUNT #${id} (total: ${w.__ROOMSCENE_COUNT__})`)
      }
    }
  }, [])
  
  // Selected phase (DNS | PKI | HTTPS)
  const selectedPhaseRef = useRef<'DNS' | 'PKI' | 'HTTPS'>('DNS')

  // Packet animation system
  const packetAnim = usePacketAnimation({
    onLaunch: (meta) => { console.log('🚀 Packet launched:', meta); onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'active', meta }) },
    onPause: (meta) => { console.log('⏸️ Packet paused:', meta); onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'paused', meta }) },
    onResume: (meta) => { console.log('▶️ Packet resumed:', meta); onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'active', meta }) },
    onArrival: (meta) => {
      console.log('✅ Packet arrived:', meta)
      onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'arrived', meta })
      
      // Only advance automated flows if this is an automated packet (not a terminal packet)
      // Terminal packets have IDs like "terminal-123456", automated ones have "dns-123-0", "tls-123-1", etc.
      const isAutomatedPacket = meta.id.startsWith('dns-') || meta.id.startsWith('tls-') || meta.id.startsWith('https-')
      
      if (isAutomatedPacket) {
        if (selectedPhaseRef.current === 'DNS') advanceDnsStep()
        else if (selectedPhaseRef.current === 'PKI') advancePkiStep()
        else if (selectedPhaseRef.current === 'HTTPS') advanceHttpsStep()
      } else {
        console.log('🎯 Terminal packet completed - not advancing automated flow')
      }
    },
  })
  
  // Listen for terminal packet events
  useEffect(() => {
    const handleTerminalPacket = (event: any) => {
      const { from, to, style } = event.detail || {}
      if (!from || !to) return
      
      console.log('🎯 Terminal packet received:', { from, to, style })
      
      // Map style to label and protocol
      const styleToLabel: Record<string, { label: string, protocol: string, encrypted: boolean }> = {
        'dns_query': { label: 'DNS Query', protocol: 'UDP/53', encrypted: false },
        'dns_response': { label: 'DNS Response', protocol: 'UDP/53', encrypted: false },
        'tcp_syn': { label: 'TCP SYN', protocol: 'TCP', encrypted: false },
        'tls_handshake': { label: 'TLS Handshake', protocol: 'TLS 1.3', encrypted: false },
        'icmp': { label: 'ICMP Echo', protocol: 'ICMP', encrypted: false },
      }
      
      const packetInfo = styleToLabel[style] || { label: style.toUpperCase(), protocol: 'Unknown', encrypted: false }
      
      // Start the packet animation
      const cfg = {
        packetId: `terminal-${Date.now()}`,
        label: packetInfo.label,
        protocol: packetInfo.protocol,
        encrypted: packetInfo.encrypted,
        fromAnchor: from,
        toAnchor: to,
      }
      
      packetAnim.startHop(cfg)
    }
    
    window.addEventListener('terminal-packet', handleTerminalPacket as any)
    return () => window.removeEventListener('terminal-packet', handleTerminalPacket as any)
  }, [packetAnim])

  // Flow/Phase engines (window-wired)
  const currentFlowRef = useRef<{ flowId: string, index: number } | null>(null)
  const lastFlowSegRef = useRef<{ flowId: string, index: number, at: number } | null>(null)
  const flowRunnerRef = useRef<any>(null)
  const phaseRunnerRef = useRef<any>(null)
  const onFlowSegHandlerRef = useRef<((e: any) => void) | null>(null)
  useEffect(() => {
    if (!phasesEnabled) return
    let cancelled = false

    // Proactively detach any prior global runner to avoid duplicate emissions after HMR/navigation
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      if (w.__FLOW_RUNNER__?.detachWindow) {
        w.__FLOW_RUNNER__?.detachWindow()
        w.__FLOW_RUNNER__ = null
      }
    } catch {}

    const setup = async () => {
      const flowsAny: any[] = Array.isArray((config as any).flows) ? (config as any).flows : []
      const phasesAny: any[] = Array.isArray((config as any).phases) ? (config as any).phases : []
      const { FlowRunner: FlowEngineRunner } = await import('@/engine/flows/flowRunner')
      const { PhaseRunner: PhaseEngineRunner } = await import('@/engine/phases/phaseRunner')
      if (cancelled) return

      const fr = new FlowEngineRunner(flowsAny).attachWindow()
      flowRunnerRef.current = fr
      try { (window as any).__FLOW_RUNNER__ = fr } catch {}
      const pr = new PhaseEngineRunner(phasesAny, fr).attachWindow()
      phaseRunnerRef.current = pr

      // Single flow:segment handler that sequences PacketHop
      const onSeg = (e: any) => {
        const d = e?.detail || {}
        if (!d || !d.from || !d.to) return
        // Coalesce duplicate segment events (same flowId/index)
        try {
          const now = Date.now()
          const last = lastFlowSegRef.current
          if (last && last.flowId === d.flowId && last.index === d.index && (now - last.at) < 200) {
            return
          }
          lastFlowSegRef.current = { flowId: d.flowId, index: d.index, at: now }
        } catch {}
        currentFlowRef.current = { flowId: d.flowId, index: d.index }
        const vpnOn = (() => { try { return !!(window as any).__VPN_ACTIVE__ } catch { return false } })()
        const fromA = String(d.from)
        const toA = String(d.to)
        const tunnelPts = getVpnTunnelPathPoints(fromA, toA, vpnOn)

        const slowVpnSeg =
          isVpnRoom &&
          ((fromA === 'desktop1' && toA === 'earth1') || (fromA === 'earth1' && toA === 'firewall1'))
        const baseTravel = tunnelPts ? 0.8 : 0.4
        const travelSeconds = slowVpnSeg ? baseTravel * 2 : (tunnelPts ? 0.8 : undefined)

        const cfg = {
          packetId: `phaseflow-${String(d.flowId)}-${String(d.index)}`,
          label: 'FLOW',
          protocol: 'Flow',
          encrypted: false,
          fromAnchor: d.from,
          toAnchor: d.to,
          ...(tunnelPts ? { pathPointsOverride: tunnelPts } : {}),
          ...(typeof travelSeconds === 'number' ? { travelSeconds } : {}),
        }
        packetAnim.startHop(cfg)
      }
      onFlowSegHandlerRef.current = onSeg
      window.addEventListener('flow:segment', onSeg as any)
    }

    setup()

    return () => {
      cancelled = true
      // Remove our flow:segment handler
      try {
        if (onFlowSegHandlerRef.current) {
          window.removeEventListener('flow:segment', onFlowSegHandlerRef.current as any)
        }
      } catch {}
      onFlowSegHandlerRef.current = null
      // Detach the flow runner to stop listening for arrivals/controls
      try { flowRunnerRef.current?.detachWindow?.() } catch {}
      flowRunnerRef.current = null
      phaseRunnerRef.current = null
    }
  }, [phasesEnabled])

  const isFirewallRoom = config?.id === 'firewall'
  const isVpnRoom = config?.id === 'vpn'
  const isHttpsRoom = config?.id === 'https'

  // VPN tunnel visibility: default ON for vpn room; toggle with the "V" key.
  const vpnDefaultActive = useMemo(() => {
    if (typeof window === 'undefined') return true
    try {
      const w: any = window as any
      if (w.__VPN_ACTIVE__ != null) return !!w.__VPN_ACTIVE__
      const params = new URLSearchParams(window.location.search)
      const v = params.get('vpn')
      if (v === '0') return false
      if (v === '1') return true
    } catch {}
    return false
  }, [])
  const [vpnActive, setVpnActive] = useState<boolean>(vpnDefaultActive)
  // Keep selected phase consistent with VPN state (VPN on => PKI; VPN off => DNS)
  useEffect(() => {
    if (!isVpnRoom) return
    if (vpnActive && selectedPhaseRef.current === 'DNS') {
      selectedPhaseRef.current = 'PKI'
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
    } else if (!vpnActive && selectedPhaseRef.current === 'PKI') {
      selectedPhaseRef.current = 'DNS'
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'DNS' } })) } catch {}
    }
  }, [vpnActive, isVpnRoom])

  useEffect(() => {
    if (!isVpnRoom) return

    const shouldBlock = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const active = (typeof document !== 'undefined') ? (document.activeElement as HTMLElement | null) : null
      const el = target || active
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((el as any).isContentEditable) return true
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldBlock(e)) return
      if (e.code !== 'KeyV') return
      setVpnActive((prev) => {
        const next = !prev
        try { (window as any).__VPN_ACTIVE__ = next } catch {}
        try { window.dispatchEvent(new CustomEvent('vpn:active', { detail: { active: next, source: 'key' } })) } catch {}
        return next
      })
    }

    const onVpnEvent = (e: any) => {
      const next = !!e?.detail?.active
      try { (window as any).__VPN_ACTIVE__ = next } catch {}
      setVpnActive((prev) => (prev === next ? prev : next))
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('vpn:active', onVpnEvent as any)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('vpn:active', onVpnEvent as any)
    }
  }, [isVpnRoom])

  // Firewall Rules (shared store; UI renders in a screen overlay)
  const { rules: firewallRules } = useFirewallRules()

  // Outbound: Router/LAN → Internet/WAN (main HTTPS example)
  const firewallTrafficOutbound = useMemo<FirewallTraffic>(() => ({
    srcZone: 'LAN',
    dstZone: 'WAN',
    protocol: 'TCP',
    port: 443,
  }), [])

  // Inbound: Internet/WAN → Router/LAN (return traffic in the demo)
  const firewallTrafficInbound = useMemo<FirewallTraffic>(() => ({
    srcZone: 'WAN',
    dstZone: 'LAN',
    protocol: 'TCP',
    port: 443,
  }), [])

  // Attack: fixed demo traffic for the Simulate Attack button
  const firewallTrafficAttack = useMemo<FirewallTraffic>(() => {
    return { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 22 }
  }, [])

  const firewallDecisionOutbound = useMemo(() => {
    return evaluateFirewallRules(firewallRules, firewallTrafficOutbound)
  }, [firewallRules, firewallTrafficOutbound])

  const firewallDecisionInbound = useMemo(() => {
    return evaluateFirewallRules(firewallRules, firewallTrafficInbound)
  }, [firewallRules, firewallTrafficInbound])

  const firewallDecisionAttack = useMemo(() => {
    return evaluateFirewallRules(firewallRules, firewallTrafficAttack)
  }, [firewallRules, firewallTrafficAttack])

  // Firewall room demo runner state
  const firewallAutoRunRef = useRef(false)
  const [firewallApproval, setFirewallApproval] = useState<'none' | 'approved' | 'denied'>('none')
  const approvalTimeoutRef = useRef<any>(null)
  const firewallInspectOffsetRef = useRef<{ towardAnchor: string; distance: number; y: number } | null>(null)

  // HTTPS room: keep continuity when we stop slightly in front of the firewall during inspection (scan + emit chips)
  const httpsInspectOffsetRef = useRef<{ towardAnchor: string; distance: number; y: number } | null>(null)

  // VPN room: keep continuity when we stop slightly in front of the firewall during inspection
  const vpnInspectOffsetRef = useRef<{ towardAnchor: string; distance: number; y: number } | null>(null)

  // VPN room: firewall pass/fail indicator (mirrors firewall room behavior)
  const [vpnFirewallApproval, setVpnFirewallApproval] = useState<'none' | 'approved' | 'denied'>('none')
  const vpnApprovalTimeoutRef = useRef<any>(null)

  const httpsInspectNet = useMemo(() => {
    if (!isHttpsRoom) return null

    const byId = (id: string) => (config.objects || []).find((o: any) => o?.id === id)
    const net = (id: string) => (((byId(id)?.metadata as any)?.net ?? {}) as any)

    const stripCidr = (v: any) => (typeof v === 'string' ? v.split('/')[0] : '')
    const getIfaceIp = (n: any, pred: (i: any) => boolean) => {
      const ifaces = Array.isArray(n?.interfaces) ? n.interfaces : []
      const m = ifaces.find((i: any) => {
        try { return !!pred(i) } catch { return false }
      })
      return stripCidr(m?.ip)
    }

    const client = net('desktop1')
    const fw = net('firewall1')
    const web = net('web1')

    const clientIp =
      getIfaceIp(client, () => true) ||
      stripCidr(client?.ip) ||
      '192.168.10.30'

    const firewallOutsideIp =
      getIfaceIp(fw, (i) => String(i?.name || '').toLowerCase() === 'outside' || String(i?.type || '').toLowerCase() === 'wan') ||
      stripCidr((fw as any)?.outsideIp) ||
      stripCidr((fw as any)?.nat?.snat) ||
      '203.0.113.1'

    const webIp =
      getIfaceIp(web, () => true) ||
      stripCidr(web?.ip) ||
      '198.51.100.10'

    return { clientIp, firewallOutsideIp, webIp }
  }, [isHttpsRoom, config.objects])

  const buildHttpsFirewallInspectChips = useCallback((phase: 'DNS' | 'PKI' | 'HTTPS', segIndex: number, from: string) => {
    const clientIp = httpsInspectNet?.clientIp || '192.168.10.30'
    const webIp = httpsInspectNet?.webIp || '198.51.100.10'
    const fwWanIp = httpsInspectNet?.firewallOutsideIp || '203.0.113.1'

    const dir = from === 'router1' ? 'LAN → WAN' : 'WAN → LAN'

    if (phase === 'DNS') {
      const port = 80
      const detail = from === 'router1' ? 'HTTP: GET /login' : 'HTTP: 200 OK'
      return [
        `Src IP: ${from === 'router1' ? clientIp : webIp}`,
        `Dst IP: ${from === 'router1' ? webIp : fwWanIp}`,
        'Protocol: TCP',
        `Port: ${port}`,
        `Zone: ${dir}`,
        detail,
      ]
    }

    if (phase === 'PKI') {
      const port = 443
      const flight = Math.floor(segIndex / 5)
      const tlsDetail =
        flight === 0 ? 'TLS: ClientHello (SNI: example.com)' :
        flight === 1 ? 'TLS: ServerHello + Certificate' :
        flight === 2 ? 'TLS: Client Finished' :
        'TLS: Server Finished'

      return [
        `Src IP: ${from === 'router1' ? clientIp : webIp}`,
        `Dst IP: ${from === 'router1' ? webIp : fwWanIp}`,
        'Protocol: TCP',
        `Port: ${port}`,
        `Zone: ${dir}`,
        tlsDetail,
      ]
    }

    // HTTPS
    {
      const port = 443
      const detail = from === 'router1' ? 'HTTPS: Encrypted request' : 'HTTPS: Encrypted response'
      return [
        `Src IP: ${from === 'router1' ? clientIp : webIp}`,
        `Dst IP: ${from === 'router1' ? webIp : fwWanIp}`,
        'Protocol: TCP',
        `Port: ${port}`,
        `Zone: ${dir}`,
        detail,
      ]
    }
  }, [httpsInspectNet])

  const buildHttpsWebServerEmit = useCallback((kind: 'rx' | 'tx', phase: 'DNS' | 'PKI' | 'HTTPS', cfg: any) => {
    const clientIp = httpsInspectNet?.clientIp || '192.168.10.30'
    const webIp = httpsInspectNet?.webIp || '198.51.100.10'
    const fwWanIp = httpsInspectNet?.firewallOutsideIp || '203.0.113.1'

    const label = String(cfg?.label || '')
    const proto = String(cfg?.protocol || '')

    const isHttp = phase === 'DNS'
    const isTls = phase === 'PKI'
    const isHttps = phase === 'HTTPS'

    const dstPort = isHttp ? 80 : 443

    // What the web server typically sees over the Internet: the firewall/NAT public IP, not the client private IP.
    const srcIpSeenByServer = fwWanIp
    const dstIpServer = webIp

    const msg = (() => {
      if (isHttp) {
        return kind === 'rx'
          ? 'Received HTTP request (plaintext). Anyone on the path can read it.'
          : 'Sending HTTP response (plaintext).'
      }
      if (isTls) {
        return kind === 'rx'
          ? `Received TLS handshake message: ${proto || label || 'TLS'}`
          : `Sending TLS handshake message: ${proto || label || 'TLS'}`
      }
      if (isHttps) {
        return kind === 'rx'
          ? 'Received HTTPS request (application data is encrypted).'
          : 'Sending HTTPS response (application data is encrypted).'
      }
      return kind === 'rx' ? 'Received packet.' : 'Sending packet.'
    })()

    const chips: string[] = []
    chips.push(`Client (LAN): ${clientIp}`)
    chips.push(`Src IP: ${kind === 'rx' ? srcIpSeenByServer : dstIpServer}`)
    chips.push(`Dst IP: ${kind === 'rx' ? dstIpServer : fwWanIp}`)
    chips.push('Protocol: TCP')
    chips.push(`Port: ${dstPort}`)

    if (isHttp) {
      chips.push(kind === 'rx' ? 'HTTP: GET /login' : 'HTTP: 200 OK')
    } else if (isTls) {
      chips.push(String(proto || 'TLS 1.3'))
    } else if (isHttps) {
      chips.push('Payload: <encrypted>')
    }

    return { kind, phase: phase === 'DNS' ? 'HTTP' : phase === 'PKI' ? 'TLS Handshake' : 'HTTPS', message: msg, chips }
  }, [httpsInspectNet])

  // Emit web-server RX as soon as the packet reaches the server and begins holding (so we can still delay the next hop).
  useEffect(() => {
    if (!isHttpsRoom) return

    const onHoldStart = (e: any) => {
      const d = e?.detail || {}
      const to = String(d?.toAnchor || '')
      if (to !== 'web1' && to !== 'server1') return

      const phase = (selectedPhaseRef.current || 'DNS') as any
      const cfgLike = {
        label: d?.label,
        protocol: d?.protocol,
        encrypted: !!d?.encrypted,
        fromAnchor: d?.fromAnchor,
        toAnchor: d?.toAnchor,
      }
      const detail = buildHttpsWebServerEmit('rx', phase, cfgLike)
      try { window.dispatchEvent(new CustomEvent('webserver:emit', { detail })) } catch {}
    }

    try { window.addEventListener('packet:holdStart', onHoldStart as any) } catch {}
    return () => {
      try { window.removeEventListener('packet:holdStart', onHoldStart as any) } catch {}
    }
  }, [isHttpsRoom, buildHttpsWebServerEmit])

  // Attack simulation: capture which rule allowed the attack (for teaching)
  const attackAllowedByRef = useRef<{ matchedRuleIndex: number | null; matchedRuleId: string | null } | null>(null)

  useEffect(() => {
    return () => {
      if (approvalTimeoutRef.current) {
        try { clearTimeout(approvalTimeoutRef.current) } catch {}
      }
      if (vpnApprovalTimeoutRef.current) {
        try { clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
      }
    }
  }, [])

  // VPN: show Access Granted panel at the end of the inspection scan, then wait for user "Continue"
  useEffect(() => {
    if (!isVpnRoom) return
    const onHoldComplete = (e: any) => {
      const d = e?.detail || {}
      if (!vpnActive) return
      if (d?.fromAnchor !== 'earth1' || d?.toAnchor !== 'firewall1') return

      // Show green approval ring while the panel is open (cleared later when the hop out of the firewall launches)
      try { if (vpnApprovalTimeoutRef.current) clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
      vpnApprovalTimeoutRef.current = null
      setVpnFirewallApproval('approved')

      try {
        onVpnAllowed?.({
          srcIp: '10.8.0.25',
          dstIp: '192.168.10.50',
          protocol: 'TCP',
          port: 443,
          reason: 'VPN is enabled — traffic is authenticated and encrypted, so the firewall can allow access into the LAN over the VPN zone.',
        })
      } catch {}
    }

    try { window.addEventListener('packet:holdComplete', onHoldComplete as any) } catch {}
    return () => {
      try { window.removeEventListener('packet:holdComplete', onHoldComplete as any) } catch {}
    }
  }, [isVpnRoom, vpnActive, onVpnAllowed])

  // VPN tunnel curve sampler (to keep packet motion inside the visible tunnel)
  const getVpnTunnelPathPoints = useCallback((from: string, to: string, vpnEnabled: boolean): Array<[number, number, number]> | null => {
    if (!isVpnRoom || !vpnEnabled) return null

    const tunnelNodes = new Set(['desktop1', 'earth1', 'firewall1'])
    if (!tunnelNodes.has(from) || !tunnelNodes.has(to)) return null

    const find = (name: string) => scene.getObjectByName(`${name}-center`) || scene.getObjectByName(name)
    const a = find('desktop1')
    const b = find('earth1')
    const c = find('firewall1')
    if (!a || !b || !c) return null

    // Keep these values in sync with <VpnTunnel ... startYOffset/viaYOffset/endYOffset/lift>
    const startYOffset = 1.05
    const viaYOffset = 1.55
    const endYOffset = 0.95
    const lift = 1.35

    const start = new THREE.Vector3(); a.getWorldPosition(start); start.y += startYOffset
    const mid = new THREE.Vector3(); b.getWorldPosition(mid); mid.y += viaYOffset
    const end = new THREE.Vector3(); c.getWorldPosition(end); end.y += endYOffset

    const d1 = start.distanceTo(mid)
    const d2 = mid.distanceTo(end)
    const dynLift = Math.max(lift, Math.min(3.0, Math.max(d1, d2) * 0.12))

    const p1 = start.clone().lerp(mid, 0.55); p1.y += dynLift
    const p2 = mid.clone().lerp(end, 0.45); p2.y += dynLift

    const curve = new THREE.CatmullRomCurve3([start, p1, mid, p2, end], false, 'centripetal', 0.5)

    // Find the parameter where the curve hits the mid (Internet) point
    let tMid = 0.5
    try {
      const tmp = new THREE.Vector3()
      let bestD = Infinity
      const samples = 400
      for (let i = 0; i <= samples; i++) {
        const t = i / samples
        curve.getPoint(t, tmp)
        const d = tmp.distanceToSquared(mid)
        if (d < bestD) { bestD = d; tMid = t }
      }
    } catch {}

    const sample = (t0: number, t1: number, steps = 120) => {
      const pts: Array<[number, number, number]> = []
      const tmp = new THREE.Vector3()
      for (let i = 0; i <= steps; i++) {
        const tt = t0 + (t1 - t0) * (i / steps)
        curve.getPoint(tt, tmp)
        pts.push([tmp.x, tmp.y, tmp.z])
      }
      return pts
    }

    // Slice the full VPN tunnel curve so each hop stays inside the tube
    if (from === 'desktop1' && to === 'earth1') return sample(0, tMid)
    if (from === 'earth1' && to === 'desktop1') return sample(0, tMid).reverse()
    if (from === 'earth1' && to === 'firewall1') return sample(tMid, 1)
    if (from === 'firewall1' && to === 'earth1') return sample(tMid, 1).reverse()

    // Fallback: full tunnel
    return sample(0, 1)
  }, [isVpnRoom, scene])

  // DNS flow segments (out and back)
  // NOTE: In the firewall room, DNS phase is repurposed as "Traffic Analysis" and runs ingress up to the router
  // (handoff to the inspection hop in PKI).
  const dnsSegments = useMemo(() => (
    isolatePacket
      ? [["isolateStart","isolateEnd"]]
      : isFirewallRoom
        ? [
            ["desktop1","switch1"],
            ["switch1","router1"],
          ]
        : isVpnRoom
          ? [
              // VPN room (Phase 1: No VPN): one-way Remote User → Internet → Firewall
              ["desktop1","earth1"],
              ["earth1","firewall1"],
            ]
          : isHttpsRoom
            ? [
                // HTTPS room (Phase 1: HTTP): request + response (client ↔ web server)
                ["desktop1","switch1"],
                ["switch1","router1"],
                ["router1","firewall1"],
                ["firewall1","earth1"],
                ["earth1","web1"],
                ["web1","earth1"],
                ["earth1","firewall1"],
                ["firewall1","router1"],
                ["router1","switch1"],
                ["switch1","desktop1"],
              ]
            : [
                ["desktop1","switch1"],
                ["switch1","router1"],
                ["router1","firewall1"],
                ["firewall1","earth1"],
                ["earth1","dns1"],
                ["dns1","earth1"],
                ["earth1","firewall1"],
                ["firewall1","router1"],
                ["router1","switch1"],
                ["switch1","desktop1"],
              ]
  ), [isolatePacket, isFirewallRoom, isVpnRoom, isHttpsRoom])

  // PKI/TLS segments resolver (prefer cdn1 for TLS handshake)
  // NOTE: In the firewall room, PKI phase is repurposed as "Rule Evaluation" and plays a single inspection hop.
  const getPkiSegments = useCallback(() => {
    if (isolatePacket) return [["isolateStart","isolateEnd"]]

    if (isFirewallRoom) {
      // Rule Evaluation (inspection) entry: Router → Firewall (then pause/scan)
      return [["router1","firewall1"]]
    }

    if (isVpnRoom) {
      // VPN room (Phase 2: Secure Access via VPN)
      // Remote User → Internet → Firewall (inside VPN tunnel), then Firewall → Router → Switch → Secure Server (one-way)
      return [
        ["desktop1","earth1"],
        ["earth1","firewall1"],
        ["firewall1","router1"],
        ["router1","switch1"],
        ["switch1","web1"],
      ]
    }

    // HTTPS room (Phase 2: TLS Handshake): model multiple handshake "flights"
    if (isHttpsRoom) {
      const has = (name: string) => !!scene.getObjectByName(`${name}-center`) || !!scene.getObjectByName(name)
      const server = has('web1') ? 'web1' : has('server1') ? 'server1' : 'web1'

      const out: Array<[string,string]> = [
        ["desktop1","switch1"],
        ["switch1","router1"],
        ["router1","firewall1"],
        ["firewall1","earth1"],
        ["earth1",server],
      ]
      const back: Array<[string,string]> = [
        [server,"earth1"],
        ["earth1","firewall1"],
        ["firewall1","router1"],
        ["router1","switch1"],
        ["switch1","desktop1"],
      ]

      // Single round-trip (simplified TLS story):
      //   ClientHello →, ServerHello+Cert ←
      // (We intentionally do NOT model extra flights here to avoid duplicate full traversals.)
      return [...out, ...back]
    }

    // Default PKI/TLS segments resolver (prefer cdn1 for TLS handshake)
    const has = (name: string) => !!scene.getObjectByName(`${name}-center`) || !!scene.getObjectByName(name)
    const server = has('cdn1') ? 'cdn1' : has('pki1') ? 'pki1' : has('web1') ? 'web1' : has('server1') ? 'server1' : 'dns1'
    return [
      ["desktop1","switch1"],
      ["switch1","router1"],
      ["router1","firewall1"],
      ["firewall1","earth1"],
      ["earth1",server],
      [server,"earth1"],
      ["earth1","firewall1"],
      ["firewall1","router1"],
      ["router1","switch1"],
      ["switch1","desktop1"],
    ]
  }, [isolatePacket, scene, isFirewallRoom, isVpnRoom, isHttpsRoom])

  // Attack simulation segments (Attacker's Desktop → LAN Desktop)
  const attackSegments = useMemo(() => (
    isFirewallRoom
      ? [
          ['desktop2', 'earth1'],
          ['earth1', 'firewall1'],
          ['firewall1', 'router1'],
          ['router1', 'switch1'],
          ['switch1', 'desktop1'],
        ]
      : []
  ), [isFirewallRoom])

  const [dnsStep, setDnsStep] = useState<number>(-1)
  const [pkiStep, setPkiStep] = useState<number>(-1)
  const [httpsStep, setHttpsStep] = useState<number>(-1)
  const [attackStep, setAttackStep] = useState<number>(-1)
  const [lineFrom, setLineFrom] = useState<string | null>(null)
  const [lineTo, setLineTo] = useState<string | null>(null)

  // Function refs (avoid TDZ issues when callbacks chain into functions declared later)
  const startPkiStepRef = useRef<(idx: number) => void>(() => {})
  const startAttackStepRef = useRef<(idx: number) => void>(() => {})
  const advanceAttackStepRef = useRef<() => void>(() => {})
  

  const startDnsStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= dnsSegments.length) {
      setDnsStep(-1)
      setLineFrom(null); setLineTo(null)
      onFlowUpdate?.({ phase: 'DNS', status: 'idle' })
      return
    }
    selectedPhaseRef.current = 'DNS'
    const [from, to] = dnsSegments[idx]
    console.log('🔵 DNS_STEP', { idx, from, to })
    setDnsStep(idx)
    setPkiStep(-1)
    setLineFrom(from); setLineTo(to)
    onFlowUpdate?.({ phase: 'DNS', status: 'pending', from, to })
    setTimeout(() => {
      const tunnelPts = getVpnTunnelPathPoints(from, to, vpnActive)
      const isVpnInspectHop = isVpnRoom && !vpnActive && from === 'earth1' && to === 'firewall1'

      const isHttpsInspectHop = isHttpsRoom && to === 'firewall1' && (from === 'router1' || from === 'earth1')
      if (isHttpsInspectHop) {
        httpsInspectOffsetRef.current = { towardAnchor: from === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
      }
      const httpsStartOffset = (isHttpsRoom && from === 'firewall1') ? httpsInspectOffsetRef.current : null

      const cfg = isVpnInspectHop
        ? {
            packetId: `dns-${Date.now()}-${idx}`,
            label: 'INSPECT',
            protocol: 'Firewall inspection',
            encrypted: false,
            fromAnchor: from,
            toAnchor: to,
            // Motion: decelerate into zone and pause
            travelSeconds: 2.6,
            easing: 'easeOut' as const,
            holdSeconds: 2.6,
            // Stop slightly in front of the firewall (toward the Internet)
            endOffsetTowardAnchor: 'earth1',
            endOffsetDistance: 0.9,
            endYOffset: 0.18,
            // Keep HUD calm during inspection
            showLabel: false,
            inspectChips: [
              'Src IP: 203.0.113.25',
              'Dst IP: 198.51.100.10',
              'Protocol: TCP',
              'Port: 443',
            ],
          }
        : isHttpsInspectHop
          ? {
              packetId: `dns-${Date.now()}-${idx}`,
              label: 'INSPECT',
              protocol: 'Firewall inspection',
              encrypted: false,
              fromAnchor: from,
              toAnchor: to,
              // Motion: decelerate into zone and pause
              travelSeconds: 1.4,
              easing: 'easeOut' as const,
              holdSeconds: 1.8,
              // Stop slightly in front of the firewall (toward the side the packet came from)
              endOffsetTowardAnchor: from === 'router1' ? 'router1' : 'earth1',
              endOffsetDistance: 0.9,
              endYOffset: 0.18,
              // Keep HUD calm during inspection
              showLabel: false,
              inspectChips: buildHttpsFirewallInspectChips('DNS', idx, from),
            }
          : {
              packetId: `dns-${Date.now()}-${idx}`,
              label: isFirewallRoom ? 'HTTPS' : isVpnRoom ? 'PACKET' : isHttpsRoom ? 'HTTP' : 'DNS',
              protocol: isFirewallRoom ? 'TCP/443' : isVpnRoom ? 'IP' : isHttpsRoom ? 'HTTP (TCP/80)' : 'UDP/53',
              encrypted: isFirewallRoom ? true : false,
              fromAnchor: from,
              toAnchor: to,
              ...(isVpnRoom && from === 'desktop1' && to === 'earth1' ? { travelSeconds: 0.8 } : {}),
                ...(tunnelPts ? { pathPointsOverride: tunnelPts, travelSeconds: 0.8 } : {}),
                ...(isHttpsRoom && to === 'web1' ? { holdSeconds: 2.0 } : {}),
                ...(httpsStartOffset
                  ? {
                      startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
                      startOffsetDistance: httpsStartOffset.distance,
                      startYOffset: httpsStartOffset.y,
                    }
                  : {}),
            }
      if (httpsStartOffset) {
        // Consume the offset so later hops don't inherit it.
        httpsInspectOffsetRef.current = null
      }

      onFlowUpdate?.({ phase: 'DNS', status: 'active', from, to, meta: cfg })
      packetAnim.startHop(cfg)
    }, 120)
  }, [dnsSegments, packetAnim, onFlowUpdate, isFirewallRoom, isVpnRoom, isHttpsRoom, vpnActive, getVpnTunnelPathPoints, buildHttpsFirewallInspectChips])

  const advanceDnsStep = useCallback(() => {
    setTimeout(() => {
      setDnsStep((prev) => {
        const next = (prev ?? -1) + 1
        if (next >= dnsSegments.length) {
          setLineFrom(null); setLineTo(null)
          // Clear the start flag to prevent auto-restart
          const w: any = typeof window !== 'undefined' ? window : {}
          w.__DNS_START_REQUESTED__ = false

          // Firewall room: auto-chain into Rule Evaluation (inspection)
          if (isFirewallRoom && firewallAutoRunRef.current) {
            setTimeout(() => {
              if (!firewallAutoRunRef.current) return
              startPkiStepRef.current(0)
            }, 0)
            return -1
          }

          onFlowUpdate?.({ phase: 'DNS', status: 'idle' })
          return -1
        }
        const [nf, nt] = dnsSegments[next]
        setLineFrom(nf); setLineTo(nt)
        onFlowUpdate?.({ phase: 'DNS', status: 'pending', from: nf, to: nt })
        setTimeout(() => {
          const tunnelPts = getVpnTunnelPathPoints(nf, nt, vpnActive)
          const isVpnInspectHop = isVpnRoom && !vpnActive && nf === 'earth1' && nt === 'firewall1'

          const isHttpsInspectHop = isHttpsRoom && nt === 'firewall1' && (nf === 'router1' || nf === 'earth1')
          if (isHttpsInspectHop) {
            httpsInspectOffsetRef.current = { towardAnchor: nf === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
          }
          const httpsStartOffset = (isHttpsRoom && nf === 'firewall1') ? httpsInspectOffsetRef.current : null

          const cfg = isVpnInspectHop
            ? {
                packetId: `dns-${Date.now()}-${next}`,
                label: 'INSPECT',
                protocol: 'Firewall inspection',
                encrypted: false,
                fromAnchor: nf,
                toAnchor: nt,
                // Motion: decelerate into zone and pause
                travelSeconds: 2.6,
                easing: 'easeOut' as const,
                holdSeconds: 2.6,
                // Stop slightly in front of the firewall (toward the Internet)
                endOffsetTowardAnchor: 'earth1',
                endOffsetDistance: 0.9,
                endYOffset: 0.18,
                // Keep HUD calm during inspection
                showLabel: false,
                inspectChips: [
                  'Src IP: 203.0.113.25',
                  'Dst IP: 198.51.100.10',
                  'Protocol: TCP',
                  'Port: 443',
                ],
              }
            : isHttpsInspectHop
              ? {
                  packetId: `dns-${Date.now()}-${next}`,
                  label: 'INSPECT',
                  protocol: 'Firewall inspection',
                  encrypted: false,
                  fromAnchor: nf,
                  toAnchor: nt,
                  // Motion: decelerate into zone and pause
                  travelSeconds: 1.4,
                  easing: 'easeOut' as const,
                  holdSeconds: 1.8,
                  // Stop slightly in front of the firewall (toward the side the packet came from)
                  endOffsetTowardAnchor: nf === 'router1' ? 'router1' : 'earth1',
                  endOffsetDistance: 0.9,
                  endYOffset: 0.18,
                  // Keep HUD calm during inspection
                  showLabel: false,
                  inspectChips: buildHttpsFirewallInspectChips('DNS', next, nf),
                }
              : {
                  packetId: `dns-${Date.now()}-${next}`,
                  label: isFirewallRoom ? 'HTTPS' : isVpnRoom ? 'PACKET' : isHttpsRoom ? 'HTTP' : 'DNS',
                  protocol: isFirewallRoom ? 'TCP/443' : isVpnRoom ? 'IP' : isHttpsRoom ? 'HTTP (TCP/80)' : 'UDP/53',
                  encrypted: isFirewallRoom ? true : false,
                  fromAnchor: nf,
                  toAnchor: nt,
                  ...(isVpnRoom && nf === 'desktop1' && nt === 'earth1' ? { travelSeconds: 0.8 } : {}),
                  ...(tunnelPts ? { pathPointsOverride: tunnelPts, travelSeconds: 0.8 } : {}),
                  ...(isHttpsRoom && nt === 'web1' ? { holdSeconds: 2.0 } : {}),
                  ...(httpsStartOffset
                    ? {
                        startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
                        startOffsetDistance: httpsStartOffset.distance,
                        startYOffset: httpsStartOffset.y,
                      }
                    : {}),
                }
          if (httpsStartOffset) {
            // Consume the offset so later hops don't inherit it.
            httpsInspectOffsetRef.current = null
          }

          onFlowUpdate?.({ phase: 'DNS', status: 'active', from: nf, to: nt, meta: cfg })
          packetAnim.startHop(cfg)
        }, 120)
        return next
      })
    }, 80)
  }, [dnsSegments, packetAnim, onFlowUpdate, isFirewallRoom, isVpnRoom, isHttpsRoom, vpnActive, getVpnTunnelPathPoints, buildHttpsFirewallInspectChips])

  // Attack simulation: step control
  const startAttackStep = useCallback((idx: number) => {
    if (!isFirewallRoom) return
    if (idx < 0 || idx >= attackSegments.length) {
      setAttackStep(-1)
      setLineFrom(null); setLineTo(null)
      return
    }

    const [from, to] = attackSegments[idx]
    console.log('🟥 ATTACK_STEP', { idx, from, to })

    setAttackStep(idx)
    setDnsStep(-1)
    setPkiStep(-1)
    setHttpsStep(-1)
    setLineFrom(from); setLineTo(to)

    setTimeout(() => {
      const traffic = firewallTrafficAttack
      const attackProto = `${traffic.protocol}/${traffic.port}`

      const isInspectHop = from === 'earth1' && to === 'firewall1'
      const startOffset = (from === 'firewall1') ? firewallInspectOffsetRef.current : null

      if (isInspectHop) {
        // Used to start the next hop (Firewall → Router) from the same point where the packet paused.
        firewallInspectOffsetRef.current = { towardAnchor: 'earth1', distance: 0.9, y: 0.18 }
      }

      const cfg = isInspectHop
        ? {
            packetId: `attack-${Date.now()}-${idx}`,
            label: 'INSPECT ATTACK',
            protocol: `Inspection (Attack ${attackProto})`,
            encrypted: false,
            fromAnchor: from,
            toAnchor: to,
            // Motion: decelerate into zone and pause
            travelSeconds: 1.4,
            easing: 'easeOut' as const,
            holdSeconds: 2.8,
            // Stop slightly in front of the firewall (toward the WAN/Internet)
            endOffsetTowardAnchor: 'earth1',
            endOffsetDistance: 0.9,
            endYOffset: 0.18,
            // Keep HUD calm during inspection
            showLabel: false,
          }
        : {
            packetId: `attack-${Date.now()}-${idx}`,
            label: 'ATTACK',
            protocol: `Attack ${attackProto}`,
            encrypted: false,
            fromAnchor: from,
            toAnchor: to,
            ...(startOffset
              ? {
                  startOffsetTowardAnchor: startOffset.towardAnchor,
                  startOffsetDistance: startOffset.distance,
                  startYOffset: startOffset.y,
                }
              : {}),
          }

      if (startOffset) {
        // Consume the offset so later hops don't inherit it.
        firewallInspectOffsetRef.current = null
      }

      packetAnim.startHop(cfg)
    }, 120)
  }, [attackSegments, packetAnim, isFirewallRoom, firewallTrafficAttack])

  const advanceAttackStep = useCallback(() => {
    setTimeout(() => {
      setAttackStep((prev) => {
        const cur = prev ?? -1
        if (cur < 0) return cur

        // If we just finished the inspection hop, evaluate rules to decide ALLOW/DENY.
        if (cur === 1 && isFirewallRoom) {
          try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
          approvalTimeoutRef.current = null

          const decision = firewallDecisionAttack

          if (decision.action === 'ALLOW') {
            setFirewallApproval('approved')
            attackAllowedByRef.current = {
              matchedRuleIndex: decision.matchedRuleIndex,
              matchedRuleId: decision.matchedRuleId,
            }
            // Safety fallback: if the next hop never launches, revert after a bit.
            approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 8000)
          } else {
            setFirewallApproval('denied')
            attackAllowedByRef.current = null
            firewallInspectOffsetRef.current = null
            approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 5000)
            setLineFrom(null); setLineTo(null)

            // Notify UI that the LAN stayed secure (attack blocked at the firewall).
            try {
              const d = { matchedRuleIndex: decision.matchedRuleIndex, matchedRuleId: decision.matchedRuleId }
              setTimeout(() => { try { onAttackBlocked?.(d) } catch {} }, 0)
            } catch {}

            return -1
          }
        }

        const next = cur + 1
        if (next >= attackSegments.length) {
          // Successful attack reached the LAN desktop.
          if (cur === attackSegments.length - 1) {
            const d = attackAllowedByRef.current || { matchedRuleIndex: null, matchedRuleId: null }
            onAttackCompromised?.(d)
          }
          setLineFrom(null); setLineTo(null)
          firewallInspectOffsetRef.current = null
          return -1
        }

        const [nf, nt] = attackSegments[next]
        setLineFrom(nf); setLineTo(nt)
        setTimeout(() => startAttackStepRef.current(next), 0)
        return next
      })
    }, 80)
  }, [attackSegments, isFirewallRoom, firewallDecisionAttack])

  useEffect(() => {
    startAttackStepRef.current = startAttackStep
  }, [startAttackStep])

  useEffect(() => {
    advanceAttackStepRef.current = advanceAttackStep
  }, [advanceAttackStep])

  // Simulate Attack button (Header) → run the attack path
  useEffect(() => {
    const onSim = () => {
      if (!isFirewallRoom) return

      // Cancel any auto-run or in-flight flows
      firewallAutoRunRef.current = false

      try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
      approvalTimeoutRef.current = null
      firewallInspectOffsetRef.current = null
      attackAllowedByRef.current = null
      setFirewallApproval('none')

      setDnsStep(-1)
      setPkiStep(-1)
      setHttpsStep(-1)
      setAttackStep(-1)
      setLineFrom(null)
      setLineTo(null)

      // Stop any currently active hop
      try { packetAnim.stopAll?.() } catch {}

      // Clear start flags to prevent auto-restart polling
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        w.__DNS_START_REQUESTED__ = false
        w.__PKI_START_REQUESTED__ = false
        w.__HTTPS_START_REQUESTED__ = false
        w.__DNS_FLOW_HAS_STARTED__ = false
        w.__PKI_FLOW_HAS_STARTED__ = false
        w.__HTTPS_FLOW_HAS_STARTED__ = false
      } catch {}

      // Kick off the attack sequence
      setTimeout(() => startAttackStepRef.current(0), 0)
    }

    window.addEventListener('firewall:simulate-attack', onSim as any)
    return () => window.removeEventListener('firewall:simulate-attack', onSim as any)
  }, [isFirewallRoom, packetAnim.stopAll])

  // PKI/TLS: step control
  const startPkiStep = useCallback((idx: number) => {
    const segs = getPkiSegments()
    if (idx < 0 || idx >= segs.length) {
      setPkiStep(-1)
      setLineFrom(null); setLineTo(null)
      onFlowUpdate?.({ phase: 'PKI', status: 'idle' })
      return
    }
    selectedPhaseRef.current = 'PKI'
    const [from, to] = segs[idx]
    console.log('🟣 PKI_STEP', { idx, from, to })
    setPkiStep(idx)
    setDnsStep(-1)
    setLineFrom(from); setLineTo(to)
    onFlowUpdate?.({ phase: 'PKI', status: 'pending', from, to })
    setTimeout(() => {
      if (isFirewallRoom) {
        // Used to start the next hop from the same point where the packet paused for inspection.
        firewallInspectOffsetRef.current = { towardAnchor: 'router1', distance: 0.9, y: 0.18 }
      }

      const tunnelPts = getVpnTunnelPathPoints(from, to, vpnActive)

      const isVpnInspectHop = isVpnRoom && vpnActive && from === 'earth1' && to === 'firewall1'
      if (isVpnInspectHop) {
        // Used to start the next hop (Firewall → Router) from the same point where the packet paused.
        vpnInspectOffsetRef.current = { towardAnchor: 'earth1', distance: 0.9, y: 0.18 }
      }

      const isHttpsInspectHop = isHttpsRoom && to === 'firewall1' && (from === 'router1' || from === 'earth1')
      if (isHttpsInspectHop) {
        httpsInspectOffsetRef.current = { towardAnchor: from === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
      }

      // If we're leaving the firewall right after a pause, start from the same offset point.
      const vpnStartOffset = (isVpnRoom && vpnActive && from === 'firewall1') ? vpnInspectOffsetRef.current : null
      const httpsStartOffset = (isHttpsRoom && from === 'firewall1') ? httpsInspectOffsetRef.current : null

      const cfg = isFirewallRoom
        ? {
            packetId: `tls-${Date.now()}-${idx}`,
            label: 'INSPECT',
            protocol: 'Inspection & Policy Check',
            encrypted: false,
            fromAnchor: from,
            toAnchor: to,
            // Motion: decelerate into zone and pause
            travelSeconds: 1.4,
            easing: 'easeOut' as const,
            holdSeconds: 2.8,
            // Stop slightly in front of the firewall (toward the router)
            endOffsetTowardAnchor: 'router1',
            endOffsetDistance: 0.9,
            endYOffset: 0.18,
            // Keep HUD calm during inspection
            showLabel: false,
          }
        : isVpnInspectHop
          ? {
              packetId: `tls-${Date.now()}-${idx}`,
              label: 'INSPECT VPN',
              protocol: 'Firewall inspection (VPN traffic)',
              encrypted: true,
              fromAnchor: from,
              toAnchor: to,
              ...(tunnelPts ? { pathPointsOverride: tunnelPts } : {}),
              // Motion: decelerate into zone and pause
              travelSeconds: 2.6,
              easing: 'easeOut' as const,
              holdSeconds: 2.6,
              // After the scan finishes, wait for the user to press Continue
              holdUntilEvent: 'vpn:continue',
              holdCompleteEvent: 'packet:holdComplete',
              // Stop slightly in front of the firewall (toward the Internet)
              endOffsetTowardAnchor: 'earth1',
              endOffsetDistance: 0.9,
              endYOffset: 0.18,
              // Keep HUD calm during inspection
              showLabel: false,
              inspectChips: [
                'Src IP: 10.8.0.25',
                'Dst IP: 192.168.10.50',
                'Protocol: TCP',
                'Port: 443',
                'Zone: VPN → LAN',
              ],
            }
          : isHttpsInspectHop
            ? {
                packetId: `tls-${Date.now()}-${idx}`,
                label: 'INSPECT',
                protocol: 'Firewall inspection',
                encrypted: false,
                fromAnchor: from,
                toAnchor: to,
                // Motion: decelerate into zone and pause
                travelSeconds: 1.4,
                easing: 'easeOut' as const,
                holdSeconds: 1.8,
                // Stop slightly in front of the firewall (toward the side the packet came from)
                endOffsetTowardAnchor: from === 'router1' ? 'router1' : 'earth1',
                endOffsetDistance: 0.9,
                endYOffset: 0.18,
                // Keep HUD calm during inspection
                showLabel: false,
                inspectChips: buildHttpsFirewallInspectChips('PKI', idx, from),
              }
            : {
              packetId: `tls-${Date.now()}-${idx}`,
              label: isVpnRoom ? 'VPN' : 'TLS',
              protocol: isVpnRoom
                ? 'Encrypted VPN Tunnel'
                : isHttpsRoom
                  ? (
                      idx < 5
                        ? 'ClientHello (TCP/443)'
                        : 'ServerHello + Certificate (TCP/443)'
                    )
                  : 'TLS 1.3 on TCP/443',
              // TLS handshake phase in the HTTPS room is about establishing encryption; HTTPS phase will show encrypted application data.
              encrypted: isVpnRoom ? true : false,
              fromAnchor: from,
              toAnchor: to,
              ...(isVpnRoom && from === 'desktop1' && to === 'earth1' ? { travelSeconds: 0.8 } : {}),
              ...(tunnelPts ? { pathPointsOverride: tunnelPts } : {}),
              ...(isHttpsRoom && to === 'web1' ? { holdSeconds: 2.0 } : {}),
              ...(vpnStartOffset
                ? {
                    startOffsetTowardAnchor: vpnStartOffset.towardAnchor,
                    startOffsetDistance: vpnStartOffset.distance,
                    startYOffset: vpnStartOffset.y,
                  }
                : {}),
              ...(httpsStartOffset
                ? {
                    startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
                    startOffsetDistance: httpsStartOffset.distance,
                    startYOffset: httpsStartOffset.y,
                  }
                : {}),
            }

      if (vpnStartOffset) {
        // Consume the offset so later hops don't inherit it.
        vpnInspectOffsetRef.current = null
      }
      if (httpsStartOffset) {
        // Consume the offset so later hops don't inherit it.
        httpsInspectOffsetRef.current = null
      }

      onFlowUpdate?.({ phase: 'PKI', status: 'active', from, to, meta: cfg })
      packetAnim.startHop(cfg)
    }, 120)
  }, [getPkiSegments, getVpnTunnelPathPoints, packetAnim, onFlowUpdate, isFirewallRoom, isVpnRoom, isHttpsRoom, vpnActive, buildHttpsFirewallInspectChips])

  useEffect(() => {
    startPkiStepRef.current = startPkiStep
  }, [startPkiStep])

  // HTTPS segments resolver (cdn1 → web1 → cdn1 flow for HTTPS)
  // NOTE: In the firewall room, HTTPS phase is repurposed as "Enforced Outcome" with a different hop sequence.
  const getHttpsSegments = useCallback(() => {
    if (!isolatePacket && isFirewallRoom) {
      // Enforced Outcome flow:
      //   Firewall → Earth → Web Server
      //   Web Server → Earth → Firewall → Router → Switch → Desktop
      // In this room, the server device is currently aliased as dns1.
      return [
        ["firewall1","earth1"],
        ["earth1","dns1"],
        ["dns1","earth1"],
        ["earth1","firewall1"],
        ["firewall1","router1"],
        ["router1","switch1"],
        ["switch1","desktop1"],
      ]
    }

    const has = (name: string) => !!scene.getObjectByName(`${name}-center`) || !!scene.getObjectByName(name)
    const hasCdn = has('cdn1')
    const hasWeb = has('web1')

    // HTTPS room: keep it simple (client ↔ web server) and skip CDN entirely.
    if (isHttpsRoom) {
      const server = hasWeb ? 'web1' : has('server1') ? 'server1' : 'web1'
      return (
        isolatePacket
          ? [["isolateStart","isolateEnd"]]
          : [
              ["desktop1","switch1"],
              ["switch1","router1"],
              ["router1","firewall1"],
              ["firewall1","earth1"],
              ["earth1",server],
              [server,"earth1"],
              ["earth1","firewall1"],
              ["firewall1","router1"],
              ["router1","switch1"],
              ["switch1","desktop1"],
            ]
      )
    }
    
    // If both CDN and Web exist, use the full Edge→Origin→Edge flow
    if (hasCdn && hasWeb) {
      return (
        isolatePacket
          ? [["isolateStart","isolateEnd"]]
          : [
              ["desktop1","switch1"],
              ["switch1","router1"],
              ["router1","firewall1"],
              ["firewall1","earth1"],
              ["earth1","cdn1"],
              ["cdn1","web1"],
              ["web1","cdn1"],
              ["cdn1","earth1"],
              ["earth1","firewall1"],
              ["firewall1","router1"],
              ["router1","switch1"],
              ["switch1","desktop1"],
            ]
      )
    }
    
    // Fallback: use whatever server is available
    const server = hasCdn ? 'cdn1' : hasWeb ? 'web1' : has('server1') ? 'server1' : has('pki1') ? 'pki1' : 'dns1'
    return (
      isolatePacket
        ? [["isolateStart","isolateEnd"]]
        : [
            ["desktop1","switch1"],
            ["switch1","router1"],
            ["router1","firewall1"],
            ["firewall1","earth1"],
            ["earth1",server],
            [server,"earth1"],
            ["earth1","firewall1"],
            ["firewall1","router1"],
            ["router1","switch1"],
            ["switch1","desktop1"],
          ]
    )
  }, [isolatePacket, scene, isFirewallRoom, isHttpsRoom])

  // HTTPS: step control
  const startHttpsStep = useCallback((idx: number) => {
    const segs = getHttpsSegments()
    if (idx < 0 || idx >= segs.length) {
      setHttpsStep(-1)
      setLineFrom(null); setLineTo(null)
      onFlowUpdate?.({ phase: 'HTTPS', status: 'idle' })
      return
    }
    selectedPhaseRef.current = 'HTTPS'
    const [from, to] = segs[idx]
    console.log('🟠 HTTPS_STEP', { idx, from, to })
    setHttpsStep(idx)
    setDnsStep(-1)
    setPkiStep(-1)
    setLineFrom(from); setLineTo(to)
    onFlowUpdate?.({ phase: 'HTTPS', status: 'pending', from, to })
    setTimeout(() => {
      const isInboundInspectHop = isFirewallRoom && from === 'earth1' && to === 'firewall1'
      const isHttpsInspectHop = isHttpsRoom && to === 'firewall1' && (from === 'router1' || from === 'earth1')

      if (isInboundInspectHop) {
        // Used to start the next hop (Firewall → Router) from the same point where the packet paused.
        firewallInspectOffsetRef.current = { towardAnchor: 'earth1', distance: 0.9, y: 0.18 }
      }
      if (isHttpsInspectHop) {
        httpsInspectOffsetRef.current = { towardAnchor: from === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
      }

      // If we're leaving the firewall right after an inspection pause, start from the same offset point.
      const startOffset = (isFirewallRoom && from === 'firewall1') ? firewallInspectOffsetRef.current : null
      const httpsStartOffset = (isHttpsRoom && from === 'firewall1') ? httpsInspectOffsetRef.current : null

      const cfg = {
        packetId: `https-${Date.now()}-${idx}`,
        label: isInboundInspectHop || isHttpsInspectHop ? 'INSPECT' : 'HTTPS',
        protocol: isInboundInspectHop ? 'Inspection & Policy Check' : (isHttpsInspectHop ? 'Firewall inspection' : 'HTTP/2 over TLS 1.3 (TCP/443)'),
        encrypted: true,
        fromAnchor: from,
        toAnchor: to,
        ...(startOffset
          ? {
              startOffsetTowardAnchor: startOffset.towardAnchor,
              startOffsetDistance: startOffset.distance,
              startYOffset: startOffset.y,
            }
          : {}),
        ...(httpsStartOffset
          ? {
              startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
              startOffsetDistance: httpsStartOffset.distance,
              startYOffset: httpsStartOffset.y,
            }
          : {}),
        ...(isInboundInspectHop
          ? {
              // Motion: decelerate into zone and pause
              travelSeconds: 1.4,
              easing: 'easeOut' as const,
              holdSeconds: 2.8,
              // Stop slightly in front of the firewall (toward the WAN/Internet)
              endOffsetTowardAnchor: 'earth1',
              endOffsetDistance: 0.9,
              endYOffset: 0.18,
              // Keep HUD calm during inspection
              showLabel: false,
            }
          : {}),
        ...(isHttpsRoom && to === 'web1' ? { holdSeconds: 2.0 } : {}),
        ...(isHttpsInspectHop
          ? {
              travelSeconds: 1.4,
              easing: 'easeOut' as const,
              holdSeconds: 1.8,
              endOffsetTowardAnchor: from === 'router1' ? 'router1' : 'earth1',
              endOffsetDistance: 0.9,
              endYOffset: 0.18,
              showLabel: false,
              inspectChips: buildHttpsFirewallInspectChips('HTTPS', idx, from),
            }
          : {}),
      }

      if (startOffset) {
        // Consume the offset so later hops don't inherit it.
        firewallInspectOffsetRef.current = null
      }
      if (httpsStartOffset) {
        // Consume the offset so later hops don't inherit it.
        httpsInspectOffsetRef.current = null
      }

      onFlowUpdate?.({ phase: 'HTTPS', status: 'active', from, to, meta: cfg })
      packetAnim.startHop(cfg)
    }, 120)
  }, [getHttpsSegments, packetAnim, onFlowUpdate, isFirewallRoom, isHttpsRoom, buildHttpsFirewallInspectChips])

  // ----- Flow DSL (Epic D - Task 1): map config.flows[] to NetworkLine overlays + simple PacketHop choreography -----
  type FlowSpec = { id: string; path: string[]; style?: { color?: string; speed?: number } }
  const flows: FlowSpec[] = useMemo(() => {
    try {
      const list = ((config as any)?.flows || []) as FlowSpec[]
      if (Array.isArray(list)) return list.filter(f => Array.isArray(f?.path) && f.path.length >= 2)
    } catch {}
    return []
  }, [config])

  // Gate packet playback to avoid interfering with existing automated demos.
  // Enable explicitly via URL (?runFlows=1) or programmatically via 'flowdsl:start'.
  const [flowPlaybackEnabled, setFlowPlaybackEnabled] = useState<boolean>(() => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const q = params?.get('runFlows') === '1'
      return !!w.__RUN_FLOW_DSL__ || q
    } catch { return false }
  })
  useEffect(() => {
    const onStart = () => setFlowPlaybackEnabled(true)
    const onStop = () => setFlowPlaybackEnabled(false)
    try {
      window.addEventListener('flowdsl:start', onStart as any)
      window.addEventListener('flowdsl:stop', onStop as any)
    } catch {}
    return () => {
      try {
        window.removeEventListener('flowdsl:start', onStart as any)
        window.removeEventListener('flowdsl:stop', onStop as any)
      } catch {}
    }
  }, [])

  // Optional: allow flows to set speed globally only if ?flowSpeed=1 or window flag; otherwise, ignore speed to avoid side-effects
  const allowFlowSpeed = useMemo(() => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      return !!w.__ALLOW_FLOW_DSL_SPEED__ || params?.get('flowSpeed') === '1'
    } catch { return false }
  }, [])

  function FlowRunner({ flow, disabled }: { flow: FlowSpec; disabled: boolean }) {
    const [segIdx, setSegIdx] = useState<number>(-1)
    const [startedAt] = useState<number>(() => Date.now())

    // Kick off playback when enabled and not disabled
    useEffect(() => {
      if (disabled || !flowPlaybackEnabled) return
      if (segIdx === -1) {
        // Apply speed if allowed
        if (allowFlowSpeed && typeof flow?.style?.speed === 'number') {
          const v = Math.max(0.1, Math.min(4, Number(flow.style.speed)))
          try { window.dispatchEvent(new CustomEvent('packet-control', { detail: { action: 'speed', value: v } })) } catch {}
        }
        // Stagger starts slightly to avoid overlap if multiple flows
        const delay = Math.min(1000, 150 * Math.max(0, flow.id?.length || 0))
        const t = setTimeout(() => setSegIdx(0), delay)
        return () => clearTimeout(t)
      }
    }, [disabled, segIdx, flowPlaybackEnabled, allowFlowSpeed, flow?.style?.speed, flow?.id])

    // Advance to next segment on each hop arrival
    const handleArrival = useCallback(() => {
      setTimeout(() => setSegIdx((i) => (i + 1 < (flow.path.length - 1) ? i + 1 : -2)), 80)
    }, [flow.path.length])

    if (!flow || segIdx < 0) return null
    if (segIdx === -2) return null // done

    const from = flow.path[segIdx]
    const to = flow.path[segIdx + 1]
    const pktId = `flow-${flow.id}-${startedAt}-${segIdx}`

    return (
      <PacketHop
        key={pktId}
        packetMeta={{ id: pktId, label: 'FLOW', protocol: 'Flow', encrypted: false }}
        fromAnchor={from}
        toAnchor={to}
        onArrival={() => handleArrival()}
      />
    )
  }

  const advanceHttpsStep = useCallback(() => {
      setTimeout(() => {
        setHttpsStep((prev) => {
          const segs = getHttpsSegments()

          // Firewall room: evaluate inbound rules when traffic arrives from Earth → Firewall.
          // This mirrors the outbound inspection behavior in the Rule Evaluation phase.
          try {
            if (isFirewallRoom && firewallAutoRunRef.current) {
              const curIdx = prev ?? -1
              const curSeg = segs[curIdx]
              const cf = curSeg?.[0]
              const ct = curSeg?.[1]

              if (cf === 'earth1' && ct === 'firewall1') {
                try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
                approvalTimeoutRef.current = null

                const decision = firewallDecisionInbound

                if (decision.action === 'ALLOW') {
                  setFirewallApproval('approved')
                  // Safety fallback: if the next hop never launches, revert after a bit.
                  approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 8000)
                } else {
                  setFirewallApproval('denied')
                  firewallAutoRunRef.current = false
                  approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 5000)

                  // We won't be leaving the firewall; don't keep a pending continuation offset.
                  firewallInspectOffsetRef.current = null

                  // Clear the start flag to prevent auto-restart
                  const w: any = typeof window !== 'undefined' ? window : {}
                  w.__HTTPS_START_REQUESTED__ = false

                  setLineFrom(null); setLineTo(null)
                  onFlowUpdate?.({ phase: 'HTTPS', status: 'blocked', decision })
                  return -1
                }
              }
            }
          } catch {}

          // HTTPS room: no firewall rules configuration in this lesson.
          // Always allow and only show the green "approved" effect.
          // (We drive the actual green pulse from PacketHop onLaunch so it works for HTTP/TLS/HTTPS consistently.)

          const next = (prev ?? -1) + 1
        if (next >= segs.length) {
          setLineFrom(null); setLineTo(null)
          onFlowUpdate?.({ phase: 'HTTPS', status: 'idle' })
          // Clear the start flag to prevent auto-restart
          const w: any = typeof window !== 'undefined' ? window : {}
          w.__HTTPS_START_REQUESTED__ = false
          if (isFirewallRoom) firewallAutoRunRef.current = false
          firewallInspectOffsetRef.current = null
          return -1
        }

        const [nf, nt] = segs[next]
        setLineFrom(nf); setLineTo(nt)
        onFlowUpdate?.({ phase: 'HTTPS', status: 'pending', from: nf, to: nt })

        setTimeout(() => {
          const isInboundInspectHop = isFirewallRoom && nf === 'earth1' && nt === 'firewall1'
          const isHttpsInspectHop = isHttpsRoom && nt === 'firewall1' && (nf === 'router1' || nf === 'earth1')

          if (isInboundInspectHop) {
            // Used to start the next hop (Firewall → Router) from the same point where the packet paused.
            firewallInspectOffsetRef.current = { towardAnchor: 'earth1', distance: 0.9, y: 0.18 }
          }
          if (isHttpsInspectHop) {
            httpsInspectOffsetRef.current = { towardAnchor: nf === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
          }

          // If we're leaving the firewall right after an inspection pause, start from the same offset point.
          const startOffset = (isFirewallRoom && nf === 'firewall1') ? firewallInspectOffsetRef.current : null
          const httpsStartOffset = (isHttpsRoom && nf === 'firewall1') ? httpsInspectOffsetRef.current : null

          const cfg = {
            packetId: `https-${Date.now()}-${next}`,
            label: isInboundInspectHop || isHttpsInspectHop ? 'INSPECT' : 'HTTPS',
            protocol: isInboundInspectHop ? 'Inspection & Policy Check' : (isHttpsInspectHop ? 'Firewall inspection' : 'HTTP/2 over TLS 1.3 (TCP/443)'),
            encrypted: true,
            fromAnchor: nf,
            toAnchor: nt,
            ...(startOffset
              ? {
                  startOffsetTowardAnchor: startOffset.towardAnchor,
                  startOffsetDistance: startOffset.distance,
                  startYOffset: startOffset.y,
                }
              : {}),
            ...(httpsStartOffset
              ? {
                  startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
                  startOffsetDistance: httpsStartOffset.distance,
                  startYOffset: httpsStartOffset.y,
                }
              : {}),
            ...(isInboundInspectHop
              ? {
                  // Motion: decelerate into zone and pause
                  travelSeconds: 1.4,
                  easing: 'easeOut' as const,
                  holdSeconds: 2.8,
                  // Stop slightly in front of the firewall (toward the WAN/Internet)
                  endOffsetTowardAnchor: 'earth1',
                  endOffsetDistance: 0.9,
                  endYOffset: 0.18,
                  // Keep HUD calm during inspection
                  showLabel: false,
                }
              : {}),
            ...(isHttpsRoom && nt === 'web1' ? { holdSeconds: 2.0 } : {}),
            ...(isHttpsInspectHop
              ? {
                  travelSeconds: 1.4,
                  easing: 'easeOut' as const,
                  holdSeconds: 1.8,
                  endOffsetTowardAnchor: nf === 'router1' ? 'router1' : 'earth1',
                  endOffsetDistance: 0.9,
                  endYOffset: 0.18,
                  showLabel: false,
                  inspectChips: buildHttpsFirewallInspectChips('HTTPS', next, nf),
                }
              : {}),
          }

          if (startOffset) {
            // Consume the offset so later hops don't inherit it.
            firewallInspectOffsetRef.current = null
          }
          if (httpsStartOffset) {
            // Consume the offset so later hops don't inherit it.
            httpsInspectOffsetRef.current = null
          }

          onFlowUpdate?.({ phase: 'HTTPS', status: 'active', from: nf, to: nt, meta: cfg })
          packetAnim.startHop(cfg)
        }, 120)

        return next
      })
    }, 80)
  }, [getHttpsSegments, packetAnim, onFlowUpdate, isFirewallRoom, isHttpsRoom, firewallDecisionInbound, buildHttpsFirewallInspectChips])

  const advancePkiStep = useCallback(() => {
      setTimeout(() => {
        setPkiStep((prev) => {
          const segs = getPkiSegments()

          // HTTPS room: no firewall rules configuration in this lesson.
          // Always allow traffic; only show green pass indicator.
          // (We drive the actual green pulse from PacketHop onLaunch so it works for HTTP/TLS/HTTPS consistently.)

          const next = (prev ?? -1) + 1
          if (next >= segs.length) {
          setLineFrom(null); setLineTo(null)
          // Clear the start flag to prevent auto-restart
          const w: any = typeof window !== 'undefined' ? window : {}
          w.__PKI_START_REQUESTED__ = false

          // Firewall room: evaluate rules (top → bottom) to determine allow/deny
          if (isFirewallRoom && firewallAutoRunRef.current) {
            try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
            approvalTimeoutRef.current = null

            const decision = firewallDecisionOutbound

            if (decision.action === 'ALLOW') {
              setFirewallApproval('approved')
              // Safety fallback: if the next hop never launches, revert after a bit.
              approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 8000)

              // Continue immediately; startHttpsStep delays hop start enough to avoid overlap.
              setTimeout(() => {
                if (!firewallAutoRunRef.current) return
                startHttpsStep(0)
              }, 0)
            } else {
              setFirewallApproval('denied')
              // Blocked traffic does not proceed to Enforced Outcome
              firewallAutoRunRef.current = false
              approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 5000)
              firewallInspectOffsetRef.current = null
              onFlowUpdate?.({ phase: 'PKI', status: 'blocked', decision })
            }

            return -1
          }

          onFlowUpdate?.({ phase: 'PKI', status: 'idle' })
          return -1
        }
        const [nf, nt] = segs[next]
        setLineFrom(nf); setLineTo(nt)
        onFlowUpdate?.({ phase: 'PKI', status: 'pending', from: nf, to: nt })
        setTimeout(() => {
          const tunnelPts = getVpnTunnelPathPoints(nf, nt, vpnActive)

          const isVpnInspectHop = isVpnRoom && vpnActive && nf === 'earth1' && nt === 'firewall1'
          if (isVpnInspectHop) {
            // Used to start the next hop (Firewall → Router) from the same point where the packet paused.
            vpnInspectOffsetRef.current = { towardAnchor: 'earth1', distance: 0.9, y: 0.18 }
          }

          const isHttpsInspectHop = isHttpsRoom && nt === 'firewall1' && (nf === 'router1' || nf === 'earth1')
          if (isHttpsInspectHop) {
            httpsInspectOffsetRef.current = { towardAnchor: nf === 'router1' ? 'router1' : 'earth1', distance: 0.9, y: 0.18 }
          }

          // If we're leaving the firewall right after a pause, start from the same offset point.
          const vpnStartOffset = (isVpnRoom && vpnActive && nf === 'firewall1') ? vpnInspectOffsetRef.current : null
          const httpsStartOffset = (isHttpsRoom && nf === 'firewall1') ? httpsInspectOffsetRef.current : null

          const cfg = isVpnInspectHop
            ? {
                packetId: `tls-${Date.now()}-${next}`,
                label: 'INSPECT VPN',
                protocol: 'Firewall inspection (VPN traffic)',
                encrypted: true,
                fromAnchor: nf,
                toAnchor: nt,
                ...(tunnelPts ? { pathPointsOverride: tunnelPts } : {}),
                // Motion: decelerate into zone and pause
                travelSeconds: 2.6,
                easing: 'easeOut' as const,
                holdSeconds: 2.6,
                // After the scan finishes, wait for the user to press Continue
                holdUntilEvent: 'vpn:continue',
                holdCompleteEvent: 'packet:holdComplete',
                // Stop slightly in front of the firewall (toward the Internet)
                endOffsetTowardAnchor: 'earth1',
                endOffsetDistance: 0.9,
                endYOffset: 0.18,
                // Keep HUD calm during inspection
                showLabel: false,
                inspectChips: [
                  'Src IP: 10.8.0.25',
                  'Dst IP: 192.168.10.50',
                  'Protocol: TCP',
                  'Port: 443',
                  'Zone: VPN → LAN',
                ],
              }
            : isHttpsInspectHop
              ? {
                  packetId: `tls-${Date.now()}-${next}`,
                  label: 'INSPECT',
                  protocol: 'Firewall inspection',
                  encrypted: false,
                  fromAnchor: nf,
                  toAnchor: nt,
                  travelSeconds: 1.4,
                  easing: 'easeOut' as const,
                  holdSeconds: 1.8,
                  endOffsetTowardAnchor: nf === 'router1' ? 'router1' : 'earth1',
                  endOffsetDistance: 0.9,
                  endYOffset: 0.18,
                  showLabel: false,
                  inspectChips: buildHttpsFirewallInspectChips('PKI', next, nf),
                }
              : {
                  packetId: `tls-${Date.now()}-${next}`,
                  label: isVpnRoom ? 'VPN' : 'TLS',
                  protocol: isVpnRoom
                    ? 'Encrypted VPN Tunnel'
                    : isHttpsRoom
                      ? (
                          next < 5
                            ? 'ClientHello (TCP/443)'
                            : 'ServerHello + Certificate (TCP/443)'
                        )
                      : 'TLS 1.3 on TCP/443',
                  // TLS handshake phase in the HTTPS room is about establishing encryption; HTTPS phase will show encrypted application data.
                  encrypted: isVpnRoom ? true : (isHttpsRoom ? false : next >= 5),
                  fromAnchor: nf,
                  toAnchor: nt,
                  ...(isVpnRoom && nf === 'desktop1' && nt === 'earth1' ? { travelSeconds: 0.8 } : {}),
                  ...(tunnelPts ? { pathPointsOverride: tunnelPts } : {}),
                  ...(isHttpsRoom && nt === 'web1' ? { holdSeconds: 2.0 } : {}),
                  ...(vpnStartOffset
                    ? {
                        startOffsetTowardAnchor: vpnStartOffset.towardAnchor,
                        startOffsetDistance: vpnStartOffset.distance,
                        startYOffset: vpnStartOffset.y,
                      }
                    : {}),
                  ...(httpsStartOffset
                    ? {
                        startOffsetTowardAnchor: httpsStartOffset.towardAnchor,
                        startOffsetDistance: httpsStartOffset.distance,
                        startYOffset: httpsStartOffset.y,
                      }
                    : {}),
                }

          if (vpnStartOffset) {
            // Consume the offset so later hops don't inherit it.
            vpnInspectOffsetRef.current = null
          }
          if (httpsStartOffset) {
            // Consume the offset so later hops don't inherit it.
            httpsInspectOffsetRef.current = null
          }

          onFlowUpdate?.({ phase: 'PKI', status: 'active', from: nf, to: nt, meta: cfg })
          packetAnim.startHop(cfg)
        }, 120)
        return next
      })
    }, 80)
  }, [getPkiSegments, getVpnTunnelPathPoints, packetAnim, onFlowUpdate, isFirewallRoom, isVpnRoom, isHttpsRoom, vpnActive, startHttpsStep, firewallDecisionOutbound, buildHttpsFirewallInspectChips])

  // Phase camera cue: move camera near target anchor and look at it
  useEffect(() => {
    if (!phasesEnabled) return
    const onCam = (e: any) => {
      const target: string | undefined = e?.detail?.target
      if (!target) return
      const obj = scene.getObjectByName(`${target}-center`) || scene.getObjectByName(target)
      if (!obj) {
        console.warn('phase:camera target not found', target)
        return
      }
      try {
        obj.updateMatrixWorld(true)
        const wp = new THREE.Vector3()
        obj.getWorldPosition(wp)
        const p: [number,number,number] = [wp.x, wp.y, wp.z]
        // Place camera 6m back on +Z from target and 1.6m high
        const camPos: [number,number,number] = [p[0], p[1] + 1.2, p[2] + 6]
        camera.position.set(camPos[0], camPos[1], camPos[2])
        camera.lookAt(p[0], p[1], p[2])
      } catch (err) {
        console.warn('phase:camera error', err)
      }
    }
    window.addEventListener('phase:camera', onCam as any)
    return () => window.removeEventListener('phase:camera', onCam as any)
  }, [phasesEnabled, scene, camera])

  // Set earliest start time to 7s after base models finished loading
  useEffect(() => {
    if (isFullyLoaded && !earliestStartAtRef.current) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      earliestStartAtRef.current = now + 7000
    }
  }, [isFullyLoaded])

  // External flow control (next/prev/replay/start/setPhase)
  useEffect(() => {
    const onCtl = (evt: any) => {
      const d = evt?.detail || {}
      if (d.action === 'next') {
        if (selectedPhaseRef.current === 'DNS') advanceDnsStep()
        else if (selectedPhaseRef.current === 'PKI') advancePkiStep()
        else if (selectedPhaseRef.current === 'HTTPS') advanceHttpsStep()
      } else if (d.action === 'prev') {
        if (selectedPhaseRef.current === 'DNS') {
          setDnsStep((prev) => { const idx = Math.max(0, (prev ?? 0) - 1); startDnsStep(idx); return idx })
        } else if (selectedPhaseRef.current === 'PKI') {
          setPkiStep((prev) => { const idx = Math.max(0, (prev ?? 0) - 1); startPkiStep(idx); return idx })
        } else if (selectedPhaseRef.current === 'HTTPS') {
          setHttpsStep((prev) => { const idx = Math.max(0, (prev ?? 0) - 1); startHttpsStep(idx); return idx })
        }
      } else if (d.action === 'replay') {
        if (selectedPhaseRef.current === 'DNS') setDnsStep((prev) => { const idx = Math.max(0, prev ?? 0); startDnsStep(idx); return idx })
        else if (selectedPhaseRef.current === 'PKI') setPkiStep((prev) => { const idx = Math.max(0, prev ?? 0); startPkiStep(idx); return idx })
        else if (selectedPhaseRef.current === 'HTTPS') setHttpsStep((prev) => { const idx = Math.max(0, prev ?? 0); startHttpsStep(idx); return idx })
      } else if (d.action === 'restart') {
        // Restart current phase from the first hop
        if (selectedPhaseRef.current === 'DNS') {
          setDnsStep(-1); setLineFrom(null); setLineTo(null); setTimeout(() => startDnsStep(0), 0)
        } else if (selectedPhaseRef.current === 'PKI') {
          setPkiStep(-1); setLineFrom(null); setLineTo(null); setTimeout(() => startPkiStep(0), 0)
        } else if (selectedPhaseRef.current === 'HTTPS') {
          setHttpsStep(-1); setLineFrom(null); setLineTo(null); setTimeout(() => startHttpsStep(0), 0)
        }
      } else if (d.action === 'stop') {
        // Stop all animations, clear packet and lines
        setDnsStep(-1); setPkiStep(-1); setHttpsStep(-1)
        setLineFrom(null); setLineTo(null)
        packetAnim.stopAll?.()

        // Cancel firewall auto-run + approval state
        firewallAutoRunRef.current = false
        try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
        approvalTimeoutRef.current = null
        setFirewallApproval('none')
        firewallInspectOffsetRef.current = null
        httpsInspectOffsetRef.current = null

        // VPN room: clear firewall indicator
        try { if (vpnApprovalTimeoutRef.current) clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
        vpnApprovalTimeoutRef.current = null
        setVpnFirewallApproval('none')

        // Clear start flags to prevent auto-restart
        const w: any = typeof window !== 'undefined' ? window : {}
        w.__DNS_START_REQUESTED__ = false
        w.__PKI_START_REQUESTED__ = false
        w.__HTTPS_START_REQUESTED__ = false
        onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'idle' })
      } else if (d.action === 'setPhase') {
        // Manual phase selection cancels any auto-run
        firewallAutoRunRef.current = false
        try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
        approvalTimeoutRef.current = null
        setFirewallApproval('none')
        firewallInspectOffsetRef.current = null
        httpsInspectOffsetRef.current = null

        // VPN room: reset firewall indicator
        try { if (vpnApprovalTimeoutRef.current) clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
        vpnApprovalTimeoutRef.current = null
        setVpnFirewallApproval('none')

        let ph = String(d.phase || '').toUpperCase() as 'DNS'|'PKI'|'HTTPS'

        // VPN room only supports DNS and PKI. Coerce invalid picks rather than showing in-room warnings.
        if (isVpnRoom && ph === 'HTTPS') {
          ph = 'DNS'
        }

        // VPN gating:
        // - VPN OFF => DNS only
        // - VPN ON  => PKI only
        if (isVpnRoom) {
          if (vpnActive && ph === 'DNS') ph = 'PKI'
          if (!vpnActive && ph === 'PKI') ph = 'DNS'
        }

        // HTTPS room: lock the HTTPS phase until the Troubleshooter is completed.
        if (isHttpsRoom && ph === 'HTTPS') {
          const ok = (() => {
            try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
          })()
          if (!ok) {
            ph = 'PKI'
            try { window.dispatchEvent(new CustomEvent('hud:text', { detail: { text: 'HTTPS is currently broken — open Fix HTTPS to repair it.' } })) } catch {}
            try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
          }
        }

        const allowedPhases = isVpnRoom ? new Set(['DNS','PKI']) : new Set(['DNS','PKI','HTTPS'])
        selectedPhaseRef.current = allowedPhases.has(ph) ? ph : 'DNS'
        // Clear any current visuals
        setDnsStep(-1); setPkiStep(-1); setHttpsStep(-1)
        setLineFrom(null); setLineTo(null)
        onFlowUpdate?.({ phase: selectedPhaseRef.current, status: 'idle' })
      } else if (d.action === 'start') {
        const w: any = typeof window !== 'undefined' ? window : {}
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        earliestStartAtRef.current = now
        if (isVpnRoom && selectedPhaseRef.current === 'PKI' && !vpnActive) {
          try { window.dispatchEvent(new CustomEvent('hud:text', { detail: { text: 'Enable VPN before starting the Secure Access via VPN phase.' } })) } catch {}
          return
        }
        if (isVpnRoom && selectedPhaseRef.current === 'DNS' && vpnActive) {
          // Avoid confusing "Disable VPN" messaging on Start: automatically run the VPN phase when VPN is ON.
          // NOTE: do not dispatch flow-control:setPhase here (it resets step state and can race the start).
          selectedPhaseRef.current = 'PKI'
          try { window.dispatchEvent(new CustomEvent('hud:text', { detail: { text: 'VPN is enabled — starting Secure Access via VPN phase.' } })) } catch {}
        }
        if (isVpnRoom && selectedPhaseRef.current === 'HTTPS') {
          selectedPhaseRef.current = 'DNS'
        }

        // Firewall room: always run the full demo sequence starting from Traffic Analysis.
        if (isFirewallRoom) {
          firewallAutoRunRef.current = true
          try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
          approvalTimeoutRef.current = null
          setFirewallApproval('none')
          firewallInspectOffsetRef.current = null

          // Reset any in-flight visuals
          setDnsStep(-1); setPkiStep(-1); setHttpsStep(-1)
          setLineFrom(null); setLineTo(null)
          packetAnim.stopAll?.()

          selectedPhaseRef.current = 'DNS'
          onFlowUpdate?.({ phase: 'DNS', status: 'idle' })

          w.__DNS_START_REQUESTED__ = true
          w.__DNS_FLOW_HAS_STARTED__ = false
          w.__PKI_START_REQUESTED__ = false
          w.__PKI_FLOW_HAS_STARTED__ = false
          w.__HTTPS_START_REQUESTED__ = false
          w.__HTTPS_FLOW_HAS_STARTED__ = false

          try {
            const seg0 = dnsSegments?.[0]
            const a = seg0?.[0]
            const b = seg0?.[1]
            const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
            const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
            if (haveA && haveB) startDnsStep(0)
          } catch {}
          return
        }

        if (selectedPhaseRef.current === 'DNS') {
          w.__DNS_START_REQUESTED__ = true
          w.__DNS_FLOW_HAS_STARTED__ = false
          try {
            const seg0 = dnsSegments?.[0]
            const a = seg0?.[0]
            const b = seg0?.[1]
            const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
            const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
            if (haveA && haveB) startDnsStep(0)
          } catch {}
        } else if (selectedPhaseRef.current === 'PKI') {
          w.__PKI_START_REQUESTED__ = true
          w.__PKI_FLOW_HAS_STARTED__ = false
          try {
            const segs = getPkiSegments()
            const seg0 = segs?.[0]
            const a = seg0?.[0]
            const b = seg0?.[1]
            const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
            const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
            if (haveA && haveB) startPkiStep(0)
          } catch {}
        } else if (selectedPhaseRef.current === 'HTTPS' && !isVpnRoom) {
          // HTTPS room: block HTTPS until the Troubleshooter is completed.
          if (isHttpsRoom) {
            const ok = (() => {
              try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
            })()
            if (!ok) {
              try { window.dispatchEvent(new CustomEvent('hud:text', { detail: { text: 'HTTPS handshake failed — open Fix HTTPS and resolve the issues.' } })) } catch {}
              try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
              return
            }
          }

          w.__HTTPS_START_REQUESTED__ = true
          w.__HTTPS_FLOW_HAS_STARTED__ = false
          try {
            const segs = getHttpsSegments()
            const seg0 = segs?.[0]
            const a = seg0?.[0]
            const b = seg0?.[1]
            const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
            const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
            if (haveA && haveB) startHttpsStep(0)
          } catch {}
        }
      }
    }
    window.addEventListener('flow-control', onCtl as any)
    return () => window.removeEventListener('flow-control', onCtl as any)
  }, [
    advanceDnsStep,
    advancePkiStep,
    advanceHttpsStep,
    startDnsStep,
    startPkiStep,
    startHttpsStep,
    dnsSegments,
    getPkiSegments,
    getHttpsSegments,
    isFirewallRoom,
    isVpnRoom,
    vpnActive,
    scene,
    packetAnim.stopAll,
    onFlowUpdate,
  ])

  // Start DNS flow only when user presses Start; poll until anchors ready
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : {}

    let cancelled = false
    const nowTs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const timeOk = () => earliestStartAtRef.current > 0 && nowTs() >= earliestStartAtRef.current

    const tryStart = () => {
      if (cancelled) return false
      if (!w.__DNS_START_REQUESTED__) return false
      if (w.__DNS_FLOW_HAS_STARTED__) return true
      if (!isFullyLoaded || !timeOk()) return false
      const seg0 = dnsSegments?.[0]
      const a = seg0?.[0]
      const b = seg0?.[1]
      const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
      const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
      if (haveA && haveB && dnsStep === -1 && !packetAnim.activeHop && selectedPhaseRef.current === 'DNS') {
        w.__DNS_FLOW_HAS_STARTED__ = true
        startDnsStep(0)
        return true
      }
      return false
    }

    const poll = setInterval(() => { if (tryStart()) { clearInterval(poll as any) } }, 200)
    return () => { cancelled = true; if (poll) clearInterval(poll as any) }
  }, [scene, dnsSegments, dnsStep, packetAnim.activeHop, startDnsStep, isFullyLoaded])

  // Start PKI flow only when user presses Start; poll until anchors ready
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : {}

    let cancelled = false
    const nowTs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const timeOk = () => earliestStartAtRef.current > 0 && nowTs() >= earliestStartAtRef.current

    const tryStart = () => {
      if (cancelled) return false
      if (!w.__PKI_START_REQUESTED__) return false
      if (w.__PKI_FLOW_HAS_STARTED__) return true
      if (!isFullyLoaded || !timeOk()) return false
      const segs = getPkiSegments()
      const seg0 = segs?.[0]
      const a = seg0?.[0]
      const b = seg0?.[1]
      const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
      const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
      if (haveA && haveB && pkiStep === -1 && !packetAnim.activeHop && selectedPhaseRef.current === 'PKI') {
        w.__PKI_FLOW_HAS_STARTED__ = true
        startPkiStep(0)
        return true
      }
      return false
    }

    const poll = setInterval(() => { if (tryStart()) { clearInterval(poll as any) } }, 200)
    return () => { cancelled = true; if (poll) clearInterval(poll as any) }
  }, [scene, getPkiSegments, pkiStep, packetAnim.activeHop, startPkiStep, isFullyLoaded])
  
  // Start HTTPS flow only when user presses Start; poll until anchors ready
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : {}

    let cancelled = false
    const nowTs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const timeOk = () => earliestStartAtRef.current > 0 && nowTs() >= earliestStartAtRef.current

    const tryStart = () => {
      if (cancelled) return false
      if (!w.__HTTPS_START_REQUESTED__) return false
      if (w.__HTTPS_FLOW_HAS_STARTED__) return true
      if (!isFullyLoaded || !timeOk()) return false
      const segs = getHttpsSegments()
      const seg0 = segs?.[0]
      const a = seg0?.[0]
      const b = seg0?.[1]
      const haveA = !!a && (!!scene.getObjectByName(`${a}-center`) || !!scene.getObjectByName(a))
      const haveB = !!b && (!!scene.getObjectByName(`${b}-center`) || !!scene.getObjectByName(b))
      if (haveA && haveB && httpsStep === -1 && !packetAnim.activeHop && selectedPhaseRef.current === 'HTTPS') {
        w.__HTTPS_FLOW_HAS_STARTED__ = true
        startHttpsStep(0)
        return true
      }
      return false
    }

    const poll = setInterval(() => { if (tryStart()) { clearInterval(poll as any) } }, 200)
    return () => { cancelled = true; if (poll) clearInterval(poll as any) }
  }, [scene, getHttpsSegments, httpsStep, packetAnim.activeHop, startHttpsStep, isFullyLoaded])
  
  // Get room dimensions from config or use defaults
  const roomStructure = config.roomStructure as RoomDescription['structure'] | undefined
  const roomDimensions = roomStructure?.dimensions || { width: 30, height: 9, depth: 24 }
  // Match DynamicRoomStructure scaling (1.5x width and depth)
  const widthScaleRS = 1.5
  const depthScaleRS = 1.5
  const roomDimsScaled = {
    width: roomDimensions.width * widthScaleRS,
    height: roomDimensions.height,
    depth: roomDimensions.depth * depthScaleRS,
  }
  
  // Get quality configuration for lighting
  const qualityConfig = qualityPresets[qualityPreset]

  // Built-in network zone labels (LAN/WAN) are rendered below.
  // For the VPN room, snap them to the true model centers (green-sphere anchors)
  // so they sit directly above firewall1 and misc1.
  const vpnZoneLabelsEnabled = config.id === 'vpn'
  const serviceProviderLabelEnabled = config.id === 'https'
  const zoneLabelY = 3.5 + 0.5

  // Small per-room tweaks requested for VPN:
  // - LAN: nudge toward west wall (negative X)
  // - WAN: raise slightly
  // - Remote User: show above Desktop
  const vpnLanOffsetX = -2.0
  const vpnWanExtraY = 0.6
  const vpnRemoteUserExtraY = 0.9

  const lanLabelRef = useRef<THREE.Group>(null)
  const wanLabelRef = useRef<THREE.Group>(null)
  const remoteUserLabelRef = useRef<THREE.Group>(null)
  const serviceProviderLabelRef = useRef<THREE.Group>(null)

  const lanAnchorRef = useRef<THREE.Object3D | null>(null)
  const wanAnchorRef = useRef<THREE.Object3D | null>(null)
  const remoteUserAnchorRef = useRef<THREE.Object3D | null>(null)
  const serviceProviderAnchorRef = useRef<THREE.Object3D | null>(null)

  const zoneTmpRef = useRef(new THREE.Vector3())
  const serviceProviderBoxRef = useRef(new THREE.Box3())

  useFrame(() => {
    if (!vpnZoneLabelsEnabled) return

    const apply = (
      label: THREE.Group | null,
      anchorName: string,
      cache: { current: THREE.Object3D | null },
      opts?: { offsetX?: number; extraY?: number }
    ) => {
      if (!label) return

      const anchor = cache.current || scene.getObjectByName(anchorName)
      if (!anchor) return
      cache.current = anchor

      // World-space center from the anchor (tracks the green sphere)
      anchor.getWorldPosition(zoneTmpRef.current)

      // Keep the same label height; allow per-label Y tweak
      zoneTmpRef.current.y = zoneLabelY + (opts?.extraY || 0)

      // Allow per-label X tweak (west is negative X)
      zoneTmpRef.current.x += (opts?.offsetX || 0)

      // Convert to parent-local space before applying
      if (label.parent) {
        label.parent.worldToLocal(zoneTmpRef.current)
      }
      label.position.copy(zoneTmpRef.current)
    }

    apply(lanLabelRef.current, 'firewall1-center', lanAnchorRef, { offsetX: vpnLanOffsetX })
    apply(wanLabelRef.current, 'misc1-center', wanAnchorRef, { extraY: vpnWanExtraY })

    // Remote User label: place above the east/south desktop
    apply(remoteUserLabelRef.current, 'desktop1-center', remoteUserAnchorRef, { extraY: vpnRemoteUserExtraY })

  })

  // HTTPS room: Service Provider label above the web server
  useFrame(() => {
    if (!serviceProviderLabelEnabled) return
    const label = serviceProviderLabelRef.current
    if (!label) return

    const target =
      serviceProviderAnchorRef.current ||
      scene.getObjectByName('web1') ||
      scene.getObjectByName('Web Server') ||
      scene.getObjectByName('web') ||
      scene.getObjectByName('web1-center')

    if (!target) return
    serviceProviderAnchorRef.current = target

    try { target.updateMatrixWorld(true) } catch {}

    // Compute world-space bounds and place label above the top of the object
    const box = serviceProviderBoxRef.current
    try { box.setFromObject(target) } catch { return }
    if (!isFinite(box.max.y)) return

    const p = box.getCenter(zoneTmpRef.current)
    p.y = box.max.y + 2.4

    // Convert to parent-local before applying
    if (label.parent) {
      label.parent.worldToLocal(p)
    }
    label.position.copy(p)
  })

  return (
    <QualityEnhancer preset={qualityPreset} enableAdaptiveQuality={false}>
      {/* Background color */}
      <color attach="background" args={[envCfg.background]} />
      
      {/* Bright room lighting for good visibility */}
      <ambientLight intensity={1.2} color="#ffffff" />
      <directionalLight 
        position={[10, 8, 5]} 
        intensity={1.8} 
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight 
        position={[-10, 8, -5]} 
        intensity={1.5} 
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight 
        position={[0, 10, 0]} 
        intensity={1.0} 
        color="#ffffff"
        castShadow={false}
      />
      
      {/* Disabled advanced lighting system to prevent excessive lights */}
      
      {/* Enhanced volumetric lighting for atmosphere */}
      {qualityPreset !== 'low' && qualityPreset !== 'potato' && (
        <>
          {/* Subtle volumetric effect from windows */}
          <VolumetricLight
            position={[-roomDimensions.width / 2 + 1, roomDimensions.height * 0.7, 0]}
            target={[roomDimensions.width / 2 - 1, 0, 0]}
            color={temperatureToRGB(5500)}
            intensity={0.15}
            particleCount={30}
            coneAngle={Math.PI / 8}
            distance={roomDimensions.width}
          />
          
          {/* Ceiling light volumetric effect */}
          <VolumetricLight
            position={[0, roomDimensions.height - 0.5, 0]}
            target={[0, 0, 0]}
            color={temperatureToRGB(4000)}
            intensity={0.1}
            particleCount={25}
            coneAngle={Math.PI / 3}
            distance={8}
          />
        </>
      )}
      
      {/* Build the room shell from JSON */}
      {!isolatePacket && <RoomStructure config={config} hiddenDecorIds={hiddenDecorIds} />}

      {/* VPN tunnel (visual only): Remote User → Internet → Firewall */}
      {!isolatePacket && isVpnRoom && (
        <VpnTunnel
          enabled={vpnActive}
          from="desktop1"
          via="earth1"
          to="firewall1"
          radius={0.42}
          lift={1.35}
          opacity={0.55}
          glowStrength={2.1}
          colorA="#3b82f6"
          colorB="#a855f7"
          flowSpeed={0.28}
          flowFrequency={5.0}
          buildSeconds={3.0}
          disintegrateSeconds={2.4}
          startYOffset={1.05}
          viaYOffset={1.55}
          endYOffset={0.95}
          // Move the "Encrypted" badge away from the Internet (earth) and closer to the firewall.
          encryptionBadgeU={0.78}
          encryptionBadgeText="Encrypted Tunnel"
          depthTest={true}
          renderOrder={2200}
        />
      )}

      {/* VPN room: passive eavesdropping simulation (Internet observer) */}
      {!isolatePacket && isVpnRoom && (
        <EavesdropperSimulation
          enabled={true}
          vpnActive={vpnActive}
          activeHop={packetAnim.activeHop?.config ?? null}
          roomObjects={config.objects}
        />
      )}

      {/* HTTPS room: attacker eavesdropping simulation (HTTP readable vs HTTPS encrypted) */}
      {!isolatePacket && isHttpsRoom && (
        <EavesdropperSimulation
          enabled={true}
          scenario="https"
          vpnActive={false}
          activeHop={packetAnim.activeHop?.config ?? null}
          roomObjects={config.objects}
          showToasts={false}
        />
      )}

      {/* HTTPS room: Web Server emits a short RX/TX summary when it receives/sends traffic */}
      {!isolatePacket && isHttpsRoom && (
        <WebServerEmitSimulation enabled={true} anchorName="web1-center" yOffset={1.55} eventName="webserver:emit" />
      )}

      {/* Firewall indicator (inspection ring + status light)
          - Used in /firewall and reused in /https for consistent UX
      */}
      {!isolatePacket && (isFirewallRoom || isHttpsRoom) && (
        <>
          <InspectionZone
            active={true}
            anchorName="firewall1-center"
            y={0.03}
            radius={2.25}
            ringWidth={0.28}
            color={
              firewallApproval === 'approved'
                ? '#22c55e'
                : firewallApproval === 'denied'
                  ? '#ef4444'
                  : '#e5e7eb'
            }
          />
          {/* Under-firewall status light (grey/green/red) */}
          <FirewallStatusLight state={firewallApproval} anchorName="firewall1-center" floorY={0.03} />
        </>
      )}

      {/* VPN room: Firewall pass/fail indicator
          - Neutral (grey/white) by default
          - Red when traffic is blocked at the firewall (VPN disabled)
          - Green when traffic is allowed through the firewall (VPN enabled)
      */}
      {!isolatePacket && isVpnRoom && (
        <InspectionZone
          active={true}
          anchorName="firewall1-center"
          y={0.03}
          radius={2.25}
          ringWidth={0.28}
          color={
            vpnFirewallApproval === 'approved'
              ? '#22c55e'
              : vpnFirewallApproval === 'denied'
                ? '#ef4444'
                : '#e5e7eb'
          }
        />
      )}


      {/* Network Packet UI - COMMENTED OUT */}
      {/* <PacketInRoom
        position={[0, 2.8, -5.5]}
        rotationY={0}
        editModeEnabled={editModeEnabled}
      /> */}

      {/**
       * DNS example (toggle for QA):
       *
       * <PacketInRoom
       *   position={[0, 1.6, -11.2]}
       *   rotationY={0}
       *   scale={0.8}
       *   id="pkt-3"
       *   type="DNS_RESPONSE"
       *   labelPrimary="DNS A"
       *   labelSecondary="google.com → 172.217.12.14"
       *   fields={{ protocol: "UDP" }}
       *   dns={{ qname: "google.com", qtype: "A", answers: [{ address: "172.217.12.14", ttl: 300 }] }}
       *   meta={{ ttlSeconds: 300, sizeBytes: 92, statusText: "OK" }}
       * />
       */}
      
      {/* Contact shadows disabled */}
      <ContactShadowsSystem 
        config={config} 
        qualityPreset={qualityPreset} 
        enabled={false} 
      />
      
      {/* Place models with enhanced materials */}
      {!isolatePacket && !skipBaseModels && config.objects.map((obj) => {
        const override: any = savedLayout?.[obj.id]
        // Skip rendering if this model has been marked as deleted in the saved layout overlay
        if (override && override.__deleted) return null

        // If there's no localStorage layout override, we can still restore using world-space hints
        // persisted into device metadata during /api/design/publish (helps with GLBs that have bad pivots).
        const parseVec3 = (v: any): [number, number, number] | undefined => {
          if (!Array.isArray(v) || v.length !== 3) return undefined
          const a = Number(v[0]); const b = Number(v[1]); const c = Number(v[2])
          if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return undefined
          return [a, b, c]
        }
        const parseQuat4 = (v: any): [number, number, number, number] | undefined => {
          if (!Array.isArray(v) || v.length !== 4) return undefined
          const a = Number(v[0]); const b = Number(v[1]); const c = Number(v[2]); const d = Number(v[3])
          if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return undefined
          return [a, b, c, d]
        }
        const meta: any = (obj as any).metadata || {}
        const metaWorldPosition = parseVec3(meta.worldPosition)
        const metaWorldQuaternion = parseQuat4(meta.worldQuaternion)
        const metaWorldScale = parseVec3(meta.worldScale)
        const metaWorldCenter = parseVec3(meta.worldCenter)
        
        // Hide any static inventory packet model; PacketHop handles packet visualization
        const modelNameLc = (obj as any).modelName ? String((obj as any).modelName).toLowerCase() : ''
        const isStaticPacket = modelNameLc.includes('inventory/') && modelNameLc.includes('network-packet')
        if (isStaticPacket) {
          if (process.env.NODE_ENV === 'development') {
            try { console.log('🚫 Hiding static inventory packet model in scene:', { id: obj.id, modelName: (obj as any).modelName }) } catch {}
          }
          return null
        }
        
        const pos = (override?.position as [number, number, number]) || obj.position
        const rot = (override?.rotation as [number, number, number]) || obj.rotation
        const scl = (override?.scale as any) ?? obj.scale

        const metaOverride = (!override && (metaWorldPosition || metaWorldQuaternion || metaWorldScale || metaWorldCenter))
          ? {
              position: pos,
              rotation: rot,
              scale: scl,
              worldPosition: metaWorldPosition,
              worldQuaternion: metaWorldQuaternion,
              worldScale: metaWorldScale,
              worldCenter: metaWorldCenter,
            }
          : undefined

        const effectiveOverride: any = override || metaOverride

        // Auto-assign labels for servers based on their order
        let customLabel = (obj as any).metadata?.title || override?.customLabel
        if (obj.modelName === 'inventory/servers/server' && !customLabel) {
          // Count which server this is (1st, 2nd, or 3rd)
          const serverObjects = config.objects.filter(o => 
            o.type === 'model' && o.modelName === 'inventory/servers/server'
          )
          const serverIndex = serverObjects.findIndex(s => s.id === obj.id)
          
          if (serverIndex === 0) {
            customLabel = 'DNS Server'
          } else if (serverIndex === 1) {
            customLabel = 'CDN Edge'
          } else if (serverIndex === 2) {
            customLabel = 'Web Server'
          } else {
            customLabel = `Server ${serverIndex + 1}`
          }
        }

        // Allow hiding labels via metadata/override; also force-hide the "Guy" model label.
        const modelNameLcForLabel = String((obj as any).modelName || '').toLowerCase()
        const customLabelLcForLabel = String(customLabel || '').trim().toLowerCase()
        const hideLabel = Boolean(
          (obj as any).metadata?.hideLabel ||
            override?.hideLabel ||
            customLabelLcForLabel === 'guy' ||
            modelNameLcForLabel.includes('inventory/misc/guy')
        )
        
        // Compute aliasName with semantic mapping for key servers (dns1, pki1, web1, cdn1); otherwise category-based fallback
        let aliasName: string | undefined
        {
          const title = customLabel
          const titleLc = String(title || '').toLowerCase()
          if (titleLc.includes('dns')) aliasName = 'dns1'
          else if (titleLc.includes('cdn')) aliasName = 'cdn1'
          else if (titleLc.includes('web')) aliasName = 'web1'
          // Fallback by category for first-of-kind anchors
          if (!aliasName) {
            let rawCat: any = (obj as any).metadata?.category || (obj as any).category || override?.category
            if (!rawCat && obj.modelName) {
              const p = String(obj.modelName).split('/')
              if (p.length > 1 && p[0] === 'inventory') rawCat = p[1]
            }
            if (rawCat) {
              const lc = String(rawCat).toLowerCase()
              let base = lc
              if (lc === 'switches') base = 'switch'
              else if (lc.endsWith('s')) base = lc.slice(0, -1)

              if (['desktop','laptop','server','router','switch','firewall','earth'].includes(base)) {
                const idLc = String(obj.id || '').toLowerCase()
                const alreadyCanonical =
                  base === 'server'
                    ? /^(?:server|dns|cdn|web|pki)\d+$/.test(idLc)
                    : new RegExp(`^${base}\\d+$`).test(idLc)

                if (!alreadyCanonical) {
                  aliasName = `${base}1`
                }
              }
            }
          }
        }
        // if (process.env.NODE_ENV === 'development' || restoreTrace) {
        //   try { console.log('🧩 RESTORE_MAP/base', { id: obj.id, modelName: obj.modelName, pos, rot, scl, override: !!override }) } catch {}
        // }
        return (
        obj.type === 'model' && obj.modelName ? (
          <InteractiveModel
            key={obj.id}
            id={obj.id}
            modelName={obj.modelName}
            position={pos}
            rotation={rot}
            scale={scl}
            quality={obj.quality || quality}
            enablePhysics={obj.physics?.enabled}
            editModeEnabled={editModeEnabled}
            onLoad={onLoad}
            onError={onError}
            savedOverride={effectiveOverride ? { 
              position: pos, 
              rotation: rot, 
              scale: scl,
              worldPosition: (effectiveOverride as any).worldPosition,
              worldQuaternion: (effectiveOverride as any).worldQuaternion,
              worldScale: (effectiveOverride as any).worldScale,
              worldCenter: (effectiveOverride as any).worldCenter,
            } : undefined}
            selected={selectedModelId === obj.id}
            onSelectedModelInfo={setSelectedModelInfo}
            roomDimensions={roomDimsScaled}
            showCenterDebug={showCenterDebug}
            restoreTrace={restoreTrace}
            onRestoreApplied={onRestoreApplied}
            restorePhase={restorePhase}
            aliasName={aliasName}
            hideLabel={hideLabel}
            roomId={config.id}
            deviceMeta={(obj as any).metadata}
            onModelClick={(id) => {
              if (setSelectedModelId) {
                // Toggle selection: if already selected, deselect; otherwise select
                const isDeselecting = selectedModelId === id
                setSelectedModelId(isDeselecting ? null : id)
                
                // Clear selectedModelInfo when deselecting
                if (isDeselecting && setSelectedModelInfo) {
                  setSelectedModelInfo(null)
                }
                
                console.log(`✅ MODEL: ${isDeselecting ? 'Deselected' : 'Selected'} model ${id}`)
              }
            }}
            onTransformChange={(pos, rot, scl, world) => {
              onLayoutChange?.({ 
                id: obj.id, 
                modelName: obj.modelName, 
                position: pos, 
                rotation: rot, 
                scale: scl,
                worldPosition: world?.position,
                worldQuaternion: world?.quaternion,
                worldScale: world?.scale,
                worldCenter: world?.center,
                category: (obj as any).metadata?.category,
                customLabel: customLabel,
              })
            }}
            category={(obj as any).metadata?.category || (obj as any).category || override?.category}
            customLabel={customLabel}
          />
        ) : null
      )})}

      {/* Render any saved items that are not part of the base config (e.g., inventory items from a previous session) */}
      {!isolatePacket && savedLayout && Object.values(savedLayout)
        .filter((entry: any) => !config.objects.some(o => o.id === entry.id) && !!(entry as any).modelName && !(entry as any).__deleted)
        .map((entry: any) => {
          // Skip any saved static packet models; PacketHop renders the moving packet
          try {
            const m = String((entry as any).modelName || '').toLowerCase()
            const isStaticPacket = (m.includes('inventory/') && (m.includes('network-packet') || m.includes('network_packet')))
            if (isStaticPacket) {
              if (process.env.NODE_ENV === 'development') {
                try { console.log('🚫 Hiding saved static packet entry:', { id: entry.id, modelName: entry.modelName }) } catch {}
              }
              return null
            }
          } catch {}
          // if (process.env.NODE_ENV === 'development' || restoreTrace) {
          //   try { console.log('🧩 RESTORE_MAP/overlay', { id: entry.id, modelName: entry.modelName, pos: entry.position, rot: entry.rotation, scl: entry.scale }) } catch {}
          // }
          
          // Auto-extract category from model path if not present (for backward compatibility)
          let category = (entry as any).category
          if (!category && entry.modelName) {
            const pathParts = entry.modelName.split('/')
            if (pathParts.length > 1 && pathParts[0] === 'inventory') {
              category = pathParts[1] // e.g., 'servers', 'routers', 'laptops'
            }
          }

          // Compute aliasName for first-of-category convenience (will refine by label below)
          let aliasName: string | undefined
          if (category) {
            const lc = String(category).toLowerCase()
            let base = lc
            if (lc === 'switches') base = 'switch'
            else if (lc.endsWith('s')) base = lc.slice(0, -1)
            if (['desktop','laptop','server','router','switch','firewall','earth'].includes(base)) {
              aliasName = `${base}1`
            }
          }
          
          // Auto-assign labels for servers based on order in saved layout
          let customLabel = (entry as any).customLabel
          if (entry.modelName === 'inventory/servers/server' && !customLabel) {
            // Get all server entries from saved layout
            const allEntries = Object.values(savedLayout || {})
            const serverEntries = allEntries.filter((e: any) => 
              e.modelName === 'inventory/servers/server' && !e.__deleted
            )
            const serverIndex = serverEntries.findIndex((s: any) => s.id === entry.id)
            
            if (serverIndex === 0) {
              customLabel = 'DNS Server'
            } else if (serverIndex === 1) {
              customLabel = 'CDN Edge'
            } else if (serverIndex === 2) {
              customLabel = 'Web Server'
            } else {
              customLabel = `Server ${serverIndex + 1}`
            }
          }

          // Allow hiding labels via entry.hideLabel; also force-hide the "Guy" model label.
          const modelNameLcForLabel = String((entry as any).modelName || '').toLowerCase()
          const customLabelLcForLabel = String(customLabel || '').trim().toLowerCase()
          const hideLabel = Boolean(
            (entry as any).hideLabel ||
              customLabelLcForLabel === 'guy' ||
              modelNameLcForLabel.includes('inventory/misc/guy')
          )
          
          // Refine aliasName based on customLabel semantics when available
          try {
            const lc = String(customLabel || '').toLowerCase()
            if (lc.includes('dns')) aliasName = 'dns1'
            else if (lc.includes('cdn')) aliasName = 'cdn1'
            else if (lc.includes('web')) aliasName = 'web1'
          } catch {}
          
          return (
          <InteractiveModel
            key={entry.id}
            id={entry.id}
            modelName={entry.modelName}
            position={entry.position as [number, number, number]}
            aliasName={aliasName}
            hideLabel={hideLabel}
            roomId={config.id}
            savedOverride={{ 
              position: entry.position as [number, number, number], 
              rotation: entry.rotation as any, 
              scale: entry.scale,
              worldPosition: (entry as any).worldPosition,
              worldQuaternion: (entry as any).worldQuaternion,
              worldScale: (entry as any).worldScale,
              worldCenter: (entry as any).worldCenter,
            }}
            rotation={(entry.rotation as [number, number, number]) || [0,0,0]}
            scale={entry.scale ?? 1}
            quality={quality}
            enablePhysics={false}
            editModeEnabled={editModeEnabled}
            onLoad={onLoad}
            onError={onError}
            selected={selectedModelId === entry.id}
            onSelectedModelInfo={setSelectedModelInfo}
            roomDimensions={roomDimsScaled}
            showCenterDebug={showCenterDebug}
            restoreTrace={restoreTrace}
            onRestoreApplied={onRestoreApplied}
            // Ensure no auto-scaling for restored saved-only entries
            // (visual scale comes from saved layout)
            // Passed down into OptimizedModel via InteractiveModel props
            onModelClick={(id) => {
              if (setSelectedModelId) {
                const isDeselecting = selectedModelId === id
                setSelectedModelId(isDeselecting ? null : id)
                if (isDeselecting && setSelectedModelInfo) setSelectedModelInfo(null)
                console.log(`✅ MODEL: ${isDeselecting ? 'Deselected' : 'Selected'} model ${id}`)
              }
            }}
            onTransformChange={(pos, rot, scl, world) => {
              onLayoutChange?.({ 
                id: entry.id, 
                modelName: entry.modelName, 
                position: pos, 
                rotation: rot, 
                scale: scl,
                worldPosition: world?.position,
                worldQuaternion: world?.quaternion,
                worldScale: world?.scale,
                worldCenter: world?.center,
                category: category,
                customLabel: customLabel,
              })
            }}
            category={category}
            customLabel={customLabel}
          />
        )})}
      
      {/* Flow DSL overlays: render path segments as dashed glowy lines for each flow */}
      {flows.map((flow) => (
        <group key={`flow-lines-${flow.id}`}>
          {flow.path.slice(0, -1).map((from, i) => {
            const to = flow.path[i + 1]
            const color = flow.style?.color || '#22d3ee'
            return (
              <NetworkLine
                key={`flow-line-${flow.id}-${i}`}
                from={from}
                to={to}
                color={color}
                dashed={true}
                pulse={true}
                visible={flowPlaybackEnabled}
              />
            )
          })}
        </group>
      ))}

      {/* Network line between endpoints (static), pulses while a hop is active.
          Skip for VPN tunnel segments so only the tunnel visual is shown. */}
      {lineFrom && lineTo && (() => {
        const tunnelNodes = new Set(['desktop1','earth1','firewall1'])
        const hideLine = isVpnRoom && vpnActive && tunnelNodes.has(lineFrom) && tunnelNodes.has(lineTo)
        if (hideLine) return null
        return (
          <NetworkLine 
            from={lineFrom} 
            to={lineTo} 
            color="#3b82f6" 
            dashed={false}
            pulse={!!packetAnim.activeHop}
            visible={!!packetAnim.activeHop}
          />
        )
      })()}

      {/* Flow DSL simple sequencer (optional) - only runs when explicitly enabled to avoid interfering with demos */}
      {flows.map((flow) => (
        <FlowRunner
          key={`flow-runner-${flow.id}`}
          flow={flow}
          disabled={isolatePacket || !!packetAnim.activeHop || dnsStep >= 0 || pkiStep >= 0 || httpsStep >= 0}
        />
      ))}
      
      {/* Isolated anchors for packet testing */}
      {isolatePacket && (
        <>
          <group name="isolateStart-center" position={[-8, 1.2, 0]} />
          <group name="isolateEnd-center" position={[8, 1.2, 0]} />
        </>
      )}

      {/* Active packet hop animation */}
      {packetAnim.activeHop && (
        <PacketHop
          key={packetAnim.activeHop.config.packetId}
          packetMeta={{
            id: packetAnim.activeHop.config.packetId,
            label: packetAnim.activeHop.config.label,
            protocol: packetAnim.activeHop.config.protocol,
            encrypted: packetAnim.activeHop.config.encrypted,
          }}
          fromAnchor={isolatePacket ? 'isolateStart' : packetAnim.activeHop.config.fromAnchor}
          toAnchor={isolatePacket ? 'isolateEnd' : packetAnim.activeHop.config.toAnchor}
          pathPointsOverride={packetAnim.activeHop.config.pathPointsOverride}
          travelSeconds={packetAnim.activeHop.config.travelSeconds}
          easing={packetAnim.activeHop.config.easing}
          holdSeconds={packetAnim.activeHop.config.holdSeconds}
          holdUntilEvent={packetAnim.activeHop.config.holdUntilEvent}
          holdCompleteEvent={packetAnim.activeHop.config.holdCompleteEvent}
          inspectChips={packetAnim.activeHop.config.inspectChips}
          startOffsetTowardAnchor={packetAnim.activeHop.config.startOffsetTowardAnchor}
          startOffsetDistance={packetAnim.activeHop.config.startOffsetDistance}
          startYOffset={packetAnim.activeHop.config.startYOffset}
          endOffsetTowardAnchor={packetAnim.activeHop.config.endOffsetTowardAnchor}
          endOffsetDistance={packetAnim.activeHop.config.endOffsetDistance}
          endYOffset={packetAnim.activeHop.config.endYOffset}
          showLabel={packetAnim.activeHop.config.showLabel}
          onLaunch={(meta) => {
            // HTTPS room: always show a green "pass" effect at the firewall (no rules configuration in this lesson).
            // Trigger the green ring/light any time a hop touches the firewall.
            try {
              if (isHttpsRoom) {
                const cfg = packetAnim.activeHop?.config
                const touchesFirewall = cfg?.fromAnchor === 'firewall1' || cfg?.toAnchor === 'firewall1'
                if (touchesFirewall) {
                  try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
                  approvalTimeoutRef.current = null
                  setFirewallApproval('approved')
                  approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 3000)
                }

                // Web server TX emit: when the hop starts from the server
                const isServerTx = cfg?.fromAnchor === 'web1' || cfg?.fromAnchor === 'server1'
                if (isServerTx) {
                  const phase = (selectedPhaseRef.current || 'DNS') as any
                  const detail = buildHttpsWebServerEmit('tx', phase, cfg)
                  try { window.dispatchEvent(new CustomEvent('webserver:emit', { detail })) } catch {}
                }
              }
            } catch {}

            // Firewall room: keep the green "approved" ring visible long enough to notice,
            // then revert back to the default color.
            try {
              if (isFirewallRoom && firewallApproval === 'approved') {
                const cfg = packetAnim.activeHop?.config
                if (cfg?.fromAnchor === 'firewall1' && (cfg?.toAnchor === 'earth1' || cfg?.toAnchor === 'router1')) {
                  try { if (approvalTimeoutRef.current) clearTimeout(approvalTimeoutRef.current) } catch {}
                  approvalTimeoutRef.current = setTimeout(() => setFirewallApproval('none'), 3000)
                }
              }
            } catch {}

            // VPN room: when traffic *leaves* the firewall into the LAN, show green briefly.
            try {
              if (isVpnRoom) {
                const cfg = packetAnim.activeHop?.config
                if (cfg?.fromAnchor === 'firewall1' && cfg?.toAnchor === 'router1' && vpnActive) {
                  try { if (vpnApprovalTimeoutRef.current) clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
                  setVpnFirewallApproval('approved')
                  vpnApprovalTimeoutRef.current = setTimeout(() => setVpnFirewallApproval('none'), 3000)
                }
              }
            } catch {}

            packetAnim.handleLaunch(meta)
          }}
          onPause={packetAnim.handlePause}
          onResume={packetAnim.handleResume}
          onArrival={(meta) => {
            // Snapshot config before PacketAnimation clears it
            const cfgSnap = (() => {
              try { return packetAnim.activeHop?.config } catch { return null }
            })()

            // HTTPS room: (web server RX is emitted on packet:holdStart so it fires immediately when the packet reaches web1)

            // HTTPS room: when the HTTP (plaintext) demo finishes and the response returns to the LAN Desktop,
            // show an educational message panel explaining why HTTP is insecure and what to do next.
            try {
              if (isHttpsRoom && selectedPhaseRef.current === 'DNS') {
                const cfg = cfgSnap as any
                const pid = String((meta as any)?.id || '')
                const isHttpFlowPacket = pid.startsWith('dns-')
                const isReturnToDesktop = cfg?.fromAnchor === 'switch1' && cfg?.toAnchor === 'desktop1'
                if (isHttpFlowPacket && isReturnToDesktop) {
                  try { window.dispatchEvent(new CustomEvent('https:http:complete')) } catch {}
                }
              }
            } catch {}

            // HTTPS room: when the TLS handshake (PKI) demo finishes and the response returns to the LAN Desktop,
            // automatically open the Fix HTTPS panel (only if HTTPS is still broken).
            try {
              if (isHttpsRoom && selectedPhaseRef.current === 'PKI') {
                const cfg = cfgSnap as any
                const pid = String((meta as any)?.id || '')
                const isTlsFlowPacket = pid.startsWith('tls-')
                const isReturnToDesktop = cfg?.fromAnchor === 'switch1' && cfg?.toAnchor === 'desktop1'
                const httpsOk = (() => {
                  try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
                })()
                if (isTlsFlowPacket && isReturnToDesktop) {
                  // Signal mission completion / UI hooks.
                  try { window.dispatchEvent(new CustomEvent('https:tls:complete')) } catch {}

                  // If still broken, guide the learner into the Troubleshooter.
                  if (!httpsOk) {
                    try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                  }
                }
              }
            } catch {}

            // HTTPS room: when the HTTPS (encrypted application data) demo finishes and the response returns
            // to the LAN Desktop, show a success panel.
            try {
              if (isHttpsRoom && selectedPhaseRef.current === 'HTTPS') {
                const cfg = cfgSnap as any
                const pid = String((meta as any)?.id || '')
                const isHttpsFlowPacket = pid.startsWith('https-')
                const isReturnToDesktop = cfg?.fromAnchor === 'switch1' && cfg?.toAnchor === 'desktop1'
                if (isHttpsFlowPacket && isReturnToDesktop) {
                  try { window.dispatchEvent(new CustomEvent('https:https:complete')) } catch {}
                }
              }
            } catch {}

            // VPN room: if traffic arrives at the firewall while VPN is disabled, show red briefly.
            // (In the VPN room's No VPN phase, traffic stops at the firewall.)
            try {
              if (isVpnRoom) {
                const cfg = cfgSnap
                if (cfg?.toAnchor === 'firewall1' && !vpnActive) {
                  try { if (vpnApprovalTimeoutRef.current) clearTimeout(vpnApprovalTimeoutRef.current) } catch {}
                  setVpnFirewallApproval('denied')
                  vpnApprovalTimeoutRef.current = setTimeout(() => setVpnFirewallApproval('none'), 5000)

                  // If this was the WAN→Firewall inspection hop, trigger VPN education panel.
                  if (cfg?.fromAnchor === 'earth1' && cfg?.toAnchor === 'firewall1') {
                    try {
                      onVpnBlocked?.({
                        srcIp: '203.0.113.25',
                        dstIp: '198.51.100.10',
                        protocol: 'TCP',
                        port: 443,
                        reason: 'VPN is disabled — firewall will not forward public Internet traffic directly into the LAN.',
                      })
                    } catch {}
                  }
                }

              }
            } catch {}

            // Normal packet animation cleanup
            packetAnim.handleArrival(meta)

            // Attack simulation: chain hops (desktop2 → earth1 → firewall1 → ...)
            try {
              if (typeof meta?.id === 'string' && meta.id.startsWith('attack-')) {
                try { currentFlowRef.current = null } catch {}
                advanceAttackStepRef.current()
                return
              }
            } catch {}

            // Notify FlowRunner (phase-driven) using current marker or by parsing packetId fallback
            let flowId: string | null = null
            let index: number | null = null
            const cur = currentFlowRef.current
            if (cur) { flowId = cur.flowId; index = cur.index }
            else if (typeof meta?.id === 'string' && meta.id.startsWith('phaseflow-')) {
              // Parse: phaseflow-<flowId>-<index>
              const m = meta.id.match(/^phaseflow-(.+)-(\d+)$/)
              if (m) { flowId = m[1]; index = Number(m[2]) }
            }
            if (flowId != null && index != null) {
              try { window.dispatchEvent(new CustomEvent('flow:segment-arrival', { detail: { flowId, index, packetId: meta.id } })) } catch {}
              // Clear current segment marker
              currentFlowRef.current = null
            }
          }}
        />
      )}
      
      {/* Port indicators showing which physical ports packets use */}
      <PortIndicatorManager
        fromAnchor={packetAnim.activeHop?.config.fromAnchor}
        toAnchor={packetAnim.activeHop?.config.toAnchor}
        isActive={!!packetAnim.activeHop}
      />

      {/* WAN label (VPN: snaps above misc1 center; otherwise stays near west wall) */}
      <group ref={wanLabelRef} position={[-roomDimsScaled.width / 2 + 9.0, zoneLabelY, -9.0]}>
        <Billboard follow>
          <group>
            {/* Border "pill" */}
            <RoundedBox
              args={[2.55, 1.15, 0.05]}
              radius={0.18}
              smoothness={6}
              position={[0, 0, -0.08]}
              renderOrder={10}
            >
              <meshBasicMaterial
                color="#3b82f6"
                transparent
                opacity={0.35}
                depthTest={false}
                depthWrite={false}
              />
            </RoundedBox>

            {/* Dark backplate */}
            <RoundedBox
              args={[2.4, 1.0, 0.05]}
              radius={0.16}
              smoothness={6}
              position={[0, 0, -0.06]}
              renderOrder={11}
            >
              <meshBasicMaterial
                color="#0b1220"
                transparent
                opacity={0.7}
                depthTest={false}
                depthWrite={false}
              />
            </RoundedBox>

            <Text
              position={[0, 0, 0.02]}
              fontSize={0.7777778}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000"
              material-depthTest={false}
              material-depthWrite={false}
              material-transparent
              material-toneMapped={false}
              renderOrder={12}
            >
              WAN
            </Text>
          </group>
        </Billboard>
      </group>

      {/* LAN label (VPN: snaps above firewall1 center; otherwise stays mid-south) */}
      <group ref={lanLabelRef} position={[0, zoneLabelY, roomDimsScaled.depth / 4]}>
        <Billboard follow>
          <group>
            {/* Border "pill" */}
            <RoundedBox
              args={[2.55, 1.15, 0.05]}
              radius={0.18}
              smoothness={6}
              position={[0, 0, -0.08]}
              renderOrder={10}
            >
              <meshBasicMaterial
                color="#22c55e"
                transparent
                opacity={0.35}
                depthTest={false}
                depthWrite={false}
              />
            </RoundedBox>

            {/* Dark backplate */}
            <RoundedBox
              args={[2.4, 1.0, 0.05]}
              radius={0.16}
              smoothness={6}
              position={[0, 0, -0.06]}
              renderOrder={11}
            >
              <meshBasicMaterial
                color="#0b1220"
                transparent
                opacity={0.7}
                depthTest={false}
                depthWrite={false}
              />
            </RoundedBox>

            <Text
              position={[0, 0, 0.02]}
              fontSize={0.7777778}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000"
              material-depthTest={false}
              material-depthWrite={false}
              material-transparent
              material-toneMapped={false}
              renderOrder={12}
            >
              LAN
            </Text>
          </group>
        </Billboard>
      </group>

      {/* Service Provider label (HTTPS only): sits above the Web Server */}
      {serviceProviderLabelEnabled && (
        <group ref={serviceProviderLabelRef} position={[0, zoneLabelY, 0]}>
          <Billboard follow>
            <group>
              {/* Border "pill" */}
              <RoundedBox
                args={[6.2, 1.15, 0.05]}
                radius={0.18}
                smoothness={6}
                position={[0, 0, -0.08]}
                renderOrder={10}
              >
                <meshBasicMaterial
                  color="#3b82f6"
                  transparent
                  opacity={0.35}
                  depthTest={false}
                  depthWrite={false}
                />
              </RoundedBox>

              {/* Dark backplate */}
              <RoundedBox
                args={[6.0, 1.0, 0.05]}
                radius={0.16}
                smoothness={6}
                position={[0, 0, -0.06]}
                renderOrder={11}
              >
                <meshBasicMaterial
                  color="#0b1220"
                  transparent
                  opacity={0.7}
                  depthTest={false}
                  depthWrite={false}
                />
              </RoundedBox>

              <Text
                position={[0, 0, 0.02]}
                fontSize={0.62}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000"
                material-depthTest={false}
                material-depthWrite={false}
                material-transparent
                material-toneMapped={false}
                renderOrder={12}
              >
                Service Provider
              </Text>
            </group>
          </Billboard>
        </group>
      )}

      {/* Remote User label (VPN only): snaps above Desktop center */}
      {vpnZoneLabelsEnabled && (
        <group ref={remoteUserLabelRef} position={[0, zoneLabelY + vpnRemoteUserExtraY, 0]}>
          <Billboard follow>
            <group>
              <RoundedBox
                args={[4.25, 1.15, 0.05]}
                radius={0.18}
                smoothness={6}
                position={[0, 0, -0.08]}
                renderOrder={10}
              >
                <meshBasicMaterial
                  color="#a855f7"
                  transparent
                  opacity={0.35}
                  depthTest={false}
                  depthWrite={false}
                />
              </RoundedBox>
              <RoundedBox
                args={[4.05, 1.0, 0.05]}
                radius={0.16}
                smoothness={6}
                position={[0, 0, -0.06]}
                renderOrder={11}
              >
                <meshBasicMaterial
                  color="#0b1220"
                  transparent
                  opacity={0.7}
                  depthTest={false}
                  depthWrite={false}
                />
              </RoundedBox>
              <Text
                position={[0, 0, 0.02]}
                fontSize={0.62}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000"
                material-depthTest={false}
                material-depthWrite={false}
                material-transparent
                material-toneMapped={false}
                renderOrder={12}
              >
                Remote User
              </Text>
            </group>
          </Billboard>
        </group>
      )}

      {onPerformanceUpdate && (
        <ScenePerformanceMonitor onPerformanceUpdate={onPerformanceUpdate} />
      )}

      {/* Simple Phase HUD banner (optional) */}
      {phasesEnabled && phaseHudText && (
        <Html center position={[0, 0, 0]}>
          <div style={{
            position: 'fixed',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2100,
            background: 'rgba(2, 6, 23, 0.88)',
            color: '#e5e7eb',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            padding: '12px 14px',
            borderRadius: 14,
            maxWidth: 560,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
          }}>
            {phaseHudText}
          </div>
        </Html>
      )}

    </QualityEnhancer>
  )
}



// Room info panel
function RoomInfo({ config, progress, errors }: { 
  config: RoomConfig
  progress: number
  errors: Record<string, string>
}) {
  const [showInfo, setShowInfo] = useState(false)
  const errorCount = Object.keys(errors).length
  
  return (
    <div className="absolute top-4 left-4 z-10">
      <button
        onClick={() => setShowInfo(!showInfo)}
        className="bg-black/50 text-white px-3 py-2 rounded backdrop-blur-sm hover:bg-black/70 transition-colors"
      >
        {showInfo ? 'Hide' : 'Show'} Room Info
      </button>
      
      {showInfo && (
        <div className="mt-2 bg-black/80 text-white p-4 rounded backdrop-blur-sm max-w-md">
          <h3 className="font-bold mb-2">{config.name}</h3>
          {config.description && (
            <p className="text-sm text-gray-300 mb-3">{config.description}</p>
          )}
          
          <div className="space-y-2 text-sm">
            <div>Models: {config.objects.length}</div>
            <div>Loading: {progress}%</div>
            {errorCount > 0 && (
              <div className="text-red-400">Errors: {errorCount}</div>
            )}
          </div>
          
          <div className="mt-3 text-xs text-gray-400">
            <p>💡 Click on models to learn more</p>
            <p>🖱️ Click anywhere to lock mouse and look around</p>
            <p>⌨️ Use WASD or arrow keys to walk</p>
            <p>⎋ Press Escape to unlock mouse</p>
          </div>
        </div>
      )}
    </div>
  )
}

// First-person controls with keyboard turning and mouse look
function FirstPersonControls({ config }: { config: RoomConfig }) {
  const { camera, gl } = useThree()
  const velocityRef = useRef(new THREE.Vector3())
  const directionRef = useRef(new THREE.Vector3())
  const jumpVelocityRef = useRef(0)
  const isGroundedRef = useRef(true)
  const keysRef = useRef({
    forward: false,
    backward: false,
    turnLeft: false,
    turnRight: false,
    shift: false,
    space: false
  })
  // Movement debug instrumentation
  const DEBUG_MOVEMENT = true
  const frameRef = useRef(0)
  const prevPosRef = useRef(new THREE.Vector3())
  const prevYawRef = useRef(0)
  const prevPitchRef = useRef(0)
  const prevStepRef = useRef(0)
  const tmpPosBeforeRef = useRef(new THREE.Vector3())
  const tmpNewPosRef = useRef(new THREE.Vector3())

  // Movement settings
  const moveSpeed = 8.0 // Units per second
  const sprintMultiplier = 2.0
  const jumpHeight = 8.0 // Jump force
  const gravity = -20.0 // Gravity force
  const groundLevel = 1.8 // Eye level when standing on ground (slightly taller)

  // Handle keyboard input
  useEffect(() => {
    const shouldBlockMovement = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const active = (typeof document !== 'undefined') ? (document.activeElement as HTMLElement | null) : null
      const el = target || active
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      // If focused inside our TypePicker dropdown, block movement
      if (el.closest && (el.closest('#type-picker-dropdown') || el.closest('#protocol-picker-dropdown') || el.closest('#flag-picker-dropdown') || el.closest('#encrypted-picker-dropdown') || el.closest('[role="textbox"]') || el.closest('[contenteditable="true"]'))) return true
      return false
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldBlockMovement(event)) return
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.backward = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.turnLeft = true
          break
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.turnRight = true
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keysRef.current.shift = true
          break
        case 'Space':
          event.preventDefault() // Prevent page scroll
          keysRef.current.space = true
          break
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (shouldBlockMovement(event)) return
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.backward = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.turnLeft = false
          break
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.turnRight = false
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keysRef.current.shift = false
          break
        case 'Space':
          keysRef.current.space = false
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Track camera rotation for keyboard turning and mouse look
  const cameraRotationRef = useRef({ x: 0, y: 0 }) // X = pitch (up/down), Y = yaw (left/right)
  const turnSpeed = 2.0 // Radians per second
  const mouseSensitivity = 0.002 // Mouse sensitivity
  const maxPitch = Math.PI / 2.1 // Limit looking up/down

  // Mouse look state
  const isMouseDraggedRef = useRef(false)
  const lastMousePositionRef = useRef({ x: 0, y: 0 })
  
  // Handle mouse look controls
  useEffect(() => {
    let isMouseDown = false
    let hasMovedSinceDrag = false

    // WebGL context loss diagnostics
    const canvasEl = gl.domElement as HTMLCanvasElement
    const onContextLost = (e: any) => {
      console.warn('GL_CTX_LOST', { ts: Date.now() }); try { e?.preventDefault?.() } catch {}
    }
    const onContextRestored = () => {
      console.warn('GL_CTX_RESTORED', { ts: Date.now() })
    }
    canvasEl.addEventListener('webglcontextlost', onContextLost as any, false)
    canvasEl.addEventListener('webglcontextrestored', onContextRestored as any, false)
    
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return // Only left mouse button
      
      // Respect global gizmo state to avoid fighting with handle interactions
      const globalState = (typeof window !== 'undefined') ? (window as any).globalGizmoState : undefined
      const isDraggingGizmo = !!globalState?.isDragging // Only block when actually dragging
      
      // Debug mouse events
      if (false) console.log(`🔄 MOUSE DOWN: Button ${e.button}, Target: ${(e.target as HTMLElement)?.tagName}, globalState: ${!!globalState}`)
      
      // If gizmo is actively dragging, don't start camera rotation
      if (isDraggingGizmo) {
        console.log('🚫 MOUSE: Camera rotation blocked by gizmo state')
        return
      }
      
      const target = e.target as HTMLElement
      const isCanvas = target.tagName === 'CANVAS'
      
      if (!isCanvas) return
      
      isMouseDown = true
      hasMovedSinceDrag = false
      lastMousePositionRef.current = { x: e.clientX, y: e.clientY }
      document.body.style.cursor = 'grabbing'
    }
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return
      
      // Respect global gizmo state to avoid fighting with handle interactions
      const globalState = (typeof window !== 'undefined') ? (window as any).globalGizmoState : undefined
      const isDraggingGizmo = !!globalState?.isDragging // Only block when actually dragging
      
      // Debug mouse movement
      if (hasMovedSinceDrag && Math.random() < 0.01) { // Log 1% of moves to avoid spam
        console.log(`🔄 MOUSE MOVE: Delta [${e.clientX - lastMousePositionRef.current.x}, ${e.clientY - lastMousePositionRef.current.y}], isMouseDown: ${isMouseDown}`)
      }
      
      // If gizmo is actively dragging, disable mouse look
      if (isDraggingGizmo) {
        console.log('🚫 MOUSE: Mouse look disabled by gizmo state')
        return
      }
      
      hasMovedSinceDrag = true
      
      const deltaX = e.clientX - lastMousePositionRef.current.x
      const deltaY = e.clientY - lastMousePositionRef.current.y
      
      // Apply mouse look with sensitivity
      const oldRotationY = cameraRotationRef.current.y
      const oldRotationX = cameraRotationRef.current.x
      
      cameraRotationRef.current.y -= deltaX * mouseSensitivity
      cameraRotationRef.current.x -= deltaY * mouseSensitivity
      
      // Clamp pitch to prevent flipping
      cameraRotationRef.current.x = Math.max(-maxPitch, Math.min(maxPitch, cameraRotationRef.current.x))
      
      // Debug large rotation jumps
      const rotationYDelta = Math.abs(cameraRotationRef.current.y - oldRotationY)
      const rotationXDelta = Math.abs(cameraRotationRef.current.x - oldRotationX)
      
      if (false && (rotationYDelta > 0.1 || rotationXDelta > 0.1)) {
        console.log(`⚠️ CAMERA JUMP: Large rotation change detected - Y: ${(rotationYDelta * 180 / Math.PI).toFixed(1)}°, X: ${(rotationXDelta * 180 / Math.PI).toFixed(1)}°`)
        console.log(`⚠️ CAMERA JUMP: Mouse delta [${deltaX}, ${deltaY}], Sensitivity: ${mouseSensitivity}`)
      }
      
      lastMousePositionRef.current = { x: e.clientX, y: e.clientY }
    }
    
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && isMouseDown) {
        isMouseDown = false
        document.body.style.cursor = 'auto'
      }
    }
    
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault() // Prevent right-click context menu
    }
    
    const canvas = gl.domElement
    canvas.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('contextmenu', handleContextMenu)
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('contextmenu', handleContextMenu)
      canvasEl.removeEventListener('webglcontextlost', onContextLost as any, false)
      canvasEl.removeEventListener('webglcontextrestored', onContextRestored as any, false)
    }
  }, [gl])
  
  // Emergency cleanup: reset stuck gizmo state if dragging without recent activity
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined') {
        const gs = (window as any).globalGizmoState || {}
        const last = Number(gs.lastActivity || 0)
        const stale = Date.now() - last > 1500
        if (gs.isDragging && stale) {
          console.warn('🚨 Emergency gizmo state reset (stale isDragging)')
          ;(window as any).globalGizmoState = { ...gs, isDragging: false, isHovering: false, lastActivity: Date.now() }
        }
      }
    }, 800)
    return () => clearInterval(interval)
  }, [])

  // Update movement and camera rotation every frame
  useFrame((state, delta) => {
    // Check global gizmo state - disable camera controls during gizmo drag only
    const globalState = (typeof window !== 'undefined') ? (window as any).globalGizmoState : undefined
    const isDraggingGizmo = !!globalState?.isDragging // Only block when actually dragging
    
    // Debug: Log camera movement frame info
    const frameCount = Math.floor(state.clock.elapsedTime * 60) // Approximate frame number
    if (false) {
      console.log(`🎬 CAMERA FRAME: #${frameCount} - Position: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}], Rotation: [${(cameraRotationRef.current.x * 180 / Math.PI).toFixed(1)}°, ${(cameraRotationRef.current.y * 180 / Math.PI).toFixed(1)}°]`)
      console.log(`🎬 CAMERA STATE: globalState exists: ${!!globalState}, isDragging: ${globalState?.isDragging}, isHovering: ${globalState?.isHovering}`)
    }
    
    // If gizmo is actively dragging, disable all camera controls
    if (isDraggingGizmo) {
      console.log('🚫 CAMERA: Movement disabled - gizmo interaction')
      return
    }
    
    const keys = keysRef.current
    const velocity = velocityRef.current
    const direction = directionRef.current

    // Use a clamped delta to avoid big per-frame jumps on hitches
    const rawDt = delta
    const dt = Math.min(delta, 1/60 * 1.5)

    // Handle jumping
    if (keys.space && isGroundedRef.current) {
      jumpVelocityRef.current = jumpHeight
      isGroundedRef.current = false
    }
    
    // Apply gravity and jump velocity (using clamped dt)
    jumpVelocityRef.current += gravity * dt
    const currentY = camera.position.y
    const newY = currentY + jumpVelocityRef.current * dt
    
    // Check if landing
    if (newY <= groundLevel) {
      camera.position.y = groundLevel
      jumpVelocityRef.current = 0
      isGroundedRef.current = true
    } else {
      camera.position.y = newY
    }

    // Handle keyboard turning
    // Keyboard turning with clamped per-frame step
    const yawStep = Math.min(turnSpeed * dt, 0.06) // cap ~3.4° per frame
    if (keys.turnLeft) {
      cameraRotationRef.current.y += yawStep
    }
    if (keys.turnRight) {
      cameraRotationRef.current.y -= yawStep
    }
    
    // Apply camera rotation
    camera.rotation.set(
      cameraRotationRef.current.x,
      cameraRotationRef.current.y,
      0,
      'YXZ'
    )

    // Reset horizontal velocity
    velocity.set(0, 0, 0)

    // Calculate movement direction based on camera orientation
    if (keys.forward) {
      direction.set(0, 0, -1).applyQuaternion(camera.quaternion)
      direction.y = 0 // Don't move up/down when walking forward
      direction.normalize()
      velocity.add(direction)
    }
    if (keys.backward) {
      direction.set(0, 0, 1).applyQuaternion(camera.quaternion)
      direction.y = 0 // Don't move up/down when walking backward
      direction.normalize()
      velocity.add(direction)
    }

    // Normalize and apply speed
    if (velocity.length() > 0) {
      velocity.normalize()
      const speed = keys.shift ? moveSpeed * sprintMultiplier : moveSpeed
      velocity.multiplyScalar(speed * dt)
      
      // Apply horizontal movement only (avoid allocations in the hot path)
      const posBefore = tmpPosBeforeRef.current.copy(camera.position)
      const newPosition = tmpNewPosRef.current.copy(camera.position).add(velocity)
      if (isGroundedRef.current) {
        newPosition.y = groundLevel
      } else {
        newPosition.y = camera.position.y // Keep current Y position while jumping
      }
      
      // Boundary checking against NEW wall positions (scaled room dims)
      const rs: any = (config as any).roomStructure || {}
      const dims = rs.dimensions || { width: 30, height: 9, depth: 24 }
      const widthScale = 1.5
      const depthScale = 1.5
      const margin = 0.45 // keep camera slightly away from walls
      const halfX = Math.max(0, (dims.width * widthScale) / 2 - margin)
      const halfZ = Math.max(0, (dims.depth * depthScale) / 2 - margin)
      newPosition.x = Math.max(-halfX, Math.min(halfX, newPosition.x))
      newPosition.z = Math.max(-halfZ, Math.min(halfZ, newPosition.z))
      
      camera.position.copy(newPosition)

      // Movement debug
      if (DEBUG_MOVEMENT) {
        const frame = ++frameRef.current
        const step = newPosition.distanceTo(posBefore)
        const yaw = cameraRotationRef.current.y
        const pitch = cameraRotationRef.current.x
        const yawDelta = yaw - prevYawRef.current
        const pitchDelta = pitch - prevPitchRef.current
        const expected = (keys.forward || keys.backward) ? (speed * dt) : 0
        const stepDelta = Math.abs(step - prevStepRef.current)
        const anomaly = (Math.abs(yawDelta) > 0.2) || (step > expected * 1.8 && expected > 0) || (stepDelta > expected * 1.5)
        if (anomaly || frame % 60 === 0) {
          // console.log('🚧 MOVE_DBG', {
          //   frame,
          //   dt: Number(delta.toFixed(3)),
          //   pos: { x: Number(newPosition.x.toFixed(3)), y: Number(newPosition.y.toFixed(3)), z: Number(newPosition.z.toFixed(3)) },
          //   step: Number(step.toFixed(4)), expected: Number(expected.toFixed(4)), stepDelta: Number(stepDelta.toFixed(4)),
          //   yawDeg: Number((yaw * 180/Math.PI).toFixed(1)), yawDeltaDeg: Number((yawDelta * 180/Math.PI).toFixed(1)),
          //   pitchDeg: Number((pitch * 180/Math.PI).toFixed(1)), pitchDeltaDeg: Number((pitchDelta * 180/Math.PI).toFixed(1)),
          //   keys: { f: keys.forward, b: keys.backward, tl: keys.turnLeft, tr: keys.turnRight, sh: keys.shift },
          // })
        }
        prevYawRef.current = yaw
        prevPitchRef.current = pitch
        prevStepRef.current = step
      }
    } else {
      // Even if not moving, track rotation anomalies
    if (DEBUG_MOVEMENT) {
        const frame = ++frameRef.current
        const yaw = cameraRotationRef.current.y
        const pitch = cameraRotationRef.current.x
        const yawDelta = yaw - prevYawRef.current
        const pitchDelta = pitch - prevPitchRef.current
        const stutter = (rawDt - dt) > 0.02 || rawDt > 0.1
        if (Math.abs(yawDelta) > 0.2 || Math.abs(pitchDelta) > 0.2 || stutter) {
          // console.log(stutter ? '❗STUTTER_DBG' : '🧭 ROT_DBG', {
          //   frame,
          //   rawDt: Number(rawDt.toFixed(3)), dt: Number(dt.toFixed(3)),
          //   yawDeg: Number((yaw * 180/Math.PI).toFixed(1)), yawDeltaDeg: Number((yawDelta * 180/Math.PI).toFixed(1)),
          //   pitchDeg: Number((pitch * 180/Math.PI).toFixed(1)), pitchDeltaDeg: Number((pitchDelta * 180/Math.PI).toFixed(1)),
          //   keys: { tl: keys.turnLeft, tr: keys.turnRight }
          // })
        }
        prevYawRef.current = yaw
        prevPitchRef.current = pitch
      }
    }
  })

  return null // No Three.js component needed, we're controlling the camera directly
}

// Placeholder for future KTX2 support - currently disabled for compatibility
function KTX2Support() {
  useEffect(() => {
    console.log('ℹ️ KTX2 support disabled for compatibility. Using standard textures.')
  }, [])
  
  return null
}


// Welcome message for first-time users
function WelcomeMessage() {
  const [showWelcome, setShowWelcome] = useState(true)
  
  if (!showWelcome) return null
  
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md mx-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Welcome to Virtual Room!</h2>
        <div className="space-y-3 text-gray-600">
          <p className="flex items-center"><span className="mr-2">🖱️</span> Click anywhere to start walking around</p>
          <p className="flex items-center"><span className="mr-2">⌨️</span> Use <strong>WASD</strong> or <strong>arrow keys</strong> to move</p>
          <p className="flex items-center"><span className="mr-2">🚀</span> Press <strong>Spacebar</strong> to jump</p>
          <p className="flex items-center"><span className="mr-2">👀</span> Move your mouse to look around</p>
          <p className="flex items-center"><span className="mr-2">⎋</span> Press <strong>Escape</strong> to unlock your cursor</p>
          <p className="flex items-center"><span className="mr-2">💡</span> Click on 3D models to learn about them</p>
        </div>
        <button 
          onClick={() => setShowWelcome(false)}
          className="mt-6 w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Start Exploring!
        </button>
      </div>
    </div>
  )
}



// Main Virtual Room component
export default function VirtualRoom({
  config, 
  initialQuality = 'medium',
  onModelLoad,
  onModelError,
  editModeEnabled,
  cameraControlsEnabled,
  showCenterDebug = false,
  onSelectedModelInfo
}: {
  config: RoomConfig
  initialQuality?: ModelQuality
  onModelLoad?: (modelId: string) => void
  onModelError?: (modelId: string, errorMessage: string) => void
  editModeEnabled?: boolean
  cameraControlsEnabled?: boolean
  showCenterDebug?: boolean
  onSelectedModelInfo?: (info: { name: string; center: { x: number; y: number; z: number } } | null) => void
}) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModelInfo, setSelectedModelInfo] = useState<{ name: string; center: { x: number; y: number; z: number } } | null>(null)
  const [quality, setQuality] = useState<ModelQuality>(initialQuality)
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('potato')
  const [enableAdaptiveQuality, setEnableAdaptiveQuality] = useState(false)
  const [currentFps, setCurrentFps] = useState(60)

  // Restore trace toggle (?restoreTrace=1)
  const restoreTrace = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('restoreTrace') === '1'
    } catch { return false }
  }, [])

  // Dev performance toggle: enable via ?perf=1 or localStorage('devPerformanceMode'='1') or window.__DEV_PERF_MODE or env
  const devPerformanceMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const params = new URLSearchParams(window.location.search)
      const perfParam = params.get('perf')
      const urlPerfOn = perfParam === '1'
      const urlPerfOff = perfParam === '0'
      const lsPerf = (localStorage.getItem('devPerformanceMode') === '1')
      const winPerf = !!(window as any).__DEV_PERF_MODE
      const envPerf = (process.env.NEXT_PUBLIC_DEV_PERF_MODE === '1')
      const devDefault = false // Disabled: Let users opt-in with ?perf=1 for better default quality
      const enabled = urlPerfOff ? false : (urlPerfOn || lsPerf || winPerf || envPerf || devDefault)
      if (enabled) console.log('⚙️ DEV_PERF_MODE: enabled')
      return enabled
    } catch { return false }
  }, [])
  const {
    loadedObjects, 
    errors, 
    isFullyLoaded, 
    totalProgress, 
    handleObjectLoad: _handleObjectLoad, 
    handleObjectError: _handleObjectError 
  } = useRoomManager(config)
  
  // Wrap the room manager callbacks to call our props
  const handleObjectLoad = (objectId: string, gltf: GLTF) => {
    console.log(`🔗 VirtualRoom: handleObjectLoad called for ${objectId}`)
    
    
    _handleObjectLoad(objectId, gltf)
    onModelLoad?.(objectId)
  }
  
  const handleObjectError = (objectId: string, error: string) => {
    console.log(`🚨 VirtualRoom: handleObjectError called for ${objectId}: ${error}`)
    _handleObjectError(objectId, error)
    onModelError?.(objectId, error)
  }
  
  const qualityConfig = qualityPresets[qualityPreset]
  
  const handlePerformanceUpdate = (fps: number) => {
    setCurrentFps(fps)
  }
  
  // Debug: isolate packet rendering (skip room/models) via ?isolatePacket=1
  const isolatePacket = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('isolatePacket') === '1'
    } catch { return false }
  }, [])
  
  // Layout persistence: track latest transforms and expose a global save function
  type LayoutEntry = { 
    id: string, 
    modelName?: string, 
    position: [number, number, number], 
    rotation?: [number, number, number], 
    scale?: number | [number, number, number],
    worldPosition?: [number, number, number],
    worldQuaternion?: [number, number, number, number],
    worldScale?: [number, number, number],
    worldCenter?: [number, number, number],
    category?: string,
    customLabel?: string
  }
  const layoutMapRef = useRef<Map<string, LayoutEntry>>(new Map())
  const [savedLayoutState, setSavedLayoutState] = useState<Record<string, LayoutEntry> | null>(null)
  // Suppress layout saves until initial restore/load completes
  const isRestoringRef = useRef(true)
  const [restorePhase, setRestorePhase] = useState(true)
  const restoreStartTsRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const restoreAppliedCountRef = useRef<number>(0)

  // Keep a live ref of the selected model ID for global actions (delete)
  const selectedModelIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedModelIdRef.current = selectedModelId
  }, [selectedModelId])

  useEffect(() => {
    // IMPORTANT: Scenario routes (e.g. /firewall, /https, /vpn) should not apply persisted layout overrides,
    // otherwise a saved design layout can accidentally mess up the published/final room.
    // We only use localStorage layout overrides in /design/*.
    const isDesignPath = (() => {
      try { return typeof window !== 'undefined' && window.location.pathname.startsWith('/design/') } catch { return false }
    })()

    const key = `roomLayout:${config.id || 'default'}`

    if (!isDesignPath) {
      try { setSavedLayoutState({}) } catch {}
      try { restoreStartTsRef.current = (typeof performance !== 'undefined' ? performance.now() : Date.now()) } catch {}
      return
    }

    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)

        // Migrate server labels from old saves - assign based on order
        const serverEntries = Object.keys(parsed)
          .map(id => ({ id, entry: parsed[id] }))
          .filter(({ entry }) => entry.modelName === 'inventory/servers/server' && !entry.__deleted)

        serverEntries.forEach(({ id, entry }, index) => {
          if (!entry.customLabel) {
            if (index === 0) {
              entry.customLabel = 'DNS Server'
            } else if (index === 1) {
              entry.customLabel = 'CDN Edge'
            } else if (index === 2) {
              entry.customLabel = 'Web Server'
            } else {
              entry.customLabel = `Server ${index + 1}`
            }
          }
        })

        try {
          const count = Object.keys(parsed || {}).length
          console.log('🧩 LAYOUT_RESTORE/load (labels migrated)', { count, sample: Object.values(parsed).slice(0, 3) })
        } catch {}
        setSavedLayoutState(parsed)
      } else {
        // Ensure we mark saved layout as loaded even when nothing exists yet
        setSavedLayoutState({})
      }
      // Reset restore timer to start counting after saved layout is available
      restoreStartTsRef.current = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    } catch {
      // On parse/read error, fall back to empty saved layout so gating can proceed
      try { setSavedLayoutState({}) } catch {}
      try { restoreStartTsRef.current = (typeof performance !== 'undefined' ? performance.now() : Date.now()) } catch {}
    }

    // Expose global save function
    ;(window as any).__saveRoomLayout = () => {
      // Allow manual Save even if initial restore is still settling
      if (isRestoringRef.current) {
        console.warn('Save requested during initial restore: proceeding with current staged transforms')
      }
      // Ask all models to stage their freshest transforms now
      try { document.dispatchEvent(new CustomEvent('forceLayoutStage')) } catch {}
      setTimeout(() => {
        const data: Record<string, LayoutEntry> = {}
        layoutMapRef.current.forEach((v, k) => { data[k] = v })
        try {
          localStorage.setItem(key, JSON.stringify(data))
          setSavedLayoutState(data)
          if (restoreTrace) {
            try {
              const count = Object.keys(data).length
              const sample = Object.values(data).slice(0, 2)
              console.log('🧩 RESTORE_TRACE/saveClick', { count, sample })
            } catch {}
          }
        } catch (e) {
          console.error('Failed to save layout', e)
        }
      }, 50)
    }

    // Debug helper: dump current live layout map
    ;(window as any).__dumpLayoutMap = () => {
      const data: Record<string, any> = {}
      layoutMapRef.current.forEach((v, k) => { data[k] = v })
      try { console.log('🧩 RESTORE_TRACE/layoutMapDump', { entries: Object.keys(data).length, data }) } catch {}
    }

    // Expose global reset function: clears saved layout but does not block adding new items
    ;(window as any).__resetRoomLayout = () => {
      try {
        localStorage.removeItem(key)
        setSavedLayoutState({})
        // DON'T clear layoutMapRef during same session - let new models accumulate for saving
        // layoutMapRef.current.clear()  // ← This was preventing save after reset
        console.log('🧩 Layout reset complete')
      } catch (e) {
        console.error('Failed to reset layout', e)
      }
    }

    // Expose helper to get current selected model ID
    ;(window as any).__getSelectedModelId = () => selectedModelIdRef.current

    // Expose delete selected model: mark as deleted in saved layout and layout map
    ;(window as any).__deleteSelectedModel = () => {
      const id = selectedModelIdRef.current
      if (!id) {
        console.warn('No selected model to delete')
        return
      }
      // Update saved layout state so RoomScene stops rendering it
      setSavedLayoutState(prev => {
        const next: any = { ...(prev || {}) }
        next[id] = { ...(next[id] || { id }), __deleted: true }
        try {
          // Keep localStorage roughly in sync (optional; final Save will persist authoritative state)
          localStorage.setItem(key, JSON.stringify(next))
        } catch {}
        return next
      })
      // Update layout map used by Save
      const existing: any = layoutMapRef.current.get(id) || { id }
      layoutMapRef.current.set(id, { ...existing, __deleted: true } as any)
    }

    return () => {
      try { delete (window as any).__saveRoomLayout } catch {}
      try { delete (window as any).__resetRoomLayout } catch {}
      try { delete (window as any).__getSelectedModelId } catch {}
      try { delete (window as any).__deleteSelectedModel } catch {}
    }
  }, [config.id])

  // Compute expected restore count based on saved layout entries that are active
  const expectedRestoreCount = useMemo(() => {
    const entries = savedLayoutState ? Object.values(savedLayoutState) as any[] : []
    return entries.filter((e: any) => e && e.id && !(e as any).__deleted).length
  }, [savedLayoutState])

  // Flip the restore gate off only when: (a) base config models are fully loaded (if any), and
  // (b) saved transforms have been applied for all saved entries we plan to render, or a timeout elapses.
  useEffect(() => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const elapsedMs = now - (restoreStartTsRef.current || now)

    if (restoreTrace) {
      try {
        console.log('🧩 RESTORE_TRACE/awaitGate', {
          isFullyLoaded,
          configCount: (config?.objects?.length || 0),
          expectedRestoreCount,
          appliedCount: restoreAppliedCountRef.current,
          elapsedMs: Math.round(elapsedMs)
        })
      } catch {}
    }

    // IMPORTANT: don't release the restore gate until we've actually loaded the saved layout
    // from localStorage into state. Before that, expectedRestoreCount will read as 0 and we'd
    // incorrectly flip the gate open, causing immediate LAYOUT_SAVE writes on mount.
    if (savedLayoutState === null) {
      return
    }

    // Requirement A: either config contains models and they're fully loaded, or there are no base models at all
    const baseOk = (config?.objects?.length || 0) === 0 ? true : isFullyLoaded

    // Requirement B: either there are no saved items to restore, or all applied
    const savedOk = expectedRestoreCount === 0 || restoreAppliedCountRef.current >= expectedRestoreCount

    // Failsafe: if we've waited > 6000ms, allow proceeding
    const timeoutOk = elapsedMs > 6000

    if (!baseOk || !(savedOk || timeoutOk)) return

    const raf = requestAnimationFrame(() => {
      isRestoringRef.current = false
      // Defer clamping for N frames after gate opens
      let frames = 8
      const endPhase = () => setRestorePhase(false)
      const tick = () => { if (--frames <= 0) endPhase(); else requestAnimationFrame(tick) }
      requestAnimationFrame(tick)

      if (restoreTrace) {
        try { console.log('🧩 RESTORE_TRACE/restoreComplete') } catch {}
      }
      // Rehydrate the live layout map from the currently saved layout so Save captures correct transforms
      if (savedLayoutState) {
        layoutMapRef.current.clear()
        Object.values(savedLayoutState).forEach((e: any) => {
          if (!e || !e.id || (e as any).__deleted) return
          layoutMapRef.current.set(e.id, e as any)
        })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [isFullyLoaded, savedLayoutState, expectedRestoreCount, restoreTrace, config?.objects?.length])

  // Hook to update layout map from child models
  const handleLayoutChange = useCallback((entry: LayoutEntry) => {
    // Always stage updates to the in-memory layout map so Save can capture everything.
    layoutMapRef.current.set(entry.id, entry)
    if (isRestoringRef.current) {
      // During initial restore, don't write to storage yet; just note that we captured it.
      if (restoreTrace) {
        try { console.log('🧩 RESTORE_TRACE/layoutSaveStaged', { id: entry.id }) } catch {}
      }
      return
    }
    if (restoreTrace) {
      try {
        console.log('📝 LAYOUT_SAVE', { id: entry.id, pos: entry.position, rot: entry.rotation, scale: entry.scale })
      } catch {}
    }
  }, [restoreTrace])

  // Track restore-applied notifications from InteractiveModel
  const handleRestoreAppliedFromChild = useCallback((id: string) => {
    restoreAppliedCountRef.current += 1
    if (restoreTrace) {
      try { console.log('🧩 RESTORE_TRACE/restoreAppliedAck', { id, appliedCount: restoreAppliedCountRef.current, expectedRestoreCount }) } catch {}
    }
  }, [restoreTrace, expectedRestoreCount])

  // Call the callback when selectedModelInfo changes
  useEffect(() => {
    onSelectedModelInfo?.(selectedModelInfo)
  }, [selectedModelInfo, onSelectedModelInfo])
  
  const [flowState, setFlowState] = useState<any>({ phase: 'DNS', status: 'idle', from: null, to: null, meta: null })

  const isFirewallRoom = config.id === 'firewall'
  const isVpnRoom = config.id === 'vpn'
  const isHttpsRoom = config.id === 'https'
  const isDesignTestRoom = config.id === 'design-test'

  const isDesignRoute = useMemo(() => {
    try {
      return typeof window !== 'undefined' && window.location.pathname.startsWith('/design/')
    } catch {
      return false
    }
  }, [])

  // Phase-driven UI state
  // - design-test: always (view-only room)
  // - firewall: on both /firewall and /design/firewall when in View mode
  // - vpn: on both /vpn and /design/vpn when in View mode
  // - https: on both /https and /design/https when in View mode
  const useNewPhaseUI =
    isDesignTestRoom ||
    (isFirewallRoom && !editModeEnabled) ||
    (isVpnRoom && !editModeEnabled) ||
    (isHttpsRoom && !editModeEnabled)
  
  // HTTPS room: reflect whether HTTPS is unlocked (Fix HTTPS completed)
  const [httpsUiUnlocked, setHttpsUiUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
  })
  useEffect(() => {
    if (!isHttpsRoom) return
    if (editModeEnabled) return
    let t: any = null
    const poll = () => {
      const ok = (() => {
        try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
      })()
      setHttpsUiUnlocked((prev) => (prev === ok ? prev : ok))
    }
    poll()
    t = setInterval(poll, 250)
    return () => { try { if (t) clearInterval(t) } catch {} }
  }, [isHttpsRoom, editModeEnabled])

  // Base phase entries (hardcoded per room)
  const basePhaseEntries = useMemo(() => {
    if (isDesignTestRoom) {
      return [
        { id: 'initial', label: 'Run Normal Traffic', description: 'Start normal traffic flow' },
        { id: 'configure', label: 'Configure Rules', description: 'Configure firewall rules' },
        { id: 'test-attack', label: 'Simulate Attack', description: 'Test firewall against attack' },
      ]
    }
    if (isFirewallRoom && !editModeEnabled) {
      return [
        { id: 'normal', label: 'Normal Traffic', description: 'Observe normal HTTPS flow' },
        { id: 'configure', label: 'Configure Firewall', description: 'Set up firewall rules' },
        { id: 'attack', label: 'Test Attack', description: 'Simulate SSH attack and verify blocking' },
      ]
    }
    if (isVpnRoom && !editModeEnabled) {
      return [
        { id: 'no-vpn', label: 'No VPN', description: '' },
        { id: 'enable', label: 'Enable VPN', description: '' },
        { id: 'vpn-on', label: 'VPN ON', description: '' },
      ]
    }
    if (isHttpsRoom && !editModeEnabled) {
      return [
        { id: 'http', label: 'HTTP', description: 'Observe plaintext HTTP on the wire' },
        { id: 'handshake', label: 'TLS Handshake', description: 'Establish encryption (PKI / key exchange)' },
        { id: 'fix', label: 'Fix HTTPS', description: 'Troubleshoot and repair broken TLS/HTTPS' },
        { id: 'https', label: 'HTTPS', description: 'Observe encrypted HTTPS traffic (attacker sees Encrypted)' },
      ]
    }
    return []
  }, [isDesignTestRoom, isFirewallRoom, isVpnRoom, isHttpsRoom, editModeEnabled, isDesignRoute])

  const [currentPhase, setCurrentPhase] = useState<string>(() => {
    if (!useNewPhaseUI || basePhaseEntries.length === 0) return ''
    return basePhaseEntries[0].id
  })

  // Keep currentPhase valid when switching rooms/modes
  useEffect(() => {
    if (!useNewPhaseUI) return
    if (basePhaseEntries.length === 0) return
    if (!currentPhase || !basePhaseEntries.some(p => p.id === currentPhase)) {
      setCurrentPhase(basePhaseEntries[0].id)
    }
  }, [useNewPhaseUI, basePhaseEntries, currentPhase])

  // Phase list with status (depends on currentPhase)
  const phaseList = useMemo(() => {
    type PhaseUi = { id: string; label: string; description?: string; status: 'completed' | 'active' | 'locked' }

    const idxFound = basePhaseEntries.findIndex(p => p.id === currentPhase)
    const currentIdx = idxFound >= 0 ? idxFound : 0

    const withStatuses: PhaseUi[] = basePhaseEntries.map((phase, idx) => ({
      ...(phase as any),
      status: (idx < currentIdx ? 'completed' : idx === currentIdx ? 'active' : 'locked') as PhaseUi['status']
    }))

    // HTTPS room: keep HTTPS visually locked until Fix HTTPS is completed.
    if (isHttpsRoom && !httpsUiUnlocked) {
      return withStatuses.map((p) => (p.id === 'https'
        ? { ...p, status: (p.id === currentPhase ? 'active' : 'locked') as PhaseUi['status'] }
        : p
      ))
    }

    return withStatuses
  }, [basePhaseEntries, currentPhase, isHttpsRoom, httpsUiUnlocked])

  const currentPhaseConfig = useMemo(() => {
    if (!currentPhase) return null
    
    // Design-test room phase configs
    if (isDesignTestRoom) {
      const phaseConfigs: Record<string, any> = {
        initial: {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start Normal Flow', flowId: 'normal' },
            secondaryActions: [
              { id: 'inspect', label: 'Inspector' }
            ]
          }
        },
        configure: {
          ui: {
            primaryAction: { type: 'openPanel', label: '⚙️ Configure Firewall', panelId: 'firewall-rules' },
            secondaryActions: [
              { id: 'replay', label: 'Replay Normal' },
              { id: 'terminal', label: 'Terminal' }
            ]
          }
        },
        'test-attack': {
          ui: {
            primaryAction: { type: 'simulateAttack', label: '🔥 Simulate Attack', flowId: 'attack' },
            secondaryActions: [
              { id: 'configure', label: 'Edit Rules' },
              { id: 'mission', label: 'Mission' }
            ]
          }
        }
      }
      return phaseConfigs[currentPhase] || null
    }
    
    // Firewall room phase configs (view mode)
    // Bottom panel: Start + Simulate Attack
    // Right drawer: Firewall Rules + Inspector + Terminal (+ Mission)
    if (isFirewallRoom && !editModeEnabled) {
      // Keep the bottom action panel consistent across phases:
      // Primary: Start
      // Secondary: Simulate Attack
      const phaseConfigs: Record<string, any> = {
        normal: {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'normal' },
            secondaryActions: [
              { id: 'simulate-attack', label: 'Simulate Attack', state: 'warning' },
            ]
          }
        },
        configure: {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'normal' },
            secondaryActions: [
              { id: 'simulate-attack', label: 'Simulate Attack', state: 'warning' },
            ]
          }
        },
        attack: {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'normal' },
            secondaryActions: [
              { id: 'simulate-attack', label: 'Simulate Attack', state: 'warning' },
            ]
          }
        }
      }
      return phaseConfigs[currentPhase] || null
    }

    // VPN room phase configs (view mode)
    // Bottom panel: Start (re-run flow)
    // Right drawer: VPN Toggle + Inspector + Terminal (+ Mission)
    if (isVpnRoom && !editModeEnabled) {
      const phaseConfigs: Record<string, any> = {
        'no-vpn': {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'dns' },
            secondaryActions: []
          }
        },
        enable: {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'pki' },
            secondaryActions: []
          }
        },
        'vpn-on': {
          ui: {
            primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'pki' },
            secondaryActions: []
          }
        },
      }
      return phaseConfigs[currentPhase] || null
    }

    // HTTPS room phase configs (view mode)
    // Bottom panel: Start + Fix HTTPS
    // Right drawer: Fix HTTPS + Inspector + Terminal (+ Mission)
    if (isHttpsRoom && !editModeEnabled) {
      const common = {
        ui: {
          primaryAction: { type: 'playFlow', label: '▶ Start', flowId: 'https' },
          secondaryActions: [
            { id: 'fix-https', label: 'Fix HTTPS', state: 'warning' },
          ]
        }
      }
      const phaseConfigs: Record<string, any> = {
        http: common,
        handshake: common,
        fix: common,
        https: common,
      }
      return phaseConfigs[currentPhase] || null
    }

    return null
  }, [isDesignTestRoom, isFirewallRoom, isVpnRoom, isHttpsRoom, editModeEnabled, currentPhase])

  const handlePrimaryAction = useCallback(() => {
    if (!currentPhaseConfig?.ui?.primaryAction) return
    const action = currentPhaseConfig.ui.primaryAction

    if (action.type === 'playFlow') {
      // Mirror old Start behavior
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'stop' } })) } catch {}
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'start' } })) } catch {}
      return
    }

    if (action.type === 'openPanel' && action.panelId === 'firewall-rules') {
      showFirewallRulesPanel()
      return
    }

    if (action.type === 'simulateAttack') {
      try { window.dispatchEvent(new CustomEvent('firewall:simulate-attack')) } catch {}
      return
    }
  }, [currentPhaseConfig])

  const handleSecondaryAction = useCallback((actionId: string) => {
    if (actionId === 'start' || actionId === 'replay') {
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'stop' } })) } catch {}
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'start' } })) } catch {}
      return
    }

    if (actionId === 'firewall-rules') {
      showFirewallRulesPanel()
      return
    }

    if (actionId === 'fix-https') {
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
      try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
      return
    }

    if (actionId === 'simulate-attack') {
      try { window.dispatchEvent(new CustomEvent('firewall:simulate-attack')) } catch {}
      return
    }

    if (actionId === 'inspector') {
      try { window.dispatchEvent(new CustomEvent('ui:inspector:toggle')) } catch {}
      return
    }

    if (actionId === 'terminal') {
      try { window.dispatchEvent(new CustomEvent('ui:terminal:toggle')) } catch {}
      return
    }

    if (actionId === 'mission') {
      try { window.dispatchEvent(new CustomEvent('mission:toggle', { detail: { roomId: config?.id } })) } catch {}
      return
    }
  }, [config?.id])

  const [vpnUiActive, setVpnUiActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return !!(window as any).__VPN_ACTIVE__ } catch { return false }
  })
  useEffect(() => {
    if (!isVpnRoom) return
    const onVpn = (e: any) => {
      setVpnUiActive(!!e?.detail?.active)
    }
    window.addEventListener('vpn:active', onVpn as any)
    return () => window.removeEventListener('vpn:active', onVpn as any)
  }, [isVpnRoom])

  // VPN quiz gating: require a short quiz before enabling VPN for the first time per page load.
  // After reload, quiz must be retaken.
  type VpnQuizQ = {
    id: string
    prompt: string
    options: { id: string; label: string }[]
    correctId: string
  }

  const vpnQuizPassedRef = useRef(false)
  const [vpnQuizPassed, setVpnQuizPassedState] = useState(false)
  const setVpnQuizPassed = useCallback((v: boolean) => {
    vpnQuizPassedRef.current = v
    setVpnQuizPassedState(v)
  }, [])

  const [vpnQuizOpen, setVpnQuizOpen] = useState(false)
  const [vpnQuizAnswers, setVpnQuizAnswers] = useState<Record<string, string>>({})
  const [vpnQuizSubmitted, setVpnQuizSubmitted] = useState(false)
  const [vpnQuizError, setVpnQuizError] = useState<string | null>(null)

  const [pendingVpnPhaseId, setPendingVpnPhaseId] = useState<string | null>(null)

  const vpnQuizQuestions: VpnQuizQ[] = useMemo(() => {
    return [
      {
        id: 'q1',
        prompt: 'What does a VPN primarily create between a remote user and an organization?',
        options: [
          { id: 'a', label: 'A public tunnel that makes the user anonymous to websites' },
          { id: 'b', label: 'An encrypted tunnel to a trusted gateway (firewall / VPN server)' },
          { id: 'c', label: 'A replacement for all firewall rules' },
          { id: 'd', label: 'A faster Internet connection' },
        ],
        correctId: 'b',
      },
      {
        id: 'q2',
        prompt: 'When VPN traffic reaches the VPN gateway (firewall/VPN server), what happens next?',
        options: [
          { id: 'a', label: 'The traffic stays encrypted forever and is never readable' },
          { id: 'b', label: 'It is decrypted at the gateway and forwarded into the internal network' },
          { id: 'c', label: 'It is broadcast to every device on the Internet' },
          { id: 'd', label: 'It is automatically blocked by default' },
        ],
        correctId: 'b',
      },
      {
        id: 'q3',
        prompt: 'Which statement is true about eavesdropping on the Internet?',
        options: [
          { id: 'a', label: 'VPN prevents attackers from capturing packets at all' },
          { id: 'b', label: 'VPN stops ISPs from routing your traffic' },
          { id: 'c', label: 'Packets can still be captured, but the VPN payload is unreadable (encrypted)' },
          { id: 'd', label: 'VPN automatically removes all malware from downloads' },
        ],
        correctId: 'c',
      },
      {
        id: 'q4',
        prompt: 'In this room, what access policy is being demonstrated?',
        options: [
          { id: 'a', label: 'Allow WAN → LAN by default' },
          { id: 'b', label: 'Block VPN → LAN but allow WAN → LAN' },
          { id: 'c', label: 'Block WAN → LAN, but allow VPN → LAN for authorized users' },
          { id: 'd', label: 'Allow everything if encryption is used' },
        ],
        correctId: 'c',
      },
      {
        id: 'q5',
        prompt: 'Which statement best describes what a VPN does NOT automatically do?',
        options: [
          { id: 'a', label: 'Encrypt traffic across the public Internet' },
          { id: 'b', label: 'Authenticate the connection to a trusted gateway' },
          { id: 'c', label: 'Prevent phishing and malware by itself' },
          { id: 'd', label: 'Enable secure remote access to internal resources' },
        ],
        correctId: 'c',
      },
    ]
  }, [])

  const setVpnActive = useCallback((next: boolean, source: string) => {
    try { (window as any).__VPN_ACTIVE__ = next } catch {}
    setVpnUiActive(next)
    try { window.dispatchEvent(new CustomEvent('vpn:active', { detail: { active: next, source } })) } catch {}
  }, [])

  const openVpnQuiz = useCallback((opts?: { desiredPhaseId?: string | null }) => {
    setPendingVpnPhaseId(opts?.desiredPhaseId ?? null)
    setVpnQuizAnswers({})
    setVpnQuizSubmitted(false)
    setVpnQuizError(null)
    setVpnQuizOpen(true)
    try { setVpnIntroOpen(false) } catch {}
  }, [])

  const requestEnableVpn = useCallback((source: string, opts?: { desiredPhaseId?: string | null }) => {
    if (vpnQuizPassedRef.current) {
      setVpnActive(true, source)
      return
    }
    openVpnQuiz({ desiredPhaseId: opts?.desiredPhaseId ?? null })
  }, [openVpnQuiz, setVpnActive])

  // Hard gate: if *anything* tries to enable VPN via the global event, block it until quiz passes.
  useEffect(() => {
    if (!isVpnRoom) return
    if (editModeEnabled) return

    const onVpnActiveCapture = (e: any) => {
      const active = !!e?.detail?.active
      if (!active) return
      if (vpnQuizPassedRef.current) return

      try { e.stopImmediatePropagation?.() } catch {}
      try { e.preventDefault?.() } catch {}

      try { (window as any).__VPN_ACTIVE__ = false } catch {}
      setVpnUiActive(false)

      setPendingVpnPhaseId(null)
      setVpnQuizAnswers({})
      setVpnQuizSubmitted(false)
      setVpnQuizError(null)
      setVpnQuizOpen(true)
      try { setVpnIntroOpen(false) } catch {}
    }

    window.addEventListener('vpn:active', onVpnActiveCapture as any, true)
    return () => window.removeEventListener('vpn:active', onVpnActiveCapture as any, true)
  }, [isVpnRoom, editModeEnabled])

  const handleToolClick = useCallback((toolId: string) => {
    if (toolId === 'firewall-guide') {
      // Open the Firewall learning guide panel (reuses the firewall intro overlay)
      try { setFirewallIntroOpen(true) } catch {}
      return
    }
    if (toolId === 'firewall-rules') {
      showFirewallRulesPanel()
      return
    }
    if (toolId === 'vpn-toggle') {
      // Toggle VPN. Enabling requires passing the VPN quiz once per page load.
      const next = (() => {
        try { return !((window as any).__VPN_ACTIVE__ === true) } catch { return true }
      })()

      if (next) {
        // Request enable (will open quiz if not yet passed)
        setPendingVpnPhaseId(null)
        requestEnableVpn('tools-drawer')
        return
      }

      // Disabling is always allowed
      setVpnActive(false, 'tools-drawer')
      return
    }
    if (toolId === 'vpn-guide') {
      // Open the VPN learning guide panel (reuses the VPN intro overlay)
      try { setVpnIntroOpen(true) } catch {}
      return
    }
    if (toolId === 'https-guide') {
      // Open HTTP/HTTPS learning guide panel (reuse the HTTPS intro overlay so it's the same panel shown on load)
      try { setHttpsIntroOpen(true) } catch {}
      return
    }
    if (toolId === 'https-fix') {
      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
      try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
      return
    }
    if (toolId === 'inspector') {
      try { window.dispatchEvent(new CustomEvent('ui:inspector:toggle')) } catch {}
      return
    }
    if (toolId === 'terminal') {
      try { window.dispatchEvent(new CustomEvent('ui:terminal:toggle')) } catch {}
      return
    }
    if (toolId === 'mission') {
      try { window.dispatchEvent(new CustomEvent('mission:toggle', { detail: { roomId: config?.id } })) } catch {}
      return
    }
  }, [config?.id, requestEnableVpn, setVpnActive])

  // Firewall room intro: show every time the firewall room is entered in View mode.
  // No persistence on purpose (it should reappear on reload).
  const shouldAutoShowFirewallIntro = isFirewallRoom && !editModeEnabled
  const [firewallIntroOpen, setFirewallIntroOpen] = useState<boolean>(() => shouldAutoShowFirewallIntro)

  useEffect(() => {
    if (shouldAutoShowFirewallIntro) setFirewallIntroOpen(true)
    else setFirewallIntroOpen(false)
  }, [shouldAutoShowFirewallIntro])

  // VPN room intro: show every time the VPN room is entered in View mode.
  // No persistence on purpose (it should reappear on reload).
  const shouldAutoShowVpnIntro = isVpnRoom && !editModeEnabled
  const [vpnIntroOpen, setVpnIntroOpen] = useState<boolean>(() => shouldAutoShowVpnIntro)

  useEffect(() => {
    if (shouldAutoShowVpnIntro) setVpnIntroOpen(true)
    else setVpnIntroOpen(false)
  }, [shouldAutoShowVpnIntro])

  // HTTPS room intro: show every time the HTTPS room is entered in View mode.
  // No persistence on purpose (it should reappear on reload).
  const shouldAutoShowHttpsIntro = isHttpsRoom && !editModeEnabled
  const [httpsIntroOpen, setHttpsIntroOpen] = useState<boolean>(() => shouldAutoShowHttpsIntro)

  useEffect(() => {
    if (shouldAutoShowHttpsIntro) setHttpsIntroOpen(true)
    else setHttpsIntroOpen(false)
  }, [shouldAutoShowHttpsIntro])


  // HTTPS room: Troubleshoot HTTPS panel (reset on reload; no persistence)
  type HttpsTroubleKey = 'hostname' | 'ca' | 'time' | 'tls'
  type HttpsTroubleStage = HttpsTroubleKey | 'ok'

  const httpsTroubleSteps = useMemo(() => {
    return [
      {
        key: 'hostname' as const,
        title: 'Hostname mismatch',
        problem: 'The certificate does not match the hostname the client is connecting to.',
        howToFind: 'Run in Terminal: curl https://web-server  (look for the hostname/CN mismatch)',
        question: 'Which hostname should the certificate be issued to?',
        options: [
          { id: 'web-server', label: 'web-server' },
          { id: 'client', label: 'client' },
          { id: 'attacker', label: 'attacker' },
          { id: '198.51.100.10', label: '198.51.100.10 (IP address)' },
        ],
        correctId: 'web-server',
      },
      {
        key: 'ca' as const,
        title: 'Unknown CA (not trusted)',
        problem: 'The certificate chain is signed by a CA your client does not trust yet.',
        howToFind: 'Run in Terminal: openssl_connect web-server  (look for Issuer / verify error)',
        question: 'Which CA should the client trust to validate this certificate?',
        options: [
          { id: 'example-training-ca', label: 'Example Training CA (issuer)' },
          { id: 'lets-encrypt', label: "Let's Encrypt" },
          { id: 'cloudflare', label: 'Cloudflare CA' },
          { id: 'attacker-ca', label: 'Attacker CA' },
        ],
        correctId: 'example-training-ca',
      },
      {
        key: 'time' as const,
        title: 'Certificate time invalid',
        problem: 'Certificates are only valid within a time window (Not Before / Not After).',
        howToFind: 'Run in Terminal: date  (check client time) and openssl_connect web-server  (look for Not Before / Not After).',
        question: 'What should you do to fix a “certificate expired / not yet valid” error?',
        options: [
          { id: 'sync-time', label: 'Sync system time (NTP)' },
          { id: 'disable-validation', label: 'Disable certificate validation (unsafe)' },
          { id: 'use-http', label: 'Switch to HTTP (insecure)' },
          { id: 'change-port', label: 'Change the port to 80' },
        ],
        correctId: 'sync-time',
      },
      {
        key: 'tls' as const,
        title: 'TLS version mismatch',
        problem: 'Client and server must agree on a compatible TLS version.',
        howToFind: 'Run in Terminal: openssl_connect web-server  (look for protocol_version / TLS version)',
        question: 'Which change will allow the TLS handshake to complete?',
        options: [
          { id: 'enable-tls13', label: 'Enable TLS 1.3 support on the client' },
          { id: 'force-tls10', label: 'Force TLS 1.0 (obsolete)' },
          { id: 'disable-tls', label: 'Disable TLS entirely' },
          { id: 'use-http', label: 'Use HTTP instead of HTTPS' },
        ],
        correctId: 'enable-tls13',
      },
    ]
  }, [])

  const [httpsTroubleOpen, setHttpsTroubleOpen] = useState(false)
  const [httpsTroubleAnswers, setHttpsTroubleAnswers] = useState<Record<HttpsTroubleKey, string>>({
    hostname: '',
    ca: '',
    time: '',
    tls: '',
  })
  const [httpsTroubleTestMsg, setHttpsTroubleTestMsg] = useState<string>('')

  const httpsTroubleStage: HttpsTroubleStage = useMemo(() => {
    if (!isHttpsRoom) return 'ok'
    for (const s of httpsTroubleSteps) {
      const ans = String((httpsTroubleAnswers as any)[s.key] || '')
      if (ans !== s.correctId) return s.key
    }
    return 'ok'
  }, [isHttpsRoom, httpsTroubleAnswers, httpsTroubleSteps])

  const httpsTroubleOk = httpsTroubleStage === 'ok'

  const httpsTroubleFixedCount = useMemo(() => {
    return httpsTroubleSteps.filter((s) => {
      const ans = String((httpsTroubleAnswers as any)[s.key] || '')
      return ans === s.correctId
    }).length
  }, [httpsTroubleAnswers, httpsTroubleSteps])

  const httpsTroubleCurrent = useMemo(() => {
    if (httpsTroubleStage === 'ok') return null
    return httpsTroubleSteps.find((s) => s.key === httpsTroubleStage) || null
  }, [httpsTroubleStage, httpsTroubleSteps])

  const httpsTroubleStageIndex = useMemo(() => {
    if (httpsTroubleStage === 'ok') return httpsTroubleSteps.length
    const ix = httpsTroubleSteps.findIndex((s) => s.key === httpsTroubleStage)
    return ix >= 0 ? ix : 0
  }, [httpsTroubleStage, httpsTroubleSteps])

  // Open the troubleshooter from the UI button (Header dispatches https:troubleshooter:open)
  useEffect(() => {
    if (!isHttpsRoom) return
    const onOpen = () => setHttpsTroubleOpen(true)
    window.addEventListener('https:troubleshooter:open', onOpen as any)
    return () => window.removeEventListener('https:troubleshooter:open', onOpen as any)
  }, [isHttpsRoom])

  // Keep a small window state so Terminal + flow-control gating can read it.
  useEffect(() => {
    if (!isHttpsRoom) return
    try {
      ;(window as any).__HTTPS_TROUBLESHOOT__ = {
        stage: httpsTroubleStage,
        ok: httpsTroubleOk,
        answers: httpsTroubleAnswers,
      }
    } catch {}
  }, [isHttpsRoom, httpsTroubleStage, httpsTroubleOk, httpsTroubleAnswers])

  // Gate PhaseRunner HTTPS in the HTTPS room until the troubleshooter is completed.
  // (Terminal startPhase effects dispatch `phase:run`, which should not bypass the lock.)
  useEffect(() => {
    if (!isHttpsRoom) return
    const onRunCapture = (e: any) => {
      const id = String(e?.detail?.id || '')
      if (id !== 'HTTPS') return

      const ok = (() => {
        try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
      })()
      if (ok) return

      try { e.stopImmediatePropagation?.() } catch {}
      try { e.stopPropagation?.() } catch {}
      try { e.preventDefault?.() } catch {}
      try { window.dispatchEvent(new CustomEvent('hud:text', { detail: { text: 'HTTPS is currently broken — open Fix HTTPS to repair it.' } })) } catch {}
      try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
    }

    window.addEventListener('phase:run', onRunCapture as any, true)
    return () => window.removeEventListener('phase:run', onRunCapture as any, true)
  }, [isHttpsRoom])

  const firewallIntroNet = useMemo(() => {
    const byId = (id: string) => (config.objects || []).find((o) => o.id === id)
    const net = (id: string) => (((byId(id)?.metadata as any)?.net ?? {}) as any)

    const lan = net('desktop1')
    const sw = net('switch1')
    const router = net('router1')
    const fw = net('firewall1')
    const web = net('dns1')
    const attacker = net('desktop2')

    const lanDesktopIp = (lan?.ip as string | undefined) ?? '192.168.10.30'
    const lanDesktopHost = (lan?.hostname as string | undefined) ?? 'lan-desktop'
    const lanGateway = (lan?.gateway as string | undefined) ?? '192.168.10.1'

    const switchMgmtIp = (sw?.mgmtIp as string | undefined) ?? '192.168.10.2'

    const routerLanIp = (Array.isArray(router?.interfaces)
      ? (router.interfaces.find((i: any) => i?.name === 'LAN')?.ip as string | undefined)
      : undefined) ?? '192.168.10.1/24'

    const firewallInsideIp = (fw?.insideIp as string | undefined) ?? '10.0.0.1/30'
    const firewallOutsideIp = (fw?.outsideIp as string | undefined) ?? '203.0.113.1/24'

    const webServerIp = (web?.ip as string | undefined) ?? '198.51.100.10'
    const webServerHost = (web?.hostname as string | undefined) ?? 'web-server'

    const attackerIp = (attacker?.ip as string | undefined) ?? '198.51.100.66'
    const attackerHost = (attacker?.hostname as string | undefined) ?? 'attacker'

    return {
      lanDesktopIp,
      lanDesktopHost,
      lanGateway,
      switchMgmtIp,
      routerLanIp,
      firewallInsideIp,
      firewallOutsideIp,
      webServerIp,
      webServerHost,
      attackerIp,
      attackerHost,
    }
  }, [config.objects])

  const vpnIntroNet = useMemo(() => {
    const byId = (id: string) => (config.objects || []).find((o) => o.id === id)
    const net = (id: string) => (((byId(id)?.metadata as any)?.net ?? {}) as any)

    const remote = net('desktop1')
    const fw = net('firewall1')
    const router = net('router1')
    const sw = net('switch1')
    const web = net('web1')

    const stripCidr = (v: any) => (typeof v === 'string' ? v.split('/')[0] : '')

    const getIfaceIp = (n: any, pred: (i: any) => boolean) => {
      const ifaces = Array.isArray(n?.interfaces) ? n.interfaces : []
      const m = ifaces.find((i: any) => {
        try { return !!pred(i) } catch { return false }
      })
      return stripCidr(m?.ip)
    }

    const remoteWanIp =
      getIfaceIp(remote, (i) => String(i?.kind || '').toLowerCase() === 'wan' || String(i?.name || '').toLowerCase() === 'wlan0') ||
      stripCidr(remote?.ip) ||
      '203.0.113.25'

    const firewallWanIp = stripCidr(fw?.outsideIp) || '203.0.113.1'

    const routerLanIp =
      getIfaceIp(router, (i) => String(i?.name || '').toUpperCase() === 'LAN' || String(i?.type || '').toUpperCase() === 'LAN') ||
      stripCidr(router?.ip) ||
      '192.168.10.1'

    const switchMgmtIp = stripCidr(sw?.mgmtIp) || stripCidr(sw?.ip) || '192.168.10.2'

    const lanServerIp = stripCidr(web?.ip) || '192.168.10.50'

    return {
      remoteWanIp,
      vpnAssignedIp: '10.8.0.25',
      firewallWanIp,
      routerLanIp,
      switchMgmtIp,
      lanServerIp,
      lanSubnet: '192.168.10.0/24',
    }
  }, [config.objects])

  const httpsIntroNet = useMemo(() => {
    const byId = (id: string) => (config.objects || []).find((o) => o.id === id)
    const net = (id: string) => (((byId(id)?.metadata as any)?.net ?? {}) as any)

    const lan = net('desktop1')
    const sw = net('switch1')
    const router = net('router1')
    const web = net('dns1')
    const attacker = net('desktop2')

    const stripCidr = (v: any) => (typeof v === 'string' ? v.split('/')[0] : '')

    const lanDesktopIp = stripCidr(lan?.ip) || '192.168.10.30'
    const lanDesktopHost = String(lan?.hostname || 'lan-desktop')

    const routerLanIp =
      (Array.isArray(router?.interfaces)
        ? stripCidr(router.interfaces.find((i: any) => String(i?.name || '').toUpperCase() === 'LAN')?.ip)
        : '') || stripCidr(router?.ip) || '192.168.10.1'

    const switchMgmtIp = stripCidr(sw?.mgmtIp) || stripCidr(sw?.ip) || '192.168.10.2'

    const webServerIp = stripCidr(web?.ip) || '198.51.100.10'
    const webServerHost = String(web?.hostname || 'web-server')

    const attackerIp = stripCidr(attacker?.ip) || '198.51.100.66'
    const attackerHost = String(attacker?.hostname || 'attacker')

    return {
      lanDesktopIp,
      lanDesktopHost,
      routerLanIp,
      switchMgmtIp,
      webServerIp,
      webServerHost,
      attackerIp,
      attackerHost,
    }
  }, [config.objects])

  // Attack education overlays (compromised vs secured)
  const [attackEducation, setAttackEducation] = useState<{
    matchedRuleIndex: number | null
    matchedRuleId: string | null
  } | null>(null)

  const [securedEducation, setSecuredEducation] = useState<{
    matchedRuleIndex: number | null
    matchedRuleId: string | null
  } | null>(null)

  // VPN room: education overlay when firewall blocks access without VPN (Phase 1)
  const [vpnBlockedEducation, setVpnBlockedEducation] = useState<{
    srcIp: string
    dstIp: string
    protocol: string
    port: number
    reason: string
  } | null>(null)

  const [vpnAllowedEducation, setVpnAllowedEducation] = useState<{
    srcIp: string
    dstIp: string
    protocol: string
    port: number
    reason: string
  } | null>(null)

  // HTTPS room: HTTP (plaintext) education panel shown when the response returns to the LAN desktop.
  const [httpsHttpEducationOpen, setHttpsHttpEducationOpen] = useState(false)
  const httpsHttpEducationLastOpenAtRef = useRef<number>(0)
  useEffect(() => {
    if (!isHttpsRoom || editModeEnabled) return
    const onDone = () => {
      const now = Date.now()
      if (httpsHttpEducationOpen) return
      if (now - httpsHttpEducationLastOpenAtRef.current < 900) return
      httpsHttpEducationLastOpenAtRef.current = now
      setHttpsHttpEducationOpen(true)
    }
    window.addEventListener('https:http:complete', onDone as any)
    return () => window.removeEventListener('https:http:complete', onDone as any)
  }, [isHttpsRoom, editModeEnabled, httpsHttpEducationOpen])

  // HTTPS room: HTTPS success panel shown when the encrypted response returns to the LAN desktop.
  const [httpsSuccessOpen, setHttpsSuccessOpen] = useState(false)
  const httpsSuccessLastOpenAtRef = useRef<number>(0)
  useEffect(() => {
    if (!isHttpsRoom || editModeEnabled) return
    const onDone = () => {
      const now = Date.now()
      if (httpsSuccessOpen) return
      if (now - httpsSuccessLastOpenAtRef.current < 900) return
      httpsSuccessLastOpenAtRef.current = now
      setHttpsSuccessOpen(true)
    }
    window.addEventListener('https:https:complete', onDone as any)
    return () => window.removeEventListener('https:https:complete', onDone as any)
  }, [isHttpsRoom, editModeEnabled, httpsSuccessOpen])

  // Firewall room: education overlay when traffic is blocked by rule evaluation.
  // - outbound: LAN → WAN blocked (Phase: PKI / Rule Evaluation)
  // - inbound:  WAN → LAN blocked (Phase: HTTPS / Enforced Outcome)
  const [firewallBlockedEducation, setFirewallBlockedEducation] = useState<{
    direction: 'outbound' | 'inbound'
    protocol: string
    port: number
    decision: { action: string; matchedRuleIndex: number | null; matchedRuleId: string | null }
    reason: string
  } | null>(null)
  const lastFirewallBlockedKeyRef = useRef<string | null>(null)

  // Trigger the firewall blocked overlay from flowState updates (RoomScene emits { status:'blocked', decision }).
  useEffect(() => {
    if (config.id !== 'firewall') return
    const status = String((flowState as any)?.status || '')
    const phase = String((flowState as any)?.phase || '').toUpperCase()

    // Clear overlay when flow resets
    if (status === 'idle') {
      lastFirewallBlockedKeyRef.current = null
      if (firewallBlockedEducation) setFirewallBlockedEducation(null)
      return
    }

    if (status !== 'blocked') return

    const decision = (flowState as any)?.decision
    if (!decision) return

    const direction: 'outbound' | 'inbound' = phase === 'HTTPS' ? 'inbound' : 'outbound'
    const protocol = 'TCP'
    const port = 443

    const key = `${direction}:${decision.action}:${decision.matchedRuleIndex ?? 'default'}`
    if (lastFirewallBlockedKeyRef.current === key) return
    lastFirewallBlockedKeyRef.current = key

    const reason =
      direction === 'outbound'
        ? 'Outbound traffic from the LAN to the Internet is blocked by your firewall policy.'
        : 'Inbound traffic from the Internet into the LAN is blocked by your firewall policy.'

    setFirewallBlockedEducation({
      direction,
      protocol,
      port,
      decision: {
        action: String(decision.action || 'DENY'),
        matchedRuleIndex: (decision.matchedRuleIndex ?? null) as any,
        matchedRuleId: (decision.matchedRuleId ?? null) as any,
      },
      reason,
    })
  }, [config.id, flowState, firewallBlockedEducation])

  useEffect(() => {
    const onSim = () => {
      setAttackEducation(null)
      setSecuredEducation(null)
    }
    window.addEventListener('firewall:simulate-attack', onSim as any)
    return () => window.removeEventListener('firewall:simulate-attack', onSim as any)
  }, [])

  useEffect(() => {
    if (!attackEducation && !securedEducation && !firewallIntroOpen && !vpnIntroOpen && !httpsIntroOpen && !httpsTroubleOpen && !vpnBlockedEducation && !vpnAllowedEducation && !firewallBlockedEducation && !httpsHttpEducationOpen && !httpsSuccessOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAttackEducation(null)
        setSecuredEducation(null)
        setFirewallIntroOpen(false)
        setVpnIntroOpen(false)
        setHttpsIntroOpen(false)
        setHttpsTroubleOpen(false)
        setVpnBlockedEducation(null)
        setVpnAllowedEducation(null)
        setFirewallBlockedEducation(null)
        setHttpsHttpEducationOpen(false)
        setHttpsSuccessOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attackEducation, securedEducation, firewallIntroOpen, vpnIntroOpen, httpsIntroOpen, httpsTroubleOpen, vpnBlockedEducation, vpnAllowedEducation, firewallBlockedEducation, httpsHttpEducationOpen, httpsSuccessOpen])
  
  return (
    <div className="h-screen w-full relative">
      <GlobalStatsInitializer />
      {/* WelcomeMessage removed */}
      <Canvas
        camera={{
          position: config.camera?.position || [0, 1.8, 10],
          fov: config.camera?.fov || 75,
          near: 0.5,
          far: 200
        }}
        shadows={false}
        /* ✅ IMPORTANT: turn OFF log depth; cap DPR; set ACES/sRGB + modest exposure */
        gl={{
          antialias: true,
          logarithmicDepthBuffer: false,    // ← fix banding artifacts
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
          precision: 'highp',
          premultipliedAlpha: false,
          failIfMajorPerformanceCaveat: false
        }}
        /* Cap DPR for performance on lower-end devices (prevents full Retina render cost) */
        dpr={[1, 1.5]}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
          // Ensure a stable black clear between suspense states to avoid white flashes
          gl.setClearColor(0x000000, 1)
          scene.background = null
        }}
        frameloop="always"
        onClick={(event) => {
          // Skip if interactive handles are active/hovered
          const globalState = (typeof window !== 'undefined') ? (window as any).globalGizmoState : undefined
          if (globalState?.isDragging || globalState?.isHovering) {
            return
          }
          // This fires when Canvas is clicked and no child stopped propagation
          if (editModeEnabled && selectedModelId !== null) {
            setSelectedModelId(null)
            console.log('🚫 CANVAS: Clicked outside GLB models - deselecting all')
          }
        }}
      >
        <RenderDebugProbe />
        <HideTransparentDebug />
        <KTX2Support />
        {/* Avoid suspending the whole scene to prevent flicker; per-model suspense handles GLB loading */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            <RoomScene
              config={config}
              quality={quality}
              qualityPreset={qualityPreset}
              onLoad={handleObjectLoad}
              onError={handleObjectError}
              onPerformanceUpdate={handlePerformanceUpdate}
              onFlowUpdate={setFlowState}
              onAttackCompromised={(detail) => { setSecuredEducation(null); setAttackEducation(detail) }}
              onAttackBlocked={(detail) => { setAttackEducation(null); setSecuredEducation(detail) }}
              onVpnBlocked={(detail) => {
                setVpnBlockedEducation(detail)
                try { window.dispatchEvent(new CustomEvent('vpn:blocked', { detail })) } catch {}
              }}
              onVpnAllowed={(detail) => {
                setVpnAllowedEducation(detail)
                try { window.dispatchEvent(new CustomEvent('vpn:allowed', { detail })) } catch {}
              }}
              flowState={flowState}
              editModeEnabled={editModeEnabled}
              selectedModelId={selectedModelId}
              setSelectedModelId={setSelectedModelId}
              selectedModelInfo={selectedModelInfo}
              setSelectedModelInfo={setSelectedModelInfo}
              showCenterDebug={showCenterDebug}
              savedLayout={savedLayoutState}
              onLayoutChange={handleLayoutChange}
              devPerformanceMode={devPerformanceMode}
              restoreTrace={restoreTrace}
              onRestoreApplied={handleRestoreAppliedFromChild}
              isolatePacket={isolatePacket}
              isFullyLoaded={isFullyLoaded}
            />
          </Physics>
        </Suspense>
        
        <FirstPersonControls config={config} />
        <CameraCollision config={config} enabled={true} debug={false} collisionDistance={0.6} />
        <PerformanceStatsCollector />
      </Canvas>
      
      <RoomInfo 
        config={config} 
        progress={totalProgress} 
        errors={errors} 
      />

      {/* Live Flow HUD */}
      <LiveFlowHUD flow={flowState} roomId={config.id} roomObjects={config.objects} hidePhaseSelect={useNewPhaseUI} />

      {/* Firewall Rules (screen overlay) */}
      <FirewallRulesOverlay roomId={config.id} />

      {/* Firewall Mission (screen overlay) */}
      <FirewallMissionOverlay roomId={config.id} roomObjects={config.objects} />

      {/* Generic Mission (screen overlay for non-firewall rooms) */}
      <RoomMissionOverlay roomId={config.id} />

      {/* HTTPS room: HTTPS success panel (shown after HTTPS response returns to LAN Desktop) */}
      {isHttpsRoom && !editModeEnabled && httpsSuccessOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="HTTPS success"
          data-loc="src/components/VirtualRoom.tsx:https-success"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9686,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 22,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>GOOD JOB</div>
                <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: '#dcfce7' }}>Secure HTTPS connection established</div>
                <div style={{ marginTop: 10, fontSize: 16.5, color: '#cbd5e1', lineHeight: 1.7 }}>
                  Your encrypted HTTPS response returned to the LAN Desktop. The session is now protected by TLS.
                </div>
              </div>
              <button
                onClick={() => setHttpsSuccessOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  background: 'rgba(20, 83, 45, 0.25)',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{
                border: '1px solid rgba(34, 197, 94, 0.22)',
                background: 'rgba(20, 83, 45, 0.12)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#dcfce7' }}>What HTTPS gives you</div>
                <ul style={{ marginTop: 8, paddingLeft: 18, color: '#bbf7d0', lineHeight: 1.75 }}>
                  <li><strong>Confidentiality:</strong> application data is encrypted (ciphertext on the wire).</li>
                  <li><strong>Integrity:</strong> tampering is detected by TLS.</li>
                  <li><strong>Authentication:</strong> certificate validation confirms the server identity.</li>
                </ul>
              </div>

              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(2, 6, 23, 0.35)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>Attacker visibility (important nuance)</div>
                <div style={{ marginTop: 8, color: '#cbd5e1', lineHeight: 1.75 }}>
                  An attacker can still <strong>capture</strong> packets on the path (MITM / eavesdropping), but with HTTPS they can’t read the contents.
                  They will see <strong>encrypted</strong> data instead of plaintext.
                </div>
                <div style={{ marginTop: 10, color: '#93c5fd', lineHeight: 1.7 }}>
                  Note: some metadata can still be visible (IPs, timing, and sometimes the domain via SNI), but the page content and credentials are protected.
                </div>
              </div>

              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(2, 6, 23, 0.35)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>Try it in Terminal</div>
                <div style={{ marginTop: 8, color: '#cbd5e1', lineHeight: 1.75 }}>
                  Run <strong>curl https://web-server</strong> and notice it succeeds only after HTTPS is fixed.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'restart' } })) } catch {}
                  setHttpsSuccessOpen(false)
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#dbeafe',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Replay
              </button>
              <button
                onClick={() => setHttpsSuccessOpen(false)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTTPS room: HTTP warning panel (shown after HTTP response returns to LAN Desktop) */}
      {isHttpsRoom && !editModeEnabled && httpsHttpEducationOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="HTTP security warning"
          data-loc="src/components/VirtualRoom.tsx:https-http-education"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9685,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 22,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.6, color: '#fca5a5' }}>SECURITY WARNING</div>
                <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: '#fee2e2' }}>HTTP traffic is readable and modifiable</div>
                <div style={{ marginTop: 10, fontSize: 16.5, color: '#cbd5e1', lineHeight: 1.7 }}>
                  Your HTTP request + response returned to the LAN Desktop. Because HTTP is plaintext, anyone on the path can steal a copy of the packets.
                </div>
              </div>
              <button
                onClick={() => setHttpsHttpEducationOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.25)',
                  background: 'rgba(127, 29, 29, 0.25)',
                  color: '#fee2e2',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{
                border: '1px solid rgba(248, 113, 113, 0.22)',
                background: 'rgba(127, 29, 29, 0.12)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fee2e2' }}>What an attacker can do on HTTP</div>
                <ul style={{ marginTop: 8, paddingLeft: 18, color: '#fecaca', lineHeight: 1.75 }}>
                  <li><strong>Read</strong> the data (credentials, cookies, pages).</li>
                  <li><strong>Modify</strong> the data (inject scripts, alter downloads, change form posts).</li>
                  <li><strong>Impersonate</strong> the server (no built-in identity verification).</li>
                </ul>
              </div>

              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(2, 6, 23, 0.35)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>Important nuance: MITM can exist on both HTTP and HTTPS</div>
                <div style={{ marginTop: 8, color: '#cbd5e1', lineHeight: 1.75 }}>
                  A Man-in-the-Middle can still <strong>intercept / relay</strong> traffic even when you use HTTPS.
                  The difference is what they can learn or change:
                </div>
                <ul style={{ marginTop: 8, paddingLeft: 18, color: '#cbd5e1', lineHeight: 1.75 }}>
                  <li><strong>HTTP:</strong> the attacker can read and modify the application data directly.</li>
                  <li><strong>HTTPS (when TLS is valid):</strong> the attacker can capture packets, but the contents are <strong>encrypted</strong> and tampering is <strong>detected</strong>.</li>
                </ul>
                <div style={{ marginTop: 10, color: '#93c5fd', lineHeight: 1.7 }}>
                  That’s why the <strong>TLS Handshake + certificate validation</strong> matters: it prevents a MITM from silently decrypting/modifying your data.
                </div>
              </div>

              <div style={{
                border: '1px solid rgba(167, 139, 250, 0.22)',
                background: 'rgba(76, 29, 149, 0.12)',
                borderRadius: 14,
                padding: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f5f3ff' }}>What to do next in this lesson</div>
                <div style={{ marginTop: 8, color: '#ddd6fe', lineHeight: 1.75 }}>
                  1) Run the <strong>TLS Handshake</strong> (PKI phase) to establish encryption.
                  <br />
                  2) Then use <strong>HTTPS</strong> so application data is encrypted.
                  <br />
                  <br />
                  In this room, <strong>HTTPS is currently broken</strong>. Click <strong>Fix HTTPS</strong> to troubleshoot and repair it.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  // Move the phase-driven UI to TLS Handshake, and sync the underlying flow runner to PKI.
                  try { setCurrentPhase('handshake') } catch {}
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                  setHttpsHttpEducationOpen(false)
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#dbeafe',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Go to TLS Handshake (PKI)
              </button>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                  setHttpsHttpEducationOpen(false)
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'rgba(127, 29, 29, 0.22)',
                  color: '#fee2e2',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Fix HTTPS
              </button>
              <button
                onClick={() => setHttpsHttpEducationOpen(false)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(2, 6, 23, 0.25)',
                  color: '#e5e7eb',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTTPS room: Troubleshoot HTTPS (guided, multiple-choice; resets on reload) */}
      {isHttpsRoom && !editModeEnabled && httpsTroubleOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Troubleshoot HTTPS"
          data-loc="src/components/VirtualRoom.tsx:https-troubleshooter"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9695,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Match VPN quiz frame spacing
            padding: '48px 20px',
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(167, 139, 250, 0.28)',
              borderRadius: 24,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 28,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.6, color: '#c4b5fd' }}>TROUBLESHOOT HTTPS</div>
                <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900, color: '#f5f3ff' }}>Fix Broken HTTPS</div>
                <div style={{ marginTop: 10, fontSize: 17, color: '#cbd5e1', lineHeight: 1.65 }}>
                  Answer the questions to restore a secure TLS connection. Some answers can be found using the <strong>Terminal</strong>.
                </div>
              </div>
              <button
                onClick={() => setHttpsTroubleOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(167, 139, 250, 0.22)',
                  background: 'rgba(76, 29, 149, 0.22)',
                  color: '#f5f3ff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Progress: {httpsTroubleFixedCount}/{httpsTroubleSteps.length}
              </div>
              <button
                onClick={() => {
                  const stage = httpsTroubleStage
                  const msg =
                    stage === 'hostname'
                      ? "curl: (60) SSL: certificate does not match host 'web-server' (hostname mismatch)"
                      : stage === 'ca'
                        ? 'curl: (60) SSL certificate problem: unable to get local issuer certificate (unknown CA)'
                        : stage === 'time'
                          ? 'curl: (60) SSL certificate problem: certificate expired / not yet valid (time invalid)'
                          : stage === 'tls'
                            ? 'curl: (35) TLS handshake failed: protocol_version (TLS version mismatch)'
                            : 'HTTPS OK: secure connection established'
                  setHttpsTroubleTestMsg(msg)
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#dbeafe',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Retest HTTPS
              </button>
            </div>

            {httpsTroubleTestMsg ? (
              <div
                style={{
                  marginTop: 12,
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(2, 6, 23, 0.35)',
                  borderRadius: 14,
                  padding: 14,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 13,
                  color: '#e5e7eb',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {httpsTroubleTestMsg}
              </div>
            ) : null}

            {/* Quiz-style layout (matches VPN quiz structure) */}
            {httpsTroubleOk ? (
              <div style={{
                marginTop: 18,
                border: '1px solid rgba(34, 197, 94, 0.28)',
                background: 'rgba(20, 83, 45, 0.14)',
                borderRadius: 16,
                padding: 18,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>ALL FIXED</div>
                <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, color: '#dcfce7' }}>HTTPS is ready</div>
                <div style={{ marginTop: 10, fontSize: 16.5, color: '#cbd5e1', lineHeight: 1.7 }}>
                  You can now switch to the <strong>HTTPS</strong> phase. The attacker will only see <strong>Encrypted</strong>.
                </div>

                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'HTTPS' } })) } catch {}
                      try { if (useNewPhaseUI) setCurrentPhase('https') } catch {}
                      setHttpsTroubleOpen(false)
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: '1px solid rgba(34, 197, 94, 0.28)',
                      background: 'rgba(34, 197, 94, 0.18)',
                      color: '#dcfce7',
                      fontWeight: 900,
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Switch to HTTPS phase
                  </button>
                  <button
                    onClick={() => setHttpsTroubleOpen(false)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: '1px solid rgba(148, 163, 184, 0.22)',
                      background: 'rgba(148, 163, 184, 0.08)',
                      color: '#e5e7eb',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
                  {httpsTroubleSteps.map((s, idx) => {
                    const chosen = String((httpsTroubleAnswers as any)[s.key] || '')
                    const done = !!chosen && chosen === String(s.correctId)
                    const active = idx === httpsTroubleStageIndex
                    const locked = idx !== httpsTroubleStageIndex

                    const badgeColor = done ? '#22c55e' : active ? '#a78bfa' : '#64748b'
                    const badgeBg = done ? 'rgba(34, 197, 94, 0.16)' : active ? 'rgba(167, 139, 250, 0.16)' : 'rgba(100, 116, 139, 0.12)'
                    const badgeBorder = done ? 'rgba(34, 197, 94, 0.28)' : active ? 'rgba(167, 139, 250, 0.28)' : 'rgba(100, 116, 139, 0.22)'

                    return (
                      <div
                        key={s.key}
                        style={{
                          border: active ? '1px solid rgba(167, 139, 250, 0.35)' : '1px solid rgba(148, 163, 184, 0.18)',
                          background: 'rgba(15, 23, 42, 0.55)',
                          borderRadius: 16,
                          padding: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ flex: '1 1 auto' }}>
                            <div style={{ fontSize: 15, fontWeight: 900, color: '#e5e7eb', lineHeight: 1.55 }}>
                              {idx + 1}. {s.title}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13.5, color: '#94a3b8', lineHeight: 1.55 }}>
                              {s.problem}
                            </div>
                          </div>

                          <div
                            style={{
                              flex: '0 0 auto',
                              marginTop: 2,
                              padding: '6px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 900,
                              letterSpacing: 0.6,
                              border: `1px solid ${badgeBorder}`,
                              background: badgeBg,
                              color: badgeColor,
                              userSelect: 'none',
                              lineHeight: 1,
                            }}
                          >
                            {done ? 'FIXED' : active ? 'ACTIVE' : 'LOCKED'}
                          </div>
                        </div>

                        {active && s.howToFind ? (
                          <div style={{ marginTop: 10, fontSize: 13.5, color: '#93c5fd', lineHeight: 1.6 }}>
                            <strong>How to find the answer:</strong> {s.howToFind}
                          </div>
                        ) : null}

                        <div style={{ marginTop: 12, fontSize: 14.5, fontWeight: 900, color: locked ? '#64748b' : '#e5e7eb' }}>
                          {s.question}
                        </div>

                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                          {s.options.map((opt: any) => {
                            const selected = chosen === String(opt.id)
                            return (
                              <button
                                key={String(opt.id)}
                                disabled={locked}
                                onClick={() => {
                                  setHttpsTroubleAnswers((prev) => ({
                                    ...(prev as any),
                                    [s.key]: String(opt.id),
                                  }))
                                  setHttpsTroubleTestMsg('')
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '10px 12px',
                                  borderRadius: 12,
                                  border: selected
                                    ? '1px solid rgba(167, 139, 250, 0.42)'
                                    : '1px solid rgba(148, 163, 184, 0.18)',
                                  background: selected
                                    ? 'rgba(167, 139, 250, 0.14)'
                                    : 'rgba(2, 6, 23, 0.22)',
                                  color: locked ? '#64748b' : '#e5e7eb',
                                  cursor: locked ? 'not-allowed' : 'pointer',
                                  textAlign: 'left',
                                  lineHeight: 1.35,
                                  fontSize: 14,
                                  fontWeight: 800,
                                  opacity: locked ? 0.65 : 1,
                                }}
                              >
                                <span style={{ width: 18, textAlign: 'center', color: selected ? '#c4b5fd' : '#94a3b8', fontWeight: 900 }}>
                                  {selected ? '●' : '○'}
                                </span>
                                <span>{String(opt.label)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setHttpsTroubleOpen(false)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: '1px solid rgba(148, 163, 184, 0.22)',
                      background: 'rgba(148, 163, 184, 0.08)',
                      color: '#e5e7eb',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Firewall room: education overlay when rules block traffic */}
      {config.id === 'firewall' && firewallBlockedEducation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={firewallBlockedEducation.direction === 'outbound' ? 'Outbound traffic blocked' : 'Inbound traffic blocked'}
          data-loc="src/components/VirtualRoom.tsx:firewall-blocked-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9680,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.6, color: '#fca5a5' }}>BLOCKED BY FIREWALL POLICY</div>
                <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900, color: '#fee2e2' }}>
                  {firewallBlockedEducation.direction === 'outbound' ? 'Outbound traffic blocked' : 'Inbound traffic blocked'}
                </div>
                <div style={{ marginTop: 10, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {firewallBlockedEducation.reason}
                </div>
              </div>
              <button
                onClick={() => setFirewallBlockedEducation(null)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.25)',
                  background: 'rgba(127, 29, 29, 0.25)',
                  color: '#fee2e2',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(248, 113, 113, 0.35)',
                background: 'rgba(127, 29, 29, 0.22)',
                color: '#fecaca',
              }}>
                {firewallBlockedEducation.direction === 'outbound' ? 'LAN → WAN' : 'WAN → LAN'} • {firewallBlockedEducation.protocol}/{firewallBlockedEducation.port}
              </div>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Decision: {String(firewallBlockedEducation.decision.action || 'DENY')}{firewallBlockedEducation.decision.matchedRuleIndex != null ? ` (Matched Rule ${firewallBlockedEducation.decision.matchedRuleIndex + 1})` : ' (Default: no match)'}
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 18, color: '#e5e7eb', lineHeight: 1.65 }}>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>Why did this happen?</strong> Firewalls are typically configured with a <strong>default-deny</strong> posture:
                only explicitly approved traffic is allowed. This prevents accidental exposure and reduces the attack surface.
              </p>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>How to allow this traffic:</strong> Open <strong>Firewall Rules</strong> and set the relevant rule to <strong>ALLOW</strong>.
                In this learning room we use a simplified model that requires <strong>both directions</strong> to be allowed for the connection to work.
              </p>
              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(15, 23, 42, 0.55)',
                borderRadius: 16,
                padding: 17,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 10 }}>Recommended rules for HTTPS demo:</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 18, fontWeight: 800, color: '#86efac' }}>
                  LAN → WAN • TCP/443 • ALLOW
                </div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 18, fontWeight: 800, color: '#86efac', marginTop: 6 }}>
                  WAN → LAN • TCP/443 • ALLOW
                </div>
              </div>
              <p style={{ margin: 0 }}>
                After updating rules, click <strong>Start</strong> again to rerun the simulation.
              </p>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  // Avoid UI overlap: close this teaching panel, then open the rules UI.
                  setFirewallBlockedEducation(null)
                  try { showFirewallRulesPanel() } catch {}
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#dbeafe',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Open Firewall Rules
              </button>
              <button
                onClick={() => setFirewallBlockedEducation(null)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(2, 6, 23, 0.22)',
                  color: '#e5e7eb',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VPN room: education overlay when firewall blocks access without VPN */}
      {config.id === 'vpn' && vpnBlockedEducation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="VPN required"
          data-loc="src/components/VirtualRoom.tsx:vpn-blocked-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.6, color: '#fca5a5' }}>ACCESS DENIED</div>
                <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900, color: '#fee2e2' }}>VPN Required</div>
            <div style={{ marginTop: 10, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
                  The firewall will not forward public Internet traffic directly into the LAN. To reach internal resources,
                  you must establish a VPN first.
                </div>
                <div style={{ marginTop: 10, fontSize: 16.5, color: '#cbd5e1', lineHeight: 1.7 }}>
                  <strong>Eavesdropping note:</strong> On the public Internet, third parties can still <em>capture</em> packets in transit.
                  Without a VPN tunnel, they may be able to read metadata (and sometimes content). With a VPN tunnel, the packet
                  can be stolen—but the payload is encrypted, so the eavesdropper can’t read it.
                </div>
              </div>
              <button
                onClick={() => setVpnBlockedEducation(null)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.25)',
                  background: 'rgba(127, 29, 29, 0.25)',
                  color: '#fee2e2',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Remote User Public IP: {vpnBlockedEducation.srcIp}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Firewall Public IP: {vpnBlockedEducation.dstIp}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Traffic: {vpnBlockedEducation.protocol}/{vpnBlockedEducation.port}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(248, 113, 113, 0.35)',
                background: 'rgba(127, 29, 29, 0.22)',
                color: '#fecaca',
              }}>
                Firewall decision: DENY
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 17, color: '#e5e7eb', lineHeight: 1.65 }}>
              <p style={{ margin: '0 0 12px 0' }}>
                <strong>Why was it blocked?</strong> {vpnBlockedEducation.reason}
              </p>
              <p style={{ margin: '0 0 12px 0' }}>
                <strong>What an eavesdropper can do right now:</strong> Because this traffic is crossing the public Internet without a VPN tunnel,
                a passive eavesdropper can capture the packets and inspect what’s inside.
              </p>
              <p style={{ margin: 0 }}>
                <strong>What you should do:</strong> Enable the VPN to create an authenticated, encrypted tunnel into the network.
                Even if packets are captured on the Internet, the eavesdropper won’t be able to read the data.
              </p>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('vpn:active', { detail: { active: true, source: 'panel' } })) } catch {}
                  setVpnBlockedEducation(null)
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Enable VPN
              </button>
              <button
                onClick={() => setVpnBlockedEducation(null)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(2, 6, 23, 0.25)',
                  color: '#e5e7eb',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VPN room: education overlay when firewall allows VPN traffic into the LAN */}
      {config.id === 'vpn' && vpnAllowedEducation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="VPN access granted"
          data-loc="src/components/VirtualRoom.tsx:vpn-allowed-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>ACCESS GRANTED</div>
                <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900, color: '#dcfce7' }}>Secure Access via VPN</div>
                <div style={{ marginTop: 10, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
                  Your traffic arrived through the VPN tunnel. The firewall inspected it and allowed it into the LAN.
                </div>
                <div style={{ marginTop: 10, fontSize: 16.5, color: '#cbd5e1', lineHeight: 1.7 }}>
                  <strong>Eavesdropping note:</strong> An eavesdropper can still capture packets on the Internet,
                  but VPN encryption turns the contents into ciphertext—so the stolen packet can’t be read.
                </div>
              </div>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('vpn:continue')) } catch {}
                  setVpnAllowedEducation(null)
                }}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  background: 'rgba(20, 83, 45, 0.25)',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                VPN-assigned IP: {vpnAllowedEducation.srcIp}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                LAN Server IP: {vpnAllowedEducation.dstIp}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Traffic: {vpnAllowedEducation.protocol}/{vpnAllowedEducation.port}
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(34, 197, 94, 0.35)',
                background: 'rgba(20, 83, 45, 0.22)',
                color: '#bbf7d0',
              }}>
                Firewall decision: ALLOW
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
              }}>
                Zone: VPN → LAN
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 17, color: '#e5e7eb', lineHeight: 1.65 }}>
              <p style={{ margin: '0 0 12px 0' }}>
                <strong>Why was it allowed?</strong> {vpnAllowedEducation.reason}
              </p>
              <p style={{ margin: '0 0 12px 0' }}>
                <strong>Benefits of VPN:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7, display: 'grid', gap: 6 }}>
                <li>
                  <strong>Encryption</strong>: even if an eavesdropper steals the packet on the Internet, they can’t read the contents.
                </li>
                <li><strong>Authentication</strong>: only trusted users/devices can enter the network.</li>
                <li><strong>Access control</strong>: firewall policies can allow “VPN → LAN” while still blocking “WAN → LAN”.</li>
              </ul>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('vpn:continue')) } catch {}
                  setVpnAllowedEducation(null)
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTTPS room introduction (shows on every load in View mode) */}
      {config.id === 'https' && !editModeEnabled && httpsIntroOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="HTTPS room introduction"
          data-loc="src/components/VirtualRoom.tsx:https-intro-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9650,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Match VPN Learn frame: more breathing room top/bottom
            padding: '48px 20px',
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(1060px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(167, 139, 250, 0.35)',
              borderRadius: 24,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: 0.15,
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              padding: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1.6, color: '#c4b5fd' }}>WELCOME</div>
                <div style={{ marginTop: 10, fontSize: 31, fontWeight: 900, color: '#f5f3ff' }}>HTTPS Room</div>
                <div style={{ marginTop: 12, fontSize: 18, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.25 }}>
                  Learn <strong>HTTP vs HTTPS</strong> by watching real packet flows and an attacker on the path. This room intentionally starts with
                  <strong> broken HTTPS</strong> — your job is to troubleshoot it and restore a secure TLS connection.
                </div>
              </div>
              <button
                onClick={() => setHttpsIntroOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(167, 139, 250, 0.22)',
                  background: 'rgba(76, 29, 149, 0.22)',
                  color: '#f5f3ff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 22, display: 'grid', gap: 18 }}>
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Learning goals</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 16, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li>See why <strong>HTTP</strong> is unsafe: packets are readable + modifiable on the wire.</li>
                  <li>Understand what <strong>TLS</strong> adds: confidentiality (encryption), integrity (tamper detection), and authentication (cert validation).</li>
                  <li>Learn the core nuance: attackers can still <strong>capture</strong> traffic on both HTTP and HTTPS — HTTPS changes what they can learn/change.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid rgba(248, 113, 113, 0.22)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>HTTP (Unencrypted Communication)</div>
                <div style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 10 }}>
                  <div>
                    <strong>HTTP (Hypertext Transfer Protocol)</strong> is the basic protocol used by browsers and web servers to exchange data.
                    When HTTP is used, all information is sent in <strong>plaintext</strong>, meaning it can be read by anyone who intercepts the traffic while it travels across the Internet.
                  </div>
                  <div>
                    This includes URLs, form data, and potentially sensitive information like usernames or passwords. Because the Internet is a shared and untrusted environment,
                    HTTP provides <strong>no protection</strong> against eavesdropping or tampering.
                  </div>
                  <div style={{ color: '#fecaca' }}>
                    Anyone on the network path — such as attackers on public Wi‑Fi or compromised network devices — can observe or capture HTTP traffic.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(34, 197, 94, 0.22)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>HTTPS (Encrypted Communication)</div>
                <div style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 10 }}>
                  <div>
                    <strong>HTTPS (HTTP Secure)</strong> is the secure version of HTTP that protects data using <strong>TLS (Transport Layer Security)</strong>.
                    Before any web data is exchanged, the browser and server perform a <strong>TLS handshake</strong> to verify the server’s identity using digital certificates
                    and establish encryption keys.
                  </div>
                  <div>
                    Once the secure session is created, all HTTP data is <strong>encrypted</strong>, making it unreadable to attackers even if they capture the packets.
                    HTTPS protects confidentiality, ensures data integrity, and helps users trust that they are communicating with the legitimate server.
                  </div>
                  <div style={{ color: '#bbf7d0' }}>
                    This is why modern websites rely on HTTPS by default — it enables safe communication over an otherwise untrusted Internet.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(167, 139, 250, 0.22)', background: 'rgba(76, 29, 149, 0.10)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#f5f3ff', marginBottom: 12 }}>Key takeaway (what changes on the wire)</div>
                <div style={{ display: 'grid', gap: 14, color: '#ddd6fe', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2 }}>
                  <div style={{ borderLeft: '3px solid rgba(248, 113, 113, 0.55)', paddingLeft: 12 }}>
                    <strong>HTTP:</strong> can be <strong>read</strong> and often <strong>modified</strong> by anyone on the path.
                  </div>
                  <div style={{ borderLeft: '3px solid rgba(34, 197, 94, 0.55)', paddingLeft: 12 }}>
                    <strong>HTTPS:</strong> can still be captured, but the payload becomes <strong>Encrypted</strong> and tampering is detected.
                  </div>
                  <div style={{ color: '#cbd5e1' }}>
                    <strong>Important nuance:</strong> HTTPS doesn’t stop capture — it protects <strong>confidentiality</strong> and <strong>integrity</strong> and authenticates the server when the certificate is valid.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>TLS handshake (simplified)</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li>Client connects to the server and requests HTTPS.</li>
                  <li>Server presents a <strong>certificate</strong> (includes the server identity + public key, signed by a CA).</li>
                  <li>Client verifies the certificate: <strong>hostname match</strong>, <strong>trusted CA</strong>, and <strong>valid time window</strong>.</li>
                  <li>Client + server agree on encryption parameters and derive shared session keys.</li>
                  <li>Now HTTP messages are sent, but inside an <strong>encrypted TLS tunnel</strong>.</li>
                </ol>
                <div style={{ marginTop: 12, fontSize: 14, color: '#94a3b8' }}>
                  In this room, you’ll see the handshake as its own phase, then you’ll troubleshoot common failures.
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Common HTTPS failures you will fix</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  {httpsTroubleSteps.map((s) => (
                    <li key={s.key}>
                      <strong>{s.title}:</strong> {s.problem}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 12, border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(2, 6, 23, 0.35)', borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 14, color: '#e5e7eb', marginBottom: 6, fontWeight: 800 }}>Useful Terminal checks</div>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
                    curl https://web-server
                    <br />
                    openssl_connect web-server
                    <br />
                    date
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Topology (high level)</div>
                <div style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 6 }}>
                  <div><strong>LAN Desktop</strong>: {httpsIntroNet.lanDesktopHost} ({httpsIntroNet.lanDesktopIp})</div>
                  <div><strong>LAN Switch</strong>: {httpsIntroNet.switchMgmtIp} (mgmt)</div>
                  <div><strong>LAN Router</strong>: {httpsIntroNet.routerLanIp}</div>
                  <div><strong>Web Server</strong>: {httpsIntroNet.webServerHost} ({httpsIntroNet.webServerIp})</div>
                  <div><strong>Attacker</strong>: {httpsIntroNet.attackerHost} ({httpsIntroNet.attackerIp}) — on the WAN path</div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(2, 6, 23, 0.35)',
                    borderRadius: 14,
                    padding: 14,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 14,
                    letterSpacing: 0,
                    color: '#e5e7eb',
                    whiteSpace: 'pre-wrap',
                  }}
                >
{`HTTP (plaintext):  LAN Desktop → Switch → Router → Internet → Web Server
HTTPS (encrypted):  LAN Desktop → Switch → Router → Internet → Web Server (TLS protected)`}
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Buttons you’ll use</div>
                <div style={{ display: 'grid', gap: 12, fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2 }}>
                  <div><strong>Live Flow</strong>: select phases and click <strong>Start</strong> to run the guided packet animation.</div>
                  <div><strong>Inspector</strong>: review devices and packet details during each phase.</div>
                  <div><strong>Terminal</strong>: run tests like <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>curl https://web-server</span> and <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>openssl_connect web-server</span>.</div>
                  <div><strong>Fix HTTPS</strong>: opens the troubleshooter to repair HTTPS (required before HTTPS phase unlocks).</div>
                  <div><strong>Mission</strong>: track progress and confirm you observed both plaintext and encrypted outcomes.</div>
                </div>
              </div>

            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'DNS' } })) } catch {}
                  setHttpsIntroOpen(false)
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  background: 'rgba(59, 130, 246, 0.18)',
                  color: '#dbeafe',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Start with HTTP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VPN room introduction (shows on every load in View mode) */}
      {config.id === 'vpn' && !editModeEnabled && vpnIntroOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="VPN room introduction"
          data-loc="src/components/VirtualRoom.tsx:vpn-intro-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9650,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // More breathing room so the frame isn't tight to the viewport
            padding: '48px 20px',
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(1060px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 24,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: 0.15,
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              padding: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>WELCOME</div>
                <div style={{ marginTop: 10, fontSize: 31, fontWeight: 900, color: '#dcfce7' }}>VPN Room</div>
                <div style={{ marginTop: 12, fontSize: 18, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.25 }}>
                  Learn what a <strong>VPN</strong> is, how it creates an <strong>encrypted tunnel</strong>, and why it’s used for
                  <strong> secure remote access</strong> — even when traffic is captured by an eavesdropper.
                </div>
              </div>
              <button
                onClick={() => setVpnIntroOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  background: 'rgba(20, 83, 45, 0.22)',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 22, display: 'grid', gap: 18 }}>
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>What is a VPN?</div>
                <div style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 10 }}>
                  <div>
                    A <strong>Virtual Private Network (VPN)</strong> is a technology that allows a device outside an organization (such as a laptop at home or on public Wi‑Fi)
                    to securely connect to a private internal network as if it were physically inside it.
                  </div>
                  <div>
                    A VPN works by creating an <strong>encrypted tunnel</strong> between the remote user and a trusted gateway (usually a firewall or VPN server).
                    While data travels across the public Internet, it is encrypted and unreadable to anyone who might intercept it, such as attackers, ISPs,
                    or compromised network devices.
                  </div>
                  <div>
                    Once the encrypted traffic reaches the VPN gateway, it is decrypted and safely forwarded into the internal network.
                    VPNs are important because the Internet is an untrusted environment — without a VPN, remote access attempts are typically blocked or exposed
                    to eavesdropping.
                  </div>
                  <div>
                    By providing <strong>encryption</strong>, <strong>authentication</strong>, and <strong>secure access control</strong>, a VPN protects sensitive data,
                    prevents unauthorized observation or tampering, and enables employees or users to safely access internal resources from anywhere in the world.
                  </div>

                  <div style={{ marginTop: 6 }}>
                    A <strong>Virtual Private Network (VPN)</strong> creates an <strong>encrypted tunnel</strong> between your remote device and a trusted network gateway
                    (here: the <strong>firewall</strong>).
                  </div>
                  <div>
                    VPNs are used for <strong>remote work</strong>, secure access from untrusted networks (coffee shop Wi‑Fi), and to enforce <strong>access control</strong>
                    (VPN users can be allowed into LAN resources while WAN users are blocked).
                  </div>
                  <div style={{ color: '#bbf7d0' }}>
                    Key idea: A VPN doesn’t stop capture on the Internet — it changes what can be learned: the payload becomes unreadable.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Topology (high level)</div>
                <div style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 6 }}>
                  <div><strong>Remote User (WAN)</strong>: {vpnIntroNet.remoteWanIp}</div>
                  <div><strong>Firewall (public)</strong>: {vpnIntroNet.firewallWanIp} (VPN gateway)</div>
                  <div><strong>VPN client IP (assigned)</strong>: {vpnIntroNet.vpnAssignedIp}</div>
                  <div><strong>LAN</strong>: {vpnIntroNet.lanSubnet} • Router {vpnIntroNet.routerLanIp} • Switch {vpnIntroNet.switchMgmtIp}</div>
                  <div><strong>Web Server (LAN)</strong>: {vpnIntroNet.lanServerIp} — HTTPS (TCP/443)</div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(2, 6, 23, 0.35)',
                    borderRadius: 14,
                    padding: 14,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 14,
                    letterSpacing: 0,
                    color: '#e5e7eb',
                    whiteSpace: 'pre-wrap',
                  }}
                >
{`No VPN:   Remote User → Internet → Firewall (blocked)
VPN ON:   Remote User → Internet → Firewall → Router → Switch → Web Server (allowed)`}
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>What to watch for</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 16, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li><strong>Eavesdropper</strong> pulls a copy of traffic from the Internet.</li>
                  <li><strong>No VPN</strong>: eavesdropper can read fields (red boxes).</li>
                  <li><strong>VPN ON</strong>: eavesdropper still captures, but sees <strong>Encrypted</strong> (green boxes).</li>
                  <li><strong>Firewall policy</strong>: blocks WAN → LAN by default, but allows VPN → LAN.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Buttons you’ll use</div>
                <div style={{ display: 'grid', gap: 12, fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2 }}>
                  <div><strong>Inspector</strong>: Review phases, packets, and devices.</div>
                  <div><strong>Start</strong>: Begin the guided traffic flow.</div>
                  <div><strong>Terminal</strong>: Run commands from the remote user’s perspective (e.g. <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>curl https://{vpnIntroNet.lanServerIp}</span>).</div>
                  <div><strong>VPN Toggle</strong>: Press <strong>V</strong> or run <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>vpn on</span>.</div>
                  <div><strong>Mission</strong>: Track progress (capture vs encrypted + access granted).</div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Recommended walkthrough</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 15, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li>Keep VPN <strong>OFF</strong> and click <strong>Start</strong>. Watch the eavesdropper read captured data.</li>
                  <li>Enable VPN (<strong>V</strong> or <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>vpn on</span>), then click <strong>Start</strong> again.</li>
                  <li>Confirm you get <strong>Access Granted</strong>, and traffic reaches the LAN web server.</li>
                  <li>Use the Terminal to test access: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>openssl_connect {vpnIntroNet.lanServerIp}</span>, <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>curl https://{vpnIntroNet.lanServerIp}</span>.</li>
                </ol>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(2, 6, 23, 0.35)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>How VPN works (real-world mental model)</div>
                <div style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 10 }}>
                  <div>
                    A VPN creates a <strong>virtual network interface</strong> on your device (a new “adapter”), then establishes an <strong>encrypted tunnel</strong>
                    to a trusted gateway (here: the firewall). Your apps send packets like normal, but VPN software wraps them.
                  </div>
                  <div>
                    Think of it as <strong>putting your original packet inside an encrypted envelope</strong>:
                    the Internet can still carry (and capture) the envelope, but it can’t read what’s inside.
                  </div>
                  <div style={{ borderLeft: '3px solid rgba(34,197,94,0.55)', paddingLeft: 12 }}>
                    <strong>Important:</strong> a VPN does <em>not</em> make you invisible. It protects confidentiality and helps enforce access control.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Why VPNs are used (common real-world scenarios)</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li><strong>Remote work:</strong> reach internal apps (intranet, dev tools, databases) from home.</li>
                  <li><strong>Secure access on untrusted networks:</strong> reduce risk on public Wi‑Fi.</li>
                  <li><strong>Access control:</strong> firewall can allow <strong>VPN → LAN</strong> while denying <strong>WAN → LAN</strong>.</li>
                  <li><strong>Site-to-site VPN:</strong> connect two offices so they behave like one network.</li>
                </ul>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.55)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>What VPN does and does NOT do</div>
                <div style={{ display: 'grid', gap: 10, color: '#cbd5e1', fontSize: 15, lineHeight: 1.8, letterSpacing: 0.2 }}>
                  <div style={{ borderLeft: '3px solid rgba(34,197,94,0.55)', paddingLeft: 12 }}>
                    <strong>VPN helps:</strong> encrypt traffic over the Internet, authenticate the gateway, and enable controlled access.
                  </div>
                  <div style={{ borderLeft: '3px solid rgba(251,146,60,0.55)', paddingLeft: 12 }}>
                    <strong>VPN does not automatically:</strong> stop malware, prevent phishing, or hide everything from websites you log into.
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>
                  In this room, focus on: <strong>capture vs encrypted</strong> + <strong>WAN blocked vs VPN allowed</strong>.
                </div>
              </div>

              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                {vpnQuizPassed
                  ? <>VPN quiz: <strong>completed</strong> (VPN enabling unlocked until reload).</>
                  : <>VPN quiz: you’ll be asked to complete a quick quiz before enabling VPN for the first time.</>
                }
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                Tip: You can reopen this anytime from the right drawer: <strong>Learn VPN</strong>.
              </div>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setVpnIntroOpen(false)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Start Learning
              </button>
            </div>
          </div>
        </div>
      )}


      {/* VPN enable quiz (required the first time you enable VPN per page load) */}
      {config.id === 'vpn' && !editModeEnabled && vpnQuizOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="VPN enable quiz"
          data-loc="src/components/VirtualRoom.tsx:vpn-quiz-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9655,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 20px',
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(980px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 24,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: 0.15,
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              padding: 28,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>CHECKPOINT</div>
                <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, color: '#dcfce7' }}>VPN Quiz</div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#cbd5e1', lineHeight: 1.75 }}>
                  Answer all <strong>{vpnQuizQuestions.length}</strong> questions correctly to enable VPN.
                  This resets when you reload the page.
                </div>
              </div>
              <button
                onClick={() => {
                  setVpnQuizOpen(false)
                  setPendingVpnPhaseId(null)
                  setVpnQuizAnswers({})
                  setVpnQuizSubmitted(false)
                  setVpnQuizError(null)
                }}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  background: 'rgba(20, 83, 45, 0.22)',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            {vpnQuizError && (
              <div style={{ marginTop: 14, border: '1px solid rgba(248, 113, 113, 0.28)', background: 'rgba(239, 68, 68, 0.12)', borderRadius: 14, padding: 12, color: '#fee2e2', fontWeight: 700 }}>
                {vpnQuizError}
              </div>
            )}

            <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
              {vpnQuizQuestions.map((q, idx) => {
                const chosen = vpnQuizAnswers[q.id]
                const missing = !chosen
                const incorrect = !!chosen && chosen !== q.correctId
                const highlight = vpnQuizSubmitted && (missing || incorrect)

                return (
                  <div
                    key={q.id}
                    style={{
                      border: highlight ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid rgba(148, 163, 184, 0.18)',
                      background: 'rgba(15, 23, 42, 0.55)',
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#e5e7eb', lineHeight: 1.55, flex: '1 1 auto' }}>
                        {idx + 1}. {q.prompt}
                      </div>

                      {/* Status badge (updates live after first submit) */}
                      {vpnQuizSubmitted && (
                        <div
                          style={{
                            flex: '0 0 auto',
                            marginTop: 2,
                            padding: '6px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            letterSpacing: 0.6,
                            border: !chosen
                              ? '1px solid rgba(148, 163, 184, 0.24)'
                              : chosen === q.correctId
                                ? '1px solid rgba(34, 197, 94, 0.35)'
                                : '1px solid rgba(248, 113, 113, 0.35)',
                            background: !chosen
                              ? 'rgba(148, 163, 184, 0.08)'
                              : chosen === q.correctId
                                ? 'rgba(34, 197, 94, 0.12)'
                                : 'rgba(239, 68, 68, 0.12)',
                            color: !chosen
                              ? '#94a3b8'
                              : chosen === q.correctId
                                ? '#86efac'
                                : '#fecaca',
                            userSelect: 'none',
                            lineHeight: 1,
                          }}
                        >
                          {!chosen ? 'UNANSWERED' : chosen === q.correctId ? 'CORRECT' : 'INCORRECT'}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      {q.options.map((opt) => {
                        const selected = chosen === opt.id
                        return (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setVpnQuizAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                              setVpnQuizError(null)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 12px',
                              borderRadius: 12,
                              border: selected
                                ? '1px solid rgba(34, 197, 94, 0.42)'
                                : '1px solid rgba(148, 163, 184, 0.18)',
                              background: selected
                                ? 'rgba(34, 197, 94, 0.12)'
                                : 'rgba(2, 6, 23, 0.22)',
                              color: '#e5e7eb',
                              cursor: 'pointer',
                              textAlign: 'left',
                              lineHeight: 1.35,
                              fontSize: 14,
                            }}
                          >
                            <span style={{ width: 18, textAlign: 'center', color: selected ? '#86efac' : '#94a3b8', fontWeight: 900 }}>
                              {selected ? '●' : '○'}
                            </span>
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setVpnQuizOpen(false)
                  setPendingVpnPhaseId(null)
                  setVpnQuizAnswers({})
                  setVpnQuizSubmitted(false)
                  setVpnQuizError(null)
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(148, 163, 184, 0.08)',
                  color: '#e5e7eb',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setVpnQuizSubmitted(true)

                  const missing = vpnQuizQuestions.filter((q) => !vpnQuizAnswers[q.id])
                  if (missing.length > 0) {
                    setVpnQuizError('Please answer all questions.')
                    return
                  }

                  const correct = vpnQuizQuestions.filter((q) => vpnQuizAnswers[q.id] === q.correctId).length
                  if (correct !== vpnQuizQuestions.length) {
                    setVpnQuizError(`Not quite — you got ${correct}/${vpnQuizQuestions.length} correct. Try again.`)
                    return
                  }

                  // Passed: unlock enable until reload, then enable VPN now.
                  setVpnQuizError(null)
                  setVpnQuizOpen(false)

                  const desiredPhase = pendingVpnPhaseId
                  setPendingVpnPhaseId(null)

                  setVpnQuizPassed(true)
                  setVpnActive(true, 'vpn-quiz')

                  if (desiredPhase) {
                    setCurrentPhase(desiredPhase)
                    try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                  }
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                Enable VPN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firewall room introduction (shows on every load in View mode) */}
      {config.id === 'firewall' && !editModeEnabled && firewallIntroOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Firewall room introduction"
          data-loc="src/components/VirtualRoom.tsx:firewall-intro-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9650,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Match VPN guide frame spacing
            padding: '48px 20px',
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(1060px, calc(100vw - 40px))',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: 24,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: 0.15,
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              padding: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1.6, color: '#93c5fd' }}>WELCOME</div>
                <div style={{ marginTop: 10, fontSize: 31, fontWeight: 900, color: '#e0f2fe' }}>Firewall Room</div>
                <div style={{ marginTop: 12, fontSize: 18, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.25 }}>
                  Learn how firewall rules control traffic between a protected <strong>LAN</strong> and the public <strong>WAN</strong> — then harden the
                  network by blocking an inbound <strong>SSH</strong> attack (<strong>TCP/22</strong>).
                </div>
              </div>
              <button
                onClick={() => setFirewallIntroOpen(false)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  background: 'rgba(30, 58, 138, 0.22)',
                  color: '#dbeafe',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 22, display: 'grid', gap: 18 }}>
              <div
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>What is a firewall?</div>
                <div style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 10 }}>
                  <div>
                    A <strong>firewall</strong> is a security system that sits between trusted networks (like an internal corporate LAN) and untrusted networks
                    (such as the Internet) and controls what traffic is allowed to pass between them.
                  </div>
                  <div>
                    It works by inspecting network packets and comparing their properties — such as source and destination IP addresses, ports, protocols, and
                    connection state — against a defined set of security rules. Based on these rules, the firewall decides whether to <strong>allow</strong>, <strong>block</strong>,
                    or <strong>log</strong> the traffic.
                  </div>
                  <div>
                    Firewalls are essential because, by default, any device connected to the Internet can be targeted by unwanted or malicious traffic.
                    A properly configured firewall reduces the attack surface, prevents unauthorized access, and enforces security boundaries between different
                    parts of a network.
                  </div>
                  <div>
                    In modern enterprise environments, firewalls often go beyond simple allow/deny decisions and perform <strong>stateful inspection</strong>, <strong>logging</strong>,
                    and traffic monitoring, making them a critical first line of defense for protecting internal systems and data.
                  </div>
                  <div style={{ color: '#bfdbfe' }}>
                    Key idea: The firewall is a <strong>policy enforcement point</strong> — it doesn’t just “see traffic”, it decides what is permitted.
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Learning goals</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 16, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li>Understand the <strong>default-deny</strong> posture: by default, the firewall blocks traffic until a rule explicitly allows it.</li>
                  <li>Modify firewall rules to allow required <strong>LAN ↔ WAN</strong> connectivity for normal browsing (e.g. LAN → WAN HTTPS and return traffic).</li>
                  <li>Use the Terminal (acts like <strong>{firewallIntroNet.lanDesktopHost}</strong>) to test and troubleshoot connectivity.</li>
                  <li>Harden the network by blocking the attacker: prevent <strong>WAN → LAN</strong> access on <strong>TCP/22</strong> (SSH).</li>
                </ul>
              </div>

              <div
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Topology (high level)</div>
                <div style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 6 }}>
                  <div><strong>LAN Desktop</strong>: {firewallIntroNet.lanDesktopIp} (gw {firewallIntroNet.lanGateway})</div>
                  <div><strong>LAN Switch</strong>: {firewallIntroNet.switchMgmtIp} (mgmt)</div>
                  <div><strong>LAN Router</strong>: {firewallIntroNet.routerLanIp}</div>
                  <div><strong>Firewall</strong>: inside {firewallIntroNet.firewallInsideIp} • outside {firewallIntroNet.firewallOutsideIp}</div>
                  <div><strong>Web Server</strong>: {firewallIntroNet.webServerHost} ({firewallIntroNet.webServerIp}) — HTTPS (TCP/443)</div>
                  <div><strong>Attacker</strong>: {firewallIntroNet.attackerHost} ({firewallIntroNet.attackerIp})</div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(2, 6, 23, 0.35)',
                    borderRadius: 14,
                    padding: 14,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 14,
                    letterSpacing: 0,
                    color: '#e5e7eb',
                    whiteSpace: 'pre-wrap',
                  }}
                >
{`Normal (HTTPS):  LAN Desktop → Switch → Router → Firewall → Internet → Web Server
Attack (SSH/22):   Attacker → Internet → Firewall → Router → Switch → LAN Desktop`}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Buttons you’ll use</div>
                <div style={{ display: 'grid', gap: 12, fontSize: 15, color: '#cbd5e1', lineHeight: 1.75, letterSpacing: 0.2 }}>
                  <div><strong>Inspector</strong>: Open the Inspector panel to review phases, packets, and devices in the room.</div>
                  <div><strong>Start</strong>: Begin the guided traffic flow so you can watch normal packets traverse the network.</div>
                  <div><strong>Terminal</strong>: Run troubleshooting commands from the LAN desktop’s perspective (ex: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>telnet {firewallIntroNet.webServerIp} 443</span>).</div>
                  <div><strong>Firewall Rules</strong>: View and modify allow/deny rules (direction • protocol • port).</div>
                  <div><strong>Simulate Attack</strong>: Launch an inbound SSH attempt (WAN → LAN • TCP/22) and observe allow vs deny.</div>
                  <div><strong>Mission</strong>: Open the step-by-step checklist and track your progress as you secure the LAN.</div>
                </div>
              </div>

              <div
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e5e7eb', marginBottom: 12 }}>Recommended walkthrough</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 15, lineHeight: 1.75, letterSpacing: 0.2, display: 'grid', gap: 8 }}>
                  <li>Click <strong>Start</strong>, then open <strong>Inspector</strong> to watch traffic and rule evaluation.</li>
                  <li>Open <strong>Terminal</strong> and try connectivity checks (e.g. <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>ping {firewallIntroNet.webServerIp}</span>, <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0 }}>curl https://{firewallIntroNet.webServerIp}</span>).</li>
                  <li>Open <strong>Firewall Rules</strong> and ensure <strong>WAN → LAN • TCP/22</strong> is set to <strong>DENY</strong>.</li>
                  <li>Click <strong>Simulate Attack</strong> to confirm the firewall blocks the attacker (you should see “Secured LAN”).</li>
                </ol>
                <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>
                  Tip: Press <strong>Esc</strong> to close this intro. You can reopen it anytime from the right drawer: <strong>Learn Firewall</strong>.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setFirewallIntroOpen(false)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  background: 'rgba(59, 130, 246, 0.18)',
                  color: '#dbeafe',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Start Learning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secured LAN overlay (attack was blocked) */}
      {config.id === 'firewall' && securedEducation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Security result"
          data-loc="src/components/VirtualRoom.tsx:secured-lan-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(1060px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1.6, color: '#86efac' }}>SECURITY STATUS</div>
                <div style={{ marginTop: 10, fontSize: 31, fontWeight: 900, color: '#dcfce7' }}>Secured LAN</div>
                <div style={{ marginTop: 10, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
                  Good job — your firewall blocked an inbound <strong>SSH</strong> attempt (<strong>TCP/22</strong>) from <strong>WAN → LAN</strong>.
                </div>
              </div>
              <button
                onClick={() => setSecuredEducation(null)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  background: 'rgba(20, 83, 45, 0.25)',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  background: 'rgba(20, 83, 45, 0.22)',
                  color: '#bbf7d0',
                }}
              >
                Attack traffic: WAN → LAN • TCP/22
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(2, 6, 23, 0.25)',
                  color: '#e5e7eb',
                }}
              >
                Firewall decision: DENY{securedEducation.matchedRuleIndex != null ? ` (Matched Rule ${securedEducation.matchedRuleIndex + 1})` : ' (Default deny)'}
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 18, color: '#e5e7eb', lineHeight: 1.65 }}>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>What happened?</strong> The attacker tried to reach your LAN desktop over <strong>SSH</strong> (<strong>TCP port 22</strong>)
                from the Internet (WAN). Your firewall inspected the packet and <strong>denied</strong> it, so the packet was dropped at the firewall
                and never entered your LAN.
              </p>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>Why this is good:</strong> Blocking inbound SSH from the public Internet reduces exposure to brute-force attacks and
                prevents unauthenticated reachability into your internal network.
              </p>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>Rule to keep in place:</strong>
              </p>
              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(15, 23, 42, 0.55)',
                borderRadius: 16,
                padding: 17,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 10 }}>Firewall rule:</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 18, fontWeight: 800, color: '#bbf7d0' }}>
                  WAN → LAN • TCP/22 • DENY
                </div>
              </div>
              <p style={{ margin: 0 }}>
                If you need remote administration, prefer a <strong>VPN</strong> or restrict SSH to a trusted source network instead of allowing it from
                all of WAN.
              </p>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setSecuredEducation(null)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  background: 'rgba(34, 197, 94, 0.18)',
                  color: '#dcfce7',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attack education overlay */}
      {config.id === 'firewall' && attackEducation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attack result"
          data-loc="src/components/VirtualRoom.tsx:attack-education-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(2, 6, 23, 0.72)',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 'min(1060px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              background: 'rgba(17, 24, 39, 0.96)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 18,
              boxShadow: '0 22px 64px rgba(0,0,0,0.55)',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: 26,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1.6, color: '#fca5a5' }}>SECURITY EVENT</div>
                <div style={{ marginTop: 10, fontSize: 31, fontWeight: 900, color: '#fee2e2' }}>LAN Desktop Compromised</div>
                <div style={{ marginTop: 10, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
                  The attacker’s packet reached your LAN desktop because your firewall allowed inbound <strong>TCP/22 (SSH)</strong>
                  from <strong>WAN → LAN</strong>.
                </div>
              </div>
              <button
                onClick={() => setAttackEducation(null)}
                aria-label="Close"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.25)',
                  background: 'rgba(127, 29, 29, 0.25)',
                  color: '#fee2e2',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'rgba(127, 29, 29, 0.22)',
                  color: '#fecaca',
                }}
              >
                Attack traffic: WAN → LAN • TCP/22
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  background: 'rgba(2, 6, 23, 0.25)',
                  color: '#e5e7eb',
                }}
              >
                Firewall decision: ALLOW{attackEducation.matchedRuleIndex != null ? ` (Matched Rule ${attackEducation.matchedRuleIndex + 1})` : ''}
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 18, color: '#e5e7eb', lineHeight: 1.65 }}>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>What happened?</strong> In this simulation, an attacker on the Internet (WAN) tried to reach a device inside
                your network (LAN) using <strong>SSH</strong> on <strong>TCP port 22</strong>. Your firewall inspected the packet at the
                inspection zone, but because your current rules allowed this exact traffic, the firewall forwarded it into your LAN
                (Firewall → Router → Switch → Desktop).
              </p>
              <p style={{ margin: '0 0 14px 0' }}>
                <strong>Why is this a problem?</strong> Port 22 is commonly used for remote administration. If SSH is exposed to the
                public Internet, it becomes a frequent target for brute-force login attempts, credential stuffing, and exploitation of
                weak or misconfigured systems.
              </p>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>How to fix it (recommended rule):</strong>
              </p>
              <div style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(15, 23, 42, 0.55)',
                borderRadius: 16,
                padding: 17,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 10 }}>Firewall rule to add or modify:</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 18, fontWeight: 800, color: '#fecaca' }}>
                  WAN → LAN • TCP/22 • DENY
                </div>
              </div>
              <p style={{ margin: 0 }}>
                After blocking <strong>WAN → LAN TCP/22</strong>, click <strong>Simulate Attack</strong> again and confirm the packet is
                dropped at the firewall (red ring).
              </p>
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  // Avoid UI overlap: close this panel, then open Firewall Rules.
                  setAttackEducation(null)
                  try { showFirewallRulesPanel() } catch {}
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#dbeafe',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                Open Firewall Rules
              </button>
              <button
                onClick={() => setAttackEducation(null)}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(248, 113, 113, 0.28)',
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#fee2e2',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External design iframe overlay (exact curry-nest UI) */}
      <OverlayMountCmp />

      {/* New Phase-Driven UI for design-test room */}
      {useNewPhaseUI && !editModeEnabled && (
        <>
          <PhaseIndicator
            phases={phaseList}
            currentPhaseId={currentPhase}
            onPhaseClick={(phaseId) => {
              // VPN: enabling phases require quiz once per page load.
              if (isVpnRoom) {
                const id = String(phaseId)

                if (id === 'no-vpn') {
                  setPendingVpnPhaseId(null)
                  setCurrentPhase(phaseId)
                  setVpnActive(false, 'phase-ui')
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'DNS' } })) } catch {}
                  return
                }

                // enable / vpn-on
                if (!vpnQuizPassedRef.current) {
                  setPendingVpnPhaseId(id)
                  openVpnQuiz({ desiredPhaseId: id })
                  return
                }

                setPendingVpnPhaseId(null)
                setCurrentPhase(phaseId)
                setVpnActive(true, 'phase-ui')
                try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                return
              }

              // HTTPS room: map phase UI → flow-control phases, and gate HTTPS until Fix HTTPS is completed.
              if (isHttpsRoom) {
                const id = String(phaseId)

                if (id === 'http') {
                  setCurrentPhase(id)
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'DNS' } })) } catch {}
                  return
                }

                if (id === 'handshake') {
                  setCurrentPhase(id)
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                  return
                }

                if (id === 'fix') {
                  setCurrentPhase(id)
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                  try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                  return
                }

                if (id === 'https') {
                  if (!httpsUiUnlocked) {
                    // Keep user in Fix HTTPS until unlocked.
                    setCurrentPhase('fix')
                    try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'PKI' } })) } catch {}
                    try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                    return
                  }

                  setCurrentPhase(id)
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: 'HTTPS' } })) } catch {}
                  return
                }
              }

              // Top phase bar is the source of truth for phase selection.
              setCurrentPhase(phaseId)

              // Keep LiveFlow HUD / underlying runner in sync.
              if (isFirewallRoom) {
                const id = String(phaseId)

                const map: Record<string, 'DNS' | 'PKI' | 'HTTPS'> = {
                  normal: 'DNS',
                  configure: 'PKI',
                  attack: 'HTTPS',
                }
                const p = map[id]
                if (p) {
                  try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'setPhase', phase: p } })) } catch {}
                }

                // Phase-specific affordances:
                // - Configure: open the Firewall Rules panel
                // - Test Attack: trigger the attack simulation
                if (id === 'configure') {
                  showFirewallRulesPanel()
                }
                if (id === 'attack') {
                  try { window.dispatchEvent(new CustomEvent('firewall:simulate-attack')) } catch {}
                }
              }
            }}
          />
          
          {currentPhaseConfig?.ui?.primaryAction && (
            <PrimaryActionPanel
              description={isDesignRoute ? undefined : currentPhaseConfig.description}
              primaryAction={currentPhaseConfig.ui.primaryAction}
              secondaryActions={currentPhaseConfig.ui.secondaryActions || []}
              onPrimaryClick={handlePrimaryAction}
              onSecondaryClick={handleSecondaryAction}
            />
          )}
          
          <ToolsDrawer
            tools={(
              isFirewallRoom
                ? [
                    { id: 'firewall-rules', label: 'Firewall Rules', icon: '🛡️' },
                    { id: 'firewall-guide', label: 'Learn Firewall', icon: '📘' },
                    { id: 'inspector', label: 'Inspector', icon: '🔍' },
                    { id: 'terminal', label: 'Terminal', icon: '💻' },
                    { id: 'mission', label: 'Mission', icon: '📋' },
                  ]
                : isVpnRoom
                  ? [
                      { id: 'vpn-toggle', label: (vpnUiActive ? 'Disable VPN' : 'Enable VPN'), icon: (vpnUiActive ? '🟥' : '🟩') },
                      { id: 'vpn-guide', label: 'Learn VPN', icon: '📘' },
                      { id: 'inspector', label: 'Inspector', icon: '🔍' },
                      { id: 'terminal', label: 'Terminal', icon: '💻' },
                      { id: 'mission', label: 'Mission', icon: '📋' },
                    ]
                  : isHttpsRoom
                    ? [
                        { id: 'https-guide', label: 'Learn HTTP & HTTPS', icon: '📘' },
                        { id: 'https-fix', label: 'Fix HTTPS', icon: '🔧' },
                        { id: 'inspector', label: 'Inspector', icon: '🔍' },
                        { id: 'terminal', label: 'Terminal', icon: '💻' },
                        { id: 'mission', label: 'Mission', icon: '📋' },
                      ]
                    : [
                        { id: 'inspector', label: 'Inspector', icon: '🔍' },
                        { id: 'terminal', label: 'Terminal', icon: '💻' },
                        { id: 'mission', label: 'Mission', icon: '📋' },
                      ]
            )}
            onToolClick={handleToolClick}
          />
        </>
      )}

      {/* Quality selector removed - always use potato quality */}
      {/* PerformanceStatsHUD removed - no longer showing performance stats */}
    </div>
  )
}

// Stable overlay component to avoid remount flicker
const OverlayMountCmp = () => {
  const ReactNS = require('react') as typeof import('react')
  const { useHtmlOverlay, getHtmlOverlayState, hideHtmlOverlay } = require('@/store/useHtmlOverlay') as typeof import('@/store/useHtmlOverlay')
  const state = useHtmlOverlay()
  ReactNS.useEffect(() => {
    const onDown = (evt: MouseEvent) => {
      const s = getHtmlOverlayState()
      if (!s.visible) return
      const sheet = document.querySelector('[data-loc="src/components/inspector/InspectorPanel.tsx:sheet-content"]') as Element | null
      if (sheet && evt.target && sheet.contains(evt.target as Node)) return
      const overlayRoot = document.getElementById('packet-overlay-root')
      if (overlayRoot && evt.target && overlayRoot.contains(evt.target as Node)) return
      if (typeof s.suppressUntil === 'number' && Date.now() < s.suppressUntil) return
      hideHtmlOverlay()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [])
  if (!state.visible) return null
  return (
    <div id="packet-overlay-root" className="pointer-events-none" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483647 }}>
      <iframe
        key="packet-overlay"
        src={`/packet-overlay.html${state.query}`}
        title="Packet Design"
        style={{
          width: '100vw',
          height: '100vh',
          border: '0',
          background: 'transparent',
          clipPath: 'inset(calc(50% - 212px) calc(50% - 395px) calc(50% - 212px) calc(50% - 370px) round 16px)',
          transform: 'translateY(-260px)'
        }}
        className="pointer-events-auto"
      />
    </div>
  )
}
