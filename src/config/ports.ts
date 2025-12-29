/**
 * Port configuration for network devices
 * Defines physical port positions relative to device center
 */

export interface PortConfig {
  number: number
  position: [number, number, number] // x, y, z offset from device center
  label?: string
}

export interface DevicePortConfig {
  [deviceId: string]: {
    ports: PortConfig[]
  }
}

/**
 * Port positions for common network devices
 * These are approximate positions - adjust based on actual 3D models
 */
export const devicePortConfig: DevicePortConfig = {
  // Desktop - typically has one ethernet port on back
  desktop1: {
    ports: [
      { number: 1, position: [0, 0.2, -0.3], label: 'ETH0' }
    ]
  },
  
  // Laptop - ethernet port on side
  laptop1: {
    ports: [
      { number: 1, position: [0.3, 0.1, 0], label: 'ETH0' }
    ]
  },
  
  // Switch - 8 ports on front panel
  switch1: {
    ports: [
      { number: 1, position: [-0.6, 0, 0.4], label: 'Port 1' },
      { number: 2, position: [-0.4, 0, 0.4], label: 'Port 2' },
      { number: 3, position: [-0.2, 0, 0.4], label: 'Port 3' },
      { number: 4, position: [0, 0, 0.4], label: 'Port 4' },
      { number: 5, position: [0.2, 0, 0.4], label: 'Port 5' },
      { number: 6, position: [0.4, 0, 0.4], label: 'Port 6' },
      { number: 7, position: [0.6, 0, 0.4], label: 'Port 7' },
      { number: 8, position: [0.8, 0, 0.4], label: 'Port 8 (Uplink)' }
    ]
  },
  
  // Router - multiple ports
  router1: {
    ports: [
      { number: 1, position: [-0.4, 0, 0.4], label: 'GE0/0' },
      { number: 2, position: [-0.2, 0, 0.4], label: 'GE0/1' },
      { number: 3, position: [0, 0, 0.4], label: 'GE0/2' },
      { number: 4, position: [0.2, 0, 0.4], label: 'GE0/3' },
      { number: 5, position: [0.4, 0, 0.4], label: 'WAN' }
    ]
  },
  
  // Firewall - typically has inside/outside ports
  firewall1: {
    ports: [
      { number: 1, position: [-0.3, 0, 0.4], label: 'Inside' },
      { number: 2, position: [0, 0, 0.4], label: 'DMZ' },
      { number: 3, position: [0.3, 0, 0.4], label: 'Outside' }
    ]
  },
  
  // Earth/Internet - conceptual connection point
  earth1: {
    ports: [
      { number: 1, position: [0, -0.5, 0], label: 'WAN' }
    ]
  },
  
  // DNS Server
  dns1: {
    ports: [
      { number: 1, position: [0, 0, 0.4], label: 'ETH0' }
    ]
  },
  
  // Web Server
  web1: {
    ports: [
      { number: 1, position: [0, 0, 0.4], label: 'ETH0' }
    ]
  },
  
  // CDN Edge Server
  cdn1: {
    ports: [
      { number: 1, position: [0, 0, 0.4], label: 'ETH0' }
    ]
  },
  
  // PKI Server
  pki1: {
    ports: [
      { number: 1, position: [0, 0, 0.4], label: 'ETH0' }
    ]
  }
}

/**
 * Connection mapping: which ports connect to which devices
 * Format: [fromDevice, fromPort] -> [toDevice, toPort]
 */
export const connectionMap: Record<string, { device: string; port: number; toDevice: string; toPort: number }[]> = {
  // Desktop connections
  desktop1: [
    { device: 'desktop1', port: 1, toDevice: 'switch1', toPort: 1 }
  ],
  
  // Switch connections
  switch1: [
    { device: 'switch1', port: 1, toDevice: 'desktop1', toPort: 1 },
    { device: 'switch1', port: 8, toDevice: 'router1', toPort: 1 }
  ],
  
  // Router connections
  router1: [
    { device: 'router1', port: 1, toDevice: 'switch1', toPort: 8 },
    { device: 'router1', port: 5, toDevice: 'firewall1', toPort: 1 }
  ],
  
  // Firewall connections
  firewall1: [
    { device: 'firewall1', port: 1, toDevice: 'router1', toPort: 5 },
    { device: 'firewall1', port: 3, toDevice: 'earth1', toPort: 1 }
  ],
  
  // Internet connections
  earth1: [
    { device: 'earth1', port: 1, toDevice: 'firewall1', toPort: 3 },
    { device: 'earth1', port: 1, toDevice: 'dns1', toPort: 1 },
    { device: 'earth1', port: 1, toDevice: 'web1', toPort: 1 },
    { device: 'earth1', port: 1, toDevice: 'cdn1', toPort: 1 },
    { device: 'earth1', port: 1, toDevice: 'pki1', toPort: 1 }
  ],
  
  // DNS Server connections
  dns1: [
    { device: 'dns1', port: 1, toDevice: 'earth1', toPort: 1 }
  ],
  
  // Web Server connections
  web1: [
    { device: 'web1', port: 1, toDevice: 'earth1', toPort: 1 }
  ],
  
  // CDN Server connections
  cdn1: [
    { device: 'cdn1', port: 1, toDevice: 'earth1', toPort: 1 }
  ],
  
  // PKI Server connections
  pki1: [
    { device: 'pki1', port: 1, toDevice: 'earth1', toPort: 1 }
  ]
}

/**
 * Get port number for a connection between two devices
 */
export function getPortForConnection(fromDevice: string, toDevice: string): { fromPort: number; toPort: number } | null {
  const connections = connectionMap[fromDevice]
  if (!connections) return null
  
  const connection = connections.find(c => c.toDevice === toDevice)
  if (!connection) return null
  
  return {
    fromPort: connection.port,
    toPort: connection.toPort
  }
}

/**
 * Get port position for a device
 */
export function getPortPosition(deviceId: string, portNumber: number): [number, number, number] | null {
  const deviceConfig = devicePortConfig[deviceId]
  if (!deviceConfig) return null
  
  const port = deviceConfig.ports.find(p => p.number === portNumber)
  if (!port) return null
  
  return port.position
}
