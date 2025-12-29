"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

export type Axis = "x" | "y" | "z"

export interface VerticalTranslateArrowProps {
  // Axis to translate along; default 'y' (vertical)
  axis?: Axis

  // Live world-space center (green sphere) provided by parent
  centerRef: React.MutableRefObject<THREE.Vector3>

  // The object (pivot group) to move
  target: THREE.Object3D | React.RefObject<THREE.Object3D>

  // Called whenever the arrow applies movement; parent should update state
  onTranslate?: (nextLocalPos: [number, number, number], isDragging: boolean, worldDelta?: THREE.Vector3) => void

  // Visuals
  color?: string // default: green
  length?: number // default: 0.6 (shaft length excluding head)
  shaftRadius?: number // default: 0.008
  headLength?: number // default: 0.14
  headRadius?: number // default: 0.02

  // Interaction
  hitScale?: number // invisible hit area radius multiplier (default 1.4)
  maintainWorldSize?: boolean // default true
  renderOrder?: number // default 2100
  depthTest?: boolean // default false
  depthWrite?: boolean // default false
}

function deref(obj?: THREE.Object3D | React.RefObject<THREE.Object3D>): THREE.Object3D | null {
  if (!obj) return null
  if (obj instanceof THREE.Object3D) return obj
  if ("current" in obj) return obj.current ?? null
  return null
}

/**
 * VerticalTranslateArrow (isolated)
 * - Does NOT modify any existing files
 * - Parent decides when to render it and how to wire onTranslate
 * - Constrained translation along the selected world axis (default Y)
 */
