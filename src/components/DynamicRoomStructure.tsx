'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { RigidBody } from '@react-three/rapier'
import { Text, useTexture } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { RoomConfig } from '@/utils/glb-loader'
import { RoomDescription, MaterialProperties } from '@/utils/room-loader'
import GLBModelLoader from './GLBModelLoader'
import { log } from '@/utils/logger'
import * as THREE from 'three'
import { DecorRegistry } from '@/engine/registry'
import UnknownDecor from '@/components/decor/UnknownDecor'
import FirewallWall from '@/components/decor/FirewallWall'
import Tunnel from '@/components/decor/Tunnel'
import CeilingLightPanels from '@/components/decor/CeilingLightPanels'

// Shared dev-performance toggle detection (matches VirtualRoom.tsx semantics)
function isDevPerformanceMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    const devperfParam = params.get('devperf')
    const urlPerfOn = devperfParam === '1'
    const urlPerfOff = devperfParam === '0'
    const lsPerf = (localStorage.getItem('devPerformanceMode') === '1')
    const winPerf = !!(window as any).__DEV_PERF_MODE
    const envPerf = (process.env.NEXT_PUBLIC_DEV_PERF_MODE === '1')
    const devDefault = false // do not force perf mode by default; opt-in via ?devperf=1
    return urlPerfOff ? false : (urlPerfOn || lsPerf || winPerf || envPerf || devDefault)
  } catch {
    return false
  }
}

// Ultra-sharp renderer configuration
function UltraSharpRenderer({ dprManagedByCanvas }: { dprManagedByCanvas?: boolean }) {
  const { gl } = useThree();
  
  useEffect(() => {
    const DEV_PERF = isDevPerformanceMode()

    if (process.env.NODE_ENV === 'development') {
      console.log(
        dprManagedByCanvas
          ? '🧪 Configuring renderer (DPR managed by Canvas; DPR ramp enabled)'
          : (DEV_PERF ? '⚙️ Configuring renderer for DEV PERFORMANCE mode' : '🔥 Configuring renderer for ULTRA-SHARP rendering')
      );
    }
    
    // Note: antialias and powerPreference are set during canvas creation
    // DPR should normally be controlled by the R3F <Canvas dpr={...}> setting.
    // When the DPR ramp is enabled, do NOT override pixel ratio here.
    if (!dprManagedByCanvas) {
      const maxPixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
      if (DEV_PERF) {
        gl.setPixelRatio(1);
      } else {
        gl.setPixelRatio(Math.min(maxPixelRatio, 2)); // Cap at 2x for quality
      }
    }
    
    // Optional extension checks — skip in performance mode to avoid overhead/noise
    if (!DEV_PERF) {
      try {
        const extensions = gl.getContext().getExtension('WEBGL_compressed_texture_s3tc');
        if (extensions && process.env.NODE_ENV === 'development') {
          console.log('🔥 Texture compression available but disabled for sharpness');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔥 Texture compression check failed, continuing without it');
        }
      }
    }
    
    // Renderer baseline settings (kept same in both modes)
    gl.shadowMap.enabled = false;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(DEV_PERF ? '⚙️ ✅ Renderer configured for DEV PERFORMANCE:' : '🔥 ✅ Renderer configured for maximum sharpness:', {
        pixelRatio: gl.getPixelRatio(),
        outputColorSpace: gl.outputColorSpace
      });
    }
  }, [gl]);
  
  return null;
}

// Extended types for decorative elements with specific properties
type BaseDecorativeElement = {
  id: string
  type: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  material?: MaterialProperties
  content?: string
}

type DoorElement = BaseDecorativeElement & {
  type: 'door'
  flippedHandle?: boolean
}

type WindowViewElement = BaseDecorativeElement & {
  type: 'window_view'
  leftImageUrl?: string
  rightImageUrl?: string
  imageUrl?: string
  frameColor?: string
  glassOpacity?: number
  parallaxFactor?: number
}

type CeilingSoffitElement = BaseDecorativeElement & {
  type: 'ceiling_soffit'
  roomWidth?: number
  roomHeight?: number
  roomDepth?: number
  soffitDepth?: number
  soffitDrop?: number
  soffitThickness?: number
  lightSpacing?: number
  woodColor?: string
  lightColor?: string
  lightIntensity?: number
  lightTemperature?: number
}

type HoneycombWallElement = BaseDecorativeElement & {
  type: 'honeycomb_wall'
  wallWidth?: number
  wallHeight?: number
  hexSize?: number
  gapSize?: number
  protrusionRatio?: number
}

type WoodenPanelBackdropElement = BaseDecorativeElement & {
  type: 'wooden_panel_backdrop'
  panelWidth?: number
  panelHeight?: number
  panelThickness?: number
  slatWidth?: number
  gapWidth?: number
  woodColor?: string
  hasLEDStrip?: boolean
  ledColor?: string
  boardDimensions?: [number, number]
}

type ExtendedDecorativeElement = BaseDecorativeElement | DoorElement | WindowViewElement | CeilingSoffitElement | HoneycombWallElement | WoodenPanelBackdropElement

// Shell material component - carpet texture only on gray floor
function ShellMaterial({ color, roughness = 0.98, materialProps }: { 
  color: string; 
  roughness?: number; 
  materialProps?: MaterialProperties 
}) {
  // Only apply carpet to gray floor with proper material properties
  const isGrayFloor = color === '#808080' && materialProps?.textureRepeat && Array.isArray(materialProps.textureRepeat);
  
  log.material('ShellMaterial called', { color, isGrayFloor, hasTextureRepeat: !!materialProps?.textureRepeat });
  
  if (isGrayFloor) {
    log.material('APPLYING CARPET TEXTURE to gray floor');
    const carpetProps = {
      color: color,
      roughness: materialProps?.roughness || 0.90,
      metalness: materialProps?.metalness || 0.0,
      normalScale: materialProps?.normalScale || 2.0,
      textureRepeat: materialProps?.textureRepeat || [8, 6]
    } as MaterialProperties;
    return <CarpetMaterial color={color} props={carpetProps} />;
  }
  
  log.material('Using standard material for color', { color });
  // Use standard material for everything else
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={0}
      dithering={true}
      envMapIntensity={0.3}
      side={THREE.FrontSide}
    />
  );
}

// Carpet material component - converted from hook to avoid Rules of Hooks violations
function CarpetMaterial({ color, props }: { color: string; props: MaterialProperties }) {
  const carpet = useCarpetMaterial(color, props);
  return carpet;
}

