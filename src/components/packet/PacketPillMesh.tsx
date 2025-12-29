import * as React from 'react'
import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface PacketPillMeshProps {
  width?: number // world units
  height?: number // world units
  fill?: string
  stroke?: string
  radius?: number // px for canvas rounding
  dpr?: number
  text?: string
  textColor?: string
  fontPx?: number
  fontWeight?: number
}

export default function PacketPillMesh({
  width = 0.9,
  height = 0.34,
  fill = '#f8fafc',
  stroke = '#e2e8f0',
  // Use a very large default so the canvas path clamps to h/2, creating a true capsule
  radius = Number.POSITIVE_INFINITY,
  dpr = 2,
  text = 'pkt-2',
  textColor = '#334155',
  fontPx = 32,
  fontWeight = 600,
}: PacketPillMeshProps) {
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
    // subtle shadow
    ctx.save()
    ctx.shadowColor = 'rgba(2,6,23,0.08)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillStyle = fill
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = bw
    ctx.strokeStyle = stroke
    ctx.stroke()

    // draw centered text (monospace)
    ctx.fillStyle = textColor
    ctx.font = `${fontWeight} ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy?.() || 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    return tex
  }, [gl, width, height, fill, stroke, radius, dpr, text, textColor, fontPx, fontWeight])

  return (
    <mesh renderOrder={1100}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent={true}
        toneMapped={false}
        depthWrite={false}
        depthTest={true}
        alphaTest={0.1}
        polygonOffset={true}
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}