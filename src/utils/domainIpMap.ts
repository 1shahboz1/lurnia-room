/**
 * Domain to IP Mapping for Realistic Terminal Output
 * 
 * Maps common domains to realistic IP addresses for educational simulation
 */

const DOMAIN_IP_MAP: Record<string, string> = {
  // Google services
  'google.com': '142.250.190.14',
  'www.google.com': '142.250.190.14',
  'gmail.com': '142.250.185.37',
  'youtube.com': '142.250.185.46',

  // Social media
  'facebook.com': '157.240.241.35',
  'www.facebook.com': '157.240.241.35',
  'instagram.com': '157.240.241.174',
  'twitter.com': '104.244.42.193',
  'x.com': '104.244.42.193',
  'linkedin.com': '108.174.10.10',

  // Tech companies
  'apple.com': '17.253.144.10',
  'microsoft.com': '20.112.52.29',
  'amazon.com': '205.251.242.103',
  'netflix.com': '54.175.219.8',

  // Developer sites
  'github.com': '140.82.121.3',
  'stackoverflow.com': '151.101.129.69',
  'reddit.com': '151.101.1.140',
  'wikipedia.org': '208.80.154.224',

  // CDNs
  'cloudflare.com': '104.16.132.229',
  'akamai.com': '184.51.125.176',

  // Room hostnames (educational scenarios)
  'web-server': '198.51.100.10',

  // Common examples
  'example.com': '93.184.216.34',
  'example.org': '93.184.216.34',
  'test.com': '192.0.2.1',
  'localhost': '127.0.0.1',
}

/**
 * Get IP address for a domain
 * Returns a realistic IP or generates one if domain not in map
 */
export function getIpForDomain(domain: string): string {
  // Normalize domain (remove www., lowercase, trim)
  const normalized = domain.toLowerCase().trim().replace(/^www\./, '')
  
  // Check if we have a mapping
  if (DOMAIN_IP_MAP[normalized]) {
    return DOMAIN_IP_MAP[normalized]
  }
  
  // Check with www prefix
  if (DOMAIN_IP_MAP[`www.${normalized}`]) {
    return DOMAIN_IP_MAP[`www.${normalized}`]
  }
  
  // Generate a semi-random but consistent IP for unknown domains
  // Use domain string to seed the "randomness" so same domain always gets same IP
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  
  // Generate IP in valid ranges (avoid private ranges)
  const octet2 = Math.abs((hash >> 16) & 0xFF) % 256
  const octet3 = Math.abs((hash >> 8) & 0xFF) % 256
  const octet4 = Math.abs(hash & 0xFF) % 256
  
  // Use public IP ranges
  return `104.${octet2}.${octet3}.${octet4}`
}

/**
 * Get a random query time in milliseconds (realistic DNS query time)
 */
export function getRandomQueryTime(): number {
  return Math.floor(Math.random() * 18) + 18 // 18-35ms
}

/**
 * Get current timestamp in DNS format
 */
export function getDnsTimestamp(): string {
  const now = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  const day = days[now.getDay()]
  const month = months[now.getMonth()]
  const date = now.getDate()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const seconds = now.getSeconds().toString().padStart(2, '0')
  const year = now.getFullYear()
  
  return `${day} ${month} ${date} ${hours}:${minutes}:${seconds} UTC ${year}`
}

/**
 * Get DNS server IP from room topology
 * Falls back to 8.8.8.8 if not configured
 */
export function getDnsServerIp(roomConfig?: any): string {
  // TODO: Extract from room configuration when available
  // For now, return a realistic internal DNS server IP
  return '10.0.0.5' // This matches the typical dns_server in the topology
}

/**
 * Generate random TTL (Time To Live) value
 */
export function getRandomTtl(): number {
  const ttls = [60, 120, 300, 600, 1800, 3600] // Common TTL values
  return ttls[Math.floor(Math.random() * ttls.length)]
}

/**
 * Check if domain looks valid
 */
export function isValidDomain(domain: string): boolean {
  // Very basic check - has at least one dot and looks domain-like
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*\.[a-zA-Z]{2,}$/
  return domainRegex.test(domain.trim())
}
