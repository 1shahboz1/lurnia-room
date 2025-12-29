'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  evaluateFirewallRules,
  type FirewallDecision,
  type FirewallRule,
  type FirewallTraffic,
  type Protocol,
  type RuleAction,
  type Zone,
} from '@/engine/firewall/rules'
import { useFirewallRules } from '@/store/useFirewallRules'

function clampPort(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(65535, Math.floor(n)))
}

function formatDecisionText(decision: FirewallDecision): string {
  const matched = decision.matchedRuleIndex
  const via = (matched != null) ? `Matched Rule ${matched + 1}` : 'Default (no match)'
  return `${decision.action} • ${via}`
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

export default function FirewallRulesOverlay({ roomId }: { roomId?: string }) {
  const { visible, rules, setRules, hide, toggle } = useFirewallRules()

  const isFirewallRoom = roomId === 'firewall'

  // If we navigate away from the firewall room, ensure this panel is hidden.
  useEffect(() => {
    if (!isFirewallRoom && visible) hide()
  }, [isFirewallRoom, visible, hide])

  const [activeRuleIndex, setActiveRuleIndex] = useState<number | null>(null)
  const [flashRuleIndex, setFlashRuleIndex] = useState<number | null>(null)

  // Keep the demo traffic simple + focused (matches the room's main HTTPS example)
  const outboundTraffic = useMemo<FirewallTraffic>(() => {
    return { srcZone: 'LAN', dstZone: 'WAN', protocol: 'TCP', port: 443 }
  }, [])

  const inboundTraffic = useMemo<FirewallTraffic>(() => {
    return { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 443 }
  }, [])

  const attackTrafficEval = useMemo<FirewallTraffic>(() => {
    // Keep the attack demo consistent for learners: SSH attempt (TCP/22) from WAN → LAN.
    return { srcZone: 'WAN', dstZone: 'LAN', protocol: 'TCP', port: 22 }
  }, [])

  const outboundDecision = useMemo(() => {
    return evaluateFirewallRules(rules, outboundTraffic)
  }, [rules, outboundTraffic])

  const inboundDecision = useMemo(() => {
    return evaluateFirewallRules(rules, inboundTraffic)
  }, [rules, inboundTraffic])

  const attackDecision = useMemo(() => {
    return evaluateFirewallRules(rules, attackTrafficEval)
  }, [rules, attackTrafficEval])

  useEffect(() => {
    if (flashRuleIndex == null) return
    const t = setTimeout(() => setFlashRuleIndex(null), 650)
    return () => clearTimeout(t)
  }, [flashRuleIndex])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, hide])

  // Allow external UI (e.g. Header) to toggle this overlay
  useEffect(() => {
    if (!isFirewallRoom) return
    const onToggle = () => toggle()
    window.addEventListener('firewall:toggle-rules', onToggle as any)
    return () => window.removeEventListener('firewall:toggle-rules', onToggle as any)
  }, [isFirewallRoom, toggle])

  const setRule = useCallback((idx: number, patch: Partial<FirewallRule>) => {
    const next = (rules || []).map((r, i) => (i === idx ? { ...r, ...patch } : r))
    setRules(next)
    setActiveRuleIndex(idx)
    setFlashRuleIndex(idx)
  }, [rules, setRules])

  const outboundDecisionText = useMemo(() => formatDecisionText(outboundDecision), [outboundDecision])
  const inboundDecisionText = useMemo(() => formatDecisionText(inboundDecision), [inboundDecision])
  const attackDecisionText = useMemo(() => formatDecisionText(attackDecision), [attackDecision])

  if (!isFirewallRoom) return null
  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Firewall Rules"
      data-loc="src/components/firewall/FirewallRulesOverlay.tsx:root"
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        height: 'calc(100vh - 24px)',
        background: 'rgba(17, 24, 39, 0.93)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        color: '#e5e7eb',
        fontFamily: 'Inter, system-ui, sans-serif',
        zIndex: 9500,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>Firewall Rules</div>
        </div>
        <button
          onClick={() => hide()}
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

      {/* Content */}
      <div style={{ padding: '10px 12px 12px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>

        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35, marginBottom: 10 }}>
          Changing a rule changes whether traffic is allowed or blocked.
        </div>

        {/* Traffic + Decisions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            borderRadius: 10,
            padding: '10px 10px',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Simulated traffic</div>

          {/* Outbound */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>Outbound (LAN → WAN)</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {outboundTraffic.srcZone} → {outboundTraffic.dstZone} • {outboundTraffic.protocol}/{outboundTraffic.port}
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Decision</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${outboundDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`,
                  background: outboundDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: outboundDecision.action === 'ALLOW' ? '#86efac' : '#fca5a5',
                  whiteSpace: 'nowrap',
                }}
              >
                {outboundDecisionText}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.12)', marginTop: 2, marginBottom: 2 }} />

          {/* Inbound */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>Inbound (WAN → LAN)</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {inboundTraffic.srcZone} → {inboundTraffic.dstZone} • {inboundTraffic.protocol}/{inboundTraffic.port}
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Decision</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${inboundDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`,
                  background: inboundDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: inboundDecision.action === 'ALLOW' ? '#86efac' : '#fca5a5',
                  whiteSpace: 'nowrap',
                }}
              >
                {inboundDecisionText}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(148, 163, 184, 0.12)', marginTop: 2, marginBottom: 2 }} />

          {/* Attack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>Attack simulation (WAN → LAN)</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {attackTrafficEval.srcZone} → {attackTrafficEval.dstZone} • {attackTrafficEval.protocol}/{attackTrafficEval.port}
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Decision</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${attackDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`,
                  background: attackDecision.action === 'ALLOW' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: attackDecision.action === 'ALLOW' ? '#86efac' : '#fca5a5',
                  whiteSpace: 'nowrap',
                }}
              >
                {attackDecisionText}
              </div>
            </div>

          </div>

          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Editing</div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(2, 6, 23, 0.25)',
                color: '#e5e7eb',
                whiteSpace: 'nowrap',
              }}
            >
              {activeRuleIndex == null ? 'Click a rule below' : `Rule ${activeRuleIndex + 1}`}
            </div>
          </div>
        </div>

        {/* Rules */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(rules || []).slice(0, 3).map((r, idx) => {
            const isActive = activeRuleIndex === idx
            const isFlash = flashRuleIndex === idx
            const borderColor = 'rgba(148, 163, 184, 0.14)'

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

        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35, paddingTop: 10 }}>
          Tip: If you place a DENY rule above an ALLOW rule for the same traffic, the traffic will be blocked.
        </div>
      </div>
    </div>
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
