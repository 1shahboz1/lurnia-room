import { RoomConfig } from './glb-loader'

// Room description interface (extended from your JSON structure)
export interface RoomDescription {
  id: string
  name: string
  description?: string
  structure: {
    dimensions: {
      width: number
      height: number
      depth: number
    }
    floor: {
      material: MaterialProperties
      thickness?: number
    }
    walls: {
      material: MaterialProperties
      thickness?: number
      accent_wall?: {
        position: 'front' | 'back' | 'left' | 'right'
        material: MaterialProperties
      }
    }
    ceiling: {
      material: MaterialProperties
      thickness?: number
      lights?: Array<{
        position: [number, number, number]
        size: [number, number, number]
        material: MaterialProperties
      }>
    }
    decorative_elements?: Array<{
      id: string
      type: 'poster' | 'whiteboard' | 'door' | 'clock' | 'table' | 'text' | 'window_view' | 'ceiling_soffit' | 'honeycomb_wall' | 'wooden_panel_backdrop'
      position: [number, number, number]
      rotation?: [number, number, number]
      scale?: [number, number, number] | number
      material?: MaterialProperties
      content?: string
    }>
  }
  camera?: {
    position: [number, number, number]
    target: [number, number, number]
    fov?: number
  }
  environment?: {
    lighting?: 'bright' | 'dim' | 'ambient' | 'dramatic'
    background?: string
    shadows?: boolean
  }
  models?: Array<{
    id: string
    type: string
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number | [number, number, number]
    physics?: boolean
    metadata?: {
      title: string
      description: string
    }
  }>
}

export interface MaterialProperties {
  color: string
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  normalScale?: number
  textureRepeat?: [number, number]
}

// Convert room description to RoomConfig format
export function convertRoomDescriptionToConfig(description: RoomDescription): RoomConfig {
  const objects = description.models?.map(model => ({
    id: model.id,
    type: 'model' as const,
    modelName: model.type,
    position: model.position,
    rotation: model.rotation,
    scale: model.scale || 1,
    interactive: true,
    physics: model.physics ? {
      enabled: true,
      type: 'static' as const
    } : undefined,
    metadata: model.metadata
  })) || []

  return {
    id: description.id,
    name: description.name,
    description: description.description,
    environment: description.environment,
    camera: description.camera,
    objects,
    // Store the full structure data for room generation
    roomStructure: description.structure
  }
}

// Load room description from JSON file
export async function loadRoomDescription(roomId: string): Promise<RoomDescription> {
  try {
    const response = await fetch(`/room-descriptions/${roomId}.json`)
    if (!response.ok) {
      throw new Error(`Failed to load room description: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error loading room description for ${roomId}:`, error)
    throw error
  }
}

// Available room descriptions
export const availableRoomDescriptions = {
  'networking-lab-v1': {
    name: 'Networking Fundamentals Lab',
    description: 'Interactive learning environment for networking fundamentals with hands-on equipment',
    complexity: 'medium',
    modelCount: 3,
    topics: ['Network Fundamentals', 'Router Configuration', 'Switch Management', 'Server Connectivity']
  },
  'networking-lab-v2': {
    name: 'Modern Networking Lab',
    description: 'Clean, modern lab environment designed for network packet visualization and hands-on learning',
    complexity: 'medium',
    modelCount: 5,
    topics: ['Network Topology', 'Packet Flow', 'Network Protocols', 'Lab Environment', 'Interactive Learning']
  }
} as const

export type RoomDescriptionKey = keyof typeof availableRoomDescriptions
