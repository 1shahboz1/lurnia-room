'use client'

import React from 'react';
import { useGLTF } from '@react-three/drei';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { GLTF } from 'three-stdlib';
import * as THREE from 'three';
import { BlueBoundingBoxOutline } from '@/components/BlueBoundingBoxOutline';
import type { RoomDescription } from './room-loader';
import { log } from './logger';

// Texture optimization utilities to prevent Three.js conversion warnings
function optimizeTexture(texture: THREE.Texture): THREE.Texture {
  if (!texture || !texture.isTexture) return texture

  // Downscale overly-large embedded textures (many inventory GLBs ship with 4K PNGs).
  // This keeps VRAM usage reasonable and prevents FPS drops near device clusters.
  try {
    const img: any = (texture as any).image
    const w = Number(img?.width ?? img?.naturalWidth ?? 0)
    const h = Number(img?.height ?? img?.naturalHeight ?? 0)
    const maxSide = Math.max(w, h)

    // Only do this once per texture instance
    if (maxSide > 0 && !(texture as any).__aiRoomsDownscaled) {
      // Tiered clamp:
      // - 4096+ → 1024 (very aggressive, but avoids multi-hundred-MB VRAM spikes)
      // - 2048+ → 2048
      const targetMax = maxSide >= 4096 ? 1024 : maxSide > 2048 ? 2048 : 0
      if (targetMax && maxSide > targetMax && typeof document !== 'undefined') {
        const scale = targetMax / maxSide
        const newW = Math.max(1, Math.round(w * scale))
        const newH = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = newW
        canvas.height = newH
        const ctx = canvas.getContext('2d')
        if (ctx && typeof ctx.drawImage === 'function') {
          ctx.drawImage(img, 0, 0, newW, newH)
          ;(texture as any).image = canvas
          ;(texture as any).__aiRoomsDownscaled = { from: [w, h], to: [newW, newH] }
        }
      }
    }
  } catch {}

  // Set appropriate color space based on texture type
  if (texture.name && texture.name.includes('normal')) {
    texture.colorSpace = THREE.NoColorSpace
  } else {
    texture.colorSpace = THREE.SRGBColorSpace
  }

  // Improve sharpness: enable mipmaps and higher quality minification
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipMapLinearFilter
  texture.magFilter = THREE.LinearFilter
  ;(texture as any).anisotropy = Math.max((texture as any).anisotropy || 0, 4)
  texture.flipY = false

  // Ensure texture is uploaded to GPU immediately
  texture.needsUpdate = true

  return texture
}

function optimizeMaterial(material: THREE.Material): THREE.Material {
  if (!material) return material
  
  const textureProps = [
    'map', 'normalMap', 'bumpMap', 'displacementMap',
    'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'alphaMap', 'lightMap', 'envMap'
  ] as const
  
  textureProps.forEach(prop => {
    const texture = (material as any)[prop]
    if (texture) {
      optimizeTexture(texture)
    }
  })
  
  return material
}

function optimizeGLTFTextures(gltf: GLTF): GLTF {
  if (!gltf || !gltf.scene) return gltf
  
  gltf.scene.traverse((child: any) => {
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(optimizeMaterial)
      } else {
        optimizeMaterial(child.material)
      }
    }
  })
  
  return gltf
}


// Model optimization levels
export type ModelQuality = 'high' | 'medium' | 'low';

