'use client'

import * as React from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, QuadraticBezierLine, useGLTF } from '@react-three/drei'
import toast from 'react-hot-toast'
import type { RoomObject } from '@/utils/glb-loader'

type Vec3 = [number, number, number]

type ActiveHopLike = {
  packetId: string
  fromAnchor: string
  toAnchor: string
  encrypted?: boolean
  travelSeconds?: number
  pathPointsOverride?: Array<[number, number, number]>
}

export type EavesdropperSimulationProps = {
  enabled?: boolean
  /**
   * Scenario mode.
   * - vpn: eavesdropper compares VPN OFF (readable) vs VPN ON (encrypted)
   * - https: attacker compares HTTP (readable) vs HTTPS (encrypted)
   */
  scenario?: 'vpn' | 'https'
  // VPN only
  vpnActive?: boolean
  activeHop?: ActiveHopLike | null
  roomObjects?: RoomObject[]
  // Optional: disable toast popups
  showToasts?: boolean
}

function stripCidr(ip: any): string {
  if (typeof ip !== 'string') return ''
  return ip.split('/')[0]
}

function findObjMeta(roomObjects: RoomObject[] | undefined, id: string): any {
  const list = Array.isArray(roomObjects) ? roomObjects : []
  return list.find((o) => o.id === id)?.metadata || null
}

function getRemoteUserWanIp(roomObjects: RoomObject[] | undefined): string {
  const meta = findObjMeta(roomObjects, 'desktop1')
  const net = (meta?.net || {}) as any
  const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
  const wan = ifaces.find((i: any) => String(i?.kind || '').toLowerCase() === 'wan' || String(i?.name || '').toLowerCase() === 'wlan0')
  return stripCidr(wan?.ip) || '203.0.113.25'
}

function getFirewallWanIp(roomObjects: RoomObject[] | undefined): string {
  const meta = findObjMeta(roomObjects, 'firewall1')
  const net = (meta?.net || {}) as any
  const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
  const wan = ifaces.find((i: any) => String(i?.type || '').toUpperCase() === 'WAN' || String(i?.name || '').toLowerCase() === 'outside')
  return stripCidr(wan?.ip) || '203.0.113.1'
}

function showVpnEavesdropToast(kind: 'observed' | 'encrypted') {
  if (kind === 'observed') {
    toast.custom(
      () => (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: 10,
            padding: '10px 12px',
            width: 320,
            boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            color: '#e5e7eb',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.2 }}>Traffic observed on the Internet</div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35, color: '#cbd5e1' }}>
            Without encryption, third parties can inspect network traffic as it crosses the Internet.
          </div>
        </div>
      ),
      { duration: 4500, id: 'vpn-eavesdrop-observed' }
    )
    return
  }

  toast.custom(
    () => (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.94)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: 10,
          padding: '10px 12px',
          width: 320,
          boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
          color: '#e5e7eb',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.2 }}>Encrypted traffic protected</div>
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35, color: '#cbd5e1' }}>
          VPN encryption prevents third parties from inspecting data in transit.
        </div>
      </div>
    ),
    { duration: 4500, id: 'vpn-eavesdrop-encrypted' }
  )
}

type TrafficMeta = {
  source: string
  destination: string
  protocol: string
  port: number
}

type SniffState = {
  id: string
  mode: 'observed' | 'encrypted'
  startedAt: number

  // Timing (ms)
  reachMs: number // eavesdropper reaches to the Internet
  waitMs: number // stays connected until packet arrives at Earth
  pullMs: number // pulls a copy back to the eavesdropper
  beamHoldMs: number // keep the beam connected after it reaches Earth
  totalMs: number

  // Geometry
  start: Vec3
  mid: Vec3
  end: Vec3
  traffic: TrafficMeta

  // UI
  hints: string[]
}

type HintState = {
  k: string
  text: string
  visible: boolean
}

function bezierPoint(start: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = Math.max(0, Math.min(1, t))
  const a = 1 - u
  out.set(0, 0, 0)
  out.addScaledVector(start, a * a)
  out.addScaledVector(mid, 2 * a * u)
  out.addScaledVector(end, u * u)
  return out
}

