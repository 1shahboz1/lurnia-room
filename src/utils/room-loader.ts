// Minimal type exports used by the engine adapter + DynamicRoomStructure.
// NOTE: This file intentionally does NOT implement design-time room loading helpers.

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
      type: string
      position: [number, number, number]
      rotation?: [number, number, number]
      scale?: [number, number, number] | number
      material?: MaterialProperties
      content?: string
      [key: string]: any
    }>
  }
}