export interface GLBModelConfig {
  name: string;
  basePath: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  quality?: ModelQuality;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

// Get the best available model file based on quality preference
export function getModelPath(baseName: string, quality: ModelQuality = 'medium'): string {
  const basePath = `/models/${baseName}`;
  
  switch (quality) {
    case 'high':
      // Try KTX2 version first, then original
      return `${basePath}_ktx2.glb`;
    case 'medium':
      // Try optimized version first
      return `${basePath}_opt.glb`;
    case 'low':
      // Always use optimized version
      return `${basePath}_opt.glb`;
    default:
      return `${basePath}.glb`;
  }
}

// Get fallback model paths in order of preference (using original files to avoid KTX2)
export function getModelFallbacks(baseName: string, quality: ModelQuality): string[] {
  const paths = [];
  const basePath = `/models/${baseName}`;
  
  // For now, only use the original GLB files without KTX2 textures
  paths.push(`${basePath}.glb`);
  
  return paths;
}

// Hook for loading GLB models with smart optimization
export function useOptimizedGLB(modelName: string, quality: ModelQuality = 'medium') {
  const modelPath = useMemo(() => {
    if (!modelName) return '';

    // New: allow absolute or already-suffixed paths
    // - If starts with '/', treat as absolute URL (e.g., "/rooms/firewall/assets/fw.abc123.glb")
    // - If ends with '.glb' and is relative, prefix with '/'
    if (modelName.startsWith('/')) return modelName;
    if (modelName.toLowerCase().endsWith('.glb')) return `/${modelName}`;

    // Existing behavior: inventory and models
    // If modelName starts with 'inventory/', use as-is from root
    // Otherwise, assume it's in /models/ directory
    const finalPath = modelName.startsWith('inventory/')
      ? `/${modelName}.glb` // Inventory items: /inventory/desktops/gaming_desktop_pc.glb
      : `/models/${modelName}.glb`; // Regular models: /models/router.glb

    return finalPath;
  }, [modelName]);

  // Use the drei useGLTF hook - works with Suspense
  // Provide a fallback to router.glb only if no modelPath is determined
  const gltfResult = useGLTF(modelPath || '/models/router.glb');
  
  // Optimize textures to prevent Three.js conversion warnings
  const gltf = useMemo(() => {
    if (modelPath && gltfResult) {
      return optimizeGLTFTextures(gltfResult)
    }
    return null
  }, [modelPath, gltfResult]);
  
  return {
    gltf,
    loading: false, // Loading is handled by Suspense
    error: null, // Error handling is done at the Suspense level
    modelPath,
  };
}

// Enhanced model component with physics and interactions
export interface ModelProps extends GLBModelConfig {
  onLoad?: (gltf: GLTF) => void;
  onError?: (error: string) => void;
  enablePhysics?: boolean;
  physicsType?: 'static' | 'dynamic' | 'kinematic';
  interactive?: boolean;
  onClick?: (e?: any) => void;
  onHover?: (hovered: boolean) => void;
  showClickArea?: boolean; // Debug toggle to show clickable area
  showSelectionOutline?: boolean; // Show blue outline when selected in edit mode
  showCenter?: boolean; // Show green sphere at the calculated center of the GLB item
  showCenterAlways?: boolean; // Always show center sphere (debug mode)
  onPositionChange?: (newPosition: [number, number, number], isDragging?: boolean) => void; // Callback for position changes
  onScaleChange?: (newScale: number | [number, number, number]) => void; // Callback for scale changes
  onCenterCalculated?: (center: THREE.Vector3) => void; // Callback when blue wireframe center is calculated
  parentGroupRef?: React.RefObject<THREE.Group>; // Optional: apply scale to parent group
  suppressRender?: boolean; // If true, do not render the primitive yet (e.g., until pivot is applied)
  disableAutoScale?: boolean; // If true, do not auto-scale based on bounding box; respect provided scale
}

export function OptimizedModel({
  name,
  basePath,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  quality = 'medium',
  castShadow = false,
  receiveShadow = false,
  onLoad,
  onError,
  enablePhysics = false,
  physicsType = 'static',
  interactive = false,
  onClick,
  onHover,
  showClickArea = false,
  showSelectionOutline = false,
  showCenter = false,
  showCenterAlways = false,
  onPositionChange,
  onCenterCalculated,
  parentGroupRef,
  disableAutoScale = false,
  ...props
}: ModelProps) {
  const [hovered, setHovered] = useState(false);
  const { gltf, loading, error, modelPath } = useOptimizedGLB(basePath, quality);
  const [meshes, setMeshes] = useState<THREE.Mesh[]>([]);
  const [boundingBox, setBoundingBox] = useState<THREE.Box3 | null>(null)
  const [currentScale, setCurrentScale] = useState(scale)
  const [currentPosition, setCurrentPosition] = useState(position)
  const [offsetY, setOffsetY] = useState(0)
  const [autoScaled, setAutoScaled] = useState(false)
  const [sceneClone, setSceneClone] = useState<THREE.Object3D | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false) // Prevent multiple onLoad calls
  const [centerPosition, setCenterPosition] = useState<THREE.Vector3 | null>(null) // Calculated center of GLB based on bounding box
  const initDoneRef = useRef(false)
  
  // Reset hasLoadedOnce if the underlying model path changes
  useEffect(() => {
    setHasLoadedOnce(false)
    initDoneRef.current = false
  }, [modelPath])
  