export default function VerticalTranslateArrow({
  axis = "y",
  centerRef,
  target,
  onTranslate,
  color = "#00ff00",
  length = 0.6,
  shaftRadius = 0.008,
  headLength = 0.14,
  headRadius = 0.02,
  hitScale = 1.4,
  maintainWorldSize = true,
  renderOrder = 2100,
  depthTest = false,
  depthWrite = false,
}: VerticalTranslateArrowProps) {
  const { camera, gl } = useThree()

  const rootRef = useRef<THREE.Group>(null!)
  const draggingRef = useRef(false)
  const startParamRef = useRef(0)
  const startModelWorldRef = useRef(new THREE.Vector3())
  const parentAtDragRef = useRef<THREE.Object3D | null>(null)

  const axisWorld = useMemo(() => {
    const v = new THREE.Vector3()
    if (axis === "x") v.set(1, 0, 0)
    else if (axis === "y") v.set(0, 1, 0)
    else v.set(0, 0, 1)
    return v
  }, [axis])

  // Maintain consistent on-screen size by inversely scaling with target world scale
  const inverseScale = useMemo(() => {
    if (!maintainWorldSize) return 1
    const t = deref(target)
    if (!t) return 1
    const ws = new THREE.Vector3(1, 1, 1)
    t.updateMatrixWorld(true)
    t.getWorldScale(ws)
    const s = Math.max(ws.x, ws.y, ws.z)
    return !isFinite(s) || s === 0 ? 1 : 1 / s
  }, [target, maintainWorldSize])

  // Keep a small global state for camera cooperation, but do not import/modify any existing code
  const setGlobalGizmoState = useCallback((partial: any) => {
    if (typeof window !== "undefined") {
      ;(window as any).globalGizmoState = { ...(window as any).globalGizmoState, ...partial }
    }
  }, [])

  // Position/orient arrow at center; keep aligned to world axis (not target rotation)
  useFrame(() => {
    if (!rootRef.current) return
    rootRef.current.position.copy(centerRef.current)

    if (axis === "x") {
      rootRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    } else if (axis === "y") {
      rootRef.current.quaternion.identity()
    } else {
      rootRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))
    }
  })

  // Build a plane that contains the axis line and faces camera (stable drag)
  const makeAxisDragPlane = useCallback((center: THREE.Vector3, axisDir: THREE.Vector3): THREE.Plane => {
    const viewDir = camera.getWorldDirection(new THREE.Vector3()).normalize()
    let side = new THREE.Vector3().crossVectors(viewDir, axisDir)
    if (side.lengthSq() < 1e-6) {
      side.copy(new THREE.Vector3().crossVectors(camera.up, axisDir))
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    }
    const normal = new THREE.Vector3().crossVectors(axisDir, side).normalize()
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center.clone())
  }, [camera])

  // Intersection helper
  const intersectPointerWithPlane = useCallback((clientX: number, clientY: number, plane: THREE.Plane): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera as any)
    const hit = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, hit) ?? null
  }, [camera, gl.domElement])

  const beginDrag = useCallback((ev: any) => {
    ev?.stopPropagation?.(); ev?.preventDefault?.()
    const t = deref(target)
    if (!t) return
    try { document.body.style.cursor = 'grabbing' } catch {}

    const c = centerRef.current.clone()
    const plane = makeAxisDragPlane(c, axisWorld)
    const pt = intersectPointerWithPlane(ev.clientX ?? ev?.nativeEvent?.clientX, ev.clientY ?? ev?.nativeEvent?.clientY, plane)
    if (!pt) return

    // Parametric position along axis at drag start
    startParamRef.current = new THREE.Vector3().subVectors(pt, c).dot(axisWorld)

    // Snapshot model world position/parent
    t.updateMatrixWorld(true)
    parentAtDragRef.current = t.parent || null
    t.getWorldPosition(startModelWorldRef.current)

    draggingRef.current = true
    setGlobalGizmoState({ isDragging: true, lastActivity: Date.now() })

    try { (ev.target as any)?.setPointerCapture?.(ev.pointerId ?? ev?.nativeEvent?.pointerId) } catch {}

    const handleMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const curr = intersectPointerWithPlane(e.clientX, e.clientY, plane)
      if (!curr) return

      const currParam = new THREE.Vector3().subVectors(curr, c).dot(axisWorld)
      const deltaParam = currParam - startParamRef.current

      // Desired world position along the axis
      const desiredWorld = startModelWorldRef.current.clone().add(new THREE.Vector3().copy(axisWorld).multiplyScalar(deltaParam))

      const parent = parentAtDragRef.current
      if (parent) {
        const nextLocal = parent.worldToLocal(desiredWorld.clone())
        const nextPos: [number, number, number] = [nextLocal.x, nextLocal.y, nextLocal.z]
        const worldDelta = new THREE.Vector3().copy(axisWorld).multiplyScalar(deltaParam)
        onTranslate?.(nextPos, true, worldDelta)
        setGlobalGizmoState({ lastActivity: Date.now() })
      }
    }

    const handleUp = () => {
      draggingRef.current = false
      setGlobalGizmoState({ isDragging: false, isHovering: false, lastActivity: Date.now() })
      try { document.body.style.cursor = 'auto' } catch {}
      onTranslate?.((() => {
        const t2 = deref(target)!; t2.updateMatrixWorld(true)
        const local = t2.position
        return [local.x, local.y, local.z] as [number, number, number]
      })(), false)
      document.removeEventListener("pointermove", handleMove as any)
      document.removeEventListener("pointerup", handleUp as any)
    }

    document.addEventListener("pointermove", handleMove as any)
    document.addEventListener("pointerup", handleUp as any)
  }, [axisWorld, centerRef, intersectPointerWithPlane, makeAxisDragPlane, onTranslate, setGlobalGizmoState, target])

  // Hover feedback (slight scale-up)
  const [hovered, setHovered] = useState(false)
  const matProps = { depthTest, depthWrite, transparent: true, opacity: 0.95 }

  const hitMeshRef = useRef<THREE.Mesh>(null!)

  // Register global hit-test so arrow has priority over GLB free-drag even if GLB receives events first
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (!w.__arrowHitMeshes) w.__arrowHitMeshes = new Set<THREE.Object3D>()
    const m = hitMeshRef.current
    if (m) w.__arrowHitMeshes.add(m)

    w.__testArrowHit = (clientX: number, clientY: number) => {
      const set: Set<THREE.Object3D> = w.__arrowHitMeshes
      if (!set || set.size === 0) return false
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, camera as any)
      let anyHit = false
      set.forEach((obj) => {
        if (anyHit) return
        const hits = ray.intersectObject(obj as any, true)
        if (hits && hits.length > 0) {
          anyHit = true
        }
      })
      return anyHit
    }

    return () => {
      try { w.__arrowHitMeshes?.delete(m) } catch {}
    }
  }, [camera, gl.domElement])

  return (
    <group ref={rootRef}>
      {/* Invisible, larger hit area does the raycasting */}
      <mesh
        ref={hitMeshRef}
        renderOrder={renderOrder}
        position={[0, length * 0.5, 0]}
        onPointerDown={beginDrag}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); setGlobalGizmoState({ isHovering: true }); try { document.body.style.cursor = 'grab' } catch {} }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); setGlobalGizmoState({ isHovering: false }); try { document.body.style.cursor = 'auto' } catch {} }}
        scale={[inverseScale, inverseScale, inverseScale]}
      >
        <cylinderGeometry args={[shaftRadius * hitScale, shaftRadius * hitScale, length + headLength, 16]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>

      {/* Visible shaft */}
      <mesh position={[0, length * 0.5, 0]} scale={[inverseScale * (hovered ? 1.05 : 1), inverseScale * (hovered ? 1.05 : 1), inverseScale * (hovered ? 1.05 : 1)]} raycast={() => null as any}>
        <cylinderGeometry args={[shaftRadius, shaftRadius, length, 12]} />
        <meshBasicMaterial color={color} {...matProps} />
      </mesh>

      {/* Visible head */}
      <mesh position={[0, length + headLength * 0.5, 0]} scale={[inverseScale * (hovered ? 1.05 : 1), inverseScale * (hovered ? 1.05 : 1), inverseScale * (hovered ? 1.05 : 1)]} raycast={() => null as any}>
        <coneGeometry args={[headRadius, headLength, 16]} />
        <meshBasicMaterial color={color} {...matProps} />
      </mesh>
    </group>
  )
}
