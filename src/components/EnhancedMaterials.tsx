'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// Enhanced material properties with proper PBR support
export interface EnhancedMaterialProps {
  // Basic properties
  color?: string
  
  // PBR Texture maps
  albedoMap?: string
  normalMap?: string
  roughnessMap?: string
  metallicMap?: string
  aoMap?: string
  emissiveMap?: string
  heightMap?: string
  
  // Material properties
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  normalScale?: [number, number]
  aoIntensity?: number
  
  // Texture properties
  textureRepeat?: [number, number]
  textureRotation?: number
  
  // Advanced properties
  clearcoat?: number
  clearcoatRoughness?: number
  transmission?: number
  thickness?: number
  ior?: number
  
  // Performance options
  anisotropy?: number
  generateMipmaps?: boolean
  flipY?: boolean
}

// Procedural texture generators for high-quality materials
export class ProceduralTextureGenerator {
  static createWallTexture(
    color: string, 
    size = 1024,
    bumpIntensity = 0.02,
    roughnessVariation = 0.1
  ): {
    albedo: THREE.Texture
    normal: THREE.Texture
    roughness: THREE.Texture
  } {
    // Create canvases for different maps
    const albedoCanvas = document.createElement('canvas')
    const normalCanvas = document.createElement('canvas')
    const roughnessCanvas = document.createElement('canvas')
    
    albedoCanvas.width = normalCanvas.width = roughnessCanvas.width = size
    albedoCanvas.height = normalCanvas.height = roughnessCanvas.height = size
    
    const albedoCtx = albedoCanvas.getContext('2d')!
    const normalCtx = normalCanvas.getContext('2d')!
    const roughnessCtx = roughnessCanvas.getContext('2d')!
    
    // Parse base color
    const baseColor = new THREE.Color(color)
    const baseR = Math.floor(baseColor.r * 255)
    const baseG = Math.floor(baseColor.g * 255)
    const baseB = Math.floor(baseColor.b * 255)
    
    // Create image data
    const albedoData = albedoCtx.createImageData(size, size)
    const normalData = normalCtx.createImageData(size, size)
    const roughnessData = roughnessCtx.createImageData(size, size)
    
    // Generate sophisticated wall texture with paint imperfections
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        
        // Paint texture variations
        const paintNoise = (Math.random() - 0.5) * 0.08
        const rollerMarks = Math.sin(x * 0.02) * 0.03
        const paintStreaks = Math.sin(y * 0.01) * 0.02
        const surfaceImperfections = (Math.random() - 0.5) * 0.05
        
        // Subtle wear patterns
        const wearX = x / size - 0.5
        const wearY = y / size - 0.5
        const edgeWear = Math.max(0, 1 - Math.sqrt(wearX * wearX + wearY * wearY) * 2) * 0.1
        
        // Combine all variations
        const colorVariation = paintNoise + rollerMarks + paintStreaks + surfaceImperfections + edgeWear
        
        // Apply to albedo
        albedoData.data[i] = Math.max(0, Math.min(255, baseR + colorVariation * 40))
        albedoData.data[i + 1] = Math.max(0, Math.min(255, baseG + colorVariation * 35))
        albedoData.data[i + 2] = Math.max(0, Math.min(255, baseB + colorVariation * 30))
        albedoData.data[i + 3] = 255
        
        // Generate normal map from surface variations
        const normalIntensity = (rollerMarks + paintStreaks) * bumpIntensity + 0.5
        const normalValue = Math.max(0, Math.min(1, normalIntensity)) * 255
        
        normalData.data[i] = normalValue
        normalData.data[i + 1] = normalValue
        normalData.data[i + 2] = 255
        normalData.data[i + 3] = 255
        
        // Create roughness variation (smoother in paint areas, rougher in worn areas)
        const roughnessVariationValue = Math.max(0, Math.min(1, 
          0.3 + colorVariation * roughnessVariation + edgeWear * 0.4
        )) * 255
        
        roughnessData.data[i] = roughnessVariationValue
        roughnessData.data[i + 1] = roughnessVariationValue
        roughnessData.data[i + 2] = roughnessVariationValue
        roughnessData.data[i + 3] = 255
      }
    }
    
    // Put image data on canvases
    albedoCtx.putImageData(albedoData, 0, 0)
    normalCtx.putImageData(normalData, 0, 0)
    roughnessCtx.putImageData(roughnessData, 0, 0)
    
    // Create textures
    const albedoTexture = new THREE.CanvasTexture(albedoCanvas)
    const normalTexture = new THREE.CanvasTexture(normalCanvas)
    const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas)
    
    // Configure texture properties
    const textures = [albedoTexture, normalTexture, roughnessTexture]
    textures.forEach(texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipMapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.flipY = false
    })
    
    return { albedo: albedoTexture, normal: normalTexture, roughness: roughnessTexture }
  }
  
  static createMetalTexture(
    color: string,
    size = 1024,
    scratchIntensity = 0.3,
    oxidationLevel = 0.1
  ): {
    albedo: THREE.Texture
    normal: THREE.Texture
    roughness: THREE.Texture
    metallic: THREE.Texture
  } {
    const albedoCanvas = document.createElement('canvas')
    const normalCanvas = document.createElement('canvas')
    const roughnessCanvas = document.createElement('canvas')
    const metallicCanvas = document.createElement('canvas')
    
    const canvases = [albedoCanvas, normalCanvas, roughnessCanvas, metallicCanvas]
    canvases.forEach(canvas => {
      canvas.width = size
      canvas.height = size
    })
    
    const contexts = canvases.map(canvas => canvas.getContext('2d')!)
    const [albedoCtx, normalCtx, roughnessCtx, metallicCtx] = contexts
    
    // Parse base metal color
    const baseColor = new THREE.Color(color)
    const baseR = Math.floor(baseColor.r * 255)
    const baseG = Math.floor(baseColor.g * 255)
    const baseB = Math.floor(baseColor.b * 255)
    
    // Create image data
    const imageDataArrays = contexts.map(ctx => ctx.createImageData(size, size))
    const [albedoData, normalData, roughnessData, metallicData] = imageDataArrays
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        
        // Metal surface details
        const brushedMetal = Math.sin(x * 0.1) * 0.1 // Brushed finish
        const scratches = (Math.random() < 0.02) ? Math.random() * scratchIntensity : 0
        const oxidation = Math.random() * oxidationLevel
        const fingerprints = Math.sin(x * 0.05) * Math.cos(y * 0.07) * 0.05
        
        // Combine surface effects
        const surfaceVariation = brushedMetal + scratches + fingerprints
        const corrosionEffect = oxidation
        
        // Albedo with metal coloration and oxidation
        albedoData.data[i] = Math.max(0, Math.min(255, baseR + surfaceVariation * 30 - corrosionEffect * 50))
        albedoData.data[i + 1] = Math.max(0, Math.min(255, baseG + surfaceVariation * 25 - corrosionEffect * 30))
        albedoData.data[i + 2] = Math.max(0, Math.min(255, baseB + surfaceVariation * 20 - corrosionEffect * 20))
        albedoData.data[i + 3] = 255
        
        // Normal map from scratches and brushed finish
        const normalIntensity = (brushedMetal + scratches) * 0.5 + 0.5
        const normalValue = Math.max(0, Math.min(1, normalIntensity)) * 255
        
        normalData.data[i] = normalValue
        normalData.data[i + 1] = normalValue
        normalData.data[i + 2] = 255
        normalData.data[i + 3] = 255
        
        // Roughness variation (scratches are rougher, polished areas smoother)
        const roughnessValue = Math.max(0, Math.min(1, 
          0.1 + scratches * 0.7 + corrosionEffect * 0.5 + fingerprints * 0.2
        )) * 255
        
        roughnessData.data[i] = roughnessValue
        roughnessData.data[i + 1] = roughnessValue
        roughnessData.data[i + 2] = roughnessValue
        roughnessData.data[i + 3] = 255
        
        // Metallic map (less metallic where oxidized)
        const metallicValue = Math.max(0, Math.min(1, 0.95 - corrosionEffect * 0.8)) * 255
        
        metallicData.data[i] = metallicValue
        metallicData.data[i + 1] = metallicValue
        metallicData.data[i + 2] = metallicValue
        metallicData.data[i + 3] = 255
      }
    }
    
    // Put image data and create textures
    contexts.forEach((ctx, idx) => ctx.putImageData(imageDataArrays[idx], 0, 0))
    
    const textures = canvases.map(canvas => new THREE.CanvasTexture(canvas))
    textures.forEach(texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipMapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.flipY = false
    })
    
    return { 
      albedo: textures[0], 
      normal: textures[1], 
      roughness: textures[2], 
      metallic: textures[3] 
    }
  }
}

