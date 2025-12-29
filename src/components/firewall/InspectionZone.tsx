'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

type InspectionZoneProps = {
  active: boolean
  anchorName?: string
  y?: number
  radius?: number
  ringWidth?: number
  color?: string
}

/**
 * Semi-transparent, softly glowing inspection zone (floor decal) anchored to a device center.
 * Intended for the Firewall room's "Rule Evaluation" phase (Phase 2: Inspection & Policy Check).
 */
export default function InspectionZone({
  active,
  anchorName = 'firewall1-center',
  y = 0.03,
  radius = 2.25,
  ringWidth = 0.28,
  color = '#93c5fd',
}: InspectionZoneProps) {
  const { scene } = useThree()

  const rootRef = useRef<THREE.Group>(null)
  const anchorRef = useRef<THREE.Object3D | null>(null)

  const fillMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const edgeMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null)

  const edgeMeshRef = useRef<THREE.Mesh>(null)
  const scanMeshRef = useRef<THREE.Mesh>(null)
  const verticalMatRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])

  const activeTRef = useRef(0)

  const geoms = useMemo(() => {
    // High segment count to avoid hard edges
    const segs = 96
    const inner = Math.max(0.1, radius - ringWidth)
    const outer = Math.max(inner + 0.05, radius)

    const fill = new THREE.CircleGeometry(inner, segs)
    const ring = new THREE.RingGeometry(inner, outer, segs)
    const glow = new THREE.RingGeometry(outer, outer + ringWidth * 0.8, segs)

    // Thin outer edge for a subtle "active" pulse
    const edgeInner = Math.max(inner, outer - Math.max(0.03, ringWidth * 0.14))
    const edge = new THREE.RingGeometry(edgeInner, outer, segs)

    // Slow scan sweep arc (airport scanner metaphor)
    const scan = new THREE.RingGeometry(inner, outer, segs, 1, 0, Math.PI / 3)

    return { fill, ring, glow, edge, scan }
  }, [radius, ringWidth])

  useEffect(() => {
    return () => {
      try { geoms.fill.dispose() } catch {}
      try { geoms.ring.dispose() } catch {}
      try { geoms.glow.dispose() } catch {}
      try { geoms.edge.dispose() } catch {}
      try { geoms.scan.dispose() } catch {}
    }
  }, [geoms])

  useFrame((state, delta) => {
    const root = rootRef.current
    if (!root) return

    // Find anchor lazily (models load async)
    if (!anchorRef.current) {
      anchorRef.current =
        scene.getObjectByName(anchorName) ||
        scene.getObjectByName('firewall1-center') ||
        scene.getObjectByName('firewall1') ||
        null
    }

    const anchor = anchorRef.current
    if (anchor) {
      const wp = new THREE.Vector3()
      anchor.getWorldPosition(wp)
      root.position.set(wp.x, y, wp.z)
    }

    const target = active ? 1 : 0
    activeTRef.current = THREE.MathUtils.damp(activeTRef.current, target, 6, delta)

    // Calm pulse (slow, not flashy)
    const t = state.clock.getElapsedTime()
    const pulseSlow = 0.5 + 0.5 * Math.sin(t * 0.6) // ~10s period
    const pulseEdge = 0.5 + 0.5 * Math.sin(t * 0.9) // a bit quicker, still calm

    if (fillMatRef.current) fillMatRef.current.opacity = 0.045 * activeTRef.current
    if (ringMatRef.current) ringMatRef.current.opacity = 0.12 * activeTRef.current
    if (glowMatRef.current) glowMatRef.current.opacity = (0.10 + pulseSlow * 0.06) * activeTRef.current

    if (edgeMatRef.current) edgeMatRef.current.opacity = (0.08 + pulseEdge * 0.08) * activeTRef.current
    if (edgeMeshRef.current) {
      const s = 1 + pulseEdge * 0.01 * activeTRef.current
      edgeMeshRef.current.scale.setScalar(s)
    }

    // Vertical glow stack: faint rings rising slightly above the floor
    for (let i = 0; i < verticalMatRefs.current.length; i++) {
      const m = verticalMatRefs.current[i]
      if (!m) continue
      const falloff = Math.max(0, 1 - i / Math.max(1, verticalMatRefs.current.length))
      m.opacity = (0.10 * falloff) * activeTRef.current * (0.65 + 0.35 * pulseSlow)
    }

    // Subtle scan sweep
    if (scanMeshRef.current) {
      scanMeshRef.current.rotation.z = t * 0.18 // ~35s per revolution
    }
    if (scanMatRef.current) scanMatRef.current.opacity = (0.03 + pulseSlow * 0.03) * activeTRef.current
  })

  return (
    <group ref={rootRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Soft zone fill */}
      <mesh geometry={geoms.fill}>
        <meshBasicMaterial
          ref={fillMatRef}
          color={color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Main ring */}
      <mesh geometry={geoms.ring}>
        <meshBasicMaterial
          ref={ringMatRef}
          color={color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Soft edge glow */}
      <mesh geometry={geoms.glow} position={[0, 0, 0.001]}>
        <meshBasicMaterial
          ref={glowMatRef}
          color={color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Pulsing edge (thin) */}
      <mesh ref={edgeMeshRef} geometry={geoms.edge} position={[0, 0, 0.0015]}>
        <meshBasicMaterial
          ref={edgeMatRef}
          color={color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Faint vertical glow rising above the floor (stacked rings — not a wall) */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={`vglow-${i}`}
          geometry={geoms.glow}
          position={[0, 0, 0.02 + i * 0.07]}
          scale={1 + i * 0.04}
        >
          <meshBasicMaterial
            ref={(m) => { verticalMatRefs.current[i] = m }}
            color={color}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            toneMapped={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Subtle scanning sweep */}
      <mesh ref={scanMeshRef} geometry={geoms.scan} position={[0, 0, 0.002]}>
        <meshBasicMaterial
          ref={scanMatRef}
          color={color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
