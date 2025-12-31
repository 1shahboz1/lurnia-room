'use client'

import React, { Suspense, useRef, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, Environment } from '@react-three/drei'
import * as THREE from 'three'

interface GLBPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  modelPath: string
  modelName: string
}

function GLBModel({ url, onModelReady }: { url: string, onModelReady?: (boundingSphere: { center: THREE.Vector3, radius: number }) => void }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)

  React.useEffect(() => {
    if (scene && groupRef.current) {
      // Clear any existing children
      groupRef.current.clear()
      
      // Clone the scene to avoid modifying the original
      const clonedScene = scene.clone()
      
      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(clonedScene)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      
      // Center the model at origin (like macOS Preview)
      clonedScene.position.copy(center).multiplyScalar(-1)
      
      // Add the centered model to our group
      groupRef.current.add(clonedScene)
      
      // Calculate bounding sphere for camera positioning (macOS Preview style)
      const maxDim = Math.max(size.x, size.y, size.z)
      const boundingSphere = {
        center: new THREE.Vector3(0, 0, 0), // Model is centered at origin
        radius: maxDim / 2
      }
      
      // Notify parent with bounding sphere info for camera setup
      onModelReady?.(boundingSphere)
    }
  }, [scene, onModelReady])

  // Return a group that stays centered at origin
  return <group ref={groupRef} position={[0, 0, 0]} />
}

// macOS Preview-style camera controller
function MacPreviewControls({ 
  target = [0, 0, 0],
  boundingSphere,
  enabled = true 
}: { 
  target?: [number, number, number]
  boundingSphere?: { center: THREE.Vector3, radius: number }
  enabled?: boolean 
}) {
  const { camera, gl, size } = useThree()
  const [isDragging, setIsDragging] = useState(false)
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 })
  
  // Camera state
  const spherical = useRef(new THREE.Spherical())
  const targetVector = useRef(new THREE.Vector3(...target))
  
  // Auto-fit camera when model loads (like macOS Preview)
  React.useEffect(() => {
    if (boundingSphere && camera) {
      const { radius } = boundingSphere
      
      // Calculate optimal distance (like macOS Preview auto-fit)
      const fov = (camera as any).fov || 60
      const distance = radius / Math.sin((fov / 2) * (Math.PI / 180)) * 1.5 // 1.5x for padding
      
      // Set initial spherical coordinates (good 3D viewing angle)
      spherical.current.set(distance, Math.PI * 0.3, Math.PI * 0.25)
      
      updateCameraPosition()
    }
  }, [boundingSphere, camera])
  
  const updateCameraPosition = useCallback(() => {
    if (!camera) return
    
    const position = new THREE.Vector3()
    position.setFromSpherical(spherical.current)
    position.add(targetVector.current)
    
    camera.position.copy(position)
    camera.lookAt(targetVector.current)
    camera.updateMatrixWorld()
  }, [camera])
  
  // Handle mouse/touch events
  React.useEffect(() => {
    if (!enabled || !gl.domElement) return
    
    const handlePointerDown = (event: PointerEvent) => {
      setIsDragging(true)
      setLastPointer({ x: event.clientX, y: event.clientY })
      gl.domElement.style.cursor = 'grabbing'
    }
    
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return
      
      const deltaX = event.clientX - lastPointer.x
      const deltaY = event.clientY - lastPointer.y
      
      // Rotate around target (like macOS Preview)
      const rotateSpeed = 0.005
      spherical.current.theta -= deltaX * rotateSpeed
      // Fix: Invert Y direction - drag down should rotate view up to see top of object
      spherical.current.phi -= deltaY * rotateSpeed
      
      // Clamp phi to prevent flipping
      spherical.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.current.phi))
      
      updateCameraPosition()
      setLastPointer({ x: event.clientX, y: event.clientY })
    }
    
    const handlePointerUp = () => {
      setIsDragging(false)
      gl.domElement.style.cursor = 'grab'
    }
    
    const handleWheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      
      // Zoom in/out (like macOS Preview)
      const zoomSpeed = 0.1
      const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed
      
      spherical.current.radius *= delta
      
      // Clamp zoom limits
      if (boundingSphere) {
        const minRadius = boundingSphere.radius * 1.2
        const maxRadius = boundingSphere.radius * 10
        spherical.current.radius = Math.max(minRadius, Math.min(maxRadius, spherical.current.radius))
      }
      
      updateCameraPosition()
    }
    
    // Add event listeners
    gl.domElement.addEventListener('pointerdown', handlePointerDown)
    gl.domElement.addEventListener('pointermove', handlePointerMove)
    gl.domElement.addEventListener('pointerup', handlePointerUp)
    gl.domElement.addEventListener('wheel', handleWheel, { passive: false })
    gl.domElement.style.cursor = 'grab'
    
    // Cleanup
    return () => {
      gl.domElement?.removeEventListener('pointerdown', handlePointerDown)
      gl.domElement?.removeEventListener('pointermove', handlePointerMove)
      gl.domElement?.removeEventListener('pointerup', handlePointerUp)
      gl.domElement?.removeEventListener('wheel', handleWheel)
      if (gl.domElement) gl.domElement.style.cursor = 'default'
    }
  }, [enabled, isDragging, lastPointer, updateCameraPosition, gl.domElement, boundingSphere])
  
  return null
}

export function GLBPreviewModal({ isOpen, onClose, modelPath, modelName }: GLBPreviewModalProps) {
  const [boundingSphere, setBoundingSphere] = useState<{ center: THREE.Vector3, radius: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const handleModelReady = useCallback((sphere: { center: THREE.Vector3, radius: number }) => {
    setBoundingSphere(sphere)
    setIsLoading(false) // Model is ready, hide loading indicator
  }, [])
  
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  React.useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = 'hidden'
      // Reset state for fresh model loading
      setBoundingSphere(null)
      setIsLoading(true)
    } else {
      // Clean up when closing
      setBoundingSphere(null)
      setIsLoading(true)
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '80vw',
          height: '80vh',
          maxWidth: '900px',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827'
            }}
          >
            {modelName}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
              e.currentTarget.style.color = '#111827'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* 3D Viewer */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#374151'
          }}
        >
          <Canvas
            /* Cap DPR for performance on lower-end devices (prevents full Retina render cost) */
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 5], fov: 60 }}
            style={{ width: '100%', height: '100%' }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -5]} intensity={0.2} />
            <pointLight position={[0, 5, 0]} intensity={0.3} />
            
            <Suspense
              fallback={
                <mesh>
                  <boxGeometry args={[0.5, 0.5, 0.5]} />
                  <meshStandardMaterial color="#9ca3af" />
                </mesh>
              }
            >
              <GLBModel url={modelPath} onModelReady={handleModelReady} />
            </Suspense>
            
            <MacPreviewControls 
              target={[0, 0, 0]}
              boundingSphere={boundingSphere || undefined}
              enabled={true}
            />
            
            <Environment preset="studio" />
          </Canvas>

          {/* Loading overlay - only show while loading */}
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                color: '#9ca3af',
                fontSize: '14px',
                textAlign: 'center',
                zIndex: 10,
                backgroundColor: 'rgba(55, 65, 81, 0.8)',
                padding: '16px 24px',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)'
              }}
            >
              <div style={{ marginBottom: '8px' }}>⏳</div>
              <div>Loading 3D model...</div>
            </div>
          )}
        </div>

        {/* Footer with controls info */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            fontSize: '12px',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>🖱️ Click & drag to rotate • Scroll to zoom • Right-click & drag to pan</span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  )
}

export default GLBPreviewModal