// ULTRA-SHARP carpet texture with advanced anti-blur techniques
function useCarpetMaterial(color: string, props: MaterialProperties) {
  const { gl } = useThree();
  
  // Create textures immediately instead of using useState/useEffect
  const textures = useMemo(() => {
    const DEV_PERF = isDevPerformanceMode()
    log.texture(DEV_PERF ? 'Creating PERFORMANCE carpet texture' : 'Creating ULTRA-SHARP carpet texture', { color });
    
    // Force maximum anisotropy support (reduced in perf mode)
    const maxAnisotropy = DEV_PERF ? Math.min(2, gl.capabilities.getMaxAnisotropy() || 2) : gl.capabilities.getMaxAnisotropy();
    log.texture('Max anisotropy used', { maxAnisotropy });
    
    // Create canvas (optimized size to prevent freezes - still looks sharp with anisotropy)
    const canvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const size = DEV_PERF ? 256 : 512; // Reduced from 2048 to 512 - 16x faster, anisotropic filtering maintains sharpness
    
    canvas.width = size;
    canvas.height = size;
    normalCanvas.width = size;
    normalCanvas.height = size;
    
    // Force high-quality context settings
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      imageSmoothingEnabled: false, // CRITICAL: Disable smoothing
      imageSmoothingQuality: 'high'
    }) as CanvasRenderingContext2D
    
    const normalCtx = normalCanvas.getContext('2d', { 
      alpha: false,
      imageSmoothingEnabled: false, // CRITICAL: Disable smoothing
      imageSmoothingQuality: 'high'
    }) as CanvasRenderingContext2D
    
    // Parse the base color
    const baseColor = new THREE.Color(color);
    const baseR = Math.floor(baseColor.r * 255);
    const baseG = Math.floor(baseColor.g * 255);
    const baseB = Math.floor(baseColor.b * 255);
    
    // Create image data for pixel-level control
    const imageData = ctx.createImageData(size, size);
    const normalImageData = normalCtx.createImageData(size, size);
    const data = imageData.data;
    const normalData = normalImageData.data;
    
    // Seeded random for consistent pattern - CHANGED SEED TO FORCE CACHE BUST
    let seed = 99999; // Changed from 12345 to force new texture
    function seededRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    
    // Generate SIMPLE REALISTIC carpet pattern with visible texture
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        // UNIFORM GREY CARPET - reduced white patterns, more consistent grey
        const carpetBaseR = 200; // Reduced from 240 to minimize white patterns
        const carpetBaseG = 200;
        const carpetBaseB = 200;
        
        // Create seamless carpet fiber pattern - no tiling artifacts
        const fiberX = (x / size) * Math.PI * 2; // Normalize to 0-2π for seamless tiling
        const fiberY = (y / size) * Math.PI * 2; // Normalize to 0-2π for seamless tiling
        
        // Seamless sine wave patterns that tile perfectly
        const weavePattern1 = Math.sin(fiberX * 8.3) * Math.cos(fiberY * 5.7) * 0.02; 
        const weavePattern2 = Math.sin(fiberX * 4.1) * Math.cos(fiberY * 7.9) * 0.015;
        
        // Seamless noise using multiple sine waves
        const seamlessNoise1 = Math.sin(fiberX * 23.1) * Math.cos(fiberY * 17.3) * 0.008;
        const seamlessNoise2 = Math.sin(fiberX * 31.7) * Math.cos(fiberY * 29.1) * 0.006;
        
        // Combine all patterns for seamless carpet texture
        const totalVariation = (weavePattern1 + weavePattern2 + seamlessNoise1 + seamlessNoise2) * 5;
        
        // SUBTLE PATTERN - keep mostly uniform grey with minimal variation
        if (totalVariation > 0) {
          // Slightly darker areas - limit how dark they can go
          const finalR = Math.max(190, Math.min(210, carpetBaseR - Math.abs(totalVariation) * 1));
          const finalG = Math.max(190, Math.min(210, carpetBaseG - Math.abs(totalVariation) * 1));
          const finalB = Math.max(190, Math.min(210, carpetBaseB - Math.abs(totalVariation) * 1));
          data[i] = finalR;
          data[i + 1] = finalG;
          data[i + 2] = finalB;
        } else {
          // Slightly lighter areas - prevent bright white, keep within grey range
          const finalR = Math.max(190, Math.min(210, carpetBaseR + Math.abs(totalVariation) * 0.5));
          const finalG = Math.max(190, Math.min(210, carpetBaseG + Math.abs(totalVariation) * 0.5));
          const finalB = Math.max(190, Math.min(210, carpetBaseB + Math.abs(totalVariation) * 0.5));
          data[i] = finalR;
          data[i + 1] = finalG;
          data[i + 2] = finalB;
        }
        
        data[i + 3] = 255;
        
        // Create subtle normal map from smooth weave pattern
        const normalIntensity = (weavePattern1 + weavePattern2) * 1.5 + 0.5;
        const normalValue = Math.max(0, Math.min(1, normalIntensity)) * 255;
        
        normalData[i] = normalValue; // X normal
        normalData[i + 1] = normalValue; // Y normal  
        normalData[i + 2] = 255; // Z normal (pointing up)
        normalData[i + 3] = 255; // Alpha
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    normalCtx.putImageData(normalImageData, 0, 0);
    
    // Create ULTRA-SHARP textures with EXTREME anti-blur settings
    const diffuseTex = new THREE.CanvasTexture(canvas);
    diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;
    diffuseTex.repeat.set(props.textureRepeat?.[0] || 4, props.textureRepeat?.[1] || 3); // Reduced repeat to minimize tiling seams
    
    // HIGH-QUALITY TEXTURE SETTINGS
    diffuseTex.generateMipmaps = true;
    diffuseTex.minFilter = THREE.LinearMipMapLinearFilter;
    diffuseTex.magFilter = THREE.LinearFilter;
    diffuseTex.anisotropy = maxAnisotropy; // Use maximum available
    diffuseTex.format = THREE.RGBAFormat;
    diffuseTex.colorSpace = THREE.SRGBColorSpace;
    diffuseTex.flipY = false;
    diffuseTex.premultiplyAlpha = false;
    diffuseTex.unpackAlignment = 1;
    diffuseTex.needsUpdate = true;
    
    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(props.textureRepeat?.[0] || 12, props.textureRepeat?.[1] || 9);
    
    // High-quality normal map settings
    normalTex.generateMipmaps = true;
    normalTex.minFilter = THREE.LinearMipMapLinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    normalTex.anisotropy = maxAnisotropy;
    normalTex.format = THREE.RGBAFormat;
    normalTex.colorSpace = THREE.LinearSRGBColorSpace;
    normalTex.flipY = false;
    normalTex.premultiplyAlpha = false;
    normalTex.unpackAlignment = 1;
    normalTex.needsUpdate = true;
    
    log.texture('ULTRA-SHARP carpet texture created', {
      resolution: `${size}x${size}`,
      repeat: [props.textureRepeat?.[0] || 12, props.textureRepeat?.[1] || 9],
      filtering: 'LINEAR with anisotropy',
      anisotropy: maxAnisotropy,
      mipmaps: 'enabled',
      smoothing: 'disabled'
    });
    
    log.debug('Texture creation details', {
      diffuseTexture: !!diffuseTex,
      normalTexture: !!normalTex,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
    
    return { diffuseTexture: diffuseTex, normalTexture: normalTex };
  }, [color, props.textureRepeat, gl]);
  
  // Cleanup effect for carpet textures
  useEffect(() => {
    return () => {
      if (textures.diffuseTexture) {
        textures.diffuseTexture.dispose();
      }
      if (textures.normalTexture) {
        textures.normalTexture.dispose();
      }
    }
  }, [textures])
  
  log.debug('Rendering carpet with textures', {
    diffuse: textures.diffuseTexture ? 'exists' : 'null',
    normal: textures.normalTexture ? 'exists' : 'null'
  });
  
  return (
    <meshStandardMaterial
      map={textures.diffuseTexture}
      normalMap={textures.normalTexture}
      color={"#b4b4b4"} // Regular grey to match carpet base color (180,180,180 in RGB)
      normalScale={new THREE.Vector2(props.normalScale || 1.0, props.normalScale || 1.0)}
      roughness={props.roughness || 0.90}
      metalness={props.metalness || 0.0}
      dithering={false}
      envMapIntensity={0.05}
      transparent={false}
      alphaTest={0}
      side={THREE.FrontSide}
    />
  );
}

// Simple realistic wood material
function createWoodMaterial(color: string) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.7}     // Wood has natural roughness
      metalness={0}       // Wood is never metallic
      dithering={true}
      envMapIntensity={0.15} // Subtle natural reflection
    />
  );
}

// Enhanced wood material with procedural grain texture for soffit
function useSoffitWoodMaterial(color: string) {
  const [woodTexture, setWoodTexture] = useState<THREE.Texture | null>(null);
  const [normalTexture, setNormalTexture] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    // Create procedural wood grain texture
    const canvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const size = 1024;
    
    canvas.width = size;
    canvas.height = size;
    normalCanvas.width = size;
    normalCanvas.height = size;
    
    const ctx = canvas.getContext('2d')!;
    const normalCtx = normalCanvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const normalImageData = normalCtx.createImageData(size, size);
    const data = imageData.data;
    const normalData = normalImageData.data;
    
    // Parse base wood color (oak/walnut)
    const baseColor = new THREE.Color(color);
    const baseR = Math.floor(baseColor.r * 255);
    const baseG = Math.floor(baseColor.g * 255);
    const baseB = Math.floor(baseColor.b * 255);
    
    // Seeded random for consistent wood grain
    let seed = 54321;
    function seededRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        // Wood grain patterns
        const grainX = x * 0.02;
        const grainY = y * 0.015;
        
        // Primary wood grain (long streaks)
        const primaryGrain = Math.sin(grainX * 0.8) * Math.cos(grainY * 12) * 0.4;
        
        // Secondary grain (cross-grain texture)
        const secondaryGrain = Math.sin(grainX * 8) * Math.cos(grainY * 1.5) * 0.15;
        
        // Wood rings/knots
        const knotX = (x % 200) - 100;
        const knotY = (y % 180) - 90;
        const knotDistance = Math.sqrt(knotX * knotX + knotY * knotY);
        const knotPattern = Math.sin(knotDistance * 0.1) * Math.exp(-knotDistance * 0.02) * 0.2;
        
        // Age/weathering variation
        seed = (x * 7919 + y * 4801) % 233280;
        const weathering = (seededRandom() - 0.5) * 0.1;
        
        // Combine all wood patterns
        const woodVariation = primaryGrain + secondaryGrain + knotPattern + weathering;
        
        // Apply to color channels with realistic wood tones - enhanced for modern appearance
        const finalR = Math.max(0, Math.min(255, baseR + woodVariation * 40));
        const finalG = Math.max(0, Math.min(255, baseG + woodVariation * 35));
        const finalB = Math.max(0, Math.min(255, baseB + woodVariation * 25));
        
        data[i] = finalR;
        data[i + 1] = finalG;
        data[i + 2] = finalB;
        data[i + 3] = 255;
        
        // Create normal map from grain pattern
        const normalIntensity = (primaryGrain + secondaryGrain) * 0.8 + 0.5;
        const normalValue = Math.max(0, Math.min(1, normalIntensity)) * 255;
        
        normalData[i] = normalValue;     // R (X normal)
        normalData[i + 1] = normalValue; // G (Y normal)  
        normalData[i + 2] = 255;         // B (Z normal)
        normalData[i + 3] = 255;         // A (alpha)
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    normalCtx.putImageData(normalImageData, 0, 0);
    
    // Create textures
    const woodTex = new THREE.CanvasTexture(canvas);
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(2, 1); // Stretch grain along length
    woodTex.generateMipmaps = true;
    woodTex.minFilter = THREE.LinearMipMapLinearFilter;
    woodTex.magFilter = THREE.LinearFilter;
    
    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(2, 1);
    normalTex.generateMipmaps = true;
    normalTex.minFilter = THREE.LinearMipMapLinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    
    setWoodTexture(woodTex);
    setNormalTexture(normalTex);
    
    // Cleanup function
    return () => {
      console.log('🧹 Disposing wood textures for soffit');
      woodTex.dispose();
      normalTex.dispose();
    };
  }, [color]);
  
  return (
    <meshStandardMaterial
      map={woodTexture}
      color={color}
      normalMap={normalTexture}
      normalScale={new THREE.Vector2(0.3, 0.3)}
      roughness={0.6}        // Slightly smoother than regular wood
      metalness={0}          // Wood is never metallic
      dithering={true}
      envMapIntensity={0.12}  // Subtle reflection
    />
  );
}

