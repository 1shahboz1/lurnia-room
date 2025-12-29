'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export type FirewallStatusLightState = 'none' | 'approved' | 'denied'

export default function FirewallStatusLight({
  state,
  anchorName = 'firewall1-center',
  floorY = 0.03,
}: {
  state: FirewallStatusLightState
  anchorName?: string
  floorY?: number
}) {
  const { scene } = useThree()

  const groupRef = useRef<THREE.Group>(null)
  const baseMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null)

  const anchorRef = useRef<THREE.Object3D | null>(null)
  const tmpV = useRef(new THREE.Vector3())

  const lastStateRef = useRef<FirewallStatusLightState>('none')
  const popRef = useRef(0) // 0..1 transient pulse when state changes

  const color = useMemo(() => {
    if (state === 'approved') return new THREE.Color('#22c55e')
    if (state === 'denied') return new THREE.Color('#ef4444')
    return new THREE.Color('#9ca3af') // neutral grey
  }, [state])

  const geoms = useMemo(() => {
    return {
      disc: new THREE.CircleGeometry(0.42, 48),
      glow: new THREE.RingGeometry(0.46, 0.78, 64),
    }
  }, [])

  useEffect(() => {
    return () => {
      try { geoms.disc.dispose() } catch {}
      try { geoms.glow.dispose() } catch {}
    }
  }, [geoms])

  useEffect(() => {
    if (lastStateRef.current !== state) {
      lastStateRef.current = state
      popRef.current = 1
    }
  }, [state])

  useFrame((_, delta) => {
    // Resolve anchor lazily (GLBs load async)
    if (!anchorRef.current) {
      anchorRef.current = scene.getObjectByName(anchorName) || scene.getObjectByName(anchorName.replace(/-center$/, '')) || null
    }

    if (anchorRef.current && groupRef.current) {
      anchorRef.current.updateMatrixWorld(true)
      anchorRef.current.getWorldPosition(tmpV.current)
      groupRef.current.position.set(tmpV.current.x, floorY, tmpV.current.z)
    }

    // Pulse on state changes
    popRef.current = THREE.MathUtils.damp(popRef.current, 0, 10, delta)

    const pop = popRef.current
    const baseOpacity = state === 'none' ? 0.55 : 0.95
    const glowOpacity = (state === 'none' ? 0.18 : 0.42) + pop * 0.25
    const scale = 1 + pop * 0.25

    if (baseMatRef.current) {
      baseMatRef.current.color.copy(color)
      baseMatRef.current.opacity = baseOpacity
    }
    if (glowMatRef.current) {
      glowMatRef.current.color.copy(color)
      glowMatRef.current.opacity = glowOpacity
    }

    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2100}>
      <mesh geometry={geoms.disc} renderOrder={2100}>
        <meshBasicMaterial
          ref={baseMatRef}
          transparent
          opacity={0.6}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geoms.glow} position={[0, 0, 0.001]} renderOrder={2101}>
        <meshBasicMaterial
          ref={glowMatRef}
          transparent
          opacity={0.2}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
