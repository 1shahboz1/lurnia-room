import * as React from 'react'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import PacketText from '@/components/packet/PacketText'
import PacketWhiteBoardMesh from '@/components/packet/PacketWhiteBoardMesh'
import PacketChipRectMesh from '@/components/packet/PacketChipRectMesh'
import { logMeshHierarchy, detectZFighting } from '@/utils/flickerDebug'

export interface ServerMetaDataBoardProps {
  visible?: boolean
  position?: [number, number, number]
  offsetRight?: number
  serverData: {
    id: string
    type: string
    label: string
    os: string
    interfaces: {
      id: string
      name: string
      kind: string
      ip: string
    }
    capabilities: string
  }
}

// Content component OUTSIDE to properly memoize
const ServerContent = React.memo(({ serverData, BOARD_W, BOARD_H, rectW, rectH, rectY }: {
  serverData: ServerMetaDataBoardProps['serverData']
  BOARD_W: number
  BOARD_H: number
  rectW: number
  rectH: number
  rectY: number
}) => {
  const zOffset = 0
  return (
    <group position={[0, -0.5, 0]}>
        {/* Header */}
        <PacketText
          position={[-BOARD_W/2 + 0.12, BOARD_H/2 + 0.38, 0]}
          anchorX="left"
          anchorY="top"
          fontSize={0.11}
          maxWidth={3.2}
          color="#0f172a"
          fontWeight={700 as any}
          renderOrder={5010}
          depthTest={false}
        >
          Server Metadata
        </PacketText>

        {/* Large chip rectangle for Fields */}
        <group position={[0, rectY, zOffset + 0.02]}>
          <PacketChipRectMesh
            width={rectW}
            height={rectH}
            fill="#f8fafc"
            stroke="#e2e8f0"
            radius={60}
            renderOrder={5005}
            depthTest={false}
            depthWrite={false}
          />
          
          {/* "Fields" label */}
          <PacketText
            position={[0, rectH/2 - 0.1, 0.01]}
            anchorX="center"
            anchorY="top"
            fontSize={0.09}
            color="#0f172a"
            fontWeight={700 as any}
            renderOrder={5015}
            depthTest={false}
          >
            Fields
          </PacketText>

          {/* Field rows */}
          <group position={[-rectW/2 + 0.08, rectH/2 - 0.28, zOffset + 0.03]}>
            {/* ID */}
            <PacketText position={[0, 0, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>ID:</PacketText>
            <PacketText position={[0.4, 0, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.id}</PacketText>
            
            {/* Label */}
            <PacketText position={[0, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Label:</PacketText>
            <PacketText position={[0.4, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.label}</PacketText>
            
            {/* OS */}
            <PacketText position={[0, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>OS:</PacketText>
            <PacketText position={[0.4, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.os}</PacketText>
            
            {/* Interfaces */}
            <PacketText position={[0, -0.48, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Interfaces:</PacketText>
            <PacketText position={[0.08, -0.59, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#64748b" renderOrder={5015} depthTest={false}>ID:</PacketText>
            <PacketText position={[0.38, -0.59, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.interfaces.id}</PacketText>
            <PacketText position={[0.08, -0.70, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#64748b" renderOrder={5015} depthTest={false}>Name:</PacketText>
            <PacketText position={[0.38, -0.70, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.interfaces.name}</PacketText>
            <PacketText position={[0.08, -0.81, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#64748b" renderOrder={5015} depthTest={false}>Kind:</PacketText>
            <PacketText position={[0.38, -0.81, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.interfaces.kind}</PacketText>
            <PacketText position={[0.08, -0.92, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#64748b" renderOrder={5015} depthTest={false}>IP:</PacketText>
            <PacketText position={[0.38, -0.92, 0]} anchorX="left" anchorY="top" fontSize={0.065} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.interfaces.ip}</PacketText>
            
            {/* Capabilities */}
            <PacketText position={[0, -1.04, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Capabilities:</PacketText>
            <PacketText position={[0.55, -1.04, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{serverData.capabilities}</PacketText>
          </group>
        </group>
    </group>
  )
})

export default function ServerMetaDataBoard({
  visible = true,
  position = [0, 0, 0],
  offsetRight = 2.0,
  serverData
}: ServerMetaDataBoardProps) {
  const groupRef = React.useRef<THREE.Group>(null)
  const frameCount = React.useRef(0)
  
  // DEBUG: Track if anything is changing
  useFrame(() => {
    frameCount.current++
    if (frameCount.current % 120 === 0 && groupRef.current) {
      console.log(`💥 [ServerMetaData ${serverData.label}] Frame ${frameCount.current} - Group still exists`)
    }
  })
  
  React.useEffect(() => {
    console.log(`🟨 [ServerMetaData ${serverData.label}] Mount`)
    return () => console.log(`🔴 [ServerMetaData ${serverData.label}] Unmount`)
  }, [])
  
  if (!visible) return null

  // Board dimensions
  const BOARD_W = 1.9
  const BOARD_H = 2.0
  const MARGIN_X = 0.12

  // Single large rectangle with Fields
  const rectW = BOARD_W - MARGIN_X * 2
  const rectH = 1.5
  const rectY = 0.41


  return (
    <group ref={groupRef} position={[position[0] + offsetRight, position[1], position[2]]}>
      {/* Board */}
      <PacketWhiteBoardMesh width={BOARD_W} height={BOARD_H} radius={120} />
      <group position={[0, 0, 0.02]}>
        <ServerContent serverData={serverData} BOARD_W={BOARD_W} BOARD_H={BOARD_H} rectW={rectW} rectH={rectH} rectY={rectY} />
      </group>
    </group>
  )
}
