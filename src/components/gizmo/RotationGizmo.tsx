"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

export type GizmoAxis = "x" | "y" | "z" | "all"

export interface RotationGizmoProps {
  // World-space center of rotation (required)
  center: THREE.Vector3
  // Optional: live-updating world-space center via ref (preferred for zero-lag following)
  centerRef?: React.MutableRefObject<THREE.Vector3>

  // Optional: the object you ultimately want to rotate (kept separate via callback)
  target?: THREE.Object3D | React.RefObject<THREE.Object3D>

  // Visibility and style
  visible?: boolean
  axes?: GizmoAxis[] // default: ["x","y","z"]
  radius?: number    // world-space radius; default 0.75
  thickness?: number // torus tube thickness; default 0.015
  colors?: Partial<Record<GizmoAxis, string>> // base colors for axes
  activeColors?: Partial<Record<GizmoAxis, string>> // colors while actively dragging that axis

  // Interaction
  snap?: number       // radians to snap to (e.g., Math.PI/12 for 15°); default: 0 (no snap)
  onRotate?: (axis: GizmoAxis, deltaRadians: number, absoluteRadians: number) => void
  applyToTarget?: boolean // if true, applies rotation to target directly; default false

  // Sizing behavior: keep constant world size even if target is scaled
  maintainWorldSize?: boolean // default true
  hitScale?: number // invisible hit area thickness multiplier; default 1.4

  // Render behavior
  renderOrder?: number    // default 2000 (above most scene content)
  depthTest?: boolean     // default false (always visible on top)
  depthWrite?: boolean    // default false
}

// Helper: get the underlying object from ref/or object
function deref(obj?: THREE.Object3D | React.RefObject<THREE.Object3D>): THREE.Object3D | null {
  if (!obj) return null
  if (obj instanceof THREE.Object3D) return obj
  if ("current" in obj) return obj.current ?? null
  return null
}

// Signed angle between a->b around axis n (all normalized except n which should be unit-length)
function signedAngleAround(a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3) {
  const cross = new THREE.Vector3().crossVectors(a, b)
  const sin = n.dot(cross)
  const cos = a.dot(b)
  return Math.atan2(sin, cos)
}

// Lighten a hex color by a given amount (0..1)
function lightenColor(hex: string, amt = 0.5) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = Math.min(255, Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * amt))
  const g = Math.min(255, Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * amt))
  const b = Math.min(255, Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * amt))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Convert screen coords to a world-space point on a given plane
function intersectPointerWithPlane(
  clientX: number,
  clientY: number,
  plane: THREE.Plane,
  camera: THREE.Camera,
  dom: HTMLCanvasElement
): THREE.Vector3 | null {
  const rect = dom.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  const ray = new THREE.Raycaster()
  ray.setFromCamera(ndc, camera as any)
  const hit = new THREE.Vector3()
  return ray.ray.intersectPlane(plane, hit) ?? null
}

