'use client'

import React from 'react'

export type LightPanel = {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  emissive?: string
  emissiveIntensity?: number
}

export default function CeilingLightPanels({
  panels = [],
}: {
  panels: LightPanel[]
}) {
  return (
    <group>
      {panels.map((p, i) => (
        <mesh key={`clp-${i}`} position={p.position} renderOrder={2}>
          <boxGeometry args={p.size} />
          <meshBasicMaterial 
            color={p.color || '#ffffff'} 
            toneMapped={false}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
    </group>
  )
}
