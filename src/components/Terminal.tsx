'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Command, EmitPacketsEffect, UpdateMetadataEffect, StartPhaseEffect, OpenInfoBoardEffect } from '@/types/terminal'
import type { RoomObject } from '@/utils/glb-loader'
import {
  loadCommands,
  loadCommandsForRoom,
  parseCommand,
  executeCommand,
  getCommandSuggestions,
  getFullHelp,
  getErrorMessage
} from '@/utils/commandExecutor'

interface TerminalProps {
  onEmitPackets?: (effect: EmitPacketsEffect) => void
  onUpdateMetadata?: (effect: UpdateMetadataEffect) => void
  onStartPhase?: (effect: StartPhaseEffect) => void
  onOpenInfoBoard?: (effect: OpenInfoBoardEffect) => void
  visible?: boolean
  onClose?: () => void
  cliWhitelist?: string[]  // Optional list of allowed command IDs
  // When provided, overrides the default commands loading.
  commandsOverride?: Command[]
  // Optional room context for room-specific commands + cheat sheet.
  roomId?: string
  roomObjects?: RoomObject[]
}

interface OutputLine {
  text: string
  type: 'command' | 'output' | 'error'
  timestamp: number
}

export default function Terminal({
  onEmitPackets,
  onUpdateMetadata,
  onStartPhase,
  onOpenInfoBoard,
  visible = true,
  onClose,
  cliWhitelist,
  commandsOverride,
  roomId,
  roomObjects,
}: TerminalProps) {
  const [commands, setCommands] = useState<Command[]>([])
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<OutputLine[]>([
    { text: 'LAN Desktop Terminal v1.0', type: 'output', timestamp: Date.now() },
    { text: 'Type "help" for available commands', type: 'output', timestamp: Date.now() }
  ])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<Command[]>([])
  const [executing, setExecuting] = useState(false)
  const [cheatSheetOpen, setCheatSheetOpen] = useState(true)
  const roomScoped = Array.isArray(commandsOverride) && commandsOverride.length > 0
  const isFirewallRoom = roomId === 'firewall'
  const isVpnRoom = roomId === 'vpn'
  const isHttpsRoom = roomId === 'https'
  const [windowState, setWindowState] = useState<'normal' | 'minimized' | 'maximized'>('normal')

  const metaById = useMemo(() => {
    const map: Record<string, any> = {}
    for (const o of (roomObjects || [])) {
      map[o.id] = o?.metadata || {}
    }
    return map
  }, [roomObjects])

  const stripCidr = useCallback((v: any) => {
    return (typeof v === 'string') ? v.split('/')[0] : ''
  }, [])

  const fwTop = useMemo(() => {
    if (!isFirewallRoom) return null

    const lanDesktop = (metaById['desktop1']?.net || {}) as any
    const lanSwitch = (metaById['switch1']?.net || {}) as any
    const lanRouter = (metaById['router1']?.net || {}) as any
    const fw = (metaById['firewall1']?.net || {}) as any
    const web = (metaById['dns1']?.net || {}) as any
    const attacker = (metaById['desktop2']?.net || {}) as any

    const routerLan = Array.isArray(lanRouter.interfaces)
      ? (lanRouter.interfaces.find((i: any) => String(i?.name || '').toLowerCase() === 'lan')?.ip)
      : null
    const routerToFw = Array.isArray(lanRouter.interfaces)
      ? (lanRouter.interfaces.find((i: any) => String(i?.name || '').toLowerCase().includes('firewall'))?.ip)
      : null

    return {
      lanDesktopIp: stripCidr(lanDesktop.ip) || '192.168.10.30',
      lanSwitchMgmtIp: stripCidr(lanSwitch.mgmtIp) || '192.168.10.2',
      routerLanIp: stripCidr(routerLan) || '192.168.10.1',
      routerToFirewallIp: stripCidr(routerToFw) || '10.0.0.2',
      firewallInsideIp: stripCidr(fw.insideIp) || '10.0.0.1',
      firewallOutsideIp: stripCidr(fw.outsideIp) || '203.0.113.1',
      webServerIp: stripCidr(web.ip) || '198.51.100.10',
      attackerIp: stripCidr(attacker.ip) || '198.51.100.66',
    }
  }, [isFirewallRoom, metaById, stripCidr])

  const vpnTop = useMemo(() => {
    if (!isVpnRoom) return null

    const desktopNet = (metaById['desktop1']?.net || {}) as any
    const fwNet = (metaById['firewall1']?.net || {}) as any
    const routerNet = (metaById['router1']?.net || {}) as any
    const switchNet = (metaById['switch1']?.net || {}) as any
    const webNet = (metaById['web1']?.net || {}) as any

    const getIfaceIp = (net: any, pred: (i: any) => boolean) => {
      const ifaces = Array.isArray(net?.interfaces) ? net.interfaces : []
      const m = ifaces.find((i: any) => {
        try { return !!pred(i) } catch { return false }
      })
      return stripCidr(m?.ip)
    }

    const remoteWanIp =
      getIfaceIp(desktopNet, (i) => String(i?.kind || '').toLowerCase() === 'wan' || String(i?.name || '').toLowerCase() === 'wlan0') ||
      stripCidr(desktopNet.ip) ||
      '203.0.113.25'

    const firewallWanIp =
      stripCidr(fwNet.outsideIp) ||
      getIfaceIp(fwNet, (i) => String(i?.type || '').toUpperCase() === 'WAN' || String(i?.name || '').toLowerCase().includes('outside')) ||
      '203.0.113.1'

    const routerLanIp =
      getIfaceIp(routerNet, (i) => String(i?.name || '').toUpperCase() === 'LAN' || String(i?.type || '').toUpperCase() === 'LAN') ||
      stripCidr(routerNet.ip) ||
      '192.168.10.1'

    const switchMgmtIp = stripCidr(switchNet.mgmtIp) || stripCidr(switchNet.ip) || '192.168.10.2'

    const lanServerIp = stripCidr(webNet.ip) || '192.168.10.50'

    return {
      remoteWanIp,
      vpnAssignedIp: '10.8.0.25',
      firewallWanIp,
      routerLanIp,
      switchMgmtIp,
      lanServerIp,
      lanSubnet: '192.168.10.0/24',
    }
  }, [isVpnRoom, metaById, stripCidr])
  
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

// Load commands on mount or when overrides/whitelist change
useEffect(() => {
  const apply = (cmds: Command[]) => {
    const filtered = cliWhitelist && cliWhitelist.length > 0
      ? cmds.filter(cmd => cliWhitelist.includes(cmd.id))
      : cmds
    setCommands(filtered)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Terminal] Loaded ${filtered.length} commands` + (cliWhitelist ? ` (filtered from ${cmds.length})` : ''))
      if (cliWhitelist && cliWhitelist.length > 0) console.log(`[Terminal] Whitelist:`, cliWhitelist)
    }
  }
  if (commandsOverride && commandsOverride.length > 0) {
    apply(commandsOverride)
    return
  }
  if (roomId) {
    loadCommandsForRoom(roomId).then(apply)
    return
  }
  loadCommands().then(apply)
}, [cliWhitelist, commandsOverride, roomId])

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [visible])

  const addOutput = useCallback((text: string, type: OutputLine['type'] = 'output') => {
    setOutput(prev => [...prev, { text, type, timestamp: Date.now() }])
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInput(value)
    
    // Update suggestions
    if (value.trim()) {
      const sugg = getCommandSuggestions(value, commands)
      setSuggestions(sugg.slice(0, 5))
    } else {
      setSuggestions([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmed = input.trim()
    if (!trimmed || executing) return

    // Add command to output
    addOutput(`$ ${trimmed}`, 'command')
    
    // Add to history
    setHistory(prev => [...prev, trimmed])
    setHistoryIndex(-1)
    
    // Clear input
    setInput('')
    setSuggestions([])

    // Handle built-in commands
    if (trimmed === 'help') {
      addOutput(getFullHelp(commands))
      return
    }

    if (trimmed === 'clear') {
      setOutput([])
      return
    }

    // VPN room: built-in toolbox behavior (Remote User perspective)
    if (isVpnRoom) {
      const tokenize = (s: string) => (s.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []).map(t => t.replace(/^\"(.*)\"$/, '$1'))
      const tokens = tokenize(trimmed)
      const cmd = String(tokens[0] || '')

      const vpnActiveNow = (() => {
        try { return !!(window as any).__VPN_ACTIVE__ } catch { return false }
      })()

      const remoteWanIp = vpnTop?.remoteWanIp || '203.0.113.25'
      const vpnIp = vpnTop?.vpnAssignedIp || '10.8.0.25'
      const firewallWanIp = vpnTop?.firewallWanIp || '203.0.113.1'
      const routerLanIp = vpnTop?.routerLanIp || '192.168.10.1'
      const switchMgmtIp = vpnTop?.switchMgmtIp || '192.168.10.2'
      const lanServerIp = vpnTop?.lanServerIp || '192.168.10.50'
      const lanSubnet = vpnTop?.lanSubnet || '192.168.10.0/24'

      const isLanIp = (h: string) => /^192\.168\./.test(h)

      const setVpnActive = (next: boolean, source: string) => {
        try { (window as any).__VPN_ACTIVE__ = next } catch {}
        try { window.dispatchEvent(new CustomEvent('vpn:active', { detail: { active: next, source } })) } catch {}
      }

      if (cmd === 'vpn') {
        const sub = String(tokens[1] || '').toLowerCase()
        if (sub === 'on') {
          setVpnActive(true, 'terminal')
          addOutput(`VPN: ENABLED\nTunnel: established to firewall ${firewallWanIp}\nClient IP: ${vpnIp}`)
          return
        }
        if (sub === 'off') {
          setVpnActive(false, 'terminal')
          addOutput(`VPN: DISABLED\nTraffic crosses the public Internet without a tunnel.`)
          return
        }

        addOutput(
          `Remote User WAN IP: ${remoteWanIp}\n` +
          `VPN: ${vpnActiveNow ? 'ON' : 'OFF'}\n` +
          (vpnActiveNow
            ? `VPN Client IP: ${vpnIp}\nProtected resource: https://${lanServerIp} (LAN Web Server)\nTip: vpn off`
            : `Access to LAN is blocked without VPN.\nTip: vpn on`
          )
        )
        return
      }

      if (cmd === 'whoami') {
        addOutput(
          `Remote User (WAN)\n` +
          `wan0: ${remoteWanIp}\n` +
          (vpnActiveNow ? `tun0: ${vpnIp}` : `tun0: (disconnected)`)
        )
        return
      }

      if (cmd === 'topology') {
        addOutput(
          `VPN Room Topology\n\n` +
          `WAN\n  Remote User: ${remoteWanIp}\n  Firewall (public): ${firewallWanIp}\n\n` +
          `VPN\n  Client IP (assigned): ${vpnIp}\n\n` +
          `LAN (${lanSubnet})\n  Router (gateway): ${routerLanIp}\n  Switch (mgmt): ${switchMgmtIp}\n  Web Server: ${lanServerIp} (HTTPS/443)\n\n` +
          `Tip: vpn on  → then try: curl https://${lanServerIp}`
        )
        return
      }

      if (cmd === 'ip' || cmd === 'ifconfig') {
        addOutput(
          `${cmd} (simulated)\n\n` +
          `wan0: inet ${remoteWanIp}  netmask 255.255.255.0\n` +
          (vpnActiveNow ? `tun0: inet ${vpnIp}  netmask 255.255.255.0\n` : '') +
          `lo0:  inet 127.0.0.1  netmask 255.0.0.0`
        )
        return
      }

      if (cmd === 'route') {
        addOutput(
          vpnActiveNow
            ? `Routing table (simulated)\n\n` +
              `default            tun0\n` +
              `${lanSubnet}        tun0\n` +
              `${firewallWanIp}    wan0\n`
            : `Routing table (simulated)\n\n` +
              `default            wan0\n` +
              `# No route to ${lanSubnet} (VPN is OFF)\n`
        )
        return
      }

      if (cmd === 'ping') {
        const host = String(tokens[1] || '')
        if (!host) {
          addOutput('Usage: ping <host>', 'error')
          return
        }

        if (isLanIp(host) && !vpnActiveNow) {
          addOutput(
            `PING ${host} (${host}): 56 data bytes\n\n--- ${host} ping statistics ---\n4 packets transmitted, 0 packets received, 100.0% packet loss\n\n# Hint: enable VPN first (vpn on)`
          )
          return
        }

        addOutput(
          `PING ${host} (${host}): 56 data bytes\n` +
          `64 bytes from ${host}: icmp_seq=0 ttl=58 time=12.1 ms\n` +
          `64 bytes from ${host}: icmp_seq=1 ttl=58 time=12.6 ms\n\n` +
          `--- ${host} ping statistics ---\n` +
          `2 packets transmitted, 2 packets received, 0.0% packet loss\n` +
          `round-trip min/avg/max/stddev = 12.1/12.4/12.6/0.2 ms`
        )
        return
      }

      if (cmd === 'traceroute') {
        const host = String(tokens[1] || '')
        if (!host) {
          addOutput('Usage: traceroute <host>', 'error')
          return
        }

        if (isLanIp(host) && !vpnActiveNow) {
          addOutput(
            `traceroute to ${host} (${host}), 30 hops max, 60 byte packets\n` +
            ` 1  ${firewallWanIp}  3.012 ms  2.944 ms  2.901 ms\n` +
            ` 2  * * *\n` +
            ` 3  * * *\n\n` +
            `# Blocked: WAN → LAN requires VPN. Try: vpn on`
          )
          return
        }

        if (isLanIp(host) && vpnActiveNow) {
          addOutput(
            `traceroute to ${host} (${host}), 30 hops max, 60 byte packets\n` +
            ` 1  ${firewallWanIp}  3.012 ms  2.944 ms  2.901 ms\n` +
            ` 2  ${routerLanIp}    4.210 ms  4.101 ms  4.088 ms\n` +
            ` 3  ${host}           5.980 ms  5.876 ms  6.012 ms`
          )
          return
        }

        addOutput(
          `traceroute to ${host} (${host}), 30 hops max, 60 byte packets\n` +
          ` 1  ${firewallWanIp}  3.012 ms  2.944 ms  2.901 ms\n` +
          ` 2  ${host}           14.234 ms  14.001 ms  14.456 ms`
        )
        return
      }

      if (cmd === 'nc' || cmd === 'telnet') {
        const host = String(tokens[1] || '')
        const port = Number.parseInt(String(tokens[2] || ''), 10)
        if (!host || !Number.isFinite(port)) {
          addOutput(`Usage: ${cmd} <host> <port>`, 'error')
          return
        }

        if (isLanIp(host) && !vpnActiveNow) {
          addOutput(
            `${cmd}: connect to ${host} port ${port} failed: Operation timed out\n` +
            `# Hint: enable VPN first (vpn on)`
          )
          return
        }

        if (cmd === 'nc') {
          addOutput(`Connection to ${host} ${port} port [tcp/*] succeeded!`)
        } else {
          addOutput(`Trying ${host}:${port}...\nConnected to ${host}.\nEscape character is '^]'.`)
        }
        return
      }

      if (cmd === 'openssl_connect') {
        const host = String(tokens[1] || '')
        if (!host) {
          addOutput('Usage: openssl_connect <host>', 'error')
          return
        }

        if (isLanIp(host) && !vpnActiveNow) {
          addOutput(
            `CONNECTED(00000003)\n` +
            `connect:errno=60\n\n` +
            `# TLS handshake to ${host}:443 failed (VPN is OFF). Try: vpn on`
          )
          return
        }

        addOutput(
          `CONNECTED(00000003)\n` +
          `depth=1 C = US, O = Example CA, CN = Example Root\n` +
          `verify return:1\n` +
          `---\nClientHello sent...\nServerHello received...\nCertificate chain verified.\n---\n` +
          `New, TLSv1.3, Cipher is TLS_AES_128_GCM_SHA256\n` +
          `Verify return code: 0 (ok)`
        )
        return
      }

      if (cmd === 'curl') {
        const urlRaw = String(tokens[1] || '')
        if (!urlRaw) {
          addOutput('Usage: curl <url>', 'error')
          return
        }

        let host = ''
        let port = 443
        try {
          const u = new URL(urlRaw)
          host = u.hostname
          port = u.port ? Number.parseInt(u.port, 10) : (u.protocol === 'http:' ? 80 : 443)
        } catch {
          // Allow bare host/IP
          host = urlRaw
        }

        if (isLanIp(host) && !vpnActiveNow) {
          addOutput(
            `curl: (7) Failed to connect to ${host} port ${port}: Connection timed out\n` +
            `# Blocked: WAN → LAN requires VPN. Try: vpn on`
          )
          return
        }

        addOutput(
          `HTTP/1.1 200 OK\n` +
          `server: internal-web\n` +
          `content-type: text/html; charset=UTF-8\n\n` +
          `<html><body><h1>VPN Room Internal Web Server</h1></body></html>`
        )
        return
      }
    }

    // HTTPS room: simulate broken HTTPS (used by the Troubleshooter panel).
    // - curl http://... -> DNS phase (plaintext HTTP)
    // - curl https://... -> PKI phase while broken (handshake fails), HTTPS phase when fixed
    // - openssl_connect web-server -> PKI phase + stage-specific evidence
    // - date -> stage-specific clock (used for "time invalid")
    if (isHttpsRoom) {
      const tokenize = (s: string) => (s.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []).map(t => t.replace(/^\"(.*)\"$/, '$1'))
      const tokens = tokenize(trimmed)
      const cmd = String(tokens[0] || '')

      const trouble = (() => {
        try { return (window as any).__HTTPS_TROUBLESHOOT__ } catch { return null }
      })() as any

      const stage = String(trouble?.stage || 'hostname')
      const ok = !!trouble?.ok

      const serverHost = 'web-server'
      const serverIp = '198.51.100.10'

      const formatUtcDate = (d: Date) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const dd = days[d.getUTCDay()]
        const mm = months[d.getUTCMonth()]
        const day = String(d.getUTCDate()).padStart(2, '0')
        const hh = String(d.getUTCHours()).padStart(2, '0')
        const mi = String(d.getUTCMinutes()).padStart(2, '0')
        const ss = String(d.getUTCSeconds()).padStart(2, '0')
        const yyyy = d.getUTCFullYear()
        return `${dd} ${mm} ${day} ${hh}:${mi}:${ss} UTC ${yyyy}`
      }

      const simulatedNow = (() => {
        // Only surface the bad clock once earlier issues are fixed enough to reach that error.
        if (stage === 'time') return new Date('2010-01-01T00:00:00Z')
        return new Date()
      })()

      if (cmd === 'date') {
        addOutput(`${formatUtcDate(simulatedNow)} (simulated)`)
        return
      }

      if (cmd === 'openssl_connect') {
        const host = String(tokens[1] || '')
        if (!host) {
          addOutput('Usage: openssl_connect <host>', 'error')
          return
        }

        // Always show the TLS handshake phase visuals for openssl_connect.
        try { onStartPhase?.({ type: 'startPhase', phase: 'PKI' } as any) } catch {}

        const isServer = host === serverHost || host === serverIp
        if (!isServer) {
          addOutput(
            `CONNECTED(00000003)\n` +
            `# This room simulates TLS issues only for ${serverHost}.\n` +
            `# Try: openssl_connect ${serverHost}`
          )
          return
        }

        const out =
          ok || stage === 'ok'
            ? (
              `CONNECTED(00000003)\n` +
              `depth=1 CN = Example Training CA\n` +
              `verify return:1\n` +
              `depth=0 CN = ${serverHost}\n` +
              `verify return:1\n` +
              `---\n` +
              `Certificate chain\n 0 s:CN=${serverHost}\n   i:CN=Example Training CA\n` +
              `---\n` +
              `New, TLSv1.3, Cipher is TLS_AES_128_GCM_SHA256\n` +
              `Verify return code: 0 (ok)`
            )
            : stage === 'hostname'
              ? (
                `CONNECTED(00000003)\n` +
                `depth=1 CN = Example Training CA\n` +
                `verify return:1\n` +
                `depth=0 CN = old-web-server\n` +
                `verify return:1\n` +
                `---\n` +
                `Certificate chain\n 0 s:CN=old-web-server\n   i:CN=Example Training CA\n` +
                `---\n` +
                `New, TLSv1.3, Cipher is TLS_AES_128_GCM_SHA256\n` +
                `Verify return code: 62 (Hostname mismatch)\n` +
                `# Hint: the server certificate must be issued to ${serverHost}`
              )
              : stage === 'ca'
                ? (
                  `CONNECTED(00000003)\n` +
                  `depth=0 CN = ${serverHost}\n` +
                  `verify error:num=20:unable to get local issuer certificate\n` +
                  `verify return:1\n` +
                  `---\n` +
                  `Certificate chain\n 0 s:CN=${serverHost}\n   i:CN=Example Training CA\n` +
                  `---\n` +
                  `Verify return code: 20 (unable to get local issuer certificate)\n` +
                  `# Hint: trust the issuing CA (Example Training CA)`
                )
                : stage === 'time'
                  ? (
                    `CONNECTED(00000003)\n` +
                    `depth=1 CN = Example Training CA\n` +
                    `verify return:1\n` +
                    `depth=0 CN = ${serverHost}\n` +
                    `verify error:num=9:certificate is not yet valid\n` +
                    `verify return:1\n` +
                    `---\n` +
                    `notBefore=Jan  1 00:00:00 2025 GMT\n` +
                    `notAfter =Jan  1 00:00:00 2030 GMT\n` +
                    `currentTime=${formatUtcDate(simulatedNow)}\n` +
                    `Verify return code: 9 (certificate is not yet valid)\n` +
                    `# Hint: sync system time (NTP)`
                  )
                  : (
                    `CONNECTED(00000003)\n` +
                    `---\n` +
                    `ClientHello sent...\n` +
                    `140735000000000:error:0A00042E:SSL routines:ssl3_read_bytes:tlsv1 alert protocol version\n` +
                    `---\n` +
                    `No peer certificate available\n` +
                    `---\n` +
                    `New, (NONE), Cipher is (NONE)\n` +
                    `Verify return code: 0 (ok)\n` +
                    `# Hint: enable TLS 1.3 support on the client`
                  )

        addOutput(out)
        return
      }

      if (cmd === 'curl') {
        const urlRaw = String(tokens[1] || '')
        if (!urlRaw) {
          addOutput('Usage: curl <url>', 'error')
          return
        }

        // Parse URL (curl defaults to http:// when scheme is omitted)
        let u: URL | null = null
        try {
          u = new URL(urlRaw)
        } catch {
          try { u = new URL(`http://${urlRaw}`) } catch { u = null }
        }

        const protocol = String(u?.protocol || 'http:')
        const host = String(u?.hostname || '')
        const path = String((u?.pathname || '/') + (u?.search || ''))
        const isServer = host === serverHost || host === serverIp

        if (!isServer) {
          // Fall back to command catalog behavior for non-scenario hosts.
        } else if (protocol === 'http:') {
          try { onStartPhase?.({ type: 'startPhase', phase: 'DNS' } as any) } catch {}
          addOutput(
            `GET ${path} HTTP/1.1\n` +
            `Host: ${host}\n\n` +
            `HTTP/1.1 200 OK\n` +
            `server: ${serverHost}\n` +
            `content-type: text/html; charset=UTF-8\n\n` +
            `<html><body><h1>Plaintext HTTP</h1><p>Attacker can read this.</p></body></html>`
          )
          return
        } else if (protocol === 'https:') {
          // While broken, we only show the handshake attempt (PKI). Once fixed, allow HTTPS phase.
          const nextPhase: any = (ok || stage === 'ok') ? 'HTTPS' : 'PKI'
          try { onStartPhase?.({ type: 'startPhase', phase: nextPhase } as any) } catch {}

          const err =
            ok || stage === 'ok'
              ? null
              : stage === 'hostname'
                ? `curl: (60) SSL: certificate subject name 'old-web-server' does not match target host name '${serverHost}'\n# Hint: the certificate must be issued to ${serverHost}`
                : stage === 'ca'
                  ? `curl: (60) SSL certificate problem: unable to get local issuer certificate\n# Hint: trust the issuing CA (Example Training CA)`
                  : stage === 'time'
                    ? `curl: (60) SSL certificate problem: certificate is not yet valid\n# Hint: check your system clock (NTP)`
                    : `curl: (35) TLS handshake failed: protocol_version\n# Hint: enable TLS 1.3 support on the client`

          if (err) {
            addOutput(err, 'error')
            return
          }

          addOutput(
            `HTTP/2 200\n` +
            `server: ${serverHost}\n` +
            `content-type: text/html; charset=UTF-8\n\n` +
            `<html><body><h1>HTTPS OK</h1><p>Application data is encrypted.</p></body></html>`
          )
          return
        }
      }
    }

    // Parse and execute command
    const parsed = parseCommand(trimmed, commands)
    
    if (!parsed) {
      const errorInfo = getErrorMessage(trimmed, commands)
      addOutput(errorInfo.message, 'error')
      if (errorInfo.suggestion) {
        addOutput(errorInfo.suggestion, 'output')
      }
      return
    }

    // Validate required args (commands.json uses positional args)
    const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    const providedArgs = Math.max(0, tokens.length - 1)
    const requiredArgs = parsed.command.args.length
    if (providedArgs < requiredArgs) {
      const errorInfo = getErrorMessage(trimmed, commands)
      addOutput(errorInfo.message, 'error')
      if (errorInfo.suggestion) addOutput(errorInfo.suggestion, 'output')
      return
    }

    // Emit a global event (used for room UX like missions/checklists)
    try {
      window.dispatchEvent(new CustomEvent('terminal:command-executed', {
        detail: {
          roomId,
          commandId: parsed.command.id,
          args: parsed.args,
          raw: parsed.raw,
        }
      }))
    } catch {}

    // Execute command
    setExecuting(true)

    try {
      await executeCommand(parsed, {
        onConsoleOutput: (text) => addOutput(text, 'output'),
        onEmitPackets,
        onUpdateMetadata,
        onStartPhase,
        onOpenInfoBoard
      })
    } catch (error) {
      addOutput(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // History navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1
        if (newIndex >= history.length) {
          setHistoryIndex(-1)
          setInput('')
        } else {
          setHistoryIndex(newIndex)
          setInput(history[newIndex])
        }
      }
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault()
      setInput(suggestions[0].id)
      setSuggestions([])
    }
  }

  const handleExampleClick = useCallback((command: string) => {
    setInput(command)
    inputRef.current?.focus()
  }, [])

  const handleCopyOutput = useCallback(() => {
    const outputText = output
      .map(line => line.text)
      .join('\n')
    
    navigator.clipboard.writeText(outputText).then(() => {
      // Show brief feedback
      const originalOutput = [...output]
      addOutput('✓ Output copied to clipboard', 'output')
      setTimeout(() => {
        setOutput(originalOutput)
      }, 2000)
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }, [output, addOutput])

  // Get input validation state
  const getInputValidation = useCallback((): 'valid' | 'incomplete' | 'invalid' | 'empty' => {
    const trimmed = input.trim()
    if (!trimmed) return 'empty'

    const tokens = trimmed.split(/\s+/)
    const commandName = tokens[0]
    const command = commands.find(cmd => cmd.id === commandName)

    if (!command) {
      return 'invalid'
    }

    const providedArgs = tokens.length - 1
    const requiredArgs = command.args.length

    if (providedArgs < requiredArgs) {
      return 'incomplete'
    }

    return 'valid'
  }, [input, commands])

  const inputValidation = getInputValidation()

  if (!visible) return null

  // Calculate dimensions based on window state
  const getTerminalDimensions = () => {
    if (windowState === 'minimized') {
      return { width: cheatSheetOpen ? 900 : 600, height: 44 } // Just header
    }
    if (windowState === 'maximized') {
      return { width: cheatSheetOpen ? 1200 : 800, height: 600 }
    }
    return { width: cheatSheetOpen ? 900 : 600, height: 400 } // normal
  }

  const dimensions = getTerminalDimensions()

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: dimensions.width,
      height: dimensions.height,
      backgroundColor: '#1a1b26',
      border: '1px solid #414868',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      fontSize: 13,
      color: '#c0caf5',
      zIndex: 1000,
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      transition: 'width 0.3s ease, height 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#24283b',
        borderBottom: '1px solid #414868',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* macOS-style window controls */}
          <button
            onClick={onClose}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#f7768e',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            title="Close terminal"
          />
          <button
            onClick={() => setWindowState(windowState === 'minimized' ? 'normal' : 'minimized')}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#e0af68',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            title={windowState === 'minimized' ? 'Restore terminal' : 'Minimize terminal'}
          />
          <button
            onClick={() => setWindowState(windowState === 'maximized' ? 'normal' : 'maximized')}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#9ece6a',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            title={windowState === 'maximized' ? 'Restore terminal' : 'Maximize terminal'}
          />
        </div>
        <span style={{ fontSize: 16.5, color: '#565f89', fontWeight: 500 }}>LAN Desktop Terminal</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setCheatSheetOpen(!cheatSheetOpen)}
            style={{
              background: 'none',
              border: '1px solid #414868',
              borderRadius: 4,
              color: cheatSheetOpen ? '#7aa2f7' : '#565f89',
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px 8px',
              transition: 'all 0.2s',
            }}
            title="Toggle command reference"
          >
            📋 Commands
          </button>
        </div>
      </div>

      {/* Main content area - hide when minimized */}
      {windowState !== 'minimized' && (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Console area */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minWidth: 0,
        }}>
          {/* Output area with copy button */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {output.length > 0 && (
              <button
                onClick={handleCopyOutput}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(36, 40, 59, 0.9)',
                  border: '1px solid #414868',
                  borderRadius: 4,
                  color: '#7aa2f7',
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '4px 8px',
                  zIndex: 10,
                  transition: 'all 0.2s',
                  pointerEvents: 'auto',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(122, 162, 247, 0.2)'
                  e.currentTarget.style.borderColor = '#7aa2f7'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(36, 40, 59, 0.9)'
                  e.currentTarget.style.borderColor = '#414868'
                }}
                title="Copy all output to clipboard"
              >
                📋 Copy
              </button>
            )}
            <div 
              ref={outputRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '12px 12px 12px 12px',
                paddingRight: output.length > 0 ? '70px' : '12px',
                lineHeight: 1.6,
                minHeight: 0,
              }}
            >
        {output.map((line, i) => (
          <div 
            key={`${line.timestamp}-${i}`}
            style={{
              color: line.type === 'command' ? '#7aa2f7' : 
                     line.type === 'error' ? '#f7768e' : '#c0caf5',
              marginBottom: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {line.text}
          </div>
        ))}
        {executing && (
          <div style={{ color: '#565f89', marginTop: 8 }}>
            Executing...
          </div>
        )}
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div style={{
              padding: '6px 12px',
              backgroundColor: '#1f2335',
              borderTop: '1px solid #414868',
              fontSize: 11,
              color: '#565f89',
            }}>
              <div style={{ marginBottom: 4 }}>Suggestions (press Tab):</div>
              {suggestions.map(cmd => (
                <div key={cmd.id} style={{ color: '#7aa2f7', marginLeft: 8 }}>
                  {cmd.usage} - {cmd.help}
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} style={{
            padding: '8px 12px',
            backgroundColor: '#1f2335',
            borderTop: '1px solid #414868',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ color: '#7aa2f7' }}>$</span>
            <div style={{ 
              flex: 1, 
              display: 'flex',
              border: '1px solid',
              borderColor: 
                inputValidation === 'valid' ? '#9ece6a' :
                inputValidation === 'incomplete' ? '#e0af68' :
                inputValidation === 'invalid' ? '#f7768e' :
                'transparent',
              borderRadius: 4,
              padding: '2px 8px',
              transition: 'border-color 0.2s ease',
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={executing}
                placeholder="Type a command..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#c0caf5',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              />
            </div>
          </form>
        </div>

        {/* Cheat Sheet Panel */}
        {cheatSheetOpen && (
          <div style={{
            width: 300,
            borderLeft: '1px solid #414868',
            backgroundColor: '#1f2335',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: 12,
              minHeight: 0,
            }}>
              {/* Available Commands */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#c0caf5',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>Available Commands ({commands.length})</h3>
                {commands.map(cmd => (
                  <div
                    key={cmd.id}
                    onClick={() => handleExampleClick(cmd.id)}
                    style={{
                      background: '#24283b',
                      border: '1px solid #414868',
                      borderRadius: 6,
                      padding: 8,
                      marginBottom: 6,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#7aa2f7'
                      e.currentTarget.style.transform = 'translateX(2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#414868'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}
                  >
                    <div style={{
                      fontFamily: 'Monaco, monospace',
                      fontSize: 11,
                      color: '#7aa2f7',
                      fontWeight: 600,
                      marginBottom: 2,
                    }}>{cmd.id}</div>
                    <div style={{
                      fontSize: 10,
                      color: '#9aa5ce',
                      lineHeight: 1.3,
                    }}>{cmd.help}</div>
                  </div>
                ))}
              </div>

              {/* Firewall Room: Topology */}
              {isFirewallRoom && fwTop && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>🌐 Firewall Topology</h3>
                  <div style={{
                    background: '#24283b',
                    border: '1px solid #414868',
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>LAN</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>desktop1 (LAN desktop)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.lanDesktopIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>switch1 (mgmt)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.lanSwitchMgmtIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>router1 (gateway)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.routerLanIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>firewall1 (inside)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.firewallInsideIp}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>WAN</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>router1 → firewall link</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.routerToFirewallIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>firewall1 (outside)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.firewallOutsideIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>dns1 (web server)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.webServerIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>desktop2 (attacker)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{fwTop.attackerIp}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Network Topology (hide for room-scoped to avoid mismatched hard-coded data) */}
              {!isFirewallRoom && !roomScoped && !isVpnRoom && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>🌐 Network Topology</h3>
                  <div style={{
                    background: '#24283b',
                    border: '1px solid #414868',
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>Local Network (LAN)</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>desktop1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#73daca',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleExampleClick('ping 192.168.10.30')}
                          title="Click to use in command"
                          >192.168.10.30</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>switch1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#73daca',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleExampleClick('ping 192.168.10.1')}
                          title="Click to use in command"
                          >192.168.10.1</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>router1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#73daca',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleExampleClick('ping 192.168.10.1')}
                          title="Click to use in command"
                          >192.168.10.1</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>firewall1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#73daca',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleExampleClick('ping 203.0.113.1')}
                          title="Click to use in command"
                          >203.0.113.1</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>External Services</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>dns1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#73daca',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleExampleClick('ping 8.8.8.8')}
                          title="Click to use in command"
                          >8.8.8.8</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>web1</span>
                          <span style={{
                            fontFamily: 'Monaco, monospace',
                            color: '#565f89',
                            fontSize: 10,
                          }}>Dynamic</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VPN Room: Topology */}
              {isVpnRoom && vpnTop && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>🌐 VPN Topology</h3>
                  <div style={{
                    background: '#24283b',
                    border: '1px solid #414868',
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>WAN</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>Remote User</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.remoteWanIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>Firewall (public)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.firewallWanIp}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>VPN</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>Client IP</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.vpnAssignedIp}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{
                        color: '#7aa2f7',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}>LAN</div>
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>Router (gateway)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.routerLanIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#9aa5ce' }}>Switch (mgmt)</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.switchMgmtIp}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9aa5ce' }}>Web Server</span>
                          <span style={{ fontFamily: 'Monaco, monospace', color: '#73daca' }}>{vpnTop.lanServerIp}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VPN Room: Quick Examples (full runnable commands) */}
              {isVpnRoom && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>Quick Examples</h3>
                  {[
                    { label: 'VPN status', cmd: 'vpn' },
                    { label: 'Enable VPN', cmd: 'vpn on' },
                    { label: 'Show identity', cmd: 'whoami' },
                    { label: 'Show topology', cmd: 'topology' },
                    { label: 'Show interfaces', cmd: 'ip' },
                    { label: 'Show routes', cmd: 'route' },
                    { label: 'Ping firewall (WAN)', cmd: `ping ${vpnTop?.firewallWanIp || '203.0.113.1'}` },
                    { label: 'Trace to LAN web server', cmd: `traceroute ${vpnTop?.lanServerIp || '192.168.10.50'}` },
                    { label: 'Check HTTPS port (requires VPN)', cmd: `nc ${vpnTop?.lanServerIp || '192.168.10.50'} 443` },
                    { label: 'TLS handshake (requires VPN)', cmd: `openssl_connect ${vpnTop?.lanServerIp || '192.168.10.50'}` },
                    { label: 'HTTP request (requires VPN)', cmd: `curl https://${vpnTop?.lanServerIp || '192.168.10.50'}` },
                  ].map(ex => (
                    <div
                      key={ex.cmd}
                      onClick={() => handleExampleClick(ex.cmd)}
                      style={{
                        padding: '8px 10px',
                        background: '#24283b',
                        border: '1px solid #414868',
                        borderRadius: 6,
                        marginBottom: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(122, 162, 247, 0.1)'
                        e.currentTarget.style.borderColor = '#7aa2f7'
                        e.currentTarget.style.transform = 'translateX(4px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#24283b'
                        e.currentTarget.style.borderColor = '#414868'
                        e.currentTarget.style.transform = 'translateX(0)'
                      }}
                    >
                      <span style={{ color: '#7aa2f7', fontSize: 12 }}>▸</span>
                      <span style={{
                        fontFamily: 'Monaco, monospace',
                        fontSize: 11,
                        color: '#c0caf5',
                        flex: 1,
                      }}>{ex.cmd}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Firewall Room: Quick Examples (show full commands) */}
              {isFirewallRoom && (
                <div>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>Quick Examples</h3>
                  {[
                    { label: 'Ping web server (reachability)', cmd: `ping ${fwTop?.webServerIp || '198.51.100.10'}` },
                    { label: 'Test HTTPS port (TCP/443)', cmd: `telnet ${fwTop?.webServerIp || '198.51.100.10'} 443` },
                    { label: 'Test blocked port (TCP/80)', cmd: `telnet ${fwTop?.webServerIp || '198.51.100.10'} 80` },
                    { label: 'Netcat port check', cmd: `nc ${fwTop?.webServerIp || '198.51.100.10'} 443` },
                    { label: 'HTTP request over HTTPS', cmd: `curl https://${fwTop?.webServerIp || '198.51.100.10'}` },
                    { label: 'Toggle Firewall Rules panel', cmd: 'rules' },
                  ].map(ex => (
                    <div
                      key={ex.cmd}
                      onClick={() => handleExampleClick(ex.cmd)}
                      style={{
                        padding: '8px 10px',
                        background: '#24283b',
                        border: '1px solid #414868',
                        borderRadius: 6,
                        marginBottom: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(122, 162, 247, 0.1)'
                        e.currentTarget.style.borderColor = '#7aa2f7'
                        e.currentTarget.style.transform = 'translateX(4px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#24283b'
                        e.currentTarget.style.borderColor = '#414868'
                        e.currentTarget.style.transform = 'translateX(0)'
                      }}
                    >
                      <span style={{ color: '#7aa2f7', fontSize: 12 }}>▸</span>
                      <span style={{
                        fontFamily: 'Monaco, monospace',
                        fontSize: 11,
                        color: '#c0caf5',
                        flex: 1,
                      }}>{ex.cmd}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Legacy Quick Examples (hide or derive from room commands) */}
              {!isFirewallRoom && !roomScoped && !isVpnRoom && (
                <div>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#c0caf5',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>Quick Examples</h3>
                  {[
                    { label: 'DNS Query', cmd: 'dig google.com' },
                    { label: 'Ping Test', cmd: 'ping google.com' },
                    { label: 'HTTP Request', cmd: 'curl -I https://google.com' },
                  ].map(ex => (
                    <div
                      key={ex.cmd}
                      onClick={() => handleExampleClick(ex.cmd)}
                      style={{
                        padding: '8px 10px',
                        background: '#24283b',
                        border: '1px solid #414868',
                        borderRadius: 6,
                        marginBottom: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(122, 162, 247, 0.1)'
                        e.currentTarget.style.borderColor = '#7aa2f7'
                        e.currentTarget.style.transform = 'translateX(4px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#24283b'
                        e.currentTarget.style.borderColor = '#414868'
                        e.currentTarget.style.transform = 'translateX(0)'
                      }}
                    >
                      <span style={{ color: '#7aa2f7', fontSize: 12 }}>▸</span>
                      <span style={{
                        fontFamily: 'Monaco, monospace',
                        fontSize: 11,
                        color: '#c0caf5',
                        flex: 1,
                      }}>{ex.cmd}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
