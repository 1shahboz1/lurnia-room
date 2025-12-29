import * as React from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export type PacketEnvelopeProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  color?: string
  emissive?: string
  opacity?: number
  depthTest?: boolean
  debug?: boolean
}

export default function PacketEnvelope({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 0.2,
  color = '#ffffff',
  emissive = '#00ffff',
  opacity = 1,
  depthTest = true,
  debug = false,
}: PacketEnvelopeProps) {
  const groupRef = React.useRef<THREE.Group>(null)
  const bodyRef = React.useRef<THREE.Mesh>(null)
  const flapRef = React.useRef<THREE.Mesh>(null)
  const stampRef = React.useRef<THREE.Mesh>(null)

  const mats = React.useMemo(() => {
    const baseColor = new THREE.Color(color)
    const emissiveColor = new THREE.Color(emissive)
    const MatClass: any = debug ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial
    const common = debug ? { toneMapped: false } : { metalness: 0.0, roughness: 0.18, toneMapped: true }

    const clampedOpacity = typeof opacity === 'number' && isFinite(opacity) ? THREE.MathUtils.clamp(opacity, 0, 1) : 1
    const wantTransparent = debug || clampedOpacity < 1

    const mBody: THREE.Material & any = new MatClass({
      color: baseColor,
      emissive: debug ? undefined : emissiveColor,
      emissiveIntensity: debug ? undefined : 0.12,
      vertexColors: true,
      transparent: wantTransparent,
      opacity: debug ? 0.95 * clampedOpacity : clampedOpacity,
      ...common,
    })
    const mFlap: THREE.Material & any = new MatClass({
      color: baseColor,
      emissive: debug ? undefined : emissiveColor,
      emissiveIntensity: debug ? undefined : 0.16,
      transparent: wantTransparent,
      opacity: debug ? 0.95 * clampedOpacity : clampedOpacity,
      ...common,
    })
    const mStamp: THREE.Material & any = new MatClass({
      color: baseColor,
      emissive: debug ? undefined : emissiveColor,
      emissiveIntensity: debug ? undefined : 0.10,
      transparent: wantTransparent,
      opacity: debug ? 0.95 * clampedOpacity : clampedOpacity,
      ...common,
    })

    ;[mBody, mFlap, mStamp].forEach((m: any) => {
      m.depthTest = depthTest
      m.depthWrite = depthTest
      m.side = THREE.DoubleSide
      if (debug) {
        m.wireframe = false
        m.transparent = true
      }
    })

    return { body: mBody as THREE.MeshStandardMaterial, flap: mFlap as THREE.MeshStandardMaterial, stamp: mStamp as THREE.MeshStandardMaterial }
  }, [color, emissive, opacity, depthTest, debug])

  const bodyGeom = React.useMemo(() => {
    // Credit card proportions in meters-ish
    const width = 0.85
    const height = 0.54
    const radius = 0.06
    const depth = 0.02

    const s = new THREE.Shape()
    const hw = width / 2
    const hh = height / 2
    const r = Math.min(radius, hw, hh)

    s.moveTo(-hw + r, -hh)
    s.lineTo(hw - r, -hh)
    s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false)
    s.lineTo(hw, hh - r)
    s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false)
    s.lineTo(-hw + r, hh)
    s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false)
    s.lineTo(-hw, -hh + r)
    s.absarc(-hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI, false)

    const extrudeSettings = { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 5, steps: 1 }
    const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)
    geom.center()

    // Vertex color gradient bottom->top
    const pos = geom.attributes.position
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y }
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const t = THREE.MathUtils.clamp((y - minY) / (maxY - minY || 1), 0, 1)
      const c = new THREE.Color().lerpColors(new THREE.Color('#e0ffff'), new THREE.Color('#ffffff'), t)
      colors[i * 3 + 0] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geom
  }, [])

  const flapGeom = React.useMemo(() => {
    const flapWidth = 0.42
    const flapHeight = 0.16
    const depth = 0.004

    const s = new THREE.Shape()
    const half = flapWidth / 2
    s.moveTo(-half, 0)
    s.lineTo(half, 0)
    s.lineTo(0, -flapHeight)
    s.closePath()

    const extrudeSettings = { depth, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 3, steps: 1 }
    const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)
    // Front face placement
    geom.translate(0, 0.13, 0.01 + depth / 2 + 0.0005)
    return geom
  }, [])

  const stampGeom = React.useMemo(() => {
    const w = 0.16, h = 0.12, r = 0.025, depth = 0.006
    const s = new THREE.Shape()
    const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh)
    s.moveTo(-hw + rr, -hh)
    s.lineTo(hw - rr, -hh)
    s.absarc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0, false)
    s.lineTo(hw, hh - rr)
    s.absarc(hw - rr, hh - rr, rr, 0, Math.PI / 2, false)
    s.lineTo(-hw + rr, hh)
    s.absarc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI, false)
    s.lineTo(-hw, -hh + rr)
    s.absarc(-hw + rr, -hh + rr, rr, Math.PI, 1.5 * Math.PI, false)

    const extrudeSettings = { depth, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 4, steps: 1 }
    const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)
    geom.translate(0.25, 0.18, 0.01 + depth / 2 + 0.0005)
    return geom
  }, [])

  // Subtle emissive pulse + debug log
  const lastLogRef = React.useRef(0)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const s = 0.08 * Math.sin(t * 2.2)
    if (mats.body) mats.body.emissiveIntensity = 0.12 + s
    if (mats.flap) mats.flap.emissiveIntensity = 0.16 + s
    if (mats.stamp) mats.stamp.emissiveIntensity = 0.10 + s

    if (debug && groupRef.current && t - lastLogRef.current > 0.75) {
      lastLogRef.current = t
      const wp = new THREE.Vector3()
      groupRef.current.getWorldPosition(wp)
      try { console.log('[PacketEnvelope] pos', { pos: { x: wp.x.toFixed(2), y: wp.y.toFixed(2), z: wp.z.toFixed(2) }, scale }) } catch {}
    }
  })

  React.useEffect(() => {
    if (debug) {
      try { console.log('[PacketEnvelope] mounted', { position, rotation, scale, depthTest }) } catch {}
    }
    if (groupRef.current) {
      groupRef.current.renderOrder = depthTest ? 0 : 2000
    }
    ;[bodyRef.current, flapRef.current, stampRef.current].forEach((m) => { if (m) m.frustumCulled = false })
  }, [position, rotation, scale, depthTest, debug])

  return (
    <group ref={groupRef} name="packet" position={position} rotation={rotation} scale={scale}>
      <mesh ref={bodyRef} name="packet_body" geometry={bodyGeom} material={mats.body} frustumCulled={false} />
      <mesh ref={flapRef} name="packet_flap" geometry={flapGeom} material={mats.flap} frustumCulled={false} />
      <mesh ref={stampRef} name="packet_stamp" geometry={stampGeom} material={mats.stamp} frustumCulled={false} />
      {debug ? <axesHelper args={[0.3]} /> : null}
    </group>
  )
}
