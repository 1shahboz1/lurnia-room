import * as React from 'react'
import PacketText from '@/components/packet/PacketText'
import PacketWhiteBoardMesh from '@/components/packet/PacketWhiteBoardMesh'
import PacketChipRectMesh from '@/components/packet/PacketChipRectMesh'

export interface SwitchMetaDataBoardProps {
  visible?: boolean
  position?: [number, number, number]
  offsetRight?: number
  switchData: {
    id: string
    type: string
    label: string
    os: string
    interfaces: Array<{
      name: string
      type: string
      info: string
    }>
    mgmt_ip: string
    capabilities: string
  }
}

type SwitchContentProps = {
  switchData: SwitchMetaDataBoardProps['switchData']
  BOARD_W: number
  BOARD_H: number
  rectW: number
  rectH: number
  rectY: number
}

const SwitchContent: React.FC<SwitchContentProps> = React.memo(function SwitchContent({ switchData, BOARD_W, BOARD_H, rectW, rectH, rectY }) {
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
          Switch Metadata
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
            <PacketText position={[0.4, 0, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{switchData.id}</PacketText>
            
            {/* Label */}
            <PacketText position={[0, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Label:</PacketText>
            <PacketText position={[0.4, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{switchData.label}</PacketText>
            
            {/* OS */}
            <PacketText position={[0, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>OS:</PacketText>
            <PacketText position={[0.4, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{switchData.os}</PacketText>
            
            {/* Interfaces */}
            <PacketText position={[0, -0.48, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Interfaces:</PacketText>
            {switchData.interfaces.map((iface, idx) => (
              <PacketText 
                key={idx}
                position={[0.08, -0.59 - (idx * 0.11), 0]} 
                anchorX="left" 
                anchorY="top" 
                fontSize={0.065} 
                color="#0f172a" 
                renderOrder={5015} 
                depthTest={false}
              >
                {iface.name} ({iface.type}, {iface.info})
              </PacketText>
            ))}
            
            {/* Mgmt IP */}
            <PacketText position={[0, -0.48 - (switchData.interfaces.length * 0.11) - 0.11, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Mgmt IP:</PacketText>
            <PacketText position={[0.43, -0.48 - (switchData.interfaces.length * 0.11) - 0.11, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{switchData.mgmt_ip}</PacketText>
            
            {/* Capabilities */}
            <PacketText position={[0, -0.48 - (switchData.interfaces.length * 0.11) - 0.23, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Capabilities:</PacketText>
            <PacketText position={[0.55, -0.48 - (switchData.interfaces.length * 0.11) - 0.23, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{switchData.capabilities}</PacketText>
          </group>
        </group>
    </group>
  )
})

export default function SwitchMetaDataBoard({
  visible = true,
  position = [0, 0, 0],
  offsetRight = 2.0,
  switchData
}: SwitchMetaDataBoardProps) {
  React.useEffect(() => {
    console.log('🟨 [SwitchMetaData] Mount')
    return () => console.log('🔴 [SwitchMetaData] Unmount')
  }, [])
  
  if (!visible) return null

  // Board dimensions
  const BOARD_W = 1.9
  const BOARD_H = 2.2  // Slightly taller for more interfaces
  const MARGIN_X = 0.12

  // Single large rectangle with Fields
  const rectW = BOARD_W - MARGIN_X * 2
  const rectH = 1.7
  const rectY = 0.41

  return (
    <group position={[position[0] + offsetRight, position[1], position[2]]}>
      {/* Board */}
      <PacketWhiteBoardMesh width={BOARD_W} height={BOARD_H} radius={120} />
      <group position={[0, 0, 0.02]}>
        <SwitchContent switchData={switchData} BOARD_W={BOARD_W} BOARD_H={BOARD_H} rectW={rectW} rectH={rectH} rectY={rectY} />
      </group>
    </group>
  )
}
