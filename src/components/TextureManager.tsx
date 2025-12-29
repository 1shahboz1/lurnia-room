'use client'

import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { useThree, useLoader } from '@react-three/fiber'
import { TextureLoader, Texture, LinearFilter, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import * as THREE from 'three'

// Texture formats supported by the system
export type TextureFormat = 'ktx2' | 'webp' | 'jpg' | 'png'
export type TextureType = 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'emissive' | 'height'

// Texture quality presets
export type TextureQuality = 'ultra' | 'high' | 'medium' | 'low'

interface TextureConfig {
  maxSize: number
  format: TextureFormat
  compression: boolean
  mipMaps: boolean
  anisotropicFiltering: number
}

const textureQualityPresets: Record<TextureQuality, TextureConfig> = {
  ultra: {
    maxSize: 4096,
    format: 'ktx2',
    compression: true,
    mipMaps: true,
    anisotropicFiltering: 16
  },
  high: {
    maxSize: 2048,
    format: 'ktx2',
    compression: true,
    mipMaps: true,
    anisotropicFiltering: 8
  },
  medium: {
    maxSize: 1024,
    format: 'webp',
    compression: true,
    mipMaps: true,
    anisotropicFiltering: 4
  },
  low: {
    maxSize: 512,
    format: 'jpg',
    compression: false,
    mipMaps: false,
    anisotropicFiltering: 1
  }
}

// Texture cache for memory management
class TextureCache {
  private cache = new Map<string, Texture>()
  private usage = new Map<string, number>()
  private maxCacheSize = 100
  
  get(key: string): Texture | undefined {
    const texture = this.cache.get(key)
    if (texture) {
      this.usage.set(key, Date.now())
    }
    return texture
  }
  
  set(key: string, texture: Texture): void {
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed()
    }
    this.cache.set(key, texture)
    this.usage.set(key, Date.now())
  }
  
  has(key: string): boolean {
    return this.cache.has(key)
  }
  
  clear(): void {
    // Dispose of all textures
    this.cache.forEach(texture => texture.dispose())
    this.cache.clear()
    this.usage.clear()
  }
  
  private evictLeastRecentlyUsed(): void {
    let oldestTime = Date.now()
    let oldestKey = ''
    
    this.usage.forEach((time, key) => {
      if (time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    })
    
    if (oldestKey) {
      const texture = this.cache.get(oldestKey)
      if (texture) {
        texture.dispose()
      }
      this.cache.delete(oldestKey)
      this.usage.delete(oldestKey)
    }
  }
  
  getStats() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      memoryUsage: this.cache.size * 4 * 1024 * 1024 // Rough estimate
    }
  }
}

// Global texture cache instance
const textureCache = new TextureCache()

// Texture atlas for combining multiple textures
class TextureAtlas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private atlasTexture: Texture | null = null
  private regions = new Map<string, { x: number, y: number, width: number, height: number }>()
  private currentX = 0
  private currentY = 0
  private rowHeight = 0
  private atlasSize = 2048
  
  constructor(size = 2048) {
    this.atlasSize = size
    this.canvas = document.createElement('canvas')
    this.canvas.width = size
    this.canvas.height = size
    this.ctx = this.canvas.getContext('2d')!
  }
  
  async addTexture(key: string, imagePath: string, width: number, height: number): Promise<boolean> {
    // Check if texture fits in current row
    if (this.currentX + width > this.atlasSize) {
      // Move to next row
      this.currentX = 0
      this.currentY += this.rowHeight
      this.rowHeight = 0
    }
    
    // Check if texture fits in atlas
    if (this.currentY + height > this.atlasSize) {
      return false // Atlas full
    }
    
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      return new Promise((resolve) => {
        img.onload = () => {
          // Draw image to atlas
          this.ctx.drawImage(img, this.currentX, this.currentY, width, height)
          
          // Store region info
          this.regions.set(key, {
            x: this.currentX / this.atlasSize,
            y: this.currentY / this.atlasSize,
            width: width / this.atlasSize,
            height: height / this.atlasSize
          })
          
          // Update position
          this.currentX += width
          this.rowHeight = Math.max(this.rowHeight, height)
          
          resolve(true)
        }
        
        img.onerror = () => resolve(false)
        img.src = imagePath
      })
    } catch (error) {
      console.error('Error adding texture to atlas:', error)
      return false
    }
  }
  
  getTexture(): Texture {
    if (!this.atlasTexture) {
      this.atlasTexture = new TextureLoader().load(this.canvas.toDataURL())
      this.atlasTexture.colorSpace = SRGBColorSpace
      this.atlasTexture.generateMipmaps = true
      this.atlasTexture.wrapS = RepeatWrapping
      this.atlasTexture.wrapT = RepeatWrapping
    }
    return this.atlasTexture
  }
  
  getRegion(key: string) {
    return this.regions.get(key)
  }
  
  dispose() {
    if (this.atlasTexture) {
      this.atlasTexture.dispose()
    }
  }
}

