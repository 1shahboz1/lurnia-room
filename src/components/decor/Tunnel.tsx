'use client'

import React from 'react'
import * as THREE from 'three'

export default function Tunnel({
  position,
  rotation = [0, 0, 0],
  radius = 2.5,
  length = 12,
  radialSegments = 48,
  heightSegments = 1,
  glow = '#22c55e',
  body = '#0b1220',
  opacity = 1.0,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  radius?: number
  length?: number
  radialSegments?: number
  heightSegments?: number
  glow?: string
  body?: string
  opacity?: number
}) {
  // Cylinder is Y-aligned by default; rotate -90deg around X to align along Z
  const rot: [number, number, number] = [rotation[0] - Math.PI / 2, rotation[1], rotation[2]]

  return (
    <group position={position} rotation={rot}>
      {/* Outer shell */}
      <mesh>
        <cylinderGeometry args={[radius, radius, length, radialSegments, heightSegments, true]} />
        <meshStandardMaterial
          color={body}
          emissive={glow}
          emissiveIntensity={0.35}
          roughness={0.6}
          metalness={0.05}
          side={THREE.DoubleSide}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
    </group>
  )
}