// Enhanced Material Component
export function EnhancedMaterial({ 
  color = '#ffffff',
  albedoMap,
  normalMap,
  roughnessMap,
  metallicMap,
  aoMap,
  emissiveMap,
  heightMap,
  roughness = 0.5,
  metalness = 0,
  emissive = '#000000',
  emissiveIntensity = 0,
  normalScale = [1, 1],
  aoIntensity = 1,
  textureRepeat = [1, 1],
  textureRotation = 0,
  clearcoat = 0,
  clearcoatRoughness = 0,
  transmission = 0,
  thickness = 0,
  ior = 1.5,
  anisotropy = 1,
  generateMipmaps = true,
  flipY = false
}: EnhancedMaterialProps) {
  
  // Load textures if provided without passing nulls
  const texturePaths: Record<string, string> = {}
  if (albedoMap) texturePaths.albedo = albedoMap
  if (normalMap) texturePaths.normal = normalMap
  if (roughnessMap) texturePaths.roughness = roughnessMap
  if (metallicMap) texturePaths.metallic = metallicMap
  if (aoMap) texturePaths.ao = aoMap
  if (emissiveMap) texturePaths.emissive = emissiveMap
  if (heightMap) texturePaths.height = heightMap
  
  const textures = useTexture(texturePaths) as Partial<Record<string, THREE.Texture>>
  
  // Configure loaded textures
  useEffect(() => {
    Object.values(textures).forEach((texture) => {
      if (texture instanceof THREE.Texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(textureRepeat[0], textureRepeat[1])
        texture.rotation = textureRotation
        texture.anisotropy = anisotropy
        texture.generateMipmaps = generateMipmaps
        texture.flipY = flipY
      }
    })
  }, [textures, textureRepeat, textureRotation, anisotropy, generateMipmaps, flipY])
  
  return (
    <meshPhysicalMaterial
      color={color}
      map={textures.albedo}
      normalMap={textures.normal}
      normalScale={new THREE.Vector2(normalScale[0], normalScale[1])}
      roughnessMap={textures.roughness}
      roughness={roughness}
      metalnessMap={textures.metallic}
      metalness={metalness}
      aoMap={textures.ao}
      aoMapIntensity={aoIntensity}
      emissiveMap={textures.emissive}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      displacementMap={textures.height}
      displacementScale={0.1}
      clearcoat={clearcoat}
      clearcoatRoughness={clearcoatRoughness}
      transmission={transmission}
      thickness={thickness}
      ior={ior}
      envMapIntensity={1}
      dithering={true}
    />
  )
}

