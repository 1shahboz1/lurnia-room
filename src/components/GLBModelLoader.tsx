'use client'

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RigidBody } from '@react-three/rapier'

// Interface for model configuration
export interface GLBModelConfig {
  id: string
  filename: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number | [number, number, number]
  interactive?: boolean
  physics?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
  animation?: string | null
  visible?: boolean
}

// Smart placeholder component
function SmartPlaceholder({ config }: { config: GLBModelConfig }) {
  const getModelColor = (filename: string) => {
    const name = filename.toLowerCase()
    if (name.includes('server')) return '#4CAF50' // Green for servers
    if (name.includes('router')) return '#2196F3' // Blue for routers  
    if (name.includes('switch')) return '#FF9800' // Orange for switches
    return '#9C27B0' // Purple for other models
  }
  
  const getModelSize = (filename: string) => {
    const name = filename.toLowerCase()
    if (name.includes('server')) return [2, 3, 1] as [number, number, number] // Tall server rack
    if (name.includes('router')) return [1.5, 0.3, 1] as [number, number, number] // Flat router
    if (name.includes('switch')) return [1.2, 0.2, 0.8] as [number, number, number] // Small switch
    return [1, 1, 1] as [number, number, number] // Default cube
  }
  
  const color = getModelColor(config.filename)
  const size = getModelSize(config.filename)
  
  return (
    <group position={config.position} rotation={config.rotation}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} transparent opacity={0.7} />
      </mesh>
      {/* Loading indicator */}
      <mesh position={[0, size[1]/2 + 0.3, 0]}>
        <sphereGeometry args={[0.1]} />
        <meshBasicMaterial color="#ffff00" />
      </mesh>
    </group>
  )
}

// Real GLB loading component using useLoader
function RealGLBModel({ config }: { config: GLBModelConfig }) {
  const groupRef = useRef<THREE.Group>(null!)
  
  try {
    // Use useGLTF from @react-three/drei - optimized for React Three Fiber
    const gltf = useGLTF(`/models/${config.filename}`)
    
    useEffect(() => {
      if (!gltf?.scene || !groupRef.current) return
      
      console.log('✅ Successfully loaded GLB with useGLTF:', config.filename)
      
      // Clone the scene to avoid sharing
      const clonedScene = gltf.scene.clone()
      
      // Apply shadows and material settings
      clonedScene.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = config.castShadow ?? true
          child.receiveShadow = config.receiveShadow ?? true
          
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.envMapIntensity = 0.3
            child.material.needsUpdate = true
          }
        }
      })
      
      // Clear and add the model
      groupRef.current.clear()
      groupRef.current.add(clonedScene)
    }, [gltf, config.castShadow, config.receiveShadow, config.filename])
    
    // Calculate scale
    const scaleVector = typeof config.scale === 'number' 
      ? [config.scale, config.scale, config.scale] as [number, number, number]
      : config.scale
    
    return (
      <group
        ref={groupRef}
        position={config.position}
        rotation={config.rotation}
        scale={scaleVector}
        visible={config.visible ?? true}
      />
    )
  } catch (error) {
    console.error('❌ useGLTF failed for', config.filename, ':', error)
    // Fall back to placeholder on error
    return <SmartPlaceholder config={config} />
  }
}

// Main GLB Model component with progressive loading
function GLBModel({ config }: { config: GLBModelConfig }) {
  return (
    <Suspense fallback={<SmartPlaceholder config={config} />}>
      <RealGLBModel config={config} />
    </Suspense>
  )
}

// Hook to scan for available GLB files
export function useAvailableGLBModels() {
  const [modelFiles, setModelFiles] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(true)

  useEffect(() => {
    const scanModelsFolder = async () => {
      try {
        console.log('🔍 Scanning models folder for GLB files...')
        const response = await fetch('/api/scan-models')
        
        if (response.ok) {
          const files = await response.json()
          const glbFiles = files.filter((file: string) => file.toLowerCase().endsWith('.glb'))
          console.log('📦 Found GLB files:', glbFiles)
          setModelFiles(glbFiles)
        } else {
          console.error('❌ Failed to scan models folder:', response.status, response.statusText)
          setModelFiles([])
        }
      } catch (error) {
        console.error('❌ Error scanning models folder:', error)
        setModelFiles([])
      } finally {
        setIsScanning(false)
      }
    }

    scanModelsFolder()
  }, [])

  return { modelFiles, isScanning }
}

// Main GLB Model Loader Component
export function GLBModelLoader({ 
  models = [],
  autoScanFolder = true,
  defaultPosition = [0, 0, 0] as [number, number, number],
  defaultScale = 1
}: {
  models?: GLBModelConfig[]
  autoScanFolder?: boolean
  defaultPosition?: [number, number, number]
  defaultScale?: number
}) {
  const { modelFiles, isScanning } = useAvailableGLBModels()
  
  // Smart positioning based on filename patterns
  const getSmartPosition = (filename: string, index: number): [number, number, number] => {
    const name = filename.toLowerCase()
    
    if (name.includes('server')) {
      // Server rack area - back right corner
      return [8 + (index * 2), 1.5, -8] // Tall servers against back wall
    }
    if (name.includes('router') || name.includes('switch')) {
      // Networking equipment area - center table height
      return [-4 - (index * 2), 1, -2] // On networking table
    }
    if (name.includes('chair') || name.includes('desk')) {
      // Furniture area - front of room
      return [0 + (index * 2), 0, 4] // Student seating area
    }
    
    // Default: circular arrangement in center
    const angle = (index / modelFiles.length) * Math.PI * 2
    const radius = 3
    return [
      Math.cos(angle) * radius,
      0.5,
      Math.sin(angle) * radius
    ]
  }
  
  // Generate default configurations for discovered models
  const autoGeneratedConfigs = useMemo(() => {
    if (!autoScanFolder) return []
    
    console.log('🏗️ Generating configs for models:', modelFiles)
    
    const configs = modelFiles.map((filename, index) => {
      const config = {
        id: `auto-${filename.replace('.glb', '')}`,
        filename,
        position: getSmartPosition(filename, index),
        rotation: [0, 0, 0] as [number, number, number],
        scale: defaultScale,
        interactive: false,
        physics: true,
        castShadow: true,
        receiveShadow: true,
        visible: true
      }
      console.log('🎯 Created config for', filename, ':', config)
      return config
    })
    
    console.log('✅ Total GLB model configs:', configs.length)
    return configs
  }, [modelFiles, autoScanFolder, defaultPosition, defaultScale])

  // Combine manual and auto-generated configs
  const allConfigs = [...models, ...autoGeneratedConfigs]

  // Don't render anything while scanning
  if (isScanning) {
    return <group />
  }

  return (
    <group>
      {allConfigs.map((config) => (
        <GLBModel key={config.id} config={config} />
      ))}
    </group>
  )
}

// Preload models to improve performance
export function preloadGLBModels(filenames: string[]) {
  filenames.forEach(filename => {
    useGLTF.preload(`/models/${filename}`)
  })
}

export default GLBModelLoader
