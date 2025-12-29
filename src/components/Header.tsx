'use client'

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Boxes, Search, Shield, Terminal } from 'lucide-react'
import { toggleFirewallRulesPanel } from '@/store/useFirewallRules'

type UIMode = 'design' | 'view'

interface HeaderProps {
  onInventoryToggle: () => void
  onSaveClick?: () => void
  onResetClick?: () => void
  onDeleteClick?: () => void
  onInspectorToggle?: () => void
  onTerminalToggle?: () => void
  onFirewallRulesToggle?: () => void
  onSimulateAttack?: () => void
  onStartOverride?: () => void
  roomId?: string
  mode?: UIMode
  onModeChange?: (mode: UIMode) => void
  selectedModelCoordinates?: { name: string; center: { x: number; y: number; z: number } } | null
}

function Header({ onInventoryToggle, onSaveClick, onResetClick, onDeleteClick, onInspectorToggle, onTerminalToggle, onFirewallRulesToggle, onSimulateAttack, onStartOverride, roomId, mode = 'design', onModeChange, selectedModelCoordinates }: HeaderProps) {
  const lastClickTime = useRef(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!(e.target instanceof Node)) return
      if (!menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])
  
  const handleInventoryClick = useCallback((e: React.MouseEvent) => {
    if (!e.isTrusted) return
    const now = Date.now()
    if (now - lastClickTime.current < 200) return
    lastClickTime.current = now
    e.preventDefault()
    e.stopPropagation()
    onInventoryToggle()
  }, [onInventoryToggle])