// Enhanced texture loader with format detection and optimization
export function useOptimizedTexture(
  path: string,
  type: TextureType = 'albedo',
  quality: TextureQuality = 'medium'
): Texture | null {
  const { gl } = useThree()
  const config = textureQualityPresets[quality]
  
  // Generate cache key
  const cacheKey = `${path}_${type}_${quality}`
  
  // Check cache first
  const cachedTexture = useMemo(() => {
    return textureCache.get(cacheKey)
  }, [cacheKey])
  
  // Always call useLoader, but we'll handle the cached texture in the memo below
  const texture = useLoader(
    TextureLoader,
    path,
    (loader) => {
      // Configure loader based on format
      if (config.format === 'ktx2') {
        const ktx2Loader = new KTX2Loader()
        ktx2Loader.setTranscoderPath('/basis/')
        ktx2Loader.detectSupport(gl)
      }
    }
  )
  
  const optimizedTexture = useMemo(() => {
    if (cachedTexture) return cachedTexture
    if (!texture) return null
    
    // Configure texture based on type and quality
    const optimized = texture.clone()
    
    // Set color space based on texture type
    if (type === 'albedo' || type === 'emissive') {
      optimized.colorSpace = SRGBColorSpace
    } else {
      optimized.colorSpace = LinearSRGBColorSpace
    }
    
    // Configure filtering
    if (config.mipMaps) {
      optimized.generateMipmaps = true
      optimized.minFilter = LinearFilter
    } else {
      optimized.generateMipmaps = false
      optimized.minFilter = LinearFilter
    }
    
    // Set anisotropic filtering if supported
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy()
    optimized.anisotropy = Math.min(config.anisotropicFiltering, maxAnisotropy)
    
    // Configure wrapping
    optimized.wrapS = RepeatWrapping
    optimized.wrapT = RepeatWrapping
    
    // Store in cache
    textureCache.set(cacheKey, optimized)
    
    return optimized
  }, [texture, cachedTexture, type, quality, gl, cacheKey, config])
  
  return optimizedTexture
}

// Batch texture loader for multiple textures
export function useBatchTextureLoader(
  textures: Array<{ path: string, type: TextureType, quality?: TextureQuality }>,
  onProgress?: (loaded: number, total: number) => void
): Record<string, Texture> {
  const loadedTextures = useRef<Record<string, Texture>>({})
  const [loadCount, setLoadCount] = useState(0)
  
  useEffect(() => {
    const loadTextures = async () => {
      const total = textures.length
      let loaded = 0
      
      for (const { path, type, quality = 'medium' } of textures) {
        try {
          const texture = await new Promise<Texture>((resolve, reject) => {
            new TextureLoader().load(
              path,
              resolve,
              undefined,
              reject
            )
          })
          
          loadedTextures.current[path] = texture
          loaded++
          setLoadCount(loaded)
          onProgress?.(loaded, total)
        } catch (error) {
          console.error(`Failed to load texture: ${path}`, error)
          loaded++
          setLoadCount(loaded)
          onProgress?.(loaded, total)
        }
      }
    }
    
    loadTextures()
  }, [textures, onProgress])
  
  return loadedTextures.current
}

