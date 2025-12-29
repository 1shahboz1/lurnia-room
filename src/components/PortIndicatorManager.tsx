'use client'

import { useState, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PortIndicator from './PortIndicator'
import { getPortForConnection, getPortPosition } from '@/config/ports'

interface ActivePort {
  id: string
  deviceId: string
  portNumber: number
  worldPosition: [number, number, number]
  type: 'incoming' | 'outgoing'
}

interface PortIndicatorManagerProps {
  fromAnchor?: string | null
  toAnchor?: string | null
  isActive: boolean
}

/**
 * Manages port indicators across all devices during packet transmission
 */
export default function PortIndicatorManager({
  fromAnchor,
  toAnchor,
  isActive,
}: PortIndicatorManagerProps) {
  const { scene } = useThree()
  const [activePorts, setActivePorts] = useState<ActivePort[]>([])
  
  useEffect(() => {
    console.log('🔌 PortIndicatorManager effect:', { isActive, fromAnchor, toAnchor })
    
    if (!isActive || !fromAnchor || !toAnchor) {
      setActivePorts([])
      return
    }
    
    // Get port numbers for this connection
    const portInfo = getPortForConnection(fromAnchor, toAnchor)
    if (!portInfo) {
      console.log(`🔌 No port mapping for ${fromAnchor} → ${toAnchor}`)
      return
    }
    
    console.log(`🔌 Port activity: ${fromAnchor}:${portInfo.fromPort} → ${toAnchor}:${portInfo.toPort}`)
    
    // Get device positions from scene
    const fromDevice = scene.getObjectByName(`${fromAnchor}-center`) || scene.getObjectByName(fromAnchor)
    const toDevice = scene.getObjectByName(`${toAnchor}-center`) || scene.getObjectByName(toAnchor)
    
    if (!fromDevice || !toDevice) {
      console.warn(`🔌 Could not find devices: ${fromAnchor}, ${toAnchor}`)
      return
    }
    
    // Get port positions relative to device
    const fromPortPos = getPortPosition(fromAnchor, portInfo.fromPort)
    const toPortPos = getPortPosition(toAnchor, portInfo.toPort)
    
    if (!fromPortPos || !toPortPos) {
      console.log(`🔌 No port positions defined for ${fromAnchor}:${portInfo.fromPort} or ${toAnchor}:${portInfo.toPort}`)
      return
    }
    
    // Convert to world space
    fromDevice.updateMatrixWorld(true)
    toDevice.updateMatrixWorld(true)
    
    const fromWorldPos = new THREE.Vector3(...fromPortPos)
    fromDevice.localToWorld(fromWorldPos)
    
    const toWorldPos = new THREE.Vector3(...toPortPos)
    toDevice.localToWorld(toWorldPos)
    
    // Create active port indicators
    const ports: ActivePort[] = [
      {
        id: `${fromAnchor}-${portInfo.fromPort}-out`,
        deviceId: fromAnchor,
        portNumber: portInfo.fromPort,
        worldPosition: [fromWorldPos.x, fromWorldPos.y, fromWorldPos.z],
        type: 'outgoing'
      },
      {
        id: `${toAnchor}-${portInfo.toPort}-in`,
        deviceId: toAnchor,
        portNumber: portInfo.toPort,
        worldPosition: [toWorldPos.x, toWorldPos.y, toWorldPos.z],
        type: 'incoming'
      }
    ]
    
    setActivePorts(ports)
  }, [fromAnchor, toAnchor, isActive, scene])
  
  return (
    <>
      {activePorts.map(port => (
        <PortIndicator
          key={port.id}
          deviceId={port.deviceId}
          portNumber={port.portNumber}
          position={port.worldPosition}
          type={port.type}
          duration={0.6}
          onComplete={() => {
            // Remove this port from active list
            setActivePorts(prev => prev.filter(p => p.id !== port.id))
          }}
        />
      ))}
    </>
  )
}
