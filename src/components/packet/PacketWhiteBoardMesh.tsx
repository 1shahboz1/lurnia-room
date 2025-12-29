import * as React from 'react'
import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface PacketWhiteBoardMeshProps {
  width?: number // world units
  height?: number // world units
  radius?: number // px radius for corner when drawing
  borderColor?: string
  fillColor?: string
  borderWidth?: number // px
  title?: string
  titleFontSize?: number // px (CSS px before DPR scaling)
  titleMargin?: number // px inset from edges
  titleColor?: string
  titleWeight?: number | string // e.g., 600
  titleOffsetX?: number // px
  titleOffsetY?: number // px
  // Packet ID micro area (top-right)
  packetId?: string
  idTopMargin?: number // px
  idRightMargin?: number // px
  idGap?: number // px gap between label and pill
  idLabelFontSize?: number // px
  idPillFontSize?: number // px
  renderOrder?: number
  depthTest?: boolean
  depthWrite?: boolean
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
}

export default function PacketWhiteBoardMesh({
  width = 1.5,
  height = 0.9,
  radius = 18,
  borderWidth = 2,
  borderColor = 'rgba(226,232,240,1)',
  fillColor = '#ffffff',
  title,
  titleFontSize = 24, // roughly text-2xl
  titleMargin = 32,
  titleColor = '#0f172a', // slate-900
  titleWeight = 600,
  titleOffsetX,
  titleOffsetY,
  packetId,
  idTopMargin = 36,
  idRightMargin = 36,
  idGap = 14,
  idLabelFontSize = 28,
  idPillFontSize = 32,
  renderOrder = 900,
  depthTest = true,
  depthWrite = true,
  polygonOffset = true,
  polygonOffsetFactor = -0.5,
  polygonOffsetUnits = -0.5,
}: PacketWhiteBoardMeshProps) {
  const { gl } = useThree()

  const texture = useMemo(() => {
    const pxW = 4096
    const pxH = Math.max(256, Math.round((pxW * height) / width))
    const dpr = Math.min(3, (typeof window !== 'undefined' ? window.devicePixelRatio : 2) || 2)
    const canvas = document.createElement('canvas')
    canvas.width = pxW * dpr
    canvas.height = pxH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = true

    // Clear
    ctx.clearRect(0, 0, pxW, pxH)

    // Draw rounded rect with crisp stroke
    const r = Math.min(radius, Math.min(pxW, pxH) / 2 - borderWidth)
    const x = borderWidth / 2
    const y = borderWidth / 2
    const w = pxW - borderWidth
    const h = pxH - borderWidth

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

    // Fill and stroke
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = borderColor
    ctx.lineWidth = borderWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()

    // Thin inset bevel/edge highlight for realism (matches chip styling)
    {
      const inset = 2
      const x2 = x + inset
      const y2 = y + inset
      const w2 = w - inset * 2
      const h2 = h - inset * 2
      const r2 = Math.max(0, r - inset)

      const grad = ctx.createLinearGradient(x2, y2, x2 + w2, y2 + h2)
      grad.addColorStop(0, 'rgba(255,255,255,0.55)') // subtle top-left highlight
      grad.addColorStop(1, 'rgba(15,23,42,0.12)')   // subtle bottom-right shadow

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

      ctx.lineWidth = 45
      ctx.strokeStyle = grad
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // Title text (optional), drawn after fill/stroke
    if (title) {
      ctx.fillStyle = titleColor
      ctx.font = `${titleWeight} ${titleFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      const offX = (titleOffsetX ?? titleMargin)
      const offY = (titleOffsetY ?? titleMargin)
      ctx.fillText(title, x + offX, y + offY)
    }

    // Packet ID (optional) at top-right
    if (packetId) {
      const upperLabel = 'PACKET ID'
      // Measure label
      ctx.font = `500 ${idLabelFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`
      const labelW = ctx.measureText(upperLabel).width
      const labelH = idLabelFontSize

      // Measure pill
      ctx.font = `${600} ${idPillFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace`
      const pillTextW = ctx.measureText(packetId).width
      const padX = 16
      const padY = 8
      const pillW = pillTextW + padX * 2
      const pillH = idPillFontSize + padY * 2

      const groupW = labelW + idGap + pillW
      const groupX = x + w - idRightMargin - groupW
      const groupY = y + idTopMargin

      // Draw label
      ctx.fillStyle = '#64748b' // slate-500
      ctx.font = `500 ${idLabelFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(upperLabel, groupX, groupY)

      // Pill background with subtle shadow
      const pillX = groupX + labelW + idGap
      const pillY = groupY + Math.max(0, (labelH - pillH) / 2)
      const pr = 14
      ctx.save()
      ctx.shadowColor = 'rgba(2,6,23,0.06)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2
      // rounded rect path
      ctx.beginPath()
      ctx.moveTo(pillX + pr, pillY)
      ctx.lineTo(pillX + pillW - pr, pillY)
      ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pr, pr)
      ctx.lineTo(pillX + pillW, pillY + pillH - pr)
      ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pr, pillY + pillH, pr)
      ctx.lineTo(pillX + pr, pillY + pillH)
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pr, pr)
      ctx.lineTo(pillX, pillY + pr)
      ctx.arcTo(pillX, pillY, pillX + pr, pillY, pr)
      ctx.closePath()
      ctx.fillStyle = '#f8fafc' // slate-50
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.lineWidth = 1
      ctx.strokeStyle = '#f1f5f9' // slate-100
      ctx.stroke()
      ctx.restore()

      // Pill text
      ctx.fillStyle = '#334155' // slate-700
      ctx.font = `${600} ${idPillFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(packetId, pillX + padX, pillY + padY)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy?.() || 8
    tex.premultiplyAlpha = true
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return tex
  }, [gl, width, height, radius, borderWidth, borderColor, fillColor, title, titleFontSize, titleMargin, titleColor, titleWeight, titleOffsetX, titleOffsetY, packetId, idTopMargin, idRightMargin, idGap, idLabelFontSize, idPillFontSize])

  return (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent={true}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={depthWrite}
        depthTest={depthTest}
        alphaTest={0.1}
        polygonOffset={polygonOffset}
        polygonOffsetFactor={polygonOffsetFactor}
        polygonOffsetUnits={polygonOffsetUnits}
      />
    </mesh>
  )
}