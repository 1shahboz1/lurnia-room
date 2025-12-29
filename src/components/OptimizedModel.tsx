import * as React from 'react'
import * as THREE from 'three'
import { useOptimizedGLB } from '@/utils/glb-core'

// Minimal but snapshot-aligned OptimizedModel: loads GLB, computes bbox-derived center, reports world center,
// supports optional auto-scale (disabled when disableAutoScale=true), honors suppressRender.
export default function OptimizedModel(props: any) {
  const {
    name,
    basePath,
    rotation = [0, 0, 0],
    scale = 1,
    quality = 'medium',
    onLoad,
    onError,
    onClick,
    onHover,
    onCenterCalculated,
    suppressRender,
    disableAutoScale = false,
  } = props

  const { gltf, loading, error } = useOptimizedGLB(basePath, quality)
  const wrapperRef = React.useRef<THREE.Group>(null)
  const [currentScale, setCurrentScale] = React.useState<[number, number, number]>(
    Array.isArray(scale) ? (scale as [number, number, number]) : [scale, scale, scale]
  )
  const [offsetY, setOffsetY] = React.useState(0)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)
  const [centerLocal, setCenterLocal] = React.useState<THREE.Vector3 | null>(null)

  React.useEffect(() => {
    if (gltf && !hasLoadedOnce) {
      setHasLoadedOnce(true)
      try { onLoad?.(gltf as any) } catch {}
    }
  }, [gltf, hasLoadedOnce, onLoad])

  React.useEffect(() => {
    if (error) {
      try { onError?.(String(error)) } catch {}
    }
  }, [error, onError])

  // Compute bbox once GLTF is available and set: offsetY to place base on Y=0, center for labels/gizmo.
  React.useEffect(() => {
    if (!gltf?.scene) return

    // Compute bounding box in GLB local space
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    // Optional mild auto-scale for extreme sizes (skip when disableAutoScale=true)
    if (!disableAutoScale) {
      const incoming = currentScale
      let next = incoming
      if (isFinite(maxDim) && maxDim > 0) {
        if (maxDim > 3 || maxDim < 0.3) {
          const target = 1.5
          const f = target / maxDim
          next = [f, f, f]
        } else {
          next = [incoming[0], incoming[1], incoming[2]]
        }
      }
      const changed = Math.abs(next[0] - incoming[0]) > 1e-6 || Math.abs(next[1] - incoming[1]) > 1e-6 || Math.abs(next[2] - incoming[2]) > 1e-6
      if (changed) setCurrentScale(next)
    }

    // Calculate offsetY so that minY after scaling sits at 0 in wrapper space
    const effY = currentScale[1]
    const yMinScaled = box.min.y * effY
    const yOffset = 0 - yMinScaled
    setOffsetY(yOffset)

    // Store local-space center (pure bbox midpoint in GLB space)
    setCenterLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2))
  }, [gltf, disableAutoScale])

  // Report world-space center whenever center/scale/offset changes
  React.useEffect(() => {
    if (!centerLocal || !wrapperRef.current) return
    const local = new THREE.Vector3(centerLocal.x, centerLocal.y + offsetY, centerLocal.z)
    const world = wrapperRef.current.localToWorld(local.clone())
    try { onCenterCalculated?.(world) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLocal, offsetY, currentScale])

  if (loading || suppressRender) return null
  if (!gltf) return null

  const rotVec: [number, number, number] = Array.isArray(rotation) ? (rotation as [number, number, number]) : [0, 0, 0]

  return (
    <group
      ref={wrapperRef}
      position={[0, 0, 0]}
      rotation={rotVec}
      scale={currentScale}
      onClick={onClick}
      onPointerOver={onHover ? () => onHover(true) : undefined}
      onPointerOut={onHover ? () => onHover(false) : undefined}
    >
      {/* Lift the GLB so its base touches Y=0 in wrapper space */}
      <group position={[0, offsetY, 0]}>
        {!suppressRender && <primitive object={gltf.scene} />}
      </group>
    </group>
  )
}