// Texture compression utilities
export const TextureUtils = {
  // Convert texture to WebP format (client-side)
  async convertToWebP(texture: Texture, quality = 0.8): Promise<Blob> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    canvas.width = texture.image.width
    canvas.height = texture.image.height
    
    ctx.drawImage(texture.image, 0, 0)
    
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert texture to WebP'))
        }
      }, 'image/webp', quality)
    })
  },
  
  // Resize texture to target size
  resizeTexture(texture: Texture, targetSize: number): Texture {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    canvas.width = targetSize
    canvas.height = targetSize
    
    ctx.drawImage(texture.image, 0, 0, targetSize, targetSize)
    
    const resizedTexture = new Texture(canvas)
    resizedTexture.colorSpace = texture.colorSpace
    resizedTexture.needsUpdate = true
    
    return resizedTexture
  },
  
  // Generate texture mipmaps manually
  generateMipmaps(texture: Texture): Texture[] {
    const mipmaps: Texture[] = [texture]
    let currentSize = Math.max(texture.image.width, texture.image.height)
    
    while (currentSize > 1) {
      currentSize = Math.floor(currentSize / 2)
      const mipmap = this.resizeTexture(texture, currentSize)
      mipmaps.push(mipmap)
    }
    
    return mipmaps
  }
}

// Texture manager component
export function TextureManager({ 
  quality = 'medium',
  enableAtlas = true,
  children 
}: { 
  quality?: TextureQuality
  enableAtlas?: boolean
  children: React.ReactNode 
}) {
  const atlas = useRef<TextureAtlas | null>(null)
  
  useEffect(() => {
    if (enableAtlas) {
      atlas.current = new TextureAtlas(2048)
    }
    
    return () => {
      if (atlas.current) {
        atlas.current.dispose()
      }
    }
  }, [enableAtlas])
  
  // Provide texture management context
  const contextValue = useMemo(() => ({
    quality,
    atlas: atlas.current,
    cache: textureCache
  }), [quality])
  
  return <>{children}</>
}

// Performance monitoring for texture system
export function useTextureStats() {
  const [stats, setStats] = useState({
    cacheSize: 0,
    memoryUsage: 0,
    maxCacheSize: 0
  })
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(textureCache.getStats())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  return stats
}

// Texture preloader for critical textures
export function useTexturePreloader(texturePaths: string[], quality: TextureQuality = 'medium') {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    const preloadTextures = async () => {
      const total = texturePaths.length
      let loadedCount = 0
      
      for (const path of texturePaths) {
        const cacheKey = `${path}_albedo_${quality}`
        
        if (!textureCache.has(cacheKey)) {
          try {
            const texture = await new Promise<Texture>((resolve, reject) => {
              new TextureLoader().load(path, resolve, undefined, reject)
            })
            textureCache.set(cacheKey, texture)
          } catch (error) {
            console.warn(`Failed to preload texture: ${path}`)
          }
        }
        
        loadedCount++
        setProgress(loadedCount / total)
      }
      
      setLoaded(true)
    }
    
    preloadTextures()
  }, [texturePaths, quality])
  
  return { loaded, progress }
}

// Global stats exposure for performance monitoring
export function useTextureManagerGlobalStats() {
  useEffect(() => {
    // Expose texture manager stats globally (client-side only)
    if (typeof window !== 'undefined') {
      ;(window as Window & { __textureManager?: { getStats: () => Record<string, number> } }).__textureManager = {
        getStats: () => {
          const cacheStats = textureCache.getStats()
          const stats = {
            totalTextures: cacheStats.cacheSize,
            totalMemoryBytes: 0,
            compressedTextures: 0,
            largeTextures: 0,
            atlasedTextures: 0, // We'll need to track this separately
            cachedTextures: cacheStats.cacheSize,
            averageSize: 0
          }
          
          const totalBytes = 0
          const totalSize = 0
          
          // Use estimated values since we can't access the private cache directly
          stats.totalMemoryBytes = cacheStats.memoryUsage
          stats.averageSize = stats.totalTextures > 0 ? 512 : 0 // Estimated average
          
          return stats
        }
      }
    }
  }, [])
}

export default TextureManager
