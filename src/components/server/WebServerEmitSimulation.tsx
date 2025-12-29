'use client'

import * as React from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'

type WebServerEmitDetail = {
  kind: 'rx' | 'tx'
  phase?: string
  message?: string
  chips?: string[]
}

export type WebServerEmitSimulationProps = {
  enabled?: boolean
  anchorName?: string
  yOffset?: number
  eventName?: string
}

export default function WebServerEmitSimulation({
  enabled = true,
  anchorName = 'web1-center',
  yOffset = 1.55,
  eventName = 'webserver:emit',
}: WebServerEmitSimulationProps) {
  const { scene } = useThree()

  const rootRef = React.useRef<THREE.Group>(null)
  const anchorRef = React.useRef<THREE.Object3D | null>(null)

  const [evt, setEvt] = React.useState<(WebServerEmitDetail & { k: string }) | null>(null)
  const [visible, setVisible] = React.useState(false)

  const queueRef = React.useRef<Array<WebServerEmitDetail & { k: string }>>([])
  const playingRef = React.useRef(false)

  const timersRef = React.useRef<number[]>([])

  React.useEffect(() => {
    return () => {
      for (const t of timersRef.current) {
        try { window.clearTimeout(t) } catch {}
      }
      timersRef.current = []
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return

    const clearTimers = () => {
      for (const t of timersRef.current) {
        try { window.clearTimeout(t) } catch {}
      }
      timersRef.current = []
    }

    const playNext = () => {
      if (!enabled) return
      if (playingRef.current) return
      const next = queueRef.current.shift()
      if (!next) return

      playingRef.current = true
      setEvt(next)
      setVisible(true)

      // Keep each message up long enough to read, but not too long.
      const SHOW_MS = 2000
      const FADE_MS = 320

      clearTimers()
      timersRef.current.push(
        window.setTimeout(() => setVisible(false), SHOW_MS) as any,
        window.setTimeout(() => {
          setEvt(null)
          playingRef.current = false
          // Continue with any queued events
          playNext()
        }, SHOW_MS + FADE_MS) as any,
      )
    }

    const onEmit = (e: any) => {
      const d = (e?.detail || {}) as WebServerEmitDetail
      const k = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      queueRef.current.push({ ...d, k })
      // If nothing is showing, start immediately; otherwise, it will play after the current one.
      playNext()
    }

    window.addEventListener(eventName, onEmit as any)
    return () => {
      window.removeEventListener(eventName, onEmit as any)
      clearTimers()
      queueRef.current = []
      playingRef.current = false
    }
  }, [enabled, eventName])

  const tmpPosRef = React.useRef(new THREE.Vector3())

  useFrame(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root) return

    // Find anchor lazily (models load async)
    if (!anchorRef.current) {
      anchorRef.current =
        scene.getObjectByName(anchorName) ||
        scene.getObjectByName('web1-center') ||
        scene.getObjectByName('web1') ||
        scene.getObjectByName('server1-center') ||
        scene.getObjectByName('server1') ||
        null
    }

    const a = anchorRef.current
    if (!a) return

    a.getWorldPosition(tmpPosRef.current)
    const wp = tmpPosRef.current
    root.position.set(wp.x, wp.y + yOffset, wp.z)
  })

  if (!enabled || !evt) return null

  const chips = Array.isArray(evt.chips) ? evt.chips.filter(Boolean).map((s) => String(s)) : []
  const header = evt.kind === 'rx' ? 'WEB SERVER • RECEIVED' : 'WEB SERVER • SENDING'
  const border = evt.kind === 'rx' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(34, 197, 94, 0.35)'
  const accent = evt.kind === 'rx' ? '#38bdf8' : '#22c55e'

  return (
    <group ref={rootRef}>
      <Billboard follow>
        <Html
          transform
          distanceFactor={8}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            key={evt.k}
            style={{
              width: 340,
              borderRadius: 14,
              padding: '12px 12px 10px 12px',
              background: 'rgba(15, 23, 42, 0.88)',
              border: `1px solid ${border}`,
              boxShadow: '0 14px 42px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              opacity: visible ? 1 : 0,
              // ~1.5x smaller overall
              transformOrigin: 'top center',
              transform: visible ? 'translateY(0px) scale(0.6667)' : 'translateY(10px) scale(0.6667)',
              transition: 'opacity 260ms ease, transform 260ms ease',
              color: '#e5e7eb',
              fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.5, color: accent }}>
                {header}
              </div>
              {evt.phase ? (
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>{String(evt.phase)}</div>
              ) : null}
            </div>

            {evt.message ? (
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35, color: '#e2e8f0' }}>
                {evt.message}
              </div>
            ) : null}

            {chips.length ? (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chips.slice(0, 8).map((c, i) => (
                  <div
                    key={`${evt.k}-chip-${i}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'rgba(2, 6, 23, 0.55)',
                      border: '1px solid rgba(148, 163, 184, 0.22)',
                      color: '#e5e7eb',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
              {evt.kind === 'rx' ? 'Server parses the message and prepares a response.' : 'Server writes bytes back on the wire.'}
            </div>
          </div>
        </Html>
      </Billboard>
    </group>
  )
}
