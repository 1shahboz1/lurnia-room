'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { showHtmlOverlay } from '@/store/useHtmlOverlay'
import type { RoomObject } from '@/utils/glb-loader'

function dispatch(name: string, detail: any) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })) } catch {}
}

type PhaseId = 'DNS' | 'PKI' | 'HTTPS' | 'HTTP' | 'TLS'

type PhaseUi = {
  name: string
  topology?: string
}

const FIREWALL_PHASE_UI: Record<PhaseId, PhaseUi> = {
  DNS: { name: 'Traffic Analysis' },
  PKI: { name: 'Rule Evaluation' },
  HTTPS: { name: 'Enforced Outcome' },
  HTTP: { name: 'Traffic Analysis' },
  TLS: { name: 'Rule Evaluation' },
}

const VPN_PHASE_UI: Record<PhaseId, PhaseUi> = {
  DNS: { name: 'Tunnel Setup' },
  PKI: { name: 'Encrypted Transport' },
  HTTPS: { name: 'Secure Session' },
  HTTP: { name: 'Tunnel Setup' },
  TLS: { name: 'Encrypted Transport' },
}
const HTTPS_ROOM_PHASE_UI: Record<PhaseId, PhaseUi> = {
  // We keep legacy internal IDs (DNS/PKI) mapped to the new lesson framing.
  DNS: { name: 'HTTP' },
  PKI: { name: 'TLS Handshake' },
  HTTPS: { name: 'HTTPS' },
  HTTP: { name: 'HTTP' },
  TLS: { name: 'TLS Handshake' },
}

const DEFAULT_PHASE_UI: Record<PhaseId, PhaseUi> = {
  DNS: { name: 'DNS' },
  PKI: { name: 'TLS Handshake' },
  HTTPS: { name: 'HTTPS' },
  HTTP: { name: 'HTTP' },
  TLS: { name: 'TLS Handshake' },
}

function uiForPhase(phase: string, roomId?: string | null): PhaseUi {
  const raw = String(phase || 'DNS').toUpperCase()
  // Backward-compat mapping for the https room while we migrate from DNS/PKI naming.
  const ph: PhaseId = (raw === 'DNS') ? 'DNS' : (raw === 'PKI') ? 'PKI' : (raw === 'HTTP') ? 'HTTP' : (raw === 'TLS') ? 'TLS' : 'HTTPS'
  if (roomId === 'vpn') return VPN_PHASE_UI[ph] || VPN_PHASE_UI.DNS
  if (roomId === 'firewall') return FIREWALL_PHASE_UI[ph] || FIREWALL_PHASE_UI.DNS
  if (roomId === 'https') return HTTPS_ROOM_PHASE_UI[ph] || HTTPS_ROOM_PHASE_UI.DNS
  return DEFAULT_PHASE_UI[ph] || DEFAULT_PHASE_UI.DNS
}

function labelForAnchor(a?: string | null, roomId?: string | null) {
  if (!a) return '-'
  const base = a.replace(/-center$/, '')
  if (base === 'dns1') return roomId === 'firewall' ? 'Web Server' : 'DNS Resolver'

  if (roomId === 'vpn') {
    const vpnMap: Record<string,string> = {
      desktop1: 'Remote User',
      switch1: 'VPN Switch',
      router1: 'VPN Router',
      firewall1: 'VPN Firewall',
      earth1: 'Internet',
      web1: 'Secure Server',
    }
    return vpnMap[base] || base
  }

  // HTTPS room: show the WAN-side desktop as the attacker.
  if (roomId === 'https') {
    const httpsMap: Record<string,string> = {
      desktop1: 'Client',
      desktop2: 'Attacker',
      switch1: 'Switch',
      router1: 'Router',
      firewall1: 'Firewall',
      earth1: 'Internet',
      web1: 'Web Server',
    }
    return httpsMap[base] || base
  }

  const map: Record<string,string> = {
    desktop1: 'Desktop',
    desktop2: 'Desktop',
    laptop1: 'Laptop',
    switch1: 'Switch',
    router1: 'Router',
    firewall1: 'Firewall',
    earth1: 'Internet',
    web1: 'Web Server',
    pki1: 'PKI Server',
    cdn1: 'CDN Edge',
  }
  return map[base] || base
}

function classifyPacketType(label: string, fromAnchor?: string, toAnchor?: string) {
  const lab = (label || '').toUpperCase()
  const f = (fromAnchor || '').toLowerCase()
  const t = (toAnchor || '').toLowerCase()
  if (lab === 'DNS') {
    if (t.startsWith('dns')) return 'DNS_QUERY'
    if (f.startsWith('dns')) return 'DNS_RESPONSE'
    return 'DNS_QUERY'
  }
  if (lab === 'HTTPS') return 'HTTP_ENCRYPTED'
  return lab
}

