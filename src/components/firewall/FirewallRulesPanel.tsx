'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FirewallDecision, FirewallRule, FirewallTraffic, Protocol, RuleAction, Zone } from '@/engine/firewall/rules'

type FirewallRulesPanelProps = {
  open: boolean
  rules: FirewallRule[]
  onChangeRules: (next: FirewallRule[]) => void
  traffic: FirewallTraffic
  decision: FirewallDecision
  anchorName?: string
  offset?: [number, number, number]
  onClose?: () => void
}

function clampPort(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(65535, Math.floor(n)))
}

const ZONES: Zone[] = ['LAN', 'WAN']
const PROTOCOLS: Protocol[] = ['TCP', 'UDP']
const ACTIONS: RuleAction[] = ['ALLOW', 'DENY']
const PORT_PRESETS: Array<{ label: string; value: string }> = [
  { label: '22', value: '22' },
  { label: '80', value: '80' },
  { label: '443', value: '443' },
  { label: 'Custom…', value: 'custom' },
]

export default function FirewallRulesPanel({
  open,
  rules,
  onChangeRules,
  traffic,
  decision,
  anchorName = 'firewall1-center',
  offset = [2.8, 1.25, 0],
  onClose,
}: FirewallRulesPanelProps) {
  const { scene } = useThree()

  const rootRef = useRef<THREE.Group>(null)
  const anchorRef = useRef<THREE.Object3D | null>(null)

  const [activeRuleIndex, setActiveRuleIndex] = useState<number | null>(null)
  const [flashRuleIndex, setFlashRuleIndex] = useState<number | null>(null)

  useFrame(() => {
    if (!open) return
    const root = rootRef.current
    if (!root) return

    if (!anchorRef.current) {
      anchorRef.current =
        scene.getObjectByName(anchorName) ||
        scene.getObjectByName('firewall1-center') ||
        scene.getObjectByName('firewall1') ||
        null
    }

    const anchor = anchorRef.current
    if (!anchor) return

    anchor.updateMatrixWorld(true)
    const wp = new THREE.Vector3()
    anchor.getWorldPosition(wp)

    root.position.set(wp.x + offset[0], wp.y + offset[1], wp.z + offset[2])
  })

  useEffect(() => {
    if (flashRuleIndex == null) return
    const t = setTimeout(() => setFlashRuleIndex(null), 650)
    return () => clearTimeout(t)
  }, [flashRuleIndex])

  // Reset cached anchor if panel is reopened (models may have reloaded)
  useEffect(() => {
    if (!open) return
    anchorRef.current = null
  }, [open])

  const setRule = useCallback(
    (idx: number, patch: Partial<FirewallRule>) => {
      const next = (rules || []).map((r, i) => (i === idx ? { ...r, ...patch } : r))
      onChangeRules(next)
      setActiveRuleIndex(idx)
      setFlashRuleIndex(idx)
    },
    [rules, onChangeRules]
  )

  const decisionText = useMemo(() => {
    const matched = decision.matchedRuleIndex
    const via = (matched != null) ? `Rule ${matched + 1}` : 'Default (no match)'
    return `${decision.action} • ${via}`
  }, [decision])

  if (!open) return null

  return (
    <group ref={rootRef}>
      <Html center distanceFactor={10}>
        <div
          style={{
            width: 360,
            maxWidth: '90vw',
            background: 'rgba(17, 24, 39, 0.90)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            borderRadius: 12,
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            color: '#e5e7eb',
            fontFamily: 'Inter, system-ui, sans-serif',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
          onPointerDown={(e) => {
            // Prevent pointer events from leaking into the 3D scene
            e.stopPropagation()
          }}
          onPointerMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 12px 8px 12px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>Firewall Rules</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Top → bottom. First match wins.</div>
            </div>
            <button
              onClick={() => onClose?.()}
              aria-label="Close Firewall Rules"
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

          {/* Learning context */}
          <div style={{ padding: '10px 12px 0 12px' }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35 }}>
              Changing a rule changes whether traffic is allowed or blocked.
            </div>
          </div>

          {/* Traffic + Decision */}
          <div style={{ padding: '10px 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.14)',
                borderRadius: 10,
                padding: '10px 10px',
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Simulated traffic</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {traffic.srcZone} → {traffic.dstZone} • {traffic.protocol}/{traffic.port}
              </div>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Decision</div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: `1px solid ${decision.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`,
                    background: decision.action === 'ALLOW' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: decision.action === 'ALLOW' ? '#86efac' : '#fca5a5',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {decisionText}
                </div>
              </div>
            </div>

            {/* Rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(rules || []).slice(0, 3).map((r, idx) => {
                const isActive = activeRuleIndex === idx
                const isFlash = flashRuleIndex === idx
                const isMatched = decision.matchedRuleIndex === idx
                const borderColor = isMatched
                  ? (decision.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)')
                  : 'rgba(148, 163, 184, 0.14)'

                return (
                  <div
                    key={r.id}
                    onClick={() => setActiveRuleIndex(idx)}
                    style={{
                      background: isFlash
                        ? 'rgba(59, 130, 246, 0.10)'
                        : isActive
                          ? 'rgba(15, 23, 42, 0.70)'
                          : 'rgba(15, 23, 42, 0.52)',
                      border: `1px solid ${borderColor}`,
                      borderRadius: 10,
                      padding: 10,
                      cursor: 'pointer',
                      transition: 'background 160ms ease, border-color 160ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Rule {idx + 1}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: `1px solid ${r.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`,
                          background: r.action === 'ALLOW' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          color: r.action === 'ALLOW' ? '#86efac' : '#fca5a5',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.action}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <FieldSelect
                        label="Source"
                        value={r.srcZone}
                        options={ZONES}
                        onChange={(v) => setRule(idx, { srcZone: v })}
                      />
                      <FieldSelect
                        label="Destination"
                        value={r.dstZone}
                        options={ZONES}
                        onChange={(v) => setRule(idx, { dstZone: v })}
                      />
                      <FieldSelect
                        label="Protocol"
                        value={r.protocol}
                        options={PROTOCOLS}
                        onChange={(v) => setRule(idx, { protocol: v })}
                      />
                      <PortField
                        port={r.port}
                        onChange={(p) => setRule(idx, { port: clampPort(p) })}
                      />
                      <div style={{ gridColumn: '1 / span 2' }}>
                        <FieldSelect
                          label="Action"
                          value={r.action}
                          options={ACTIONS}
                          onChange={(v) => setRule(idx, { action: v })}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35, paddingBottom: 2 }}>
              Tip: If you place a DENY rule above an ALLOW rule for the same traffic, the traffic will be blocked.
            </div>
          </div>
        </div>
      </Html>
    </group>
  )
}

function FieldSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          background: 'rgba(2, 6, 23, 0.55)',
          color: '#e5e7eb',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          borderRadius: 8,
          padding: '8px 8px',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function PortField({ port, onChange }: { port: number; onChange: (p: number) => void }) {
  const preset = (port === 22 || port === 80 || port === 443) ? String(port) : 'custom'
  const [custom, setCustom] = useState<string>(() => String(port))

  useEffect(() => {
    if (preset === 'custom') setCustom(String(port))
  }, [port, preset])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
      <span>Port</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          value={preset}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') {
              // Keep current custom port (or pick a reasonable default)
              const next = (port === 22 || port === 80 || port === 443) ? 8080 : port
              onChange(next)
            } else {
              onChange(Number(v))
            }
          }}
          style={{
            flex: '0 0 120px',
            background: 'rgba(2, 6, 23, 0.55)',
            color: '#e5e7eb',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            borderRadius: 8,
            padding: '8px 8px',
            fontSize: 12,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {PORT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {preset === 'custom' && (
          <input
            value={custom}
            inputMode="numeric"
            onChange={(e) => {
              setCustom(e.target.value)
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange(n)
            }}
            placeholder="1-65535"
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              background: 'rgba(2, 6, 23, 0.55)',
              color: '#e5e7eb',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              borderRadius: 8,
              padding: '8px 8px',
              fontSize: 12,
              outline: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
