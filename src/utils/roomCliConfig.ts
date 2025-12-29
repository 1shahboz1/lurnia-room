/**
 * Room CLI Configuration Utility
 * 
 * Loads room-specific CLI whitelist from room description JSON files.
 */

export interface RoomCliConfig {
  room_id: string
  title: string
  cliWhitelist?: string[]
}

/**
 * Load CLI whitelist for a specific room
 */
export async function loadRoomCliWhitelist(roomId: string): Promise<string[] | null> {
  try {
    const response = await fetch(`/room-descriptions/${roomId}.json`)
    
    if (!response.ok) {
      console.warn(`[RoomCliConfig] Room config not found: ${roomId}`)
      return null
    }
    
    const config: RoomCliConfig = await response.json()
    
    if (config.cliWhitelist && Array.isArray(config.cliWhitelist)) {
      console.log(`[RoomCliConfig] Loaded whitelist for ${roomId}:`, config.cliWhitelist)
      return config.cliWhitelist
    }
    
    console.log(`[RoomCliConfig] No whitelist defined for ${roomId}, allowing all commands`)
    return null
    
  } catch (error) {
    console.error(`[RoomCliConfig] Error loading config for ${roomId}:`, error)
    return null
  }
}

/**
 * Load full room CLI configuration
 */
export async function loadRoomCliConfig(roomId: string): Promise<RoomCliConfig | null> {
  try {
    const response = await fetch(`/room-descriptions/${roomId}.json`)
    
    if (!response.ok) {
      return null
    }
    
    return await response.json()
    
  } catch (error) {
    console.error(`[RoomCliConfig] Error loading config for ${roomId}:`, error)
    return null
  }
}
