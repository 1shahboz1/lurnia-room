'use client'

import React from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'

export default function UnknownDecor({
  type,
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 0.05],
}: {
  type: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}) {
  // Visible red panel with label to make the problem obvious during development
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={scale} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh position={[0, (scale[1] ?? 1) / 2 + 0.2, 0]}>
        <planeGeometry args={[Math.max(1.2, scale[0] ?? 1), 0.3]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <Text
        position={[0, (scale[1] ?? 1) / 2 + 0.2, 0.01]}
        fontSize={0.16}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        Unknown decor: {type}
      </Text>
    </group>
  )
}
