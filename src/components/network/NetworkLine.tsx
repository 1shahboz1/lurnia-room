import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { QuadraticBezierLine } from '@react-three/drei'

export type NetworkLineProps = {
  from: string
  to: string
  color?: string
  lineWidth?: number
  lift?: number // how much to raise the mid-point above the higher end
  dashed?: boolean
  pulse?: boolean
  visible?: boolean // Control visibility with fade transitions
}

function vecToArr(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z]
}

export default function NetworkLine({
  from,
  to,
  color = '#00ffff',
  lineWidth = 5,
  lift = 1.2,
  dashed = false,
  pulse = true,
  visible = true,
}: NetworkLineProps) {
  const { scene } = useThree()

  const startRef = useRef(new THREE.Vector3())
  const endRef = useRef(new THREE.Vector3())
  const midRef = useRef(new THREE.Vector3())

  const [start, setStart] = useState<[number, number, number] | null>(null)
  const [end, setEnd] = useState<[number, number, number] | null>(null)
  const [mid, setMid] = useState<[number, number, number] | null>(null)

  const lineRef = useRef<any>(null)
  const glowRef = useRef<any>(null)

  // Fade animation for visibility (120ms transition)
  const [currentOpacity, setCurrentOpacity] = useState(visible ? 1 : 0)
  const targetOpacity = useRef(visible ? 1 : 0)
  const FADE_DURATION = 0.12 // 120ms in seconds

  const lastUpdate = useRef(0)
  const EPS = 1e-3
  const warnedMissing = useRef(false)

  // Update target opacity when visible prop changes
  useEffect(() => {
    targetOpacity.current = visible ? 1 : 0
  }, [visible])

  // Keep hook order stable across renders
  useEffect(() => {
    // logging removed
    return () => {}
  }, [from, to, color, lineWidth])

  // Locate objects and compute world positions each frame; only update when changed noticeably
  useFrame((state, delta) => {
    // Always advance fade first so lines can disappear even if endpoints are missing
    if (Math.abs(currentOpacity - targetOpacity.current) > 0.01) {
      const fadeSpeed = 1 / FADE_DURATION
      const step = fadeSpeed * delta
      const newOpacity = currentOpacity + (targetOpacity.current > currentOpacity ? step : -step)
      const clampedOpacity = Math.max(0, Math.min(1, newOpacity))
      setCurrentOpacity(clampedOpacity)
    }

    const a = scene.getObjectByName(`${from}-center`) || scene.getObjectByName(from)
    const b = scene.getObjectByName(`${to}-center`) || scene.getObjectByName(to)
    if (!a || !b) {
      if (!warnedMissing.current) {
        warnedMissing.current = true
      }
      return
    }
    if (warnedMissing.current) {
      warnedMissing.current = false
    }

    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)

    a.getWorldPosition(startRef.current)
    b.getWorldPosition(endRef.current)

    // Compute raised midpoint with dynamic lift scaling by distance
    const baseY = Math.max(startRef.current.y, endRef.current.y)
    const dist = startRef.current.distanceTo(endRef.current)
    const dynLift = Math.max(lift, Math.min(5, dist * 0.15))
    midRef.current.copy(startRef.current).add(endRef.current).multiplyScalar(0.5)
    midRef.current.y = baseY + dynLift

    // Throttle updates to ~30fps to avoid excessive re-renders
    lastUpdate.current += delta
    const needsUpdate = lastUpdate.current > (1 / 30)

    if (needsUpdate) {
      lastUpdate.current = 0
      // Compare to previous values to avoid useless renders
      const sArr = vecToArr(startRef.current)
      const eArr = vecToArr(endRef.current)
      const mArr = vecToArr(midRef.current)

      const changed =
        !start || !end || !mid ||
        Math.abs(start[0] - sArr[0]) > EPS || Math.abs(start[1] - sArr[1]) > EPS || Math.abs(start[2] - sArr[2]) > EPS ||
        Math.abs(end[0] - eArr[0]) > EPS || Math.abs(end[1] - eArr[1]) > EPS || Math.abs(end[2] - eArr[2]) > EPS ||
        Math.abs(mid[0] - mArr[0]) > EPS || Math.abs(mid[1] - mArr[1]) > EPS || Math.abs(mid[2] - mArr[2]) > EPS

      if (changed) {
        setStart(sArr)
        setEnd(eArr)
        setMid(mArr)
        // logging removed
      }
    }

    // Animate dash offset to simulate data flow (only when dashed overlay is enabled)
    if (pulse && dashed) {
      const speed = 0.6 // units per second
      if (lineRef.current?.material) {
        lineRef.current.material.dashOffset = (lineRef.current.material.dashOffset ?? 0) - delta * speed
        lineRef.current.material.needsUpdate = true
      }
      if (glowRef.current?.material) {
        glowRef.current.material.dashOffset = (glowRef.current.material.dashOffset ?? 0) - delta * speed
        glowRef.current.material.needsUpdate = true
      }
    }
  })

  // If endpoints not known yet or fully faded out, don't render
  if (!start || !end || !mid || currentOpacity < 0.01) return null

  // Two layered lines: base (solid) + soft glow overlay
  return (
    <group>
      <QuadraticBezierLine
        ref={lineRef}
        start={start}
        end={end}
        mid={mid}
        color={color}
        lineWidth={lineWidth}
        dashed={false}
        transparent={true}
        opacity={currentOpacity}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={2400}
      />
      {dashed && (
        <QuadraticBezierLine
          ref={glowRef}
          start={start}
          end={end}
          mid={mid}
          color={color}
          lineWidth={lineWidth * 1.8}
          dashed={true}
          dashScale={2}
          dashRatio={0.6}
          transparent={true}
          opacity={0.25 * currentOpacity}
          toneMapped={false}
          depthWrite={false}
          depthTest={false}
          renderOrder={2350}
        />
      )}
    </group>
  )
}