// NEW: Window View with parallax effect
function WindowView({
  position, 
  rotation = [0,0,0], 
  size = [3.6, 1.2, 0.05],
  leftImageUrl,
  rightImageUrl, 
  frameColor = '#3a3f45', 
  glassOpacity = 0.35,
  parallaxFactor = 0.03
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  size?: [number, number, number]
  leftImageUrl: string
  rightImageUrl: string
  frameColor?: string
  glassOpacity?: number
  parallaxFactor?: number
}) {
  const [w, h, d] = size
  log.component('WindowView loading textures', { leftImageUrl, rightImageUrl });
  
  // Create separate textures for left and right panes
  const [leftTexture, setLeftTexture] = useState<THREE.Texture | null>(null)
  const [rightTexture, setRightTexture] = useState<THREE.Texture | null>(null)
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null!)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null!)
  const topRightRef = useRef<THREE.MeshBasicMaterial>(null!)
  const bottomLeftRef = useRef<THREE.MeshBasicMaterial>(null!)
  const bottomRightRef = useRef<THREE.MeshBasicMaterial>(null!)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  
  // Load textures manually for both panes
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    
    // Create fallback texture first
    const createFallbackTexture = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')!
      
      // Create a simple sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, 512)
      gradient.addColorStop(0, '#87CEEB')  // Sky blue at top
      gradient.addColorStop(1, '#B0E0E6')  // Powder blue at bottom
      
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 512, 512)
      
      const fallbackTexture = new THREE.CanvasTexture(canvas)
      fallbackTexture.wrapS = THREE.ClampToEdgeWrapping
      fallbackTexture.wrapT = THREE.ClampToEdgeWrapping
      fallbackTexture.minFilter = THREE.LinearFilter
      fallbackTexture.magFilter = THREE.LinearFilter
      
      return fallbackTexture
    }
    
    // Load left image
    loader.load(
      leftImageUrl,
      // Success callback
      (loadedTexture) => {
        log.texture('Left texture loaded successfully', { url: leftImageUrl });
        loadedTexture.colorSpace = THREE.SRGBColorSpace
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping
        loadedTexture.anisotropy = 8
        // Zoom in slightly by reducing repeat
        loadedTexture.repeat.set(0.9, 0.9)
        loadedTexture.offset.set(0.05, 0.05)
        setLeftTexture(loadedTexture)
      },
      // Progress callback
      (progress) => {
        log.debug('Left texture loading progress', { progress });
      },
      // Error callback
      (error) => {
        log.warn('Failed to load left texture, using fallback', { url: leftImageUrl, error: error instanceof Error ? error.message : String(error) });
        const fallbackTexture = createFallbackTexture()
        setLeftTexture(fallbackTexture)
      }
    )
    
    // Load right image
    loader.load(
      rightImageUrl,
      // Success callback
      (loadedTexture) => {
        log.texture('Right texture loaded successfully', { url: rightImageUrl });
        loadedTexture.colorSpace = THREE.SRGBColorSpace
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping
        loadedTexture.anisotropy = 8
        // Zoom in slightly by reducing repeat
        loadedTexture.repeat.set(0.9, 0.9)
        loadedTexture.offset.set(0.05, 0.05)
        setRightTexture(loadedTexture)
      },
      // Progress callback
      (progress) => {
        log.debug('Right texture loading progress', { progress });
      },
      // Error callback
      (error) => {
        log.warn('Failed to load right texture, using fallback', { url: rightImageUrl, error: error instanceof Error ? error.message : String(error) });
        const fallbackTexture = createFallbackTexture()
        setRightTexture(fallbackTexture)
      }
    )
    
    // Cleanup function - properly dispose of loaded textures
    return () => {
      // Note: We need to dispose the textures that were actually loaded,
      // not the state variables which might be stale in the cleanup function
    }
  }, [leftImageUrl, rightImageUrl])
  
  // Separate cleanup effect for texture disposal
  useEffect(() => {
    return () => {
      if (leftTexture) {
        leftTexture.dispose()
      }
      if (rightTexture) {
        rightTexture.dispose()
      }
    }
  }, [leftTexture, rightTexture])

  // UV parallax: move texture offset based on camera position (UPDATED for two-pane window)
  useFrame(() => {
    const g = groupRef.current
    const leftPane = materialRef.current
    const rightPane = topRightRef.current
    
    if (!g || !leftPane?.map || !rightPane?.map) return

    // Convert camera position to window's local space
    tmp.copy(camera.position)
    g.worldToLocal(tmp)

    // Calculate parallax offset based on camera position
    const maxOffset = 0.05 
    const offX = Math.max(-maxOffset, Math.min(maxOffset, -tmp.x * parallaxFactor))
    const offY = Math.max(-maxOffset, Math.min(maxOffset, -tmp.y * parallaxFactor))

    // Apply the offset to each pane with their base positions
    // Left pane: base offset + parallax (accounting for zoom offset)
    leftPane.map.offset.set(0.05 + offX, 0.05 + offY)
    
    // Right pane: base offset + parallax (accounting for zoom offset)
    rightPane.map.offset.set(0.05 + offX, 0.05 + offY)
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Outer wooden frame - top */}
      <mesh position={[0, h/2 + 0.06, 0]}>
        <boxGeometry args={[w + 0.24, 0.12, d + 0.02]} />
        {createWoodMaterial(frameColor)}
      </mesh>
      
      {/* Outer wooden frame - bottom */}
      <mesh position={[0, -h/2 - 0.06, 0]}>
        <boxGeometry args={[w + 0.24, 0.12, d + 0.02]} />
        {createWoodMaterial(frameColor)}
      </mesh>
      
      {/* Outer wooden frame - left */}
      <mesh position={[-w/2 - 0.06, 0, 0]}>
        <boxGeometry args={[0.12, h + 0.24, d + 0.02]} />
        {createWoodMaterial(frameColor)}
      </mesh>
      
      {/* Outer wooden frame - right */}
      <mesh position={[w/2 + 0.06, 0, 0]}>
        <boxGeometry args={[0.12, h + 0.24, d + 0.02]} />
        {createWoodMaterial(frameColor)}
      </mesh>

      {/* Individual Window View Images for Each Pane - Two panes side by side */}
      {/* Left pane image - shows left half of the image */}
      <mesh position={[-w/4, 0, -0.02]}>
        <planeGeometry args={[w/2 - 0.04, h - 0.04]} />
        <meshBasicMaterial 
          ref={materialRef}
          map={leftTexture}
          color={leftTexture ? "white" : "#87ceeb"}
          transparent={false}
          side={THREE.DoubleSide}
          alphaTest={0.1}
          depthWrite={true}
          toneMapped={false}
        />
      </mesh>
      
      {/* Right pane image - shows right half of the image */}
      <mesh position={[w/4, 0, -0.02]}>
        <planeGeometry args={[w/2 - 0.04, h - 0.04]} />
        <meshBasicMaterial 
          ref={topRightRef}
          map={rightTexture}
          color={rightTexture ? "white" : "#87ceeb"}
          transparent={false}
          side={THREE.DoubleSide}
          alphaTest={0.1}
          depthWrite={true}
          toneMapped={false}
        />
      </mesh>
      
      {/* Window Mullions (Dividers) */}
      {/* Vertical center mullion only */}
      <mesh position={[0, 0, 0.005]}>
        <boxGeometry args={[0.08, h - 0.05, d + 0.01]} />
        {createWoodMaterial(frameColor)}
      </mesh>
      
      {/* Inner window frames for depth - REMOVED to fix grey pane issue */}
      {/* The semi-transparent inner frames were causing grey appearance when viewed from angles
           Removing them to allow clear view of the background image through all panes */}
      
      {/* Individual Glass Panes (2 separate panes) */}
      {/* Left glass pane */}
      <mesh position={[-w/4, 0, 0.01]}>
        <planeGeometry args={[w/2 - 0.15, h - 0.15]} />
        <meshPhysicalMaterial 
          color="#ffffff" 
          transparent={true}
          opacity={glassOpacity}
          roughness={0.05}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Right glass pane */}
      <mesh position={[w/4, 0, 0.01]}>
        <planeGeometry args={[w/2 - 0.15, h - 0.15]} />
        <meshPhysicalMaterial 
          color="#ffffff" 
          transparent={true}
          opacity={glassOpacity}
          roughness={0.05}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Window sill (bottom ledge) */}
      <mesh position={[0, -h/2 - 0.08, 0.03]}>
        <boxGeometry args={[w + 0.3, 0.08, 0.12]} />
        {createWoodMaterial(frameColor)}
      </mesh>
    </group>
  )
}

// NEW: Emissive panel — unlit so it won't shimmer
function createEmissivePanel(color = '#ffffff', intensity = 2.0) {
  return (
    <meshBasicMaterial
      color={color}
      toneMapped={false}  // Disable tone mapping to ensure true white appearance
    />
  );
}

