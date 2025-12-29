'use client'

import React, { useMemo, useEffect, useRef, useState } from 'react'
// Replaced Radix Sheet with plain div to avoid build issue
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X } from 'lucide-react'
import type { RoomObject } from '@/utils/glb-loader'

type Packet = {
  id: string
  phase: 'DNS' | 'PKI' | 'HTTPS'
  proto: 'DNS' | 'TCP' | 'TLS' | 'HTTP'
  src: string
  dst: string
  sizeBytes: number
  status: 'normal' | 'dropped' | 'cached' | 'warning'
  timestamps?: { createdAt: number; seenAt?: number }
  dns?: Record<string, any> | null
  tcp?: Record<string, any> | null
  tls?: Record<string, any> | null
  http?: Record<string, any> | null
}

// New data-driven shapes (optional props)

type Device = {
  id: string
  zone: string
  label: string
  type: string
  os?: string
  interfaces?: { name: string; kind: string; ip?: string; vlan?: string }[]
  capabilities?: string[]
}

type Phase = { id: string; state: 'pending' | 'active' | 'done' | 'error'; startedAt?: number; endedAt?: number; note?: string }

export default function InspectorPanel({
  open,
  onOpenChange,
  roomId,
  objects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId?: string
  objects?: RoomObject[]
}) {
  const isFirewallRoom = roomId === 'firewall'
  const isVpnRoom = roomId === 'vpn'
  const isHttpsRoom = roomId === 'https'

  const metaById = useMemo(() => {
    const map: Record<string, any> = {}
    ;(objects || []).forEach((o) => {
      map[o.id] = (o as any).metadata || {}
    })
    return map
  }, [objects])

  const stripCidr = (ip: any): string => {
    if (typeof ip !== 'string') return ''
    return ip.split('/')[0]
  }

  const fwAddrs = useMemo(() => {
    if (!isFirewallRoom) return null

    const desktopNet = metaById.desktop1?.net || {}
    const routerNet = metaById.router1?.net || {}
    const firewallNet = metaById.firewall1?.net || {}
    const serverNet = metaById.dns1?.net || {}
    const attackerNet = metaById.desktop2?.net || {}

    const routerLanIf = Array.isArray(routerNet.interfaces)
      ? routerNet.interfaces.find((i: any) => i?.name === 'LAN')
      : null

    return {
      desktopIp: stripCidr(desktopNet.ip) || '192.168.10.30',
      routerLanIp: stripCidr(routerLanIf?.ip) || '192.168.10.1',
      firewallWanIp: stripCidr(firewallNet.outsideIp) || '203.0.113.1',
      webIp: stripCidr(serverNet.ip) || '198.51.100.10',
      attackerIp: stripCidr(attackerNet.ip) || '198.51.100.66',
    }
  }, [isFirewallRoom, metaById])

  const httpsAddrs = useMemo(() => {
    if (!isHttpsRoom) return null

    const desktopNet = metaById.desktop1?.net || {}
    const firewallNet = metaById.firewall1?.net || {}
    const webNet = metaById.web1?.net || {}

    const desktopIfaces = Array.isArray(desktopNet.interfaces) ? desktopNet.interfaces : []
    const webIfaces = Array.isArray(webNet.interfaces) ? webNet.interfaces : []

    const desktopIp = stripCidr(desktopIfaces[0]?.ip) || '192.168.10.30'
    const webIp = stripCidr(webIfaces[0]?.ip) || stripCidr(webNet.ip) || '198.51.100.10'

    const attackerNet = metaById.desktop2?.net || {}
    const attackerIfaces = Array.isArray(attackerNet.interfaces) ? attackerNet.interfaces : []
    const attackerIp = stripCidr(attackerIfaces[0]?.ip) || stripCidr(attackerNet.ip) || '198.51.100.66'

    // Optional NAT/public IP (if present) for teaching; if not present, we just show direct client→server.
    const fwIfaces = Array.isArray(firewallNet.interfaces) ? firewallNet.interfaces : []
    const fwOutsideIp = stripCidr(fwIfaces.find((i: any) => String(i?.name || '').toLowerCase() === 'outside')?.ip) || stripCidr(firewallNet.outsideIp) || '203.0.113.1'

    return { desktopIp, webIp, fwOutsideIp, attackerIp }
  }, [isHttpsRoom, metaById])

  const firewallOverlayByPacketId = useMemo(() => {
    if (!isFirewallRoom) return {} as Record<string, any>

    const desktopIp = fwAddrs?.desktopIp || '192.168.10.30'
    const routerLanIp = fwAddrs?.routerLanIp || '192.168.10.1'
    const firewallWanIp = fwAddrs?.firewallWanIp || '203.0.113.1'
    const webIp = fwAddrs?.webIp || '198.51.100.10'
    const attackerIp = fwAddrs?.attackerIp || '198.51.100.66'

    // Stable demo ports for readability
    const clientPort = 52345
    const natPort = 62001
    const attackSrcPort = 55555

    const preNat = `${desktopIp}:${clientPort} → ${webIp}:443`
    const postNat = `${firewallWanIp}:${natPort} → ${webIp}:443`
    const wanReply = `${webIp}:443 → ${firewallWanIp}:${natPort}`
    const postDeNat = `${webIp}:443 → ${desktopIp}:${clientPort}`

    const attackPre = `${attackerIp}:${attackSrcPort} → ${firewallWanIp}:22`
    const attackPost = `${attackerIp}:${attackSrcPort} → ${desktopIp}:22`

    return {
      // Traffic Analysis (DNS phase repurposed)
      'fw-ta-001': {
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
      'fw-ta-002': {
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

      // Rule Evaluation (PKI phase repurposed)
      'fw-re-001': {
        listId: 'fw-re-001',
        id: 'fw-re-001@firewall-inspect',
        type: 'FIREWALL_INSPECT',
        protocol: 'Inspection & Policy Check',
        encrypted: 'Yes (TLS payload)',
        step: '1',
        who_sends: `Router (LAN GW ${routerLanIp})`,
        from_to: preNat,
        what: 'Firewall inspects outbound traffic (LAN → WAN TCP/443)',
        key_fields: `{ "match_on": ["src_zone","dst_zone","protocol","port"], "protocol": "TCP", "port": 443 }`,
        what_changed_here: 'Firewall reads L3/L4 headers and evaluates rules. If allowed, it forwards to WAN; otherwise it drops.',
        method: '',
        path: '',
        ua: '',
      },

      // Enforced Outcome (HTTPS phase repurposed)
      'fw-eo-001': {
        listId: 'fw-eo-001',
        id: 'fw-eo-001@firewall-snat',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '1',
        who_sends: 'Firewall (SNAT/PAT)',
        from_to: postNat,
        what: 'Firewall forwards to WAN after applying source NAT',
        key_fields: `{ "NAT_before": "${desktopIp}:${clientPort} -> ${webIp}:443", "NAT_after": "${firewallWanIp}:${natPort} -> ${webIp}:443" }`,
        what_changed_here: 'Private source IP/port is translated to the firewall’s public IP/port so it can traverse the Internet.',
        method: 'GET',
        path: '/',
        ua: '',
      },
      'fw-eo-002': {
        listId: 'fw-eo-002',
        id: 'fw-eo-002@internet-deliver',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '2',
        who_sends: 'Internet (WAN transit)',
        from_to: postNat,
        what: 'Packet traverses the WAN and reaches the web server',
        key_fields: '{ "note": "Public routing; firewall state keeps track of this flow" }',
        what_changed_here: 'Across the Internet, intermediate routers forward the packet toward the destination.',
        method: '',
        path: '',
        ua: '',
      },
      'fw-eo-003': {
        listId: 'fw-eo-003',
        id: 'fw-eo-003@web-reply',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '3',
        who_sends: `Web Server (${webIp})`,
        from_to: wanReply,
        what: 'Web server responds over the same TLS session',
        key_fields: '{ "tcp": "src_port=443", "direction": "WAN → firewall" }',
        what_changed_here: 'Server sends the response back to the client’s public (NATed) socket.',
        method: '',
        path: '',
        ua: '',
      },
      'fw-eo-004': {
        listId: 'fw-eo-004',
        id: 'fw-eo-004@firewall-inbound-inspect',
        type: 'FIREWALL_INSPECT',
        protocol: 'Inspection & Policy Check',
        encrypted: 'Yes (TLS payload)',
        step: '4',
        who_sends: 'Internet (WAN transit)',
        from_to: wanReply,
        what: 'Firewall inspects inbound traffic (WAN → LAN TCP/443)',
        key_fields: '{ "rule_check": "WAN → LAN TCP/443", "stateful": "Return traffic must match an allowed flow" }',
        what_changed_here: 'Firewall verifies this is permitted (and/or part of an existing allowed connection) before forwarding inside.',
        method: '',
        path: '',
        ua: '',
      },
      'fw-eo-005': {
        listId: 'fw-eo-005',
        id: 'fw-eo-005@firewall-denat',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '5',
        who_sends: 'Firewall (de-NAT)',
        from_to: postDeNat,
        what: 'Firewall maps the public flow back to the LAN desktop',
        key_fields: `{ "deNAT_before": "${webIp}:443 -> ${firewallWanIp}:${natPort}", "deNAT_after": "${webIp}:443 -> ${desktopIp}:${clientPort}" }`,
        what_changed_here: 'Destination is rewritten back to the internal client socket (connection tracking).',
        method: '',
        path: '',
        ua: '',
      },
      'fw-eo-006': {
        listId: 'fw-eo-006',
        id: 'fw-eo-006@router-fwd',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '6',
        who_sends: `Router (LAN GW ${routerLanIp})`,
        from_to: postDeNat,
        what: 'Router forwards the response toward the switch',
        key_fields: '{ "note": "Normal routing inside the LAN" }',
        what_changed_here: 'Router delivers the packet to the correct LAN segment.',
        method: '',
        path: '',
        ua: '',
      },
      'fw-eo-007': {
        listId: 'fw-eo-007',
        id: 'fw-eo-007@switch-deliver',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes (on wire), decrypted on Desktop',
        step: '7',
        who_sends: 'Switch (L2 forwarder)',
        from_to: postDeNat,
        what: 'Switch delivers the response to the desktop',
        key_fields: '{ "result": "Browser decrypts TLS and renders the page" }',
        what_changed_here: 'Final hop in the LAN: the desktop receives the encrypted response and decrypts it locally.',
        method: '',
        path: '',
        ua: '',
      },

      // Attack Simulation (WAN → LAN TCP/22)
      'fw-atk-001': {
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
      'fw-atk-002': {
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
      'fw-atk-003': {
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
      'fw-atk-004': {
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
      'fw-atk-005': {
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
    } as Record<string, any>
  }, [isFirewallRoom, fwAddrs, metaById])

  const vpnAddrs = useMemo(() => {
    if (!isVpnRoom) return null

    const desktopNet = metaById.desktop1?.net || {}
    const firewallNet = metaById.firewall1?.net || {}
    const routerNet = metaById.router1?.net || {}
    const switchNet = metaById.switch1?.net || {}
    const webNet = metaById.web1?.net || {}

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
      stripCidr(firewallNet.outsideIp) ||
      getIfaceIp(firewallNet, (i) => String(i?.type || '').toUpperCase() === 'WAN' || String(i?.name || '').toLowerCase().includes('outside')) ||
      '203.0.113.1'

    const firewallInsideIp =
      stripCidr(firewallNet.insideIp) ||
      getIfaceIp(firewallNet, (i) => String(i?.type || '').toUpperCase() === 'LAN' || String(i?.name || '').toLowerCase().includes('inside')) ||
      '192.168.10.1'

    const routerLanIp =
      getIfaceIp(routerNet, (i) => String(i?.name || '').toUpperCase() === 'LAN' || String(i?.type || '').toUpperCase() === 'LAN') ||
      stripCidr(routerNet.ip) ||
      '192.168.10.1'

    const switchMgmtIp = stripCidr(switchNet.ip) || getIfaceIp(switchNet, (i) => String(i?.kind || '').toLowerCase() === 'mgmt') || '192.168.10.2'

    const lanServerIp =
      stripCidr(webNet.ip) ||
      getIfaceIp(webNet, (i) => String(i?.kind || '').toLowerCase() === 'lan' || String(i?.name || '').toLowerCase().includes('eth')) ||
      '192.168.10.50'

    return {
      remoteWanIp,
      firewallWanIp,
      firewallInsideIp,
      routerLanIp,
      switchMgmtIp,
      vpnAssignedIp: '10.8.0.25',
      lanServerIp,
    }
  }, [isVpnRoom, metaById])

  const vpnOverlayByPacketId = useMemo(() => {
    if (!isVpnRoom) return {} as Record<string, any>

    const remoteWanIp = vpnAddrs?.remoteWanIp || '203.0.113.25'
    const firewallWanIp = vpnAddrs?.firewallWanIp || '203.0.113.1'
    const firewallInsideIp = vpnAddrs?.firewallInsideIp || '192.168.10.1'
    const routerLanIp = vpnAddrs?.routerLanIp || '192.168.10.1'
    const switchMgmtIp = vpnAddrs?.switchMgmtIp || '192.168.10.2'
    const vpnAssignedIp = vpnAddrs?.vpnAssignedIp || '10.8.0.25'
    const lanServerIp = vpnAddrs?.lanServerIp || '192.168.10.50'

    // What the packet looks like from a routing perspective.
    const remoteToFirewall = `${remoteWanIp}:52345 → ${firewallWanIp}:443`

    // Inside the VPN, we model the "inner" traffic as VPN-client → LAN-server.
    const innerVpnToLan = `${vpnAssignedIp}:52345 → ${lanServerIp}:443`

    return {
      // Phase 1: No VPN
      'vpn-nv-001': {
        listId: 'vpn-nv-001',
        id: 'vpn-nv-001@remote-to-firewall',
        type: 'PACKET',
        protocol: 'TCP/443',
        encrypted: 'No (no VPN tunnel)',
        step: '1',
        who_sends: `Remote User (${remoteWanIp})`,
        from_to: remoteToFirewall,
        what: 'Remote user sends traffic directly to the firewall (no VPN)',
        key_fields: '{ "src": "remote user", "dst": "firewall", "port": 443, "protocol": "TCP" }',
        what_changed_here: 'The packet is crossing the public Internet without a tunnel. A passive eavesdropper can capture it and read its metadata (and possibly content).',
        method: '',
        path: '',
        ua: '',
      },
      'vpn-nv-002': {
        listId: 'vpn-nv-002',
        id: 'vpn-nv-002@firewall-deny',
        type: 'FIREWALL_INSPECT',
        protocol: 'Firewall inspection',
        encrypted: 'No',
        step: '2',
        who_sends: `Firewall (WAN ${firewallWanIp})`,
        from_to: remoteToFirewall,
        what: 'Firewall inspects inbound traffic and blocks it (WAN → LAN)',
        key_fields: '{ "zone": "WAN → LAN", "decision": "DENY" }',
        what_changed_here: 'The firewall does not forward unauthenticated public Internet traffic directly into the LAN. VPN is required for secure access.',
        method: '',
        path: '',
        ua: '',
      },

      // Phase 2: Secure Access via VPN
      'vpn-vpn-001': {
        listId: 'vpn-vpn-001',
        id: 'vpn-vpn-001@remote-to-firewall-vpn',
        type: 'VPN_TUNNEL',
        protocol: 'Encrypted VPN Tunnel',
        encrypted: 'Yes (VPN tunnel)',
        step: '1',
        who_sends: `Remote User (VPN client ${vpnAssignedIp})`,
        from_to: innerVpnToLan,
        what: 'Remote user connects via VPN; traffic is encrypted in transit',
        key_fields: '{ "inner": "TCP/443", "note": "encapsulated by VPN" }',
        what_changed_here: 'Even if an eavesdropper captures the packet on the Internet, it can’t read the contents—only that it is encrypted.',
        method: '',
        path: '',
        ua: '',
      },
      'vpn-vpn-002': {
        listId: 'vpn-vpn-002',
        id: 'vpn-vpn-002@firewall-to-router',
        type: 'FIREWALL_INSPECT',
        protocol: 'Firewall policy + routing',
        encrypted: 'Yes (protected in transit)',
        step: '2',
        who_sends: `Firewall (inside ${firewallInsideIp})`,
        from_to: innerVpnToLan,
        what: 'Firewall allows VPN traffic into the LAN (VPN → LAN)',
        key_fields: '{ "zone": "VPN → LAN", "decision": "ALLOW" }',
        what_changed_here: 'After authenticating the VPN user, the firewall forwards the allowed traffic toward the internal network.',
        method: '',
        path: '',
        ua: '',
      },
      'vpn-vpn-003': {
        listId: 'vpn-vpn-003',
        id: 'vpn-vpn-003@router-forward',
        type: 'PACKET',
        protocol: 'Routing (L3)',
        encrypted: 'Yes (protected in transit)',
        step: '3',
        who_sends: `Router (LAN GW ${routerLanIp})`,
        from_to: innerVpnToLan,
        what: 'Router forwards traffic toward the correct LAN segment',
        key_fields: '{ "l3": "dst=LAN server", "note": "TTL decreases by 1" }',
        what_changed_here: 'Routers forward based on destination IP. The IP/port stay the same; only hop-limit/TTL changes.',
        method: '',
        path: '',
        ua: '',
      },
      'vpn-vpn-004': {
        listId: 'vpn-vpn-004',
        id: 'vpn-vpn-004@switch-deliver',
        type: 'PACKET',
        protocol: 'Switching (L2)',
        encrypted: 'Yes (protected in transit)',
        step: '4',
        who_sends: `Switch (mgmt ${switchMgmtIp})`,
        from_to: innerVpnToLan,
        what: 'Switch delivers the frame to the web server',
        key_fields: '{ "l2": "MAC changes only", "l3_l4": "unchanged" }',
        what_changed_here: 'Switches forward frames inside a LAN. The IP header and TCP ports are unchanged.',
        method: '',
        path: '',
        ua: '',
      },
      'vpn-vpn-005': {
        listId: 'vpn-vpn-005',
        id: 'vpn-vpn-005@web-receive',
        type: 'PACKET',
        protocol: 'TCP/443',
        encrypted: 'Yes',
        step: '5',
        who_sends: `Web Server (${lanServerIp})`,
        from_to: innerVpnToLan,
        what: 'Web server receives the request over the secure access path',
        key_fields: '{ "dst_port": 443, "service": "HTTPS" }',
        what_changed_here: 'The protected resource is reachable only because the request entered through the VPN zone, not directly from the public Internet.',
        method: '',
        path: '/',
        ua: '',
      },
    } as Record<string, any>
  }, [isVpnRoom, vpnAddrs])

  const samplePackets: Packet[] = [
    { id: 'pkt-001', phase: 'DNS', proto: 'DNS', src: '10.0.0.1:1234', dst: '8.8.8.8:53', sizeBytes: 90, status: 'normal', timestamps: { createdAt: 0.1 }, dns: { qname: 'example.com' }, tcp: null, tls: null, http: null },
    { id: 'pkt-101', phase: 'PKI', proto: 'TLS', src: '10.0.0.10:443', dst: '203.0.113.5:443', sizeBytes: 1500, status: 'normal', timestamps: { createdAt: 0.6 }, dns: null, tcp: null, tls: { cert: 'CN=example' }, http: null },
    { id: 'pkt-201', phase: 'HTTPS', proto: 'HTTP', src: '10.0.0.20:52345', dst: '93.184.216.34:443', sizeBytes: 2000, status: 'normal', timestamps: { createdAt: 1.0 }, dns: null, tcp: { flags: ['SYN'] }, tls: null, http: { method: 'GET', path: '/' } },
  ]

  const phases: Phase[] = useMemo(() => {
    if (isFirewallRoom) {
      return [
        { id: 'DNS', state: 'done', startedAt: 0.2, endedAt: 0.45, note: 'Identify direction, protocol, and port' },
        { id: 'PKI', state: 'done', startedAt: 0.6, endedAt: 0.9, note: 'Match traffic against the firewall rules' },
        { id: 'HTTPS', state: 'active', startedAt: 1.0, note: 'Apply the decision: allow or block' },
      ]
    }

    if (isVpnRoom) {
      // VPN room has two teaching phases:
      // - No VPN (traffic hits the firewall; eavesdroppers can read it)
      // - Secure Access via VPN (encrypted tunnel; eavesdroppers can capture but can't read)
      return [
        { id: 'DNS', state: 'active', note: 'No VPN: traffic crosses the Internet without a tunnel' },
        { id: 'PKI', state: 'pending', note: 'Secure Access via VPN: encrypted tunnel protects data' },
      ]
    }

    if (isHttpsRoom) {
      return [
        { id: 'DNS', state: 'active', note: 'HTTP: readable requests/responses (no encryption)' },
        { id: 'PKI', state: 'pending', note: 'TLS Handshake: authenticate server + establish keys' },
        { id: 'HTTPS', state: 'pending', note: 'HTTPS: encrypted application data over TLS' },
      ]
    }

    return [
      { id: 'DNS', state: 'done', startedAt: 0.2, endedAt: 0.45, note: 'Resolve hostname' },
      { id: 'PKI', state: 'done', startedAt: 0.6, endedAt: 0.9, note: 'Validate certificate' },
      { id: 'HTTPS', state: 'active', startedAt: 1.0, note: 'Fetch content via CDN' },
    ]
  }, [isFirewallRoom, isVpnRoom, isHttpsRoom])


  const [tab, setTab] = useState<string>(() => (roomId === 'vpn' ? 'phases' : 'packets'))
  const [packets, setPackets] = useState<Packet[]>(samplePackets)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [protoFilter, setProtoFilter] = useState('all')
  const [infoPhase, setInfoPhase] = useState<'DNS' | 'PKI' | 'HTTPS' | null>(null)
  const [infoDevice, setInfoDevice] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const [dockPos, setDockPos] = useState<{ top: number; left: number }>({ top: 80, left: 16 })
  const DOCK_W = 440
  const DOCK_GAP = 24

  useEffect(() => {
    if (!infoPhase && !infoDevice) return
    const positionDock = () => {
      try {
        const insp = document.querySelector('[data-loc="src/components/inspector/InspectorPanel.tsx:sheet-content"]') as HTMLElement | null
        if (!insp) return
        const rect = insp.getBoundingClientRect()
        const top = Math.max(5, rect.top)
        const left = Math.max(8, rect.left - (DOCK_W + DOCK_GAP))
        setDockPos({ top, left })
      } catch {}
    }
    positionDock()
    const onScroll = () => positionDock()
    const onResize = () => positionDock()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    const id = window.setInterval(positionDock, 300)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
    }
  }, [infoPhase, infoDevice])

  const listRef = useRef<HTMLDivElement | null>(null)
  const [startIndex, setStartIndex] = useState(0)
  const rowHeight = 48
  const viewportHeight = 360
  const [expandedPacketId, setExpandedPacketId] = useState<string | null>(null)

  // Handle showing detailed HTML overlays for packet list interactions
  const handlePacketMouseDown = (p: any) => {
    const { showHtmlOverlay, hideHtmlOverlay } = require('@/store/useHtmlOverlay') as typeof import('@/store/useHtmlOverlay')

    if (isHttpsRoom) {
      const desktopIp = httpsAddrs?.desktopIp || '192.168.10.30'
      const webIp = httpsAddrs?.webIp || '198.51.100.10'

      // Stable demo ports (readability)
      const httpSrcPort = 51234
      const tlsSrcPort = 52345

      if (p.id === 'https-http-001') {
        showHtmlOverlay({
          listId: p.id,
          id: 'http-001@client-request',
          type: 'HTTP_PLAINTEXT',
          protocol: 'HTTP/1.1 (TCP/80)',
          encrypted: 'No',
          step: '1',
          who_sends: `Client (${desktopIp})`,
          from_to: `${desktopIp}:${httpSrcPort} → ${webIp}:80`,
          what: 'HTTP request is sent in cleartext (readable on the wire)',
          key_fields: '{ "method": "GET", "path": "/login", "host": "example.com" }',
          what_changed_here: 'Anyone on the network path can read HTTP headers and content because there is no encryption.',
          method: 'GET',
          path: '/login',
          ua: 'Mozilla/5.0',
        })
        return
      }

      if (p.id === 'https-http-002') {
        showHtmlOverlay({
          listId: p.id,
          id: 'http-002@server-response',
          type: 'HTTP_PLAINTEXT',
          protocol: 'HTTP/1.1 (TCP/80)',
          encrypted: 'No',
          step: '2',
          who_sends: `Web Server (${webIp})`,
          from_to: `${webIp}:80 → ${desktopIp}:${httpSrcPort}`,
          what: 'HTTP response is also cleartext (readable on the wire)',
          key_fields: '{ "status": 200, "set-cookie": "session=...", "content-type": "text/html" }',
          what_changed_here: 'Return traffic is readable too. If sensitive data is in cookies/forms, it can be captured.',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      if (p.id === 'https-tls-001') {
        showHtmlOverlay({
          listId: p.id,
          id: 'tls-001@clienthello',
          type: 'TLS_HANDSHAKE',
          protocol: 'TLS 1.3 (TCP/443)',
          encrypted: 'Handshake (not application data)',
          step: '1',
          who_sends: `Client (${desktopIp})`,
          from_to: `${desktopIp}:${tlsSrcPort} → ${webIp}:443`,
          what: 'ClientHello starts TLS (supported cipher suites, SNI, key share)',
          key_fields: '{ "SNI": "example.com", "ALPN": ["h2","http/1.1"], "key_share": "X25519" }',
          what_changed_here: 'This begins encryption setup, but it is not yet HTTPS application data.',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      if (p.id === 'https-tls-002') {
        showHtmlOverlay({
          listId: p.id,
          id: 'tls-002@serverhello-cert',
          type: 'TLS_HANDSHAKE',
          protocol: 'TLS 1.3 (TCP/443)',
          encrypted: 'Handshake (cert exchange)',
          step: '2',
          who_sends: `Web Server (${webIp})`,
          from_to: `${webIp}:443 → ${desktopIp}:${tlsSrcPort}`,
          what: 'ServerHello selects parameters and sends certificate',
          key_fields: '{ "cert_subject": "CN=example.com", "issuer": "Example CA", "chosen_cipher": "TLS_AES_128_GCM_SHA256" }',
          what_changed_here: 'Client verifies the certificate to authenticate the server.',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      if (p.id === 'https-tls-003') {
        showHtmlOverlay({
          listId: p.id,
          id: 'tls-003@client-finished',
          type: 'TLS_HANDSHAKE',
          protocol: 'TLS 1.3 (TCP/443)',
          encrypted: 'Handshake finalize',
          step: '3',
          who_sends: `Client (${desktopIp})`,
          from_to: `${desktopIp}:${tlsSrcPort} → ${webIp}:443`,
          what: 'Client Finished proves it derived the session keys',
          key_fields: '{ "note": "Handshake integrity verified" }',
          what_changed_here: 'After this, both sides can protect application data with the negotiated keys.',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      if (p.id === 'https-tls-004') {
        showHtmlOverlay({
          listId: p.id,
          id: 'tls-004@server-finished',
          type: 'TLS_HANDSHAKE',
          protocol: 'TLS 1.3 (TCP/443)',
          encrypted: 'Handshake finalize',
          step: '4',
          who_sends: `Web Server (${webIp})`,
          from_to: `${webIp}:443 → ${desktopIp}:${tlsSrcPort}`,
          what: 'Server Finished completes the TLS handshake',
          key_fields: '{ "result": "Handshake complete" }',
          what_changed_here: 'TLS is established. Next phase is HTTPS (encrypted application data).',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      if (p.id === 'https-https-001') {
        showHtmlOverlay({
          listId: p.id,
          id: 'https-001@encrypted-request',
          type: 'HTTP_ENCRYPTED',
          protocol: 'HTTPS (HTTP over TLS) TCP/443',
          encrypted: 'Yes (application data)',
          step: '1',
          who_sends: `Client (${desktopIp})`,
          from_to: `${desktopIp}:${tlsSrcPort} → ${webIp}:443`,
          what: 'HTTPS request: content is encrypted on the wire',
          key_fields: '{ "visible_metadata": ["src","dst","protocol","port"], "payload": "<encrypted>" }',
          what_changed_here: 'Observers can see where traffic goes, but cannot read the HTTP content.',
          method: 'GET',
          path: '/account',
          ua: 'Mozilla/5.0',
        })
        return
      }

      if (p.id === 'https-https-002') {
        showHtmlOverlay({
          listId: p.id,
          id: 'https-002@encrypted-response',
          type: 'HTTP_ENCRYPTED',
          protocol: 'HTTPS (HTTP over TLS) TCP/443',
          encrypted: 'Yes (application data)',
          step: '2',
          who_sends: `Web Server (${webIp})`,
          from_to: `${webIp}:443 → ${desktopIp}:${tlsSrcPort}`,
          what: 'HTTPS response: still encrypted on the wire',
          key_fields: '{ "status": 200, "content-type": "text/html", "payload": "<encrypted>" }',
          what_changed_here: 'Browser decrypts the response locally after receiving it.',
          method: '',
          path: '',
          ua: '',
        })
        return
      }

      hideHtmlOverlay()
      return
    }

    if (isVpnRoom) {
      const payload = (vpnOverlayByPacketId as any)?.[p?.id]
      if (payload) {
        showHtmlOverlay(payload)
        return
      }
    }

    if (isFirewallRoom) {
      const payload = (firewallOverlayByPacketId as any)?.[p?.id]
      if (payload) {
        showHtmlOverlay(payload)
        return
      }
    }

    // DNS phase
    if (p.id === 'pkt-001' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-001@laptop-egress',
        type: 'DNS_QUERY',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '1',
        who_sends: 'Laptop (192.168.10.30)',
        from_to: '192.168.10.30:55678 → 8.8.8.8:53',
        what: 'DNS Query for google.com A',
        key_fields: '{ "question": "google.com A", "size": "≈92 B" }',
        what_changed_here: 'Laptop creates the DNS question and sends it out.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-002' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-002@switch-fwd',
        type: 'DNS_QUERY',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '2',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '192.168.10.30:55678 → 8.8.8.8:53',
        what: 'Forwarding the same DNS Query',
        key_fields: '{ "question": "google.com A" }',
        what_changed_here: 'Switch just passes frames along. IP/ports don’t change.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-003' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-003@router-fwd',
        type: 'DNS_QUERY',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '3',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '192.168.10.30:55678 → 8.8.8.8:53',
        what: 'DNS Query toward the firewall',
        key_fields: '{ "question": "google.com A", "ip_hop_limit": "decreases by 1" }',
        what_changed_here: 'Router forwards toward the Internet.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-004' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-004@firewall-nat',
        type: 'DNS_QUERY',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '4',
        who_sends: 'Firewall (inside→outside NAT)',
        from_to: '203.0.113.1:62001 → 8.8.8.8:53',
        what: 'DNS Query after NAT (public IP/port)',
        key_fields: '{ "question": "google.com A", "NAT_before": "192.168.10.30:55678 → 8.8.8.8:53", "NAT_after":  "203.0.113.1:62001 → 8.8.8.8:53" }',
        what_changed_here: 'Firewall rewrites source to public IP/port (SNAT/PAT) and sends across the Internet.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-005' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-005@resolver-reply',
        type: 'DNS_RESPONSE',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '5',
        who_sends: 'DNS Resolver (8.8.8.8) replying',
        from_to: '8.8.8.8:53 → 203.0.113.1:62001',
        what: 'DNS Response: A record for google.com',
        key_fields: '{ "answer": "google.com → 142.250.190.14", "TTL": "300s", "size": "≈128 B" }',
        what_changed_here: 'Resolver returns the answer to your public IP/port.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-006' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-006@firewall-denat',
        type: 'DNS_RESPONSE',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '6',
        who_sends: 'Firewall (outside→inside de-NAT)',
        from_to: '8.8.8.8:53 → 192.168.10.30:55678',
        what: 'DNS Response after de-NAT (mapped back to laptop)',
        key_fields: '{ "answer": "google.com → 142.250.190.14", "deNAT_before": "8.8.8.8:53 → 203.0.113.1:62001", "deNAT_after":  "8.8.8.8:53 → 192.168.10.30:55678" }',
        what_changed_here: 'Firewall maps the public flow back to the laptop’s original socket.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-007' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-007@router-fwd',
        type: 'DNS_RESPONSE',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '7',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '8.8.8.8:53 → 192.168.10.30:55678',
        what: 'DNS Response toward the switch',
        key_fields: '{ "answer": "google.com → 142.250.190.14" }',
        what_changed_here: 'Router forwards response into the LAN.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-008' && p.phase === 'DNS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'dns-008@switch-deliver',
        type: 'DNS_RESPONSE',
        protocol: 'UDP/53',
        encrypted: 'No',
        step: '8',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '8.8.8.8:53 → 192.168.10.30:55678',
        what: 'Deliver DNS Response to laptop',
        key_fields: '{ "answer": "google.com → 142.250.190.14", "cache_TTL_starts": "300s at laptop" }',
        what_changed_here: 'Switch delivers frames; laptop will cache the result and can now contact 142.250.190.14.',
        method: '', path: '', ua: ''
      })
    }
    // PKI (TLS handshake)
    else if (p.id === 'pkt-101' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-001@laptop-egress',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'No',
        step: '1',
        who_sends: 'Laptop (192.168.10.30)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'TLS ClientHello (SNI google.com, ALPN h2)',
        key_fields: '{ "SNI": "google.com", "ALPN": "h2" }',
        what_changed_here: 'Laptop starts TLS; announces who it wants and supported features.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-102' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-002@switch-fwd',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'No',
        step: '2',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'Forwarding ClientHello',
        key_fields: '{ "note": "Layer-2 pass-through" }',
        what_changed_here: 'Frames forwarded; headers unchanged.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-103' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-003@router-fwd',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'No',
        step: '3',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'ClientHello toward firewall',
        key_fields: '{ "ip_hop_limit": "TTL decreases by 1" }',
        what_changed_here: 'Routes toward Internet.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-104' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-004@firewall-nat',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'No',
        step: '4',
        who_sends: 'Firewall (inside→outside NAT)',
        from_to: '203.0.113.1:62002 → 142.250.190.14:443',
        what: 'ClientHello after NAT (to CDN Edge)',
        key_fields: '{ "NAT_before": "192.168.10.30:51234 -> 142.250.190.14:443", "NAT_after":  "203.0.113.1:62002 -> 142.250.190.14:443", "SNI": "google.com", "ALPN": "h2" }',
        what_changed_here: 'Firewall rewrites source to public IP/port and tracks state.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-105' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-005@server-hello',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'Yes',
        step: '5',
        who_sends: 'CDN Edge (142.250.190.14)',
        from_to: '142.250.190.14:443 → 203.0.113.1:62002',
        what: 'ServerHello + encrypted handshake data',
        key_fields: '{ "cipher_selected": "TLS_AES_128_GCM_SHA256", "ALPN_selected": "h2", "note": "ServerHello clear; rest encrypted (TLS 1.3)" }',
        what_changed_here: 'Edge chooses settings and returns handshake messages.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-106' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-006@firewall-denat',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'Yes',
        step: '6',
        who_sends: 'Firewall (outside→inside de-NAT)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'ServerHello + encrypted handshake after de-NAT',
        key_fields: '{ "deNAT_before": "142.250.190.14:443 -> 203.0.113.1:62002", "deNAT_after":  "142.250.190.14:443 -> 192.168.10.30:51234" }',
        what_changed_here: 'Maps public flow back to the laptop’s socket.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-107' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-007@router-fwd',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'Yes',
        step: '7',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'Encrypted handshake toward LAN',
        key_fields: '{ "note": "Normal routing; payload remains encrypted" }',
        what_changed_here: 'Forwards to the switch.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-108' && p.phase === 'PKI') {
      showHtmlOverlay({
        listId: p.id,
        id: 'tls-008@switch-deliver',
        type: 'TLS_HANDSHAKE',
        protocol: 'TLS 1.3 on TCP/443',
        encrypted: 'Yes',
        step: '8',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'Deliver ServerHello + encrypted handshake',
        key_fields: '{ "on_receive": "Laptop validates cert chain & completes TLS", "result": "Session keys established" }',
        what_changed_here: 'Delivered to the laptop; secure channel ready for HTTPS.',
        method: '', path: '', ua: ''
      })
    }
    // HTTPS
    else if (p.id === 'pkt-201' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-001@laptop-egress',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '1',
        who_sends: 'Laptop (192.168.10.30)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'HTTPS Request (GET /)',
        key_fields: '{ "inside_tls": { "method": "GET", "path": "/", "host": "google.com", "accept-encoding": "br" } }',
        what_changed_here: 'Browser sends the page request through the TLS tunnel.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-202' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-002@switch-fwd',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '2',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'Forwarding HTTPS request',
        key_fields: '{ "note": "Layer-2 pass-through" }',
        what_changed_here: 'Frames forwarded; headers unchanged.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-203' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-003@router-fwd',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '3',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '192.168.10.30:51234 → 142.250.190.14:443',
        what: 'HTTPS request toward firewall',
        key_fields: '{ "ip_hop_limit": "TTL drops by 1" }',
        what_changed_here: 'Routes toward the Internet.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-204' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-004@firewall-nat',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '4',
        who_sends: 'Firewall (inside→outside NAT)',
        from_to: '203.0.113.1:62002 → 142.250.190.14:443',
        what: 'HTTPS request after NAT (CDN Edge)',
        key_fields: '{ "NAT_before": "192.168.10.30:51234 → 142.250.190.14:443", "NAT_after":  "203.0.113.1:62002 → 142.250.190.14:443", "ALPN": "h2" }',
        what_changed_here: 'Firewall rewrites source to public IP/port and sends to the Edge.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-205' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-005@edge-origin-miss-req',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '5',
        who_sends: 'CDN Edge (142.250.190.14) as client',
        from_to: '142.250.190.14:53123 → 172.217.12.14:443',
        what: 'Origin fetch (HTTPS GET /)',
        key_fields: '{ "cache": "MISS", "inside_tls": { "method": "GET", "path": "/", "host": "origin.google.com" } }',
        what_changed_here: 'Edge did not have a cached copy; it opens its own TLS session to the origin.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-206' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-006@origin-edge-miss-resp',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '6',
        who_sends: 'Origin Web Server (172.217.12.14)',
        from_to: '172.217.12.14:443 → 142.250.190.14:53123',
        what: 'HTTPS Response (200 OK, index.html)',
        key_fields: '{ "inside_tls": { "status": 200, "content-type": "text/html", "content-encoding": "br", "etag": "etag-4af2b1", "cache-control": "public, max-age=300" }, "approx_size": "≈15 KB (compressed)" }',
        what_changed_here: 'Origin returns content; Edge will store it per caching headers.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-207' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-007@edge-client-serve',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '7',
        who_sends: 'CDN Edge (142.250.190.14)',
        from_to: '142.250.190.14:443 → 203.0.113.1:62002',
        what: 'HTTPS Response to client (freshly cached)',
        key_fields: '{ "cache": "STORE (Age: 0s)", "inside_tls": { "status": 200, "etag": "etag-4af2b1", "content-encoding": "br" } }',
        what_changed_here: 'Edge serves the response and keeps a copy for future requests.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-208' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-008@firewall-denat',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '8',
        who_sends: 'Firewall (outside→inside de-NAT)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'HTTPS response after de-NAT',
        key_fields: '{ "deNAT_before": "142.250.190.14:443 → 203.0.113.1:62002", "deNAT_after":  "142.250.190.14:443 → 192.168.10.30:51234" }',
        what_changed_here: 'Maps the public flow back to the laptop’s socket.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-209' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-009@router-fwd',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes',
        step: '9',
        who_sends: 'Router (LAN GW 192.168.10.1)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'HTTPS response toward LAN',
        key_fields: '{ "note": "Normal routing; payload stays encrypted" }',
        what_changed_here: 'Forwards response into the LAN.',
        method: '', path: '', ua: ''
      })
    } else if (p.id === 'pkt-210' && p.phase === 'HTTPS') {
      showHtmlOverlay({
        listId: p.id,
        id: 'https-010@switch-deliver',
        type: 'HTTP_ENCRYPTED',
        protocol: 'HTTP/2 over TLS 1.3 (TCP/443)',
        encrypted: 'Yes (on wire), decrypted on laptop',
        step: '10',
        who_sends: 'Switch (L2 forwarder)',
        from_to: '142.250.190.14:443 → 192.168.10.30:51234',
        what: 'Deliver HTTPS response to laptop',
        key_fields: '{ "on_receive": "Laptop decrypts HTML and starts render waterfall", "next_requests": ["style.css", "app.js", "logo.png"], "cache_hint": "ETag etag-4af2b1 may allow 304 later" }',
        what_changed_here: 'Delivered to the laptop; browser decrypts and begins fetching sub-resources.',
        method: '', path: '', ua: ''
      })
    } else {
      hideHtmlOverlay()
    }
  }

  const filteredPackets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return packets.filter((p) => {
      if (phaseFilter !== 'all' && p.phase !== (phaseFilter as any)) return false
      if (protoFilter !== 'all' && p.proto !== (protoFilter as any)) return false
      if (!q) return true
      return p.id.toLowerCase().includes(q) || p.src.toLowerCase().includes(q) || p.dst.toLowerCase().includes(q)
    })
  }, [packets, search, phaseFilter, protoFilter])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current
    const onScroll = () => {
      const idx = Math.floor(el.scrollTop / rowHeight)
      setStartIndex(idx)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Restore focus to Inspector button on close and hide any open HTML overlay
  useEffect(() => {
    if (!open) {
      // Hide overlay if any
      try {
        const { hideHtmlOverlay } = require('@/store/useHtmlOverlay') as typeof import('@/store/useHtmlOverlay')
        hideHtmlOverlay?.()
      } catch {}
      // Return focus to Inspector button
      const to = window.setTimeout(() => {
        const btn = document.querySelector('[data-loc="src/components/Header.tsx:inspector-button"]') as HTMLButtonElement | null
        btn?.focus()
      }, 0)
      return () => window.clearTimeout(to)
    }
  }, [open])

  const groupedPackets = useMemo(() => {
    const map: Record<string, Packet[]> = { DNS: [], PKI: [], HTTPS: [] }
    packets.forEach((p) => {
      map[p.phase] = map[p.phase] || []
      map[p.phase].push(p)
    })
    return map
  }, [packets])

  // Subscribe to overlay store once at top-level to enable reactivity for selection highlight
  const ovState = (require('@/store/useHtmlOverlay') as any).useHtmlOverlay?.() || { selectedId: undefined }

  const manualPacketsByPhase = useMemo(() => {
    if (isFirewallRoom) {
      return {
        DNS: [
          { id: 'fw-ta-001', phase: 'DNS', proto: 'TCP', name: 'Desktop → Switch' },
          { id: 'fw-ta-002', phase: 'DNS', proto: 'TCP', name: 'Switch → Router' },
        ],
        PKI: [
          { id: 'fw-re-001', phase: 'PKI', proto: 'TCP', name: 'Router → Firewall (Inspect)' },
        ],
        HTTPS: [
          { id: 'fw-eo-001', phase: 'HTTPS', proto: 'TCP', name: 'Firewall → Internet (SNAT)' },
          { id: 'fw-eo-002', phase: 'HTTPS', proto: 'TCP', name: 'Internet → Web Server' },
          { id: 'fw-eo-003', phase: 'HTTPS', proto: 'TCP', name: 'Web Server → Internet' },
          { id: 'fw-eo-004', phase: 'HTTPS', proto: 'TCP', name: 'Internet → Firewall (Inspect)' },
          { id: 'fw-eo-005', phase: 'HTTPS', proto: 'TCP', name: 'Firewall → Router (de-NAT)' },
          { id: 'fw-eo-006', phase: 'HTTPS', proto: 'TCP', name: 'Router → Switch' },
          { id: 'fw-eo-007', phase: 'HTTPS', proto: 'TCP', name: 'Switch → Desktop' },
          { id: 'fw-atk-header', phase: 'HTTPS', proto: 'TCP', name: 'Attack Simulation', kind: 'section' },
          { id: 'fw-atk-001', phase: 'HTTPS', proto: 'TCP', name: 'Attacker Desktop → Internet' },
          { id: 'fw-atk-002', phase: 'HTTPS', proto: 'TCP', name: 'Internet → Firewall (Inspect)' },
          { id: 'fw-atk-003', phase: 'HTTPS', proto: 'TCP', name: 'Firewall → Router (DNAT / port-forward)' },
          { id: 'fw-atk-004', phase: 'HTTPS', proto: 'TCP', name: 'Router → Switch' },
          { id: 'fw-atk-005', phase: 'HTTPS', proto: 'TCP', name: 'Switch → Desktop (Compromise)' },
        ],
      } as const
    }

    if (isVpnRoom) {
      return {
        DNS: [
          { id: 'vpn-nv-001', phase: 'DNS', proto: 'TCP', name: 'Remote User → Firewall' },
          { id: 'vpn-nv-002', phase: 'DNS', proto: 'TCP', name: 'Firewall (Inspect & Block)' },
        ],
        PKI: [
          { id: 'vpn-vpn-001', phase: 'PKI', proto: 'TLS', name: 'Remote User → Firewall (VPN Tunnel)' },
          { id: 'vpn-vpn-002', phase: 'PKI', proto: 'TLS', name: 'Firewall → Router' },
          { id: 'vpn-vpn-003', phase: 'PKI', proto: 'TCP', name: 'Router → Switch' },
          { id: 'vpn-vpn-004', phase: 'PKI', proto: 'TCP', name: 'Switch → Web Server' },
          { id: 'vpn-vpn-005', phase: 'PKI', proto: 'TCP', name: 'Web Server (Receive)' },
        ],
        HTTPS: [],
      } as const
    }

    if (isHttpsRoom) {
      return {
        DNS: [
          { id: 'https-http-001', phase: 'DNS', proto: 'HTTP', name: 'HTTP Request (Client → Web Server)' },
          { id: 'https-http-002', phase: 'DNS', proto: 'HTTP', name: 'HTTP Response (Web Server → Client)' },
        ],
        PKI: [
          { id: 'https-tls-001', phase: 'PKI', proto: 'TLS', name: 'ClientHello' },
          { id: 'https-tls-002', phase: 'PKI', proto: 'TLS', name: 'ServerHello + Certificate' },
          { id: 'https-tls-003', phase: 'PKI', proto: 'TLS', name: 'Client Finished' },
          { id: 'https-tls-004', phase: 'PKI', proto: 'TLS', name: 'Server Finished' },
        ],
        HTTPS: [
          { id: 'https-https-001', phase: 'HTTPS', proto: 'HTTP', name: 'HTTPS Request (Encrypted)' },
          { id: 'https-https-002', phase: 'HTTPS', proto: 'HTTP', name: 'HTTPS Response (Encrypted)' },
        ],
      } as const
    }

    return {
      DNS: [
        { id: 'pkt-001', phase: 'DNS', proto: 'DNS', name: 'Laptop → Switch' },
        { id: 'pkt-002', phase: 'DNS', proto: 'DNS', name: 'Switch → Router' },
        { id: 'pkt-003', phase: 'DNS', proto: 'DNS', name: 'Router → Firewall' },
        { id: 'pkt-004', phase: 'DNS', proto: 'DNS', name: 'Firewall → Internet → DNS' },
        { id: 'pkt-005', phase: 'DNS', proto: 'DNS', name: 'DNS → Internet → Firewall' },
        { id: 'pkt-006', phase: 'DNS', proto: 'DNS', name: 'Firewall → Router' },
        { id: 'pkt-007', phase: 'DNS', proto: 'DNS', name: 'Router → Switch' },
        { id: 'pkt-008', phase: 'DNS', proto: 'DNS', name: 'Switch → Laptop' },
      ],
      PKI: [
        { id: 'pkt-101', phase: 'PKI', proto: 'TLS', name: 'Laptop → Switch' },
        { id: 'pkt-102', phase: 'PKI', proto: 'TLS', name: 'Switch → Router' },
        { id: 'pkt-103', phase: 'PKI', proto: 'TLS', name: 'Router → Firewall' },
        { id: 'pkt-104', phase: 'PKI', proto: 'TLS', name: 'Firewall → Internet → CDN Edge' },
        { id: 'pkt-105', phase: 'PKI', proto: 'TLS', name: 'CDN Edge → Internet → Firewall' },
        { id: 'pkt-106', phase: 'PKI', proto: 'TLS', name: 'Firewall → Router' },
        { id: 'pkt-107', phase: 'PKI', proto: 'TLS', name: 'Router → Switch' },
        { id: 'pkt-108', phase: 'PKI', proto: 'TLS', name: 'Switch → Laptop' },
      ],
      HTTPS: [
        { id: 'pkt-201', phase: 'HTTPS', proto: 'HTTP', name: 'Laptop → Switch', http: { type: 'request', method: 'GET', path: '/', host: 'google.com', encrypted: true } },
        { id: 'pkt-202', phase: 'HTTPS', proto: 'HTTP', name: 'Switch → Router', http: { type: 'request', method: 'GET', path: '/', host: 'google.com', encrypted: true } },
        { id: 'pkt-203', phase: 'HTTPS', proto: 'HTTP', name: 'Router → Firewall', http: { type: 'request', method: 'GET', path: '/', host: 'google.com', encrypted: true } },
        { id: 'pkt-204', phase: 'HTTPS', proto: 'HTTP', name: 'Firewall → Internet → CDN Edge', http: { type: 'request', method: 'GET', path: '/', host: 'google.com', encrypted: true } },
        { id: 'pkt-205', phase: 'HTTPS', proto: 'HTTP', name: 'CDN Edge → Web Server', http: { type: 'request', method: 'GET', path: '/', host: 'origin.google.com', encrypted: true } },
        { id: 'pkt-206', phase: 'HTTPS', proto: 'HTTP', name: 'Web Server → CDN Edge', http: { type: 'response', status: 200, contentType: 'text/html', encoding: 'br', etag: 'etag-4af2b1', encrypted: true } },
        { id: 'pkt-207', phase: 'HTTPS', proto: 'HTTP', name: 'CDN Edge → Internet → Firewall', http: { type: 'response', status: 200, contentType: 'text/html', encoding: 'br', etag: 'etag-4af2b1', encrypted: true } },
        { id: 'pkt-208', phase: 'HTTPS', proto: 'HTTP', name: 'Firewall → Router (de-NAT)', http: { type: 'response', status: 200, contentType: 'text/html', encoding: 'br', etag: 'etag-4af2b1', encrypted: true } },
        { id: 'pkt-209', phase: 'HTTPS', proto: 'HTTP', name: 'Router → Switch', http: { type: 'response', status: 200, contentType: 'text/html', encoding: 'br', etag: 'etag-4af2b1', encrypted: true } },
        { id: 'pkt-210', phase: 'HTTPS', proto: 'HTTP', name: 'Switch → Laptop', http: { type: 'response', status: 200, contentType: 'text/html', encoding: 'br', etag: 'etag-4af2b1', encrypted: true } },
      ],
    } as const
  }, [isFirewallRoom, isVpnRoom, isHttpsRoom])

  const displayPhase = (s: string) => {
    if (isFirewallRoom) {
      if (s === 'DNS') return 'Traffic Analysis'
      if (s === 'PKI') return 'Rule Evaluation'
      if (s === 'HTTPS') return 'Enforced Outcome'
    }

    if (isVpnRoom) {
      if (s === 'DNS') return 'No VPN'
      if (s === 'PKI') return 'Secure Access via VPN'
      return s
    }

    if (isHttpsRoom) {
      if (s === 'DNS') return 'HTTP'
      if (s === 'PKI') return 'TLS Handshake'
      if (s === 'HTTPS') return 'HTTPS'
    }

    return s === 'PKI' ? 'TLS Handshake' : s
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Inspector"
      data-qa="inspector-sheet"
      data-loc="src/components/inspector/InspectorPanel.tsx:sheet-content"
      style={{ top: 5, right: 5, position: 'fixed', height: '94vh', width: 380, background: '#ffffff', color: '#0f172a', borderRadius: 12, boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', padding: '0px 20px 20px 20px', zIndex: 9999, WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }}
    >
      <div data-loc="src/components/inspector/InspectorPanel.tsx:inspector-header" className="mb-6 space-y-1 text-left">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" data-loc="src/components/inspector/InspectorPanel.tsx:title">Inspector</h2>
          <button
            onClick={(e) => { onOpenChange(false); (e.target as HTMLElement).blur(); }}
            style={{
              background: 'none',
              border: '2px solid white',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              fontSize: '20px',
              lineHeight: '20px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
              marginTop: '8px',
              outline: 'none'
            }}
            onMouseDown={(e) => (e.target as HTMLElement).style.border = '2px solid #3b82f6'}
            onMouseUp={(e) => (e.target as HTMLElement).style.border = '2px solid white'}
            onBlur={(e) => (e.target as HTMLElement).style.border = '2px solid white'}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p
          className=""
          data-loc="src/components/inspector/InspectorPanel.tsx:subtitle"
          style={{ marginTop: -6, marginLeft: 0, color: '#666', fontSize: '14px' }}
        >
          Inspect live simulation: packets, devices, and flow timeline.
        </p>
      </div>

      <div className="mt-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
            <div className="relative w-full rounded-md" style={{ marginBottom: 24 }}>
              <div aria-hidden className="absolute inset-0 rounded-md bg-muted/30 z-0" style={{ pointerEvents: 'none' }} />
              <div className="relative z-10 flex items-center px-1 py-1">
                <TabsList className="w-full overflow-x-auto flex items-center justify-center rounded-[12px]" style={{ height: 36, fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }} data-loc="src/components/inspector/InspectorPanel.tsx:tabs-list">
                  <div className="items-center justify-center" style={{ display: 'grid', gridAutoFlow: 'column', columnGap: '48px', justifyContent: 'center', alignItems: 'center' }}>
<TabsTrigger value="phases" className="inline-flex items-center justify-center text-center text-[15px] font-medium leading-5 h-9 min-w-[88px] px-5 py-0 rounded-[8px] whitespace-nowrap select-none transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 bg-transparent text-slate-500 hover:text-slate-600 hover:bg-slate-100/40 border-b-2 border-transparent data-[state=active]:!bg-slate-700 data-[state=active]:ring-1 data-[state=active]:ring-slate-700 data-[state=active]:!text-primary data-[state=active]:hover:!bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:border-primary data-[state=active]:min-w-[112px] data-[state=active]:h-12 data-[state=active]:-my-1 data-[state=active]:rounded-[8px] active:scale-[0.95] active:translate-y-px will-change-transform motion-reduce:transition-none motion-reduce:transform-none" style={{ color: tab === 'phases' ? '#3B82F6' : '#64748b', backgroundColor: tab === 'phases' ? '#E2E8F0' : 'transparent' }} data-loc="src/components/inspector/InspectorPanel.tsx:trigger-phases">Phases</TabsTrigger>
<TabsTrigger value="packets" className="inline-flex items-center justify-center text-center text-[15px] font-medium leading-5 h-9 min-w-[88px] px-5 py-0 rounded-[8px] whitespace-nowrap select-none transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 bg-transparent text-slate-500 hover:text-slate-600 hover:bg-slate-100/40 border-b-2 border-transparent data-[state=active]:!bg-slate-700 data-[state=active]:ring-1 data-[state=active]:ring-slate-700 data-[state=active]:!text-primary data-[state=active]:hover:!bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:border-primary data-[state=active]:min-w-[112px] data-[state=active]:h-12 data-[state=active]:-my-1 data-[state=active]:rounded-[8px] active:scale-[0.95] active:translate-y-px will-change-transform motion-reduce:transition-none motion-reduce:transform-none" style={{ color: tab === 'packets' ? '#3B82F6' : '#64748b', backgroundColor: tab === 'packets' ? '#E2E8F0' : 'transparent' }} data-loc="src/components/inspector/InspectorPanel.tsx:trigger-packets">Packets</TabsTrigger>
<TabsTrigger value="devices" className="inline-flex items-center justify-center text-center text-[15px] font-medium leading-5 h-9 min-w-[88px] px-5 py-0 rounded-[8px] whitespace-nowrap select-none transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 bg-transparent text-slate-500 hover:text-slate-600 hover:bg-slate-100/40 border-b-2 border-transparent data-[state=active]:!bg-slate-700 data-[state=active]:ring-1 data-[state=active]:ring-slate-700 data-[state=active]:!text-primary data-[state=active]:hover:!bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:border-primary data-[state=active]:min-w-[112px] data-[state=active]:h-12 data-[state=active]:-my-1 data-[state=active]:rounded-[8px] active:scale-[0.95] active:translate-y-px will-change-transform motion-reduce:transition-none motion-reduce:transform-none" style={{ color: tab === 'devices' ? '#3B82F6' : '#64748b', backgroundColor: tab === 'devices' ? '#E2E8F0' : 'transparent' }} data-loc="src/components/inspector/InspectorPanel.tsx:trigger-devices">Devices</TabsTrigger>
                  </div>
                </TabsList>
              </div>
            </div>
            <div style={{ height: (tab === 'phases' || tab === 'packets') ? 0 : 12 }} />

            <TabsContent value="phases" className="!mt-0" data-loc="src/components/inspector/InspectorPanel.tsx:phases-content">
              <div className="space-y-2">
                <h3 id="phases-heading" className="text-sm font-semibold text-foreground">Phases</h3>
                <ul role="list" aria-labelledby="phases-heading" className="mt-0 list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px' }} data-loc="src/components/inspector/InspectorPanel.tsx:phases-list">
{phases.map((ph) => (
                    <li
                      key={ph.id}
                      role="listitem"
                      className="flex items-center justify-between border rounded-[12px] cursor-pointer hover:bg-muted/40 transition-colors"
                      style={{ padding: '4px 24px' }}
                      data-loc="src/components/inspector/InspectorPanel.tsx:phases-row"
                      onClick={() => setInfoPhase(prev => (prev === (ph.id as any) ? null : (ph.id as any)))}
                    >
                      <div className="flex flex-col">
                        <div className="font-semibold text-foreground" style={{ fontWeight: 660 }}>{displayPhase(ph.id as string)}</div>
<div className="font-normal text-muted-foreground" style={{ fontFamily: 'Inter, system-ui, \"-apple-system\", \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial', fontSize: '14px', lineHeight: '20px' }}>{ph.note}</div>
                      </div>
                    </li>
                  ))}
                </ul>

              </div>
            </TabsContent>

            <TabsContent value="packets" className="!mt-0">
              <ScrollArea
                className="h-[65vh] pr-2"
                role="list"
                aria-label="Packets list"
                data-qa="inspector-packets-list"
                data-loc="src/components/inspector/InspectorPanel.tsx:packets-list"
                ref={listRef as any}
              >
                <div className="space-y-4 p-1" style={{ paddingTop: 8 }}>
                  {(isVpnRoom ? ['DNS', 'PKI'] : ['DNS', 'PKI', 'HTTPS']).map((phase) => {
                    const list = (manualPacketsByPhase as any)[phase]
                    return (
                      <div key={phase}>
                        <div className="text-xs font-semibold text-muted-foreground px-1 mb-0" style={{ marginBottom: 0 }}>
                          {displayPhase(phase)}{isVpnRoom ? '' : ' Phase'}
                        </div>
                        <ul className="list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px', marginTop: 6 }}>
                          {list.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-muted-foreground">No packets in this phase.</li>
                          ) : (
                            list.map((p: any) => {
                              if (p?.kind === 'section') {
                                return (
                                  <li
                                    key={p.id}
                                    className="px-1 pt-2 text-xs font-semibold text-muted-foreground"
                                    style={{ marginRight: 8 }}
                                  >
                                    {(p as any).name || 'Section'}
                                  </li>
                                )
                              }

                              return (
                                <li
                                  key={p.id}
                                  className={`flex items-center justify-between border rounded-[12px] cursor-pointer select-none transition-colors ${ovState.selectedId === p.id ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-300/60' : ''}`}
                                  style={{ padding: '4px 24px', marginRight: 8 }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    handlePacketMouseDown(p)
                                  }}
                                >
                                  <div className="flex min-w-0 flex-col">
                                    <div className="text-sm font-medium text-foreground truncate">{(p as any).name || p.id}</div>
                                  </div>
                                </li>
                              )
                            })
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="devices" className="mt-10">
              <ScrollArea className="h-[65vh] pr-2" role="list" aria-label="Devices list" data-loc="src/components/inspector/InspectorPanel.tsx:devices-list">
                <div className="space-y-4 p-1" style={{ paddingTop: 8 }}>
                  {['LAN', 'WAN'].map((zone) => (
                    <div key={zone}>
                      <div className="text-xs font-semibold text-muted-foreground px-1 mb-0" style={{ marginBottom: 0 }}>{zone}</div>
                      <ul className="list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px', marginTop: 6 }}>
                        {(
                          zone === 'LAN'
                            ? (isVpnRoom
                                ? ['Firewall', 'Router', 'Switch', 'Web Server']
                                : (isFirewallRoom
                                    ? ['Desktop', 'Switch', 'Router', 'Firewall']
                                    : (isHttpsRoom
                                        ? ['Client', 'Switch', 'Router', 'Firewall']
                                        : ['Desktop', 'Laptop', 'Switch', 'Router', 'Firewall'])))
                            : zone === 'WAN'
                              ? (isVpnRoom
                                  ? ['Remote User', 'Eavesdropper']
                                  : (isFirewallRoom
                                      ? ['Web Server', 'Attacker Desktop']
                                      : (isHttpsRoom
                                          ? ['Internet', 'Web Server', 'Attacker']
                                          : ['DNS', 'CDN', 'Web Server'])))
                              : []
                        ).map((label) => (
                          <li
                            key={`${zone}-${label}`}
                            className="flex items-center justify-between border rounded-[12px] cursor-pointer hover:bg-muted/40 transition-colors"
                            style={{ padding: '4px 24px' }}
                            onClick={() => setInfoDevice(prev => (prev === label ? null : label))}
                          >
                            <div className="text-sm font-medium text-foreground truncate">{label}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Phase Info dock - Modern design with proper typography */}
        {infoPhase && (
          <div
            ref={dockRef}
            role="dialog"
            aria-label="Phase info"
            style={{
              position: 'fixed',
              top: dockPos.top,
              left: dockPos.left,
              zIndex: 20000,
            }}
          >
            <div
              style={{
                width: DOCK_W,
                height: '94vh',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                overflow: 'hidden',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Header with gradient background */}
              <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '24px 24px 20px' }}>
                <div className="flex items-start justify-between">
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: 500, 
                      opacity: 0.9, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.5px',
                      marginBottom: '8px'
                    }}>
                      Phase Guide
                    </div>
                    <h2 style={{ 
                      fontSize: '28px', 
                      fontWeight: 700, 
                      lineHeight: '1.2',
                      margin: 0,
                      color: 'white'
                    }}>
                      {isFirewallRoom
                        ? (infoPhase === 'DNS' ? 'Traffic Analysis' : infoPhase === 'PKI' ? 'Rule Evaluation' : 'Enforced Outcome')
                        : isVpnRoom
                          ? (infoPhase === 'DNS' ? 'No VPN' : infoPhase === 'PKI' ? 'Secure Access via VPN' : 'Secure Access via VPN')
                          : (infoPhase === 'DNS' ? 'DNS Resolution' : infoPhase === 'PKI' ? 'TLS Handshake' : 'HTTPS Exchange')
                      }
                    </h2>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: 400, 
                      opacity: 0.95,
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      {isFirewallRoom
                        ? (infoPhase === 'DNS' ? 'Understand the traffic' : infoPhase === 'PKI' ? 'Decide with rules' : 'Allow or block')
                        : isVpnRoom
                          ? (infoPhase === 'DNS'
                              ? 'No tunnel: readable traffic on the Internet'
                              : infoPhase === 'PKI'
                                ? 'Encrypted tunnel: safe even if captured'
                                : 'Encrypted tunnel: safe even if captured')
                          : (infoPhase === 'DNS' ? 'Find the address' : infoPhase === 'PKI' ? 'Prove identity and agree keys' : 'Secure web request/response')
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close info"
                    onClick={() => setInfoPhase(null)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '8px',
                      border: 'none',
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.3)'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)'}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {infoPhase === 'DNS' ? (
                  isFirewallRoom ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                      {/* Overview */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '20px', 
                        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                        borderRadius: '12px',
                        border: '1px solid #bae6fd'
                      }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#0369a1', 
                          margin: '0 0 12px 0'
                        }}>What Traffic Analysis Does</h3>
                        <p style={{ margin: 0, fontSize: '15px' }}>
                          Before a firewall can allow or block traffic, it looks at key metadata like <strong>direction</strong> (LAN ↔ WAN),
                          <strong> protocol</strong> (TCP/UDP), and <strong>destination port</strong> (like 443 for HTTPS).
                        </p>
                      </div>

                      {/* Process */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>How It Works</h3>
                        <ol style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'decimal',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            Identify direction: <code style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }}>LAN → WAN</code>
                            (outbound) vs <code style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }}>WAN → LAN</code> (inbound)
                          </li>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            Determine protocol (<strong>TCP</strong> or <strong>UDP</strong>) and destination port (<strong>443</strong> for HTTPS, <strong>22</strong> for SSH, etc.)
                          </li>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            Use that metadata to decide which rules could apply
                          </li>
                        </ol>
                      </div>

                      {/* Visual cues */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Visual Indicators</h3>
                        <ul style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'disc',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Packet pauses at the firewall with an <strong>INSPECT</strong> label</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall ring scans while "inspecting" the traffic</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall Rules overlay shows the simulated traffic (zones, protocol, port)</li>
                        </ul>
                      </div>

                      {/* Importance */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '16px', 
                        background: '#fef3c7',
                        borderRadius: '8px',
                        borderLeft: '4px solid #f59e0b'
                      }}>
                        <h3 style={{ 
                          fontSize: '16px', 
                          fontWeight: 700, 
                          color: '#92400e', 
                          margin: '0 0 8px 0'
                        }}>Why It Matters</h3>
                        <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                          A rule that makes sense for outbound traffic may be unsafe inbound. Direction, protocol, and port are the foundation of a correct firewall policy.
                        </p>
                      </div>

                      {/* Glossary */}
                      <div>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Key Terms</h3>
                        <dl style={{ margin: 0, fontSize: '15px' }}>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Zone:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>A security boundary like LAN (internal) and WAN (internet)</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Protocol:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Transport type (TCP/UDP) used to deliver the traffic</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Port:</dt>
                          <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Service identifier like 443 (HTTPS) or 22 (SSH)</dd>
                        </dl>
                      </div>
                    </div>
                  ) : isVpnRoom ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                      {/* Overview */}
                      <div style={{
                        marginBottom: '24px',
                        padding: '20px',
                        background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
                        borderRadius: '12px',
                        border: '1px solid #fecdd3'
                      }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#9f1239',
                          margin: '0 0 12px 0'
                        }}>No VPN (Public Internet Traffic)</h3>
                        <p style={{ margin: 0, fontSize: '15px' }}>
                          In this phase, the remote user sends traffic across the public Internet without an encrypted tunnel.
                          A passive eavesdropper can <strong>capture</strong> that packet and read the metadata (and potentially the contents).
                        </p>
                      </div>

                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#111827',
                          margin: '0 0 12px 0'
                        }}>What You See in the Room</h3>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Packet travels: <strong>Remote User → Internet (Earth) → Firewall</strong></li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Eavesdropper reaches to Earth and pulls a copy</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Eavesdropper emits readable fields (SRC/DST/PROTO/PORT)</li>
                        </ul>
                      </div>

                      <div style={{
                        marginBottom: '24px',
                        padding: '16px',
                        background: '#fef3c7',
                        borderRadius: '8px',
                        borderLeft: '4px solid #f59e0b'
                      }}>
                        <h3 style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#92400e',
                          margin: '0 0 8px 0'
                        }}>Key Lesson</h3>
                        <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                          Traffic can be captured on the Internet. Without a VPN tunnel, it can be inspected.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                      borderRadius: '12px',
                      border: '1px solid #bae6fd'
                    }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#0369a1', 
                        margin: '0 0 12px 0'
                      }}>What DNS Does</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        DNS is the internet's phonebook. It converts human-readable domain names like <code style={{ 
                          background: '#e0f2fe', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '14px',
                          color: '#0369a1',
                          fontWeight: 500
                        }}>google.com</code> into IP addresses that computers can understand.
                      </p>
                    </div>

                    {/* Process */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>How It Works</h3>
                      <ol style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'decimal',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          Your laptop queries a DNS resolver: <em>"What's the IP for google.com?"</em>
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          The firewall translates your private IP to a public one (NAT)
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          DNS resolver responds with the IP address and a TTL (cache timer)
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          Your laptop caches the result for future requests
                        </li>
                      </ol>
                    </div>

                    {/* Visual cues */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Visual Indicators</h3>
                      <ul style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'disc',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🟡 DNS packets travel back and forth</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Address translation at the firewall</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>⏱️ TTL cache timer appears on your device</li>
                      </ul>
                    </div>

                    {/* Importance */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: '#fef3c7',
                      borderRadius: '8px',
                      borderLeft: '4px solid #f59e0b'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#92400e', 
                        margin: '0 0 8px 0'
                      }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        No DNS resolution = no connection possible. Caching speeds up repeat visits significantly.
                      </p>
                    </div>

                    {/* Glossary */}
                    <div>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Key Terms</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>IP Address:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>A unique numerical identifier for devices on the internet</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>TTL (Time To Live):</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>How long to cache the DNS result before asking again</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>NAT (Network Address Translation):</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Firewall feature that maps private IPs to public ones</dd>
                      </dl>
                    </div>
                  </div>
                  )
                ) : infoPhase === 'PKI' ? (
                  isFirewallRoom ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                      {/* Overview */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '20px', 
                        background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
                        borderRadius: '12px',
                        border: '1px solid #e9d5ff'
                      }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#7c3aed', 
                          margin: '0 0 12px 0'
                        }}>How Rule Evaluation Works</h3>
                        <p style={{ margin: 0, fontSize: '15px' }}>
                          After traffic is identified, the firewall compares it to your rule list. Each rule checks <strong>source zone</strong>,
                          <strong> destination zone</strong>, <strong>protocol</strong>, and <strong>port</strong>.
                        </p>
                      </div>

                      {/* Process */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>How the Decision Is Chosen</h3>
                        <ol style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'decimal',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            Start at Rule 1 and compare its fields to the traffic
                          </li>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            The <strong>first matching rule</strong> determines the action (<strong>ALLOW</strong> or <strong>DENY</strong>)
                          </li>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            If nothing matches, the firewall uses a safe default: <strong>DENY</strong>
                          </li>
                        </ol>
                      </div>

                      {/* Visual cues */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Visual Indicators</h3>
                        <ul style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'disc',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall Rules overlay shows <strong>Matched Rule #</strong> or <strong>Default (no match)</strong></li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Changing rule order/fields changes which rule matches</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Attack simulation uses a fixed example: <strong>WAN → LAN TCP/22</strong></li>
                        </ul>
                      </div>

                      {/* Importance */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '16px', 
                        background: '#fee2e2',
                        borderRadius: '8px',
                        borderLeft: '4px solid #ef4444'
                      }}>
                        <h3 style={{ 
                          fontSize: '16px', 
                          fontWeight: 700, 
                          color: '#991b1b', 
                          margin: '0 0 8px 0'
                        }}>Why It Matters</h3>
                        <p style={{ margin: 0, color: '#991b1b', fontSize: '15px' }}>
                          A single overly-broad <strong>ALLOW</strong> rule can expose internal services. Keep rules specific and review their order.
                        </p>
                      </div>

                      {/* Glossary */}
                      <div>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Key Terms</h3>
                        <dl style={{ margin: 0, fontSize: '15px' }}>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Rule:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>A condition (zones/protocol/port) plus an action (ALLOW/DENY)</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Match:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Traffic fields equal the rule fields</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Default deny:</dt>
                          <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>If no rules match, the firewall blocks the traffic</dd>
                        </dl>
                      </div>
                    </div>
                  ) : isVpnRoom ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                      {/* Overview */}
                      <div style={{
                        marginBottom: '24px',
                        padding: '20px',
                        background: 'linear-gradient(135deg, #ecfeff 0%, #dcfce7 100%)',
                        borderRadius: '12px',
                        border: '1px solid #bbf7d0'
                      }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#166534',
                          margin: '0 0 12px 0'
                        }}>Secure Access via VPN</h3>
                        <p style={{ margin: 0, fontSize: '15px' }}>
                          In this phase, traffic travels inside an <strong>encrypted VPN tunnel</strong>. An eavesdropper can still capture the packet on the Internet,
                          but it will only see <strong>ciphertext</strong> ("Encrypted").
                        </p>
                      </div>

                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#111827',
                          margin: '0 0 12px 0'
                        }}>What You See in the Room</h3>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>VPN tunnel effect appears between <strong>Remote User → Earth → Firewall</strong></li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall allows <strong>VPN → LAN</strong> traffic</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Eavesdropper still captures a copy, but emits <strong>Encrypted</strong></li>
                        </ul>
                      </div>

                      <div style={{
                        marginBottom: '24px',
                        padding: '16px',
                        background: '#dcfce7',
                        borderRadius: '8px',
                        borderLeft: '4px solid #22c55e'
                      }}>
                        <h3 style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#166534',
                          margin: '0 0 8px 0'
                        }}>Key Lesson</h3>
                        <p style={{ margin: 0, color: '#166534', fontSize: '15px' }}>
                          Encryption protects data in transit: stolen packets are not readable.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
                      borderRadius: '12px',
                      border: '1px solid #e9d5ff'
                    }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#7c3aed', 
                        margin: '0 0 12px 0'
                      }}>What TLS Does</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        TLS (Transport Layer Security) creates an encrypted tunnel between your device and a server. It proves the server's identity and establishes secret keys so no one can eavesdrop on your data.
                      </p>
                    </div>

                    {/* Process */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>How It Works</h3>
                      <ol style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'decimal',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>ClientHello:</strong> Your laptop announces supported encryption methods and TLS version
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>ServerHello + Certificate:</strong> Server picks encryption settings and sends its certificate (proves identity)
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Certificate Validation:</strong> Your laptop verifies the certificate chain against trusted authorities
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Key Exchange:</strong> Both sides agree on session keys using public/private key cryptography
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Finished Messages:</strong> Both confirm the handshake worked—encrypted channel is ready
                        </li>
                      </ol>
                    </div>

                    {/* Visual cues */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Visual Indicators</h3>
                      <ul style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'disc',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔵 Purple/blue envelope packets travel through network</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Packets move: Desktop → Switch → Router → Firewall → Server → back</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📊 Topology map highlights active path in blue</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔐 Encrypted field shows "Yes" after ServerHello (step 5+)</li>
                      </ul>
                    </div>

                    {/* Importance */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: '#fee2e2',
                      borderRadius: '8px',
                      borderLeft: '4px solid #ef4444'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#991b1b', 
                        margin: '0 0 8px 0'
                      }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#991b1b', fontSize: '15px' }}>
                        Without TLS, anyone between you and the server could read your passwords, credit cards, or private messages. TLS also prevents imposters from pretending to be legitimate websites.
                      </p>
                    </div>

                    {/* Common Issues */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#1e40af', 
                        margin: '0 0 8px 0'
                      }}>Common Issues</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1e40af' }}>
                        <li style={{ marginBottom: '4px' }}>❌ Expired certificate → Browser warning</li>
                        <li style={{ marginBottom: '4px' }}>❌ Self-signed certificate → Not trusted by default</li>
                        <li style={{ marginBottom: '4px' }}>❌ Wrong hostname → Certificate mismatch error</li>
                      </ul>
                    </div>

                    {/* Glossary */}
                    <div>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Key Terms</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Certificate:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Digital ID card that proves a server is who it claims to be</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Certificate Authority (CA):</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Trusted organization that signs certificates (like VeriSign, Let's Encrypt)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Cipher Suite:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>The encryption algorithm both sides agree to use (e.g., AES-128-GCM)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Session Keys:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Temporary secret keys used only for this connection</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>SNI (Server Name Indication):</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Tells the server which website you want (for shared hosting)</dd>
                      </dl>
                    </div>
                  </div>
                  )
                ) : infoPhase === 'HTTPS' ? (
                  isFirewallRoom ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                      {/* Overview */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '20px', 
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                        borderRadius: '12px',
                        border: '1px solid #bbf7d0'
                      }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#15803d', 
                          margin: '0 0 12px 0'
                        }}>Enforced Outcome</h3>
                        <p style={{ margin: 0, fontSize: '15px' }}>
                          The firewall now <strong>enforces</strong> the rule decision. If traffic is allowed, the packet continues.
                          If traffic is denied, it is dropped at the firewall.
                        </p>
                      </div>

                      {/* Process */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>What Happens Next</h3>
                        <ul style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'disc',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            <strong>ALLOW:</strong> packet moves on to the router/switch and reaches the destination device
                          </li>
                          <li style={{ marginBottom: '8px', color: '#374151' }}>
                            <strong>DENY:</strong> packet stops at the firewall and never reaches the LAN
                          </li>
                        </ul>
                      </div>

                      {/* Visual cues */}
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Visual Indicators</h3>
                        <ul style={{ 
                          margin: '0', 
                          paddingLeft: '20px', 
                          listStyleType: 'disc',
                          fontSize: '15px'
                        }}>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall ring turns <strong>green</strong> for allowed traffic</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>Firewall ring turns <strong>red</strong> when traffic is blocked</li>
                          <li style={{ marginBottom: '6px', color: '#374151' }}>In the attack demo, an ALLOW on <strong>WAN → LAN TCP/22</strong> can lead to a compromise</li>
                        </ul>
                      </div>

                      {/* Importance */}
                      <div style={{ 
                        marginBottom: '24px', 
                        padding: '16px', 
                        background: '#fef3c7',
                        borderRadius: '8px',
                        borderLeft: '4px solid #f59e0b'
                      }}>
                        <h3 style={{ 
                          fontSize: '16px', 
                          fontWeight: 700, 
                          color: '#92400e', 
                          margin: '0 0 8px 0'
                        }}>Why It Matters</h3>
                        <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                          Firewalls enforce your security policy at the boundary. Allow only what you need—especially inbound services from WAN.
                        </p>
                      </div>

                      {/* Glossary */}
                      <div>
                        <h3 style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          color: '#111827', 
                          margin: '0 0 12px 0'
                        }}>Key Terms</h3>
                        <dl style={{ margin: 0, fontSize: '15px' }}>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>ALLOW:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Permit the traffic to pass through the firewall</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>DENY / Drop:</dt>
                          <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Block the traffic so it cannot reach the destination</dd>
                          <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Least privilege:</dt>
                          <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Only allow what is required; deny everything else</dd>
                        </dl>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                      borderRadius: '12px',
                      border: '1px solid #bbf7d0'
                    }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#15803d', 
                        margin: '0 0 12px 0'
                      }}>What HTTPS Does</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        HTTPS (HTTP Secure) is the encrypted version of HTTP. It uses the TLS tunnel established in the previous phase to send web requests and receive responses. All data—URLs, headers, cookies, and content—stays private on the wire.
                      </p>
                    </div>

                    {/* Process */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>How It Works</h3>
                      <ol style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'decimal',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>HTTP Request:</strong> Browser sends <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }}>GET /</code> through the TLS tunnel
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Network Transit:</strong> Encrypted packet travels through Switch → Router → Firewall → Server
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Server Processing:</strong> Server decrypts the request, processes it, and prepares the response
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>HTTP Response:</strong> Server sends back <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }}>200 OK</code> with HTML content (encrypted)
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Return Path:</strong> Response travels back through the same network path
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Browser Renders:</strong> Your laptop decrypts the HTML and displays the webpage
                        </li>
                      </ol>
                    </div>

                    {/* Visual cues */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Visual Indicators</h3>
                      <ul style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'disc',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Green envelope packets move through the network</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Full round-trip: Desktop → Server → Desktop</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📊 Topology map shows active communication path</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔒 All packets show "Encrypted: Yes" (TLS protecting data)</li>
                      </ul>
                    </div>

                    {/* Importance */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: '#fef3c7',
                      borderRadius: '8px',
                      borderLeft: '4px solid #f59e0b'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#92400e', 
                        margin: '0 0 8px 0'
                      }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        HTTPS is what you use every day—shopping, banking, social media, email. Without it, every website visit would be like shouting your private information in a public space. Modern browsers warn users when sites use plain HTTP.
                      </p>
                    </div>

                    {/* HTTP/2 Features */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)',
                      borderRadius: '8px',
                      border: '1px solid #fde047'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#713f12', 
                        margin: '0 0 8px 0'
                      }}>Modern Enhancement: HTTP/2</h3>
                      <p style={{ margin: 0, fontSize: '14px', color: '#713f12' }}>
                        HTTP/2 (negotiated via ALPN in TLS handshake) allows multiple requests over one connection, compressed headers, and server push. This makes pages load faster while staying fully encrypted.
                      </p>
                    </div>

                    {/* Glossary */}
                    <div>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Key Terms</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>HTTP:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Hypertext Transfer Protocol, the language browsers and servers use to communicate</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Status Code:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Server's response code (200 = OK, 404 = Not Found, 500 = Server Error)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Headers:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Metadata sent with requests/responses (cookies, content-type, encoding, etc.)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Content Encoding:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Compression method (br = Brotli, gzip) to reduce transfer size</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>ALPN:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Application-Layer Protocol Negotiation, tells server to use HTTP/2 or HTTP/3</dd>
                      </dl>
                    </div>
                  </div>
                  )
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px 20px',
                    color: '#6b7280',
                    fontSize: '16px'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Content Coming Soon</div>
                    <div>Detailed guide for this phase is being prepared.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Device Info dock */}
        {infoDevice && (
          <div
            ref={dockRef}
            role="dialog"
            aria-label="Device info"
            style={{
              position: 'fixed',
              top: dockPos.top,
              left: dockPos.left,
              zIndex: 20000,
            }}
          >
            <div
              style={{
                width: DOCK_W,
                height: '94vh',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                overflow: 'hidden',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Header with gradient background */}
              <div style={{ background: 
                infoDevice === 'Desktop' || infoDevice === 'Laptop' || infoDevice === 'Remote User' || infoDevice === 'Eavesdropper' || infoDevice === 'Client' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                infoDevice === 'Switch' ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' :
                infoDevice === 'Router' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                infoDevice === 'Firewall' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' :
                infoDevice === 'DNS' ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' :
                infoDevice === 'CDN' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' :
                infoDevice === 'Web Server' ? 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' :
                infoDevice === 'Internet' ? 'linear-gradient(135deg, #64748b 0%, #334155 100%)' :
                infoDevice === 'Attacker Desktop' || infoDevice === 'Attacker' ? 'linear-gradient(135deg, #111827 0%, #374151 100%)' :
                'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                color: 'white', padding: '24px 24px 20px' }}>
                <div className="flex items-start justify-between">
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: 500, 
                      opacity: 0.9, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.5px',
                      marginBottom: '8px'
                    }}>
                      Device Guide
                    </div>
                    <h2 style={{ 
                      fontSize: '28px', 
                      fontWeight: 700, 
                      lineHeight: '1.2',
                      margin: 0,
                      color: 'white'
                    }}>
                      {infoDevice}
                    </h2>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: 400, 
                      opacity: 0.95,
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      {infoDevice === 'Desktop' ? 'End-user workstation' : 
                       infoDevice === 'Client' ? 'End-user workstation (Client)' :
                       infoDevice === 'Remote User' ? 'Remote workforce endpoint (WAN)' :
                       infoDevice === 'Eavesdropper' ? 'Passive traffic observer (WAN)' :
                       infoDevice === 'Attacker Desktop' ? 'Threat actor workstation' :
                       infoDevice === 'Attacker' ? 'Threat actor (eavesdropping)' :
                       infoDevice === 'Laptop' ? 'Portable end-user device' :
                       infoDevice === 'Switch' ? 'Layer 2 forwarding device' :
                       infoDevice === 'Router' ? 'Layer 3 routing device' :
                       infoDevice === 'Firewall' ? 'Security and NAT device' :
                       infoDevice === 'DNS' ? 'Name resolution server' :
                       infoDevice === 'CDN' ? 'Content delivery edge server' :
                       infoDevice === 'Internet' ? 'Public network path (WAN)' :
                       infoDevice === 'Web Server' ? 'Origin web application server' : 'Network device'}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close info"
                    onClick={() => setInfoDevice(null)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '8px',
                      border: 'none',
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.3)'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)'}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {infoDevice === 'Remote User' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fcd34d'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#92400e', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        This is the remote employee’s device on the public Internet (WAN). It initiates the connection to your organization.
                        With VPN <strong>OFF</strong>, traffic is exposed to eavesdropping on the Internet. With VPN <strong>ON</strong>, it builds an encrypted tunnel to the firewall.
                      </p>
                      {isVpnRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#92400e' }}>
                          <div><strong>WAN IP:</strong> {vpnAddrs?.remoteWanIp || '203.0.113.25'}</div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in the VPN Room</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Generates requests:</strong> Attempts to reach the internal web server</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Authenticates to VPN:</strong> Establishes a secure tunnel before access is granted</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Shows the risk:</strong> Without a tunnel, metadata can be captured on the Internet</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#dbeafe', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        Remote users often work from untrusted networks. VPNs reduce what eavesdroppers can learn by encrypting traffic in transit.
                      </p>
                    </div>
                  </div>
                ) : infoDevice === 'Eavesdropper' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fca5a5'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#991b1b', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A passive observer on the public Internet (WAN). It can <strong>capture</strong> packets that traverse the Internet, but it does not block or modify the real flow.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>What It Can and Can’t Do</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Can:</strong> record metadata (src/dst/protocol/port) and attempt to infer activity</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Can (no VPN):</strong> potentially read application data if it’s not protected</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Can’t (VPN on):</strong> read the content inside the encrypted tunnel</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Key Lesson</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        VPNs don’t stop capture on the Internet—but they change what can be learned: the payload becomes unreadable.
                      </p>
                    </div>
                  </div>
                ) : infoDevice === 'Attacker' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
                      borderRadius: '12px',
                      border: '1px solid #374151',
                      color: '#e5e7eb'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f9fafb', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        The attacker is a threat actor workstation on the WAN that tries to <strong>eavesdrop</strong> (sniff/capture) traffic as it crosses the Internet.
                      </p>
                      {isHttpsRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#e5e7eb' }}>
                          <div><strong>WAN IP:</strong> {httpsAddrs?.attackerIp || '198.51.100.66'}</div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>What It Can and Can’t Read</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>HTTP phase (TCP/80):</strong> attacker can read HTTP headers and content (plaintext)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>HTTPS phase (TCP/443):</strong> attacker can capture packets but sees <strong>encrypted application data</strong> (ciphertext)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Always visible:</strong> metadata like src/dst IP, protocol, port, timing, packet sizes</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Key Lesson</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        HTTPS doesn’t prevent capture on the Internet—but it prevents understanding the content.
                      </p>
                    </div>
                  </div>
                ) : infoDevice === 'Internet' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#334155', margin: '0 0 12px 0' }}>What It Represents</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        The public Internet (WAN). This is the untrusted network path between your local network and the web server.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Why It Matters</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Untrusted path:</strong> you don’t control who can observe traffic</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Where eavesdropping happens:</strong> attackers can capture packets here</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Encryption helps:</strong> HTTPS protects application data crossing this path</li>
                      </ul>
                    </div>
                  </div>
                ) : infoDevice === 'Client' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fcd34d'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#92400e', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        The client is the user’s computer (browser). It initiates the HTTP request, performs the TLS handshake, then sends HTTPS requests over the encrypted channel.
                      </p>
                      {isHttpsRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#92400e' }}>
                          <div><strong>LAN IP:</strong> {httpsAddrs?.desktopIp || '192.168.10.30'}</div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in the HTTPS Room</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>HTTP phase:</strong> sends readable (plaintext) web requests on TCP/80</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>TLS phase:</strong> validates server identity (certificate) and establishes encryption keys</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>HTTPS phase:</strong> sends encrypted application data on TCP/443</li>
                      </ul>
                    </div>
                  </div>
                ) : infoDevice === 'Desktop' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fcd34d'
                    }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#92400e', 
                        margin: '0 0 12px 0'
                      }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A desktop computer is an end-user device that initiates network requests and runs applications. It's typically where users browse the web, send emails, and access network resources.
                      </p>
                    </div>

                    {/* Role */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Role in Network</h3>
                      <ul style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'disc',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Initiates requests:</strong> DNS queries, HTTP requests, file transfers
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Runs applications:</strong> Web browser, email client, productivity software
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Contains network stack:</strong> Operating system handles protocol layers
                        </li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}>
                          <strong>Connects via NIC:</strong> Network Interface Card links to the switch
                        </li>
                      </ul>
                    </div>

                    {/* Visual cues */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Visual Indicators</h3>
                      <ul style={{ 
                        margin: '0', 
                        paddingLeft: '20px', 
                        listStyleType: 'disc',
                        fontSize: '15px'
                      }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🖥️ Desktop model positioned in LAN zone</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📡 Network line connects to Switch</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Packets originate here during outbound traffic</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>💾 Receives responses from servers</li>
                      </ul>
                    </div>

                    {/* Importance */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '16px', 
                      background: '#dbeafe',
                      borderRadius: '8px',
                      borderLeft: '4px solid #3b82f6'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: '#1e40af', 
                        margin: '0 0 8px 0'
                      }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        The desktop is where users interact with the network. Understanding its role helps you see how user actions (clicking a link, opening an app) trigger the network traffic you observe.
                      </p>
                    </div>

                    {/* Key Components */}
                    <div>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#111827', 
                        margin: '0 0 12px 0'
                      }}>Key Components</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Network Interface Card (NIC):</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Hardware that physically connects the computer to the network</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>IP Address:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Logical identifier on the network (e.g., 192.168.1.10)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>MAC Address:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Physical hardware address burned into the NIC</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Network Stack:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Software layers in the OS that handle protocols (TCP/IP, DNS, etc.)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Default Gateway:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Router IP address that routes traffic outside the local network</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Attacker Desktop' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{
                      marginBottom: '24px',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fca5a5'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#991b1b', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        This represents an attacker-controlled machine on the public internet (WAN). In the attack simulation it attempts to reach your LAN desktop over <strong>TCP/22 (SSH)</strong>.
                      </p>
                      {isFirewallRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#7f1d1d' }}>
                          <div><strong>WAN IP:</strong> {fwAddrs?.attackerIp || '198.51.100.66'}</div>
                          <div style={{ marginTop: 4 }}><strong>Target:</strong> {fwAddrs?.firewallWanIp || '203.0.113.1'}:22</div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Attack Simulation</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Generates inbound traffic:</strong> WAN → LAN requests that should usually be blocked</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Targets exposed services:</strong> Attempts SSH (port 22) on a public IP</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Validates firewall rules:</strong> Demonstrates what happens if an unsafe inbound ALLOW exists</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🟥 Attack packets originate here and travel toward the firewall</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>⏸️ Packet pauses at the firewall during <strong>INSPECT ATTACK</strong></li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>✅ If allowed, the packet continues into the LAN and reaches the desktop</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fee2e2', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#991b1b', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#991b1b', fontSize: '15px' }}>
                        Inbound access from WAN to internal services is a common compromise path. A single port-forward rule (DNAT) can expose a LAN machine to the internet.
                      </p>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Terms</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Port scanning:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Checking which ports/services are reachable on a target</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Brute force:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Repeated login attempts to guess credentials</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>DNAT / Port-forward:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Translating a public destination (WAN IP:port) to an internal LAN host</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Laptop' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fcd34d'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#92400e', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A laptop is a portable computer that functions identically to a desktop from a network perspective. It initiates requests, runs applications, and connects via Wi-Fi or Ethernet.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Initiates requests:</strong> DNS lookups, web browsing, email, file downloads</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Mobile connectivity:</strong> Often connects via Wi-Fi instead of wired Ethernet</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Same network stack:</strong> OS handles TCP/IP, DNS, TLS just like desktop</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Dynamic IP:</strong> Usually gets IP via DHCP when connecting to networks</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>💻 Laptop model in LAN zone</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📡 Network connection to Switch</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Packets originate during outbound traffic</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Receives server responses</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#dbeafe', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        Laptops are the most common device type today. They move between networks (home, office, café), making them great for understanding DHCP, roaming, and network configuration.
                      </p>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Components</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Wi-Fi Adapter / NIC:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Wireless or wired network interface</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>DHCP Client:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Automatically requests IP configuration when joining a network</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Battery & Mobility:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Can disconnect/reconnect, triggering DHCP renewal</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Same Protocols:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>HTTP, DNS, TLS work identically to desktop</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Switch' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)',
                      borderRadius: '12px',
                      border: '1px solid #67e8f9'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0e7490', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A network switch operates at Layer 2 (Data Link). It forwards Ethernet frames between devices on the same local network based on MAC addresses, not IP addresses.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Forwards frames:</strong> Looks at destination MAC address, sends to correct port</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Learns topology:</strong> Builds MAC address table by observing source addresses</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>No IP inspection:</strong> Doesn’t look at IP addresses—purely Layer 2</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Local only:</strong> Connects devices within same network segment (LAN)</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔀 Switch model with multiple connection lines</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Packets pass through but aren’t modified</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>⚡ Fast forwarding—minimal delay</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔗 Central hub connecting Desktop, Laptop, Router</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        The switch is your LAN backbone. It's transparent—packets flow through without IP changes. Understanding this helps you see the difference between Layer 2 (switching) and Layer 3 (routing).
                      </p>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>MAC Address Table:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Maps MAC addresses to physical switch ports</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Frame Forwarding:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Receives frame on one port, sends out another</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Broadcast:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Sends broadcast frames (FF:FF:FF:FF:FF:FF) to all ports</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Layer 2 Only:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Doesn’t understand IP, DNS, or HTTP—just Ethernet frames</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Router' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                      borderRadius: '12px',
                      border: '1px solid #6ee7b7'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#065f46', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A router operates at Layer 3 (Network) and forwards packets between different networks based on IP addresses. It’s the gateway between your LAN and the internet (WAN).
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Routes packets:</strong> Decides next hop based on destination IP and routing table</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Connects networks:</strong> Bridges your local LAN to the WAN (internet)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Decrements TTL:</strong> Reduces IP Time-To-Live by 1 on each hop</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Default gateway:</strong> Devices send all non-local traffic here</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🌐 Router positioned between LAN and Firewall</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Packets flow through in both directions</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📊 TTL counter decrements as packets pass</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🎯 Routing decisions based on destination IP</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#dbeafe', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        Routers make the internet possible. They determine the path packets take from your network to servers worldwide. Understanding routers helps you see how traffic leaves your LAN.
                      </p>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Routing Table:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Database of network destinations and next hops</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Default Route:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Where to send packets for unknown destinations (0.0.0.0/0)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>TTL Decrement:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Prevents routing loops by limiting packet lifetime</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Inter-network:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Connects different IP subnets (e.g., 192.168.1.0/24 ↔ WAN)</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Firewall' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fca5a5'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#991b1b', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A firewall is a security device that inspects and filters traffic based on rules. It typically performs NAT (Network Address Translation), converting private IPs to public IPs for internet access.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Filters traffic:</strong> Allows or blocks based on IP, port, protocol, application</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>NAT:</strong> Rewrites private IPs (192.168.x.x) to public IP for internet access</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Stateful inspection:</strong> Tracks connections, allows return traffic automatically</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Security boundary:</strong> Sits between trusted LAN and untrusted WAN</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔥 Firewall positioned between Router and WAN</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 NAT translation happens here (IP/port changes)</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🛡️ Security checkpoint for all traffic</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📋 Session tracking for connections</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        The firewall is your network’s security guard. It hides internal IP addresses (NAT) and blocks malicious traffic. Watch how source IPs change from private to public as packets exit.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Common NAT Types</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1e40af' }}>
                        <li style={{ marginBottom: '4px' }}>SNAT/PAT: Source IP/port translation (outbound)</li>
                        <li style={{ marginBottom: '4px' }}>De-NAT: Maps return traffic back to internal IP</li>
                        <li style={{ marginBottom: '4px' }}>Port forwarding: Allows specific inbound connections</li>
                      </ul>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>NAT (SNAT/PAT):</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Translates source IP:port for outbound traffic</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Stateful Firewall:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Remembers outbound connections, allows related return traffic</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Access Control:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Rules define allowed traffic (block port 445, allow 443)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Inside → Outside:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>LAN traffic usually allowed; WAN → LAN blocked by default</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'DNS' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                      borderRadius: '12px',
                      border: '1px solid #d8b4fe'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#6b21a8', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A DNS (Domain Name System) server translates human-readable domain names like google.com into IP addresses that computers use to communicate. It's often called the "phonebook of the internet."
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Resolves names:</strong> Converts domain names to IP addresses (A records)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Caching:</strong> Stores recent lookups to speed up repeated queries</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Recursive resolution:</strong> Queries other DNS servers if it doesn’t have the answer</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Returns TTL:</strong> Tells clients how long to cache the result</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🌐 DNS server in WAN zone (public internet)</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Receives query packets from your network</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Sends response packets with IP addresses</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>⏱️ TTL values control caching duration</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#dbeafe', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        DNS is essential—without it, you’d need to memorize IP addresses for every website. DNS resolution is the first step in almost every internet connection.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Common DNS Records</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#92400e' }}>
                        <li style={{ marginBottom: '4px' }}>A: Maps domain to IPv4 address (most common)</li>
                        <li style={{ marginBottom: '4px' }}>AAAA: Maps domain to IPv6 address</li>
                        <li style={{ marginBottom: '4px' }}>CNAME: Alias pointing to another domain</li>
                        <li style={{ marginBottom: '4px' }}>MX: Mail server for email delivery</li>
                      </ul>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Query:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Request from client asking "What's the IP for this domain?"</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Response:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Answer containing the IP address and TTL</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>TTL (Time To Live):</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>How many seconds to cache the result before asking again</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Recursive Resolver:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>DNS server that does all the work to find the answer (e.g., 8.8.8.8)</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'CDN' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
                      borderRadius: '12px',
                      border: '1px solid #f9a8d4'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#9f1239', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        A CDN (Content Delivery Network) Edge server is a geographically distributed caching server that stores copies of web content close to users. It reduces latency and offloads traffic from origin servers.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Caches content:</strong> Stores static assets (images, CSS, JS) and sometimes dynamic content</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Reduces latency:</strong> Serves content from nearest geographical location to users</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Proxies requests:</strong> Forwards cache misses to origin server (Web Server)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>TLS termination:</strong> Handles SSL/TLS encryption and decryption</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>DDoS protection:</strong> Absorbs malicious traffic before it reaches origin</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🌍 CDN Edge positioned in WAN / internet zone</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>⚡ First point of contact for HTTPS requests</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 May forward to Web Server on cache miss</li>
                        <li style={{ marginBottom: '6px', color: '#374151' }}>📦 Returns cached responses directly when available</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>
                        CDN Edge servers dramatically improve website performance by serving content from locations closer to users. They also protect origin servers from high traffic volumes and attacks.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Cache Behavior</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1e40af' }}>
                        <li style={{ marginBottom: '4px' }}>Cache Hit: Content served directly from CDN (fast)</li>
                        <li style={{ marginBottom: '4px' }}>Cache Miss: CDN fetches from origin, caches it, then serves</li>
                        <li style={{ marginBottom: '4px' }}>Cache-Control headers: Determine caching duration</li>
                      </ul>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Edge Server:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Server deployed in many locations worldwide for low latency</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Cache Miss:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>When requested content is not in cache, must fetch from origin</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Origin Shield:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Additional caching layer between edge and origin server</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>POP (Point of Presence):</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Physical location where CDN servers are deployed</dd>
                      </dl>
                    </div>
                  </div>
                ) : infoDevice === 'Web Server' ? (
                  <div style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                    {/* Overview */}
                    <div style={{ 
                      marginBottom: '24px', 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
                      borderRadius: '12px',
                      border: '1px solid #5eead4'
                    }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#115e59', margin: '0 0 12px 0' }}>What It Is</h3>
                      <p style={{ margin: 0, fontSize: '15px' }}>
                        {isVpnRoom
                          ? 'A protected internal web application server on the LAN. In the VPN room, this resource should only be reachable after the remote user connects via VPN.'
                          : 'A Web Server is the destination system that accepts web traffic and returns responses. In this experience, it represents a public HTTPS service on the WAN.'}
                      </p>
                      {isFirewallRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#0f766e' }}>
                          <div><strong>WAN IP:</strong> {fwAddrs?.webIp || '198.51.100.10'}</div>
                          <div style={{ marginTop: 4 }}><strong>Service:</strong> HTTPS (TCP/443)</div>
                        </div>
                      ) : isVpnRoom ? (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#0f766e' }}>
                          <div><strong>LAN IP:</strong> {vpnAddrs?.lanServerIp || '192.168.10.50'}</div>
                          <div style={{ marginTop: 4 }}><strong>Service:</strong> HTTPS (TCP/443)</div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Role in Network</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Serves origin content:</strong> Primary source of all website content and data</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Processes requests:</strong> Executes application code (PHP, Node.js, Python, etc.)</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Database queries:</strong> Fetches dynamic data from databases</li>
                        <li style={{ marginBottom: '8px', color: '#374151' }}><strong>API endpoints:</strong> Provides REST/GraphQL APIs for client applications</li>
                        {isFirewallRoom ? (
                          <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Public HTTPS service:</strong> Listens on TCP/443 and replies to clients on the internet</li>
                        ) : isVpnRoom ? (
                          <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Protected internal service:</strong> Reachable from the VPN zone, not directly from WAN</li>
                        ) : (
                          <li style={{ marginBottom: '8px', color: '#374151' }}><strong>Behind CDN:</strong> Protected and offloaded by CDN Edge servers</li>
                        )}
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Visual Indicators</h3>
                      <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc', fontSize: '15px' }}>
                        {isFirewallRoom ? (
                          <>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🌐 Web Server lives on the WAN (public internet)</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔒 Offers HTTPS on <strong>TCP/443</strong></li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Replies return to the firewall’s public IP (tracked by state/NAT)</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🧾 Server sees the client as the firewall’s public address (because of SNAT)</li>
                          </>
                        ) : isVpnRoom ? (
                          <>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🏢 Web Server lives on the LAN (private network)</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔒 Offers HTTPS on <strong>TCP/443</strong> to VPN users</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔀 Receives traffic via Switch/Router after the firewall allows VPN → LAN</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🛡️ Not reachable directly from the public Internet in the “No VPN” phase</li>
                          </>
                        ) : (
                          <>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🖥️ Web Server positioned behind CDN Edge</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔄 Receives requests forwarded from CDN (cache misses)</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>💾 Generates and returns content to CDN</li>
                            <li style={{ marginBottom: '6px', color: '#374151' }}>🔧 Handles dynamic content and database operations</li>
                          </>
                        )}
                      </ul>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: '#dbeafe', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', margin: '0 0 8px 0' }}>Why It Matters</h3>
                      <p style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>
                        {isFirewallRoom
                          ? 'This is the public destination for the HTTPS flow. It replies back through the same path, and the firewall maps return traffic back to the LAN desktop using state/NAT.'
                          : isVpnRoom
                            ? 'This is the protected resource the remote user is trying to reach. Access is granted only after the VPN tunnel is established and the firewall allows VPN → LAN traffic.'
                            : 'The Web Server is the brain of your website. While CDN Edge servers improve performance, the origin server does the actual work—running application logic, accessing databases, and generating personalized content.'}
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px', padding: '16px', background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: '0 0 8px 0' }}>Common Web Servers</h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#92400e' }}>
                        <li style={{ marginBottom: '4px' }}>Apache HTTP Server: Popular open-source server</li>
                        <li style={{ marginBottom: '4px' }}>NGINX: High-performance server, also used as reverse proxy</li>
                        <li style={{ marginBottom: '4px' }}>Node.js: JavaScript runtime for building web apps</li>
                        <li style={{ marginBottom: '4px' }}>IIS: Microsoft's web server for Windows environments</li>
                      </ul>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>Key Concepts</h3>
                      <dl style={{ margin: 0, fontSize: '15px' }}>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Origin Server:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>
                          {isFirewallRoom ? 'Public server that responds to HTTPS clients on the internet' : 'Authoritative source for content, behind CDN'}
                        </dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Dynamic Content:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Content generated per-request (user profiles, search results)</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Static Content:</dt>
                        <dd style={{ margin: '0 0 12px 0', color: '#6b7280' }}>Files that don't change (images, CSS, JS)—best cached by CDN</dd>
                        <dt style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Backend Services:</dt>
                        <dd style={{ margin: '0 0 0 0', color: '#6b7280' }}>Databases, authentication, payment processing, etc.</dd>
                      </dl>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px 20px',
                    color: '#6b7280',
                    fontSize: '16px'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Content Coming Soon</div>
                    <div>Detailed guide for this device is being prepared.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  )
}
