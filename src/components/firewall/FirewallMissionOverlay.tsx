'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomObject } from '@/utils/glb-loader'
import { evaluateFirewallRules } from '@/engine/firewall/rules'
import { getFirewallRulesState, useFirewallRules } from '@/store/useFirewallRules'

type MissionStepId =
  | 'topology'
  | 'allowHttps'
  | 'httpsCheck'
  | 'simulateAttackAllowed'
  | 'denySsh'
  | 'simulateAttackDenied'

type MissionState = Record<MissionStepId, boolean>

const DEFAULT_MISSION: MissionState = {
  topology: false,
  allowHttps: false,
  httpsCheck: false,
  simulateAttackAllowed: false,
  denySsh: false,
  simulateAttackDenied: false,
}

export default function FirewallMissionOverlay({
  roomId,
  roomObjects,
}: {
  roomId?: string
  roomObjects?: RoomObject[]
}) {
  const isFirewallRoom = roomId === 'firewall'

  // Keep a subscription to firewall rules so we can auto-check steps when rules change.
  const fw = useFirewallRules()

  const [open, setOpen] = useState(false)
  const [completed, setCompleted] = useState<MissionState>({ ...DEFAULT_MISSION })

  const latestRulesRef = useRef(fw.rules)
  useEffect(() => {
    latestRulesRef.current = fw.rules
  }, [fw.rules])

  const metaById = useMemo(() => {
    const map: Record<string, any> = {}
    for (const o of (roomObjects || [])) {
      map[o.id] = (o as any).metadata || {}
    }
    return map
  }, [roomObjects])

  const stripCidr = (ip: any): string => {
    if (typeof ip !== 'string') return ''
    return ip.split('/')[0]
  }

  const web = useMemo(() => {
    const webNet = (metaById['dns1']?.net || {}) as any
    return {
      ip: stripCidr(webNet.ip) || '198.51.100.10',
      host: String(webNet.hostname || 'web-server'),
    }
  }, [metaById])

  const completeStep = useCallback((id: MissionStepId) => {
    setCompleted((prev) => {
      if (prev[id]) return prev
      return { ...prev, [id]: true }
    })
  }, [])

  const resetMission = useCallback(() => {
    setCompleted({ ...DEFAULT_MISSION })
  }, [])

  const doneCount = useMemo(() => {
    const ids = Object.keys(DEFAULT_MISSION) as MissionStepId[]
    return ids.reduce((acc, id) => acc + (completed[id] ? 1 : 0), 0)
  }, [completed])

  const steps = useMemo(() => {
    return [
      {
        id: 'topology' as const,
        title: 'Run topology',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            In <strong>Terminal</strong>, run{' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
              topology
            </span>
            .
          </span>
        ),
      },
      {
        id: 'allowHttps' as const,
        title: 'Allow HTTPS (TCP/443) in both directions',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            In <strong>Firewall Rules</strong>, set <strong>LAN → WAN TCP/443</strong> to <strong>ALLOW</strong> and set{' '}
            <strong>WAN → LAN TCP/443</strong> to <strong>ALLOW</strong>.
          </span>
        ),
      },
      {
        id: 'httpsCheck' as const,
        title: 'Confirm HTTPS works (TCP/443)',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            Try{' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
              telnet {web.ip} 443
            </span>{' '}
            or{' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
              curl https://{web.ip}
            </span>
            .
          </span>
        ),
      },
      {
        id: 'simulateAttackAllowed' as const,
        title: 'Simulate Attack (Compromised)',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            Click <strong>Simulate Attack</strong> while <strong>WAN → LAN TCP/22</strong> is still <strong>ALLOW</strong>.
          </span>
        ),
      },
      {
        id: 'denySsh' as const,
        title: 'Block SSH (TCP/22)',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            In <strong>Firewall Rules</strong>, set <strong>WAN → LAN TCP/22</strong> to <strong>DENY</strong>.
          </span>
        ),
      },
      {
        id: 'simulateAttackDenied' as const,
        title: 'Simulate again (Secured LAN)',
        detail: (
          <span style={{ color: '#cbd5e1' }}>
            Click <strong>Simulate Attack</strong> again and confirm the firewall blocks it.
          </span>
        ),
      },
    ]
  }, [web.ip])

  const nextStepId = useMemo(() => {
    return steps.find((s) => !completed[s.id])?.id ?? null
  }, [completed, steps])

  const setOpenSafe = useCallback((v: boolean) => {
    setOpen(!!v)
  }, [])

  // Toggle via header button
  useEffect(() => {
    if (!isFirewallRoom) return
    const onToggle = (evt: Event) => {
      const e = evt as CustomEvent<any>
      const targetRoomId = e?.detail?.roomId
      if (targetRoomId && targetRoomId !== 'firewall') return
      setOpen((o) => !o)
    }
    window.addEventListener('mission:toggle', onToggle as any)
    return () => window.removeEventListener('mission:toggle', onToggle as any)
  }, [isFirewallRoom])

  // Close with Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenSafe(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpenSafe])

  // Step: allow HTTPS in both directions when rules reflect it
  useEffect(() => {
    if (!isFirewallRoom) return
    try {
      const rules = Array.isArray(fw.rules) ? fw.rules : []
      const out = evaluateFirewallRules(rules, { srcZone: 'LAN', dstZone: 'WAN', protocol: 'TCP', port: 443 })
      const inn = evaluateFirewallRules(rules, { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 443 })
      if (out.action === 'ALLOW' && inn.action === 'ALLOW') completeStep('allowHttps')
    } catch {}
  }, [isFirewallRoom, fw.rules, completeStep])

  // Step: deny SSH when rules reflect it
  useEffect(() => {
    if (!isFirewallRoom) return
    try {
      const rules = Array.isArray(fw.rules) ? fw.rules : []
      const d = evaluateFirewallRules(rules, { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 22 })
      if (d.action === 'DENY') completeStep('denySsh')
    } catch {}
  }, [isFirewallRoom, fw.rules, completeStep])

  // Steps from terminal commands
  useEffect(() => {
    if (!isFirewallRoom) return

    const parsePort = (v: any): number | null => {
      const n = Number.parseInt(String(v || ''), 10)
      if (!Number.isFinite(n)) return null
      if (n < 1 || n > 65535) return null
      return n
    }

    const isIp = (v: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)

    const zoneForHost = (host: string): 'LAN' | 'WAN' => {
      const h = String(host || '').trim()
      if (!h) return 'WAN'
      if (!isIp(h)) return 'WAN'
      if (h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('127.')) return 'LAN'
      if (h.startsWith('172.')) {
        const parts = h.split('.')
        const second = Number.parseInt(parts[1] || '', 10)
        if (Number.isFinite(second) && second >= 16 && second <= 31) return 'LAN'
      }
      return 'WAN'
    }

    const hostMatchesWeb = (host: string): boolean => {
      const h = String(host || '').trim()
      if (!h) return false
      if (h === web.ip) return true
      if (h === web.host) return true
      if (h.includes(web.ip)) return true
      return false
    }

    const connectionAllowed = (dstHost: string, port: number): boolean => {
      const state = getFirewallRulesState?.()
      const rules = (state && Array.isArray((state as any).rules)) ? (state as any).rules : (latestRulesRef.current || [])

      const srcZone: 'LAN' | 'WAN' = 'LAN'
      const dstZone: 'LAN' | 'WAN' = zoneForHost(dstHost)
      if (srcZone === dstZone) return true

      // Same simplified learning model as the terminal: require both directions allowed.
      const forward = evaluateFirewallRules(rules, { srcZone, dstZone, protocol: 'TCP', port })
      const reverse = evaluateFirewallRules(rules, { srcZone: dstZone, dstZone: srcZone, protocol: 'TCP', port })
      return forward.action === 'ALLOW' && reverse.action === 'ALLOW'
    }

    const onTerminal = (evt: Event) => {
      const e = evt as CustomEvent<any>
      const d = e?.detail || {}
      if (d.roomId !== 'firewall') return

      const cmd = String(d.commandId || '').trim()
      const args = (d.args || {}) as Record<string, any>

      if (cmd === 'topology') {
        completeStep('topology')
        return
      }

      if (cmd === 'telnet' || cmd === 'nc') {
        const host = String(args.host || '').trim()
        const port = parsePort(args.port)
        if (port === 443 && hostMatchesWeb(host)) {
          if (connectionAllowed(host, 443)) completeStep('httpsCheck')
        }
        return
      }

      if (cmd === 'curl') {
        const urlRaw = String(args.url || '').trim()
        if (!urlRaw) return
        try {
          const u = new URL(urlRaw)
          const host = String(u.hostname || '').trim()
          const port = parsePort(u.port) ?? (u.protocol === 'http:' ? 80 : 443)
          if (port === 443 && hostMatchesWeb(host)) {
            if (connectionAllowed(host, 443)) completeStep('httpsCheck')
          }
        } catch {
          // ignore
        }
      }
    }

    window.addEventListener('terminal:command-executed', onTerminal as any)
    return () => window.removeEventListener('terminal:command-executed', onTerminal as any)
  }, [isFirewallRoom, web.ip, web.host, completeStep])

  // Steps from attack simulation button
  useEffect(() => {
    if (!isFirewallRoom) return

    const onSimulateAttack = () => {
      try {
        const state = getFirewallRulesState?.()
        const rules = (state && Array.isArray((state as any).rules)) ? (state as any).rules : (latestRulesRef.current || [])
        const d = evaluateFirewallRules(rules, { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 22 })
        if (d.action === 'DENY') {
          completeStep('simulateAttackDenied')
        } else {
          completeStep('simulateAttackAllowed')
        }
      } catch {}
    }

    window.addEventListener('firewall:simulate-attack', onSimulateAttack as any)
    return () => window.removeEventListener('firewall:simulate-attack', onSimulateAttack as any)
  }, [isFirewallRoom, completeStep])

  if (!isFirewallRoom) return null

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Mission"
      data-loc="src/components/firewall/FirewallMissionOverlay.tsx:root"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 72,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 120px)',
        background: 'rgba(17, 24, 39, 0.93)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        color: '#e5e7eb',
        fontFamily: 'Inter, system-ui, sans-serif',
        zIndex: 9490,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 12px 10px 12px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>Mission</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: '2px 10px',
              borderRadius: 999,
              background: 'rgba(59, 130, 246, 0.14)',
              color: '#bfdbfe',
              border: '1px solid rgba(59, 130, 246, 0.25)',
            }}
          >
            {doneCount}/{steps.length}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={resetMission}
            aria-label="Reset mission"
            style={{
              height: 28,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: 'rgba(15, 23, 42, 0.7)',
              color: '#e5e7eb',
              cursor: 'pointer',
              padding: '0 10px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Reset
          </button>
          <button
            onClick={() => setOpenSafe(false)}
            aria-label="Close Mission"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: 'rgba(15, 23, 42, 0.7)',
              color: '#e5e7eb',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px 12px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35, marginBottom: 10 }}>
          Follow these steps to learn firewall rule evaluation and secure the LAN.
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {steps.map((s, idx) => {
            const done = !!completed[s.id]
            const isNext = !done && nextStepId === s.id

            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 10px',
                  borderRadius: 12,
                  background: isNext ? 'rgba(59, 130, 246, 0.10)' : 'rgba(15, 23, 42, 0.55)',
                  border: isNext
                    ? '1px solid rgba(59, 130, 246, 0.35)'
                    : '1px solid rgba(148, 163, 184, 0.14)',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    marginTop: 2,
                    fontSize: 12,
                    fontWeight: 900,
                    color: done ? '#052e16' : '#cbd5e1',
                    background: done ? 'rgba(34, 197, 94, 0.22)' : 'rgba(148, 163, 184, 0.16)',
                    border: done ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(148, 163, 184, 0.24)',
                  }}
                >
                  {done ? '✓' : idx + 1}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#e5e7eb', lineHeight: 1.35 }}>
                    {s.title}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.35 }}>
                    {s.detail}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
          Tip: Press <strong>Esc</strong> to close.
        </div>
      </div>
    </div>
  )
}
