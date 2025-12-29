'use client'

import { useMemo, useState } from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { 
  EffectComposer, 
  Bloom, 
  SSAO, 
  ToneMapping,
  Noise,
  ChromaticAberration,
  Vignette
} from '@react-three/postprocessing'
import { 
  BlendFunction, 
  ToneMappingMode,
  SMAAPreset 
} from 'postprocessing'
import * as THREE from 'three'

// Quality presets for different performance levels
export type QualityPreset = 'ultra' | 'high' | 'medium' | 'low' | 'potato'

export interface QualityConfig {
  // Post-processing
  enableBloom: boolean
  enableSSAO: boolean
  enableToneMapping: boolean
  enableChromaticAberration: boolean
  enableVignette: boolean
  enableNoise: boolean
  
  // Bloom settings
  bloomIntensity: number
  bloomLuminanceThreshold: number
  bloomLuminanceSmoothing: number
  
  // SSAO settings
  ssaoIntensity: number
  ssaoRadius: number
  ssaoSamples: number
  
  // Tone mapping
  toneMappingMode: ToneMappingMode
  toneMappingExposure: number
  toneMappingWhitePoint: number
  
  // Effects
  chromaticAberrationOffset: number
  vignetteIntensity: number
  noiseIntensity: number
  
  // Performance
  shadowMapSize: number
  enableShadows: boolean
  enableAntiAliasing: boolean
  pixelRatio: number
}

const qualityPresets: Record<QualityPreset, QualityConfig> = {
  ultra: {
    enableBloom: true,
    enableSSAO: true,
    enableToneMapping: true,
    enableChromaticAberration: true,
    enableVignette: true,
    enableNoise: true,
    
    bloomIntensity: 1.5,
    bloomLuminanceThreshold: 0.9,
    bloomLuminanceSmoothing: 0.6,
    
    ssaoIntensity: 1.0,
    ssaoRadius: 0.2,
    ssaoSamples: 32,
    
    toneMappingMode: ToneMappingMode.ACES_FILMIC,
    toneMappingExposure: 1.4,
    toneMappingWhitePoint: 1.0,
    
    chromaticAberrationOffset: 0.0015,
    vignetteIntensity: 0.25,
    noiseIntensity: 0.3,
    
    shadowMapSize: 2048,
    enableShadows: true,
    enableAntiAliasing: true,
    pixelRatio: 1.0
  },
  high: {
    enableBloom: true,
    enableSSAO: true,
    enableToneMapping: true,
    enableChromaticAberration: false,
    enableVignette: true,
    enableNoise: false,
    
    bloomIntensity: 1.2,
    bloomLuminanceThreshold: 1.0,
    bloomLuminanceSmoothing: 0.5,
    
    ssaoIntensity: 0.8,
    ssaoRadius: 0.18,
    ssaoSamples: 24,
    
    toneMappingMode: ToneMappingMode.ACES_FILMIC,
    toneMappingExposure: 1.4,
    toneMappingWhitePoint: 1.0,
    
    chromaticAberrationOffset: 0,
    vignetteIntensity: 0.2,
    noiseIntensity: 0,
    
    shadowMapSize: 1024,
    enableShadows: true,
    enableAntiAliasing: true,
    pixelRatio: 1.0
  },
  medium: {
    enableBloom: true,
    enableSSAO: false,
    enableToneMapping: true,
    enableChromaticAberration: false,
    enableVignette: false,
    enableNoise: false,
    
    bloomIntensity: 0.8,
    bloomLuminanceThreshold: 1.1,
    bloomLuminanceSmoothing: 0.4,
    
    ssaoIntensity: 0,
    ssaoRadius: 0,
    ssaoSamples: 0,
    
    toneMappingMode: ToneMappingMode.ACES_FILMIC,
    toneMappingExposure: 1.4,
    toneMappingWhitePoint: 1.0,
    
    chromaticAberrationOffset: 0,
    vignetteIntensity: 0,
    noiseIntensity: 0,
    
    shadowMapSize: 512,
    enableShadows: false,
    enableAntiAliasing: false,
    pixelRatio: 0.8
  },
  low: {
    enableBloom: false,
    enableSSAO: false,
    enableToneMapping: true,
    enableChromaticAberration: false,
    enableVignette: false,
    enableNoise: false,
    
    bloomIntensity: 0,
    bloomLuminanceThreshold: 1,
    bloomLuminanceSmoothing: 0,
    
    ssaoIntensity: 0,
    ssaoRadius: 0,
    ssaoSamples: 0,
    
    toneMappingMode: ToneMappingMode.LINEAR,
    toneMappingExposure: 1.4,
    toneMappingWhitePoint: 1.0,
    
    chromaticAberrationOffset: 0,
    vignetteIntensity: 0,
    noiseIntensity: 0,
    
    shadowMapSize: 256,
    enableShadows: false,
    enableAntiAliasing: false,
    pixelRatio: 0.6
  },
  potato: {
    // No post-processing effects for maximum performance
    enableBloom: false,
    enableSSAO: false,
    enableToneMapping: false,
    enableChromaticAberration: false,
    enableVignette: false,
    enableNoise: false,
    
    // All effects disabled
    bloomIntensity: 0,
    bloomLuminanceThreshold: 1,
    bloomLuminanceSmoothing: 0,
    
    ssaoIntensity: 0,
    ssaoRadius: 0,
    ssaoSamples: 0,
    
    toneMappingMode: ToneMappingMode.LINEAR,
    toneMappingExposure: 1.4,
    toneMappingWhitePoint: 1.0,
    
    chromaticAberrationOffset: 0,
    vignetteIntensity: 0,
    noiseIntensity: 0,
    
    // Minimal performance settings
    shadowMapSize: 256,
    enableShadows: false,
    enableAntiAliasing: false,
    pixelRatio: 0.5
  }
}

