'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { QualityPreset, QualityConfig } from './QualityEnhancer'

interface PerformanceMetrics {
  fps: number
  frameTime: number
  memoryUsed: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

interface TextureStats {
  totalTextures: number
  totalMemoryMB: number
  compressedTextures: number
  largeTextures: number
  atlasedTextures: number
  cachedTextures: number
  averageSize: number
}

interface LODStats {
  activeLODLevel: number
  culledObjects: number
  visibleObjects: number
  instancedMeshes: number
  batchedGeometries: number
}

// Internal hook for collecting performance stats inside Canvas
function useInternalPerformanceStats(onStatsUpdate: (stats: PerformanceMetrics) => void) {
  const { gl } = useThree()
  const frameCount = useRef(0)
  const lastTime = useRef(performance.now())
  const frameStartTime = useRef(performance.now())

  useFrame(() => {
    const currentTime = performance.now()
    const frameDuration = currentTime - frameStartTime.current
    frameStartTime.current = currentTime

    frameCount.current++

    // Update FPS every second
    if (currentTime - lastTime.current >= 1000) {
      const fps = Math.round(frameCount.current * 1000 / (currentTime - lastTime.current))
      
      // Gather renderer info
      const info = gl.info
      const memory = info.memory
      const render = info.render
      
      const metrics = {
        fps,
        frameTime: Math.round(frameDuration * 100) / 100,
        memoryUsed: memory.geometries + memory.textures,
        drawCalls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
        programs: (memory as typeof memory & { programs?: number }).programs || 0
      }
      
      onStatsUpdate(metrics)

      frameCount.current = 0
      lastTime.current = currentTime
    }
  })
}

// Component to collect stats from inside Canvas and expose globally
export function PerformanceStatsCollector() {
  const handleStatsUpdate = useCallback((metrics: PerformanceMetrics) => {
    // Store metrics globally so the HUD can access them (client-side only)
    if (typeof window !== 'undefined') {
      ;(window as Window & { __performanceMetrics?: PerformanceMetrics }).__performanceMetrics = metrics
    }
  }, [])

  useInternalPerformanceStats(handleStatsUpdate)
  return null
}

// Hook to get performance stats from global storage (works outside Canvas)
export function usePerformanceStats() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    frameTime: 16.67,
    memoryUsed: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0
  })
  const [textureStats, setTextureStats] = useState<TextureStats>({
    totalTextures: 0,
    totalMemoryMB: 0,
    compressedTextures: 0,
    largeTextures: 0,
    atlasedTextures: 0,
    cachedTextures: 0,
    averageSize: 0
  })
  const [lodStats, setLODStats] = useState<LODStats>({
    activeLODLevel: 0,
    culledObjects: 0,
    visibleObjects: 0,
    instancedMeshes: 0,
    batchedGeometries: 0
  })

  useEffect(() => {
    const interval = setInterval(() => {
      // Only access window on client side
      if (typeof window !== 'undefined') {
        // Get metrics from global storage
        const globalMetrics = (window as Window & { __performanceMetrics?: PerformanceMetrics }).__performanceMetrics
        if (globalMetrics) {
          setMetrics(globalMetrics)
        }

        // Calculate texture statistics
        const textureManager = (window as Window & { __textureManager?: { getStats?: () => Record<string, number> } }).__textureManager
        if (textureManager) {
          const textures = textureManager.getStats?.() || {}
          setTextureStats({
            totalTextures: textures.totalTextures || 0,
            totalMemoryMB: Math.round((textures.totalMemoryBytes || 0) / (1024 * 1024) * 100) / 100,
            compressedTextures: textures.compressedTextures || 0,
            largeTextures: textures.largeTextures || 0,
            atlasedTextures: textures.atlasedTextures || 0,
            cachedTextures: textures.cachedTextures || 0,
            averageSize: textures.averageSize || 0
          })
        }

        // Calculate LOD statistics
        const performanceOptimizer = (window as Window & { __performanceOptimizer?: { getStats?: () => Record<string, number> } }).__performanceOptimizer
        if (performanceOptimizer) {
          const lodData = performanceOptimizer.getStats?.() || {}
          setLODStats({
            activeLODLevel: lodData.activeLODLevel || 0,
            culledObjects: lodData.culledObjects || 0,
            visibleObjects: lodData.visibleObjects || 0,
            instancedMeshes: lodData.instancedMeshes || 0,
            batchedGeometries: lodData.batchedGeometries || 0
          })
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return { metrics, textureStats, lodStats }
}

export function PerformanceStatsHUD({
  preset,
  config,
  showDetailedStats = false,
  position = 'top-left'
}: {
  preset: QualityPreset
  config: QualityConfig
  showDetailedStats?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}) {
  const { metrics, textureStats, lodStats } = usePerformanceStats()
  const [expanded, setExpanded] = useState(false)

  if (process.env.NODE_ENV !== 'development') return null

  const getPositionStyles = () => {
    const base = {
      position: 'absolute' as const,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '12px',
      fontSize: '11px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.1)',
      minWidth: expanded ? '280px' : '180px',
      maxWidth: '320px',
      transition: 'all 0.2s ease'
    }

    switch (position) {
      case 'top-right':
        return { ...base, top: '10px', right: '10px' }
      case 'bottom-left':
        return { ...base, bottom: '10px', left: '10px' }
      case 'bottom-right':
        return { ...base, bottom: '10px', right: '10px' }
      default:
        return { ...base, top: '10px', left: '10px' }
    }
  }

  const getFpsColor = (fps: number) => {
    if (fps >= 60) return '#4ade80' // green
    if (fps >= 30) return '#fbbf24' // yellow
    return '#f87171' // red
  }

  const getMemoryColor = (mb: number) => {
    if (mb < 100) return '#4ade80'
    if (mb < 250) return '#fbbf24'
    return '#f87171'
  }

  return (
    <div style={getPositionStyles()}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        paddingBottom: '6px'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
          PERFORMANCE
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '10px',
            opacity: 0.7,
            padding: '2px 6px',
            borderRadius: '3px',
            transition: 'opacity 0.2s ease'
          }}
          onMouseEnter={(e) => (e.target as HTMLElement).style.opacity = '1'}
          onMouseLeave={(e) => (e.target as HTMLElement).style.opacity = '0.7'}
        >
          {expanded ? '◀' : '▶'}
        </button>
      </div>

      {/* Core Stats */}
      <div style={{ marginBottom: expanded ? '8px' : '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>Quality:</span>
          <span style={{ color: '#60a5fa' }}>{preset.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>FPS:</span>
          <span style={{ color: getFpsColor(metrics.fps), fontWeight: 'bold' }}>
            {metrics.fps}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>Frame Time:</span>
          <span>{metrics.frameTime}ms</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Draw Calls:</span>
          <span>{metrics.drawCalls}</span>
        </div>
      </div>

      {/* Expanded Stats */}
      {expanded && (
        <>
          {/* Rendering Stats */}
          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.1)', 
            paddingTop: '8px', 
            marginBottom: '8px' 
          }}>
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '4px' }}>RENDERING</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Triangles:</span>
              <span>{metrics.triangles.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Geometries:</span>
              <span>{metrics.geometries}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Programs:</span>
              <span>{metrics.programs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pixel Ratio:</span>
              <span>{config.pixelRatio}x</span>
            </div>
          </div>

          {/* Effects Status */}
          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.1)', 
            paddingTop: '8px', 
            marginBottom: '8px' 
          }}>
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '4px' }}>EFFECTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              <span>Bloom: {config.enableBloom ? '✓' : '✗'}</span>
              <span>SSAO: {config.enableSSAO ? '✓' : '✗'}</span>
              <span>Shadows: {config.enableShadows ? '✓' : '✗'}</span>
              <span>AA: {config.enableAntiAliasing ? '✓' : '✗'}</span>
            </div>
          </div>

          {/* Texture Stats */}
          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.1)', 
            paddingTop: '8px', 
            marginBottom: '8px' 
          }}>
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '4px' }}>TEXTURES</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Total:</span>
              <span>{textureStats.totalTextures}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Memory:</span>
              <span style={{ color: getMemoryColor(textureStats.totalMemoryMB) }}>
                {textureStats.totalMemoryMB}MB
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Compressed:</span>
              <span>{textureStats.compressedTextures}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cached:</span>
              <span>{textureStats.cachedTextures}</span>
            </div>
          </div>

          {/* LOD Stats */}
          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.1)', 
            paddingTop: '8px' 
          }}>
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '4px' }}>OPTIMIZATION</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>LOD Level:</span>
              <span>{lodStats.activeLODLevel}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Visible:</span>
              <span>{lodStats.visibleObjects}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>Culled:</span>
              <span>{lodStats.culledObjects}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Instanced:</span>
              <span>{lodStats.instancedMeshes}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default PerformanceStatsHUD
