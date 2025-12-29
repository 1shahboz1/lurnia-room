'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Text, Html } from '@react-three/drei'

interface GLBLabelProps {
  text: string
  category: string
  centerPosition?: THREE.Vector3 | null
  modelTopY?: number | null
  visible?: boolean
  occlude?: boolean
  yOffset?: number
  alignTo?: 'top' | 'center'
  showMetadataToggle?: boolean
  metadataVisible?: boolean
  onToggleMetadata?: () => void
}

// Category to logo mapping (same as inventory sheet)
const categoryLogoMap: Record<string, string> = {
  routers: '/router_emoji.png',
  router: '/router_emoji.png',
  switches: '/Switch.png',
  switch: '/Switch.png',
  desktops: '/desktop.png',
  desktop: '/desktop.png',
  servers: '/server.png',
  server: '/server.png',
  cables: '/cable.png',
  cable: '/cable.png',
  firewall: '/Firewall.png',
  firewalls: '/Firewall.png',
  laptops: '/desktop.png',
  laptop: '/desktop.png',
  monitors: '/desktop.png',
  monitor: '/desktop.png',
  peripherals: '/cable.png',
  peripheral: '/cable.png',
  storage: '/server.png',
  misc: '/cable.png',
  cars: '/car.png',
  car: '/car.png',
  vehicles: '/car.png',
  vehicle: '/car.png',
  earth: '/inventory/Earth/earth.png',
  earths: '/inventory/Earth/earth.png',
  'network packet': '/network_packet.png',
  'network packets': '/network_packet.png',
}

export function GLBLabel({
  text,
  category,
  centerPosition,
  modelTopY,
  visible = true,
  occlude = true,
  yOffset = 0.5,
  alignTo = 'top',
  showMetadataToggle = false,
  metadataVisible = false,
  onToggleMetadata,
}: GLBLabelProps) {
  // Calculate label position above the model's highest point
  const labelPosition = useMemo<[number, number, number]>(() => {
    if (!centerPosition || modelTopY === null || modelTopY === undefined) {
      if (!centerPosition) return [0, 0, 0]
      if (alignTo === 'center') {
        return [centerPosition.x, centerPosition.y + yOffset, centerPosition.z]
      }
      return [centerPosition.x, centerPosition.y + yOffset, centerPosition.z]
    }

    const baseY = alignTo === 'center' ? centerPosition.y : modelTopY
    return [centerPosition.x, baseY + yOffset, centerPosition.z]
  }, [alignTo, centerPosition, modelTopY, yOffset])

  if (!visible || !centerPosition || modelTopY === null || modelTopY === undefined) return null

  // Capitalize first letter of text
  const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1)

  return (
    <Html
      position={labelPosition}
      center
      distanceFactor={8}
      zIndexRange={[1000, 0]}
      occlude={occlude}
      style={{
        pointerEvents: showMetadataToggle ? 'auto' : 'none',
        userSelect: 'none',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '8px 13px',
        borderRadius: '8px',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        whiteSpace: 'nowrap',
      }}>
        <img 
          src={categoryLogoMap[category.toLowerCase()] || '/cable.png'}
          alt={category}
          style={{
            width: '32px',
            height: '32px',
            objectFit: 'contain',
          }}
        />
        <span style={{
          fontSize: '23px',
          fontWeight: '500',
          color: '#000',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {capitalizedText}
        </span>
        {showMetadataToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleMetadata?.()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s',
              transform: metadataVisible ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </Html>
  )
}

export default GLBLabel
