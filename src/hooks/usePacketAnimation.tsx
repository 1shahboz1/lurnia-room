'use client'

import { useState, useCallback, useRef } from 'react'
import { PacketMetadata, PacketHopEasing } from '../components/network/PacketHop'

export interface HopConfig {
  packetId: string
  label: string
  protocol: string
  encrypted: boolean
  fromAnchor: string
  toAnchor: string

  // Optional: override the computed curve with explicit world-space points
  // (used for VPN tunnel segments so the packet follows the tunnel geometry)
  pathPointsOverride?: Array<[number, number, number]>

  // Optional hop tuning / FX
  travelSeconds?: number
  easing?: PacketHopEasing
  holdSeconds?: number

  // Optional: gate completion of the hold on a UI event
  holdUntilEvent?: string
  holdCompleteEvent?: string

  startOffsetTowardAnchor?: string
  startOffsetDistance?: number
  startYOffset?: number
  endOffsetTowardAnchor?: string
  endOffsetDistance?: number
  endYOffset?: number

  // Optional inspection UI (when label starts with "INSPECT")
  inspectChips?: string[]

  showLabel?: boolean
}

export interface PacketAnimationCallbacks {
  onLaunch?: (meta: PacketMetadata) => void
  onPause?: (meta: PacketMetadata) => void
  onResume?: (meta: PacketMetadata) => void
  onArrival?: (meta: PacketMetadata) => void
}

export interface ActiveHop {
  config: HopConfig
  lineVisible: boolean
}

export function usePacketAnimation(callbacks?: PacketAnimationCallbacks) {
  const [activeHop, setActiveHop] = useState<ActiveHop | null>(null)
  const currentPacketIdRef = useRef<string | null>(null)
  const isAnimatingRef = useRef(false) // Prevent concurrent animations
  const lastStartAtRef = useRef<number>(0) // Throttle new hops
  const MIN_INTERVAL_MS = 0
  
  /**
   * Start a packet hop animation
   */
  const startHop = useCallback((config: HopConfig) => {
    const now = Date.now()
    const sinceLast = now - lastStartAtRef.current
    console.log(`🧭 startHop request: id=${config.packetId} now=${now} isAnimating=${isAnimatingRef.current} sinceLast=${sinceLast}ms (min ${MIN_INTERVAL_MS}ms)`)    
    // Prevent starting a new animation if one is already active
    if (isAnimatingRef.current) {
      console.log(`⚠️ Skipping hop ${config.packetId} - animation already in progress`)
      return
    }
    // Enforce a minimum interval between hops
    if (sinceLast < MIN_INTERVAL_MS) {
      const waitMs = MIN_INTERVAL_MS - sinceLast
      console.log(`⏳ Throttling hop ${config.packetId} - wait ${(waitMs/1000).toFixed(1)}s`)
      return
    }
    
    console.log(`🎬 Starting hop: ${config.packetId} from ${config.fromAnchor} to ${config.toAnchor}`)
    isAnimatingRef.current = true
    lastStartAtRef.current = now
    
    setActiveHop({
      config,
      lineVisible: true,
    })
    
    currentPacketIdRef.current = config.packetId
  }, [])
  
  /**
   * Pause the current packet animation
   */
  const pausePacket = useCallback(() => {
    if (!currentPacketIdRef.current) {
      console.warn('pausePacket: No active packet to pause')
      return
    }
    
    console.log(`⏸️ Pausing packet: ${currentPacketIdRef.current}`)
    // The pause logic is handled inside PacketHop component via click
    // This function is here for external programmatic control if needed
  }, [])
  
  /**
   * Resume the current packet animation
   */
  const resumePacket = useCallback(() => {
    if (!currentPacketIdRef.current) {
      console.warn('resumePacket: No active packet to resume')
      return
    }
    
    console.log(`▶️ Resuming packet: ${currentPacketIdRef.current}`)
    // The resume logic is handled inside PacketHop component via click
    // This function is here for external programmatic control if needed
  }, [])
  
  /**
   * Handle packet arrival - fade out line and clear active hop
   */
  const handleArrival = useCallback((meta: PacketMetadata) => {
    console.log(`🎯 Packet ${meta.id} arrived, fading out line`)
    
    // Fade out the line for the current hop
    setActiveHop(prev => prev ? { ...prev, lineVisible: false } : null)

    // Remember which packet finished
    const arrivedId = meta.id

    // Notify callbacks immediately so engines can advance
    try { callbacks?.onArrival?.(meta) } catch {}

    // Only clear the active hop if it still corresponds to this packet after fade
    setTimeout(() => {
      if (currentPacketIdRef.current === arrivedId) {
        setActiveHop(null)
        isAnimatingRef.current = false
        currentPacketIdRef.current = null
      }
    }, 150)
  }, [callbacks])
  
  /**
   * Internal handlers that wrap user callbacks
   */
  const handleLaunch = useCallback((meta: PacketMetadata) => {
    console.log(`🚀 Packet ${meta.id} launched`)
    callbacks?.onLaunch?.(meta)
  }, [callbacks])
  
  const handlePause = useCallback((meta: PacketMetadata) => {
    console.log(`⏸️ Packet ${meta.id} paused`)
    callbacks?.onPause?.(meta)
  }, [callbacks])
  
  const handleResume = useCallback((meta: PacketMetadata) => {
    console.log(`▶️ Packet ${meta.id} resumed`)
    callbacks?.onResume?.(meta)
  }, [callbacks])
  
  /**
   * Stop all animations immediately - clear packet and lines
   */
  const stopAll = useCallback(() => {
    console.log('🛑 Stopping all packet animations')
    setActiveHop(null)
    currentPacketIdRef.current = null
    isAnimatingRef.current = false
  }, [])
  
  return {
    // State
    activeHop,
    
    // API functions
    startHop,
    pausePacket,
    resumePacket,
    stopAll,
    
    // Internal handlers (for wiring to PacketHop component)
    handleLaunch,
    handlePause,
    handleResume,
    handleArrival,
  }
}
