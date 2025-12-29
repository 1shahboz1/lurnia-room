'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'
import PacketEnvelope from '@/components/packet/PacketEnvelope'

type InspectionPacketProps = {
  active: boolean
  routerAnchor?: string
  firewallAnchor?: string
  zoneRadius?: number
}

type Stage = 'waiting' | 'entering' | 'inspecting'

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

export default function InspectionPacket({
  active,
  routerAnchor = 'router1',
  firewallAnchor = 'firewall1',
  zoneRadius = 2.25,
}: InspectionPacketProps) {
  const { scene } = useThree()

  const packetRootRef = useRef<THREE.Group>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const scan1Ref = useRef<THREE.Mesh>(null)
  const scan2Ref = useRef<THREE.Mesh>(null)
  const scan3Ref = useRef<THREE.Mesh>(null)

  const beamMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const scanMat1Ref = useRef<THREE.MeshBasicMaterial>(null)
  const scanMat2Ref = useRef<THREE.MeshBasicMaterial>(null)
  const scanMat3Ref = useRef<THREE.MeshBasicMaterial>(null)

  const routerObjRef = useRef<THREE.Object3D | null>(null)
  const firewallObjRef = useRef<THREE.Object3D | null>(null)

  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null)
  const startRef = useRef(new THREE.Vector3())
  const stopRef = useRef(new THREE.Vector3())
  const firewallPosRef = useRef(new THREE.Vector3())

  const tRef = useRef(0)
  const stageRef = useRef<Stage>('waiting')
  const [stage, setStage] = useState<Stage>('waiting')

  const [hint, setHint] = useState<{ text: string; visible: boolean; k: number } | null>(null)

  const activeTRef = useRef(0)

  // Reusable temporaries (avoid per-frame allocations)
  const tmpV1Ref = useRef(new THREE.Vector3())
  const tmpV2Ref = useRef(new THREE.Vector3())
  const tmpV3Ref = useRef(new THREE.Vector3())
  const tmpQ1Ref = useRef(new THREE.Quaternion())
  const curvePointRef = useRef(new THREE.Vector3())

  const geoms = useMemo(() => {
    const beam = new THREE.CylinderGeometry(0.012, 0.012, 1, 10, 1, true)
    const ring = new THREE.RingGeometry(0.10, 0.22, 48)
    return { beam, ring }
  }, [])

  useEffect(() => {
    return () => {
      try { geoms.beam.dispose() } catch {}
      try { geoms.ring.dispose() } catch {}
    }
  }, [geoms])

  // Cycle hint chips while inspecting (momentary, non-persistent)
  useEffect(() => {
    if (!active) return
    if (stage !== 'inspecting') return

    const hints = [
      'Protocol: TCP',
      'Port: 443',
      'Zone: inside → outside',
    ]

    let i = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const k = Date.now()
      const text = hints[i % hints.length]
      i++

      setHint({ text, visible: true, k })
      const hide = window.setTimeout(() => {
        setHint((prev) => (prev ? { ...prev, visible: false } : prev))
      }, 900)

      const next = window.setTimeout(tick, 2400)
      return () => {
        window.clearTimeout(hide)
        window.clearTimeout(next)
      }
    }

    const cleanup = tick()
    return () => {
      cancelled = true
      try { cleanup?.() } catch {}
      setHint(null)
    }
  }, [active, stage])

  useFrame((state, delta) => {
    // Smoothly fade everything in/out based on phase
    activeTRef.current = THREE.MathUtils.damp(activeTRef.current, active ? 1 : 0, 6, delta)
    if (activeTRef.current < 0.001) return

    // Resolve anchors lazily (models load async)
    if (!routerObjRef.current) {
      routerObjRef.current =
        scene.getObjectByName(`${routerAnchor}-center`) ||
        scene.getObjectByName(routerAnchor) ||
        null
    }
    if (!firewallObjRef.current) {
      firewallObjRef.current =
        scene.getObjectByName(`${firewallAnchor}-center`) ||
        scene.getObjectByName(firewallAnchor) ||
        null
    }

    const routerObj = routerObjRef.current
    const firewallObj = firewallObjRef.current

    if (!routerObj || !firewallObj) {
      if (stageRef.current !== 'waiting') {
        stageRef.current = 'waiting'
        setStage('waiting')
      }
      return
    }

    // Compute start/stop positions once when we begin
    if (!curveRef.current || stageRef.current === 'waiting') {
      routerObj.updateMatrixWorld(true)
      firewallObj.updateMatrixWorld(true)

      const routerPos = new THREE.Vector3()
      const fwPos = new THREE.Vector3()
      routerObj.getWorldPosition(routerPos)
      firewallObj.getWorldPosition(fwPos)
      firewallPosRef.current.copy(fwPos)

      // Incoming direction from router → firewall
      const dir = new THREE.Vector3().subVectors(fwPos, routerPos)
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
      dir.normalize()

      // Keep motion local to the inspection zone: start just outside the zone on the router-facing side
      const startDist = zoneRadius + 0.85
      const stopDist = 0.95

      const start = new THREE.Vector3().copy(fwPos).addScaledVector(dir, -startDist)
      const stop = new THREE.Vector3().copy(fwPos).addScaledVector(dir, -stopDist)

      // Hover slightly above the firewall center for clarity
      const hoverY = fwPos.y + 0.35
      start.y = hoverY
      stop.y = hoverY

      startRef.current.copy(start)
      stopRef.current.copy(stop)

      const mid = new THREE.Vector3().copy(start).add(stop).multiplyScalar(0.5)
      mid.y = hoverY + 0.25

      curveRef.current = new THREE.QuadraticBezierCurve3(start.clone(), mid, stop.clone())

      // Restart entry
      tRef.current = 0
      stageRef.current = 'entering'
      setStage('entering')
    }

    const packetRoot = packetRootRef.current
    if (!packetRoot) return

    // Entry: smooth deceleration to a stop
    if (stageRef.current === 'entering') {
      const ENTRY_SECONDS = 2.0
      tRef.current += delta / ENTRY_SECONDS
      const t = clamp01(tRef.current)
      // Ease-out so it feels like the packet decelerates into inspection (intentional stop)
      const eased = 1 - Math.pow(1 - t, 3)

      const curve = curveRef.current
      if (curve) {
        curve.getPoint(eased, curvePointRef.current)
        packetRoot.position.copy(curvePointRef.current)
      }

      if (t >= 1) {
        stageRef.current = 'inspecting'
        setStage('inspecting')
      }
    }

    // Inspection: packet stays in place but remains visually alive
    if (stageRef.current === 'inspecting') {
      const t = state.clock.getElapsedTime()
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2)
      const wobble = 0.5 + 0.5 * Math.sin(t * 0.7 + 1.1)

      packetRoot.rotation.y = t * 0.35
      packetRoot.rotation.z = (wobble - 0.5) * 0.05
      const s = 0.26 * (1 + pulse * 0.04)
      packetRoot.scale.setScalar(s)

      // Firewall scanning visuals toward the packet
      const fw = firewallPosRef.current
      const to = packetRoot.position
      const dir = tmpV1Ref.current.subVectors(to, fw)
      const len = Math.max(0.001, dir.length())
      dir.normalize()

      // Beam
      if (beamRef.current) {
        const mid = tmpV2Ref.current.copy(fw).addScaledVector(dir, len * 0.5)
        beamRef.current.position.copy(mid)
        beamRef.current.quaternion.setFromUnitVectors(tmpV3Ref.current.set(0, 1, 0), dir)
        beamRef.current.scale.set(1, len, 1)
      }
      if (beamMatRef.current) beamMatRef.current.opacity = 0.06 * activeTRef.current

      // Traveling scan rings (soft waves)
      const orient = tmpQ1Ref.current.setFromUnitVectors(tmpV2Ref.current.set(0, 0, 1), dir)
      const waves = [
        { ref: scan1Ref, mat: scanMat1Ref, phase: 0.0 },
        { ref: scan2Ref, mat: scanMat2Ref, phase: 0.36 },
        { ref: scan3Ref, mat: scanMat3Ref, phase: 0.72 },
      ]
      for (const w of waves) {
        const m = w.mat.current
        const mesh = w.ref.current
        if (!mesh || !m) continue

        const p = (t * 0.35 + w.phase) % 1 // 0..1
        const along = p * len
        const pos = tmpV3Ref.current.copy(fw).addScaledVector(dir, along)
        mesh.position.copy(pos)
        mesh.quaternion.copy(orient)

        const swell = 1 + p * 1.25
        mesh.scale.setScalar(swell)

        // Fade in/out per wave; stay subtle
        const alpha = (1 - p) * (0.35 + 0.65 * pulse)
        m.opacity = 0.08 * alpha * activeTRef.current
      }
    }

    // When not inspecting, keep a stable base scale
    if (stageRef.current !== 'inspecting') {
      const s = 0.26
      packetRoot.scale.setScalar(s)
      packetRoot.rotation.y = 0
      packetRoot.rotation.z = 0
    }
  })

  if (!active) return null

  return (
      <group>
      {/* Packet */}
      <group ref={packetRootRef} visible={stage !== 'waiting'} position={[0, 1.2, 0]}>
        <PacketEnvelope
          scale={1}
          color="#e0f2fe"
          emissive="#93c5fd"
          depthTest={true}
        />

        {/* Hint chips (momentary) */}
        {stage === 'inspecting' && hint && (
          <Billboard position={[0, 0.55, 0]}>
            <Html
              key={hint.k}
              transform
              distanceFactor={8}
              style={{
                pointerEvents: 'none',
                opacity: hint.visible ? 1 : 0,
                transition: 'opacity 350ms ease',
              }}
            >
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  color: '#e2e8f0',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {hint.text}
              </div>
            </Html>
          </Billboard>
        )}
      </group>

      {/* Scanning beam + waves (only meaningful when inspecting; opacities driven in useFrame) */}
      <mesh ref={beamRef} geometry={geoms.beam}>
        <meshBasicMaterial
          ref={beamMatRef}
          color="#93c5fd"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh ref={scan1Ref} geometry={geoms.ring}>
        <meshBasicMaterial
          ref={scanMat1Ref}
          color="#93c5fd"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={scan2Ref} geometry={geoms.ring}>
        <meshBasicMaterial
          ref={scanMat2Ref}
          color="#93c5fd"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={scan3Ref} geometry={geoms.ring}>
        <meshBasicMaterial
          ref={scanMat3Ref}
          color="#93c5fd"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
