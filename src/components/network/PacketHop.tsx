'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'

// Track active packet IDs globally to prevent duplicates
const activePacketIds = new Set<string>()

const UP = new THREE.Vector3(0, 1, 0)

export interface PacketMetadata {
  id: string
  label: string
  protocol: string
  encrypted: boolean
}

export type PacketHopEasing = 'linear' | 'easeInOut' | 'easeOut'

export interface PacketHopProps {
  packetMeta: PacketMetadata
  fromAnchor: string
  toAnchor: string
  onLaunch?: (meta: PacketMetadata) => void
  onPause?: (meta: PacketMetadata) => void
  onResume?: (meta: PacketMetadata) => void
  onArrival?: (meta: PacketMetadata) => void
  onPathReady?: (points: THREE.Vector3[]) => void

  // Optional: override the computed bezier path with explicit world-space points
  pathPointsOverride?: Array<[number, number, number]>

  // Optional hop tuning
  travelSeconds?: number
  easing?: PacketHopEasing
  holdSeconds?: number

  /**
   * Optional: gate completion of the hold (after holdSeconds) on an external event.
   * - The packet will travel, then hold for holdSeconds.
   * - After holdSeconds, it will wait until `holdUntilEvent` fires before completing arrival.
   */
  holdUntilEvent?: string

  /**
   * Optional: event to dispatch when holdSeconds elapses but the hop is still waiting for holdUntilEvent.
   */
  holdCompleteEvent?: string

  // Optional start/end offsets (in world meters) computed towards another anchor
  startOffsetTowardAnchor?: string
  startOffsetDistance?: number
  startYOffset?: number
  endOffsetTowardAnchor?: string
  endOffsetDistance?: number
  endYOffset?: number

  // Optional inspection UI (when label starts with "INSPECT")
  inspectChips?: string[]

  // Optional UI
  showLabel?: boolean
}

// Sample a quadratic bezier curve into evenly-spaced points
function sampleQuadraticBezier(
  start: THREE.Vector3,
  mid: THREE.Vector3,
  end: THREE.Vector3,
  numSamples: number = 100
): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples
    points.push(curve.getPoint(t))
  }
  
  return points
}

// Easing functions
function easeInOut(t: number, easeInDuration: number, easeOutStart: number): number {
  if (t < easeInDuration) {
    // Ease in (quadratic)
    const localT = t / easeInDuration
    return localT * localT
  } else if (t > easeOutStart) {
    // Ease out (quadratic)
    const localT = (1 - t) / (1 - easeOutStart)
    return 1 - localT * localT
  }
  return t // Linear in middle
}

let PACKETHOP_INSTANCE_SEQ = 0
const GHOST_SAFE_DEFAULT = true