function MiniMap({ fromAnchor, toAnchor, isActive, speed = 1, phase = 'DNS', roomId }: { fromAnchor?: string; toAnchor?: string; isActive?: boolean; speed?: number; phase?: string; roomId?: string }) {
  // Vertical swimlane layout with larger nodes/text and arrowheads
  // The 3 heavy rooms (firewall/https/vpn) use a compact single-column topology; shrink the viewBox
  // so the diagram renders larger while the card itself is narrower.
  const isFirewallRoom = roomId === 'firewall'
  const isVpnRoom = roomId === 'vpn'
  const isHttpsRoom = roomId === 'https'
  const isCompactRoom = isFirewallRoom || isVpnRoom || isHttpsRoom

  const W = isCompactRoom ? 240 : 320
  const H = 640
  const CENTER_X = W / 2
  // Nudge the whole topology slightly to the right (keeps labels visually balanced)
  const BASE_X = CENTER_X - (isCompactRoom ? 12 : 60)
  
  // (keep these booleans for readability below)
  
  const phaseUi = uiForPhase(phase, roomId)

  // Scales
  const TILE = isCompactRoom ? 60 : 56 // node tile size
  const HALF = TILE / 2
  const IMG = isCompactRoom ? 46 : 44 // logo size
  const RX = 10 // corner radius
  const FONT = isCompactRoom ? 18 : 16
  const TEXT_Y = HALF + 22
  const STROKE_BASE = 3
  const STROKE_ACTIVE = 5

  // Y positions (top → bottom)
  // Compute 6 lanes (shorter) to fit without expanding total height
  const LANE_TOP = 20
  const LANE_H = 90
  const LANE_GAP = 12
  const laneY = (i: number) => LANE_TOP + i * (LANE_H + LANE_GAP)
  const centerY = (i: number) => laneY(i) + LANE_H / 2

  const yClient = centerY(0)
  const yAccess = centerY(1)
  const yRouting = centerY(2)
  const ySecurity = centerY(3)
  const yInternet = centerY(4)
  const yServers = centerY(5)
  const yVpnRemote = centerY(0)
  const yVpnInternet = centerY(1)
  const yVpnFirewall = centerY(2)
  const yVpnRouter = centerY(3)
  const yVpnSwitch = centerY(4)
  const yVpnServer = centerY(5)

  const xCDN = BASE_X
  const xWEB = BASE_X + 120

  const nodes: Array<{ id: string; x: number; y: number; label: string }> = []
  const edges: Array<[string,string]> = []

  if (isFirewallRoom) {
    // Firewall room: simplified phase-specific topology
    const ph = String(phase || '').toUpperCase()

    if (ph === 'PKI') {
      // Rule Evaluation
      nodes.push({ id: 'firewall1', x: BASE_X, y: ySecurity, label: 'Firewall' })
    } else if (ph === 'HTTPS') {
      // Enforced Outcome
      nodes.push({ id: 'desktop1', x: BASE_X, y: yClient, label: 'Desktop' })
      nodes.push({ id: 'switch1', x: BASE_X, y: yAccess, label: 'Switch' })
      nodes.push({ id: 'router1', x: BASE_X, y: yRouting, label: 'Router' })
      nodes.push({ id: 'firewall1', x: BASE_X, y: ySecurity, label: 'Firewall' })
      nodes.push({ id: 'earth1', x: BASE_X, y: yInternet, label: 'Internet' })
      nodes.push({ id: 'dns1', x: xCDN, y: yServers, label: 'Web Server' })

      // Include return segments so edge highlighting still works during the round-trip.
      edges.push(['desktop1','switch1'])
      edges.push(['switch1','router1'])
      edges.push(['router1','firewall1'])
      edges.push(['firewall1','earth1'])
      edges.push(['earth1','dns1'])
      edges.push(['dns1','earth1'])
      edges.push(['earth1','firewall1'])
      edges.push(['firewall1','router1'])
      edges.push(['router1','switch1'])
      edges.push(['switch1','desktop1'])
    } else {
      // Traffic Analysis
      nodes.push({ id: 'desktop1', x: BASE_X, y: yClient, label: 'Desktop' })
      nodes.push({ id: 'switch1', x: BASE_X, y: yAccess, label: 'Switch' })
      nodes.push({ id: 'router1', x: BASE_X, y: yRouting, label: 'Router' })
      nodes.push({ id: 'firewall1', x: BASE_X, y: ySecurity, label: 'Firewall' })

      edges.push(['desktop1','switch1'])
      edges.push(['switch1','router1'])
      edges.push(['router1','firewall1'])
      edges.push(['firewall1','router1'])
      edges.push(['router1','switch1'])
      edges.push(['switch1','desktop1'])
    }
  } else if (isVpnRoom) {
    // VPN room: always show the full topology (even when VPN is OFF)
    // Remote User → Internet → Firewall → Router → Switch → Secure Server
    nodes.push({ id: 'desktop1', x: BASE_X, y: yVpnRemote, label: 'Remote User' })
    nodes.push({ id: 'earth1', x: BASE_X, y: yVpnInternet, label: 'Internet' })
    nodes.push({ id: 'firewall1', x: BASE_X, y: yVpnFirewall, label: 'Firewall' })
    nodes.push({ id: 'router1', x: BASE_X, y: yVpnRouter, label: 'Router' })
    nodes.push({ id: 'switch1', x: BASE_X, y: yVpnSwitch, label: 'Switch' })
    nodes.push({ id: 'web1', x: BASE_X, y: yVpnServer, label: 'Secure Server' })

    // Include return segments so edge highlighting works on the round-trip.
    edges.push(['desktop1','earth1'])
    edges.push(['earth1','firewall1'])
    edges.push(['firewall1','router1'])
    edges.push(['router1','switch1'])
    edges.push(['switch1','web1'])
    edges.push(['web1','switch1'])
    edges.push(['switch1','router1'])
    edges.push(['router1','firewall1'])
    edges.push(['firewall1','earth1'])
    edges.push(['earth1','desktop1'])
  } else if (isHttpsRoom) {
    // HTTPS room: focus on HTTP vs TLS Handshake vs HTTPS.
    // Keep the physical topology constant (client ↔ web server), and place an attacker on the WAN.
    const phRaw = String(phase || '').toUpperCase()
    const ph = phRaw === 'DNS' ? 'HTTP' : phRaw === 'PKI' ? 'TLS' : phRaw

    nodes.push({ id: 'desktop1', x: BASE_X, y: yClient, label: 'Client' })
    nodes.push({ id: 'switch1', x: BASE_X, y: yAccess, label: 'Switch' })
    nodes.push({ id: 'router1', x: BASE_X, y: yRouting, label: 'Router' })
    nodes.push({ id: 'firewall1', x: BASE_X, y: ySecurity, label: 'Firewall' })
    nodes.push({ id: 'earth1', x: BASE_X, y: yInternet, label: 'Internet' })
    nodes.push({ id: 'web1', x: BASE_X, y: yServers, label: 'Web Server' })

    // Base path out + back (same for HTTP/TLS/HTTPS; meaning changes per phase)
    edges.push(['desktop1','switch1'])
    edges.push(['switch1','router1'])
    edges.push(['router1','firewall1'])
    edges.push(['firewall1','earth1'])
    edges.push(['earth1','web1'])
    edges.push(['web1','earth1'])
    edges.push(['earth1','firewall1'])
    edges.push(['firewall1','router1'])
    edges.push(['router1','switch1'])
    edges.push(['switch1','desktop1'])

    // Use ph to avoid unused-var lint if enabled in the future
    void ph
  } else {
    // Default topology map (DNS / TLS Handshake / HTTPS)
    nodes.push({ id: 'desktop1', x: BASE_X, y: yClient, label: 'Desktop' })
    nodes.push({ id: 'switch1', x: BASE_X, y: yAccess, label: 'Switch' })
    nodes.push({ id: 'router1', x: BASE_X, y: yRouting, label: 'Router' })
    nodes.push({ id: 'firewall1', x: BASE_X, y: ySecurity, label: 'Firewall' })
    nodes.push({ id: 'earth1', x: BASE_X, y: yInternet, label: 'Internet' })

    if (phase === 'DNS') {
      nodes.push({ id: 'dns1', x: xCDN, y: yServers, label: 'DNS' })
    } else if (phase === 'PKI') {
      nodes.push({ id: 'cdn1', x: xCDN, y: yServers, label: 'CDN Edge' })
    } else {
      // HTTPS shows both CDN Edge and Web Server in Servers lane
      nodes.push({ id: 'cdn1', x: xCDN, y: yServers, label: 'CDN Edge' })
      nodes.push({ id: 'web1', x: xWEB, y: yServers, label: 'Web Server' })
    }

    // Internal path out
    edges.push(['desktop1','switch1'])
    edges.push(['switch1','router1'])
    edges.push(['router1','firewall1'])
    edges.push(['firewall1','earth1'])
    if (phase === 'DNS') {
      edges.push(['earth1','dns1'])
      edges.push(['dns1','earth1'])
    } else if (phase === 'PKI') {
      edges.push(['earth1','cdn1'])
      edges.push(['cdn1','earth1'])
    } else {
      // HTTPS path includes Internet -> CDN -> Web -> CDN -> Internet
      edges.push(['earth1','cdn1'])
      edges.push(['cdn1','web1'])
      edges.push(['web1','cdn1'])
      edges.push(['cdn1','earth1'])
    }
    // Internal path back
    edges.push(['earth1','firewall1'])
    edges.push(['firewall1','router1'])
    edges.push(['router1','switch1'])
    edges.push(['switch1','desktop1'])
  }
  

  const rawFrom = (fromAnchor || '').replace(/-center$/, '')
  const rawTo = (toAnchor || '').replace(/-center$/, '')
  const mapRemote = (id: string) => {
    if (isFirewallRoom) {
      if (id === 'web1' || id === 'server1') return 'dns1'
      return id
    }
    if (isVpnRoom) return id
    return (phase === 'PKI' && (id === 'web1' || id === 'server1')) ? 'cdn1' : id
  }
  const activeFromRaw = mapRemote(rawFrom)
  const activeToRaw = mapRemote(rawTo)
  // In Rule Evaluation, always focus the Firewall node.
  const activeFrom = (isFirewallRoom && String(phase || '').toUpperCase() === 'PKI' && isActive) ? 'firewall1' : activeFromRaw
  const activeTo = (isFirewallRoom && String(phase || '').toUpperCase() === 'PKI' && isActive) ? 'firewall1' : activeToRaw

  const pos = Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y }])) as Record<string,{x:number,y:number}>

  const logoFor: Record<string,string> = {
    desktop1: '/desktop.png',
    desktop2: '/desktop.png',
    switch1: '/Switch.png',
    router1: '/router_emoji.png',
    firewall1: '/Firewall.png',
    earth1: '/inventory/Earth/earth.png',
    dns1: '/server.png',
    web1: '/server.png',
    server1: '/server.png',
    cdn1: '/server.png',
    pki1: '/server.png',
  }

  const laneLabels = isVpnRoom
    ? ['Remote User', 'Internet', 'Firewall', 'Router', 'Switch', 'Secure Server']
    : ['Client', 'Access', 'Routing', 'Security', 'Internet', 'Servers']
  const lanes = laneLabels.map((label, idx) => ({
    y: laneY(idx),
    h: idx === laneLabels.length - 1 ? LANE_H + 20 : LANE_H,
    label,
  }))

  // Animation for moving dot and pulses
  const [t, setT] = useState(0)
  const tRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  useEffect(() => {
    let raf: number
    const loop = (now: number) => {
      const edgePresent = !!(fromAnchor && toAnchor)
      const last = lastRef.current ?? now
      const dt = Math.min(100, now - last)
      lastRef.current = now
      const dur = Math.max(300, 1200 / Math.max(0.25, speed || 1)) // ms per cycle
      if (edgePresent) {
        tRef.current += dt / dur
        if (tRef.current >= 1) tRef.current -= 1
        setT(tRef.current)
      } else {
        tRef.current = 0
        setT(0)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fromAnchor, toAnchor, speed])

  // Pulse for nodes
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    let raf: number
    const loop = (now: number) => {
      const v = 0.5 + 0.5 * Math.sin(now / 300)
      setPulse(v)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const topologyInnerMaxWidthPx = (isFirewallRoom || isVpnRoom || isHttpsRoom) ? 260 : 320
  // Make the Topology card itself slightly narrower by reducing its padding,
  // while keeping the internal lane sizing logic unchanged.
  const topologyCardPadPx = 6
  const topologyCardMaxWidthPx = topologyInnerMaxWidthPx + (topologyCardPadPx * 2)

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: topologyCardPadPx, marginBottom: 10, maxWidth: topologyCardMaxWidthPx, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Topology</div>
      <div
        style={{
          width: '100%',
          maxWidth: topologyInnerMaxWidthPx,
          margin: '0 auto',
          // Scale the topology diagram down on shorter viewports (prevents it from rendering off-screen)
          height: 'min(640px, 60vh)',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
        <defs>
          <marker id="arrowBlue" markerWidth="10" markerHeight="10" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,3.5 L0,7 Z" fill="#3b82f6" />
          </marker>
          <marker id="arrowGray" markerWidth="10" markerHeight="10" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,3.5 L0,7 Z" fill="#cbd5e1" />
          </marker>
        </defs>

        {/* Phase title */}
        <g>
          <text x={CENTER_X} y={12} fontSize={16} textAnchor="middle" fill="#334155" fontWeight={600}>{phaseUi.name}</text>
        </g>

        {/* Lanes */}
        {lanes.map((ln, i) => {
          // Make lanes fill the available viewBox width (reduces side gap) without changing
          // the topology card size or Live Flow panel size.
          const laneMarginX = isCompactRoom ? 0 : 8
          return (
            <g key={i}>
              <rect x={laneMarginX} y={ln.y} width={W - (laneMarginX * 2)} height={ln.h} rx={8} ry={8} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
              <text x={laneMarginX + 8} y={ln.y + 18} fontSize={12} textAnchor="start" fill="#64748b">{ln.label}</text>
            </g>
          )
        })}

        {/* Edges with arrowheads */}
        {edges.map(([a,b], i) => {
          const p1 = pos[a]; const p2 = pos[b]
          const activeEdge = (a === activeFrom && b === activeTo)
          try { if ((window as any).__TOPO_LOG__ && i === 0) console.log('🧭 TOPO_EDGE_ACTIVE', { from: activeFrom, to: activeTo, active: activeEdge }) } catch {}
          const stroke = activeEdge ? '#3b82f6' : '#cbd5e1'
          const width = activeEdge ? STROKE_ACTIVE : STROKE_BASE
          const marker = activeEdge ? 'url(#arrowBlue)' : 'url(#arrowGray)'
          const x1 = p1.x, y1 = p1.y + (p1.x === p2.x ? HALF : 0)
          const x2 = p2.x - (p1.x !== p2.x ? HALF : 0), y2 = p2.y
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} markerEnd={marker} />
              {activeEdge && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60a5fa" strokeWidth={STROKE_BASE} strokeDasharray="10 8" strokeDashoffset={-t * 36} />
              )}
            </g>
          )
        })}

        {/* Moving dot on active edge */}
        {(() => {
          const a = activeFrom, b = activeTo
          if (!a || !b) return null
          const p1 = pos[a]; const p2 = pos[b]
          if (!p1 || !p2) return null
          const sx = p1.x; const sy = p1.y + (p1.x === p2.x ? HALF : 0)
          const ex = p2.x - (p1.x !== p2.x ? HALF : 0); const ey = p2.y
          const cx = sx + (ex - sx) * t
          const cy = sy + (ey - sy) * t
          const showDot = !!(activeFrom && activeTo)
          return (
            <>
              <circle cx={cx} cy={cy} r={8} fill="#3b82f6" opacity={showDot ? 1 : 0} />
              <circle cx={cx} cy={cy} r={12} fill="none" stroke="#bfdbfe" strokeOpacity={0.8} strokeWidth={2} opacity={showDot ? 1 : 0} />
            </>
          )
        })()}

        {/* Nodes with logos and pulses */}
        {nodes.map(n => {
          const isFrom = n.id === activeFrom
          const isTo = n.id === activeTo
          const stroke = isFrom || isTo ? '#60a5fa' : '#cbd5e1'
          const bg = isFrom || isTo ? '#dbeafe' : '#ffffff'
          const img = logoFor[n.id] || '/cable.png'
          const rightLabel = n.id === 'desktop1' || n.id === 'switch1' || n.id === 'router1' || n.id === 'firewall1' || n.id === 'earth1'

          // Keep icons centered in the tile frame.
          const iconOffsetX = 0

          const labelX = rightLabel ? (HALF + 12) : 0
          const labelY = rightLabel ? 0 : TEXT_Y
          const textAnchor = rightLabel ? 'start' as const : 'middle' as const
          const dominantBaseline = rightLabel ? 'middle' : undefined
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
              {/* Pulse ring */}
              {(isFrom || isTo) && (
                <circle cx={0} cy={0} r={HALF + 6 + pulse * 6} fill="none" stroke="#60a5fa" strokeOpacity={0.5} strokeWidth={2} />
              )}
              <rect x={-HALF} y={-HALF} width={TILE} height={TILE} rx={RX} ry={RX} fill={bg} stroke={stroke} strokeWidth={2} />
              <image href={img} x={-IMG/2} y={-IMG/2} width={IMG} height={IMG} preserveAspectRatio="xMidYMid meet" />
              <text x={labelX} y={labelY} fontSize={FONT} textAnchor={textAnchor} dominantBaseline={dominantBaseline as any} fill="#334155">{n.label}</text>
            </g>
          )
        })}
        </svg>
      </div>
    </div>
  )
}