function cloneActivePacketVisual(scene: THREE.Scene, packetId: string): THREE.Object3D | null {
  const prefix = `ACTIVE_PACKET_${packetId}#`

  const findFirst = (root: THREE.Object3D, pred: (o: THREE.Object3D) => boolean): THREE.Object3D | null => {
    const stack: THREE.Object3D[] = [root]
    while (stack.length) {
      const obj = stack.pop()!
      try {
        if (pred(obj)) return obj
      } catch {}
      const children = (obj as any).children as THREE.Object3D[] | undefined
      if (Array.isArray(children) && children.length) {
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i])
      }
    }
    return null
  }

  const active = findFirst(scene, (obj) => typeof (obj as any).name === 'string' && (obj as any).name.startsWith(prefix))
  if (!active) return null

  const packetMesh = findFirst(active, (obj) => {
    const n = String((obj as any).name || '')
    return n === 'packet_body' || n === 'packet_flap'
  })
  if (!packetMesh) return null

  // Structure in PacketHop:
  // ACTIVE_PACKET_* (groupRef)
  //   -> visualRef (direct child)
  //      -> packetClone (direct child)
  //         -> packet_body / packet_flap meshes
  let visualRoot: THREE.Object3D = packetMesh
  while (visualRoot.parent && visualRoot.parent !== active) visualRoot = visualRoot.parent

  let modelRoot: THREE.Object3D = packetMesh
  while (modelRoot.parent && modelRoot.parent !== visualRoot) modelRoot = modelRoot.parent

  const clone = modelRoot.clone(true)
  clone.name = `EAVES_PACKET_${packetId}`

  // Prevent PacketHop's periodic suppression logic from hiding this copy:
  // it hides roots containing meshes named packet_body/packet_flap that are not under the active hop group.
  clone.traverse((obj) => {
    const n = String((obj as any).name || '')
    if (n === 'packet_body') (obj as any).name = 'eaves_packet_body'
    if (n === 'packet_flap') (obj as any).name = 'eaves_packet_flap'
    if (n === 'packet_text_front') (obj as any).name = 'eaves_packet_text_front'
    if (n === 'packet_text_back') (obj as any).name = 'eaves_packet_text_back'

    try { (obj as any).frustumCulled = false } catch {}
    try { (obj as any).renderOrder = 2396 } catch {}
  })

  return clone
}

