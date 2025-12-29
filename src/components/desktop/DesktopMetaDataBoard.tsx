import * as React from 'react'
import PacketText from '@/components/packet/PacketText'
import PacketWhiteBoardMesh from '@/components/packet/PacketWhiteBoardMesh'
import PacketChipRectMesh from '@/components/packet/PacketChipRectMesh'

export type DesktopMetaDataInterface = {
  id?: string
  name?: string
  kind?: string
  ip?: string
  gateway?: string
}

export type DesktopMetaData = {
  id: string
  type: string
  label: string
  os: string
  interfaces: DesktopMetaDataInterface[]
  capabilities: string
}

export interface DesktopMetaDataBoardProps {
  visible?: boolean
  position?: [number, number, number]
  offsetRight?: number
  desktopData?: DesktopMetaData
}

type DesktopContentProps = {
  desktopData: DesktopMetaData
  BOARD_W: number
  BOARD_H: number
  rectW: number
  rectH: number
  rectY: number
}

const DesktopContent: React.FC<DesktopContentProps> = React.memo(function DesktopContent({ desktopData, BOARD_W, BOARD_H, rectW, rectH, rectY }) {
  const zOffset = 0
  const interfaces = desktopData.interfaces?.length ? desktopData.interfaces : [{ name: 'eth0', kind: 'eth', ip: '0.0.0.0' }]

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
        Desktop Metadata
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
          <PacketText position={[0.4, 0, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{desktopData.id}</PacketText>

          {/* Label */}
          <PacketText position={[0, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Label:</PacketText>
          <PacketText position={[0.4, -0.12, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{desktopData.label}</PacketText>

          {/* OS */}
          <PacketText position={[0, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>OS:</PacketText>
          <PacketText position={[0.4, -0.24, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{desktopData.os}</PacketText>

          {/* Interfaces */}
          <PacketText position={[0, -0.36, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Interfaces:</PacketText>
          {interfaces.map((iface, idx) => {
            const name = iface.name || iface.id || `iface${idx + 1}`
            const kind = iface.kind ? ` (${iface.kind})` : ''
            const ip = iface.ip ? ` ${iface.ip}` : ''
            const gw = iface.gateway ? ` → gw ${iface.gateway}` : ''
            return (
              <PacketText
                key={idx}
                position={[0.08, -0.47 - (idx * 0.11), 0]}
                anchorX="left"
                anchorY="top"
                fontSize={0.065}
                color="#0f172a"
                renderOrder={5015}
                depthTest={false}
              >
                {`${name}${kind}${ip}${gw}`}
              </PacketText>
            )
          })}

          {/* Capabilities */}
          <PacketText position={[0, -0.36 - (interfaces.length * 0.11) - 0.11, 0]} anchorX="left" anchorY="top" fontSize={0.07} fontWeight={600 as any} color="#64748b" renderOrder={5015} depthTest={false}>Capabilities:</PacketText>
          <PacketText position={[0.55, -0.36 - (interfaces.length * 0.11) - 0.11, 0]} anchorX="left" anchorY="top" fontSize={0.07} color="#0f172a" renderOrder={5015} depthTest={false}>{desktopData.capabilities}</PacketText>
        </group>
      </group>
    </group>
  )
})

export default function DesktopMetaDataBoard({
  visible = true,
  position = [0, 0, 0],
  offsetRight = 2.5,
  desktopData,
}: DesktopMetaDataBoardProps) {
  React.useEffect(() => {
    console.log('🟨 [DesktopMetaData] Mount')
    return () => console.log('🔴 [DesktopMetaData] Unmount')
  }, [])

  if (!visible) return null

  const resolved: DesktopMetaData = desktopData ?? {
    id: 'desktop1',
    type: 'desktop',
    label: 'Admin Workstation',
    os: 'Ubuntu 22.04 LTS',
    interfaces: [{ id: 'desktop1.eth0', name: 'eth0', kind: 'eth', ip: '192.168.10.30' }],
    capabilities: 'monitoring, ssh, http, dns',
  }

  // Board dimensions
  const BOARD_W = 1.9
  const BOARD_H = 2.0
  const MARGIN_X = 0.12

  // Single large rectangle with Fields
  const rectW = BOARD_W - MARGIN_X * 2
  const rectH = 1.5
  const rectY = 0.41

  return (
    <group position={[position[0] + offsetRight, position[1], position[2]]}>
      {/* Board */}
      <PacketWhiteBoardMesh width={BOARD_W} height={BOARD_H} radius={120} />
      <group position={[0, 0, 0.02]}>
        <DesktopContent desktopData={resolved} BOARD_W={BOARD_W} BOARD_H={BOARD_H} rectW={rectW} rectH={rectH} rectY={rectY} />
      </group>
    </group>
  )
}
