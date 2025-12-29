'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'

export interface BlueBoundingBoxOutlineProps {
  gltf: GLTF
  modelName: string
  uniformScale: number
  onUniformScaleChange: (newScale: number) => void
  isTranslating?: boolean
}

// Blue wireframe bounding box with 8 corner scaling handles
export function BlueBoundingBoxOutline({ gltf, modelName, uniformScale, onUniformScaleChange, isTranslating }: BlueBoundingBoxOutlineProps) {
  const [boundingBoxData, setBoundingBoxData] = useState<{
    size: { x: number, y: number, z: number },
    center: { x: number, y: number, z: number }
  } | null>(null)

  // Scaling interaction state
  const isScalingRef = useRef(false)
  const scaleDragStartY = useRef(0)
  const scaleBase = useRef(1)
  const scaleSign = useRef(1) // +1 for upper handles, -1 for lower handles (inverts effect)

  // Active corner state for visual feedback during scaling
  const [activeCorner, setActiveCorner] = useState<number | null>(null)
  const [isScaling, setIsScaling] = useState(false)

  // Helper: set global gizmo state so camera controls can respect handle interactions
  const setGlobalGizmoState = (partial: any) => {
    if (typeof window !== 'undefined') {
      (window as any).globalGizmoState = {
        ...(window as any).globalGizmoState,
        ...partial,
        lastActivity: Date.now(),
      }
    }
  }

  useEffect(() => {
    if (!gltf?.scene) return

    // Calculate accurate bounding box of the GLB model (in local GLTF space)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    setBoundingBoxData({
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z }
    })
  }, [gltf])

  // Safety: clear dragging/hover flags if the window loses focus or mouse leaves document
  useEffect(() => {
    const onLeave = () => {
      isScalingRef.current = false
      setGlobalGizmoState({ isDragging: false, isHovering: false })
      document.body.style.cursor = 'auto'
    }
    window.addEventListener('blur', onLeave)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  if (!boundingBoxData) return null

  // Compute 8 corners relative to center
  const hx = boundingBoxData.size.x / 2
  const hy = boundingBoxData.size.y / 2
  const hz = boundingBoxData.size.z / 2
  const c = boundingBoxData.center

  const p000: [number, number, number] = [-hx, -hy, -hz]
  const p100: [number, number, number] = [ hx, -hy, -hz]
  const p010: [number, number, number] = [-hx,  hy, -hz]
  const p110: [number, number, number] = [ hx,  hy, -hz]
  const p001: [number, number, number] = [-hx, -hy,  hz]
  const p101: [number, number, number] = [ hx, -hy,  hz]
  const p011: [number, number, number] = [-hx,  hy,  hz]
  const p111: [number, number, number] = [ hx,  hy,  hz]

  const edges: Array<[[number, number, number], [number, number, number]]> = [
    // Bottom face (-y)
    [p000, p100], [p100, p110], [p110, p010], [p010, p000],
    // Top face (+y)
    [p001, p101], [p101, p111], [p111, p011], [p011, p001],
    // Vertical edges
    [p000, p001], [p100, p101], [p110, p111], [p010, p011]
  ]


  const handleCorners: Array<{ pos: [number, number, number], isUpper: boolean }> = [
    { pos: p000, isUpper: false }, { pos: p100, isUpper: false }, { pos: p010, isUpper: true }, { pos: p110, isUpper: true },
    { pos: p001, isUpper: false }, { pos: p101, isUpper: false }, { pos: p011, isUpper: true }, { pos: p111, isUpper: true },
  ]

  const startScaleDrag = (e: any, isUpper: boolean, idx: number) => {
    e.stopPropagation()
    e.preventDefault?.()
    const tgt: any = e.target
    const pid: any = e.pointerId ?? e.nativeEvent?.pointerId
    try { tgt?.setPointerCapture?.(pid) } catch {}

    const clientY = e.nativeEvent?.clientY ?? e.clientY ?? 0
    scaleDragStartY.current = clientY
    scaleBase.current = typeof uniformScale === 'number' ? uniformScale : 1
    scaleSign.current = isUpper ? +1 : -1

    isScalingRef.current = true
    setIsScaling(true)
    setActiveCorner(idx)
    setGlobalGizmoState({ isDragging: true })
    // Show grabbing hand while dragging
    document.body.style.cursor = 'grabbing'

    const onMove = (ev: PointerEvent) => {
      if (!isScalingRef.current) return
      const dy = scaleDragStartY.current - ev.clientY // up = positive
      const sensitivity = 0.01
      const factor = 1 + sensitivity * dy * scaleSign.current
      const newScale = scaleBase.current * factor
      onUniformScaleChange(newScale)
      setGlobalGizmoState({})
      if (Math.random() < 0.1) {
        console.log(`🔶 SCALE MOVE: ${modelName} dy=${dy.toFixed(1)} newScale=${newScale.toFixed(4)}`)
      }
    }

    const onUp = () => {
      isScalingRef.current = false
      setIsScaling(false)
      setActiveCorner(null)
      setGlobalGizmoState({ isDragging: false, isHovering: false })
      // Reset cursor back to default after drag ends
      document.body.style.cursor = 'auto'
      try { tgt?.releasePointerCapture?.(pid) } catch {}
      // Swallow the very next click to avoid Canvas deselection after a drag
      setTimeout(() => {
        document.addEventListener('click', (e) => e.stopPropagation(), { once: true, capture: true })
      }, 0)
      document.removeEventListener('pointermove', onMove as any)
      document.removeEventListener('pointerup', onUp as any)
    }

    document.addEventListener('pointermove', onMove as any)
    document.addEventListener('pointerup', onUp as any)
  }

  // Darker blue theme for both wireframe and spheres (requested)
  const mainColor = '#0a58ca'  // darker blue
  const glowColor = '#3b82f6'  // companion glow (tailwind blue-500)
  const sphereBaseColor = '#0a58ca'
  const sphereActiveColor = '#ff8c00' // darker orange when dragging

  return (
    <group position={[c.x, c.y, c.z]}>
      {/* Box edges (non-interactive) */}
      {edges.map((e, i) => (
        <Line
          key={`edge-main-${i}`}
          points={[e[0], e[1]]}
          color={mainColor}
          lineWidth={2}
          dashed={false}
          depthTest={true}
          transparent
          opacity={0.95}
          renderOrder={1100}
          raycast={() => null as any}
        />
      ))}
      {edges.map((e, i) => (
        <Line
          key={`edge-glow-${i}`}
          points={[e[0], e[1]]}
          color={glowColor}
          lineWidth={4}
          dashed={false}
          depthTest={true}
          transparent
          opacity={0.3}
          renderOrder={1100}
          raycast={() => null as any}
        />
      ))}

      {/* Subtle base highlight to indicate draggable area (non-interactive) */}
      <mesh position={[0, -hy + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null as any}>
        <planeGeometry args={[boundingBoxData.size.x * 0.9, boundingBoxData.size.z * 0.9]} />
        <meshBasicMaterial color={mainColor} transparent opacity={0.08} depthTest={true} depthWrite={false} />
      </mesh>

      {/* Corner handles */}
      {handleCorners.map((h, idx) => (
        <group key={`corner-${idx}`} position={h.pos}>
          {/* Large invisible hit area for easy interactions (disabled while translating) */}
          <mesh
            renderOrder={2000} // Critical for gizmo to defer
            raycast={isTranslating ? (() => null as any) : undefined}
            onPointerDown={isTranslating ? undefined : (e: any) => {
              console.log(`🔶 SCALE HANDLE DOWN: ${modelName} corner=${idx} (isUpper=${h.isUpper})`)
              startScaleDrag(e, h.isUpper, idx)
            }}
            onPointerUp={isTranslating ? undefined : (e: any) => {
              e.stopPropagation()
              e.preventDefault?.()
              console.log(`🔶 SCALE HANDLE UP: ${modelName} corner=${idx}`)
            }}
            onClick={isTranslating ? undefined : (e: any) => {
              e.stopPropagation()
              e.preventDefault?.()
              console.log(`🔶 SCALE HANDLE CLICK: ${modelName} corner=${idx}`)
            }}
            onPointerOver={isTranslating ? undefined : (e: any) => {
              e.stopPropagation()
              setGlobalGizmoState({ isHovering: true })
              // Use a hand cursor to match the requested UX (instead of resize arrows)
              document.body.style.cursor = 'grab'
              console.log(`🔶 SCALE HANDLE OVER: ${modelName} corner=${idx}`)
            }}
            onPointerOut={isTranslating ? undefined : (e: any) => {
              e.stopPropagation()
              setGlobalGizmoState({ isHovering: false })
              document.body.style.cursor = 'auto'
              console.log(`🔶 SCALE HANDLE OUT: ${modelName} corner=${idx}`)
            }}
          >
            {(() => {
              const baseR = Math.max(0.02 * Math.max(hx, hy, hz), 0.03) * 3
              const hitR = baseR * 1.4 // reduce hit area to minimize interference
              return <sphereGeometry args={[hitR, 12, 12]} />
            })()}
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
          </mesh>

          {/* Visual handle (does not intercept events) */}
          <mesh raycast={() => null as any} renderOrder={1500}>
            {(() => {
              const baseR = Math.max(0.02 * Math.max(hx, hy, hz), 0.03) * 3
              return <sphereGeometry args={[baseR, 16, 16]} />
            })()}
            <meshBasicMaterial color={(isScaling && activeCorner === idx) ? sphereActiveColor : sphereBaseColor} depthTest={true} depthWrite={true} transparent={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