function SniffGrabFX({ state, onDone }: { state: SniffState; onDone: () => void }) {
  const { scene } = useThree()

  const beamSheathRef = React.useRef<any>(null)
  const beamCoreRef = React.useRef<any>(null)
  const beamFlowRef = React.useRef<any>(null)

  const hookRef = React.useRef<THREE.Mesh>(null)
  const hookMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null)
  const earthRingMatRef = React.useRef<THREE.MeshBasicMaterial | null>(null)

  // Fallback asset (used only if we can't clone the actual active PacketHop visuals).
  const packetGltf = useGLTF('/inventory/Network Packet/network-packet.glb') as any

  const packetRootRef = React.useRef<THREE.Group>(null)
  const packetModelRef = React.useRef<THREE.Group>(null)

  const [packetFromActive, setPacketFromActive] = React.useState<THREE.Object3D | null>(null)

  const doneRef = React.useRef(false)

  const [hint, setHint] = React.useState<HintState | null>(null)
  const hintTimersRef = React.useRef<number[]>([])
  const hintSeqStartedRef = React.useRef(false)

  const tmpPosRef = React.useRef(new THREE.Vector3())
  const tmpDirRef = React.useRef(new THREE.Vector3())
  const tmpPacketPosRef = React.useRef(new THREE.Vector3())

  const startV = React.useMemo(() => new THREE.Vector3(...state.start), [state.start]) // Earth (Internet)
  const midV = React.useMemo(() => new THREE.Vector3(...state.mid), [state.mid])
  const endV = React.useMemo(() => new THREE.Vector3(...state.end), [state.end]) // Eavesdropper

  const color = state.mode === 'observed' ? '#fbbf24' : '#22c55e'

  // Prefer cloning the *actual* active PacketHop packet so it is 1:1 identical.
  // Fallback: clone the same GLB but apply the same ghost-safe material defaults as PacketHop.
  const packetCloneFallback = React.useMemo(() => {
    const src = packetGltf?.scene as THREE.Group | undefined
    if (!src) return null

    const clone = src.clone(true)
    const keepOnly = new Set(['packet_body', 'packet_flap', 'packet_text_front', 'packet_text_back'])
    const protocolColor = 0xfbbf24

    clone.traverse((child: any) => {
      if (!child?.isMesh) return
      const meshName = String(child.name || '')

      if (!keepOnly.has(meshName)) {
        child.visible = false
        return
      }

      // Clone materials so we don't mutate shared GLTF materials.
      try {
        const curMat = child.material
        if (Array.isArray(curMat)) child.material = curMat.map((m: any) => (m?.clone ? m.clone() : m))
        else child.material = curMat?.clone ? curMat.clone() : curMat
      } catch {}

      const matsArr = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of matsArr) {
        if (!m) continue
        try { (m as any).depthTest = false } catch {}
        try { (m as any).depthWrite = false } catch {}
        try { (m as any).toneMapped = false } catch {}
        try {
          if ((m as any).emissive) {
            ;(m as any).emissive.set(0x111111)
            ;(m as any).emissiveIntensity = 0.0
          }
        } catch {}
        try { if ((m as any).metalness != null) (m as any).metalness = 0.0 } catch {}
        try { if ((m as any).roughness != null) (m as any).roughness = 0.9 } catch {}

        // PacketHop colors body/flap by protocol; VPN room uses the default amber.
        if (meshName === 'packet_body' || meshName === 'packet_flap') {
          try { (m as any).color = new THREE.Color(protocolColor) } catch {}
        }
      }

      // Rename meshes so PacketHop's dedupe scan doesn't suppress this copy.
      if (meshName === 'packet_body') child.name = 'eaves_packet_body'
      if (meshName === 'packet_flap') child.name = 'eaves_packet_flap'
      if (meshName === 'packet_text_front') child.name = 'eaves_packet_text_front'
      if (meshName === 'packet_text_back') child.name = 'eaves_packet_text_back'

      child.renderOrder = 2396
      child.frustumCulled = false
    })

    clone.traverse((obj: any) => {
      try { obj.frustumCulled = false } catch {}
      try { obj.renderOrder = 2396 } catch {}
    })

    return clone
  }, [packetGltf])

  React.useEffect(() => {
    // Capture the current packet model right as it arrives at Earth (pull start).
    setPacketFromActive(null)
    const atMs = Math.max(0, Math.floor(state.reachMs + state.waitMs + 20))
    const t = window.setTimeout(() => {
      try {
        const c = cloneActivePacketVisual(scene, state.id)
        if (c) setPacketFromActive(c)
      } catch {}
    }, atMs)
    return () => {
      try { window.clearTimeout(t) } catch {}
    }
  }, [scene, state.id, state.reachMs, state.waitMs])

  // Cleanup hint timers
  React.useEffect(() => {
    return () => {
      for (const id of hintTimersRef.current) {
        try { window.clearTimeout(id) } catch {}
      }
      hintTimersRef.current = []
    }
  }, [])

  // Start hint sequence once the sniffed copy reaches the eavesdropper
  React.useEffect(() => {
    // Reset
    hintSeqStartedRef.current = false
    setHint(null)
    for (const id of hintTimersRef.current) {
      try { window.clearTimeout(id) } catch {}
    }
    hintTimersRef.current = []

    const pullEndMs = state.reachMs + state.waitMs + state.pullMs

    const scheduleHint = (atMs: number, text: string) => {
      const k = `${state.id}-${atMs}-${text}`
      const t1 = window.setTimeout(() => {
        setHint({ k, text, visible: true })
        const t2 = window.setTimeout(() => {
          setHint((cur) => (cur?.k === k ? { ...cur, visible: false } : cur))
        }, 900)
        hintTimersRef.current.push(t2)
      }, atMs)
      hintTimersRef.current.push(t1)
    }

    // Emit in a quick sequence like the firewall inspection chips.
    const base = pullEndMs + 120
    const step = 900

    const list = Array.isArray(state.hints) ? state.hints.filter(Boolean).map((s) => String(s)) : []
    const hints = (list.length ? list : (state.mode === 'observed'
      ? [`SRC  ${state.traffic.source}`, `DST  ${state.traffic.destination}`, `PROTO  ${state.traffic.protocol}`, `PORT  ${state.traffic.port}`]
      : ['Encrypted', 'Cant read the data!', 'Encrypted']
    ))

    hints.slice(0, 6).forEach((text, i) => {
      scheduleHint(base + step * i, text)
    })

    hintSeqStartedRef.current = true
  }, [state.id, state.mode, state.reachMs, state.waitMs, state.pullMs, state.traffic.destination, state.traffic.port, state.traffic.protocol, state.traffic.source])

  useFrame((_, delta) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const t = Math.max(0, now - state.startedAt)

    const reachEnd = state.reachMs
    const pullStart = state.reachMs + state.waitMs
    const pullEnd = pullStart + state.pullMs

    const fadeOutMs = 560
    const fadeOutStart = Math.max(pullEnd + 900, state.totalMs - fadeOutMs)
    const endFade = t >= fadeOutStart ? Math.max(0, 1 - (t - fadeOutStart) / fadeOutMs) : 1

    // Stage
    const reaching = t < reachEnd
    const waiting = t >= reachEnd && t < pullStart
    const pulling = t >= pullStart && t < pullEnd

    // Hook position: eavesdropper reaches OUT, then stays latched at Earth
    if (reaching) {
      const u = reachEnd > 1 ? t / reachEnd : 1
      bezierPoint(endV, midV, startV, u, tmpPosRef.current)
    } else {
      tmpPosRef.current.copy(startV)
    }

    // Beam stays connected for a while after reaching Earth
    const connectT = reaching ? Math.max(0, Math.min(1, t / Math.max(1, reachEnd))) : 1
    const beamAlpha = connectT * endFade

    try {
      if (beamSheathRef.current?.material) {
        // Softer outer sheath
        beamSheathRef.current.material.opacity = 0.08 * beamAlpha
        beamSheathRef.current.material.transparent = true
        beamSheathRef.current.material.depthTest = false
        beamSheathRef.current.material.depthWrite = false
        beamSheathRef.current.material.needsUpdate = true
      }
      if (beamCoreRef.current?.material) {
        // Brighter inner core
        beamCoreRef.current.material.opacity = 0.22 * beamAlpha
        beamCoreRef.current.material.transparent = true
        beamCoreRef.current.material.depthTest = false
        beamCoreRef.current.material.depthWrite = false
        beamCoreRef.current.material.needsUpdate = true
      }
      if (beamFlowRef.current?.material) {
        // Animated dashes to suggest the packet copy traveling Earth → Eavesdropper
        if (pulling) {
          beamFlowRef.current.material.dashOffset = (beamFlowRef.current.material.dashOffset ?? 0) - delta * 0.95
        } else {
          beamFlowRef.current.material.dashOffset = (beamFlowRef.current.material.dashOffset ?? 0) - delta * 0.18
        }
        beamFlowRef.current.material.opacity = 0.12 * beamAlpha
        beamFlowRef.current.material.transparent = true
        beamFlowRef.current.material.depthTest = false
        beamFlowRef.current.material.depthWrite = false
        beamFlowRef.current.material.needsUpdate = true
      }
    } catch {}

    // Hook visual
    try {
      if (hookRef.current) hookRef.current.position.copy(tmpPosRef.current)
      if (hookMatRef.current) {
        hookMatRef.current.opacity = 0.9 * (reaching || waiting || pulling ? 1 : 0) * endFade
        hookMatRef.current.needsUpdate = true
      }
    } catch {}

    // Pulse ring at Earth (stay visible while connected)
    try {
      if (earthRingMatRef.current) {
        const flash = Math.max(0, 1 - Math.abs(t - reachEnd) / 140)
        const connected = waiting || pulling ? 0.16 : 0.06
        earthRingMatRef.current.opacity = (connected + 0.55 * flash) * endFade
        earthRingMatRef.current.needsUpdate = true
      }
    } catch {}

    // Packet copy: appears when the real packet arrives at Earth (pull starts), then travels Earth → Eavesdropper.
    try {
      if (packetRootRef.current) {
        const visible = pulling || t >= pullEnd
        packetRootRef.current.visible = visible

        if (visible) {
          const packetPos = tmpPacketPosRef.current

          if (pulling) {
            // Hold the copy briefly at Earth so it visually "splits" at the same time
            // the real packet continues Earth → Firewall.
            const SPLIT_HOLD_MS = 220
            const holdMs = Math.min(SPLIT_HOLD_MS, Math.max(0, state.pullMs - 80))
            const dt = t - pullStart

            if (dt < holdMs) {
              packetPos.copy(startV)
            } else {
              const u = (state.pullMs - holdMs) > 1 ? (dt - holdMs) / (state.pullMs - holdMs) : 1
              bezierPoint(startV, midV, endV, u, packetPos)
            }
          } else {
            packetPos.copy(endV)
          }

          packetRootRef.current.position.copy(packetPos)

          // Subtle life + big enough to match the main packet readability
          const pop = pulling ? 1.0 + 0.10 * Math.sin(((t - pullStart) / Math.max(1, state.pullMs)) * Math.PI) : 1.0
          const breathe = 1.0 + 0.02 * Math.sin((now / 1000) * 2.2)
          const s = 2.15 * pop * breathe * endFade
          if (packetModelRef.current) {
            packetModelRef.current.scale.setScalar(s)
            // Match PacketHop's default idle motion so it reads as the *same* packet.
            const ts = now / 1000
            packetModelRef.current.rotation.y = ts * 0.7
            packetModelRef.current.rotation.z = Math.sin(ts * 3.1) * 0.06
            packetModelRef.current.position.y = Math.sin(ts * 1.4) * 0.03
          }

        }
      }
    } catch {}

    if (t >= state.totalMs && !doneRef.current) {
      doneRef.current = true
      onDone()
    }
  })

  return (
    <group>
      {/* Beam originates at the eavesdropper, with a soft "tunnel-ish" sheath */}
      <QuadraticBezierLine
        ref={beamSheathRef}
        start={[endV.x, endV.y, endV.z]}
        end={[startV.x, startV.y, startV.z]}
        mid={[midV.x, midV.y, midV.z]}
        color={color}
        lineWidth={24}
        dashed={false}
        transparent={true}
        opacity={0}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={2388}
      />
      <QuadraticBezierLine
        ref={beamCoreRef}
        start={[endV.x, endV.y, endV.z]}
        end={[startV.x, startV.y, startV.z]}
        mid={[midV.x, midV.y, midV.z]}
        color={color}
        lineWidth={10.4}
        dashed={false}
        transparent={true}
        opacity={0}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={2390}
      />
      {/* Flow line is oriented Earth → Eavesdropper to reinforce direction */}
      <QuadraticBezierLine
        ref={beamFlowRef}
        start={[startV.x, startV.y, startV.z]}
        end={[endV.x, endV.y, endV.z]}
        mid={[midV.x, midV.y, midV.z]}
        color={color}
        lineWidth={16.8}
        dashed={true}
        dashScale={2}
        dashRatio={0.58}
        transparent={true}
        opacity={0}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={2389}
      />

      {/* Internet interception point */}
      <Billboard follow position={[startV.x, startV.y, startV.z]}>
        <mesh renderOrder={2391}>
          <ringGeometry args={[0.26, 0.36, 40]} />
          <meshBasicMaterial
            ref={earthRingMatRef}
            color={color}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </Billboard>

      {/* Hook that reaches out from the eavesdropper */}
      <mesh ref={hookRef} renderOrder={2392}>
        <sphereGeometry args={[0.075, 18, 18]} />
        <meshBasicMaterial
          ref={hookMatRef}
          color={color}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Sniffed packet copy (clone of the *active* PacketHop packet; fallback to same GLB) */}
      <group ref={packetRootRef} visible={false}>
        <group ref={packetModelRef}>
          {(packetFromActive || packetCloneFallback) ? (
            <primitive object={(packetFromActive || packetCloneFallback) as any} />
          ) : null}
        </group>

        {/* Firewall-style hint chips */}
        {hint && (
          <Billboard position={[0, 1.6, 0]}>
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
                  padding: '10px 16px',
                  borderRadius: 12,
                  background:
                    state.mode === 'observed'
                      ? 'rgba(127, 29, 29, 0.55)' // red-900 tint
                      : 'rgba(20, 83, 45, 0.55)', // green-900 tint
                  border:
                    state.mode === 'observed'
                      ? '1px solid rgba(239, 68, 68, 0.75)'
                      : '1px solid rgba(34, 197, 94, 0.75)',
                  boxShadow:
                    state.mode === 'observed'
                      ? '0 0 24px rgba(239, 68, 68, 0.22)'
                      : '0 0 24px rgba(34, 197, 94, 0.22)',
                  color: '#e2e8f0',
                  fontSize: 24,
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(8px)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 900,
                  letterSpacing: 0.4,
                }}
              >
                {hint.text}
              </div>
            </Html>
          </Billboard>
        )}
      </group>
    </group>
  )
}


