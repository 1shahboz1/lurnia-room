'use client'

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface PortIndicatorProps {
  deviceId: string
  portNumber: number
  position: [number, number, number] // Relative position on the device
  type: 'incoming' | 'outgoing'
  duration?: number
  onComplete?: () => void
}

/**
 * Shows a glowing indicator at a specific port on a device when data flows through
 */
export default function PortIndicator({
  deviceId,
  portNumber,
  position,
  type,
  duration = 0.5,
  onComplete,
}: PortIndicatorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const elapsedRef = useRef(0)
  const completedRef = useRef(false)
  
  console.log('🔵 PortIndicator rendering:', { deviceId, portNumber, position, type })
  
  // Color based on direction
  const color = type === 'incoming' ? '#10b981' : '#3b82f6' // Green for incoming, Blue for outgoing
  
  // Animate the indicator
  useFrame((state, delta) => {
    if (completedRef.current || !meshRef.current) return
    
    elapsedRef.current += delta
    const progress = Math.min(1, elapsedRef.current / duration)
    
    // Pulse animation: quick flash
    const intensity = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5
    const scale = 1 + intensity * 0.5
    
    meshRef.current.scale.setScalar(scale)
    
    // Fade out towards the end
    const opacity = progress < 0.7 ? 1 : 1 - ((progress - 0.7) / 0.3)
    const material = meshRef.current.material as THREE.MeshBasicMaterial
    material.opacity = opacity
    
    // Complete when done
    if (progress >= 1 && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
  })
  
  return (
    <mesh ref={meshRef} position={position}>
      {/* Larger glowing sphere at the port */}
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={1}
        toneMapped={false}
        depthTest={false}
      />
      
      {/* Outer glow ring */}
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[0.3, 0.5, 16]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.6}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthTest={false}
        />
      </mesh>
    </mesh>
  )
}