export function RotationGizmo({
  center,
  centerRef,
  target,
  visible = true,
  axes = ["x", "y", "z"],
  radius = 0.75,
  thickness = 0.015,
  colors,
  activeColors,
  snap = 0,
  onRotate,
  applyToTarget = false,
  maintainWorldSize = true,
  hitScale = 1.4,
  renderOrder = 2000,
  depthTest = false,
  depthWrite = false,
}: RotationGizmoProps) {
  const { camera, gl } = useThree()

  // Root group that follows the center every frame (prevents one-frame lag)
  const rootRef = useRef<THREE.Group>(null!)

  // Fallback center when no ref is provided; keep in a ref to avoid stale closures
  const fallbackCenterRef = useRef(center.clone())
  useEffect(() => {
    fallbackCenterRef.current.copy(center)
  }, [center])

  const getCenter = useCallback(() => {
    return centerRef?.current ?? fallbackCenterRef.current
  }, [centerRef])

  // Compute object's local axes in world space (or view dir for 'all')
  const getAxisWorld = useCallback(
    (axis: GizmoAxis): THREE.Vector3 => {
      const t = deref(target)
      const v = new THREE.Vector3()
      if (axis === "all") {
        return camera.getWorldDirection(v).normalize()
      }
      if (axis === "x") v.set(1, 0, 0)
      else if (axis === "y") v.set(0, 1, 0)
      else if (axis === "z") v.set(0, 0, 1)
      else v.set(0, 1, 0)
      if (t) {
        const q = new THREE.Quaternion()
        t.updateMatrixWorld(true)
        t.getWorldQuaternion(q)
        v.applyQuaternion(q).normalize()
      }
      return v
    },
    [target, camera]
  )

  // Axis used during an active drag (frozen for the drag's lifetime)
  const axisWorldRef = useRef<THREE.Vector3 | null>(null)

  // Track ring hit meshes with axis mapping so GLB drag can delegate to ring drag reliably
  type RingEntry = { obj: THREE.Object3D; axis: GizmoAxis; drag: (ev: any) => void }
  const ringEntriesRef = useRef<Set<RingEntry>>(new Set())

  const registerHitForAxis = useCallback((axis: GizmoAxis) => (m: THREE.Object3D | null) => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (!w.__ringEntriesByUuid) w.__ringEntriesByUuid = new Map<string, any>()
    if (m) {
      const drag = (ev: any) => beginDrag(axis, ev)
      const entry: RingEntry = { obj: m, axis, drag }
      ringEntriesRef.current.add(entry)
      w.__ringEntriesByUuid.set(m.uuid, { axis, drag })
    }
    // Removal handled on unmount cleanup
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (!w.__ringEntriesByUuid) w.__ringEntriesByUuid = new Map<string, any>()

    // Raycast rings and return closest hit info { uuid, axis }
    w.__testRingHitInfo = (clientX: number, clientY: number) => {
      const map: Map<string, any> = w.__ringEntriesByUuid
      if (!map || map.size === 0) return null
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, camera as any)

      let closest: { distance: number; uuid: string; axis: GizmoAxis } | null = null
      // Iterate entries to test each ring hit mesh
      map.forEach((_v, uuid) => {
        // We don't have object refs here; find object in our local set
        const entry = Array.from(ringEntriesRef.current).find(e => e.obj.uuid === uuid)
        if (!entry) return
        const hits = ray.intersectObject(entry.obj as any, true)
        if (hits && hits.length > 0) {
          const d = hits[0].distance
          if (!closest || d < closest.distance) {
            closest = { distance: d, uuid, axis: entry.axis }
          }
        }
      })
      return closest ? { uuid: (closest as any).uuid, axis: (closest as any).axis } : null
    }

    // Trigger drag on a specific ring entry by uuid
    w.__ringDragByUuid = (uuid: string, clientX: number, clientY: number) => {
      const map: Map<string, any> = w.__ringEntriesByUuid
      const info = map?.get(uuid)
      if (!info) return
      const evlike = {
        clientX,
        clientY,
        pointerId: 1,
        target: gl.domElement,
        stopPropagation: () => {},
        preventDefault: () => {},
      }
      try {
        info.drag(evlike)
      } catch {}
    }

    return () => {
      try {
        const map: Map<string, any> = (window as any)?.__ringEntriesByUuid
        ringEntriesRef.current.forEach(entry => map?.delete(entry.obj.uuid))
      } catch {}
    }
  }, [camera, gl.domElement])

  // Imperatively sync the root group position/orientation every frame
  useFrame(() => {
    const c = getCenter()
    if (rootRef.current) {
      rootRef.current.position.copy(c)
      // Align gizmo orientation with target's world orientation so rings align to object axes
      const t = deref(target)
      if (t) {
        const q = new THREE.Quaternion()
        t.updateMatrixWorld(true)
        t.getWorldQuaternion(q)
        rootRef.current.quaternion.copy(q)
      } else {
        rootRef.current.quaternion.identity()
      }
    }
  })

  // world-size invariance: compute inverse scale from target's world scale
  const inverseScale = useMemo(() => {
    if (!maintainWorldSize) return 1
    const t = deref(target)
    if (!t) return 1
    const ws = new THREE.Vector3(1, 1, 1)
    t.updateMatrixWorld(true)
    t.getWorldScale(ws)
    const s = Math.max(ws.x, ws.y, ws.z)
    if (!isFinite(s) || s === 0) return 1
    return 1 / s
  }, [target, maintainWorldSize])

  const [activeAxis, setActiveAxis] = useState<GizmoAxis | null>(null)
  const [hoveredAxis, setHoveredAxis] = useState<GizmoAxis | null>(null)
  const dragStartVecRef = useRef<THREE.Vector3 | null>(null)
  const lastAngleRef = useRef(0)
  const planeRef = useRef<THREE.Plane | null>(null)
  const draggingRef = useRef(false)

  // Set global gizmo state to cooperate with camera controls
  const setGlobalGizmoState = useCallback((partial: any) => {
    if (typeof window !== "undefined") {
      ;(window as any).globalGizmoState = {
        ...(window as any).globalGizmoState,
        ...partial,
      }
    }
  }, [])