function getHttpsFirewallOutsideIp(roomObjects: RoomObject[] | undefined): string {
  const meta = findObjMeta(roomObjects, 'firewall1')
  const net = (meta?.net || {}) as any
  const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
  const outside = ifaces.find((i: any) => String(i?.name || '').toLowerCase() === 'outside' || String(i?.type || '').toUpperCase() === 'WAN')
  // Also accept nat.snat if present
  const snat = (net?.nat?.snat as any)
  return stripCidr(outside?.ip) || stripCidr(snat) || '203.0.113.1'
}

function getHttpsWebServerIp(roomObjects: RoomObject[] | undefined): string {
  const meta = findObjMeta(roomObjects, 'web1')
  const net = (meta?.net || {}) as any
  const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
  const wan = ifaces.find((i: any) => String(i?.kind || '').toLowerCase() === 'wan' || String(i?.type || '').toUpperCase() === 'WAN')
  return stripCidr(wan?.ip) || stripCidr(net?.ip) || '198.51.100.10'
}

export default function EavesdropperSimulation({
  enabled = false,
  scenario = 'vpn',
  vpnActive = false,
  activeHop,
  roomObjects,
  showToasts,
}: EavesdropperSimulationProps) {
  const { scene } = useThree()

  const vpnActiveRef = React.useRef(vpnActive)
  React.useEffect(() => {
    vpnActiveRef.current = vpnActive
  }, [vpnActive])

  const showToastsResolved = (typeof showToasts === 'boolean')
    ? showToasts
    : (scenario === 'vpn')

  const shownObservedToastRef = React.useRef(false)
  const shownEncryptedToastRef = React.useRef(false)
  const lastPacketIdRef = React.useRef<string | null>(null)
  const busyRef = React.useRef(false)

  const [sniff, setSniff] = React.useState<SniffState | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    const hop = activeHop
    if (!hop) return

    const triggerFrom = scenario === 'https' ? 'firewall1' : 'desktop1'
    const triggerTo = 'earth1'

    // Trigger only on: <triggerFrom> → Internet (Earth)
    if (hop.fromAnchor !== triggerFrom || hop.toAnchor !== triggerTo) return

    // Avoid retriggering while a long-lived beam is still playing
    if (busyRef.current) return

    // Process only once per hop
    if (lastPacketIdRef.current === hop.packetId) return
    lastPacketIdRef.current = hop.packetId

    // Approximate PacketHop timing: travelSeconds * slowdown
    const TRAVEL_DEFAULT = 0.4
    const TRAVEL_SLOWDOWN = 1.3
    const base = Math.max(
      0.12,
      typeof hop.travelSeconds === 'number' && Number.isFinite(hop.travelSeconds) ? hop.travelSeconds : TRAVEL_DEFAULT
    )
    const travelMs = base * TRAVEL_SLOWDOWN * 1000

    // Timing goals:
    // - beam reaches Earth BEFORE the packet arrives (ideally ~1s early if travel time allows)
    // - beam stays connected ~5s after reaching Earth
    // - copy is pulled back only once the packet arrives at Earth
    const PRECONNECT_WANTED_MS = 1000
    const BEAM_HOLD_MS = 5000
    const FADE_MS = 560

    // Reach duration: scale with hop length but keep it readable.
    const reachMsUnclamped = Math.min(650, Math.max(220, travelMs * 0.55))
    const reachMs = Math.max(80, Math.min(reachMsUnclamped, Math.max(80, travelMs - 60)))

    // How long we stay connected BEFORE the packet arrives (can't exceed remaining travel time).
    const waitMs = Math.min(PRECONNECT_WANTED_MS, Math.max(0, travelMs - reachMs))

    const pullMs = 2800
    const totalMs = reachMs + BEAM_HOLD_MS + FADE_MS

    // Start late enough to hit the timing target, but never after hop start.
    const delayMs = Math.max(0, Math.floor(travelMs - (reachMs + waitMs)))

    const timer = window.setTimeout(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const vpnOn = !!vpnActiveRef.current

      const find = (name: string) => scene.getObjectByName(`${name}-center`) || scene.getObjectByName(name)
      const eavesObj = find('desktop2')
      const earthObj = find('earth1')
      if (!eavesObj || !earthObj) return

      const eavesPos = new THREE.Vector3()
      const earthPos = new THREE.Vector3()
      eavesObj.getWorldPosition(eavesPos)
      earthObj.getWorldPosition(earthPos)

      // Start at the Internet, end at the eavesdropper.
      // We lift both points so the beam is obvious above furniture.
      const start = earthPos.clone()
      start.y += 1.15
      const end = eavesPos.clone()
      end.y += 1.05

      const mid = start.clone().add(end).multiplyScalar(0.5)
      mid.y += 1.35

      const isHttp = String(hop.packetId || '').startsWith('dns-')
      const port = isHttp ? 80 : 443

      const traffic: TrafficMeta = (scenario === 'https')
        ? {
            source: getHttpsFirewallOutsideIp(roomObjects),
            destination: getHttpsWebServerIp(roomObjects),
            protocol: 'TCP',
            port,
          }
        : {
            source: getRemoteUserWanIp(roomObjects),
            destination: getFirewallWanIp(roomObjects),
            protocol: 'TCP',
            port: 443,
          }

      busyRef.current = true

      const mode: 'observed' | 'encrypted' = (scenario === 'https')
        ? (hop.encrypted ? 'encrypted' : 'observed')
        : (vpnOn ? 'encrypted' : 'observed')

      const hints = (() => {
        if (mode === 'encrypted') {
          // Match requested wording for HTTPS lesson
          return ['Encrypted', 'Cant read the data!', 'Encrypted']
        }

        if (scenario === 'https') {
          // HTTP phase (plaintext)
          if (String(hop.packetId || '').startsWith('dns-')) {
            return [
              `SRC  ${traffic.source}`,
              `DST  ${traffic.destination}`,
              'GET  /login',
              'Body  username=alice&password=123456',
            ]
          }

          // TLS handshake phase (metadata visible, secrets not)
          if (String(hop.packetId || '').startsWith('tls-')) {
            return [
              `SRC  ${traffic.source}`,
              `DST  ${traffic.destination}`,
              'TLS  ClientHello (SNI: web-server)',
              'Cert  CN=web-server (public)',
            ]
          }

          // Fallback
          return [
            `SRC  ${traffic.source}`,
            `DST  ${traffic.destination}`,
            `PROTO  ${traffic.protocol}`,
            `PORT  ${traffic.port}`,
          ]
        }

        // VPN default observed hints
        return [
          `SRC  ${traffic.source}`,
          `DST  ${traffic.destination}`,
          `PROTO  ${traffic.protocol}`,
          `PORT  ${traffic.port}`,
        ]
      })()

      // Ensure we don't cut off the hint sequence early.
      const HINT_STEP_MS = 900
      const HINT_HOLD_MS = 900
      const pullEndMs = reachMs + waitMs + pullMs
      const hintEndMs = pullEndMs + 120 + (Math.max(0, hints.length - 1) * HINT_STEP_MS) + HINT_HOLD_MS
      const totalMsFixed = Math.max(totalMs, hintEndMs + 250)

      setSniff({
        id: hop.packetId,
        mode,
        startedAt: now,
        reachMs,
        waitMs,
        pullMs,
        beamHoldMs: BEAM_HOLD_MS,
        totalMs: totalMsFixed,
        start: [start.x, start.y, start.z],
        mid: [mid.x, mid.y, mid.z],
        end: [end.x, end.y, end.z],
        traffic,
        hints,
      })

      // Let UI (missions, inspector, etc.) react without coupling to this component.
      try {
        const evName = (scenario === 'https') ? 'https:eavesdrop' : 'vpn:eavesdrop'
        window.dispatchEvent(
          new CustomEvent(evName, {
            detail: {
              packetId: hop.packetId,
              mode,
              traffic,
            },
          })
        )
      } catch {}

      if (showToastsResolved) {
        if (scenario !== 'https') {
          if (!vpnOn) {
            if (!shownObservedToastRef.current) {
              shownObservedToastRef.current = true
              showVpnEavesdropToast('observed')
            }
          } else {
            if (!shownEncryptedToastRef.current) {
              shownEncryptedToastRef.current = true
              showVpnEavesdropToast('encrypted')
            }
          }
        }
      }
    }, delayMs)

    return () => {
      try { window.clearTimeout(timer) } catch {}
    }
  }, [enabled, activeHop?.packetId, activeHop?.fromAnchor, activeHop?.toAnchor, activeHop?.travelSeconds, scene, roomObjects])

  if (!enabled) return null

  return (
    <group>
      {sniff && (
        <SniffGrabFX
          state={sniff}
          onDone={() => {
            busyRef.current = false
            setSniff((cur) => (cur?.id === sniff.id ? null : cur))
          }}
        />
      )}
    </group>
  )
}
