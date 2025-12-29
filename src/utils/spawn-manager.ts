import type { RoomObject, RoomConfig } from '@/utils/glb-loader'

export function computeSpawnPosition(options: {
  roomDimensions: { width: number; depth: number; height?: number }
  existingObjects: Pick<RoomObject, 'position'>[]
  gridStep?: number
  margin?: number
}): [number, number, number] {
  const { roomDimensions, existingObjects, gridStep = 1.5, margin = 1.0 } = options

  const halfW = Math.max(0, (roomDimensions.width / 2) - margin)
  const halfD = Math.max(0, (roomDimensions.depth / 2) - margin)

  // Generate candidate grid positions inside the room interior
  const candidates: { x: number; z: number }[] = []
  for (let z = -halfD; z <= halfD; z += gridStep) {
    for (let x = -halfW; x <= halfW; x += gridStep) {
      candidates.push({ x, z })
    }
  }

  // Sort candidates to prefer positions near the room center
  candidates.sort((a, b) => {
    const da = Math.abs(a.x) + Math.abs(a.z)
    const db = Math.abs(b.x) + Math.abs(b.z)
    return da - db
  })

  const occRadius = Math.max(0.75, gridStep * 0.6)

  const isFree = (x: number, z: number) => {
    for (const obj of existingObjects) {
      const [ox, , oz] = obj.position
      const dx = ox - x
      const dz = oz - z
      if (Math.hypot(dx, dz) < occRadius) return false
    }
    return true
  }

  for (const c of candidates) {
    if (isFree(c.x, c.z)) {
      return [c.x, 0.02, c.z]
    }
  }

  // Fallback to center
  return [0, 0.02, 0]
}