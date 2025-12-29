import * as React from 'react'
import PacketText from '@/components/packet/PacketText'
import PacketWhiteBoardMesh from '@/components/packet/PacketWhiteBoardMesh'
import PacketChipRectMesh from '@/components/packet/PacketChipRectMesh'
import PacketPillMesh from '@/components/packet/PacketPillMesh'
import { Html } from '@react-three/drei'
import TypePicker from '@/components/packet/TypePicker'
import ProtocolPicker from '@/components/packet/ProtocolPicker'
import FlagPicker from '@/components/packet/FlagPicker'
import EncryptedPicker from '@/components/packet/EncryptedPicker'


export interface PacketPanelContentProps {
  typeValue?: string
  protocolValue?: string
  flagValue?: string
  encryptedValue?: string
  editable?: boolean
  onSelectType?: (id: string) => void
  onSelectProtocol?: (id: string) => void
  onSelectFlag?: (id: string) => void
  onSelectEncrypted?: (id: string) => void
}

function PacketPanelContent({
  typeValue = 'HTTP_REQUEST',
  protocolValue = 'TCP',
  flagValue = 'SYN',
  encryptedValue = 'TRUE',
  editable = false,
  onSelectType,
  onSelectProtocol,
  onSelectFlag,
  onSelectEncrypted,
}: PacketPanelContentProps) {
  const DEBUG = false
  const renderStart = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const prevPropsRef = React.useRef<PacketPanelContentProps | null>(null)
  React.useEffect(() => {
    if (DEBUG) console.log(`[PacketPanelContent] mount: editable=${editable}`)
  }, [])
  // Detailed re-render diagnostics
  if (DEBUG) {
    const prev = prevPropsRef.current
    const cur: PacketPanelContentProps = { typeValue, protocolValue, flagValue, encryptedValue, editable, onSelectType, onSelectProtocol, onSelectFlag, onSelectEncrypted }
    if (prev) {
      const changes: Record<string, { prev: any; cur: any }> = {}
      ;(['typeValue','protocolValue','flagValue','encryptedValue','editable'] as const).forEach(k => {
        if (prev[k] !== cur[k]) changes[k] = { prev: prev[k], cur: cur[k] }
      })
      if (!!prev.onSelectType !== !!cur.onSelectType) changes.onSelectType = { prev: !!prev.onSelectType, cur: !!cur.onSelectType }
      if (!!prev.onSelectProtocol !== !!cur.onSelectProtocol) changes.onSelectProtocol = { prev: !!prev.onSelectProtocol, cur: !!cur.onSelectProtocol }
      if (!!prev.onSelectFlag !== !!cur.onSelectFlag) changes.onSelectFlag = { prev: !!prev.onSelectFlag, cur: !!cur.onSelectFlag }
      if (!!prev.onSelectEncrypted !== !!cur.onSelectEncrypted) changes.onSelectEncrypted = { prev: !!prev.onSelectEncrypted, cur: !!cur.onSelectEncrypted }
      const changedKeys = Object.keys(changes)
      console.log('[PacketPanelContent] re-render', changedKeys.length ? { changedKeys, changes } : { changedKeys: [] })
    } else {
      console.log('[PacketPanelContent] first render')
    }
    prevPropsRef.current = cur
  }
  // Board and layout constants
  const BOARD_W = 4.2
  const BOARD_H = 2.1
  const MARGIN_X = 0.12
  const innerW = BOARD_W - MARGIN_X * 2

  // Row of 4 small rectangles
  const rectGap = 0.08
  const rectW = (innerW - rectGap * 3) / 4
  const rectH = 0.12
  const rectY = BOARD_H / 2 - 0.48

  // Two large rectangles below
  const bigGapX = 0.10
  const bigW = (innerW - bigGapX) / 2
  const bigH = 1.34
  const chipGapY = 0.08
  const bigYOffset = 0.08
  const bigY = rectY - (chipGapY + bigH / 2 + bigYOffset)

  // Bottom-right meta chips inside right panel
  const metaChipW = 0.46
  const metaChipH = 0.12
  const metaChipGap = 0.06
  const metaChipRightMargin = 0.04
  const metaChipBottomMargin = 0.06

  // Separator line under pill + host in right panel
  const sepInsetX = 0.06
  const sepW = bigW - sepInsetX * 2
  const sepH = 0.01
  const sepY = bigH / 2 - 0.06 - 0.12 - 0.05

  const renderEnd = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  if (DEBUG) {
    const dur = Number((renderEnd - renderStart).toFixed(2))
    if (dur > 4) console.log('[PacketPanelContent] render ms', dur)
  }
  return (
    <group>
      {/* Board */}
      <PacketWhiteBoardMesh width={BOARD_W} height={BOARD_H} radius={60} />
      <group position={[0, 0, 0.02]}>

      {/* Header */}
      <PacketText
        position={[-BOARD_W/2 + 0.12, BOARD_H/2 - 0.12, 0]}
        anchorX="left"
        anchorY="top"
        fontSize={0.147}
        maxWidth={3.2}
        color="#0f172a"
        fontWeight={700 as any}
        renderOrder={1000}
      >
        Network Packet
      </PacketText>

      <PacketText
        position={[BOARD_W/2 - 0.40, BOARD_H/2 - 0.12, 0]}
        anchorX="right"
        anchorY="top"
        fontSize={0.07}
        color="#64748b"
        maxWidth={1.2}
        renderOrder={1000}
      >
        PACKET ID
      </PacketText>

      {/* Row of 4 small rectangles with labels/values */}
      <group>
        {/* 1 */}
        <group position={[-BOARD_W/2 + MARGIN_X + rectW/2 + (rectW + rectGap) * 0, rectY, 0]}>
          <PacketChipRectMesh width={rectW} height={rectH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} />
          <PacketText position={[-rectW/2 + 0.03, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>Type</PacketText>
          {editable ? (
            <Html
              position={[0.15, -0.01, 0]}
              transform
              distanceFactor={3.3}
              sprite={false}
              zIndexRange={[3000, 5000]}
              occlude={false}
              center
              style={{
                pointerEvents: 'auto',
                userSelect: 'none'
              }}
            >
              <div id="type-value-overlay" data-mode="editable"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ 
                  whiteSpace: 'nowrap',
                  fontSize: '8px',
                  fontWeight: 500,
                  color: '#0f172a',
                  lineHeight: 1,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  textAlign: 'center',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <TypePicker value={typeValue} onChange={(id) => onSelectType?.(id)} />
              </div>
            </Html>
          ) : (
            <PacketText 
              position={[ rectW/2 - 0.03, 0, 0 ]}
              anchorX="right"
              anchorY="middle"
              fontSize={0.064}
              color="#0f172a"
              renderOrder={1090}
            >
              {typeValue}
            </PacketText>
          )}
        </group>
        {/* 2 */}
        <group position={[-BOARD_W/2 + MARGIN_X + rectW/2 + (rectW + rectGap) * 1, rectY, 0]}>
          <PacketChipRectMesh width={rectW} height={rectH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} />
          <PacketText position={[-rectW/2 + 0.03, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>Encrypted</PacketText>
          {editable ? (
            <Html
              position={[0.15, -0.01, 0]}
              transform
              distanceFactor={3.3}
              sprite={false}
              zIndexRange={[3000, 5000]}
              occlude={false}
              center
              style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
              <div id="encrypted-value-overlay" data-mode="editable"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ 
                  whiteSpace: 'nowrap',
                  fontSize: '8px',
                  fontWeight: 500,
                  color: '#0f172a',
                  lineHeight: 1,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  textAlign: 'center',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <EncryptedPicker value={encryptedValue} onChange={(id) => onSelectEncrypted?.(id)} />
              </div>
            </Html>
          ) : (
            <PacketText position={[ rectW/2 - 0.03, 0, 0]} anchorX="right" anchorY="middle" fontSize={0.064} color="#0f172a" renderOrder={1090}>{encryptedValue}</PacketText>
          )}
        </group>
        {/* 3 */}
        <group position={[-BOARD_W/2 + MARGIN_X + rectW/2 + (rectW + rectGap) * 2, rectY, 0]}>
          <PacketChipRectMesh width={rectW} height={rectH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} />
          <PacketText position={[-rectW/2 + 0.03, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>Protocol</PacketText>
          {editable ? (
            <Html
              position={[0.15, -0.01, 0]}
              transform
              distanceFactor={3.3}
              sprite={false}
              zIndexRange={[3000, 5000]}
              occlude={false}
              center
              style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
              <div id="protocol-value-overlay" data-mode="editable"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ 
                  whiteSpace: 'nowrap',
                  fontSize: '8px',
                  fontWeight: 500,
                  color: '#0f172a',
                  lineHeight: 1,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  textAlign: 'center',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <ProtocolPicker value={protocolValue} onChange={(id) => onSelectProtocol?.(id)} />
              </div>
            </Html>
          ) : (
            <PacketText position={[ rectW/2 - 0.03, 0, 0]} anchorX="right" anchorY="middle" fontSize={0.064} color="#0f172a" renderOrder={1090}>{protocolValue}</PacketText>
          )}
        </group>
        {/* 4 */}
        <group position={[-BOARD_W/2 + MARGIN_X + rectW/2 + (rectW + rectGap) * 3, rectY, 0]}>
          <PacketChipRectMesh width={rectW} height={rectH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} />
          <PacketText position={[-rectW/2 + 0.03, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>Flags</PacketText>
          {editable ? (
            <Html
              position={[0.15, -0.01, 0]}
              transform
              distanceFactor={3.3}
              sprite={false}
              zIndexRange={[3000, 5000]}
              occlude={false}
              center
              style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
              <div id="flag-value-overlay" data-mode="editable"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ 
                  whiteSpace: 'nowrap',
                  fontSize: '8px',
                  fontWeight: 500,
                  color: '#0f172a',
                  lineHeight: 1,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  textAlign: 'center',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <FlagPicker value={flagValue} onChange={(id) => onSelectFlag?.(id)} />
              </div>
            </Html>
          ) : (
            <PacketText position={[ rectW/2 - 0.03, 0, 0]} anchorX="right" anchorY="middle" fontSize={0.064} color="#0f172a" renderOrder={1090}>{flagValue}</PacketText>
          )}
        </group>
      </group>

      {/* Two large rectangles below */}
      <group>
        {/* Left large rectangle with Fields */}
        <group position={[-BOARD_W/2 + MARGIN_X + bigW/2, bigY, 0]}>
          <PacketChipRectMesh width={bigW} height={bigH} fill="#ffffff" stroke="#e2e8f0" radius={24} renderOrder={1000} />
          <PacketText position={[0, bigH/2 - 0.05, 0]} anchorX="center" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#0f172a" renderOrder={1090}>Fields</PacketText>

          {/* Fields list */}
          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.15, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>method:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.15, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>GET</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.27, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>path:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.27, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>/</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.39, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>host:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.39, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>example.com</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.51, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>user-agent:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.51, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>demo-client/1.0</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.63, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>src_ip:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.63, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>192.168.1.10</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.75, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>dst_ip:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.75, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>93.184.216.34</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.87, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>src_port:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.87, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>52344</PacketText>

          <PacketText position={[-bigW/2 + 0.04, bigH/2 - 0.99, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1090}>dst_port:</PacketText>
          <PacketText position={[-bigW/2 + 0.04 + 0.48, bigH/2 - 0.99, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1090}>80</PacketText>
        </group>

        {/* Right large rectangle with pill + host, separator, details, bottom chips */}
        <group position={[-BOARD_W/2 + MARGIN_X + bigW/2 + bigW + bigGapX, bigY, 0]}>
          <PacketChipRectMesh width={bigW} height={bigH} fill="#ffffff" stroke="#e2e8f0" radius={24} renderOrder={1000} />

          {/* Green pill top-left */}
          <group position={[-bigW/2 + 0.06 + 0.48/2, bigH/2 - 0.06 - 0.12/2, 0]}>
            <PacketPillMesh width={0.48} height={0.12} fill="#ecfdf5" stroke="#d1fae5" text="HTTP GET" textColor="#065f46" fontPx={120} />
          </group>
          <PacketText position={[-bigW/2 + 0.06 + 0.48 + 0.08, bigH/2 - 0.06 - 0.12/2, 0]} anchorX="left" anchorY="middle" fontSize={0.08} fontWeight={700 as any} color="#0f172a" renderOrder={1300}>Host: example.com</PacketText>

          {/* Separator line */}
          <group position={[0, sepY, 0]}>
            <mesh renderOrder={1200}>
              <planeGeometry args={[sepW, sepH]} />
              <meshBasicMaterial color={'#e2e8f0'} transparent toneMapped={false} depthWrite={false} depthTest={true} />
            </mesh>
          </group>

          {/* Protocol details under the separator */}
          {(() => {
            const labelX = -bigW / 2 + 0.04
            const valueX = labelX + 0.48
            const indentX = labelX + 0.20
            const baseY = sepY - 0.08
            const dy = 0.09
            return (
              <group>
                <PacketText position={[labelX, baseY - dy * 0, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>labelPrimary:</PacketText>
                <PacketText position={[valueX + 0.12, baseY - dy * 0, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>GET /</PacketText>

                <PacketText position={[labelX, baseY - dy * 1, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>labelSecondary:</PacketText>
                <PacketText position={[valueX + 0.12, baseY - dy * 1, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>Host: example.com</PacketText>

                {/* DNS */}
                <PacketText position={[labelX, baseY - dy * 2, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>DNS:</PacketText>
                <PacketText position={[indentX, baseY - dy * 3, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>qname:</PacketText>
                <PacketText position={[indentX + 0.48, baseY - dy * 3, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>N/A</PacketText>
                <PacketText position={[indentX, baseY - dy * 4, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>qtype:</PacketText>
                <PacketText position={[indentX + 0.48, baseY - dy * 4, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>N/A</PacketText>
                <PacketText position={[indentX, baseY - dy * 5, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>answers:</PacketText>
                <PacketText position={[indentX + 0.48, baseY - dy * 5, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>N/A</PacketText>

                {/* TLS */}
                <PacketText position={[labelX, baseY - dy * 6, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>TLS:</PacketText>
                <PacketText position={[indentX, baseY - dy * 7, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>sni:</PacketText>
                <PacketText position={[indentX + 0.48, baseY - dy * 7, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>N/A</PacketText>
                <PacketText position={[indentX, baseY - dy * 8, 0]} anchorX="left" anchorY="top" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>validityState:</PacketText>
                <PacketText position={[indentX + 0.48, baseY - dy * 8, 0]} anchorX="left" anchorY="top" fontSize={0.064} color="#0f172a" renderOrder={1300}>N/A</PacketText>
              </group>
            )
          })()}

          {/* Bottom-right meta chips */}
          <group position={[bigW/2 - metaChipRightMargin - metaChipW/2 - (metaChipW + metaChipGap) * 0, -bigH/2 + metaChipBottomMargin + metaChipH/2, 0]}>
            <PacketChipRectMesh width={metaChipW} height={metaChipH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} renderOrder={1200} />
            <PacketText position={[0, 0, 0]} anchorX="center" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>TTL: 300s</PacketText>
          </group>
          <group position={[bigW/2 - metaChipRightMargin - metaChipW/2 - (metaChipW + metaChipGap) * 1, -bigH/2 + metaChipBottomMargin + metaChipH/2, 0]}>
            <PacketChipRectMesh width={metaChipW} height={metaChipH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} renderOrder={1200} />
            <PacketText position={[0, 0, 0]} anchorX="center" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>Sizes: 15.0 KB</PacketText>
          </group>
          <group position={[bigW/2 - metaChipRightMargin - metaChipW/2 - (metaChipW + metaChipGap) * 2, -bigH/2 + metaChipBottomMargin + metaChipH/2, 0]}>
            <PacketChipRectMesh width={metaChipW} height={metaChipH} fill="#f1f5f9" stroke="#e2e8f0" radius={60} renderOrder={1200} />
            <PacketText position={[0, 0, 0]} anchorX="center" anchorY="middle" fontSize={0.064} fontWeight={700 as any} color="#64748b" renderOrder={1300}>Status: N/A</PacketText>
          </group>
        </group>
      </group>

      {/* Packet ID pill at header top-right */}
      <group position={[BOARD_W/2 - 0.22, BOARD_H/2 - 0.16, 0]}>
        <PacketPillMesh width={0.31} height={0.12} fill="#f1f5f9" stroke="#e2e8f0" text="pkt-2" fontPx={208} />
      </group>
      </group>
    </group>
  )
}

export default React.memo(PacketPanelContent, (prev, next) => {
  return (
    prev.typeValue === next.typeValue &&
    prev.protocolValue === next.protocolValue &&
    prev.flagValue === next.flagValue &&
    prev.encryptedValue === next.encryptedValue &&
    prev.editable === next.editable
  )
})
