import * as React from 'react'
import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface PacketChipRectMeshProps {
  width?: number // world units
  height?: number // world units
  fill?: string
  stroke?: string
  radius?: number // px corner radius for canvas drawing
  dpr?: number
  renderOrder?: number // override drawing order
  depthTest?: boolean
  depthWrite?: boolean
}

export default function PacketChipRectMesh({
  width = 0.5,
  height = 0.12,
  fill = '#f1f5f9',
  stroke = '#e2e8f0',
  radius = 10,
  dpr = 2,
  renderOrder = 1080,
  depthTest = false,
  depthWrite = false,
}: PacketChipRectMeshProps) {
  const { gl } = useThree()

  const texture = useMemo(() => {
    const pxW = 1024
    const pxH = Math.max(128, Math.round((pxW * height) / width))
    const canvas = document.createElement('canvas')
    canvas.width = pxW * dpr
    canvas.height = pxH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = true

    const bw = 1
    const x = bw / 2
    const y = bw / 2
    const w = pxW - bw
    const h = pxH - bw
    const r = Math.min(radius, Math.min(w, h) / 2)

    // Rounded rectangle path
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()

    // Fill with subtle shadow for depth
    ctx.save()
    ctx.shadowColor = 'rgba(2,6,23,0.06)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillStyle = fill
    ctx.fill()
    ctx.restore()

    // Border
    ctx.lineWidth = bw
    ctx.strokeStyle = stroke
    ctx.stroke()

    // Thin inset bevel/edge highlight for realism
    const inset = 1.0
    const x2 = x + inset
    const y2 = y + inset
    const w2 = w - inset * 2
    const h2 = h - inset * 2
    const r2 = Math.max(0, r - inset)

    const grad = ctx.createLinearGradient(x2, y2, x2 + w2, y2 + h2)
    grad.addColorStop(0, 'rgba(255,255,255,0.65)') // slightly brighter top-left highlight
    grad.addColorStop(1, 'rgba(15,23,42,0.20)')   // slightly darker bottom-right shadow

    ctx.beginPath()
    ctx.moveTo(x2 + r2, y2)
    ctx.lineTo(x2 + w2 - r2, y2)
    ctx.arcTo(x2 + w2, y2, x2 + w2, y2 + r2, r2)
    ctx.lineTo(x2 + w2, y2 + h2 - r2)
    ctx.arcTo(x2 + w2, y2 + h2, x2 + w2 - r2, y2 + h2, r2)
    ctx.lineTo(x2 + r2, y2 + h2)
    ctx.arcTo(x2, y2 + h2, x2, y2 + h2 - r2, r2)
    ctx.lineTo(x2, y2 + r2)
    ctx.arcTo(x2, y2, x2 + r2, y2, r2)
    ctx.closePath()

    ctx.lineWidth = 2
    ctx.strokeStyle = grad
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy?.() || 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    return tex
  }, [gl, width, height, fill, stroke, radius, dpr])

  return (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent={true}
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
        alphaTest={0.1}
        polygonOffset={true}
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