// Convert post-processing ToneMappingMode to THREE.js ToneMapping
function convertToneMappingMode(mode: ToneMappingMode): number {
  switch (mode) {
    case ToneMappingMode.ACES_FILMIC:
      return THREE.ACESFilmicToneMapping
    case ToneMappingMode.REINHARD2:
      return THREE.ReinhardToneMapping
    case ToneMappingMode.LINEAR:
      return THREE.LinearToneMapping
    default:
      return THREE.ACESFilmicToneMapping
  }
}

// Performance monitor hook
export function usePerformanceMonitor() {
  const [fps, setFps] = useState(60)
  const [frameTime, setFrameTime] = useState(16.67)
  
  let frameCount = 0
  let lastTime = performance.now()
  let frameStartTime = performance.now()
  
  useFrame(() => {
    const currentTime = performance.now()
    const frameDuration = currentTime - frameStartTime
    frameStartTime = currentTime
    
    frameCount++
    
    if (currentTime - lastTime >= 1000) {
      const newFps = Math.round(frameCount * 1000 / (currentTime - lastTime))
      setFps(newFps)
      setFrameTime(Math.round(frameDuration * 100) / 100)
      frameCount = 0
      lastTime = currentTime
    }
  })
  
  return { fps, frameTime }
}

// Simplified - always use potato quality
export function useAdaptiveQuality(targetFps = 60) {
  const { fps } = usePerformanceMonitor()
  const [currentPreset] = useState<QualityPreset>('potato')
  
  return { preset: currentPreset, fps }
}

// Main Quality Enhancer component - simplified to always use potato
export function QualityEnhancer({ 
  preset = 'high',
  enableAdaptiveQuality = false,
  children 
}: { 
  preset?: QualityPreset
  enableAdaptiveQuality?: boolean
  children: React.ReactNode 
}) {
  const { gl } = useThree()
  const adaptiveQuality = useAdaptiveQuality()
  const { fps } = usePerformanceMonitor()
  
  // Use adaptive quality if enabled, otherwise use provided preset
  const activePreset = enableAdaptiveQuality ? adaptiveQuality.preset : preset
  const config = qualityPresets[activePreset]
  
  // Configure renderer based on quality settings
  useMemo(() => {
    if (config.enableShadows) {
      gl.shadowMap.enabled = true
      gl.shadowMap.type = THREE.PCFSoftShadowMap
      // Note: Shadow map size is set individually on each light, not globally
      // This will be handled in the AdvancedLighting component
    } else {
      gl.shadowMap.enabled = false
    }
    
    gl.toneMapping = convertToneMappingMode(config.toneMappingMode) as THREE.ToneMapping
    gl.toneMappingExposure = config.toneMappingExposure;

    // Set pixel ratio for performance
    // Only access window.devicePixelRatio on the client side
    const calculatedPixelRatio = typeof window !== 'undefined'
      ? Math.min(2, Math.max(0.5, window.devicePixelRatio * config.pixelRatio))
      : config.pixelRatio;

    gl.setPixelRatio(calculatedPixelRatio);
  }, [gl, config])
  
  // Create an array of effects to render
  const effects = useMemo(() => {
    const effectList: React.ReactElement[] = []
    
    if (config.enableSSAO) {
      effectList.push(
        <SSAO
          key="ssao"
          blendFunction={BlendFunction.MULTIPLY}
          samples={config.ssaoSamples}
          rings={4}
          worldDistanceThreshold={0.6}
          worldDistanceFalloff={0.1}
          worldProximityThreshold={0.015}
          worldProximityFalloff={0.01}
          luminanceInfluence={0.7}
          radius={config.ssaoRadius}
          intensity={config.ssaoIntensity}
          bias={0.025}
        />
      )
    }
    
    // ToneMapping is handled in the renderer configuration instead of as an effect
    // See useMemo configuration block above where gl.toneMapping is set
    
    if (config.enableBloom) {
      effectList.push(
        <Bloom
          key="bloom"
          blendFunction={BlendFunction.ADD}
          intensity={config.bloomIntensity}
          luminanceThreshold={config.bloomLuminanceThreshold}
          luminanceSmoothing={config.bloomLuminanceSmoothing}
          height={300}
          opacity={1}
        />
      )
    }
    
    if (config.enableChromaticAberration && config.chromaticAberrationOffset > 0) {
      effectList.push(
        <ChromaticAberration
          key="chromaticAberration"
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(config.chromaticAberrationOffset, config.chromaticAberrationOffset)}
          radialModulation={false}
          modulationOffset={0.15}
        />
      )
    }
    
    if (config.enableVignette && config.vignetteIntensity > 0) {
      effectList.push(
        <Vignette
          key="vignette"
          blendFunction={BlendFunction.MULTIPLY}
          darkness={config.vignetteIntensity}
        />
      )
    }
    
    if (config.enableNoise && config.noiseIntensity > 0) {
      effectList.push(
        <Noise
          key="noise"
          blendFunction={BlendFunction.OVERLAY}
          premultiply={false}
        />
      )
    }
    
    return effectList
  }, [config])
  
  // Skip EffectComposer completely when no effects are enabled for better WebGL compatibility
  const hasAnyEffects = effects.length > 0
  
  return (
    <>
      {children}
      
      {hasAnyEffects ? (
        <EffectComposer
          multisampling={config.enableAntiAliasing ? 4 : 0}
          frameBufferType={THREE.HalfFloatType}
        >
          {effects}
        </EffectComposer>
      ) : null}
    </>
  )
}

