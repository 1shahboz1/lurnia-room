'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Import global gizmo state (defined in VirtualRoom.tsx)
declare const globalGizmoState: {
  isDragging: boolean
  isHovering: boolean
  setDragging: (dragging: boolean) => void
  setHovering: (hovering: boolean) => void
}

interface TransformGizmoProps {
  object: THREE.Object3D | null
  onTransformChange?: (position: [number, number, number], rotation: [number, number, number], scale?: [number, number, number]) => void
  visible?: boolean
  centerOverride?: THREE.Vector3 // Use this position instead of object position for gizmo center
}

export function TransformGizmo({ object, onTransformChange, visible = true, centerOverride }: TransformGizmoProps) {
  // Early return if no object
  if (!object) return null
  // Removed excessive render logging
  
  const { camera, raycaster, gl, mouse, viewport } = useThree()
  const gizmoGroupRef = useRef<THREE.Group>(null)
  const xRingRef = useRef<THREE.Mesh>(null)
  const yRingRef = useRef<THREE.Mesh>(null)
  const zRingRef = useRef<THREE.Mesh>(null)
  const xArrowRef = useRef<THREE.Group>(null)
  const yArrowRef = useRef<THREE.Group>(null)
  const zArrowRef = useRef<THREE.Group>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<'none' | 'translate-x' | 'translate-y' | 'translate-z' | 'translate-free' | 'rotate-x' | 'rotate-y' | 'rotate-z' | 'scale'>('none')
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [hoveredRing, setHoveredRing] = useState<'none' | 'rotate-x' | 'rotate-y' | 'rotate-z'>('none')
  const [gizmoElementClicked, setGizmoElementClicked] = useState(false)
  const [modelCenter, setModelCenter] = useState<THREE.Vector3 | null>(null)
  
  // Ray-plane rotation state for proper 360° rotation
  const [rotationState, setRotationState] = useState<{
    pivotWorld: THREE.Vector3 | null
    axisWorld: THREE.Vector3 | null
    rotationPlane: THREE.Plane | null
    v0: THREE.Vector3 | null
    lastAngle: number
    totalAngle: number
  }>({
    pivotWorld: null,
    axisWorld: null,
    rotationPlane: null,
    v0: null,
    lastAngle: 0,
    totalAngle: 0
  })

  // Enhanced raycasting with better precision for rings and arrows
  const checkGizmoSelection = useCallback((event: any): 'none' | 'rotate-x' | 'rotate-y' | 'rotate-z' | 'translate-x' | 'translate-y' | 'translate-z' => {
    if (!gizmoGroupRef.current) return 'none'
    
    // Convert mouse position to normalized device coordinates with higher precision
    const rect = gl.domElement.getBoundingClientRect()
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Update raycaster with mouse position and improve precision
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
    
    // Improve raycasting precision for thin objects
    raycaster.params.Points.threshold = 0.01
    raycaster.params.Line.threshold = 0.01
    
    // Get all gizmo elements for intersection testing
    const gizmoElements: { 
      mesh: THREE.Mesh | THREE.Group; 
      type: 'rotate-x' | 'rotate-y' | 'rotate-z' | 'translate-x' | 'translate-y' | 'translate-z'; 
      priority: number;
      name: string;
    }[] = []
    
    // Add rings with high priority (rings are more specific than arrows) - Updated for smaller rings
    if (xRingRef.current) gizmoElements.push({ mesh: xRingRef.current, type: 'rotate-x', priority: 10, name: 'X Ring' })
    if (yRingRef.current) gizmoElements.push({ mesh: yRingRef.current, type: 'rotate-y', priority: 10, name: 'Y Ring' })
    if (zRingRef.current) gizmoElements.push({ mesh: zRingRef.current, type: 'rotate-z', priority: 10, name: 'Z Ring' })
    
    // Add arrows with lower priority
    if (xArrowRef.current) gizmoElements.push({ mesh: xArrowRef.current, type: 'translate-x', priority: 5, name: 'X Arrow' })
    if (yArrowRef.current) gizmoElements.push({ mesh: yArrowRef.current, type: 'translate-y', priority: 5, name: 'Y Arrow' })
    if (zArrowRef.current) gizmoElements.push({ mesh: zArrowRef.current, type: 'translate-z', priority: 5, name: 'Z Arrow' })
    
    // Find closest intersection with priority system
    let closestElement: 'none' | 'rotate-x' | 'rotate-y' | 'rotate-z' | 'translate-x' | 'translate-y' | 'translate-z' = 'none'
    let bestScore = -Infinity
    
    for (const { mesh, type, priority, name } of gizmoElements) {
      const intersections = raycaster.intersectObject(mesh, true) // Include children
      if (intersections.length > 0) {
        const distance = intersections[0].distance
        
        // Calculate score: higher priority and closer distance = better score
        const score = priority - distance * 0.1
        
        if (score > bestScore) {
          bestScore = score
          closestElement = type
        }
      }
    }
    
    return closestElement
  }, [gl, raycaster, camera, gizmoGroupRef, xRingRef, yRingRef, zRingRef, xArrowRef, yArrowRef, zArrowRef])

  // Check if click is directly on the object (for free drag)
  const checkObjectClick = useCallback((event: any): boolean => {
    if (!object) return false
    
    // Convert mouse position to normalized device coordinates
    const rect = gl.domElement.getBoundingClientRect()
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Update raycaster with mouse position
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
    
    // Check intersection with the actual object (and all its children)
    // IMPORTANT: Exclude blue scaling spheres which have higher renderOrder
    const intersections = raycaster.intersectObject(object, true).filter(intersection => {
      // Skip any objects with high renderOrder (like blue scaling spheres)
      const obj = intersection.object as any
      return !obj.renderOrder || obj.renderOrder < 2000
    })
    
    // Object intersection check complete (removed excessive logging)
    
    return intersections.length > 0
  }, [gl, raycaster, camera, object])
  
  // Check if click is on a blue scaling sphere
  const checkBlueSphereClick = useCallback((event: any): boolean => {
    if (!object) return false
    
    // Convert mouse position to normalized device coordinates
    const rect = gl.domElement.getBoundingClientRect()
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Update raycaster with mouse position
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
    
    // Check intersection only with high renderOrder objects (blue spheres)
    const intersections = raycaster.intersectObject(object, true).filter(intersection => {
      const obj = intersection.object as any
      return obj.renderOrder && obj.renderOrder >= 2000
    })
    
    return intersections.length > 0
  }, [gl, raycaster, camera, object])

  // Helper function to get world axis from ring orientation
  const getAxisFromRing = useCallback((ringType: 'rotate-x' | 'rotate-y' | 'rotate-z'): THREE.Vector3 => {
    if (!gizmoGroupRef.current) return new THREE.Vector3(1, 0, 0)
    
    // Get the world quaternion of the gizmo group (which follows object rotation)
    const worldQuaternion = new THREE.Quaternion()
    gizmoGroupRef.current.getWorldQuaternion(worldQuaternion)
    
    // Define local axes for each ring
    let localAxis: THREE.Vector3
    switch (ringType) {
      case 'rotate-x':
        localAxis = new THREE.Vector3(1, 0, 0)
        break
      case 'rotate-y':
        localAxis = new THREE.Vector3(0, 1, 0)
        break
      case 'rotate-z':
        localAxis = new THREE.Vector3(0, 0, 1)
        break
    }
    
    // Transform to world space
    const axisWorld = localAxis.applyQuaternion(worldQuaternion).normalize()
    
    // Align axis polarity to camera for consistent clockwise behavior
    const cameraDirection = new THREE.Vector3()
    camera.getWorldDirection(cameraDirection)
    
    if (cameraDirection.dot(axisWorld) < 0) {
      axisWorld.multiplyScalar(-1)
    }
    
    return axisWorld
  }, [camera])
  
  // Helper function to get mouse ray intersection with plane
  const getMouseRayPlaneIntersection = useCallback((event: MouseEvent, plane: THREE.Plane): THREE.Vector3 | null => {
    // Convert mouse position to normalized device coordinates
    const rect = gl.domElement.getBoundingClientRect()
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Create ray from camera through mouse position
    const ray = new THREE.Ray()
    ray.origin.setFromMatrixPosition(camera.matrixWorld)
    ray.direction.set(mouseX, mouseY, 0.5).unproject(camera).sub(ray.origin).normalize()
    
    // Check if ray is nearly parallel to plane (edge case)
    const rayDotNormal = ray.direction.dot(plane.normal)
    if (Math.abs(rayDotNormal) < 0.001) {
      // Ray is nearly parallel to plane - create a slightly tilted helper plane
      const cameraDirection = new THREE.Vector3()
      camera.getWorldDirection(cameraDirection)
      const tiltedNormal = plane.normal.clone().lerp(cameraDirection, 0.1).normalize()
      const tiltedPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(tiltedNormal, plane.coplanarPoint(new THREE.Vector3()))
      
      const intersection = new THREE.Vector3()
      const result = ray.intersectPlane(tiltedPlane, intersection)
      return result
    }
    
    // Normal case - intersect with the plane
    const intersection = new THREE.Vector3()
    const result = ray.intersectPlane(plane, intersection)
    return result
  }, [gl, camera])
  
  // Helper function to get normalized vector from pivot to mouse hit point
  const worldVectorOnPlaneFromMouse = useCallback((event: MouseEvent, plane: THREE.Plane, pivot: THREE.Vector3): THREE.Vector3 | null => {
    const intersection = getMouseRayPlaneIntersection(event, plane)
    if (!intersection) return null
    
    // Get vector from pivot to intersection point and normalize
    const vector = intersection.clone().sub(pivot).normalize()
    return vector
  }, [getMouseRayPlaneIntersection])

  // Handle ring clicks with custom raycasting
  const handleRingPointerDown = useCallback((event: any) => {
    if (!object || !visible) return
    
    const selectedRing = checkGizmoSelection(event)
    
    if (selectedRing !== 'none') {
      // Handle ring selection manually using same logic as handlePointerDown
      event.stopPropagation()
      event.preventDefault()
      
      // Exit pointer lock if active to enable gizmo interaction
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
      
      setIsDragging(true)
      setDragMode(selectedRing)
      
      // Get clientX/Y from the original DOM event
      const clientX = event.nativeEvent?.clientX || event.clientX || 0
      const clientY = event.nativeEvent?.clientY || event.clientY || 0
      setLastMousePos({ x: clientX, y: clientY })
      
      // Initialize ray-plane rotation state for rotation modes
      if (selectedRing.startsWith('rotate-') && centerOverride) {
        console.log(`🎯 RAY-PLANE: Initializing rotation for ${selectedRing}`)
        
        // Update object matrices to ensure fresh world data
        object.updateMatrixWorld(true)
        if (gizmoGroupRef.current) {
          gizmoGroupRef.current.updateMatrixWorld(true)
        }
        
        // Set up ray-plane rotation state
        const pivotWorld = centerOverride.clone()
        const axisWorld = getAxisFromRing(selectedRing as 'rotate-x' | 'rotate-y' | 'rotate-z')
        const rotationPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, pivotWorld)
        
        // Get initial vector from pivot to mouse hit point on plane
        const mouseEvent = event.nativeEvent || { clientX, clientY }
        const v0 = worldVectorOnPlaneFromMouse(mouseEvent, rotationPlane, pivotWorld)
        
        if (v0) {
          setRotationState({
            pivotWorld,
            axisWorld,
            rotationPlane,
            v0: v0.clone(),
            lastAngle: 0,
            totalAngle: 0
          })
          
          console.log(`🎯 RAY-PLANE: Initialized`, {
            mode: selectedRing,
            pivotWorld: `[${pivotWorld.x.toFixed(3)}, ${pivotWorld.y.toFixed(3)}, ${pivotWorld.z.toFixed(3)}]`,
            axisWorld: `[${axisWorld.x.toFixed(3)}, ${axisWorld.y.toFixed(3)}, ${axisWorld.z.toFixed(3)}]`,
            v0: `[${v0.x.toFixed(3)}, ${v0.y.toFixed(3)}, ${v0.z.toFixed(3)}]`
          })
        } else {
          console.warn(`🚨 RAY-PLANE: Failed to get initial intersection for ${selectedRing}`)
        }
      }
      
      // Prevent context menu and pointer events from bubbling
      gl.domElement.style.cursor = 'grabbing'
      document.addEventListener('contextmenu', e => e.preventDefault())
    }
  }, [object, visible, checkGizmoSelection, gl, centerOverride, getAxisFromRing, worldVectorOnPlaneFromMouse])

  // Handle ring hover with custom raycasting
  const handleRingPointerMove = useCallback((event: any) => {
    if (isDragging) return
    
    const selectedElement = checkGizmoSelection(event)
    const selectedRing = selectedElement.startsWith('rotate-') ? selectedElement as 'rotate-x' | 'rotate-y' | 'rotate-z' : 'none'
    if (selectedRing !== hoveredRing) {
      setHoveredRing(selectedRing)
      gl.domElement.style.cursor = selectedElement !== 'none' ? 'grab' : 'default'
      
      if (selectedElement !== 'none') {
        const ringColors = {
          'rotate-x': 'RED',
          'rotate-y': 'GREEN', 
          'rotate-z': 'BLUE'
        }
        // log.debug(`Custom raycast hovering: ${selectedRing} (${ringColors[selectedRing]})`, undefined, 'TransformGizmo')
      }
    }
  }, [checkGizmoSelection, hoveredRing, isDragging, gl])
  
  // Track last center to prevent excessive logging
  const [lastCenterOverride, setLastCenterOverride] = useState<THREE.Vector3 | null>(null)
  const [hasLoggedThisCenter, setHasLoggedThisCenter] = useState(false)
  
  // Track object position for gizmo translation following
  const [lastObjectPosition, setLastObjectPosition] = useState<THREE.Vector3 | null>(null)
  const [gizmoBasePosition, setGizmoBasePosition] = useState<THREE.Vector3 | null>(null)
  
  // Update gizmo position and rotation to match the object
  useFrame(() => {
    if (!gizmoGroupRef.current || !object || !visible) return

    // Get current object world position
    const currentObjectPosition = new THREE.Vector3()
    object.getWorldPosition(currentObjectPosition)
    
    // Calculate target gizmo position
    let targetPosition: THREE.Vector3
    
    if (centerOverride) {
      // First time setup or when centerOverride changes
      if (!lastCenterOverride || !lastCenterOverride.equals(centerOverride)) {
        console.log(`🚨 GIZMO: Received NEW center from props: [${centerOverride.x.toFixed(3)}, ${centerOverride.y.toFixed(3)}, ${centerOverride.z.toFixed(3)}] for ${object.userData?.modelName || 'unknown'}`)
        setLastCenterOverride(centerOverride.clone())
        setLastObjectPosition(currentObjectPosition.clone())
        setGizmoBasePosition(centerOverride.clone())
        setHasLoggedThisCenter(false)
        targetPosition = centerOverride.clone()
      } else {
        // Track object position changes and apply them to gizmo
        if (lastObjectPosition && gizmoBasePosition) {
          // Calculate how much the object has moved since last frame
          const objectMovement = new THREE.Vector3().subVectors(currentObjectPosition, lastObjectPosition)
          
          // Apply the same movement to the gizmo base position
          const newGizmoPosition = gizmoBasePosition.clone().add(objectMovement)
          setGizmoBasePosition(newGizmoPosition)
          targetPosition = newGizmoPosition
        } else {
          targetPosition = centerOverride.clone()
        }
        
        // Update tracked object position
        setLastObjectPosition(currentObjectPosition.clone())
      }
    } else {
      // Fallback to object position (gizmo at object origin)
      targetPosition = currentObjectPosition.clone()
    }
    
    // Always update gizmo position every frame
    gizmoGroupRef.current.position.copy(targetPosition)
    
    gizmoGroupRef.current.rotation.copy(object.rotation)
    
    // Fixed scale that provides consistent size regardless of object size or camera distance
    const fixedScale = 2.5 // Fixed size - rings appear same size regardless of camera distance
    gizmoGroupRef.current.scale.setScalar(fixedScale)
  })

  const handlePointerDown = useCallback((e: any, mode: typeof dragMode) => {
    if (!object || !visible) return
    e.stopPropagation()
    
    // Starting pointer down interaction
    
    // Exit pointer lock if active to enable gizmo interaction
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    
    setIsDragging(true)
    setDragMode(mode)
    
    // Get clientX/Y from the original DOM event
    const clientX = e.nativeEvent?.clientX || e.clientX || 0
    const clientY = e.nativeEvent?.clientY || e.clientY || 0
    setLastMousePos({ x: clientX, y: clientY })
    
    // Initialize ray-plane rotation state for rotation modes
    if (mode.startsWith('rotate-')) {
      console.log(`🎯 RAY-PLANE: Initializing rotation for ${mode}`)
      
      // Update object matrices to ensure fresh world data
      object.updateMatrixWorld(true)
      if (gizmoGroupRef.current) {
        gizmoGroupRef.current.updateMatrixWorld(true)
      }
      
      // Set up ray-plane rotation state
      // IMPORTANT: Use centerOverride (blue wireframe center) as pivot for consistent rotation
      const pivotWorld = new THREE.Vector3()
      if (centerOverride) {
        pivotWorld.copy(centerOverride) // Use blue wireframe calculated center
      } else {
        object.getWorldPosition(pivotWorld) // Fallback to object position
      }
      const axisWorld = getAxisFromRing(mode as 'rotate-x' | 'rotate-y' | 'rotate-z')
      const rotationPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, pivotWorld)
      
      // Get initial vector from pivot to mouse hit point on plane
      const mouseEvent = e.nativeEvent || { clientX, clientY }
      const v0 = worldVectorOnPlaneFromMouse(mouseEvent, rotationPlane, pivotWorld)
      
      if (v0) {
        setRotationState({
          pivotWorld,
          axisWorld,
          rotationPlane,
          v0: v0.clone(),
          lastAngle: 0,
          totalAngle: 0
        })
        
        console.log(`🎯 RAY-PLANE: Initialized`, {
          mode,
          pivotWorld: `[${pivotWorld.x.toFixed(3)}, ${pivotWorld.y.toFixed(3)}, ${pivotWorld.z.toFixed(3)}]`,
          axisWorld: `[${axisWorld.x.toFixed(3)}, ${axisWorld.y.toFixed(3)}, ${axisWorld.z.toFixed(3)}]`,
          v0: `[${v0.x.toFixed(3)}, ${v0.y.toFixed(3)}, ${v0.z.toFixed(3)}]`
        })
      } else {
        console.warn(`🚨 RAY-PLANE: Failed to get initial intersection for ${mode}`)
      }
    }
    
    // Prevent context menu and pointer events from bubbling
    gl.domElement.style.cursor = 'grabbing'
    document.addEventListener('contextmenu', e => e.preventDefault())
  }, [object, visible, gl, isDragging, centerOverride, getAxisFromRing, worldVectorOnPlaneFromMouse])

  const handlePointerMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !object || dragMode === 'none') return

    const sensitivity = 0.01
    const moveSensitivity = 0.01

    // For rotation - Use ray-plane intersection for proper 360° rotation
    if (dragMode.startsWith('rotate-') && rotationState.rotationPlane && rotationState.pivotWorld && rotationState.axisWorld && rotationState.v0) {
      // IMPORTANT: Always use current object position as pivot, not the stored one
      // This ensures rotation pivot moves with the object if it gets translated
      const currentPivotWorld = new THREE.Vector3()
      object.getWorldPosition(currentPivotWorld)
      
      // Update the rotation plane with current pivot position
      const currentRotationPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(rotationState.axisWorld, currentPivotWorld)
      
      // Get current vector from current pivot to mouse hit point on plane
      const v1 = worldVectorOnPlaneFromMouse(e, currentRotationPlane, currentPivotWorld)
      
      if (v1) {
        // Calculate signed angle between INITIAL v0 and current v1
        // This is the key fix - always calculate angle from initial grab point
        const cross = new THREE.Vector3().crossVectors(rotationState.v0, v1)
        const dot = Math.max(-1, Math.min(1, rotationState.v0.dot(v1))) // Clamp to avoid NaN
        const currentAngle = Math.atan2(cross.dot(rotationState.axisWorld), dot)
        
        // Calculate delta from last applied angle to current angle
        const delta = currentAngle - rotationState.lastAngle
        
        // Apply incremental rotation about pivot (only the delta)
        // Add threshold to prevent micro-movements and improve stability
        if (Math.abs(delta) > 0.003) { // Slightly higher threshold for better stability
          const q = new THREE.Quaternion().setFromAxisAngle(rotationState.axisWorld, delta)
          
          // Rotate position around current pivot (not stored pivot)
          const parent = object.parent
          if (parent) {
            const pivotLocal = parent.worldToLocal(currentPivotWorld.clone())
            object.position.sub(pivotLocal).applyQuaternion(q).add(pivotLocal)
          } else {
            // No parent, use world coordinates directly
            object.position.sub(currentPivotWorld).applyQuaternion(q).add(currentPivotWorld)
          }
          
          // Apply rotation to object
          object.quaternion.premultiply(q)
        }
        
        // Update rotation state - DO NOT UPDATE v0, keep it as initial grab vector
        setRotationState(prev => ({
          ...prev,
          lastAngle: currentAngle, // Track the cumulative angle from start
          totalAngle: currentAngle // Total angle from initial grab point
        }))
        
        console.log('🌌 RAY-PLANE ROTATION:', {
          dragMode,
          currentAngle: (currentAngle * 180 / Math.PI).toFixed(1) + '°',
          delta: (delta * 180 / Math.PI).toFixed(1) + '°',
          totalRotation: (currentAngle * 180 / Math.PI).toFixed(1) + '°'
        })
      } else {
        console.warn('🚨 RAY-PLANE: Failed to get current intersection')
      }
      
      setLastMousePos({ x: e.clientX, y: e.clientY })
      return
    }

    // For translation, move along local axes (where arrows point) with intuitive mouse movement
    if (dragMode.startsWith('translate-')) {
      const deltaX = e.clientX - lastMousePos.x
      const deltaY = e.clientY - lastMousePos.y
      
      // Handle free movement in screen space - PROPER CAMERA-BASED MOVEMENT
      if (dragMode === 'translate-free') {
        // Free drag movement
        
        // Get camera's world matrix to extract proper basis vectors
        camera.updateMatrixWorld()
        
        // Extract camera's right and forward vectors from its world matrix
        const cameraRight = new THREE.Vector3()
        const cameraUp = new THREE.Vector3() 
        const cameraForward = new THREE.Vector3()
        
        // Get camera's basis vectors
        camera.matrixWorld.extractBasis(cameraRight, cameraUp, cameraForward)
        
        // For movement on XZ plane, we want:
        // - cameraRight (already correct for left/right)
        // - cameraForward projected onto XZ plane (for forward/back)
        cameraForward.negate() // Camera looks down negative Z, we want positive Z forward
        cameraForward.y = 0 // Remove Y component to stay on ground
        cameraForward.normalize() // Re-normalize after removing Y
        
        cameraRight.y = 0 // Remove Y component to stay on ground  
        cameraRight.normalize() // Re-normalize
        
        // Scale the movement - increased sensitivity by 3.9x on all sides (1.95x * 2x)
        const moveScale = 0.0195 // 2x increase from 0.00975 (now 3.9x from original 0.005)
        const forwardMoveScale = 0.0312 // 2x increase from 0.0156 (now 3.9x from original 0.008)
        
        // Map mouse movement to world movement:
        // deltaX (mouse left/right) -> move along camera right vector
        // deltaY (mouse up/down) -> move along camera forward vector 
        const rightMovement = cameraRight.clone().multiplyScalar(deltaX * moveScale)
        const forwardMovement = cameraForward.clone().multiplyScalar(-deltaY * forwardMoveScale) // Negative because mouse down = move forward
        
        // Combine movements
        const totalMovement = rightMovement.add(forwardMovement)
        
        // Camera-based movement calculation complete
        
        // Apply the movement to the object
        object.position.add(totalMovement)
        
        setLastMousePos({ x: e.clientX, y: e.clientY })
        return
      }
      
      // Get the local axis direction for specific axis movement
      let localAxisDirection = new THREE.Vector3()
      switch (dragMode) {
        case 'translate-x':
          localAxisDirection.set(1, 0, 0)
          break
        case 'translate-y':
          localAxisDirection.set(0, 1, 0)
          break
        case 'translate-z':
          localAxisDirection.set(0, 0, 1)
          break
      }
      
      // Transform the local axis to world space
      const worldAxisDirection = localAxisDirection.clone().applyQuaternion(object.quaternion)
      
      // Project the world axis direction onto the screen
      const objectScreenPos = object.position.clone().project(camera)
      const axisEndWorld = object.position.clone().add(worldAxisDirection)
      const axisEndScreen = axisEndWorld.project(camera)
      
      // Get the screen-space direction of the axis (normalized)
      const screenAxisDir = new THREE.Vector2(
        axisEndScreen.x - objectScreenPos.x,
        axisEndScreen.y - objectScreenPos.y
      ).normalize()
      
      // Calculate mouse movement in normalized screen coordinates
      const rect = gl.domElement.getBoundingClientRect()
      const mouseDelta = new THREE.Vector2(
        (deltaX / rect.width) * 2, // Convert to normalized coordinates
        -(deltaY / rect.height) * 2 // Invert Y and convert to normalized coordinates
      )
      
      // Calculate how much the mouse moved along the axis direction in screen space
      const axisMovement = mouseDelta.dot(screenAxisDir)
      
      // Apply the movement along the world axis
      const worldMovement = worldAxisDirection.clone().multiplyScalar(axisMovement * moveSensitivity * 1560) // 5.2x more sensitivity (2.6x * 2x)
      object.position.add(worldMovement)
      
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }

    // Handle uniform scaling
    if (dragMode === 'scale') {
      const deltaY = e.clientY - lastMousePos.y
      const scaleSensitivity = 0.01
      const scaleChange = 1 + (-deltaY * scaleSensitivity)
      
      // Apply uniform scaling
      object.scale.multiplyScalar(scaleChange)
      
      // Clamp scale to reasonable bounds
      const minScale = 0.1
      const maxScale = 10
      object.scale.clampScalar(minScale, maxScale)
      
      console.log('🔵 SCALE: New scale:', object.scale.x.toFixed(3))
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }, [isDragging, object, dragMode, lastMousePos, camera, gl])

  const handlePointerUp = useCallback((e?: MouseEvent) => {
    if (!isDragging || !object) return

    // Stop event propagation to prevent deselection
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }

    setIsDragging(false)
    setDragMode('none')
    gl.domElement.style.cursor = 'default'
    
    // Reset ray-plane rotation state
    setRotationState({
      pivotWorld: null,
      axisWorld: null,
      rotationPlane: null,
      v0: null,
      lastAngle: 0,
      totalAngle: 0
    })
    
    // IMPORTANT: Reset global gizmo state so camera controls work again
    if (typeof window !== 'undefined') {
      const w = (window as any)
      const gs = w.globalGizmoState || {}
      if (typeof gs.setDragging === 'function') {
        gs.setDragging(false)
      } else {
        w.globalGizmoState = { ...gs, isDragging: false }
      }
      const gs2 = w.globalGizmoState || {}
      if (typeof gs2.setHovering === 'function') {
        gs2.setHovering(false)
      } else {
        w.globalGizmoState = { ...gs2, isHovering: false }
      }
    }
    
    // Call the callback with new transform
    if (onTransformChange) {
      const pos = object.position.toArray() as [number, number, number]
      const rot = object.rotation.toArray().slice(0, 3) as [number, number, number]
      const scale = object.scale.toArray() as [number, number, number]
      onTransformChange(pos, rot, scale)
    }
    
    console.log(`✅ RAY-PLANE: Finished rotation - Total: ${(rotationState.totalAngle * 180 / Math.PI).toFixed(1)}°`)
    
    // Prevent any click events from bubbling up after drag
    setTimeout(() => {
      document.addEventListener('click', (e) => e.stopPropagation(), { once: true, capture: true })
    }, 0)
  }, [isDragging, object, onTransformChange, gl, rotationState.totalAngle])

  // Sync local state with global gizmo state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = (window as any)
      const gs = w.globalGizmoState || {}
      if (typeof gs.setDragging === 'function') {
        gs.setDragging(isDragging)
      } else {
        w.globalGizmoState = { ...gs, isDragging }
      }
    }
  }, [isDragging])
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = (window as any)
      const gs = w.globalGizmoState || {}
      const isHovering = hoveredRing !== 'none'
      if (typeof gs.setHovering === 'function') {
        gs.setHovering(isHovering)
      } else {
        w.globalGizmoState = { ...gs, isHovering }
      }
    }
  }, [hoveredRing])
  
  // Global mouse events for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e)
    const handleMouseUp = () => handlePointerUp()

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handlePointerMove, handlePointerUp])

  // Ensure global flags are cleared on unmount to avoid stuck camera gating
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        const w = (window as any)
        const gs = w.globalGizmoState || {}
        w.globalGizmoState = { ...gs, isDragging: false, isHovering: false }
      }
    }
  }, [])

  // Debug: Check rendering conditions
  console.log(`🔍 GIZMO RENDER CHECK: visible=${visible}, object=${!!object}, modelName=${object?.userData?.modelName || 'unknown'}`)
  
  if (!visible || !object) {
    console.log(`🚫 GIZMO NOT RENDERING: visible=${visible}, object=${!!object}`)
    return null
  }

  // Dynamic scale based on object size - will be set in useFrame
  const gizmoScale = 1.0

  // TransformGizmo rendering

  return (
    <group ref={gizmoGroupRef} scale={gizmoScale}>
      {/* Gizmo click handler - SMALLER area for gizmo elements only */}
      <mesh 
        position={[0, 0, 0]}
        visible={false}
        renderOrder={-100} // Render BEHIND everything else
        onPointerDown={(e) => {
          // FIRST: Check if we clicked on a blue scaling sphere - if so, let it handle the event
          const clickedOnBlueSphere = checkBlueSphereClick(e.nativeEvent || e)
          if (clickedOnBlueSphere) {
            console.log('🔵 GIZMO: Blue scaling sphere clicked, letting GLB handle it')
            return // Let the blue sphere handle its own interaction
          }
          
          // Check if we clicked on any gizmo element using enhanced raycasting
          const selectedElement = checkGizmoSelection(e.nativeEvent || e)
          
          if (selectedElement !== 'none') {
            // Starting gizmo interaction
            handlePointerDown(e, selectedElement)
          } else {
            // Only allow free drag if clicking directly on the object
            const clickedOnObject = checkObjectClick(e.nativeEvent || e)
            
            if (clickedOnObject) {
              console.log('🟦 GIZMO: Starting free drag')
              handlePointerDown(e, 'translate-free')
            }
            // Don't start any drag if not on object - let click pass through
          }
        }}
        onPointerMove={(e) => {
          if (isDragging) return
          
          // FIRST: Check if hovering over blue scaling sphere - let GLB handle cursor
          const hoveringBlueSphere = checkBlueSphereClick(e.nativeEvent || e)
          if (hoveringBlueSphere) {
            return // Let the blue sphere handle its own hover/cursor
          }
          
          // Check if we're hovering over any gizmo element using raycasting
          const selectedElement = checkGizmoSelection(e.nativeEvent || e)
          const isRing = selectedElement.startsWith('rotate-')
          const currentRing = isRing ? selectedElement as 'none' | 'rotate-x' | 'rotate-y' | 'rotate-z' : 'none'
          
          if (currentRing !== hoveredRing) {
            setHoveredRing(currentRing)
          }
          
          // Set cursor based on element type
          if (selectedElement !== 'none') {
            if (isRing) {
              gl.domElement.style.cursor = 'grab'
            } else if (selectedElement === 'translate-x') {
              gl.domElement.style.cursor = 'ew-resize'
            } else if (selectedElement === 'translate-y') {
              gl.domElement.style.cursor = 'ns-resize'
            } else if (selectedElement === 'translate-z') {
              gl.domElement.style.cursor = 'move'
            }
          } else {
            // Check if hovering over object for free drag cursor
            const hoveringObject = checkObjectClick(e.nativeEvent || e)
            gl.domElement.style.cursor = hoveringObject ? 'move' : 'default'
          }
        }}
        onPointerOut={() => {
          if (!isDragging) {
            setHoveredRing('none')
            gl.domElement.style.cursor = 'default'
          }
        }}
      >
        <sphereGeometry args={[1.0]} /> {/* Smaller area - only covers gizmo elements */}
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      {/* Center sphere for visual reference and Y translation */}
      <mesh 
        position={[0, 0, 0]}
        renderOrder={500} // Medium priority
        onPointerDown={(e) => {
          // Center sphere clicked for Y translation
          setGizmoElementClicked(true) // Prevent free drag
          handlePointerDown(e, 'translate-y') // Y axis movement
        }}
        onPointerOver={() => {
          gl.domElement.style.cursor = 'ns-resize'
        }}
        onPointerOut={() => gl.domElement.style.cursor = 'default'}
      >
        <sphereGeometry args={[0.0008]} /> {/* Tiny center sphere - nearly invisible */}
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>

      {/* Note: Using embedded blue spheres from GLB models for scaling interaction */}

      {/* Translation Arrows */}
      
      {/* X Axis Arrow (Red) - Reduced length by 3x (1.5x + 2x) */}
      <group ref={xArrowRef}>
        {/* Arrow shaft - no event handlers, handled by unified system */}
        <mesh 
          position={[0.225, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          renderOrder={1100} // Higher than sphere
        >
          <cylinderGeometry args={[0.0065, 0.0065, 0.445]} /> {/* 0.45/2=0.225, 0.013/2=0.0065, 0.89/2=0.445 */}
          <meshBasicMaterial color="#ff4444" depthTest={false} depthWrite={false} />
        </mesh>
        {/* Arrow head - no event handlers, handled by unified system */}
        <mesh 
          position={[0.445, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          renderOrder={1100} // Higher than sphere
        >
          <coneGeometry args={[0.02, 0.09, 8]} /> {/* 0.89/2=0.445, 0.04/2=0.02, 0.18/2=0.09 */}
          <meshBasicMaterial color="#ff4444" depthTest={false} depthWrite={false} />
        </mesh>
      </group>

      {/* Y Axis Arrow (Green) - Reduced length by 3x (1.5x + 2x) */}
      <group ref={yArrowRef}>
        {/* Arrow shaft - no event handlers, handled by unified system */}
        <mesh 
          position={[0, 0.225, 0]}
          renderOrder={1100} // Higher than sphere
        >
          <cylinderGeometry args={[0.0065, 0.0065, 0.445]} /> {/* 0.45/2=0.225, 0.013/2=0.0065, 0.89/2=0.445 */}
          <meshBasicMaterial color="#44ff44" depthTest={false} depthWrite={false} />
        </mesh>
        {/* Arrow head - no event handlers, handled by unified system */}
        <mesh 
          position={[0, 0.445, 0]}
          renderOrder={1100} // Higher than sphere
        >
          <coneGeometry args={[0.02, 0.09, 8]} /> {/* 0.89/2=0.445, 0.04/2=0.02, 0.18/2=0.09 */}
          <meshBasicMaterial color="#44ff44" depthTest={false} depthWrite={false} />
        </mesh>
      </group>

      {/* Z Axis Arrow (Blue) - Reduced length by 3x (1.5x + 2x) */}
      <group ref={zArrowRef} rotation={[Math.PI / 2, 0, 0]}>
        {/* Arrow shaft - no event handlers, handled by unified system */}
        <mesh 
          position={[0, 0.225, 0]}
          renderOrder={1100} // Higher than sphere
        >
          <cylinderGeometry args={[0.0065, 0.0065, 0.445]} /> {/* 0.45/2=0.225, 0.013/2=0.0065, 0.89/2=0.445 */}
          <meshBasicMaterial color="#4444ff" depthTest={false} depthWrite={false} />
        </mesh>
        {/* Arrow head - no event handlers, handled by unified system */}
        <mesh 
          position={[0, 0.445, 0]}
          renderOrder={1100} // Higher than sphere
        >
          <coneGeometry args={[0.02, 0.09, 8]} /> {/* 0.89/2=0.445, 0.04/2=0.02, 0.18/2=0.09 */}
          <meshBasicMaterial color="#4444ff" depthTest={false} depthWrite={false} />
        </mesh>
      </group>

      {/* Rotation Rings - Custom raycasting for precise hit detection - Reduced size */}
      
      {/* X Rotation Ring (Red) - Increased size for better visibility */}
      <group rotation={[0, Math.PI / 2, 0]}>
        {/* Visible ring - no event handlers, just visual */}
        <mesh 
          renderOrder={1200} // Higher than arrows and sphere
        >
          <torusGeometry args={[0.3, 0.0075, 12, 64]} /> {/* Made 2x thinner: 0.015 / 2 = 0.0075 */}
        <meshBasicMaterial 
            color={dragMode === 'rotate-x' ? "#ffaaaa" : (hoveredRing === 'rotate-x' ? "#ff8888" : "#ff0000")} 
            transparent 
            opacity={dragMode === 'rotate-x' || hoveredRing === 'rotate-x' ? 1.0 : 0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        
        {/* Precise invisible mesh for raycasting - thicker for easier interaction */}
        <mesh 
          ref={xRingRef} 
          visible={false}
          renderOrder={1500}
        >
          <torusGeometry args={[0.3, 0.012, 16, 64]} /> {/* Slightly thicker than visible ring (0.0075 * 1.6 = 0.012) for easier grabbing */}
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      {/* Y Rotation Ring (Green) - Increased size for better visibility */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        {/* Visible ring - no event handlers, just visual */}
        <mesh 
          renderOrder={1200} // Higher than arrows and sphere
        >
          <torusGeometry args={[0.25, 0.0075, 12, 64]} /> {/* Made 2x thinner: 0.015 / 2 = 0.0075 */}
        <meshBasicMaterial 
            color={dragMode === 'rotate-y' ? "#aaffaa" : (hoveredRing === 'rotate-y' ? "#88ff88" : "#00ff00")} 
            transparent 
            opacity={dragMode === 'rotate-y' || hoveredRing === 'rotate-y' ? 1.0 : 0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        
        {/* Precise invisible mesh for raycasting - thicker for easier interaction */}
        <mesh 
          ref={yRingRef}
          visible={false}
          renderOrder={1500}
        >
          <torusGeometry args={[0.25, 0.012, 16, 64]} /> {/* Slightly thicker than visible ring (0.0075 * 1.6 = 0.012) for easier grabbing */}
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      {/* Z Rotation Ring (Blue) - Increased size for better visibility */}
      <group>
        {/* Visible ring - no event handlers, just visual */}
        <mesh 
          renderOrder={1200} // Higher than arrows and sphere
        >
          <torusGeometry args={[0.2, 0.0075, 12, 64]} /> {/* Made 2x thinner: 0.015 / 2 = 0.0075 */}
        <meshBasicMaterial 
            color={dragMode === 'rotate-z' ? "#aaaaff" : (hoveredRing === 'rotate-z' ? "#8888ff" : "#0000ff")} 
            transparent 
            opacity={dragMode === 'rotate-z' || hoveredRing === 'rotate-z' ? 1.0 : 0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        
        {/* Precise invisible mesh for raycasting - thicker for easier interaction */}
        <mesh 
          ref={zRingRef}
          visible={false}
          renderOrder={1500}
        >
          <torusGeometry args={[0.2, 0.012, 16, 64]} /> {/* Slightly thicker than visible ring (0.0075 * 1.6 = 0.012) for easier grabbing */}
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
      
      {/* Debug: Visual marker at gizmo group position (yellow sphere) */}
      <mesh>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshBasicMaterial color="yellow" transparent opacity={0.9} />
      </mesh>
      
      {/* Debug: BRIGHT marker to verify gizmo is actually at the right place */}
      <mesh>
        <sphereGeometry args={[0.008, 8, 6]} />
        <meshStandardMaterial color="lime" emissive="lime" emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}
