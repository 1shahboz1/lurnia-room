'use client'

import { ContactShadows } from '@react-three/drei'
import { RoomConfig } from '@/utils/glb-loader'
import { QualityPreset } from './QualityEnhancer'
import * as THREE from 'three'

interface ContactShadowsSystemProps {
  config: RoomConfig
  qualityPreset?: string
  enabled?: boolean
}

interface ShadowDefinition {
  position: [number, number, number]
  size: number
  blur: number
  opacity: number
  color: string
  far: number
}

export default function ContactShadowsSystem({
  config,
  qualityPreset = 'medium',
  enabled = true
}: ContactShadowsSystemProps) {
  if (!enabled) return null

  // Quality-based shadow settings
  const qualitySettings = {
    potato: {
      resolution: 64,
      frames: 20,
      opacity: 0.3,
      blur: 1.0,
      far: 3
    },
    low: {
      resolution: 128,
      frames: 30,
      opacity: 0.4,
      blur: 1.5,
      far: 4
    },
    medium: {
      resolution: 256,
      frames: 50,
      opacity: 0.5,
      blur: 2.0,
      far: 5
    },
    high: {
      resolution: 512,
      frames: 80,
      opacity: 0.6,
      blur: 2.5,
      far: 6
    },
    ultra: {
      resolution: 1024,
      frames: 100,
      opacity: 0.7,
      blur: 3.0,
      far: 8
    }
  }

  const settings = qualitySettings[qualityPreset as keyof typeof qualitySettings] || qualitySettings.medium
  const shadows: ShadowDefinition[] = []

  // Add shadows for 3D models/equipment
  if (config.objects) {
    config.objects.forEach((obj) => {
      if (obj.type === 'model' && obj.position) {
        let shadowSize = 1.0
        let shadowOpacity = settings.opacity
        
        // Adjust shadow size based on model type and scale
        const scale = Array.isArray(obj.scale) 
          ? Math.max(...obj.scale) 
          : typeof obj.scale === 'number' 
            ? obj.scale 
            : 1

        // Different shadow sizes for different equipment types
        if (obj.modelName?.includes('router') || obj.modelName?.includes('switch')) {
          shadowSize = 1.2 * scale
          shadowOpacity = settings.opacity * 0.8
        } else if (obj.modelName?.includes('server') || obj.modelName?.includes('rack')) {
          shadowSize = 2.0 * scale
          shadowOpacity = settings.opacity * 1.1
        } else if (obj.modelName?.includes('computer') || obj.modelName?.includes('laptop')) {
          shadowSize = 1.5 * scale
          shadowOpacity = settings.opacity * 0.9
        } else {
          shadowSize = 1.0 * scale
        }

        shadows.push({
          position: [obj.position[0], 0.01, obj.position[2]], // Slightly above floor
          size: shadowSize,
          blur: settings.blur,
          opacity: Math.min(shadowOpacity, 0.8), // Cap opacity
          color: '#000000',
          far: settings.far
        })
      }
    })
  }

  // Add shadows for large furniture/architectural elements
  const roomStructure = config.roomStructure as any
  if (roomStructure?.decorative_elements) {
    roomStructure.decorative_elements.forEach((element: any) => {
      // Add shadows for doors (create small shadow at base)
      if (element.type === 'door') {
        shadows.push({
          position: [element.position[0], 0.01, element.position[2]],
          size: 1.8, // Door width shadow
          blur: settings.blur * 0.5, // Sharper shadow for doors
          opacity: settings.opacity * 0.4, // Lighter shadow
          color: '#222222',
          far: 2
        })
      }
      
      // Add shadows for large objects like whiteboards (if they have stands)
      if (element.type === 'whiteboard' && element.position[1] < 3) {
        shadows.push({
          position: [element.position[0], 0.01, element.position[2]],
          size: 2.5, // Board stand shadow
          blur: settings.blur * 1.2,
          opacity: settings.opacity * 0.6,
          color: '#111111',
          far: 3
        })
      }
    })
  }

  // General room ambient shadow (subtle overall grounding)
  const roomDimensions = roomStructure?.dimensions || { width: 30, depth: 24 }
  
  return (
    <group name="contact-shadows-system">
      {/* Individual equipment shadows */}
      {shadows.map((shadow, index) => (
        <ContactShadows
          key={`shadow-${index}`}
          position={shadow.position}
          scale={shadow.size}
          blur={shadow.blur}
          far={shadow.far}
          resolution={settings.resolution}
          opacity={shadow.opacity}
          color={shadow.color}
          frames={settings.frames}
          smooth={true}
        />
      ))}
      
      {/* General room grounding shadow - very subtle */}
      {qualityPreset !== 'potato' && (
        <ContactShadows
          position={[0, 0.005, 0]} // Just above floor
          scale={Math.min(roomDimensions.width, roomDimensions.depth) * 0.8}
          blur={settings.blur * 3}
          far={settings.far * 2}
          resolution={settings.resolution / 2} // Lower res for large shadow
          opacity={settings.opacity * 0.15} // Very subtle
          color="#1a1a1a"
          frames={settings.frames}
          smooth={true}
        />
      )}
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <group>
          {/* This logs shadow info to console */}
          <mesh visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial transparent opacity={0} />
            {/* Effect to log shadow count once */}
            <primitive 
              object={{
                userData: {
                  onInit: () => {
                    console.log(`🌑 Contact Shadows: ${shadows.length} individual shadows + 1 ambient (${qualityPreset} quality)`)
                  }
                }
              }} 
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

// Utility component for manual shadow placement
export function ManualContactShadow({
  position,
  size = 1,
  blur = 2,
  opacity = 0.5,
  color = '#000000',
  qualityPreset = 'medium'
}: {
  position: [number, number, number]
  size?: number
  blur?: number
  opacity?: number
  color?: string
  qualityPreset?: string
}) {
  const qualitySettings = {
    potato: { resolution: 64, frames: 20 },
    low: { resolution: 128, frames: 30 },
    medium: { resolution: 256, frames: 50 },
    high: { resolution: 512, frames: 80 },
    ultra: { resolution: 1024, frames: 100 }
  }

  const settings = qualitySettings[qualityPreset as keyof typeof qualitySettings] || qualitySettings.medium

  return (
    <ContactShadows
      position={position}
      scale={size}
      blur={blur}
      far={5}
      resolution={settings.resolution}
      opacity={opacity}
      color={color}
      frames={settings.frames}
      smooth={true}
    />
  )
}

// Hook for easy integration
export function useContactShadows(config: RoomConfig, qualityPreset: string = 'medium') {
  return {
    ContactShadowsSystem: () => (
      <ContactShadowsSystem 
        config={config} 
        qualityPreset={qualityPreset} 
        enabled={true} 
      />
    ),
    ManualContactShadow
  }
}
