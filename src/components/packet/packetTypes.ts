export type PacketTypeCategory = 'Application Layer' | 'Transport Layer' | 'Network Layer'

export const PACKET_TYPE_GROUPS: Record<PacketTypeCategory, { emoji: string; items: string[] }> = {
  'Application Layer': {
    emoji: '🌐',
    items: [
      'HTTP_REQUEST',
      'HTTP_RESPONSE',
      'DNS_QUERY',
      'DNS_RESPONSE',
      'TLS_CLIENT_HELLO',
      'TLS_SERVER_HELLO',
      'TLS_CERT',
      'SMTP_MAIL',
      'FTP_COMMAND',
      'SSH_HANDSHAKE',
      'PKI_CERT_REQUEST',
      'PKI_CERT_RESPONSE',
    ],
  },
  'Transport Layer': {
    emoji: '🔒',
    items: [
      'TCP_SYN',
      'TCP_SYNACK',
      'TCP_ACK',
      'TCP_RST',
      'TCP_FIN',
      'UDP_DATAGRAM',
    ],
  },
  'Network Layer': {
    emoji: '🧱',
    items: [
      'ICMP_ECHO_REQUEST',
      'ICMP_ECHO_REPLY',
      'ARP_REQUEST',
      'ARP_REPLY',
      'BGP_UPDATE',
      'OSPF_HELLO',
      'DHCP_DISCOVER',
      'DHCP_OFFER',
    ],
  },
}

export const ALL_PACKET_TYPES: string[] = Object.values(PACKET_TYPE_GROUPS).flatMap((g) => g.items)