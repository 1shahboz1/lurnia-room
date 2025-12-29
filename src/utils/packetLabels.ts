/**
 * Packet Label Mapping Utility
 * Maps packet styles from commands.json to user-friendly display labels
 */

export interface PacketDisplayInfo {
  label: string
  osiLayer: string
  color: string
}

/**
 * Map packet style (from commands.json) to display-friendly label
 */
export function getPacketDisplayLabel(style: string): PacketDisplayInfo {
  const styleMap: Record<string, PacketDisplayInfo> = {
    // DNS packets
    'dns_query': {
      label: 'DNS Query',
      osiLayer: 'Layer 7',
      color: '#FFFF00' // Yellow
    },
    'dns_response': {
      label: 'DNS Response',
      osiLayer: 'Layer 7',
      color: '#FFFF00' // Yellow
    },
    
    // TCP packets
    'tcp_syn': {
      label: 'TCP SYN',
      osiLayer: 'Layer 4',
      color: '#10B981' // Green
    },
    'tcp_syn_ack': {
      label: 'TCP SYN-ACK',
      osiLayer: 'Layer 4',
      color: '#10B981' // Green
    },
    'tcp_ack': {
      label: 'TCP ACK',
      osiLayer: 'Layer 4',
      color: '#10B981' // Green
    },
    
    // TLS/SSL packets
    'tls_handshake': {
      label: 'TLS Handshake',
      osiLayer: 'Layer 7',
      color: '#9333EA' // Purple
    },
    'tls_client_hello': {
      label: 'TLS ClientHello',
      osiLayer: 'Layer 7',
      color: '#9333EA' // Purple
    },
    'tls_server_hello': {
      label: 'TLS ServerHello',
      osiLayer: 'Layer 7',
      color: '#9333EA' // Purple
    },
    'tls_certificate': {
      label: 'TLS Certificate',
      osiLayer: 'Layer 7',
      color: '#9333EA' // Purple
    },
    'tls_finished': {
      label: 'TLS Finished',
      osiLayer: 'Layer 7',
      color: '#9333EA' // Purple
    },
    
    // HTTP/HTTPS packets
    'http': {
      label: 'HTTP Request',
      osiLayer: 'Layer 7',
      color: '#3B82F6' // Blue
    },
    'https': {
      label: 'HTTPS Request',
      osiLayer: 'Layer 7',
      color: '#10B981' // Green
    },
    'http_request': {
      label: 'HTTP GET',
      osiLayer: 'Layer 7',
      color: '#3B82F6' // Blue
    },
    'http_response': {
      label: 'HTTP 200 OK',
      osiLayer: 'Layer 7',
      color: '#3B82F6' // Blue
    },
    
    // ICMP packets
    'icmp': {
      label: 'ICMP Echo',
      osiLayer: 'Layer 3',
      color: '#06B6D4' // Cyan
    },
    'icmp_request': {
      label: 'ICMP Request',
      osiLayer: 'Layer 3',
      color: '#06B6D4' // Cyan
    },
    'icmp_reply': {
      label: 'ICMP Reply',
      osiLayer: 'Layer 3',
      color: '#06B6D4' // Cyan
    },
  }
  
  // Return mapped info or default
  return styleMap[style] || {
    label: style.replace(/_/g, ' ').toUpperCase(),
    osiLayer: 'Layer 7',
    color: '#FFFFFF' // White default
  }
}

/**
 * Get color based on OSI layer (fallback if specific style not found)
 */
export function getLayerColor(layer: number): string {
  switch (layer) {
    case 3: return '#06B6D4' // Cyan - Network layer
    case 4: return '#10B981' // Green - Transport layer
    case 7: return '#9333EA' // Purple - Application layer
    default: return '#FFFFFF' // White default
  }
}
