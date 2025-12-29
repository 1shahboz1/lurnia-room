'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

type VpnStepId = 'observeEavesdrop' | 'blockedByFirewall' | 'enableVpn' | 'observeEncrypted' | 'reachLanServer'

type HttpsStepId =
  | 'completeHttp'
  | 'completeTlsHandshake'
  | 'fixHttps'
  | 'completeHttps'
  | 'observeHttpsEncrypted'

type MissionState<T extends string> = Record<T, boolean>

const DEFAULT_VPN_MISSION: MissionState<VpnStepId> = {
  observeEavesdrop: false,
  blockedByFirewall: false,
  enableVpn: false,
  observeEncrypted: false,
  reachLanServer: false,
}

const DEFAULT_HTTPS_MISSION: MissionState<HttpsStepId> = {
  completeHttp: false,
  completeTlsHandshake: false,
  fixHttps: false,
  completeHttps: false,
  observeHttpsEncrypted: false,
}

export default function RoomMissionOverlay({ roomId }: { roomId?: string }) {
  const isFirewallRoom = roomId === 'firewall'
  const isVpnRoom = roomId === 'vpn'
  const isHttpsRoom = roomId === 'https'
  const [open, setOpen] = useState(false)

  const [vpnCompleted, setVpnCompleted] = useState<MissionState<VpnStepId>>({ ...DEFAULT_VPN_MISSION })
  const [httpsCompleted, setHttpsCompleted] = useState<MissionState<HttpsStepId>>({ ...DEFAULT_HTTPS_MISSION })

  const setOpenSafe = useCallback((v: boolean) => {
    setOpen(!!v)
  }, [])

  const resetVpnMission = useCallback(() => {
    setVpnCompleted({ ...DEFAULT_VPN_MISSION })
  }, [])

  const resetHttpsMission = useCallback(() => {
    setHttpsCompleted({ ...DEFAULT_HTTPS_MISSION })
  }, [])

  const completeVpnStep = useCallback((id: VpnStepId) => {
    setVpnCompleted((prev) => {
      if (prev[id]) return prev
      return { ...prev, [id]: true }
    })
  }, [])

  const completeHttpsStep = useCallback((id: HttpsStepId) => {
    setHttpsCompleted((prev) => {
      if (prev[id]) return prev
      return { ...prev, [id]: true }
    })
  }, [])

  // Toggle via header button
  useEffect(() => {
    if (isFirewallRoom) return

    const onToggle = (evt: Event) => {
      const e = evt as CustomEvent<any>
      const targetRoomId = e?.detail?.roomId
      // If caller provided a roomId, only toggle for the matching room.
      if (targetRoomId && roomId && targetRoomId !== roomId) return
      setOpen((o) => !o)
    }

    window.addEventListener('mission:toggle', onToggle as any)
    return () => window.removeEventListener('mission:toggle', onToggle as any)
  }, [isFirewallRoom, roomId])

  // Close with Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenSafe(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpenSafe])

  // VPN room: auto-complete steps based on simulation events
  useEffect(() => {
    if (!isVpnRoom) return

    const onEavesdrop = (evt: Event) => {
      const e = evt as CustomEvent<any>
      const mode = String(e?.detail?.mode || '')
      if (mode === 'observed') completeVpnStep('observeEavesdrop')
      if (mode === 'encrypted') completeVpnStep('observeEncrypted')
    }

    const onBlocked = () => completeVpnStep('blockedByFirewall')

    const onAllowed = () => completeVpnStep('reachLanServer')

    const onVpnActive = (evt: Event) => {
      const e = evt as CustomEvent<any>
      if (e?.detail?.active === true) completeVpnStep('enableVpn')
    }

    window.addEventListener('vpn:eavesdrop', onEavesdrop as any)
    window.addEventListener('vpn:blocked', onBlocked as any)
    window.addEventListener('vpn:allowed', onAllowed as any)
    window.addEventListener('vpn:active', onVpnActive as any)

    return () => {
      window.removeEventListener('vpn:eavesdrop', onEavesdrop as any)
      window.removeEventListener('vpn:blocked', onBlocked as any)
      window.removeEventListener('vpn:allowed', onAllowed as any)
      window.removeEventListener('vpn:active', onVpnActive as any)
    }
  }, [isVpnRoom, completeVpnStep])

  // HTTPS room: auto-complete steps based on simulation events
  useEffect(() => {
    if (!isHttpsRoom) return

    const onHttpComplete = () => completeHttpsStep('completeHttp')
    const onTlsComplete = () => completeHttpsStep('completeTlsHandshake')
    const onHttpsComplete = () => completeHttpsStep('completeHttps')

    const onEavesdrop = (evt: Event) => {
      const e = evt as CustomEvent<any>
      const d = e?.detail || {}
      const pid = String(d.packetId || '')
      const mode = String(d.mode || '')

      // HTTP readability happens during the HTTP phase; we track it as part of `completeHttp`.
      if (pid.startsWith('https-') && mode === 'encrypted') {
        completeHttpsStep('observeHttpsEncrypted')
      }
    }

    window.addEventListener('https:http:complete', onHttpComplete as any)
    window.addEventListener('https:tls:complete', onTlsComplete as any)
    window.addEventListener('https:https:complete', onHttpsComplete as any)
    window.addEventListener('https:eavesdrop', onEavesdrop as any)

    return () => {
      window.removeEventListener('https:http:complete', onHttpComplete as any)
      window.removeEventListener('https:tls:complete', onTlsComplete as any)
      window.removeEventListener('https:https:complete', onHttpsComplete as any)
      window.removeEventListener('https:eavesdrop', onEavesdrop as any)
    }
  }, [isHttpsRoom, completeHttpsStep])

  // HTTPS room: step "Fix HTTPS" when the troubleshooter reaches OK.
  useEffect(() => {
    if (!isHttpsRoom) return

    let t: any = null
    const poll = () => {
      const ok = (() => {
        try { return !!(window as any).__HTTPS_TROUBLESHOOT__?.ok } catch { return false }
      })()
      if (ok) completeHttpsStep('fixHttps')
    }

    poll()
    t = setInterval(poll, 250)
    return () => {
      try { if (t) clearInterval(t) } catch {}
    }
  }, [isHttpsRoom, completeHttpsStep])

  const roomLabel = useMemo(() => {
    if (!roomId) return 'this room'
    return `“${roomId}”`
  }, [roomId])

  const vpnSteps = useMemo(() => {
    return [
      {
        id: 'observeEavesdrop' as const,
        title: 'Observe eavesdropping (No VPN)',
        detail: 'With VPN OFF, start the flow and watch the eavesdropper pull a copy and read fields (red boxes).',
      },
      {
        id: 'blockedByFirewall' as const,
        title: 'See the firewall block access',
        detail: 'Confirm you get “VPN Required / Access Denied” when trying to reach the internal resource without a tunnel.',
      },
      {
        id: 'enableVpn' as const,
        title: 'Enable VPN',
        detail: 'Press “V” or click “Enable VPN” to establish an encrypted tunnel to the firewall.',
      },
      {
        id: 'observeEncrypted' as const,
        title: 'Observe encryption (VPN ON)',
        detail: 'With VPN ON, the eavesdropper can still capture—but it can’t read the contents (green boxes: Encrypted).',
      },
      {
        id: 'reachLanServer' as const,
        title: 'Reach the internal web server via VPN',
        detail: 'Confirm “Access Granted / Secure Access via VPN” and that traffic continues into the LAN to the Web Server.',
      },
    ]
  }, [])

  const httpsSteps = useMemo(() => {
    return [
      {
        id: 'completeHttp' as const,
        title: 'Complete HTTP phase (plaintext) + observe attacker',
        detail: 'Run the HTTP phase and wait for the response to return to the LAN Desktop. You should see the red warning panel AND the attacker reading HTTP content.',
      },
      {
        id: 'completeTlsHandshake' as const,
        title: 'Complete TLS Handshake (PKI)',
        detail: 'Run the TLS Handshake phase and wait for it to return to the LAN Desktop. (Fix HTTPS should pop up.)',
      },
      {
        id: 'fixHttps' as const,
        title: 'Fix broken HTTPS',
        detail: 'Use the Fix HTTPS panel and answer the questions until it shows ALL FIXED.',
      },
      {
        id: 'completeHttps' as const,
        title: 'Complete HTTPS phase (encrypted)',
        detail: 'Run HTTPS and wait for the encrypted response to return to the LAN Desktop. (You should see the green success panel.)',
      },
      {
        id: 'observeHttpsEncrypted' as const,
        title: 'Observe attacker can’t read HTTPS',
        detail: 'The attacker can still capture packets, but will only see “Encrypted / Can’t read the data!”.',
      },
    ]
  }, [])

  const vpnDoneCount = useMemo(() => {
    const ids = Object.keys(DEFAULT_VPN_MISSION) as VpnStepId[]
    return ids.reduce((acc, id) => acc + (vpnCompleted[id] ? 1 : 0), 0)
  }, [vpnCompleted])

  const httpsDoneCount = useMemo(() => {
    const ids = Object.keys(DEFAULT_HTTPS_MISSION) as HttpsStepId[]
    return ids.reduce((acc, id) => acc + (httpsCompleted[id] ? 1 : 0), 0)
  }, [httpsCompleted])

  const vpnNextStepId = useMemo(() => {
    return vpnSteps.find((s) => !vpnCompleted[s.id])?.id ?? null
  }, [vpnCompleted, vpnSteps])

  const httpsNextStepId = useMemo(() => {
    return httpsSteps.find((s) => !httpsCompleted[s.id])?.id ?? null
  }, [httpsCompleted, httpsSteps])

  if (isFirewallRoom) return null
  if (!open) return null

  const doneCount = isVpnRoom ? vpnDoneCount : isHttpsRoom ? httpsDoneCount : 0
  const totalCount = isVpnRoom ? vpnSteps.length : isHttpsRoom ? httpsSteps.length : 0

  return (
    <div
      role="dialog"
      aria-label="Mission"
      data-loc="src/components/missions/RoomMissionOverlay.tsx:root"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>Mission</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{roomLabel}</div>
          </div>

          {(isVpnRoom || isHttpsRoom) && (
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
              {doneCount}/{totalCount}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(isVpnRoom || isHttpsRoom) && (
            <button
              onClick={isVpnRoom ? resetVpnMission : resetHttpsMission}
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
          )}

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
        {isVpnRoom ? (
          <>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35, marginBottom: 10 }}>
              Complete these steps to understand why VPN matters (capture vs readability).
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {vpnSteps.map((s, idx) => {
                const done = !!vpnCompleted[s.id]
                const isNext = !done && vpnNextStepId === s.id

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
                      <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.35, color: '#cbd5e1' }}>
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
          </>
        ) : isHttpsRoom ? (
          <>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35, marginBottom: 10 }}>
              Complete these steps to learn why HTTPS matters (capture vs readability) and how TLS makes the difference.
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {httpsSteps.map((s, idx) => {
                const done = !!httpsCompleted[s.id]
                const isNext = !done && httpsNextStepId === s.id

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
                      <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.35, color: '#cbd5e1' }}>
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
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35, marginBottom: 10 }}>
              Missions for {roomLabel} haven’t been configured yet.
            </div>

            <div
              style={{
                fontSize: 12,
                color: '#94a3b8',
                lineHeight: 1.45,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.14)',
                borderRadius: 10,
                padding: '10px 10px',
              }}
            >
              Tip: We’ll add room-specific missions here as we build each experience.
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
              Tip: Press <strong>Esc</strong> to close.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