const iconFor = (m: UIMode) => (m === 'design' ? '🛠️' : '👁️')
const labelFor = (m: UIMode) => (m === 'design' ? 'Design' : 'View')

  const isFirewallRoom = roomId === 'firewall'
  const isVpnRoom = roomId === 'vpn'
  const isHttpsRoom = roomId === 'https'

  const isDesignPath = (() => {
    try {
      return typeof window !== 'undefined' && window.location.pathname.startsWith('/design/')
    } catch {
      return false
    }
  })()

  // VPN toggle (UI only). Stored globally so other systems can hook in later.
  const [vpnActive, setVpnActive] = useState<boolean>(() => {
    try {
      const w: any = typeof window !== 'undefined' ? window : {}
      if (w.__VPN_ACTIVE__ != null) return !!w.__VPN_ACTIVE__
    } catch {}
    return false
  })

  useEffect(() => {
    if (!isVpnRoom) return
    const onVpn = (e: any) => {
      const next = !!e?.detail?.active
      setVpnActive(next)
      try { ;(window as any).__VPN_ACTIVE__ = next } catch {}
    }
    window.addEventListener('vpn:active', onVpn as any)
    return () => window.removeEventListener('vpn:active', onVpn as any)
  }, [isVpnRoom])

  const toggleVpnActive = useCallback(() => {
    const next = !vpnActive
    setVpnActive(next)
    try { ;(window as any).__VPN_ACTIVE__ = next } catch {}
    try { window.dispatchEvent(new CustomEvent('vpn:active', { detail: { active: next, source: 'header' } })) } catch {}
  }, [vpnActive])

  return (
    <header style={{ 
      position: 'fixed', 
      top: 0, 
      zIndex: 50, 
      width: '100%', 
      height: '64px', 
      backgroundColor: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      pointerEvents: 'none'
    }}>
      {/* Mode dropdown */}
      {onModeChange && (
        <div ref={menuRef} style={{ pointerEvents: 'auto', position: 'fixed', right: '16px', top: '12px', zIndex: 70 }}>
          <button 
            onClick={() => setMenuOpen((o) => !o)}
            style={{ 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              padding: '10px 16px',
              border: 'none', 
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              width: '140px',
              height: '40px',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#2563eb'
              target.style.transform = 'translateY(-1px)'
              target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#3b82f6'
              target.style.transform = 'translateY(0)'
              target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <span style={{ fontSize: '16px' }}>⚙️</span>
            Mode
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: 'calc(100% + 8px)',
              minWidth: '180px',
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
{(['design','view'] as UIMode[]).map((m) => {
                const active = m === mode
                return (
                  <button
                    key={m}
                    onClick={() => { onModeChange(m); setMenuOpen(false) }}
                    aria-pressed={active}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      textAlign: 'left',
                      backgroundColor: active ? '#1f2937' : 'transparent',
                      color: active ? '#ffffff' : '#e5e7eb',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      fontFamily: 'Inter, system-ui, sans-serif'
                    }}
                    onMouseEnter={(e) => {
                      const target = e.target as HTMLButtonElement
                      if (!active) target.style.backgroundColor = '#374151'
                    }}
                    onMouseLeave={(e) => {
                      const target = e.target as HTMLButtonElement
                      if (!active) target.style.backgroundColor = 'transparent'
                    }}
                  >
                    <span style={{ width: 18, display: 'inline-block' }}>{iconFor(m)}</span>
                    {labelFor(m)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Inventory Button (Design mode) */}
      {mode === 'design' && (
        <button 
          onClick={handleInventoryClick}
          style={{ 
            position: 'fixed',
            top: '60px',
            right: '16px',
            backgroundColor: '#3b82f6', 
            color: 'white', 
            padding: '10px 16px',
            border: 'none', 
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            pointerEvents: 'auto',
            zIndex: 60,
            width: '140px',
            height: '40px'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#2563eb'
            target.style.transform = 'translateY(-1px)'
            target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#3b82f6'
            target.style.transform = 'translateY(0)'
            target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}
        >
          <Boxes style={{ width: '16px', height: '16px' }} />
          Inventory
        </button>
      )}

{/* Inspector/Start (View mode, right column) */}
      {mode === 'view' && roomId !== 'design-test' && !(roomId === 'firewall' && mode === 'view') && !(roomId === 'vpn' && mode === 'view') && !(roomId === 'https' && mode === 'view') && (
        <>
          {/* Inspector replaces old Start spot */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('🔎 Inspector button clicked'); onInspectorToggle?.() }}
            aria-label="Open Inspector"
            data-loc="src/components/Header.tsx:inspector-button"
            style={{
              position: 'fixed',
              top: '60px',
              right: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              pointerEvents: 'auto',
              width: '140px',
              height: '40px',
              zIndex: 60,
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#2563eb'
              target.style.transform = 'translateY(-1px)'
              target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#3b82f6'
              target.style.transform = 'translateY(0)'
              target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <Search style={{ width: '16px', height: '16px' }} />
            Inspector
          </button>

          {/* Start moved a little lower */}
          <button
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              if (onStartOverride) {
                onStartOverride();
              } else {
                try { window.dispatchEvent(new CustomEvent('flow-control', { detail: { action: 'start' } })) } catch {}
              }
              ;(e.target as HTMLButtonElement).blur()
            }}
            aria-label="Start Network Flow"
            data-loc="src/components/Header.tsx:start-button"
            style={{
              position: 'fixed',
            top: '108px',
            right: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              pointerEvents: 'auto',
              zIndex: 60,
              width: '140px',
              height: '40px'
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#2563eb'
              target.style.transform = 'translateY(-1px)'
              target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#3b82f6'
              target.style.transform = 'translateY(0)'
              target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <span style={{ width: '16px', height: '16px' }}>▶️</span>
            Start
          </button>

          {/* Terminal Button */}
          <button
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              onTerminalToggle?.();
              console.log('Terminal button clicked');
              ;(e.target as HTMLButtonElement).blur()
            }}
            aria-label="Open Terminal"
            data-loc="src/components/Header.tsx:terminal-button"
            style={{
              position: 'fixed',
              top: '156px',
              right: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              pointerEvents: 'auto',
              zIndex: 60,
              width: '140px',
              height: '40px'
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#2563eb'
              target.style.transform = 'translateY(-1px)'
              target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement
              target.style.backgroundColor = '#3b82f6'
              target.style.transform = 'translateY(0)'
              target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <Terminal style={{ width: '16px', height: '16px' }} />
            Terminal
          </button>

          {/* VPN toggle button (under Terminal) */}
          {isVpnRoom && (
            <button
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                toggleVpnActive();
                console.log('VPN toggle button clicked');
                ;(e.currentTarget as HTMLButtonElement).blur()
              }}
              aria-label={vpnActive ? 'Disable VPN' : 'Enable VPN'}
              data-loc="src/components/Header.tsx:vpn-toggle-button"
              style={{
                position: 'fixed',
                top: '204px',
                right: '16px',
                backgroundColor: vpnActive ? '#c62828' : '#2e7d32',
                color: 'white',
                padding: '10px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: 'Inter, system-ui, sans-serif',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                pointerEvents: 'auto',
                zIndex: 60,
                width: '140px',
                height: '40px'
              }}
              onMouseEnter={(e) => {
                const target = e.currentTarget as HTMLButtonElement
                target.style.backgroundColor = vpnActive ? '#8e0000' : '#1b5e20'
                target.style.transform = 'translateY(-1px)'
                target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={(e) => {
                const target = e.currentTarget as HTMLButtonElement
                target.style.backgroundColor = vpnActive ? '#c62828' : '#2e7d32'
                target.style.transform = 'translateY(0)'
                target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
            >
              {vpnActive ? 'Disable VPN' : 'Enable VPN'}
            </button>
          )}

          {/* HTTPS troubleshooter button (under Terminal) */}
          {isHttpsRoom && (
            <button
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                try { window.dispatchEvent(new CustomEvent('https:troubleshooter:open')) } catch {}
                ;(e.currentTarget as HTMLButtonElement).blur()
              }}
              aria-label="Troubleshoot HTTPS"
              data-loc="src/components/Header.tsx:https-troubleshoot-button"
              style={{
                position: 'fixed',
                top: '204px',
                right: '16px',
                backgroundColor: '#9333ea',
                color: 'white',
                padding: '10px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: 'Inter, system-ui, sans-serif',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                pointerEvents: 'auto',
                zIndex: 60,
                width: '140px',
                height: '40px'
              }}
              onMouseEnter={(e) => {
                const target = e.currentTarget as HTMLButtonElement
                target.style.backgroundColor = '#7e22ce'
                target.style.transform = 'translateY(-1px)'
                target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={(e) => {
                const target = e.currentTarget as HTMLButtonElement
                target.style.backgroundColor = '#9333ea'
                target.style.transform = 'translateY(0)'
                target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
            >
              <span style={{ width: 16, display: 'inline-block', textAlign: 'center' }}>🔧</span>
              Fix HTTPS
            </button>
          )}

          {isFirewallRoom && (
            <>
              {/* Firewall Rules Button */}
              <button
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  if (onFirewallRulesToggle) {
                    onFirewallRulesToggle();
                  } else {
                    try { toggleFirewallRulesPanel() } catch {}
                  }
                  console.log('Firewall Rules button clicked');
                  ;(e.target as HTMLButtonElement).blur()
                }}
                aria-label="Open Firewall Rules"
                data-loc="src/components/Header.tsx:firewall-rules-button"
                style={{
                  position: 'fixed',
                  top: '204px',
                  right: '16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  pointerEvents: 'auto',
                  zIndex: 60,
                  width: '140px',
                  height: '40px'
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#2563eb'
                  target.style.transform = 'translateY(-1px)'
                  target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#3b82f6'
                  target.style.transform = 'translateY(0)'
                  target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                <Shield style={{ width: '14px', height: '14px' }} />
                Firewall Rules
              </button>

              {/* Simulate Attack Button */}
              <button
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  if (onSimulateAttack) {
                    onSimulateAttack();
                  } else {
                    try { window.dispatchEvent(new CustomEvent('firewall:simulate-attack')) } catch {}
                  }
                  console.log('Simulate Attack button clicked');
                  ;(e.target as HTMLButtonElement).blur()
                }}
                aria-label="Simulate Attack"
                data-loc="src/components/Header.tsx:simulate-attack-button"
                style={{
                  position: 'fixed',
                  top: '252px',
                  right: '16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  pointerEvents: 'auto',
                  zIndex: 60,
                  width: '140px',
                  height: '40px'
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#2563eb'
                  target.style.transform = 'translateY(-1px)'
                  target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#3b82f6'
                  target.style.transform = 'translateY(0)'
                  target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                <span style={{ width: '14px', height: '14px' }}>⚔️</span>
                Simulate Attack
              </button>
            </>
          )}

        </>
      )}

      {/* Mission Button (bottom-right) */}
      {roomId !== 'design-test' && !(roomId === 'firewall' && mode === 'view') && !(roomId === 'vpn' && mode === 'view') && !(roomId === 'https' && mode === 'view') && (
      <button
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation();
          try { window.dispatchEvent(new CustomEvent('mission:toggle', { detail: { roomId } })) } catch {}
          console.log('Mission button clicked');
          ;(e.target as HTMLButtonElement).blur()
        }}
        aria-label="Open Mission"
        data-loc="src/components/Header.tsx:mission-button"
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '10px 12px',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500',
          fontFamily: 'Inter, system-ui, sans-serif',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          pointerEvents: 'auto',
          zIndex: 60,
          width: '140px',
          height: '40px'
        }}
        onMouseEnter={(e) => {
          const target = e.target as HTMLButtonElement
          target.style.backgroundColor = '#2563eb'
          target.style.transform = 'translateY(-1px)'
          target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}
        onMouseLeave={(e) => {
          const target = e.target as HTMLButtonElement
          target.style.backgroundColor = '#3b82f6'
          target.style.transform = 'translateY(0)'
          target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}
      >
        <span style={{ width: '14px', height: '14px' }}>🎯</span>
        Mission
      </button>
      )}

      {/* Save Button (Design mode only) */}
      {mode === 'design' && (
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveClick?.() }}
          style={{ 
            position: 'fixed',
            top: '108px',
            right: '16px',
            backgroundColor: '#3b82f6', 
            color: 'white', 
            padding: '10px 16px',
            border: 'none', 
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            pointerEvents: 'auto',
            zIndex: 60,
            width: '140px',
            height: '40px'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#2563eb'
            target.style.transform = 'translateY(-1px)'
            target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#3b82f6'
            target.style.transform = 'translateY(0)'
            target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}
        >
          <span style={{ width: '16px', height: '16px' }}>💾</span>
          Save
        </button>
      )}

      {/* Reset Button (Design mode only) */}
      {mode === 'design' && (
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onResetClick?.() }}
          style={{ 
            position: 'fixed',
            top: '156px',
            right: '16px',
            backgroundColor: '#ef4444',
            color: 'white', 
            padding: '10px 16px',
            border: 'none', 
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            pointerEvents: 'auto',
            zIndex: 60,
            width: '140px',
            height: '40px'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#dc2626'
            target.style.transform = 'translateY(-1px)'
            target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#ef4444'
            target.style.transform = 'translateY(0)'
            target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}
        >
          <span style={{ width: '16px', height: '16px' }}>♻️</span>
          Reset
        </button>
      )}

      {/* Delete Button (Design mode only) */}
      {mode === 'design' && (
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteClick?.() }}
          style={{ 
            position: 'fixed',
            top: '204px',
            right: '16px',
            backgroundColor: '#3b82f6',
            color: 'white', 
            padding: '10px 16px',
            border: 'none', 
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            pointerEvents: 'auto',
            zIndex: 60,
            width: '140px',
            height: '40px'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#2563eb'
            target.style.transform = 'translateY(-1px)'
            target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLButtonElement
            target.style.backgroundColor = '#3b82f6'
            target.style.transform = 'translateY(0)'
            target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}
        >
          <span style={{ width: '16px', height: '16px' }}>🗑️</span>
          Delete
        </button>
      )}
    </header>
  )
}

export default Header