// Preset materials for common room elements
export const materialPresets = {
  wall: (color: string) => ({
    color,
    roughness: 0.8,
    metalness: 0,
    normalScale: [0.3, 0.3] as [number, number]
  }),
  
  metalHandle: (color: string) => ({
    color,
    roughness: 0.2,
    metalness: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    normalScale: [0.5, 0.5] as [number, number]
  }),
  
  glass: (color: string, opacity = 0.3) => ({
    color,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.5,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  }),
  
  plastic: (color: string) => ({
    color,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    normalScale: [0.2, 0.2] as [number, number]
  }),
  
  fabric: (color: string) => ({
    color,
    roughness: 0.9,
    metalness: 0,
    normalScale: [1.2, 1.2] as [number, number]
  }),
  
  woodPolished: (color: string) => ({
    color,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    normalScale: [0.4, 0.4] as [number, number]
  }),
  
  woodMatte: (color: string) => ({
    color,
    roughness: 0.7,
    metalness: 0,
    normalScale: [0.6, 0.6] as [number, number]
  })
}

// Enhanced material hook with automatic quality adjustment
export function useEnhancedMaterial(
  materialType: keyof typeof materialPresets,
  color: string,
  customProps?: Partial<EnhancedMaterialProps>
) {
  return useMemo(() => {
    const preset = materialPresets[materialType](color)
    return { ...preset, ...customProps }
  }, [materialType, color, customProps])
}

export default EnhancedMaterial