export default function LiveFlowHUD({
  flow,
  roomId,
  roomObjects,
  hidePhaseSelect,
}: {
  flow: any
  roomId?: string
  roomObjects?: RoomObject[]
  hidePhaseSelect?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [vpnHudActive, setVpnHudActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return !!(window as any).__VPN_ACTIVE__ } catch { return false }
  })
  useEffect(() => {
    if (roomId !== 'vpn') return
    const handler = (e: any) => {
      setVpnHudActive(!!e?.detail?.active)
    }
    window.addEventListener('vpn:active', handler as any)
    return () => window.removeEventListener('vpn:active', handler as any)
  }, [roomId])

  const metaById = useMemo(() => {
    const map: Record<string, any> = {}
    ;(roomObjects || []).forEach((o) => {
      map[o.id] = (o as any).metadata || {}
    })
    return map
  }, [roomObjects])

  const stripCidr = (ip: any): string => {
    if (typeof ip !== 'string') return ''
    return ip.split('/')[0]
  }

  const phase = flow?.phase || 'DNS'
  const status = flow?.status || 'idle'

  // Keep a single topology layout per room so the diagram doesn’t visually change between phases.
  // - firewall: always render the most complete topology layout (“Enforced Outcome”)
  // - vpn: always render the “No VPN” topology layout (shows all devices)
  const topologyPhase = roomId === 'firewall'
    ? 'HTTPS'
    : roomId === 'vpn'
      ? 'DNS'
      : phase

  // HTTPS room: reflect whether HTTPS is unlocked (Fix HTTPS completed)
  const [httpsUnlocked, setHttpsUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
  })
  useEffect(() => {
    if (roomId !== 'https') return
    let t: any = null
    const poll = () => {
      const ok = (() => {
        try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
      })()
      setHttpsUnlocked(prev => (prev === ok ? prev : ok))
    }
    poll()
    t = setInterval(poll, 250)
    return () => { try { if (t) clearInterval(t) } catch {} }
  }, [roomId])

  const [phaseSel, setPhaseSel] = useState<string>(phase)
  useEffect(() => { setPhaseSel(phase) }, [phase])
  const phaseOptions = roomId === 'vpn' ? ['DNS', 'PKI'] : ['DNS', 'PKI', 'HTTPS']
  useEffect(() => {
    if (hidePhaseSelect) return
    if (roomId !== 'vpn') return

    // VPN room only supports DNS and PKI
    if (phaseSel === 'HTTPS') {
      setPhaseSel('DNS')
      dispatch('flow-control', { action: 'setPhase', phase: 'DNS' })
      return
    }

    // Enforce VPN-based gating in the selector:
    // - VPN OFF => DNS only
    // - VPN ON  => PKI only
    if (vpnHudActive && phaseSel === 'DNS') {
      setPhaseSel('PKI')
      dispatch('flow-control', { action: 'setPhase', phase: 'PKI' })
      return
    }
    if (!vpnHudActive && phaseSel === 'PKI') {
      setPhaseSel('DNS')
      dispatch('flow-control', { action: 'setPhase', phase: 'DNS' })
    }
  }, [roomId, vpnHudActive, phaseSel, hidePhaseSelect])
  const displayPhase = (s: string) => uiForPhase(s, roomId).name
  const currentPhaseUi = uiForPhase(phase, roomId)
  const [edgeOverride, setEdgeOverride] = useState<{ from?: string; to?: string } | null>(null)
  useEffect(() => {
    const onEdge = (e: any) => {
      const d = e?.detail || {}
      try { if ((window as any).__TOPO_LOG__) console.log('🧭 TOPO_EDGE_EVT', d) } catch {}
      if (d.active && d.from && d.to) setEdgeOverride({ from: d.from, to: d.to })
      // Do not clear on active=false; next active will overwrite
    }
    window.addEventListener('topology-edge', onEdge as any)
    return () => window.removeEventListener('topology-edge', onEdge as any)
  }, [])

  const fromAnchor = edgeOverride?.from || flow?.from || flow?.meta?.fromAnchor
  const toAnchor = edgeOverride?.to || flow?.to || flow?.meta?.toAnchor
  const remapAnchor = (a?: string | null) => {
    const n = String(a || '').replace(/-center$/, '')
    if (roomId === 'firewall') {
      if (n === 'web1' || n === 'server1') return 'dns1'
      return n
    }
    if (roomId === 'vpn') {
      return n
    }
    // HTTPS room is being refocused on HTTP vs HTTPS; don't remap to CDN.
    if (roomId === 'https') {
      return n
    }
    if (phase === 'PKI' && (n === 'web1' || n === 'server1')) return 'cdn1'
    return n
  }
  const from = useMemo(() => labelForAnchor(remapAnchor(fromAnchor), roomId), [fromAnchor, phase, roomId])
  const to = useMemo(() => labelForAnchor(remapAnchor(toAnchor), roomId), [toAnchor, phase, roomId])
  const proto = flow?.meta?.protocol || 'UDP/53'
  const label = flow?.meta?.label || 'DNS'
  const secondary = useMemo(() => {
    const L = String(label || '').toUpperCase()
    const P = String(proto || '')
    if (L === 'HTTPS') return 'TLS'
    if (L === 'PKI') return 'TLS 1.3'
    if (L === 'DNS') return 'UDP/53'
    // Fallback: if protocol mentions TLS, shorten to TLS
    if (/TLS/i.test(P)) return 'TLS'
    // Strip port/transport details in parentheses for brevity
    return P.replace(/\s*\(.*\)\s*/g, '')
  }, [label, proto])

  // Track the active server anchor seen in the flow so HUD mappings work for TLS/HTTPS
  const [activeServer, setActiveServer] = useState<string | null>(null)
  useEffect(() => {
    const norm = (s?: string) => String(s || '').replace(/-center$/, '')
    const f = norm(fromAnchor)
    const t = norm(toAnchor)
    const servers = ['web1','server1','cdn1','pki1','dns1']
    const hit = servers.find(n => f === n || t === n) || null
    if (hit) setActiveServer(hit)
    else if (phase === 'DNS') setActiveServer('dns1')
  }, [fromAnchor, toAnchor, phase])

  // Clear topology highlight when the whole flow finishes (idle)
  useEffect(() => {
    if (status === 'idle') setEdgeOverride(null)
  }, [status])

  const openDetails = () => {
    // Build rich packet details matching Inspector > Packets entries
    const type = classifyPacketType(label, fromAnchor, toAnchor)

    // Firewall room: custom hop-to-packet mapping (uses device metadata for IPs)
    if (roomId === 'firewall') {
      const desktopNet = metaById.desktop1?.net || {}
      const routerNet = metaById.router1?.net || {}
      const firewallNet = metaById.firewall1?.net || {}
      const serverNet = metaById.dns1?.net || {}
      const attackerNet = metaById.desktop2?.net || {}

      const routerLanIf = Array.isArray(routerNet.interfaces)
        ? routerNet.interfaces.find((i: any) => i?.name === 'LAN')
        : null

      const desktopIp = stripCidr(desktopNet.ip) || '192.168.10.30'
      const routerLanIp = stripCidr(routerLanIf?.ip) || '192.168.10.1'
      const firewallWanIp = stripCidr(firewallNet.outsideIp) || '203.0.113.1'
      const webIp = stripCidr(serverNet.ip) || '198.51.100.10'
      const attackerIp = stripCidr(attackerNet.ip) || '198.51.100.66'

      // Stable demo ports
      const clientPort = 52345
      const natPort = 62001
      const attackSrcPort = 55555

      const preNat = `${desktopIp}:${clientPort} → ${webIp}:443`
      const postNat = `${firewallWanIp}:${natPort} → ${webIp}:443`
      const wanReply = `${webIp}:443 → ${firewallWanIp}:${natPort}`
      const postDeNat = `${webIp}:443 → ${desktopIp}:${clientPort}`

      const attackPre = `${attackerIp}:${attackSrcPort} → ${firewallWanIp}:22`
      const attackPost = `${attackerIp}:${attackSrcPort} → ${desktopIp}:22`

      const f = remapAnchor(fromAnchor)
      const t = remapAnchor(toAnchor)
      const hopKey = `${f}->${t}`

      const L = String(label || '').toUpperCase()
      const isAttack = L.includes('ATTACK')

      const payloadByHop: Record<string, any> = isAttack
        ? {
            'desktop2->earth1': {
              listId: 'fw-atk-001',
              id: 'fw-atk-001@attacker-egress',
              type: 'MALICIOUS',
              protocol: 'TCP/22',
              encrypted: 'No',
              step: '1',
              who_sends: `Attacker Desktop (${attackerIp})`,
              from_to: attackPre,
              what: 'SSH attack attempt begins (WAN → LAN)',
              key_fields: `{ "dst_port": 22, "dst_ip": "${firewallWanIp}", "note": "Attacker targets a public SSH service" }`,
              what_changed_here: 'Traffic leaves the attacker and traverses the Internet toward your firewall.',
              method: '',
              path: '',
              ua: '',
            },
            'earth1->firewall1': {
              listId: 'fw-atk-002',
              id: 'fw-atk-002@firewall-inspect',
              type: 'FIREWALL_INSPECT',
              protocol: 'Inspection & Policy Check',
              encrypted: 'No',
              step: '2',
              who_sends: 'Internet (WAN transit)',
              from_to: attackPre,
              what: 'Firewall inspects inbound SSH (WAN → LAN TCP/22)',
              key_fields: '{ "rule_check": "WAN → LAN TCP/22" }',
              what_changed_here: 'If the firewall allows this inbound SSH traffic, it can be forwarded into the LAN (high risk).',
              method: '',
              path: '',
              ua: '',
            },
            'firewall1->router1': {
              listId: 'fw-atk-003',
              id: 'fw-atk-003@firewall-forward',
              type: 'MALICIOUS',
              protocol: 'TCP/22',
              encrypted: 'No',
              step: '3',
              who_sends: 'Firewall (DNAT / port-forward)',
              from_to: attackPost,
              what: 'Firewall forwards the SSH attack into the LAN',
              key_fields: `{ "DNAT": "${firewallWanIp}:22 -> ${desktopIp}:22" }`,
              what_changed_here: 'A port-forward (DNAT) maps the public service to an internal host.',
              method: '',
              path: '',
              ua: '',
            },
            'router1->switch1': {
              listId: 'fw-atk-004',
              id: 'fw-atk-004@router-fwd',
              type: 'MALICIOUS',
              protocol: 'TCP/22',
              encrypted: 'No',
              step: '4',
              who_sends: `Router (LAN GW ${routerLanIp})`,
              from_to: attackPost,
              what: 'Router forwards attack traffic toward the desktop',
              key_fields: '{ "note": "Normal LAN routing" }',
              what_changed_here: 'Router sends the packet to the LAN segment where the desktop lives.',
              method: '',
              path: '',
              ua: '',
            },
            'switch1->desktop1': {
              listId: 'fw-atk-005',
              id: 'fw-atk-005@switch-deliver',
              type: 'MALICIOUS',
              protocol: 'TCP/22',
              encrypted: 'No',
              step: '5',
              who_sends: 'Switch (L2 forwarder)',
              from_to: attackPost,
              what: 'Attack reaches the LAN desktop (SSH service)',
              key_fields: '{ "impact": "Desktop is reachable from WAN on TCP/22" }',
              what_changed_here: 'This is the dangerous outcome: inbound SSH reached an internal host.',
              method: '',
              path: '',
              ua: '',
            },
          }
        : {
            'desktop1->switch1': {
              listId: 'fw-ta-001',
              id: 'fw-ta-001@desktop-egress',
              type: 'HTTP_ENCRYPTED',
              protocol: 'TCP/443',
              encrypted: 'Yes (TLS payload)',
              step: '1',
              who_sends: `Desktop (${desktopIp})`,
              from_to: preNat,
              what: 'Outbound HTTPS request begins (LAN → WAN)',
              key_fields: `{ "src_zone": "LAN", "dst_zone": "WAN", "dst_port": 443, "dst_ip": "${webIp}" }`,
              what_changed_here: 'Desktop sends traffic toward the default gateway; nothing has been NATed yet.',
              method: 'GET',
              path: '/',
              ua: '',
            },
            'switch1->router1': {
              listId: 'fw-ta-002',
              id: 'fw-ta-002@switch-fwd',
              type: 'HTTP_ENCRYPTED',
              protocol: 'TCP/443',
              encrypted: 'Yes (TLS payload)',
              step: '2',
              who_sends: 'Switch (L2 forwarder)',
              from_to: preNat,
              what: 'Switch forwards the frame toward the router',
              key_fields: '{ "l2": "MAC changes only", "l3_l4": "unchanged" }',
              what_changed_here: 'Layer-2 forwarding: the IP header and TCP ports remain the same.',
              method: '',
              path: '',
              ua: '',
            },
            'router1->firewall1': {
              listId: 'fw-re-001',
              id: 'fw-re-001@firewall-inspect',
              type: 'FIREWALL_INSPECT',
              protocol: 'Inspection & Policy Check',
              encrypted: 'Yes (TLS payload)',
              step: '3',
              who_sends: `Router (LAN GW ${routerLanIp})`,
              from_to: preNat,
              what: 'Firewall inspects outbound traffic (LAN → WAN TCP/443)',
              key_fields: '{ "match_on": ["src_zone","dst_zone","protocol","port"], "protocol": "TCP", "port": 443 }',
              what_changed_here: 'Firewall evaluates rules. If allowed, it forwards to WAN; otherwise it drops.',
              method: '',
              path: '',
              ua: '',
            },
            'firewall1->earth1': {
              listId: 'fw-eo-001',
              id: 'fw-eo-001@firewall-snat',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes',
              step: '4',
              who_sends: 'Firewall (SNAT/PAT)',
              from_to: postNat,
              what: 'Firewall forwards to WAN after applying source NAT',
              key_fields: `{ "NAT_before": "${desktopIp}:${clientPort} -> ${webIp}:443", "NAT_after": "${firewallWanIp}:${natPort} -> ${webIp}:443" }`,
              what_changed_here: 'Private source IP/port is translated to the firewall’s public IP/port.',
              method: 'GET',
              path: '/',
              ua: '',
            },
            'earth1->dns1': {
              listId: 'fw-eo-002',
              id: 'fw-eo-002@internet-deliver',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes',
              step: '5',
              who_sends: 'Internet (WAN transit)',
              from_to: postNat,
              what: 'Packet traverses the WAN and reaches the web server',
              key_fields: '{ "note": "Public routing; firewall state tracks the flow" }',
              what_changed_here: 'Across the Internet, routers forward the packet to the destination.',
              method: '',
              path: '',
              ua: '',
            },
            'dns1->earth1': {
              listId: 'fw-eo-003',
              id: 'fw-eo-003@web-reply',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes',
              step: '6',
              who_sends: `Web Server (${webIp})`,
              from_to: wanReply,
              what: 'Web server responds over the same TLS session',
              key_fields: '{ "tcp": "src_port=443", "direction": "WAN → firewall" }',
              what_changed_here: 'Server sends response back to the client’s public (NATed) socket.',
              method: '',
              path: '',
              ua: '',
            },
            'earth1->firewall1': {
              listId: 'fw-eo-004',
              id: 'fw-eo-004@firewall-inbound-inspect',
              type: 'FIREWALL_INSPECT',
              protocol: 'Inspection & Policy Check',
              encrypted: 'Yes (TLS payload)',
              step: '7',
              who_sends: 'Internet (WAN transit)',
              from_to: wanReply,
              what: 'Firewall inspects inbound traffic (WAN → LAN TCP/443)',
              key_fields: '{ "rule_check": "WAN → LAN TCP/443" }',
              what_changed_here: 'Firewall verifies it is permitted before forwarding inside.',
              method: '',
              path: '',
              ua: '',
            },
            'firewall1->router1': {
              listId: 'fw-eo-005',
              id: 'fw-eo-005@firewall-denat',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes',
              step: '8',
              who_sends: 'Firewall (de-NAT)',
              from_to: postDeNat,
              what: 'Firewall maps the public flow back to the LAN desktop',
              key_fields: `{ "deNAT_before": "${webIp}:443 -> ${firewallWanIp}:${natPort}", "deNAT_after": "${webIp}:443 -> ${desktopIp}:${clientPort}" }`,
              what_changed_here: 'Destination rewritten back to the internal client socket (conntrack).',
              method: '',
              path: '',
              ua: '',
            },
            'router1->switch1': {
              listId: 'fw-eo-006',
              id: 'fw-eo-006@router-fwd',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes',
              step: '9',
              who_sends: `Router (LAN GW ${routerLanIp})`,
              from_to: postDeNat,
              what: 'Router forwards the response toward the switch',
              key_fields: '{ "note": "Normal LAN routing" }',
              what_changed_here: 'Router delivers the packet to the correct LAN segment.',
              method: '',
              path: '',
              ua: '',
            },
            'switch1->desktop1': {
              listId: 'fw-eo-007',
              id: 'fw-eo-007@switch-deliver',
              type: 'HTTP_ENCRYPTED',
              protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
              encrypted: 'Yes (on wire), decrypted on Desktop',
              step: '10',
              who_sends: 'Switch (L2 forwarder)',
              from_to: postDeNat,
              what: 'Switch delivers the response to the desktop',
              key_fields: '{ "result": "Browser decrypts TLS and renders" }',
              what_changed_here: 'Final hop: the desktop receives the encrypted response and decrypts it locally.',
              method: '',
              path: '',
              ua: '',
            },
          }

      const payload = payloadByHop[hopKey]
      if (payload) {
        showHtmlOverlay(payload)
        return
      }
    }

    // Canonical hop sequence used in all phases (server is dynamic for TLS/HTTPS)
    const norm = (s?: string) => String(s || '').replace(/-center$/, '')
    const fRaw = norm(fromAnchor)
    const tRaw = norm(toAnchor)
    const mapRemoteForPhase = (s: string) => (phase === 'DNS' ? s : (s === 'web1' || s === 'server1') ? 'cdn1' : s)
    const f = mapRemoteForPhase(fRaw)
    const t = mapRemoteForPhase(tRaw)
    const serverGuess = phase === 'DNS' ? 'dns1' : 'cdn1'
    const path: Array<[string,string]> = [
      ['desktop1','switch1'],
      ['switch1','router1'],
      ['router1','firewall1'],
      ['firewall1','earth1'],
      ['earth1', serverGuess],
      [serverGuess, 'earth1'],
      ['earth1','firewall1'],
      ['firewall1','router1'],
      ['router1','switch1'],
      ['switch1','desktop1'],
    ]
    const hopIdx = path.findIndex(([a,b]) => a === f && b === t) // 0..9 or -1

    function overlayForDNS(step: number) {
      // Steps 1..8 per provided DNS flow
      const steps: any[] = [
        { id: 'dns-001@laptop-egress', enc: 'No', who: 'Laptop (192.168.10.30)', fromTo: '192.168.10.30:55678 → 8.8.8.8:53', what: 'DNS Query for google.com A', key: '{ "question": "google.com A", "size": "≈92 B" }', change: 'Laptop creates the DNS question and sends it out.' },
        { id: 'dns-002@switch-fwd',     enc: 'No', who: 'Switch (L2 forwarder)', fromTo: '192.168.10.30:55678 → 8.8.8.8:53', what: 'Forwarding the same DNS Query', key: '{ "question": "google.com A" }', change: 'Switch just passes frames along. IP/ports don’t change.' },
        { id: 'dns-003@router-fwd',     enc: 'No', who: 'Router (LAN GW 192.168.10.1)', fromTo: '192.168.10.30:55678 → 8.8.8.8:53', what: 'DNS Query toward the firewall', key: '{ "question": "google.com A", "ip_hop_limit": "decreases by 1" }', change: 'Router forwards toward the Internet.' },
        { id: 'dns-004@firewall-nat',   enc: 'No', who: 'Firewall (inside→outside NAT)', fromTo: '203.0.113.1:62001 → 8.8.8.8:53', what: 'DNS Query after NAT (public IP/port)', key: '{ "question": "google.com A", "NAT_before": "192.168.10.30:55678 -> 8.8.8.8:53", "NAT_after":  "203.0.113.1:62001 -> 8.8.8.8:53" }', change: 'Firewall rewrites source to public IP/port (SNAT/PAT) and sends across the Internet.' },
        { id: 'dns-005@resolver-reply', enc: 'No', who: 'DNS Resolver (8.8.8.8) replying', fromTo: '8.8.8.8:53 → 203.0.113.1:62001', what: 'DNS Response: A record for google.com', key: '{ "answer": "google.com -> 142.250.190.14", "TTL": "300s", "size": "≈128 B" }', change: 'Resolver returns the answer to your public IP/port.' },
        { id: 'dns-006@firewall-denat', enc: 'No', who: 'Firewall (outside→inside de-NAT)', fromTo: '8.8.8.8:53 → 192.168.10.30:55678', what: 'DNS Response after de-NAT (mapped back to laptop)', key: '{ "answer": "google.com -> 142.250.190.14", "deNAT_before": "8.8.8.8:53 -> 203.0.113.1:62001", "deNAT_after":  "8.8.8.8:53 -> 192.168.10.30:55678" }', change: 'Firewall maps the public flow back to the laptop’s original socket.' },
        { id: 'dns-007@router-fwd',     enc: 'No', who: 'Router (LAN GW 192.168.10.1)', fromTo: '8.8.8.8:53 → 192.168.10.30:55678', what: 'DNS Response toward the switch', key: '{ "answer": "google.com -> 142.250.190.14" }', change: 'Router forwards response into the LAN.' },
        { id: 'dns-008@switch-deliver', enc: 'No', who: 'Switch (L2 forwarder)', fromTo: '8.8.8.8:53 → 192.168.10.30:55678', what: 'Deliver DNS Response to laptop', key: '{ "answer": "google.com -> 142.250.190.14", "cache_TTL_starts": "300s at laptop" }', change: 'Switch delivers frames; laptop will cache the result and can now contact 142.250.190.14.' },
      ]
      const d = steps[step - 1]
      if (!d) return null
      return {
        listId: `pkt-${String(step).padStart(3,'0')}`,
        id: d.id,
        type: step <= 4 ? 'DNS_QUERY' : 'DNS_RESPONSE',
        protocol: 'UDP/53',
        encrypted: d.enc,
        step: String(step),
        who_sends: d.who,
        from_to: d.fromTo,
        what: d.what,
        key_fields: d.key,
        what_changed_here: d.change,
      }
    }

    function overlayForTLS(step: number) {
      // 8-step TLS Handshake per provided spec
      const steps: any[] = [
        { id: 'tls-001@laptop-egress', who: 'Laptop (192.168.10.30)', enc: 'No', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'TLS ClientHello (SNI google.com, ALPN h2)', key: '{ "SNI": "google.com", "ALPN": "h2" }', change: 'Laptop starts TLS; announces who it wants and supported features.' },
        { id: 'tls-002@switch-fwd',   who: 'Switch (L2 forwarder)', enc: 'No', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'Forwarding ClientHello', key: '{ "note": "Layer-2 pass-through" }', change: 'Frames forwarded; headers unchanged.' },
        { id: 'tls-003@router-fwd',   who: 'Router (LAN GW 192.168.10.1)', enc: 'No', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'ClientHello toward firewall', key: '{ "ip_hop_limit": "TTL decreases by 1" }', change: 'Routes toward Internet.' },
        { id: 'tls-004@firewall-nat', who: 'Firewall (inside→outside NAT)', enc: 'No', fromTo: '203.0.113.1:62002 → 142.250.190.14:443', what: 'ClientHello after NAT (to CDN Edge)', key: '{ "NAT_before": "192.168.10.30:51234 -> 142.250.190.14:443", "NAT_after":  "203.0.113.1:62002 -> 142.250.190.14:443", "SNI": "google.com", "ALPN": "h2" }', change: 'Firewall rewrites source to public IP/port and tracks state.' },
        { id: 'tls-005@server-hello', who: 'CDN Edge (142.250.190.14)', enc: 'Yes', fromTo: '142.250.190.14:443 → 203.0.113.1:62002', what: 'ServerHello + encrypted handshake data', key: '{ "cipher_selected": "TLS_AES_128_GCM_SHA256", "ALPN_selected": "h2", "note": "ServerHello clear; rest encrypted (TLS 1.3)" }', change: 'Edge chooses settings and returns handshake messages.' },
        { id: 'tls-006@firewall-denat', who: 'Firewall (outside→inside de-NAT)', enc: 'Yes', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'ServerHello + encrypted handshake after de-NAT', key: '{ "deNAT_before": "142.250.190.14:443 -> 203.0.113.1:62002", "deNAT_after":  "142.250.190.14:443 -> 192.168.10.30:51234" }', change: 'Maps public flow back to the laptop’s socket.' },
        { id: 'tls-007@router-fwd',  who: 'Router (LAN GW 192.168.10.1)', enc: 'Yes', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'Encrypted handshake toward LAN', key: '{ "note": "Normal routing; payload remains encrypted" }', change: 'Forwards to the switch.' },
        { id: 'tls-008@switch-deliver',  who: 'Switch (L2 forwarder)', enc: 'Yes', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'Deliver ServerHello + encrypted handshake', key: '{ "on_receive": "Laptop validates cert chain & completes TLS", "result": "Session keys established" }', change: 'Delivered to the laptop; secure channel ready for HTTPS.' },
      ]
      const d = steps[step - 1]
      if (!d) return null
      return {
        listId: `pkt-${String(100 + step).padStart(3,'0')}`,
        id: d.id,
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: d.enc,
        step: String(step),
        who_sends: d.who,
        from_to: d.fromTo,
        what: d.what,
        key_fields: d.key,
        what_changed_here: d.change,
      }
    }

    function overlayForHTTPS(step: number) {
      // 10-step HTTPS phase with CDN Edge and Origin flow
      const steps: any[] = [
        { id: 'https-001@laptop-egress', enc: 'Yes', who: 'Laptop (192.168.10.30)', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'HTTPS Request (GET /)', key: '{ "inside_tls": { "method": "GET", "path": "/", "host": "google.com", "accept-encoding": "br" } }', change: 'Browser sends the page request through the TLS tunnel.' },
        { id: 'https-002@switch-fwd',     enc: 'Yes', who: 'Switch (L2 forwarder)', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'Forwarding HTTPS request', key: '{ "note": "Layer-2 pass-through" }', change: 'Frames forwarded; headers unchanged.' },
        { id: 'https-003@router-fwd',     enc: 'Yes', who: 'Router (LAN GW 192.168.10.1)', fromTo: '192.168.10.30:51234 → 142.250.190.14:443', what: 'HTTPS request toward firewall', key: '{ "ip_hop_limit": "TTL drops by 1" }', change: 'Routes toward the Internet.' },
        { id: 'https-004@firewall-nat',   enc: 'Yes', who: 'Firewall (inside→outside NAT)', fromTo: '203.0.113.1:62002 → 142.250.190.14:443', what: 'HTTPS request after NAT (CDN Edge)', key: '{ "NAT_before": "192.168.10.30:51234 → 142.250.190.14:443", "NAT_after":  "203.0.113.1:62002 → 142.250.190.14:443", "ALPN": "h2" }', change: 'Firewall rewrites source to public IP/port and sends to the Edge.' },
        { id: 'https-005@edge-origin-miss-req', enc: 'Yes', who: 'CDN Edge (142.250.190.14) as client', fromTo: '142.250.190.14:53123 → 172.217.12.14:443', what: 'Origin fetch (HTTPS GET /)', key: '{ "cache": "MISS", "inside_tls": { "method": "GET", "path": "/", "host": "origin.google.com" } }', change: 'Edge did not have a cached copy; it opens its own TLS session to the origin.' },
        { id: 'https-006@origin-edge-miss-resp', enc: 'Yes', who: 'Origin Web Server (172.217.12.14)', fromTo: '172.217.12.14:443 → 142.250.190.14:53123', what: 'HTTPS Response (200 OK, index.html)', key: '{ "inside_tls": { "status": 200, "content-type": "text/html", "content-encoding": "br", "etag": "etag-4af2b1", "cache-control": "public, max-age=300" }, "approx_size": "≈15 KB (compressed)" }', change: 'Origin returns content; Edge will store it per caching headers.' },
        { id: 'https-007@edge-client-serve', enc: 'Yes', who: 'CDN Edge (142.250.190.14)', fromTo: '142.250.190.14:443 → 203.0.113.1:62002', what: 'HTTPS Response to client (freshly cached)', key: '{ "cache": "STORE (Age: 0s)", "inside_tls": { "status": 200, "etag": "etag-4af2b1", "content-encoding": "br" } }', change: 'Edge serves the response and keeps a copy for future requests.' },
        { id: 'https-008@firewall-denat', enc: 'Yes', who: 'Firewall (outside→inside de-NAT)', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'HTTPS response after de-NAT', key: '{ "deNAT_before": "142.250.190.14:443 → 203.0.113.1:62002", "deNAT_after":  "142.250.190.14:443 → 192.168.10.30:51234" }', change: 'Maps the public flow back to the laptop’s socket.' },
        { id: 'https-009@router-fwd',      enc: 'Yes', who: 'Router (LAN GW 192.168.10.1)', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'HTTPS response toward LAN', key: '{ "note": "Normal routing; payload stays encrypted" }', change: 'Forwards response into the LAN.' },
        { id: 'https-010@switch-deliver',  enc: 'Yes (on wire), decrypted on laptop', who: 'Switch (L2 forwarder)', fromTo: '142.250.190.14:443 → 192.168.10.30:51234', what: 'Deliver HTTPS response to laptop', key: '{ "on_receive": "Laptop decrypts HTML and starts render waterfall", "next_requests": ["style.css", "app.js", "logo.png"], "cache_hint": "ETag etag-4af2b1 may allow 304 later" }', change: 'Delivered to the laptop; browser decrypts and begins fetching sub-resources.' },
      ]
      const d = steps[step - 1]
      if (!d) return null
      return {
        listId: `pkt-${String(200 + step).padStart(3,'0')}`,
        id: d.id,
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: d.enc,
        step: String(step),
        who_sends: d.who,
        from_to: d.fromTo,
        what: d.what,
        key_fields: d.key,
        what_changed_here: d.change,
      }
    }

    let payload: any = null
    if (hopIdx >= 0) {
      if (phase === 'DNS' || label.toUpperCase() === 'DNS') {
        // Map 10 edge hops to 8 logical DNS steps
        const hopToStep: Record<number, number> = {
          0: 1, // desktop -> switch
          1: 2, // switch -> router
          2: 3, // router -> firewall
          3: 4, // firewall -> earth (combined with 4)
          4: 4, // earth -> dns
          5: 5, // dns -> earth (combined with 6)
          6: 5, // earth -> firewall
          7: 6, // firewall -> router
          8: 7, // router -> switch
          9: 8, // switch -> desktop
        }
        const step = hopToStep[hopIdx]
        if (step) payload = overlayForDNS(step)
      } else if (phase === 'PKI' || label.toUpperCase() === 'TLS') {
        const hopToStepTLS: Record<number, number> = {
          0: 1,
          1: 2,
          2: 3,
          3: 4,
          4: 4,
          5: 5,
          6: 5,
          7: 6,
          8: 7,
          9: 8,
        }
        const step = hopToStepTLS[hopIdx]
        if (step) payload = overlayForTLS(step)
      } else if (phase === 'HTTPS' || label.toUpperCase() === 'HTTPS') {
        const hopToStepHTTPS: Record<number, number> = {
          0: 1,
          1: 2,
          2: 3,
          3: 4,
          4: 5,
          5: 6,
          6: 7,
          7: 8,
          8: 9,
          9: 10,
        }
        const step = hopToStepHTTPS[hopIdx]
        if (step) payload = overlayForHTTPS(step)
      }
    }

    // Fallback minimal payload if we couldn't match a hop
    if (!payload) {
      const id = flow?.meta?.id || flow?.meta?.packetId || `${label}-${Date.now()}`
      payload = {
        listId: id,
        id,
        type,
        protocol: proto,
        encrypted: flow?.meta?.encrypted ? 'Yes' : 'No',
        who_sends: from,
        from_to: `${from} → ${to}`,
        label: label,
      }
    }

    showHtmlOverlay(payload)
  }

  // Keep packet details logic wired for future use, but we intentionally removed the UI controls.
  // (prevents unused-variable lint errors if eslint is strict)
  void openDetails

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      left: 16,
      zIndex: 2000,
      pointerEvents: 'auto',
      width: 300,
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <div style={{
        background: 'rgba(17,24,39,0.85)',
        border: '1px solid #1f2937',
        color: '#e5e7eb',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}>Live Flow</div>
            <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.1, color: '#93c5fd' }}>{displayPhase(phase)}</div>
          </div>
          <button
            aria-label="Toggle HUD"
            onClick={() => setOpen(o => !o)}
            style={{
              background: 'transparent',
              color: '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              width: 28,
              height: 28,
              lineHeight: '28px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >{open ? '−' : '+'}</button>
        </div>

        {open && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <div style={{
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                textAlign: 'center'
              }}>
                {from} → {to}
              </div>
                {!hidePhaseSelect && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <select
                      value={phaseSel}
                      onChange={(e) => {
                        const p = e.target.value

                      // HTTPS room: prevent selecting HTTPS until Fix HTTPS is completed.
                      if (roomId === 'https' && p === 'HTTPS' && !httpsUnlocked) {
                        setPhaseSel('PKI')
                        dispatch('flow-control', { action: 'setPhase', phase: 'PKI' })
                        try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                        return
                      }

                        setPhaseSel(p)
                        dispatch('flow-control', { action: 'setPhase', phase: p })
                      }}
                      style={{ background: '#111827', color: 'white', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                      aria-label="Phase"
                      title={roomId === 'vpn'
                      ? (vpnHudActive ? 'VPN enabled: only Secure Access via VPN is available' : 'VPN disabled: only No VPN is available')
                      : roomId === 'https' && !httpsUnlocked
                        ? 'HTTPS is locked — complete Fix HTTPS to unlock it'
                        : 'Select simulation phase'
                    }
                  >
                    {phaseOptions.map((opt) => {
                      const disabledOpt = roomId === 'vpn'
                        ? (vpnHudActive ? opt === 'DNS' : opt === 'PKI')
                        : (roomId === 'https' ? (opt === 'HTTPS' && !httpsUnlocked) : false)
                      return (
                        <option key={opt} value={opt} disabled={disabledOpt}>
                          {displayPhase(opt)}
                          {roomId === 'vpn' && opt === 'PKI' ? ' (VPN)' : ''}
                          {roomId === 'https' && opt === 'HTTPS' && !httpsUnlocked ? ' (locked)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Mini topology map */}
            <div style={{ marginTop: 8 }}>
              <MiniMap phase={topologyPhase} roomId={roomId} fromAnchor={fromAnchor} toAnchor={toAnchor} isActive={status === 'active' || status === 'pending'} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