// NEW: Honeycomb Feature Wall Component
function HoneycombFeatureWall({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  wallWidth = 20,
  wallHeight = 7,
  hexSize = 1.0,
  gapSize = 0.02,
  protrusionRatio = 0.3
}: {
  position?: [number, number, number]
  rotation?: [number, number, number]
  wallWidth?: number
  wallHeight?: number
  hexSize?: number
  gapSize?: number
  protrusionRatio?: number
}) {
  // Color palette
  const colors = [
    '#111111', // Pure black
    '#f2f2f2', // White
    '#C8A882', // Light oak
    '#7B6048', // Walnut brown
    '#3C2F2F'  // Dark brown
  ]
  
  // Generate hexagon grid
  const hexagons = useMemo(() => {
    const hexes: Array<{
      position: [number, number, number]
      color: string
      protruding: boolean
      id: string
    }> = []
    
    // Honeycomb tessellation with optimal gaps between hexagons
    // For hexagons with nice gaps (not touching edges):
    // - Each hexagon has circumradius = hexSize / sqrt(3) (so flat-to-flat width = hexSize)
    // - Horizontal spacing = hexSize * sqrt(3)/2 + gap (distance between centers with gap)
    // - Vertical spacing = hexSize * 3/4 + gap (distance between row centers with gap)
    const circumradius = hexSize / Math.sqrt(3)
    const gapFactor = 1.25 // Add 25% spacing for optimal visible gaps
    const hexSpacingX = hexSize * (Math.sqrt(3)/2) * gapFactor // horizontal spacing with gap
    const hexSpacingY = hexSize * (3/4) * gapFactor // vertical spacing with gap
    
    log.geometry('Honeycomb grid configuration', { hexSize, circumradius, spacingX: hexSpacingX, spacingY: hexSpacingY, gapFactor });
    
    // Calculate grid dimensions
    const cols = Math.floor(wallWidth / hexSpacingX) + 2
    const rows = Math.floor(wallHeight / hexSpacingY) + 2
    
    // Seeded random for consistent pattern
    let seed = 54321
    function seededRandom() {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Offset every other row by half the horizontal spacing for proper tessellation
        const offsetX = (row % 2) * (hexSpacingX * 0.5)
        
        // Calculate exact position for corner alignment
        const x = (col * hexSpacingX + offsetX) - wallWidth / 2
        const y = (row * hexSpacingY) - wallHeight / 2
        
        // Only include hexagons within bounds
        if (Math.abs(x) <= wallWidth / 2 && Math.abs(y) <= wallHeight / 2) {
          // Random color selection
          seed = (col * 7919 + row * 4801) % 233280
          const colorIndex = Math.floor(seededRandom() * colors.length)
          const selectedColor = colors[colorIndex]
          
          // Determine if protruding (30% chance, darker colors slightly more likely)
          const isDark = ['#111111', '#3C2F2F', '#7B6048'].includes(selectedColor)
          const protrudeChance = isDark ? protrusionRatio * 1.2 : protrusionRatio * 0.9
          const protruding = seededRandom() < protrudeChance
          
          hexes.push({
            position: [x, y, protruding ? 0.08 : 0.05], // 8cm vs 5cm depth
            color: selectedColor,
            protruding,
            id: `hex-${row}-${col}`
          })
        }
      }
    }
    
    log.geometry('Generated hexagons for feature wall', { count: hexes.length });
    return hexes
  }, [wallWidth, wallHeight, hexSize, protrusionRatio])
  
  // Create hexagon geometry (reusable)
  const hexGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    
    // For a hexagon where hexSize is the flat-to-flat width:
    // The circumradius (center to corner) = hexSize / sqrt(3)
    // This ensures flat-to-flat width equals hexSize
    const circumradius = hexSize / Math.sqrt(3)
    
    log.geometry('Hexagon geometry created', { hexSize, circumradius });
    
    // Create hexagon shape (starting from right side, going counter-clockwise)
    // Start with flat side horizontal (pointy-top orientation)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6 // Add π/6 to rotate for flat-top
      const x = Math.cos(angle) * circumradius
      const y = Math.sin(angle) * circumradius
      
      if (i === 0) {
        shape.moveTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    }
    shape.closePath()
    
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.03, // 3cm thickness
      bevelEnabled: false
    })
  }, [hexSize])
  
  // Create material for each color
  const materials = useMemo(() => {
    const mats: { [key: string]: React.ReactElement } = {}
    
    colors.forEach(color => {
      mats[color] = (
        <meshStandardMaterial
          color={color}
          roughness={0.8}      // Matte finish
          metalness={0}        // Non-metallic MDF/wood
          dithering={true}
          envMapIntensity={0.1} // Minimal reflection for matte look
        />
      )
    })
    
    return mats
  }, [])
  
  return (
    <group position={position} rotation={rotation}>
      {hexagons.map((hex) => (
        <mesh
          key={hex.id}
          position={hex.position}
          rotation={[0, 0, 0]} // Keep hexagons upright/vertical on wall
          geometry={hexGeometry}
        >
          {materials[hex.color]}
        </mesh>
      ))}
    </group>
  )
}