// Compute plane from axis
  const makePlaneForAxis = useCallback(
    (axis: GizmoAxis): THREE.Plane => {
      const normal = getAxisWorld(axis)
      const c = getCenter()
      return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, c.clone())
    },
    [getAxisWorld, getCenter]
  )

const beginDrag = useCallback(
    (axis: GizmoAxis, ev: any) => {
      ev?.stopPropagation?.()
      ev?.preventDefault?.()
      // Cursor: show grabbing during drag
      try { document.body.style.cursor = 'grabbing' } catch {}

      const plane = makePlaneForAxis(axis)
      planeRef.current = plane
      axisWorldRef.current = getAxisWorld(axis).clone()

      const pt = intersectPointerWithPlane(
        ev.clientX ?? ev?.nativeEvent?.clientX,
        ev.clientY ?? ev?.nativeEvent?.clientY,
        plane,
        camera,
        gl.domElement
      )
      if (!pt) return

      const c = getCenter()
      const v = new THREE.Vector3().subVectors(pt, c).normalize()
      dragStartVecRef.current = v
      lastAngleRef.current = 0
      draggingRef.current = true
      setActiveAxis(axis)
      setGlobalGizmoState({ isDragging: true, lastActivity: Date.now() })

      // capture
      try {
        const pid = ev.pointerId ?? ev?.nativeEvent?.pointerId
        ev?.target?.setPointerCapture?.(pid)
      } catch {}

const handleMove = (e: PointerEvent) => {
        if (!draggingRef.current || !planeRef.current || !dragStartVecRef.current) return
        const hit = intersectPointerWithPlane(e.clientX, e.clientY, planeRef.current, camera, gl.domElement)
        if (!hit) return

        const c = getCenter()
        const curr = new THREE.Vector3().subVectors(hit, c).normalize()
        const start = dragStartVecRef.current

        // axis vector for sign (frozen from drag start)
        const n = (axisWorldRef.current ?? getAxisWorld(axis)).clone().normalize()

        const absoluteAngle = signedAngleAround(start, curr, n)
        let delta = absoluteAngle - lastAngleRef.current

        // snapping
        if (snap && snap > 0) {
          const snappedAbs = Math.round(absoluteAngle / snap) * snap
          delta = snappedAbs - lastAngleRef.current
          // ensure lastAngleRef will advance in snaps only
          if (Math.abs(delta) < 1e-6) return
          lastAngleRef.current = snappedAbs
        } else {
          lastAngleRef.current = absoluteAngle
        }

        // Apply to target if requested
        if (applyToTarget) {
          const t = deref(target)
          if (t && isFinite(delta)) {
            const axisVec = (axisWorldRef.current ?? getAxisWorld(axis)).clone().normalize()
            // rotate around world axis at world center
            // translate to center, rotate, translate back
            const m = new THREE.Matrix4()
            const mInv = new THREE.Matrix4()
m.makeTranslation(-c.x, -c.y, -c.z)
            mInv.makeTranslation(c.x, c.y, c.z)

            const q = new THREE.Quaternion().setFromAxisAngle(axisVec.normalize(), delta)
            const rot = new THREE.Matrix4().makeRotationFromQuaternion(q)

            t.updateMatrixWorld(true)
            // world matrix adjustment
            const world = t.matrixWorld.clone()
            const newWorld = new THREE.Matrix4().multiplyMatrices(mInv, rot).multiply(m).multiply(world)
            // set new world matrix back onto object
            const parentInv = new THREE.Matrix4()
            if (t.parent) parentInv.copy(t.parent.matrixWorld).invert()
            const local = new THREE.Matrix4().multiplyMatrices(parentInv, newWorld)
            t.matrix.copy(local)
            t.matrix.decompose(t.position, t.quaternion, t.scale)
            t.updateMatrixWorld(true)
          }
        }

        // Callback
        onRotate?.(axis, delta, lastAngleRef.current)
        // activity heartbeat for watchdog
        setGlobalGizmoState({ lastActivity: Date.now() })
      }

      const handleUp = (e: PointerEvent) => {
        draggingRef.current = false
        setActiveAxis(null)
        setGlobalGizmoState({ isDragging: false, isHovering: false, lastActivity: Date.now() })
        console.log('📍 ROTATION GIZMO END: Global state reset')
        try {
          const pid = (ev.pointerId ?? (ev as any)?.nativeEvent?.pointerId) as number
          ;(ev.target as any)?.releasePointerCapture?.(pid)
        } catch {}
        document.removeEventListener("pointermove", handleMove as any)
        document.removeEventListener("pointerup", handleUp as any)
        try { document.body.style.cursor = 'auto' } catch {}
      }

      document.addEventListener("pointermove", handleMove as any)
      document.addEventListener("pointerup", handleUp as any)
},
    [camera, gl.domElement, makePlaneForAxis, getAxisWorld, getCenter, setGlobalGizmoState, target, applyToTarget, onRotate, activeAxis, snap]
  )

  if (!visible) return null

  const col = {
    x: colors?.x ?? "#ff5252",
    y: colors?.y ?? "#52ff52",
    z: colors?.z ?? "#5252ff",
    all: colors?.all ?? "#ffd84d",
  }

  const colActive = {
    x: (activeColors?.x ?? lightenColor(col.x, 0.5)),
    y: (activeColors?.y ?? lightenColor(col.y, 0.5)),
    z: (activeColors?.z ?? lightenColor(col.z, 0.5)),
    all: (activeColors?.all ?? lightenColor(col.all, 0.4)),
  }

  const colHover = {
    x: lightenColor(col.x, 0.25),
    y: lightenColor(col.y, 0.25),
    z: lightenColor(col.z, 0.25),
    all: lightenColor(col.all, 0.2),
  }

  // Common material props
  const matProps = {
    depthTest,
    depthWrite,
    transparent: true,
    opacity: 0.95,
  }

  const makeRing = (axis: GizmoAxis, rotation: [number, number, number]) => (
    <group key={`ring-${axis}-group`} rotation={rotation} scale={[inverseScale, inverseScale, inverseScale]}>
      {/* Invisible, thicker hit area */}
      <mesh
        key={`ring-hit-${axis}`}
        ref={registerHitForAxis(axis) as any}
        renderOrder={renderOrder}
        onPointerDown={(e) => beginDrag(axis, e)}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHoveredAxis(axis)
          setGlobalGizmoState({ isHovering: true, lastActivity: Date.now() })
          try { document.body.style.cursor = 'grab' } catch {}
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHoveredAxis(null)
          setGlobalGizmoState({ isHovering: false, lastActivity: Date.now() })
          try { document.body.style.cursor = 'auto' } catch {}
        }}
      >
        <torusGeometry args={[radius, thickness * hitScale, 12, 64]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>

      {/* Visible ring */}
      <mesh key={`ring-vis-${axis}`} raycast={() => null as any}>
        <torusGeometry args={[radius, thickness, 12, 64]} />
        <meshBasicMaterial
          color={activeAxis === axis ? colActive[axis] : (hoveredAxis === axis ? colHover[axis] : col[axis])}
          {...matProps}
          opacity={activeAxis === axis ? 1.0 : 0.9}
        />
      </mesh>
    </group>
  )

  return (
    <group ref={rootRef}>
      {axes.includes("x") && makeRing("x", [0, Math.PI / 2, 0])}
      {axes.includes("y") && makeRing("y", [Math.PI / 2, 0, 0])}
      {axes.includes("z") && makeRing("z", [0, 0, 0])}
      {axes.includes("all") && (
        <group key="ring-all" scale={[inverseScale, inverseScale, inverseScale]}>
          {/* Invisible, thicker hit area */}
          <mesh
            ref={registerHitForAxis("all") as any}
            renderOrder={renderOrder}
            onPointerDown={(e) => beginDrag("all", e)}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHoveredAxis("all")
            setGlobalGizmoState({ isHovering: true })
            try { document.body.style.cursor = 'grab' } catch {}
          }}
          onPointerOut={(e) => {
            e.stopPropagation()
            setHoveredAxis(null)
            setGlobalGizmoState({ isHovering: false })
            try { document.body.style.cursor = 'auto' } catch {}
          }}
          >
            <torusGeometry args={[radius * 1.05, thickness * 0.9 * hitScale, 10, 64]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
          </mesh>
          {/* Visible ring */}
          <mesh raycast={() => null as any}>
            <torusGeometry args={[radius * 1.05, thickness * 0.9, 10, 64]} />
            <meshBasicMaterial color={activeAxis === "all" ? colActive.all : (hoveredAxis === "all" ? colHover.all : col.all)} {...matProps} opacity={activeAxis === "all" ? 1.0 : 0.6} />
          </mesh>
        </group>
      )}
    </group>
  )
}

export default RotationGizmo
