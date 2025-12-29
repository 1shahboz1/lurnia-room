'use client'

import React from 'react'

export default function FirewallWall({
  position,
  rotation = [0, 0, 0],
  width,
  height,
  thickness = 0.06,
  color = '#1f2937',
  roughness = 0.95,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width: number
  height: number
  thickness?: number
  color?: string
  roughness?: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[width, height, Math.max(0.02, thickness)]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={0} />
      </mesh>
    </group>
  )
}