// Quality selector component for manual control
export function QualitySelector({
  currentPreset,
  onPresetChange,
  enableAdaptiveQuality,
  onAdaptiveToggle
}: {
  currentPreset: QualityPreset
  onPresetChange: (preset: QualityPreset) => void
  enableAdaptiveQuality: boolean
  onAdaptiveToggle: (enabled: boolean) => void
}) {
  const presets: QualityPreset[] = ['potato']
  
  return (
    <div className="absolute top-4 right-4 z-10 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white">
      <h3 className="text-sm font-bold mb-3">Rendering Quality</h3>
      
      <div className="mb-3">
        <label className="flex items-center space-x-2 text-xs">
          <input
            type="checkbox"
            checked={enableAdaptiveQuality}
            onChange={(e) => onAdaptiveToggle(e.target.checked)}
            className="rounded"
          />
          <span>Adaptive Quality</span>
        </label>
      </div>
      
      {!enableAdaptiveQuality && (
        <div className="space-y-2">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => onPresetChange(preset)}
              className={`block w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                currentPreset === preset
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </button>
          ))}
        </div>
      )}
      
      <div className="mt-3 text-xs text-gray-400">
        <div>Current: {currentPreset.toUpperCase()}</div>
        <div className="text-xs mt-1">
          {enableAdaptiveQuality && 'Auto-adjusting based on performance'}
        </div>
      </div>
    </div>
  )
}

// Performance HUD component for display outside Three.js scene
export function PerformanceHUD({
  preset,
  fps,
  config,
  showDetailedStats = false
}: {
  preset: QualityPreset
  fps: number
  config: QualityConfig
  showDetailedStats?: boolean
}) {
  if (process.env.NODE_ENV !== 'development') return null
  
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      fontSize: '12px',
      borderRadius: '5px',
      fontFamily: 'monospace',
      zIndex: 1000,
      minWidth: showDetailedStats ? '200px' : 'auto'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Quality: {preset.toUpperCase()}</div>
      <div>FPS: {fps}</div>
      <div>Bloom: {config.enableBloom ? '✓' : '✗'}</div>
      <div>SSAO: {config.enableSSAO ? '✓' : '✗'}</div>
      <div>Shadows: {config.enableShadows ? '✓' : '✗'} ({config.shadowMapSize}px)</div>
      {showDetailedStats && (
        <>
          <div style={{ borderTop: '1px solid #666', marginTop: '5px', paddingTop: '5px' }}>
            <div style={{ fontSize: '10px', opacity: 0.8 }}>PERFORMANCE</div>
            <div>Pixel Ratio: {config.pixelRatio}</div>
            <div>AA: {config.enableAntiAliasing ? 'MSAA 4x' : 'OFF'}</div>
          </div>
        </>
      )}
    </div>
  )
}

export { qualityPresets }
export default QualityEnhancer