// NEW: Wooden Panel Backdrop Component (for smart board backdrop)
function WoodenPanelBackdrop({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  panelWidth = 8,
  panelHeight = 4.8,
  panelThickness = 0.06,
  slatWidth = 0.12,
  gapWidth = 0.025, // Increased from 0.015 to 0.025 for better visibility
  woodColor = '#7B6048',
  hasLEDStrip = true,
  ledColor = '#ffffff',
  boardDimensions = [6, 3.6] // [width, height] of the smart board for LED positioning
}: {
  position?: [number, number, number]
  rotation?: [number, number, number]
  panelWidth?: number
  panelHeight?: number
  panelThickness?: number
  slatWidth?: number
  gapWidth?: number
  woodColor?: string
  hasLEDStrip?: boolean
  ledColor?: string
  boardDimensions?: [number, number]
}) {
  // Generate vertical wood slats
  const slats = useMemo(() => {
    const slatArray: Array<{
      position: [number, number, number]
      id: string
    }> = []
    
    // Calculate number of slats that fit across the panel width
    const totalSlatAndGapWidth = slatWidth + gapWidth
    const numSlats = Math.floor(panelWidth / totalSlatAndGapWidth)
    const totalWidth = numSlats * totalSlatAndGapWidth - gapWidth // Remove last gap
    const startX = -totalWidth / 2 + slatWidth / 2 // Center the slats
    
    for (let i = 0; i < numSlats; i++) {
      const x = startX + i * totalSlatAndGapWidth
      slatArray.push({
        position: [x, 0, 0],
        id: `slat-${i}`
      })
    }
    
    log.geometry('Generated wooden slats for backdrop panel', { count: numSlats });
    return slatArray
  }, [panelWidth, slatWidth, gapWidth])
  
  return (
    <group position={position} rotation={rotation}>
      {/* Background panel — place slightly in front of wall to avoid z-fighting */}
      <mesh position={[0, 0, 0.005]}>
        <boxGeometry args={[panelWidth, panelHeight, Math.max(0.02, panelThickness)]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* Vertical wood slats — slightly ahead of background for crisp edges */}
      {slats.map((slat) => (
        <mesh key={slat.id} position={[slat.position[0], slat.position[1], 0.02]}>
          <boxGeometry args={[slatWidth, panelHeight, Math.max(0.02, panelThickness)]} />
          {createWoodMaterial(woodColor)}
        </mesh>
      ))}
      
      {/* Enhanced LED strip lighting around smart board area */}
      {hasLEDStrip && (
        <group>
          {/* LED Housing/Channel - Top (larger and more visible) */}
          <mesh position={[0, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[boardDimensions[0] + 0.24, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* LED Strip - Top (much larger and brighter) */}
          <mesh position={[0, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.05]}>
            <boxGeometry args={[boardDimensions[0] + 0.16, 0.06, 0.02]} />
            <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          
          {/* LED Housing/Channel - Bottom (larger and more visible) */}
          <mesh position={[0, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[boardDimensions[0] + 0.24, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* LED Strip - Bottom (much larger and brighter) */}
          <mesh position={[0, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.05]}>
            <boxGeometry args={[boardDimensions[0] + 0.16, 0.06, 0.02]} />
            <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          
          {/* LED Housing/Channel - Left (larger and more visible) */}
          <mesh position={[-boardDimensions[0] / 2 - 0.12, 0, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, boardDimensions[1] + 0.24, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* LED Strip - Left (much larger and brighter) */}
          <mesh position={[-boardDimensions[0] / 2 - 0.12, 0, panelThickness / 2 + 0.05]}>
            <boxGeometry args={[0.06, boardDimensions[1] + 0.16, 0.02]} />
            <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          
          {/* LED Housing/Channel - Right (larger and more visible) */}
          <mesh position={[boardDimensions[0] / 2 + 0.12, 0, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, boardDimensions[1] + 0.24, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* LED Strip - Right (much larger and brighter) */}
          <mesh position={[boardDimensions[0] / 2 + 0.12, 0, panelThickness / 2 + 0.05]}>
            <boxGeometry args={[0.06, boardDimensions[1] + 0.16, 0.02]} />
            <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          
          {/* Corner LED housings (larger for better visibility) */}
          {/* Top-left corner */}
          <mesh position={[-boardDimensions[0] / 2 - 0.12, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* Top-right corner */}
          <mesh position={[boardDimensions[0] / 2 + 0.12, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* Bottom-left corner */}
          <mesh position={[-boardDimensions[0] / 2 - 0.12, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* Bottom-right corner */}
          <mesh position={[boardDimensions[0] / 2 + 0.12, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.03]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
          </mesh>
          
          {/* Individual LED segments for more realistic appearance */}
          {/* Top LED segments */}
          {Array.from({ length: 12 }, (_, i) => {
            const x = (-boardDimensions[0] / 2) + (i + 0.5) * (boardDimensions[0] / 12)
            return (
              <mesh key={`top-led-${i}`} position={[x, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.052]}>
                <boxGeometry args={[0.08, 0.04, 0.01]} />
                <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
              </mesh>
            )
          })}
          
          {/* Bottom LED segments */}
          {Array.from({ length: 12 }, (_, i) => {
            const x = (-boardDimensions[0] / 2) + (i + 0.5) * (boardDimensions[0] / 12)
            return (
              <mesh key={`bottom-led-${i}`} position={[x, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.052]}>
                <boxGeometry args={[0.08, 0.04, 0.01]} />
                <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
              </mesh>
            )
          })}
          
          {/* Left LED segments */}
          {Array.from({ length: 8 }, (_, i) => {
            const y = (-boardDimensions[1] / 2) + (i + 0.5) * (boardDimensions[1] / 8)
            return (
              <mesh key={`left-led-${i}`} position={[-boardDimensions[0] / 2 - 0.12, y, panelThickness / 2 + 0.052]}>
                <boxGeometry args={[0.04, 0.08, 0.01]} />
                <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
              </mesh>
            )
          })}
          
          {/* Right LED segments */}
          {Array.from({ length: 8 }, (_, i) => {
            const y = (-boardDimensions[1] / 2) + (i + 0.5) * (boardDimensions[1] / 8)
            return (
              <mesh key={`right-led-${i}`} position={[boardDimensions[0] / 2 + 0.12, y, panelThickness / 2 + 0.052]}>
                <boxGeometry args={[0.04, 0.08, 0.01]} />
                <meshBasicMaterial color={ledColor} toneMapped={false} depthWrite={false} depthTest={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
              </mesh>
            )
          })}
          
          {/* Enhanced lighting effects */}
          {/* Main backlight effect (brighter) */}
          <pointLight
            position={[0, 0, 0.15]}
            color={ledColor}
            intensity={1.5}
            distance={Math.max(boardDimensions[0], boardDimensions[1]) * 2}
            decay={1.2}
          />
          
          {/* LED strip specific lighting - THREE REFLECTIONS PER SIDE */}
          {/* Top strip lights - three reflections */}
          <pointLight
            position={[-boardDimensions[0] / 3, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[0, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[boardDimensions[0] / 3, boardDimensions[1] / 2 + 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          
          {/* Bottom strip lights - three reflections */}
          <pointLight
            position={[-boardDimensions[0] / 3, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[0, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[boardDimensions[0] / 3, -boardDimensions[1] / 2 - 0.12, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          
          {/* Left strip lights - three reflections */}
          <pointLight
            position={[-boardDimensions[0] / 2 - 0.12, -boardDimensions[1] / 3, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[-boardDimensions[0] / 2 - 0.12, 0, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[-boardDimensions[0] / 2 - 0.12, boardDimensions[1] / 3, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          
          {/* Right strip lights - three reflections */}
          <pointLight
            position={[boardDimensions[0] / 2 + 0.12, -boardDimensions[1] / 3, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[boardDimensions[0] / 2 + 0.12, 0, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
          <pointLight
            position={[boardDimensions[0] / 2 + 0.12, boardDimensions[1] / 3, panelThickness / 2 + 0.05]}
            color={ledColor}
            intensity={0.8}
            distance={8}
            decay={1.5}
          />
        </group>
      )}
    </group>
  )
}

// NEW: Perimeter Soffit with Recessed Downlights Component
function PerimeterSoffitWithDownlights({
  roomDimensions,
  soffitDepth = 0.675, // Increased by 1.5x from 0.45 to 0.675
  soffitDrop = 0.25,
  soffitThickness = 0.08,
  lightSpacing = 2.0,
  woodColor = '#8B4513', // Oak/walnut color
  lightColor = '#ffffff',
  lightIntensity = 0.8,
  lightTemperature = 4500 // Cool white (4000-5000K)
}: {
  roomDimensions: { width: number; height: number; depth: number }
  soffitDepth?: number
  soffitDrop?: number
  soffitThickness?: number
  lightSpacing?: number
  woodColor?: string
  lightColor?: string
  lightIntensity?: number
  lightTemperature?: number
}) {
  const { width, height, depth } = roomDimensions
  
  // Calculate soffit positioning
  const soffitY = height - soffitDrop / 2
  
  // Calculate light positions along perimeter with optimized spacing
  const lights = useMemo(() => {
    const lightPositions: Array<{ position: [number, number, number]; id: string }> = []
    let lightId = 0
    
    // North wall (back) - from left to right
    const northLightCount = Math.floor(width / lightSpacing)
    const northStartX = -(width / 2) + (width - (northLightCount - 1) * lightSpacing) / 2
    for (let i = 0; i < northLightCount; i++) {
      lightPositions.push({
        position: [northStartX + i * lightSpacing, soffitY - soffitDrop / 2, -depth / 2 + soffitDepth / 2],
        id: `north-${lightId++}`
      })
    }
    
    // South wall (front) - from left to right
    const southLightCount = Math.floor(width / lightSpacing)
    const southStartX = -(width / 2) + (width - (southLightCount - 1) * lightSpacing) / 2
    for (let i = 0; i < southLightCount; i++) {
      lightPositions.push({
        position: [southStartX + i * lightSpacing, soffitY - soffitDrop / 2, depth / 2 - soffitDepth / 2],
        id: `south-${lightId++}`
      })
    }
    
    // East wall (right) - from front to back (skip corners to avoid overlap)
    const eastLightCount = Math.floor((depth - 2 * soffitDepth) / lightSpacing)
    const eastStartZ = (depth / 2 - soffitDepth) - (((depth - 2 * soffitDepth) - (eastLightCount - 1) * lightSpacing) / 2)
    for (let i = 0; i < eastLightCount; i++) {
      lightPositions.push({
        position: [width / 2 - soffitDepth / 2, soffitY - soffitDrop / 2, eastStartZ - i * lightSpacing],
        id: `east-${lightId++}`
      })
    }
    
    // West wall (left) - from front to back (skip corners to avoid overlap)
    const westLightCount = Math.floor((depth - 2 * soffitDepth) / lightSpacing)
    const westStartZ = (depth / 2 - soffitDepth) - (((depth - 2 * soffitDepth) - (westLightCount - 1) * lightSpacing) / 2)
    for (let i = 0; i < westLightCount; i++) {
      lightPositions.push({
        position: [-width / 2 + soffitDepth / 2, soffitY - soffitDrop / 2, westStartZ - i * lightSpacing],
        id: `west-${lightId++}`
      })
    }
    
    log.lighting('Generated soffit downlights', { count: lightPositions.length, spacing: `${lightSpacing}m` });
    return lightPositions
  }, [width, height, depth, soffitDepth, soffitDrop, lightSpacing, soffitY])
  
  // Convert color temperature to RGB values for realistic lighting
  const getLightColorFromTemperature = (temp: number) => {
    if (temp <= 3000) return '#FFF3E0' // Warm white
    if (temp <= 3500) return '#FFF8F0' // Soft white  
    if (temp <= 4000) return '#FFFFFF' // Natural white
    if (temp <= 4500) return '#F0F8FF' // Cool white
    return '#E6F3FF' // Daylight white
  }
  
  const actualLightColor = getLightColorFromTemperature(lightTemperature)
  
  return (
    <group>
      {/* North Soffit (back wall) */}
      <mesh position={[0, soffitY, -depth / 2 + soffitDepth / 2]}>
        <boxGeometry args={[width, soffitThickness, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* South Soffit (front wall) */}
      <mesh position={[0, soffitY, depth / 2 - soffitDepth / 2]}>
        <boxGeometry args={[width, soffitThickness, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* East Soffit (right wall) */}
      <mesh position={[width / 2 - soffitDepth / 2, soffitY, 0]}>
        <boxGeometry args={[soffitDepth, soffitThickness, depth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* West Soffit (left wall) */}
      <mesh position={[-width / 2 + soffitDepth / 2, soffitY, 0]}>
        <boxGeometry args={[soffitDepth, soffitThickness, depth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* Soffit Underside (visible from below) */}
      {/* North underside */}
      <mesh position={[0, soffitY - soffitThickness / 2, -depth / 2 + soffitDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* South underside */}
      <mesh position={[0, soffitY - soffitThickness / 2, depth / 2 - soffitDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* East underside */}
      <mesh position={[width / 2 - soffitDepth / 2, soffitY - soffitThickness / 2, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[depth, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* West underside */}
      <mesh position={[-width / 2 + soffitDepth / 2, soffitY - soffitThickness / 2, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <planeGeometry args={[depth, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* Recessed Downlights */}
      {lights.map((light, index) => {
        // Alternate between emissive and real lights for performance
        const useRealLight = index % 2 === 0
        
        return (
          <group key={light.id}>
            {/* Light Housing (recessed into soffit) - DOUBLED SIZE */}
            <mesh position={light.position}>
              <cylinderGeometry args={[0.08, 0.08, 0.03, 16]} />
              <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.8} />
            </mesh>
            
            {/* Light Lens (emissive) - DOUBLED SIZE */}
            <mesh position={[light.position[0], light.position[1] - 0.015, light.position[2]]}>
              <cylinderGeometry args={[0.07, 0.07, 0.01, 16]} />
              <meshBasicMaterial 
                color={actualLightColor} 
                toneMapped={false}
              />
            </mesh>
            
            {/* Real lighting (every other light for performance) */}
            {useRealLight && (
              <spotLight
                position={[light.position[0], light.position[1] - 0.05, light.position[2]]}
                target-position={[light.position[0], 0, light.position[2]]} // Point straight down
                color={actualLightColor}
                intensity={lightIntensity}
                angle={Math.PI / 3} // 60 degree cone
                penumbra={0.5} // Soft edge for realistic falloff
                distance={12} // Limit range to prevent performance issues
                decay={2} // Realistic light decay
                castShadow={false} // Disable shadows for performance
              />
            )}
          </group>
        )
      })}
      
      {/* Corner Joints (where soffits meet) */}
      {/* North-East corner */}
      <mesh position={[width / 2 - soffitDepth / 2, soffitY, -depth / 2 + soffitDepth / 2]}>
        <boxGeometry args={[soffitDepth, soffitThickness + 0.01, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* North-West corner */}
      <mesh position={[-width / 2 + soffitDepth / 2, soffitY, -depth / 2 + soffitDepth / 2]}>
        <boxGeometry args={[soffitDepth, soffitThickness + 0.01, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* South-East corner */}
      <mesh position={[width / 2 - soffitDepth / 2, soffitY, depth / 2 - soffitDepth / 2]}>
        <boxGeometry args={[soffitDepth, soffitThickness + 0.01, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
      
      {/* South-West corner */}
      <mesh position={[-width / 2 + soffitDepth / 2, soffitY, depth / 2 - soffitDepth / 2]}>
        <boxGeometry args={[soffitDepth, soffitThickness + 0.01, soffitDepth]} />
        {createWoodMaterial(woodColor)}
      </mesh>
    </group>
  )
}

// EXISTING: Keep Standard for props/decor/devices (not for big shell planes)
function createMaterial(props: MaterialProperties) {
  return (
    <meshStandardMaterial
      color={props.color}
      roughness={props.roughness ?? 0.95}   // raise default roughness
      metalness={0}                          // force non-metallic for safety
      emissive={props.emissive || '#000000'}
      emissiveIntensity={props.emissiveIntensity ?? 0}
      transparent={props.transparent ?? false}
      opacity={props.opacity ?? 1}
      dithering={true}                        // help with banding
      envMapIntensity={0.5}                   // keep specular lobes small
    />
  )
}

// Bootstrap: register selected decor types with simple renderers
// Note: We only register components that have dedicated function components here.
// Fallback switch-case below remains for types not yet in the registry.
const __decorNormalizeWarned = new Set<string>()
const warnDecorNormalizeOnce = (key: string, msg: string, payload: any) => {
  if (__decorNormalizeWarned.has(key)) return
  __decorNormalizeWarned.add(key)
  console.warn(msg, payload)
}

try {
  // ceiling_soffit
  DecorRegistry.register('ceiling_soffit', {
    render: ({ element, roomDims }) => (
      <PerimeterSoffitWithDownlights
        roomDimensions={{
          width: (element as any).roomWidth || roomDims.width,
          height: (element as any).roomHeight || roomDims.height,
          depth: (element as any).roomDepth || roomDims.depth,
        }}
        soffitDepth={(element as any).soffitDepth || 0.675}
        soffitDrop={(element as any).soffitDrop || 0.25}
        soffitThickness={(element as any).soffitThickness || 0.08}
        lightSpacing={(element as any).lightSpacing || 2.0}
        woodColor={(element as any).woodColor || '#D4BE94'}
        lightColor={(element as any).lightColor || '#ffffff'}
        lightIntensity={(element as any).lightIntensity || 0.8}
        lightTemperature={(element as any).lightTemperature || 4500}
      />
    ),
    describe: 'Perimeter soffit with downlights',
  })

  // firewall_wall
  DecorRegistry.register('firewall_wall', {
    normalize: ({ element, roomDims }) => {
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
      const original = element
      const width = clamp((element as any).width ?? roomDims.width, 0.2, roomDims.width)
      const height = clamp((element as any).height ?? roomDims.height, 0.2, roomDims.height)
      const thickness = Math.max(0.02, (element as any).thickness ?? 0.02)
      let pos = (element as any).position as [number, number, number] | undefined
      if (!pos) {
        // center on back wall; box is centered, so z is at back + half thickness plus epsilon
        const z = -roomDims.depth / 2 + Math.max(0.005, thickness / 2)
        pos = [0, height / 2, z]
      }
      const normalized = { ...element, width, height, thickness, position: pos }
      if (process.env.NODE_ENV === 'development') {
        const changed =
          (original.width ?? roomDims.width) !== width ||
          (original.height ?? roomDims.height) !== height ||
          (original.thickness ?? 0.02) !== thickness ||
          !original.position
        if (changed) {
          warnDecorNormalizeOnce(`firewall_wall:${String((element as any).id || '')}`, '[decor normalize] firewall_wall clamped/anchored', { width, height, thickness, pos })
        }
      }
      return normalized
    },
    render: ({ element, roomDims }) => (
      <FirewallWall
        position={(element as any).position || [0, (roomDims.height)/2, -roomDims.depth/2 + 0.005]}
        rotation={(element as any).rotation || [0, 0, 0]}
        width={(element as any).width || roomDims.width}
        height={(element as any).height || roomDims.height}
        thickness={(element as any).thickness || 0.02}
        color={(element as any).material?.color || (element as any).color || '#1f2937'}
        roughness={(element as any).material?.roughness ?? 0.95}
      />
    ),
    describe: 'Thin wall panel for firewall scenes',
  })

  // tunnel
  DecorRegistry.register('tunnel', {
    normalize: ({ element, roomDims }) => {
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
      const original = element
      const radiusMin = 0.05
      const radiusMax = roomDims.height * 0.25
      const lengthMin = 2.0
      const lengthMax = roomDims.depth * 0.9
      const radius = clamp((element as any).radius ?? roomDims.height * 0.12, radiusMin, radiusMax)
      const length = clamp((element as any).length ?? roomDims.depth * 0.5, lengthMin, lengthMax)
      let pos = (element as any).position as [number, number, number] | undefined
      if (!pos) {
        const y = Math.min(roomDims.height * 0.25, radius)
        const z = -roomDims.depth / 2 + (length / 2) + 0.05
        pos = [0, y, z]
      }
      const normalized = { ...element, radius, length, position: pos }
      if (process.env.NODE_ENV === 'development') {
        const changed =
          (original.radius ?? roomDims.height * 0.12) !== radius ||
          (original.length ?? roomDims.depth * 0.5) !== length ||
          !original.position
        if (changed) {
          console.warn('[decor normalize] tunnel clamped/anchored', { radius, length, pos })
        }
      }
      return normalized
    },
    render: ({ element, roomDims }) => (
      <Tunnel
        position={(element as any).position || [0, 1.0, -roomDims.depth/2 + ((element as any).length || 12)/2]}
        rotation={(element as any).rotation || [0, 0, 0]}
        radius={(element as any).radius || 2.5}
        length={(element as any).length || 12}
        radialSegments={(element as any).radialSegments || 48}
        heightSegments={(element as any).heightSegments || 1}
        glow={(element as any).glow || (element as any).color || '#22c55e'}
        body={(element as any).body || '#0b1220'}
        opacity={(element as any).opacity ?? 1.0}
      />
    ),
    describe: 'Cylindrical tunnel with emissive glow',
  })

  // ceiling light panels (rectangular emissive boxes)
  DecorRegistry.register('ceiling_light_panels', {
    normalize: ({ element, roomDims }) => {
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
      const original = element
      const panels = ((element as any).panels || []).map((p: any) => {
        const size = p.size || [1, 0.03, 1]
        const sx = clamp(size[0], 0.2, roomDims.width)
        const sy = Math.max(0.02, size[1] ?? 0.03)
        const sz = clamp(size[2], 0.2, roomDims.depth)
        const halfX = sx / 2
        const halfZ = sz / 2
        const px = clamp((p.position?.[0] ?? 0), -roomDims.width / 2 + halfX, roomDims.width / 2 - halfX)
        const pz = clamp((p.position?.[2] ?? 0), -roomDims.depth / 2 + halfZ, roomDims.depth / 2 - halfZ)
        // Place panels safely below the ceiling bottom plane to avoid z-fighting with the ceiling box
        // Assuming engine ceiling thickness ~0.05, keep at least 0.02m clearance under it
        const safeClear = 0.06
        const py = roomDims.height - Math.max(safeClear, sy / 2 + 0.03)
        return { ...p, position: [px, py, pz], size: [sx, sy, sz] }
      })
      const normalized = { ...element, panels }
      if (process.env.NODE_ENV === 'development') {
        if ((original.panels || []).length) {
          warnDecorNormalizeOnce(`ceiling_light_panels:${String((element as any).id || '')}`, '[decor normalize] ceiling_light_panels sanitized panels', { count: panels.length })
        }
      }
      return normalized
    },
    render: ({ element }) => (
      <CeilingLightPanels panels={(element as any).panels || []} />
    ),
    describe: 'Rectangular emissive light boxes mounted to ceiling',
  })
} catch {}

// Dynamic room structure generator
export function DynamicRoomStructure({
  config,
  hiddenDecorIds,
  dprRampEnabled,
}: {
  config: RoomConfig,
  hiddenDecorIds?: Set<string> | string[],
  dprRampEnabled?: boolean,
}) {
  // Check if we have room structure data
  const roomStructure = config.roomStructure as RoomDescription['structure'] | undefined
  
  if (!roomStructure) {
    // Fallback to default room structure if no room description
    return <DefaultRoomStructure config={config} />
  }
  
  const { dimensions, floor, walls, ceiling, decorative_elements } = roomStructure
  const { width, height, depth } = dimensions
  
  // Stretch east/west walls by 1.5x (increase room width), and north/south by 1.5x (increase room depth)
  const widthScale = 1.5
  const depthScale = 1.5
  const roomW = width * widthScale
  const roomD = depth * depthScale
  
  // Keep carpet tile density consistent when widening/deepening: scale X and Y repeats
  const floorMatScaled: MaterialProperties = {
    ...floor.material,
    textureRepeat: [
      ((floor.material.textureRepeat?.[0] ?? 8) * widthScale) as number,
      ((floor.material.textureRepeat?.[1] ?? 6) * depthScale) as number
    ]
  }
  
  // Accent wall position matching with cardinal synonyms (east/right, west/left, north/back, south/front)
  const accent = walls.accent_wall
  const accentPos = (accent?.position as unknown as string) || ''
  const posMap: Record<'back'|'front'|'left'|'right', string[]> = {
    back: ['back', 'north'],
    front: ['front', 'south'],
    left: ['left', 'west'],
    right: ['right', 'east']
  }
  const isAccent = (pos: 'back'|'front'|'left'|'right') => accentPos ? posMap[pos].includes(accentPos) : false
  
  return (
    <group>
      {/* Ultra-sharp renderer configuration */}
      <UltraSharpRenderer dprManagedByCanvas={!!dprRampEnabled} />
      
      {/* Floor (use Lambert) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {/* keep geometry simple — 1x1 or 2x2 segments is fine */}
          <planeGeometry args={[roomW, roomD, 1, 1]} />
          <ShellMaterial 
            color={floor.material.color} 
            roughness={floor.material.roughness ?? 0.95} 
            materialProps={floorMatScaled} 
          />
        </mesh>
      </RigidBody>

      {/* Walls */}
      {/* Back wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, height/2, -roomD/2]}>
          <planeGeometry args={[roomW, height, 1, 1]} />
          <ShellMaterial
            color={isAccent('back') ? (walls.accent_wall as any).material.color : walls.material.color}
            roughness={0.95}
          />
        </mesh>
      </RigidBody>

      {/* Front wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, height/2, roomD/2]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[roomW, height, 1, 1]} />
          <ShellMaterial
            color={isAccent('front') ? (walls.accent_wall as any).material.color : walls.material.color}
            roughness={0.95}
          />
        </mesh>
      </RigidBody>

      {/* Left wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-roomW/2, height/2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[roomD, height, 1, 1]} />
          <ShellMaterial
            color={isAccent('left') ? (walls.accent_wall as any).material.color : walls.material.color}
            roughness={0.95}
          />
        </mesh>
      </RigidBody>

      {/* Right wall (EAST) */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[roomW/2, height/2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[roomD, height, 1, 1]} />
          <ShellMaterial
            color={isAccent('right') ? (walls.accent_wall as any).material.color : walls.material.color}
            roughness={0.95}
          />
        </mesh>
      </RigidBody>


      {/* Ceiling (flat + diffuse) */}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[roomW, ceiling.thickness || 0.05, roomD]} />
          <ShellMaterial 
            color={ceiling.material.color} 
            roughness={ceiling.material.roughness ?? 0.95} 
          />
      </mesh>

      {/* Ceiling lights */}
      {ceiling.lights?.map((light, index) => (
        <mesh key={`light-${index}`} position={[light.position[0], light.position[1] - 0.01, light.position[2]]}>
          {/* thin, slightly below the ceiling plane to avoid coplanar z-fighting */}
          <boxGeometry args={[light.size[0], light.size[1], Math.max(0.02, light.size[2] || 0.02)]} />
          {createEmissivePanel(light.material?.color ?? '#ffffff', light.material?.emissiveIntensity ?? 2)}
        </mesh>
      ))}

      {/* Room title */}
      <Text
        position={[0, height * 0.8, -roomD/2 + 0.05]}
        fontSize={0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {config.name}
      </Text>

      {/* Room description */}
      {config.description && (
        <Text
          position={[0, height * 0.65, -roomD/2 + 0.05]}
          fontSize={0.12}
          color="#b0c4de"
          anchorX="center"
          anchorY="middle"
          maxWidth={roomW * 0.8}
        >
          {config.description}
        </Text>
      )}

      {/* Decorative elements (respect hidden set when provided) */}
      {decorative_elements?.filter((el) => {
        if (!hiddenDecorIds) return true
        const set = Array.isArray(hiddenDecorIds) ? new Set(hiddenDecorIds) : hiddenDecorIds
        return !set.has(el.id)
      }).map((element) => (
        <DecorativeElement key={element.id} element={element} roomDims={{ width: roomW, height, depth: roomD }} />
      ))}
      
      {/* Note: GLB models are now loaded via the original system from config.objects */}
    </group>
  )
}

// Component for individual decorative elements
function DecorativeElement({ element, roomDims }: { 
  element: NonNullable<RoomDescription['structure']['decorative_elements']>[0],
  roomDims: { width: number; height: number; depth: number }
}) {
  const position = element.position
  const rotation = element.rotation || [0, 0, 0]
  const scale = typeof element.scale === 'number' ? [element.scale, element.scale, element.scale] : (element.scale || [1, 1, 1])

  // 1) Try registry first (new path)
  const entry = DecorRegistry.get(element.type)
  if (entry) {
    try {
      const normalized = entry.normalize ? entry.normalize({ element, roomDims }) : element
      return <>{entry.render({ element: normalized, roomDims })}</>
    } catch (e) {
      // Fall through to legacy switch if registered renderer throws
      if (process.env.NODE_ENV === 'development') {
        console.warn('Decor registry renderer failed, falling back to legacy switch:', element.type, e)
      }
    }
  }

  // 2) Legacy switch-case fallback (keeps existing behavior)
  switch (element.type) {
    case 'text': {
      const label = (element.content || '').trim().toLowerCase()
      let pos: [number, number, number] = position as [number, number, number]
      let rot: [number, number, number] = rotation as [number, number, number]
      const yTop = Math.max(0.05, roomDims.height - 0.2)
      const eps = 0.05 // push off wall to avoid z-fighting with accent panels
      const isCardinal = label === 'east' || label === 'west' || label === 'north' || label === 'south'
      if (label === 'east') {
        pos = [roomDims.width / 2 - eps, yTop, 0]
        rot = [0, -Math.PI / 2, 0]
      } else if (label === 'west') {
        pos = [-roomDims.width / 2 + eps, yTop, 0]
        rot = [0, Math.PI / 2, 0]
      } else if (label === 'north') {
        pos = [0, yTop, -roomDims.depth / 2 + eps]
        rot = [0, 0, 0]
      } else if (label === 'south') {
        pos = [0, yTop, roomDims.depth / 2 - eps]
        rot = [0, Math.PI, 0]
      }
      return (
        <Text
          position={pos}
          rotation={rot}
          fontSize={typeof scale === 'number' ? scale * 0.5 : 0.8}
          color={element.material?.color || '#333333'}
          anchorX="center"
          anchorY={isCardinal ? 'top' : 'middle'}
          material-depthWrite={false}
          material-depthTest={false}
          renderOrder={5}
        >
          {element.content}
        </Text>
      )
    }
    case 'whiteboard': {
      // Anchor smart board to current wall based on rotation
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        // SOUTH
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        // NORTH
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        // WEST
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        // EAST
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <group position={adjPos} rotation={rotation}>
          {/* Push the entire board assembly slightly out from the wall so it sits in front of any trim/backdrop */}
          <group position={[0, 0, 0.06]}>
            {/* Main screen */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={typeof scale === 'number' ? [scale, scale * 0.6, 0.05] : [scale[0], scale[1], scale[2]]} />
              {element.material && createMaterial(element.material)}
            </mesh>
            {/* Frame/bezel (toward wall slightly) */}
            <mesh position={[0, 0, -0.03]}>
              <boxGeometry args={typeof scale === 'number' ? [scale * 1.05, scale * 0.63, 0.08] : [scale[0] * 1.05, scale[1] * 1.05, 0.08]} />
              <meshStandardMaterial color="#2a2a2a" roughness={0.4} metalness={0.1} />
            </mesh>
            {/* Control panel at bottom (acts like speaker/soundbar) */}
            <mesh position={[0, typeof scale === 'number' ? -scale * 0.35 : -scale[1] * 0.6, 0.01]}>
              <boxGeometry args={typeof scale === 'number' ? [scale * 0.8, 0.08, 0.02] : [scale[0] * 0.8, 0.08, 0.02]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.3} />
            </mesh>
            {/* Power indicator light */}
            <mesh position={[typeof scale === 'number' ? scale * 0.35 : scale[0] * 0.35, typeof scale === 'number' ? -scale * 0.35 : -scale[1] * 0.6, 0.02]}>
              <sphereGeometry args={[0.015, 8, 6]} />
              <meshBasicMaterial color="#00ff00" toneMapped={false} />
            </mesh>
            {/* Control buttons */}
            <mesh position={[typeof scale === 'number' ? scale * 0.2 : scale[0] * 0.2, typeof scale === 'number' ? -scale * 0.35 : -scale[1] * 0.6, 0.02]}>
              <cylinderGeometry args={[0.02, 0.02, 0.01, 8]} />
              <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position={[typeof scale === 'number' ? scale * 0.1 : scale[0] * 0.1, typeof scale === 'number' ? -scale * 0.35 : -scale[1] * 0.6, 0.02]}>
              <cylinderGeometry args={[0.02, 0.02, 0.01, 8]} />
              <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position={[typeof scale === 'number' ? scale * 0.0 : scale[0] * 0.0, typeof scale === 'number' ? -scale * 0.35 : -scale[1] * 0.6, 0.02]}>
              <cylinderGeometry args={[0.02, 0.02, 0.01, 8]} />
              <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.3} />
            </mesh>
          </group>
        </group>
      )
    }
      
    case 'clock': {
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <mesh position={adjPos} rotation={rotation}>
          <cylinderGeometry args={[scale[0], scale[1], scale[2], 16]} />
          {element.material && createMaterial(element.material)}
        </mesh>
      )
    }
      
    case 'door': {
      // Anchor door to current wall
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <group position={adjPos} rotation={rotation}>
          {/* Door frame - left */}
          <mesh position={[-scale[0]/2 - 0.05, 0, 0]}>
            <boxGeometry args={[0.1, scale[1] + 0.1, 0.15]} />
            <meshStandardMaterial color="#4a4a4a" roughness={0.7} metalness={0.0} />
          </mesh>
          {/* Door frame - right */}
          <mesh position={[scale[0]/2 + 0.05, 0, 0]}>
            <boxGeometry args={[0.1, scale[1] + 0.1, 0.15]} />
            <meshStandardMaterial color="#4a4a4a" roughness={0.7} metalness={0.0} />
          </mesh>
          {/* Door frame - top */}
          <mesh position={[0, scale[1]/2 + 0.05, 0]}>
            <boxGeometry args={[scale[0] + 0.2, 0.1, 0.15]} />
            <meshStandardMaterial color="#4a4a4a" roughness={0.7} metalness={0.0} />
          </mesh>
          
          {/* Main door panel - use material color from JSON */}
          <mesh position={[0, 0, -0.025]}>
            <boxGeometry args={[scale[0], scale[1], scale[2]]} />
            {createWoodMaterial(element.material?.color || '#3E2723')} 
          </mesh>
          
          {/* Door panels (raised rectangles) - lighter variant of door color */}
          <mesh position={[0, scale[1] * 0.25, -0.035]}>
            <boxGeometry args={[scale[0] * 0.8, scale[1] * 0.35, 0.01]} />
            {createWoodMaterial(element.material?.color || '#3E2723')}
          </mesh>
          <mesh position={[0, -scale[1] * 0.25, -0.035]}>
            <boxGeometry args={[scale[0] * 0.8, scale[1] * 0.35, 0.01]} />
            {createWoodMaterial(element.material?.color || '#3E2723')}
          </mesh>
          
          {/* Door handle - Professional shiny grey metallic finish */}
          <group>
            {/* Handle lever (horizontal bar) - SHINY GREY - ON DOOR SURFACE */}
            <mesh position={[
              (element as DoorElement).flippedHandle 
                ? -(scale[0] * 0.25 + 0.125) 
                : scale[0] * 0.25 + 0.125, 
              0, 
              0.05
            ]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.25, 12]} />
              <meshStandardMaterial color="#C0C0C0" roughness={0.2} metalness={0.9} />
            </mesh>
            
            {/* Handle grip (end part) - SHINY GREY - ON DOOR SURFACE */}
            <mesh position={[
              (element as DoorElement).flippedHandle 
                ? -(scale[0] * 0.25 + 0.25) 
                : scale[0] * 0.25 + 0.25, 
              0, 
              0.05
            ]}>
              <sphereGeometry args={[0.06, 12, 8]} />
              <meshStandardMaterial color="#C0C0C0" roughness={0.1} metalness={0.9} />
            </mesh>
            
            {/* Handle base/socket (what connects to door) - SHINY GREY - ON DOOR SURFACE */}
            <mesh position={[
              (element as DoorElement).flippedHandle 
                ? -(scale[0] * 0.25) 
                : scale[0] * 0.25, 
              0, 
              0.04
            ]}>
              <boxGeometry args={[0.1, 0.1, 0.1]} />
              <meshStandardMaterial color="#C0C0C0" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>
          
          {/* Door hinges */}
          <mesh position={[-scale[0] * 0.45, scale[1] * 0.3, -0.04]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[-scale[0] * 0.45, 0, -0.04]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[-scale[0] * 0.45, -scale[1] * 0.3, -0.04]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.7} />
          </mesh>
          
          {/* Door window (small rectangular window) */}
          <mesh position={[0, scale[1] * 0.15, -0.04]}>
            <boxGeometry args={[scale[0] * 0.3, scale[1] * 0.15, 0.005]} />
            <meshStandardMaterial 
              color="#87CEEB" 
              roughness={0.0} 
              metalness={0.0} 
              transparent={true} 
              opacity={0.7}
            />
          </mesh>
          
          {/* Window frame */}
          <mesh position={[0, scale[1] * 0.15, -0.038]}>
            <boxGeometry args={[scale[0] * 0.32, scale[1] * 0.17, 0.01]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.6} metalness={0.1} />
          </mesh>
        </group>
      )
    }
      
    case 'poster': {
      // Anchor poster to wall
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      const p = adjPos
      return (
        <group>
          {/* Poster background */}
          <mesh position={p} rotation={rotation}>
            <boxGeometry args={[scale[0], scale[1], scale[2]]} />
            {element.material && createMaterial(element.material)}
          </mesh>
          {/* Poster text */}
          {element.content && (
            <Text
              position={[
                p[0] + (rotation[1] ? -0.05 : 0),
                p[1],
                p[2] + (rotation[1] ? 0 : 0.05)
              ]}
              rotation={rotation}
              fontSize={0.08}
              color="#2c3e50"
              anchorX="center"
              anchorY="middle"
              maxWidth={0.7}
            >
              {element.content.replace(/\\n/g, '\n')}
            </Text>
          )}
        </group>
      )
    }
      
    case 'table':
      return (
        <group>
          <mesh position={position} rotation={rotation} receiveShadow>
            <boxGeometry args={[scale[0], scale[1], scale[2]]} />
            {element.material && createMaterial(element.material)}
          </mesh>
          {/* Table surface */}
          <mesh position={[position[0], position[1] + 0.02, position[2]]} receiveShadow>
            <boxGeometry args={[scale[0] * 0.9, scale[1] * 20, scale[2] * 0.05]} />
            <meshStandardMaterial 
              color="#f0f0f0"
              roughness={0.4}
              transparent
              opacity={0.3}
            />
          </mesh>
        </group>
      )
      
    case 'window_view': {
      // Re-anchor windows to current wall planes based on their rotation (which indicates wall)
      const rotY = (rotation?.[1] ?? 0)
      const eps = 0.03
      let adjPos: [number, number, number] = position as [number, number, number]
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      // Normalize rotY to [-PI, PI]
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      if (near(Math.abs(ry), Math.PI)) {
        // SOUTH wall (front): z positive
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        // NORTH wall (back): z negative
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        // WEST wall: x negative (since left in our coord system)
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        // EAST wall: x positive (right)
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <WindowView
          position={adjPos}
          rotation={rotation}
          size={(scale as [number, number, number]) || [3.6, 1.2, 0.05]}
          leftImageUrl={(element as WindowViewElement).leftImageUrl || (element as WindowViewElement).imageUrl || '/default-window-left.jpg'}
          rightImageUrl={(element as WindowViewElement).rightImageUrl || (element as WindowViewElement).imageUrl || '/default-window-right.jpg'}
          frameColor={(element as WindowViewElement).frameColor || '#3a3f45'}
          glassOpacity={(element as WindowViewElement).glassOpacity ?? 0.35}
          parallaxFactor={(element as WindowViewElement).parallaxFactor ?? 0.03}
        />
      )
    }
      
    case 'ceiling_soffit':
      return (
        <PerimeterSoffitWithDownlights
          roomDimensions={{
            width: (element as CeilingSoffitElement).roomWidth || roomDims.width,
            height: (element as CeilingSoffitElement).roomHeight || roomDims.height,
            depth: (element as CeilingSoffitElement).roomDepth || roomDims.depth
          }}
          soffitDepth={(element as CeilingSoffitElement).soffitDepth || 0.675}
          soffitDrop={(element as CeilingSoffitElement).soffitDrop || 0.25}
          soffitThickness={(element as CeilingSoffitElement).soffitThickness || 0.08}
          lightSpacing={(element as CeilingSoffitElement).lightSpacing || 2.0}
          woodColor={(element as CeilingSoffitElement).woodColor || '#D4BE94'}
          lightColor={(element as CeilingSoffitElement).lightColor || '#ffffff'}
          lightIntensity={(element as CeilingSoffitElement).lightIntensity || 0.8}
          lightTemperature={(element as CeilingSoffitElement).lightTemperature || 4500}
        />
      )
      
    case 'honeycomb_wall': {
      // Anchor honeycomb feature to current wall plane based on rotation (support WEST wall)
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        // SOUTH wall (front): z positive
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        // NORTH wall (back): z negative
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        // WEST wall: x negative
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        // EAST wall: x positive
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <HoneycombFeatureWall
          position={adjPos}
          rotation={rotation}
          wallWidth={(element as HoneycombWallElement).wallWidth || 20}
          wallHeight={(element as HoneycombWallElement).wallHeight || 7}
          hexSize={(element as HoneycombWallElement).hexSize || 1.0}
          gapSize={(element as HoneycombWallElement).gapSize || 0.02}
          protrusionRatio={(element as HoneycombWallElement).protrusionRatio || 0.3}
        />
      )
    }
      
    case 'wooden_panel_backdrop': {
      const eps = 0.03
      const near = (a: number, b: number, t = 0.02) => Math.abs(a - b) < t
      const rotY = rotation[1] || 0
      let ry = rotY
      if (ry > Math.PI) ry -= Math.PI * 2
      if (ry < -Math.PI) ry += Math.PI * 2
      let adjPos: [number, number, number] = position as any
      if (near(Math.abs(ry), Math.PI)) {
        adjPos = [position[0], position[1], roomDims.depth / 2 - eps]
      } else if (near(ry, 0)) {
        adjPos = [position[0], position[1], -roomDims.depth / 2 + eps]
      } else if (near(ry, Math.PI / 2)) {
        adjPos = [-roomDims.width / 2 + eps, position[1], position[2]]
      } else if (near(ry, -Math.PI / 2)) {
        adjPos = [roomDims.width / 2 - eps, position[1], position[2]]
      }
      return (
        <WoodenPanelBackdrop
          position={adjPos}
          rotation={rotation}
          panelWidth={(element as WoodenPanelBackdropElement).panelWidth || 8}
          panelHeight={(element as WoodenPanelBackdropElement).panelHeight || 4.8}
          panelThickness={(element as WoodenPanelBackdropElement).panelThickness || 0.06}
          slatWidth={(element as WoodenPanelBackdropElement).slatWidth || 0.12}
          gapWidth={(element as WoodenPanelBackdropElement).gapWidth || 0.015}
          woodColor={(element as WoodenPanelBackdropElement).woodColor || '#7B6048'}
          hasLEDStrip={(element as WoodenPanelBackdropElement).hasLEDStrip ?? true}
          ledColor={(element as WoodenPanelBackdropElement).ledColor || '#ffffff'}
          boardDimensions={(element as WoodenPanelBackdropElement).boardDimensions || [6, 3.6]}
        />
      )
    }
  
    default:
      // 3) Final fallback — visibly flag unknown decor
      return (
        <UnknownDecor
          type={String((element as any)?.type || 'unknown')}
          position={position as [number, number, number]}
          rotation={rotation as [number, number, number]}
          scale={scale as [number, number, number]}
        />
      )
  }
}

// Default room structure fallback
function DefaultRoomStructure({ config }: { config: RoomConfig }) {
  const isLightTheme = config.environment?.lighting === 'bright'
  
  return (
    <group>
      {/* Default large room structure */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.1, 0]} receiveShadow>
          <boxGeometry args={[50, 0.2, 50]} />
          <meshStandardMaterial 
            color={isLightTheme ? "#f5f5f5" : "#2c3e50"} 
            roughness={0.8}
          />
        </mesh>
      </RigidBody>
      
      {/* Default walls */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 5, -25]} receiveShadow>
          <boxGeometry args={[50, 10, 0.2]} />
          <meshStandardMaterial 
            color={isLightTheme ? "#ffffff" : "#34495e"}
            roughness={0.7}
          />
        </mesh>
      </RigidBody>
      
      <Text
        position={[0, 7, -9.5]}
        fontSize={1.2}
        color={isLightTheme ? "#2c3e50" : "white"}
        anchorX="center"
        anchorY="middle"
      >
        {config.name}
      </Text>
    </group>
  )
}