  // Movement drag state
  const [isMoving, setIsMoving] = useState(false)
  const isMovingRef = useRef(false)
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 })
  const dragStartMouseRef = useRef({ x: 0, y: 0 })
  const [dragStartPosition, setDragStartPosition] = useState([0, 0, 0] as [number, number, number])
  const moveOffsetRef = useRef<THREE.Vector3 | null>(null) // world-space offset between object pivot and initial hit
  const movePlaneRef = useRef<THREE.Plane | null>(null)
  const parentAtDragRef = useRef<THREE.Object3D | null>(null) // contentGroupRef (parent of wrapper)
  const modelRefAtDragRef = useRef<THREE.Object3D | null>(null) // InteractiveModel pivot group
  const modelRefParentAtDragRef = useRef<THREE.Object3D | null>(null) // Parent of pivot group
  const dragStartWrapperWorldRef = useRef(new THREE.Vector3())
  const dragStartModelWorldRef = useRef(new THREE.Vector3())
  const dragStartCenterWorldRef = useRef(new THREE.Vector3())
  const movedRef = useRef(false)
  const lastMoveLogRef = useRef(0)
  const { camera, raycaster, gl } = useThree()
  
  // Simplified mouse movement - no global listeners unless actively dragging
  // This approach should not interfere with camera controls
  
  // Helper: compute intersection with a horizontal plane at the given world Y height
  const intersectMovePlane = (clientX: number, clientY: number, yHeightWorld: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yHeightWorld)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(plane, hit) ?? null
  }
  
  // Helper function to get mouse screen coordinates
  const getMousePosition = (event: any) => {
    return {
      x: event.clientX || 0,
      y: event.clientY || 0
    }
  }
  
  // Handle scale changes from corner sphere dragging
  const handleScaleChange = (newScale: number | [number, number, number]) => {
    setCurrentScale(newScale)
    log.model('OptimizedModel scale changed', {
      modelName: name,
      oldScale: currentScale,
      newScale
    })
  }
  
  // Debug: Only log once per model to prevent spam
  // (Removed excessive logging that caused infinite render loop)
  
  // Debug sphere visibility + report world-space center to parent
  useEffect(() => {
    const shouldShow = showCenter || showCenterAlways

    // If we have a center, compute world position that matches the green sphere
    if (centerPosition && (wrapperRef.current)) {
      const local = new THREE.Vector3(centerPosition.x, centerPosition.y + offsetY, centerPosition.z)
      const world = wrapperRef.current.localToWorld(local.clone())
      onCenterCalculated?.(world.clone())
    }

    if (centerPosition && shouldShow) {
      const wrapperScale = Array.isArray(currentScale) ? currentScale[0] : (typeof currentScale === 'number' ? currentScale : 1)
      const inverseScale = 1 / wrapperScale
      
      console.log(`🟢 SPHERE: ${name} sphere RENDERING (FIXED world size, wrapper space, always visible)`, {
        showCenter,
        showCenterAlways,
        centerPosition: { x: centerPosition.x.toFixed(3), y: centerPosition.y.toFixed(3), z: centerPosition.z.toFixed(3) },
        sphereSize: '0.083',
        wrapperScale: wrapperScale.toFixed(3),
        inverseScale: inverseScale.toFixed(3),
        worldSizeFix: 'Applied inverse scale to maintain consistent world size',
        alwaysOnTop: 'depthTest=false, renderOrder=1000',
        method: 'Pure bounding box (min+max)/2 in wrapper coordinate space'
      })
    } else if (centerPosition && !shouldShow) {
      console.log(`⚪ SPHERE: ${name} sphere hidden`, {
        showCenter,
        showCenterAlways,
        centerPosition: 'calculated but not shown'
      })
    }
  }, [showCenter, showCenterAlways, centerPosition, name, offsetY])

  // Keep world-space center (green sphere) reported to parent while moving/scaling
  useEffect(() => {
    if (centerPosition && wrapperRef.current) {
      const local = new THREE.Vector3(centerPosition.x, centerPosition.y + offsetY, centerPosition.z)
      const world = wrapperRef.current.localToWorld(local.clone())
      onCenterCalculated?.(world.clone())
    }
  }, [centerPosition, offsetY, currentPosition, currentScale])
  
  log.model(`OptimizedModel ${name} props`, {
    name,
    interactive,
    showClickArea,
    showSelectionOutline,
    isRouter: name?.includes('router') || name === 'router',
    isServer: name?.includes('server') || name === 'server',
    gltfExists: !!gltf,
    loading,
    error
  })
  
  // Handle loading states - FIXED: Prevent infinite re-render loop
  // Only call onLoad once per model load, not on every render
  useEffect(() => {
    if (gltf && !hasLoadedOnce) {
      setHasLoadedOnce(true);
      
      // Log success once
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Successfully loaded model: ${name} from ${modelPath}`);
      }
      
      // Call onLoad callback - center will be passed later by BlueBoundingBoxOutline
      onLoad?.(gltf);
      log.loading(`Loaded model: ${modelPath}`);
    }
  }, [gltf, hasLoadedOnce, name, modelPath, onLoad]); // Include onLoad in dependencies for Fast Refresh
  
  useEffect(() => {
    if (error) {
      console.error(`❌ Failed to load model: ${name} from ${modelPath}`, error);
      onError?.(error);
      log.error(`Failed to load model: ${name}`, { error }, 'OptimizedModel');
    }
  }, [error, onError, name, modelPath]);
  
  // Calculate bounding box for the entire GLB model and set floor offset / autoscale (one-time, ordered)
  useEffect(() => {
    if (!gltf?.scene) return

    // Prevent duplicate init in StrictMode/HMR
    if (initDoneRef.current) return

    // Compute bbox first
    const box = new THREE.Box3().setFromObject(gltf.scene)
    setBoundingBox(box)

    const size = box.getSize(new THREE.Vector3())
    const bbCenter = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    if (process.env.NODE_ENV === 'development') {
      try {
        console.log('🧮 AUTOSCALE_CHECK', {
          name,
          incomingScale: scale,
          currentScale,
          autoScaled,
          note: 'Init (one-pass)'
        })
      } catch {}
    }

    // Decide effective scale (single pass)
    const toVec3 = (s: any): [number, number, number] => {
      if (Array.isArray(s)) return [Number(s[0] ?? 1), Number(s[1] ?? 1), Number(s[2] ?? 1)]
      if (typeof s === 'number') return [s, s, s]
      return [1, 1, 1]
    }

    const incoming = toVec3(currentScale)
    let nextScaleVec = incoming
    let scaleFactor = 1

    const nameLc = (name || '').toLowerCase()
    const isInventoryModel = nameLc.includes('inventory/')
    const isKnownRoomModel = nameLc === 'router' || nameLc === 'server'

    if (!disableAutoScale) {
      if (isInventoryModel || !isKnownRoomModel) {
        if (isFinite(maxDim) && maxDim > 0) {
          const targetSize = 1.5
          if (maxDim > 3 || maxDim < 0.3) {
            scaleFactor = targetSize / maxDim
            nextScaleVec = [scaleFactor, scaleFactor, scaleFactor]
            if (process.env.NODE_ENV === 'development') {
              console.log(`📏 Auto-scaled model ${name}: maxDim=${maxDim.toFixed(2)} → factor=${scaleFactor.toFixed(3)} (target=1.5m)`)
            }
          } else {
            nextScaleVec = [1, 1, 1]
            if (process.env.NODE_ENV === 'development') {
              console.log(`📐 Model ${name} kept at unit scale: maxDim=${maxDim.toFixed(2)}m (within range)`)
            }
          }
        }
      }
    }

    // Apply scale if changed (notify parent once)
    const changed = Math.abs(nextScaleVec[0] - incoming[0]) > 1e-6 || Math.abs(nextScaleVec[1] - incoming[1]) > 1e-6 || Math.abs(nextScaleVec[2] - incoming[2]) > 1e-6
    if (changed) {
      setCurrentScale(nextScaleVec)
      try { props.onScaleChange?.(nextScaleVec) } catch {}
    }
    setAutoScaled(true)

    // Compute offsetY against the effective scale we've decided (not state, to avoid race)
    const effY = nextScaleVec[1]
    const finalMinY = box.min.y * effY
    const yOffset = 0 - finalMinY
    setOffsetY(yOffset)

    // Compute center purely from bbox in wrapper space
    setCenterPosition(new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2,
    ))

    // Debug log snapshot
    try {
      const scaledSize = { x: (size.x * nextScaleVec[0]).toFixed(2), y: (size.y * nextScaleVec[1]).toFixed(2), z: (size.z * nextScaleVec[2]).toFixed(2) }
      const scaledCenter = { x: (bbCenter.x * nextScaleVec[0]).toFixed(2), y: (bbCenter.y * nextScaleVec[1]).toFixed(2), z: (bbCenter.z * nextScaleVec[2]).toFixed(2) }
      log.model(`Calculated bounding box for ${name}`, {
        originalSize: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
        scaledSize,
        originalCenter: { x: bbCenter.x.toFixed(2), y: bbCenter.y.toFixed(2), z: bbCenter.z.toFixed(2) },
        scaledCenter,
        effectiveScale: { x: nextScaleVec[0], y: nextScaleVec[1], z: nextScaleVec[2] },
        originalMinY: box.min.y.toFixed(2),
        scaledMinY: (finalMinY).toFixed(2),
        offsetY: yOffset.toFixed(2),
        autoScaled: !disableAutoScale
      })
      console.log(`🟢 CENTER: ${name} calculated center (pure bounding box method, wrapper coordinate space)`, {
        boundingBox: { 
          min: { x: box.min.x.toFixed(3), y: box.min.y.toFixed(3), z: box.min.z.toFixed(3) },
          max: { x: box.max.x.toFixed(3), y: box.max.y.toFixed(3), z: box.max.z.toFixed(3) }
        },
        pureBBCenter: { x: ((box.min.x + box.max.x)/2).toFixed(3), y: ((box.min.y + box.max.y)/2).toFixed(3), z: ((box.min.z + box.max.z)/2).toFixed(3) },
        coordinateSpace: 'wrapper (scaled automatically)',
        scaleFactor: scaleFactor.toFixed(3),
        yOffset: yOffset.toFixed(3),
        oldGLBCenter: { x: bbCenter.x.toFixed(3), y: bbCenter.y.toFixed(3), z: bbCenter.z.toFixed(3) },
        showCenter,
        showCenterAlways,
        willShowSphere: showCenter || showCenterAlways
      })
    } catch {}

    initDoneRef.current = true
  }, [gltf, name, disableAutoScale])
  
  // Configure shadows and click detection for all meshes
  useEffect(() => {
    if (gltf?.scene && interactive) {
      log.model(`Setting up interactive GLB model: ${name}`)
      
      const meshes: THREE.Mesh[] = []
      gltf.scene.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = castShadow;
          child.receiveShadow = receiveShadow;
          
          // CRITICAL: Enable raycast for click detection
          child.userData.interactive = true;
          child.userData.modelName = name;
          child.userData.onClick = onClick;
          
          // Ensure geometry has proper bounding box for raycast
          if (child.geometry) {
            child.geometry.computeBoundingBox()
            child.geometry.computeBoundingSphere()
          }
          
          // Store reference for debugging
          meshes.push(child)
          
          log.model(`Made mesh interactive: ${child.name || 'unnamed'} for model ${name}`, {
            hasGeometry: !!child.geometry,
            vertexCount: child.geometry?.attributes?.position?.count || 0,
            boundingBox: child.geometry?.boundingBox,
            material: child.material?.type
          })
        }
      });
      
      // Store meshes for debugging
      setMeshes(meshes)

      // Expose cached raycast meshes on wrapper and parent (InteractiveModel group)
      try {
        if (wrapperRef.current) {
          wrapperRef.current.userData.raycastMeshes = meshes
          if (wrapperRef.current.parent) {
            wrapperRef.current.parent.userData = wrapperRef.current.parent.userData || {}
            wrapperRef.current.parent.userData.raycastMeshes = meshes
          }
        }
      } catch {}
      
      // Also set up the scene root
      gltf.scene.userData.interactive = true;
      gltf.scene.userData.modelName = name;
      gltf.scene.userData.onClick = onClick;
      
      log.model(`GLB model ${name} set up for interaction`, {
        totalMeshes: meshes.length,
        modelName: name
      })
    } else if (gltf?.scene) {
      // Non-interactive setup - just shadows
      gltf.scene.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = castShadow;
          child.receiveShadow = receiveShadow;
        }
      });
    }
  }, [gltf, castShadow, receiveShadow, interactive, onClick, name]);

  // Create a single scene clone per model instance when GLTF is ready
  useEffect(() => {
    if (gltf?.scene) {
      // Deep clone hierarchy; geometry/material references are shared
      const clone = gltf.scene.clone(true)
      setSceneClone(clone)
    } else {
      setSceneClone(null)
    }
  }, [gltf])
  
  // Cleanup scene clone when component unmounts
  useEffect(() => {
    return () => {
      if (sceneClone) {
        // Dispose of any cloned materials and geometries
        sceneClone.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // For cloned scenes, we generally don't dispose geometry/materials
            // as they're shared with the original GLTF
            // The scene clone disposal will be handled by React Three Fiber
          }
        })
      }
    }
  }, [sceneClone, gltf])

  // Keep GLB mesh raycasting enabled even when selection outline is visible.
  // We rely on handle hit areas (higher renderOrder) to intercept events first.
  
  if (loading) {
    // Show loading placeholder - a simple animated box
    return (
      <group position={currentPosition} rotation={rotation}>
        <mesh>
          <boxGeometry args={[1, 0.5, 1]} />
          <meshStandardMaterial 
            color="#e0e0e0" 
            transparent 
            opacity={0.6}
            wireframe={false}
          />
        </mesh>
        {/* Loading indicator dot */}
        <mesh position={[0, 0.8, 0]}>
          <sphereGeometry args={[0.1]} />
          <meshBasicMaterial color="#2196f3" />
        </mesh>
      </group>
    );
  }
  
  if (error || !gltf) {
    // Show error fallback - a red wireframe box
    log.error(`Failed to load model at ${position}`, { error }, 'OptimizedModel');
    return (
      <group position={currentPosition} rotation={rotation}>
        <mesh>
          <boxGeometry args={[1, 0.5, 1]} />
          <meshStandardMaterial 
            color="#ff5722" 
            transparent 
            opacity={0.4}
            wireframe={true}
          />
        </mesh>
        {/* Error indicator */}
        <mesh position={[0, 0.8, 0]}>
          <sphereGeometry args={[0.08]} />
          <meshBasicMaterial color="#f44336" />
        </mesh>
      </group>
    );
  }


  // Use group wrapper for better click detection
  const wrapperRef = useRef<THREE.Group>(null)

  // Some GLBs (especially character/kitbash assets) can be hard to hit with raycasting.
  // Provide a simple, invisible bounding-box pick proxy when the model is NOT selected,
  // so it can always be selected to show gizmos/center sphere.
  const pickBoxArgs = useMemo(() => {
    if (!boundingBox) return null
    try {
      const s = boundingBox.getSize(new THREE.Vector3())
      const pad = 1.06
      const min = 0.05
      return [
        Math.max(min, s.x * pad),
        Math.max(min, s.y * pad),
        Math.max(min, s.z * pad),
      ] as [number, number, number]
    } catch {
      return null
    }
  }, [boundingBox])

  return (
    <group
      ref={wrapperRef}
      position={[0, 0, 0]}
      rotation={rotation}
      scale={currentScale}
      {...props}
    >
      <group position={[0, offsetY, 0]}>
        {!showSelectionOutline && interactive && centerPosition && pickBoxArgs && (
          <mesh
            position={[centerPosition.x, centerPosition.y, centerPosition.z]}
            onPointerOver={(e: any) => {
              e.stopPropagation()
              setHovered(true)
              onHover?.(true)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={(e: any) => {
              e.stopPropagation()
              setHovered(false)
              onHover?.(false)
              document.body.style.cursor = 'auto'
            }}
            onClick={(evt: any) => {
              evt?.stopPropagation?.()
              // Match the primitive click behavior (delay avoids some race conditions)
              setTimeout(() => {
                onClick?.(evt)
              }, 10)
            }}
          >
            <boxGeometry args={pickBoxArgs} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} colorWrite={false} />
          </mesh>
        )}

        {!props.suppressRender && (
          <primitive 
            object={sceneClone || gltf.scene} 
          onPointerOver={interactive ? (e: any) => {
            // If hovering over the primitive while selected, show move cursor
            const isSelected = showSelectionOutline
            e.stopPropagation();
            setHovered(true);
            onHover?.(true);
            // If a handle is hovered, BlueBoundingBoxOutline sets cursor; otherwise show move cursor to hint drag
            if (isSelected) {
              document.body.style.cursor = 'move'
            } else {
              document.body.style.cursor = 'pointer'
            }
          } : undefined}
onPointerOut={interactive ? (e: any) => {
              e.stopPropagation();
              setHovered(false);
              onHover?.(false);
              document.body.style.cursor = 'auto';
            } : undefined}
onPointerDown={interactive ? (e: any) => {
            // Enable free drag translation only when bounding box is visible (edit mode + selected)
            if (!showSelectionOutline) return
            // If hovering a scaling handle, don't start free drag
            if (typeof window !== 'undefined') {
              const w = window as any
              if (w.globalGizmoState?.isHovering) {
                console.log(`🧲 DRAG BLOCKED: handle hover active for ${name}`)
                return
              }
            }
            e.stopPropagation()
            const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0
            const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0
            // Defer to gizmo arrow if pointer is over it (arrow priority)
            try {
              const w = window as any
              if (typeof w.__testArrowHit === 'function' && w.__testArrowHit(clientX, clientY)) {
                console.log(`🧲 DRAG BLOCKED: arrow priority for ${name}`)
                return
              }
              if (typeof w.__testRingHitInfo === 'function') {
                const info = w.__testRingHitInfo(clientX, clientY)
                if (info && typeof w.__ringDragByUuid === 'function') {
                  console.log(`🧲 DRAG BLOCKED: ring priority for ${name}`)
                  w.__ringDragByUuid(info.uuid, clientX, clientY)
                  return
                }
              }
            } catch {}
            setDragStartMouse({ x: clientX, y: clientY })
            dragStartMouseRef.current = { x: clientX, y: clientY }
            setDragStartPosition(currentPosition as [number, number, number])
            movedRef.current = false

            // Determine move plane at the object's current world height (robust against camera angle)
            const tmpWp = new THREE.Vector3()
            const yPlane = (wrapperRef.current?.getWorldPosition(tmpWp).y ?? 0)
            // Compute initial world hit point
            const hit = intersectMovePlane(clientX, clientY, yPlane)

            // Capture parent chain at drag start for correct local conversions
            parentAtDragRef.current = wrapperRef.current?.parent || null // contentGroupRef
            modelRefAtDragRef.current = (wrapperRef.current?.parent as THREE.Object3D | null)?.parent || null
            modelRefParentAtDragRef.current = (modelRefAtDragRef.current as THREE.Object3D | null)?.parent || null

            // Optional: capture pointer so we continue to receive pointer events
            const pid = e.pointerId ?? e.nativeEvent?.pointerId
            try { (e.target as any)?.setPointerCapture?.(pid) } catch {}

            if (hit && wrapperRef.current) {
              const wrapperWorldPos = new THREE.Vector3()
              wrapperRef.current.getWorldPosition(wrapperWorldPos)
              // world-space offset between object pivot and initial hit point
              moveOffsetRef.current = new THREE.Vector3(
                wrapperWorldPos.x - hit.x,
                0,
                wrapperWorldPos.z - hit.z
              )
              movePlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yPlane)

              // Snapshot starting world positions for stable delta computations
              dragStartWrapperWorldRef.current.copy(wrapperWorldPos)
              if (modelRefAtDragRef.current) {
                const startModelWorld = new THREE.Vector3()
                modelRefAtDragRef.current.getWorldPosition(startModelWorld)
                dragStartModelWorldRef.current.copy(startModelWorld)
              }
              // Snapshot starting world center of the green sphere for zero-lag gizmo follow
              if (centerPosition && wrapperRef.current) {
                const localCenter = new THREE.Vector3(centerPosition.x, centerPosition.y + offsetY, centerPosition.z)
                const startCenterWorld = wrapperRef.current.localToWorld(localCenter.clone())
                dragStartCenterWorldRef.current.copy(startCenterWorld)
              }

              console.log(`🧲 DRAG START: ${name}`, { client: { x: clientX, y: clientY }, yPlane, hit: { x: hit.x, y: hit.y, z: hit.z }, wrapperWorldPos: { x: wrapperWorldPos.x, y: wrapperWorldPos.y, z: wrapperWorldPos.z }, offset: { x: moveOffsetRef.current.x, y: moveOffsetRef.current.y, z: moveOffsetRef.current.z }, parent: parentAtDragRef.current?.name || '(anon parent)' })
            } else {
              moveOffsetRef.current = new THREE.Vector3(0, 0, 0)
              movePlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yPlane)
              console.log(`🧲 DRAG START: ${name} (no initial hit)`, { client: { x: clientX, y: clientY }, yPlane, parent: parentAtDragRef.current?.name || '(anon parent)' })
            }
            
            setIsMoving(true)
            isMovingRef.current = true
            if (typeof window !== 'undefined') {
              const w = window as any
              w.globalGizmoState = { 
                ...(w.globalGizmoState || {}), 
                isTranslating: true,
                lastActivity: Date.now()
              }
            }
            document.body.style.cursor = 'grabbing'
            
            const handleMove = (ev: PointerEvent) => {
              if (!isMovingRef.current) return
              const pt = intersectMovePlane(ev.clientX, ev.clientY, yPlane)
              if (pt) {
                const off = moveOffsetRef.current || new THREE.Vector3(0, 0, 0)
                const targetWorld = new THREE.Vector3(pt.x + off.x, pt.y + off.y, pt.z + off.z)

                // Activate gizmo drag state only after a small movement threshold to avoid blocking camera on simple clicks
                if (!movedRef.current) {
                  const dx = ev.clientX - dragStartMouseRef.current.x
                  const dy = ev.clientY - dragStartMouseRef.current.y
                  if (Math.hypot(dx, dy) > 2) {
                    movedRef.current = true
                    if (typeof window !== 'undefined') {
                      const w = window as any
                      w.globalGizmoState = { 
                        ...(w.globalGizmoState || {}), 
                        isDragging: true,
                        lastActivity: Date.now()
                      }
                    }
                    console.log(`🧲 DRAG ACTIVE: ${name} threshold passed (dx=${dx}, dy=${dy})`)
                  }
                }

                // Convert desired world position to parent's local space
                const modelRefParent = modelRefParentAtDragRef.current
                const modelRefObj = modelRefAtDragRef.current
                if (modelRefParent && modelRefObj) {
                  // Compute desired modelRef world position by applying the same world delta as wrapper
                  const targetWrapperWorld = new THREE.Vector3(pt.x + off.x, pt.y + off.y, pt.z + off.z)
                  const worldDelta = targetWrapperWorld.clone().sub(dragStartWrapperWorldRef.current)
                  const desiredModelWorld = dragStartModelWorldRef.current.clone().add(worldDelta)

                  // Convert to modelRef parent's local space to set modelRef.position
                  const nextLocal = modelRefParent.worldToLocal(desiredModelWorld.clone())
                  const nextPos: [number, number, number] = [nextLocal.x, nextLocal.y, nextLocal.z]
                  
                  // Throttled debug logging of move updates
                  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                  if (now - lastMoveLogRef.current > 120) {
                    lastMoveLogRef.current = now
                    console.log(`🧲 DRAG MOVE: ${name}`, {
                      pt: { x: pt.x.toFixed(3), y: pt.y.toFixed(3), z: pt.z.toFixed(3) },
                      targetWrapperWorld: { x: targetWrapperWorld.x.toFixed(3), y: targetWrapperWorld.y.toFixed(3), z: targetWrapperWorld.z.toFixed(3) },
                      desiredModelWorld: { x: desiredModelWorld.x.toFixed(3), y: desiredModelWorld.y.toFixed(3), z: desiredModelWorld.z.toFixed(3) },
                      nextPos: { x: nextPos[0].toFixed(3), y: nextPos[1].toFixed(3), z: nextPos[2].toFixed(3) }
                    })
                  }
                  
                  // Inform parent to apply movement with isDragging=true to skip clamping during drag
                  onPositionChange?.(nextPos, true)

                  // Heartbeat for watchdog while moving
                  try {
                    if (typeof window !== 'undefined') {
                      const w = window as any
                      w.globalGizmoState = { ...(w.globalGizmoState || {}), lastActivity: Date.now() }
                    }
                  } catch {}

                  // Also emit updated world center using the same world delta (prevents 1-frame lag)
                  if (centerPosition) {
                    const worldCenter = dragStartCenterWorldRef.current.clone().add(worldDelta)
                    onCenterCalculated?.(worldCenter)
                  }
                }
              } else {
                // No plane intersection - likely above/below horizon
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                if (now - lastMoveLogRef.current > 250) {
                  lastMoveLogRef.current = now
                  console.log(`🧲 DRAG MOVE: ${name} - no plane hit at y=${yPlane}`)
                }
              }
            }
            const handleUp = (ev: PointerEvent) => {
              setIsMoving(false)
              isMovingRef.current = false
              movedRef.current = false // Reset moved state
              if (typeof window !== 'undefined') {
                const w = window as any
                w.globalGizmoState = { 
                  ...(w.globalGizmoState || {}), 
                  isDragging: false, 
                  isTranslating: false, 
                  isHovering: false,
                  lastActivity: Date.now()
                }
                console.log('📍 GLB DRAG END: Global state reset', w.globalGizmoState)
              }
              document.body.style.cursor = 'auto'

              // Release pointer capture if set
              const pid = (e as any).pointerId ?? (e as any).nativeEvent?.pointerId
              try { (e.target as any)?.releasePointerCapture?.(pid) } catch {}

              console.log(`🧲 DRAG END: ${name}`, { moved: movedRef.current, finalPos: wrapperRef.current ? { x: wrapperRef.current.position.x, y: wrapperRef.current.position.y, z: wrapperRef.current.position.z } : '(no wrapper)' })
              
              // Emit final world center to ensure gizmo snaps to the latest position
              if (centerPosition && wrapperRef.current) {
                const localCenter = new THREE.Vector3(centerPosition.x, centerPosition.y + offsetY, centerPosition.z)
                const worldCenter = wrapperRef.current.localToWorld(localCenter.clone())
                onCenterCalculated?.(worldCenter.clone())
              }

              // Clamp position now that dragging has ended (to ensure it stays in bounds)
              if (movedRef.current && modelRefAtDragRef.current) {
                const modelRefParent = modelRefParentAtDragRef.current
                if (modelRefParent) {
                  const currentWorldPos = new THREE.Vector3()
                  modelRefAtDragRef.current.getWorldPosition(currentWorldPos)
                  const currentLocal = modelRefParent.worldToLocal(currentWorldPos.clone())
                  const finalPos: [number, number, number] = [currentLocal.x, currentLocal.y, currentLocal.z]
                  console.log(`🧲 DRAG END: ${name} - triggering final clamp`)
                  // Trigger clamping by calling onPositionChange with isDragging=false
                  onPositionChange?.(finalPos, false)
                }
              }

              // Only swallow the next click if an actual drag occurred
              if (movedRef.current) {
                setTimeout(() => {
                  document.addEventListener('click', (evt) => evt.stopPropagation(), { once: true, capture: true })
                }, 0)
              }
              document.removeEventListener('pointermove', handleMove as any)
              document.removeEventListener('pointerup', handleUp as any)
            }
            document.addEventListener('pointermove', handleMove as any)
            document.addEventListener('pointerup', handleUp as any)
          } : undefined}
          onClick={interactive ? (evt: any) => {
            console.log(`📦 GLB PRIMITIVE onClick: ${name} clicked`)
            
            // CRITICAL: Stop propagation to prevent multiple click handlers from firing
            evt?.stopPropagation?.()
            
            // Delay the onClick call slightly to prevent race conditions
            setTimeout(() => {
              onClick?.(evt)
            }, 10)
          } : undefined}
          />
        )}
        
        {/* Blue wireframe bounding box and uniform scaling handles */}
        {showSelectionOutline && (
          <BlueBoundingBoxOutline
            gltf={gltf}
            modelName={name}
            uniformScale={Array.isArray(currentScale) ? (currentScale[0] ?? 1) : (typeof currentScale === 'number' ? currentScale : 1)}
            onUniformScaleChange={(s: number) => {
              // Allow very small models to scale smoothly without jumping
              const clamped = Math.max(0.0005, Math.min(50, s))
              // Single source of truth: update currentScale only; wrapperRef uses this value via React
              const next = [clamped, clamped, clamped] as [number, number, number]
              setCurrentScale(next)
              // Notify parent so it can persist scale
              props.onScaleChange?.(next)
            }}
            isTranslating={isMoving}
          />
        )}
        
        {/* Green sphere at calculated center of GLB based on bounding box */}
        {(showCenter || showCenterAlways) && centerPosition && (() => {
          // Calculate inverse scale to make sphere size consistent in world space
          const wrapperScale = Array.isArray(currentScale) ? currentScale[0] : (typeof currentScale === 'number' ? currentScale : 1)
          const inverseScale = 1 / wrapperScale
          
          return (
            <group position={[centerPosition.x, centerPosition.y, centerPosition.z]}>
              
              {/* Main green center sphere - FIXED world size regardless of wrapper scaling */}
              <mesh renderOrder={1000} scale={[inverseScale, inverseScale, inverseScale]}>
                <sphereGeometry args={[0.083, 20, 20]} />
                <meshStandardMaterial 
                  color="#00ff00" 
                  emissive="#00ff00"
                  emissiveIntensity={0.8}
                  transparent={false}
                  opacity={1.0}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            </group>
          )
        })()}
      </group>

    </group>
  );
}

// Room configuration types
export interface RoomObject {
  id: string;
  type: 'model' | 'primitive';
  modelName?: string; // For GLB models
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  quality?: ModelQuality;
  interactive?: boolean;
  physics?: {
    enabled: boolean;
    type: 'static' | 'dynamic' | 'kinematic';
  };
  metadata?: Record<string, unknown>;
}

export interface RoomConfig {
  id: string;
  name: string;
  description?: string;
  environment?: {
    background?: string;
    lighting?: 'bright' | 'dim' | 'ambient' | 'dramatic';
    shadows?: boolean;
  };
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
  };
  objects: RoomObject[];
  roomStructure?: RoomDescription['structure']; // For room description data
}

// Hook for managing room state
export function useRoomManager(config: RoomConfig) {
  const [loadedObjects, setLoadedObjects] = useState<Record<string, GLTF>>({});
  const [loadingProgress, setLoadingProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleObjectLoad = (objectId: string, gltf: GLTF) => {
    console.log(`🔗 useRoomManager: handleObjectLoad called for ${objectId}`)
    setLoadedObjects(prev => ({ ...prev, [objectId]: gltf }));
    setLoadingProgress(prev => ({ ...prev, [objectId]: 100 }));
  };
  
  const handleObjectError = (objectId: string, error: string) => {
    setErrors(prev => ({ ...prev, [objectId]: error }));
  };
  
  const isFullyLoaded = useMemo(() => {
    return config.objects.every(obj => 
      obj.id in loadedObjects || obj.id in errors
    );
  }, [config.objects, loadedObjects, errors]);
  
  const totalProgress = useMemo(() => {
    if (config.objects.length === 0) return 100;
    
    const loaded = Object.keys(loadedObjects).length;
    const errored = Object.keys(errors).length;
    const completed = loaded + errored;
    
    return Math.round((completed / config.objects.length) * 100);
  }, [config.objects.length, loadedObjects, errors]);
  
  return {
    loadedObjects,
    loadingProgress,
    errors,
    isFullyLoaded,
    totalProgress,
    handleObjectLoad,
    handleObjectError,
  };
}

// Available models in your scenes directory
export const availableModels = {
  router: {
    name: 'Router',
    basePath: 'router',
    category: 'networking',
    description: ''
  },
  server: {
    name: 'Server',
    basePath: 'server', 
    category: 'infrastructure',
    description: ''
  }
} as const;

export type AvailableModelKey = keyof typeof availableModels;

// Preload function for better performance
export function preloadModels(modelNames: AvailableModelKey[], quality: ModelQuality = 'medium') {
  const promises = modelNames.map(modelName => {
    const model = availableModels[modelName];
    const path = getModelPath(model.basePath, quality);
    return useGLTF.preload(path);
  });
  
  return Promise.all(promises);
}

// Utility to get model info
export function getModelInfo(modelName: string, quality: ModelQuality = 'medium') {
  const basePath = `/models/${modelName}`;
  const modelPath = getModelPath(modelName, quality);
  
  return {
    name: modelName,
    path: modelPath,
    basePath,
    quality,
    fallbacks: getModelFallbacks(modelName, quality)
  };
}