export default function PacketHop({
  packetMeta,
  fromAnchor,
  toAnchor,
  onLaunch,
  onPause,
  onResume,
  onArrival,
  onPathReady,
  pathPointsOverride,
  travelSeconds,
  easing,
  holdSeconds,
  holdUntilEvent,
  holdCompleteEvent,
  startOffsetTowardAnchor,
  startOffsetDistance,
  startYOffset,
  endOffsetTowardAnchor,
  endOffsetDistance,
  endYOffset,
  inspectChips,
  showLabel = true,
}: PacketHopProps) {
  const { scene, gl } = useThree()
  const groupRef = useRef<THREE.Group>(null!)
  const visualRef = useRef<THREE.Group>(null)
  const instIdRef = useRef<number>(++PACKETHOP_INSTANCE_SEQ)
  const [paused, setPaused] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)

  // Hold/arrival guards
  const holdingRef = useRef(false)
  const holdStartRef = useRef<number | null>(null)
  const arrivalSentRef = useRef(false)

  // Optional: hold gating (wait for external event)
  const holdReleasedRef = useRef<boolean>(false)
  const holdCompleteSentRef = useRef<boolean>(false)
  const holdStartSentRef = useRef<boolean>(false)

  // Inspection FX refs (only used when label is INSPECT)
  const inspectOriginRef = useRef<THREE.Object3D | null>(null)
  const scanBeamRef = useRef<THREE.Mesh>(null)
  const scanRingRef = useRef<THREE.Mesh>(null)
  const scanDotRefs = useRef<Array<THREE.Mesh | null>>([])
  const hintElsRef = useRef<Array<HTMLDivElement | null>>([])

  const inspectHints = useMemo(() => {
    const defaultHints = ['Protocol: TCP', 'Port: 443', 'Zone: inside → outside']
    const list = Array.isArray(inspectChips) ? inspectChips.filter(Boolean).map((v) => String(v)) : []
    return (list.length ? list : defaultHints).slice(0, 6)
  }, [inspectChips])

  const tmpOriginWorldRef = useRef(new THREE.Vector3())
  const tmpOriginLocalRef = useRef(new THREE.Vector3())
  const tmpDirRef = useRef(new THREE.Vector3())

  // Debug toggles (can be flipped via URL or window flags)
  const debugFlags = useMemo(() => {
    let simpleGeom = false
    let renderInfo = false
    let forceClear = false
    let strobe = false
    let basicMat = false
    let linear = false
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      simpleGeom = !!w.__PACKET_DEBUG_SIMPLE_GEOM__
      renderInfo = !!w.__PACKET_DEBUG_RENDER__
      forceClear = !!w.__PACKET_DEBUG_FORCE_CLEAR__
      strobe = !!w.__PACKET_STROBE__
      basicMat = !!w.__PACKET_BASIC__
      linear = !!w.__PACKET_LINEAR__
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('simplePacket') === '1') simpleGeom = true
        if (params.get('packetRenderInfo') === '1') renderInfo = true
        if (params.get('packetForceClear') === '1') forceClear = true
        if (params.get('packetStrobe') === '1') strobe = true
        if (params.get('packetBasic') === '1') basicMat = true
        if (params.get('packetLinear') === '1') linear = true
      }
    } catch {}
    return { simpleGeom, renderInfo, forceClear, strobe, basicMat, linear }
  }, [])

  // Effective ghost-safe toggles (default ON; URL or window can override)
  const useGhostBasic = debugFlags.basicMat || GHOST_SAFE_DEFAULT
  const useGhostLinear = debugFlags.linear || GHOST_SAFE_DEFAULT
  const useGhostStrobe = debugFlags.strobe && !GHOST_SAFE_DEFAULT
  
  // Mount/unmount diagnostics
  useEffect(() => {
    const id = instIdRef.current
    let VERBOSE = false
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      VERBOSE = params?.get('packetVerbose') === '1' || !!w.__PACKET_VERBOSE__
    } catch {}
    if (VERBOSE) console.log(`🟩 PacketHop MOUNT #${id} for ${packetMeta.id}`)
    return () => {
      if (VERBOSE) console.log(`🟥 PacketHop UNMOUNT #${id} for ${packetMeta.id}`)
    }
  }, [])

  // Check if this packet ID is already active (prevent duplicate renders)
  useEffect(() => {
    if (activePacketIds.has(packetMeta.id)) {
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const VERBOSE = params?.get('packetVerbose') === '1' || !!w.__PACKET_VERBOSE__
        if (VERBOSE) console.log(`⚠️ PacketHop: Duplicate render detected for ${packetMeta.id}, skipping`)
      } catch {}
      setIsDuplicate(true)
      return
    }
    
    // Mark this packet as active (module + global)
    activePacketIds.add(packetMeta.id)
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      if (!w.__ACTIVE_PACKET_IDS__) w.__ACTIVE_PACKET_IDS__ = new Set()
      w.__ACTIVE_PACKET_IDS__.add(packetMeta.id)
      // quiet: registration debug only when verbose
      try {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const VERBOSE = params?.get('packetVerbose') === '1' || !!(window as any).__PACKET_VERBOSE__
        if (VERBOSE) console.log(`✅ PacketHop: Registered ${packetMeta.id}, active packets:`, activePacketIds.size, 'global:', (window as any).__ACTIVE_PACKET_IDS__?.size)
      } catch {}
    } catch {}
    
    // Cleanup on unmount
    return () => {
      activePacketIds.delete(packetMeta.id)
      try { const w: any = typeof window !== 'undefined' ? window : {}; w.__ACTIVE_PACKET_IDS__?.delete(packetMeta.id) } catch {}
      console.log(`🗑️ PacketHop: Unregistered ${packetMeta.id}, active packets:`, activePacketIds.size)
    }
  }, [packetMeta.id])
  
  // One-time DOM probe to detect multiple canvases/labels
  useEffect(() => {
    try {
      const canvases = typeof document !== 'undefined' ? document.querySelectorAll('canvas').length : 0
      const hopLabels = typeof document !== 'undefined' ? document.querySelectorAll('[data-hop-label]').length : 0
      try {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const VERBOSE = params?.get('packetVerbose') === '1' || !!(window as any).__PACKET_VERBOSE__
        if (VERBOSE) console.log('🧪 DOM_PROBE', { canvases, hopLabels })
      } catch {}
    } catch {}
  }, [])
  
  // Periodic duplicate diagnostics: enumerate packet meshes and hop labels
  useEffect(() => {
    // Diagnostic scan disabled by default; enable with ?packetVerbose=1
    let VERBOSE = false
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      VERBOSE = params?.get('packetVerbose') === '1' || !!w.__PACKET_VERBOSE__
    } catch {}
    if (!VERBOSE) return
    const int = setInterval(() => {
      try {
        const packetMeshes: any[] = []
        const wp = new THREE.Vector3()
        scene.traverse((obj) => {
          const mesh = obj as any
          const isPacketMesh = (obj.name === 'packet_body' || obj.name === 'packet_flap' || obj.name === 'packet_debug_sphere')
          if (mesh?.isMesh && isPacketMesh) {
            try { obj.getWorldPosition(wp) } catch {}
            // Find topmost ancestor (root) name
            let root: any = obj as any
            while (root?.parent && root.parent.type !== 'Scene') root = root.parent
            const rootName = root?.name || root?.type || 'UnknownRoot'
            const inPath = !!(pathBoundsRef.current && pathBoundsRef.current.containsPoint(wp))
            packetMeshes.push({ name: obj.name, uuid: obj.uuid, rootName, rootUuid: root?.uuid, visible: !!mesh.visible, inPath })
          }
        })
        const canvases = typeof document !== 'undefined' ? document.querySelectorAll('canvas').length : 0
        const hopLabels = typeof document !== 'undefined' ? document.querySelectorAll('[data-hop-label]').length : 0
        const activeGroup = groupRef.current?.name || '(unknown)'
        console.log('🧪 DUP_DBG', { packetMeshes: packetMeshes.length, hopLabels, canvases, activeGroup })
      } catch {}
    }, 1000)
    return () => clearInterval(int)
  }, [scene])
  
  // Animation state
  const pathPoints = useRef<THREE.Vector3[]>([])
  const progress = useRef(0) // 0 to 1
  const animationTime = useRef(0) // accumulated time in seconds
  const scaleIntroTime = useRef(0) // for 0.85 → 1.0 scale intro
  const initialized = useRef(false) // Track if we've already initialized
  const speedRef = useRef(1) // external speed multiplier

  // Debug helpers: bounds around path and moving-object tracker
  const pathBoundsRef = useRef<THREE.Box3 | null>(null)
  const lastScanRef = useRef(0)
  const lastPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())
  
  // Timing constants
  const TRAVEL_DURATION_DEFAULT = 0.4 // 400ms default travel time
  const SCALE_INTRO_DURATION = 0.25 // slightly longer scale intro for visibility
  
  const [scale, setScale] = useState(2.0) // Increased from 0.85 to make packet more visible
  const [visible, setVisible] = useState(false)
  
  // Load the network packet model
  // Note: generated via scripts/generate_packet_glb.mjs (currently outputs an embedded-buffer .gltf)
  const gltf = useGLTF('/inventory/Network Packet/network-packet.gltf')
  const [packetClone, setPacketClone] = useState<THREE.Group | null>(null)
  
  // Default packet color (matches the "golden" packet feel and stays readable in the room)
  const PACKET_COLOR = 0xFBBF24 // amber/gold
  const ATTACK_COLOR = 0xEF4444 // red

  const getProtocolColor = (label: string): number => {
    const l = String(label || '').toUpperCase()
    if (l.includes('ATTACK') || l.includes('MALICIOUS')) return ATTACK_COLOR
    return PACKET_COLOR
  }

  // Create a clone of the packet model and enhance materials for visibility
  useEffect(() => {
    if (debugFlags.simpleGeom) {
      setPacketClone(null)
      return
    }
    if (gltf?.scene) {
      const clone = gltf.scene.clone(true)
      
      // Get the color for this protocol
      const protocolColor = getProtocolColor(packetMeta.label)
      
      // Traverse meshes; sanitize materials; apply ghost-safe defaults
      clone.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) {
            if (!m) continue
            ;(m as any).depthTest = false
            ;(m as any).depthWrite = false
            if (useGhostBasic) {
              // Reduce brightness / disable tone mapping to minimize ghosting
              try { (m as any).toneMapped = false } catch {}
              try { if ((m as any).emissive) { (m as any).emissive.set(0x111111); (m as any).emissiveIntensity = 0.0 } } catch {}
              try { if ((m as any).metalness != null) (m as any).metalness = 0.0 } catch {}
              try { if ((m as any).roughness != null) (m as any).roughness = 0.9 } catch {}
            }
            
            // Apply protocol color to packet body and flap
            const meshName = (child as any).name || ''
            if (meshName === 'packet_body' || meshName === 'packet_flap') {
              try {
                ;(m as any).color = new THREE.Color(protocolColor)
                try {
                  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
                  const VERBOSE = params?.get('packetVerbose') === '1' || !!(window as any).__PACKET_VERBOSE__
                  if (VERBOSE) console.log(`🎨 Applied ${packetMeta.label} color to ${meshName}:`, protocolColor.toString(16))
                } catch {}
              } catch (err) {
                console.warn('Failed to apply color:', err)
              }
            }
          }
          try { mesh.renderOrder = 2300 } catch {}
        }
      })
      
      setPacketClone(clone)
      try {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const VERBOSE = params?.get('packetVerbose') === '1' || !!(window as any).__PACKET_VERBOSE__
        if (VERBOSE) {
          console.log('📦 PacketHop: Cloned packet model with enhanced materials', clone)
          console.log('🔍 PacketHop: Model children count:', clone.children.length)
          clone.traverse((child: THREE.Object3D) => {
            console.log('  - Child:', (child as any).name, 'Type:', child.type, 'Visible:', (child as any).visible)
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh
              console.log('    Mesh geometry:', (mesh.geometry as any).type, 'Material:', mesh.material ? (Array.isArray(mesh.material) ? `${(mesh.material as any[]).length} materials` : (mesh.material as any).type) : 'none')
              // Keep the envelope body, flap, and visible text planes; hide stamp/core/rim
              const keepOnly = new Set(['packet_body', 'packet_flap', 'packet_text_front', 'packet_text_back'])
              if (!keepOnly.has((child as any).name)) {
                ;(child as any).visible = false
                console.log('    ❌ Hiding:', (child as any).name)
              } else {
                ;(child as any).visible = true
                console.log('    ✅ Keeping visible:', (child as any).name)
              }
            }
          })
        } else {
          // Even when not verbose, still hide non-essential meshes
          clone.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              const keepOnly = new Set(['packet_body', 'packet_flap', 'packet_text_front', 'packet_text_back'])
              if (!keepOnly.has((child as any).name)) (child as any).visible = false
            }
          })
        }
      } catch {}
    }
  }, [gltf, debugFlags.simpleGeom, packetMeta.label])
  
  // Initialize path
  useEffect(() => {
    // Only initialize once per component mount
    if (initialized.current) return

    // Small delay to ensure anchors are positioned
    const timer = setTimeout(() => {
      // Reset per-hop refs
      holdingRef.current = false
      holdStartRef.current = null
      arrivalSentRef.current = false
      holdStartSentRef.current = false
      holdCompleteSentRef.current = false
      holdReleasedRef.current = !holdUntilEvent
      inspectOriginRef.current = null
      progress.current = 0
      animationTime.current = 0
      scaleIntroTime.current = 0

      // Notify topology HUD about active edge
      try { window.dispatchEvent(new CustomEvent('topology-edge', { detail: { from: fromAnchor, to: toAnchor, active: true } })) } catch {}

      // If a custom path is provided, follow it exactly (world-space points)
      if (Array.isArray(pathPointsOverride) && pathPointsOverride.length >= 2) {
        pathPoints.current = pathPointsOverride
          .filter((p) => Array.isArray(p) && p.length === 3)
          .map((p) => new THREE.Vector3(Number(p[0]), Number(p[1]), Number(p[2])))
          .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))

        if (pathPoints.current.length < 2) {
          console.warn('PacketHop: Invalid pathPointsOverride; falling back to computed path')
        } else {
          // Build an AABB around the path for debug scans (with margin)
          try {
            const box = new THREE.Box3()
            for (const p of pathPoints.current) box.expandByPoint(p)
            const margin = 1.2
            box.min.addScalar(-margin)
            box.max.addScalar(+margin)
            pathBoundsRef.current = box
            console.log('🧷 Path AABB', { min: box.min, max: box.max })
          } catch {}

          onPathReady?.(pathPoints.current)
          setVisible(true)
          onLaunch?.(packetMeta)
          try { if (groupRef.current) groupRef.current.name = `ACTIVE_PACKET_${packetMeta.id}#${instIdRef.current}` } catch {}
          initialized.current = true
          console.log(`🚀 PacketHop: Launched packet ${packetMeta.id} (custom path) from ${fromAnchor} to ${toAnchor}`)
          return
        }
      }

      const findAnchor = (name: string) => scene.getObjectByName(`${name}-center`) || scene.getObjectByName(name)

      const fromObj = findAnchor(fromAnchor)
      const toObj = findAnchor(toAnchor)
      const startTowardObj = startOffsetTowardAnchor ? (findAnchor(startOffsetTowardAnchor) || null) : null
      const endTowardObj = endOffsetTowardAnchor ? (findAnchor(endOffsetTowardAnchor) || null) : null
      
      if (!fromObj || !toObj) {
        console.warn(`PacketHop: Could not find anchors. Tried: ${fromAnchor}-center, ${fromAnchor}, ${toAnchor}-center, ${toAnchor}`)
        console.warn(`Available objects in scene:`, scene.children.map(c => c.name).filter(n => n).slice(0, 20))
        return
      }
      
      console.log(`✅ PacketHop: Found anchors - from: ${fromObj.name}, to: ${toObj.name}`)
      
      fromObj.updateMatrixWorld(true)
      toObj.updateMatrixWorld(true)
      if (startTowardObj) startTowardObj.updateMatrixWorld(true)
      if (endTowardObj) endTowardObj.updateMatrixWorld(true)
      
      const startPos = new THREE.Vector3()
      const endPos = new THREE.Vector3()
      fromObj.getWorldPosition(startPos)
      toObj.getWorldPosition(endPos)

      // Apply optional offsets for continuity (e.g., inspection stop point)
      const tmpToward = new THREE.Vector3()
      const applyOffsetToward = (base: THREE.Vector3, toward: THREE.Object3D | null, dist?: number) => {
        if (!toward || !dist || !isFinite(dist) || Math.abs(dist) < 1e-6) return
        toward.getWorldPosition(tmpToward)
        const dir = tmpToward.clone().sub(base)
        const len = dir.length()
        if (len < 1e-4) return
        dir.multiplyScalar(1 / len)
        base.add(dir.multiplyScalar(dist))
      }

      applyOffsetToward(startPos, startTowardObj, startOffsetDistance)
      if (typeof startYOffset === 'number' && isFinite(startYOffset)) startPos.y += startYOffset

      applyOffsetToward(endPos, endTowardObj, endOffsetDistance)
      if (typeof endYOffset === 'number' && isFinite(endYOffset)) endPos.y += endYOffset
      
      // Compute raised midpoint (same logic as NetworkLine)
      const baseY = Math.max(startPos.y, endPos.y)
      const dist = startPos.distanceTo(endPos)
      const dynLift = Math.max(0.8, Math.min(5, dist * 0.15))
      const midPos = new THREE.Vector3()
        .copy(startPos)
        .add(endPos)
        .multiplyScalar(0.5)
      midPos.y = baseY + dynLift
      
      // Sample the path
      pathPoints.current = sampleQuadraticBezier(startPos, midPos, endPos, 100)

      // Build an AABB around the path for debug scans (with margin)
      try {
        const box = new THREE.Box3()
        for (const p of pathPoints.current) box.expandByPoint(p)
        const margin = 1.2
        box.min.addScalar(-margin)
        box.max.addScalar(+margin)
        pathBoundsRef.current = box
        console.log('🧷 Path AABB', { min: box.min, max: box.max })
      } catch {}
      
      // Notify parent of path
      onPathReady?.(pathPoints.current)
      
      // Start visible and trigger onLaunch
      setVisible(true)
      onLaunch?.(packetMeta)

      // Name the group for scene diagnostics
      try { if (groupRef.current) groupRef.current.name = `ACTIVE_PACKET_${packetMeta.id}#${instIdRef.current}` } catch {}
      
      initialized.current = true
      console.log(`🚀 PacketHop: Launched packet ${packetMeta.id} from ${fromAnchor} to ${toAnchor}`)
    }, 50) // 50ms delay to ensure scene is ready

    // Periodic deduplication:
    // 1) Hide any other ACTIVE_PACKET_* groups that are not this instance
    // 2) Hide any top-level roots that contain packet_body/packet_flap meshes but are not under our group (static inventory packet)
    const dedup = setInterval(() => {
      try {
        const ours = groupRef.current
        if (!ours) return
        const dupesByName: any[] = []
        const staticPacketRoots = new Set<THREE.Object3D>()
        const getRoot = (o: THREE.Object3D): THREE.Object3D => {
          let r: any = o
          while (r?.parent && r.parent.type !== 'Scene') r = r.parent
          return r || o
        }
        const isUnderOurs = (o: THREE.Object3D) => {
          let cur: any = o
          while (cur) { if (cur === ours) return true; cur = cur.parent }
          return false
        }
        // Pass 1: hide extra ACTIVE_PACKET_*
        scene.traverse((obj) => {
          if (obj === ours) return
          if ((obj as any).name && (obj as any).name.startsWith('ACTIVE_PACKET_')) {
            dupesByName.push(obj)
            ;(obj as any).visible = false
          }
        })
        // Pass 2: find other packet roots
        scene.traverse((obj) => {
          const mesh = obj as any
          if (!mesh?.isMesh) return
          if (obj.name !== 'packet_body' && obj.name !== 'packet_flap') return
          if (isUnderOurs(obj)) return
          const root = getRoot(obj)
          staticPacketRoots.add(root)
        })
        const suppressed: any[] = []
        staticPacketRoots.forEach((root) => {
          try {
            ;(root as any).visible = false
            if (!(root as any).name) (root as any).name = 'STATIC_PACKET_SUPPRESSED'
            suppressed.push({ name: (root as any).name, uuid: root.uuid })
          } catch {}
        })
        if (dupesByName.length || suppressed.length) {
          console.warn('🧹 Dedup/suppress', {
            dupesByName: dupesByName.map(d => ({ name: d.name, uuid: d.uuid })),
            suppressed
          })
        }
      } catch {}
    }, 500)
    
    return () => { clearTimeout(timer); clearInterval(dedup); try { window.dispatchEvent(new CustomEvent('topology-edge', { detail: { active: false } })) } catch {} }
  }, [
    scene,
    fromAnchor,
    toAnchor,
    packetMeta,
    onLaunch,
    onPathReady,
    startOffsetTowardAnchor,
    startOffsetDistance,
    startYOffset,
    endOffsetTowardAnchor,
    endOffsetDistance,
    endYOffset,
    pathPointsOverride,
    holdUntilEvent,
  ])

  // Release hold when external event fires
  useEffect(() => {
    if (!holdUntilEvent) return
    const onRelease = () => {
      holdReleasedRef.current = true
    }
    try { window.addEventListener(holdUntilEvent, onRelease as any) } catch {}
    return () => {
      try { window.removeEventListener(holdUntilEvent, onRelease as any) } catch {}
    }
  }, [holdUntilEvent])
  
  // Animation loop
  const lastLogRef = useRef(0)
  useFrame((state, delta) => {
    if (!groupRef.current || pathPoints.current.length === 0 || arrived) return

    // Optional: force-clear renderer buffers at the start of our frame (debug only)
    if (debugFlags.forceClear) {
      try {
        gl.autoClear = true
        gl.clear(true, true, true)
      } catch {}
    }
    
    // Scale intro animation (2.0 → 2.5 over 150ms) - made larger for visibility
    if (scaleIntroTime.current < SCALE_INTRO_DURATION) {
      scaleIntroTime.current += delta
      const scaleProgress = Math.min(1, scaleIntroTime.current / SCALE_INTRO_DURATION)
      const newScale = 2.0 + (0.5 * scaleProgress)
      setScale(newScale)
    }
    
    const speedMul = Math.max(0.1, Math.min(4, speedRef.current))
    const TRAVEL_SLOWDOWN = 1.3
    const travelBase = Math.max(
      0.12,
      typeof travelSeconds === 'number' && isFinite(travelSeconds) ? travelSeconds : TRAVEL_DURATION_DEFAULT
    )
    const travelDuration = travelBase * TRAVEL_SLOWDOWN
    const holdDuration = Math.max(0, typeof holdSeconds === 'number' && isFinite(holdSeconds) ? holdSeconds : 0)

    const effectiveEasing: PacketHopEasing = easing || (useGhostLinear ? 'linear' : 'easeInOut')
    const easeInRatio = Math.min(0.35, 0.08 / travelDuration) // cap to avoid degenerate cases
    const easeOutStart = Math.max(0.65, 1 - (0.08 / travelDuration))
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

    const finishArrival = () => {
      if (arrivalSentRef.current) return
      arrivalSentRef.current = true
      setArrived(true)
      onArrival?.(packetMeta)
      console.log(`✅ PacketHop: Packet ${packetMeta.id} arrived at ${toAnchor}`)
    }

    const updatePosition = (p: number) => {
      const idx = Math.floor(p * (pathPoints.current.length - 1))
      const nextIdx = Math.min(idx + 1, pathPoints.current.length - 1)
      const lt = (p * (pathPoints.current.length - 1)) - idx
      const a = pathPoints.current[idx]
      const b = pathPoints.current[nextIdx]
      groupRef.current.position.lerpVectors(a, b, lt)
    }

    const nowT = state.clock.elapsedTime

    // Travel animation (+ optional hold at end)
    if (!paused) {
      if (progress.current < 1) {
        animationTime.current += delta * speedMul
        const raw = animationTime.current / travelDuration
        const rawClamped = Math.min(1, raw)

        // Apply easing
        if (effectiveEasing === 'linear') progress.current = rawClamped
        else if (effectiveEasing === 'easeOut') progress.current = easeOutCubic(rawClamped)
        else progress.current = easeInOut(rawClamped, easeInRatio, easeOutStart)

        if (raw >= 1) {
          progress.current = 1
          if (holdDuration > 0) {
            if (!holdingRef.current) {
              holdingRef.current = true
              holdStartRef.current = nowT
              // Notify listeners that the packet reached its endpoint and is now holding (useful for server/firewall UI)
              if (!holdStartSentRef.current) {
                holdStartSentRef.current = true
                try {
                  window.dispatchEvent(new CustomEvent('packet:holdStart', {
                    detail: { packetId: packetMeta.id, fromAnchor, toAnchor, label: packetMeta.label, protocol: packetMeta.protocol, encrypted: packetMeta.encrypted }
                  }))
                } catch {}
              }
            }
          } else {
            updatePosition(1)
            finishArrival()
            return
          }
        }

        updatePosition(progress.current)
      } else {
        // Already at end (holding)
        updatePosition(1)
        if (holdDuration > 0) {
          if (!holdingRef.current) {
            holdingRef.current = true
            holdStartRef.current = nowT
            if (!holdStartSentRef.current) {
              holdStartSentRef.current = true
              try {
                window.dispatchEvent(new CustomEvent('packet:holdStart', {
                  detail: { packetId: packetMeta.id, fromAnchor, toAnchor, label: packetMeta.label, protocol: packetMeta.protocol, encrypted: packetMeta.encrypted }
                }))
              } catch {}
            }
          }
          const heldFor = nowT - (holdStartRef.current ?? nowT)
          if (heldFor >= holdDuration) {
            // If we're gated on an external event, stay at the end until released.
            if (holdUntilEvent && !holdReleasedRef.current) {
              if (!holdCompleteSentRef.current) {
                holdCompleteSentRef.current = true
                const evName = typeof holdCompleteEvent === 'string' && holdCompleteEvent.length
                  ? holdCompleteEvent
                  : 'packet:holdComplete'
                try {
                  window.dispatchEvent(new CustomEvent(evName, {
                    detail: { packetId: packetMeta.id, fromAnchor, toAnchor }
                  }))
                } catch {}
              }
              return
            }

            finishArrival()
            return
          }
        } else {
          finishArrival()
          return
        }
      }
    }

    // Visual idle animation (keep packet alive during inspection hold)
    const lab = String(packetMeta.label || '').toUpperCase()
    const isInspect = lab.startsWith('INSPECT')
    const inHold = holdingRef.current && progress.current >= 1 && holdDuration > 0

    if (visualRef.current) {
      const t = state.clock.elapsedTime
      const pulseAmt = inHold ? 0.06 : 0.02
      const rotY = inHold ? 1.2 : 0.7
      const bob = inHold ? 0.06 : 0.03

      const s = 1 + pulseAmt * Math.sin(t * (inHold ? 2.2 : 1.6))
      visualRef.current.scale.setScalar(s)
      visualRef.current.rotation.y = t * rotY
      visualRef.current.rotation.z = Math.sin(t * 3.1) * (inHold ? 0.12 : 0.06)
      visualRef.current.position.y = Math.sin(t * 1.4) * bob
    }

    // Inspection scanning FX: beam + traveling pulses + faint ring around the packet
    if (isInspect && groupRef.current) {
      if (!inspectOriginRef.current) {
        inspectOriginRef.current =
          scene.getObjectByName(`${toAnchor}-center`) ||
          scene.getObjectByName(toAnchor) ||
          null
      }

      const origin = inspectOriginRef.current
      const intensity = inHold ? 1 : THREE.MathUtils.smoothstep(progress.current, 0.75, 1)

      if (origin && intensity > 0.001) {
        origin.getWorldPosition(tmpOriginWorldRef.current)
        tmpOriginLocalRef.current.copy(tmpOriginWorldRef.current)
        groupRef.current.worldToLocal(tmpOriginLocalRef.current)

        const v = tmpOriginLocalRef.current
        const dist = v.length()

        if (dist > 1e-3) {
          const dir = tmpDirRef.current.copy(v).normalize()

          if (scanBeamRef.current) {
            scanBeamRef.current.visible = true
            scanBeamRef.current.position.copy(v).multiplyScalar(0.5)
            scanBeamRef.current.quaternion.setFromUnitVectors(UP, dir)
            scanBeamRef.current.scale.set(1, dist, 1)
            const m: any = scanBeamRef.current.material
            if (m) m.opacity = (0.06 + (inHold ? 0.06 : 0)) * intensity
          }

          for (let i = 0; i < scanDotRefs.current.length; i++) {
            const dot = scanDotRefs.current[i]
            if (!dot) continue
            const phase = (state.clock.elapsedTime * 0.8 + i * 0.33) % 1
            dot.position.copy(v).multiplyScalar(1 - phase)
            dot.scale.setScalar(0.55 + 0.25 * Math.sin((phase + i) * Math.PI))
            const dm: any = dot.material
            if (dm) dm.opacity = (0.18 * (1 - phase)) * intensity
            dot.visible = true
          }

          if (scanRingRef.current) {
            scanRingRef.current.visible = true
            scanRingRef.current.rotation.z = state.clock.elapsedTime * 0.8
            const s = 1 + 0.12 * Math.sin(state.clock.elapsedTime * 2.0)
            scanRingRef.current.scale.setScalar(s)
            const rm: any = scanRingRef.current.material
            if (rm) rm.opacity = (0.10 + (inHold ? 0.06 : 0)) * intensity
          }
        } else {
          if (scanBeamRef.current) scanBeamRef.current.visible = false
          if (scanRingRef.current) scanRingRef.current.visible = false
          for (const d of scanDotRefs.current) if (d) d.visible = false
        }

        // Hint chips (DOM) - only during hold
        const heldFor = inHold ? (nowT - (holdStartRef.current ?? nowT)) : -1
        const windowFade = (t: number, a: number, b: number, fade: number) => {
          if (t < a || t > b) return 0
          const inT = Math.min(1, Math.max(0, (t - a) / fade))
          const outT = Math.min(1, Math.max(0, (b - t) / fade))
          return Math.min(inT, outT)
        }

        // Stagger hints with slight overlap so a ~2–3s inspection shows multiple fields.
        const fade = 0.22
        const start0 = 0.12
        const step = 0.55
        const dur = 1.0
        const outs = inspectHints.map((_, i) => {
          const a = start0 + i * step
          const b = a + dur
          return heldFor >= 0 ? windowFade(heldFor, a, b, fade) : 0
        })

        for (let i = 0; i < outs.length; i++) {
          const el = hintElsRef.current[i]
          if (!el) continue
          const o = outs[i]
          el.style.opacity = String(o)
          el.style.transform = `translateY(${(1 - o) * 6}px)`
        }
      } else {
        if (scanBeamRef.current) scanBeamRef.current.visible = false
        if (scanRingRef.current) scanRingRef.current.visible = false
        for (const d of scanDotRefs.current) if (d) d.visible = false
        for (const el of hintElsRef.current) if (el) el.style.opacity = '0'
      }
    }

    // Debug throttle: log ~2x per second
    if (state.clock.elapsedTime - lastLogRef.current > 0.5) {
      lastLogRef.current = state.clock.elapsedTime
      try {
        const w: any = typeof window !== 'undefined' ? window : {}
        const globals = { activeGlobal: Array.from(w.__ACTIVE_PACKET_IDS__ || []) }
        console.log(`📍 Hop#${instIdRef.current} ${packetMeta.id} prog=${(progress.current*100).toFixed(0)}% pos=[${groupRef.current.position.x.toFixed(2)},${groupRef.current.position.y.toFixed(2)},${groupRef.current.position.z.toFixed(2)}]`, globals)
        if (debugFlags.renderInfo) {
          const info = gl.info as any
          console.log('🧮 RENDER_INFO', {
            calls: info?.render?.calls,
            triangles: info?.render?.triangles,
            points: info?.render?.points,
            lines: info?.render?.lines
          })
        }
      } catch {}
    }

    // Scene scan (once per second) to find any other moving objects near the path
    const tNow = state.clock.elapsedTime
    if (tNow - (lastScanRef.current || 0) > 1.0 && pathBoundsRef.current) {
      lastScanRef.current = tNow
      let found = 0
      const maxReports = 5
      const tmp = new THREE.Vector3()
      const nearestPoint = (p: THREE.Vector3) => {
        let bestD = Infinity
        let bestIdx = 0
        for (let i = 0; i < pathPoints.current.length; i += 4) { // stride for speed
          const pt = pathPoints.current[i]
          const d = pt.distanceToSquared(p)
          if (d < bestD) { bestD = d; bestIdx = i }
        }
        return { idx: bestIdx, d2: bestD }
      }
      state.scene.traverse((obj) => {
        if (found >= maxReports) return
        const mesh = obj as any
        if (!mesh.isMesh || mesh === groupRef.current) return
        // Skip our packet's children
        let cur: THREE.Object3D | null = mesh
        while (cur) { if (cur === groupRef.current) return; cur = cur.parent }
        if (!mesh.visible) return
        try { mesh.updateMatrixWorld(true) } catch {}
        mesh.getWorldPosition(tmp)
        // Cull by AABB around path
        if (!pathBoundsRef.current!.containsPoint(tmp)) return
        // Compute motion
        const key = mesh.uuid
        const last = lastPositionsRef.current.get(key)
        if (!last) {
          lastPositionsRef.current.set(key, tmp.clone())
          return
        }
        const moved = tmp.distanceToSquared(last)
        if (moved < 0.01) return // ~10 cm^2
        last.copy(tmp)
        // Close to the path?
        const near = nearestPoint(tmp)
        if (near.d2 > 1.0) return // >1m away
        // Report
        found++
        const chain: string[] = []
        let p: any = mesh
        for (let i=0;i<4 && p; i++, p=p.parent) chain.push(p.name || p.type)
        try {
          console.warn('🔎 Extra moving near path:', {
            name: mesh.name || mesh.type,
            uuid: mesh.uuid,
            pos: { x: +tmp.x.toFixed(2), y: +tmp.y.toFixed(2), z: +tmp.z.toFixed(2) },
            nearestIdx: near.idx, d2: +near.d2.toFixed(3),
            chain
          })
        } catch {}
      })
    }

    // Optional strobe to reduce perceived motion ghosting on some displays
    if (useGhostStrobe && groupRef.current) {
      const frameIdx = Math.floor(state.clock.elapsedTime * 60)
      const on = (frameIdx % 2) === 0
      if (groupRef.current.visible !== on) groupRef.current.visible = on
    }
  })
  
  // Handle click to pause/resume
  const handleClick = (e: any) => {
    e.stopPropagation()
    
    if (paused) {
      setPaused(false)
      onResume?.(packetMeta)
      console.log(`▶️ PacketHop: Resumed packet ${packetMeta.id}`)
    } else {
      setPaused(true)
      onPause?.(packetMeta)
      console.log(`⏸️ PacketHop: Paused packet ${packetMeta.id}`)
    }
  }
  
  // Global controls: pause/resume/speed via window event
  useEffect(() => {
    const onCtl = (evt: any) => {
      try {
        const d = evt?.detail || {}
        if (d.action === 'pause') { setPaused(true); onPause?.(packetMeta) }
        else if (d.action === 'resume') { setPaused(false); onResume?.(packetMeta) }
        else if (d.action === 'toggle') { setPaused(p => { const np = !p; (np?onPause:onResume)?.(packetMeta); return np }) }
        else if (d.action === 'speed' && typeof d.value === 'number') { speedRef.current = d.value }
      } catch {}
    }
    window.addEventListener('packet-control', onCtl as any)
    return () => window.removeEventListener('packet-control', onCtl as any)
  }, [onPause, onResume, packetMeta])

  // Don't render if this is a duplicate instance
  if (isDuplicate) return null
  
  if (!visible) return null
  
  // Get protocol color for debug sphere
  const protocolColor = getProtocolColor(packetMeta.label)
  const colorHex = `#${protocolColor.toString(16).padStart(6, '0')}`
  
  // Map protocol to OSI layer
  const getOsiLayer = (protocol: string): string => {
    const p = protocol.toUpperCase()
    if (p.includes('ICMP') || p.includes('IP')) return 'Layer 3'
    if (p.includes('TCP') || p.includes('UDP')) return 'Layer 4'
    // Application layer protocols
    if (p.includes('DNS') || p.includes('TLS') || p.includes('HTTP') || p.includes('HTTPS')) return 'Layer 7'
    return 'Layer 7' // Default to application layer
  }
  
  const osiLayer = getOsiLayer(packetMeta.protocol)

  const labelUpper = String(packetMeta.label || '').toUpperCase()
  const isInspect = labelUpper.startsWith('INSPECT')

  // Inspection hint chip sizing: bump readability (these are the firewall "emitted" fields like Src/Dst/Protocol/Port).
  // Keep in code (not JSON) since this is a shared UI component across rooms.
  const INSPECT_CHIP_SCALE = 2

  const hintStyle = {
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    background: 'rgba(15, 23, 42, 0.78)',
    color: '#e2e8f0',
    padding: `${6 * INSPECT_CHIP_SCALE}px ${10 * INSPECT_CHIP_SCALE}px`,
    borderRadius: 999,
    fontSize: 12 * INSPECT_CHIP_SCALE,
    fontWeight: 650,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    border: '1px solid rgba(147, 197, 253, 0.35)',
    boxShadow: '0 0 24px rgba(147, 197, 253, 0.16)',
    opacity: 0,
    transform: `translateY(${6 * INSPECT_CHIP_SCALE}px)`,
    transition: 'opacity 120ms linear, transform 120ms ease-out',
    whiteSpace: 'nowrap' as const,
  }

  return (
    <group
      ref={groupRef}
      scale={scale}
      onClick={handleClick}
    >
      {/* Floating protocol label above packet */}
      {showLabel && (
        <Billboard
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
          position={[0, 0.8, 0]}
        >
          <Html
            center
            distanceFactor={8}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'rgba(0, 0, 0, 0.85)',
              color: colorHex,
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '19.5px',
              fontWeight: '600',
              fontFamily: 'Monaco, monospace',
              whiteSpace: 'nowrap',
              border: `3px solid ${colorHex}`,
              boxShadow: `0 0 15px ${colorHex}`,
              textShadow: `0 0 8px ${colorHex}`,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '21px', marginBottom: '3px' }}>{packetMeta.label}</div>
              <div style={{ fontSize: '15px', opacity: 0.8 }}>{osiLayer}</div>
            </div>
          </Html>
        </Billboard>
      )}

      {/* Packet visuals (separated so FX can stay stable) */}
      <group ref={visualRef}>
        {debugFlags.simpleGeom ? (
          <mesh name="packet_debug_sphere" renderOrder={2300}>
            <sphereGeometry args={[0.18, 20, 16]} />
            {useGhostBasic ? (
              <meshBasicMaterial color={colorHex} toneMapped={false} depthTest={false} depthWrite={false} />
            ) : (
              <meshStandardMaterial color={colorHex} emissive={colorHex} emissiveIntensity={0.3} roughness={0.8} metalness={0.0} depthTest={false} depthWrite={false} />
            )}
          </mesh>
        ) : (
          packetClone ? <primitive object={packetClone} /> : null
        )}
      </group>

      {/* Inspection-only FX */}
      {isInspect && (
        <group name="inspection_fx" renderOrder={2299}>
          {/* Beam to firewall */}
          <mesh ref={scanBeamRef} renderOrder={2299}>
            <cylinderGeometry args={[0.02, 0.02, 1, 10, 1, true]} />
            <meshBasicMaterial
              color={colorHex}
              transparent
              opacity={0}
              toneMapped={false}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Pulse ring around packet */}
          <mesh ref={scanRingRef} renderOrder={2299}>
            <torusGeometry args={[0.42, 0.06, 12, 72]} />
            <meshBasicMaterial
              color={colorHex}
              transparent
              opacity={0}
              toneMapped={false}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Traveling scan dots */}
          {Array.from({ length: 3 }).map((_, i) => (
            <mesh
              key={`scan-dot-${i}`}
              ref={(m) => { scanDotRefs.current[i] = m }}
              renderOrder={2299}
            >
              <sphereGeometry args={[0.06, 12, 10]} />
              <meshBasicMaterial
                color={colorHex}
                transparent
                opacity={0}
                toneMapped={false}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* Inspection hint chips (timed via useFrame DOM updates) */}
      {isInspect && (
        <>
          {inspectHints.map((text, i) => (
            <Billboard
              key={`inspect-chip-${i}`}
              follow
              // Space chips further apart to match the larger typography.
              position={[0.95, 1.1 - i * 0.46, 0]}
            >
              <Html center distanceFactor={10} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                <div ref={(el) => { hintElsRef.current[i] = el }} style={hintStyle}>
                  {text}
                </div>
              </Html>
            </Billboard>
          ))}
        </>
      )}
    </group>
  )
}
