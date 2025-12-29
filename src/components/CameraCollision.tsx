'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { RoomConfig } from '@/utils/glb-loader'

interface CameraCollisionProps {
  config: RoomConfig
  enabled?: boolean
  collisionDistance?: number
  debug?: boolean
}

interface CollisionBounds {
  walls: THREE.Box3[]
  doors: THREE.Box3[]
  objects: THREE.Box3[]
}

export default function CameraCollision({
  config,
  enabled = true,
  collisionDistance = 0.5, // Distance to maintain from walls
  debug = false
}: CameraCollisionProps) {
  const { camera, scene } = useThree()
  const boundsRef = useRef<CollisionBounds>({
    walls: [],
    doors: [],
    objects: []
  })
  const raycastersRef = useRef<THREE.Raycaster[]>([])
  const debugHelpersRef = useRef<THREE.ArrowHelper[]>([])
  const lastCollisionLogRef = useRef<number>(0)
  
  // Initialize raycasters for all directions
  useEffect(() => {
    if (!enabled) return
    
    // Create 8 raycasters: 4 cardinal + 4 diagonal directions
    const directions = [
      new THREE.Vector3(0, 0, -1), // Forward
      new THREE.Vector3(0, 0, 1),  // Backward
      new THREE.Vector3(-1, 0, 0), // Left
      new THREE.Vector3(1, 0, 0),  // Right
      new THREE.Vector3(-0.707, 0, -0.707), // Forward-left
      new THREE.Vector3(0.707, 0, -0.707),  // Forward-right
      new THREE.Vector3(-0.707, 0, 0.707),  // Back-left
      new THREE.Vector3(0.707, 0, 0.707),   // Back-right
    ]
    
    raycastersRef.current = directions.map((dir, i) => {
      const raycaster = new THREE.Raycaster()
      raycaster.far = collisionDistance * 1.5 // Slightly larger detection range
      
      if (debug) {
        const helper = new THREE.ArrowHelper(
          dir, 
          new THREE.Vector3(), 
          collisionDistance, 
          i < 4 ? 0xff0000 : 0x00ff00 // Red for cardinal, green for diagonal
        )
        helper.name = `collision-debug-${i}`
        debugHelpersRef.current.push(helper)
        scene.add(helper)
      }
      
      return raycaster
    })
    
    return () => {
      // Cleanup debug helpers
      debugHelpersRef.current.forEach(helper => {
        scene.remove(helper)
      })
      debugHelpersRef.current = []
    }
  }, [enabled, collisionDistance, debug, scene])
  
  // Generate collision bounds from room configuration
  useEffect(() => {
    if (!enabled) return
    
    const bounds: CollisionBounds = {
      walls: [],
      doors: [],
      objects: []
    }
    
    // Get room dimensions
    const roomStructure = config.roomStructure as any
    const dimensions = roomStructure?.dimensions || { width: 30, height: 9, depth: 24 }

    // Apply the same scale used by DynamicRoomStructure (room widened/deepened by 1.5x)
    const widthScale = 1.5
    const depthScale = 1.5
    
    // Create wall bounds at the NEW wall locations
    const wallThickness = roomStructure?.walls?.thickness || 0.5
    const halfWidth = (dimensions.width * widthScale) / 2
    const halfDepth = (dimensions.depth * depthScale) / 2
    const wallHeight = dimensions.height
    
    // North wall (front)
    bounds.walls.push(new THREE.Box3(
      new THREE.Vector3(-halfWidth, 0, -halfDepth - wallThickness),
      new THREE.Vector3(halfWidth, wallHeight, -halfDepth)
    ))
    
    // South wall (back)
    bounds.walls.push(new THREE.Box3(
      new THREE.Vector3(-halfWidth, 0, halfDepth),
      new THREE.Vector3(halfWidth, wallHeight, halfDepth + wallThickness)
    ))
    
    // East wall (right)
    bounds.walls.push(new THREE.Box3(
      new THREE.Vector3(halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth + wallThickness, wallHeight, halfDepth)
    ))
    
    // West wall (left)
    bounds.walls.push(new THREE.Box3(
      new THREE.Vector3(-halfWidth - wallThickness, 0, -halfDepth),
      new THREE.Vector3(-halfWidth, wallHeight, halfDepth)
    ))
    
    // Add door collision bounds (doors create openings but handles/frames are solid)
    if (roomStructure?.decorative_elements) {
      roomStructure.decorative_elements.forEach((element: any) => {
        if (element.type === 'door') {
          const pos = element.position
          const scale = element.scale
          
          // Create a smaller collision box for door frame/handle (not the opening)
          const doorFrameWidth = 0.1 // Thin frame collision
          bounds.doors.push(new THREE.Box3(
            new THREE.Vector3(pos[0] - scale[0]/2 - doorFrameWidth, pos[1] - scale[1]/2, pos[2] - scale[2]/2),
            new THREE.Vector3(pos[0] + scale[0]/2 + doorFrameWidth, pos[1] + scale[1]/2, pos[2] + scale[2]/2)
          ))
        }
        
        // Add collision for other solid elements (windows, boards, etc.)
        if (element.type === 'whiteboard' || element.type === 'window_view') {
          const pos = element.position
          const scale = element.scale
          
          bounds.objects.push(new THREE.Box3(
            new THREE.Vector3(pos[0] - scale[0]/2, pos[1] - scale[1]/2, pos[2] - scale[2]/2),
            new THREE.Vector3(pos[0] + scale[0]/2, pos[1] + scale[1]/2, pos[2] + scale[2]/2)
          ))
        }
      })
    }
    
    boundsRef.current = bounds
    
    if (debug) {
      console.log('🔍 Camera collision bounds generated:', {
        walls: bounds.walls.length,
        doors: bounds.doors.length,
        objects: bounds.objects.length
      })
    }
  }, [config, enabled, debug])
  
  // Check collision in a given direction
  const checkCollision = (position: THREE.Vector3, direction: THREE.Vector3): boolean => {
    const bounds = boundsRef.current
    const testPoint = position.clone().add(direction.clone().multiplyScalar(collisionDistance))
    
    // Check against walls
    for (const wall of bounds.walls) {
      if (wall.containsPoint(testPoint)) {
        return true
      }
    }
    
    // Check against door frames
    for (const door of bounds.doors) {
      if (door.containsPoint(testPoint)) {
        return true
      }
    }
    
    // Check against objects
    for (const obj of bounds.objects) {
      if (obj.containsPoint(testPoint)) {
        return true
      }
    }
    
    return false
  }
  
  // Store previous position for collision detection
  const previousPositionRef = useRef<THREE.Vector3>(new THREE.Vector3())
  
  // Main collision detection logic
  useFrame(() => {
    if (!enabled || raycastersRef.current.length === 0) return
    
    const cameraPosition = camera.position
    const previousPosition = previousPositionRef.current
    
    // Update debug helpers position
    if (debug) {
      debugHelpersRef.current.forEach((helper, i) => {
        helper.position.copy(cameraPosition)
      })
    }
    
    // Calculate movement vector
    const movement = cameraPosition.clone().sub(previousPosition)
    if (movement.length() < 0.001) {
      previousPosition.copy(cameraPosition)
      return // No significant movement
    }
    
    // Normalize movement direction
    const movementDirection = movement.clone().normalize()
    
    // Check collision in the movement direction
    if (checkCollision(cameraPosition, movementDirection)) {
      // Collision detected - prevent movement by reverting to previous position
      // but allow sliding along a free axis if possible
      const correctedPosition = previousPosition.clone()

      // Candidate slide directions: along X-only or Z-only (preserve sign of movement)
      const candidates: THREE.Vector3[] = []
      if (Math.abs(movementDirection.x) > 1e-3) {
        candidates.push(new THREE.Vector3(movementDirection.x, 0, 0).normalize())
      }
      if (Math.abs(movementDirection.z) > 1e-3) {
        candidates.push(new THREE.Vector3(0, 0, movementDirection.z).normalize())
      }

      let slid = false
      const slideAmount = Math.min(movement.length(), Math.max(0.08, collisionDistance * 0.5))
      for (const cand of candidates) {
        if (cand.length() > 0.1 && !checkCollision(correctedPosition, cand)) {
          correctedPosition.add(cand.multiplyScalar(slideAmount))
          slid = true
          if (debug) console.log('🧭 SLIDE along', cand.x !== 0 ? 'X' : 'Z', 'by', slideAmount.toFixed(3))
          break
        }
      }

      // Keep the Y component from camera position (for jumping)
      correctedPosition.y = cameraPosition.y

      if (!slid) {
        // No slide possible: push slightly away from the wall along opposite movement to avoid clipping jitter
        const separation = Math.max(0.12, collisionDistance * 0.6)
        const pushBack = movementDirection.clone().multiplyScalar(-separation)
        correctedPosition.add(pushBack)
      }

      camera.position.copy(correctedPosition)

      if (debug) {
        console.log('🚧 Collision detected, position corrected', { slid })
      }
    }
    
    // Update previous position
    previousPosition.copy(camera.position)
  })
  
  return null
}

// Hook for easy integration
export function useCameraCollision(config: RoomConfig, options: Partial<CameraCollisionProps> = {}) {
  return {
    CameraCollision: () => <CameraCollision config={config} {...options} />
  }
}
