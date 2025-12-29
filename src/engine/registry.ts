'use client'

// Lightweight registries to support Epic B.
// - DecorRegistry: map JSON decor "type" -> renderer (+ optional normalizer)
// - DeviceAddons: category-level UI add-ons (metadata boards, HUD badges, etc.)

import React from 'react'

export type RoomDims = { width: number; height: number; depth: number }

export type DecorRenderer = (args: {
  element: any
  roomDims: RoomDims
}) => React.ReactNode

export type DecorNormalizer = (args: {
  element: any
  roomDims: RoomDims
}) => any

type Entry = { render: DecorRenderer; normalize?: DecorNormalizer; describe?: string }

class _DecorRegistry {
  private map = new Map<string, Entry>()

  register(type: string, entry: Entry) {
    if (!type || typeof type !== 'string') return
    this.map.set(type, entry) // idempotent overwrite on HMR is fine
  }

  get(type: string): Entry | null {
    return this.map.get(type) || null
  }

  list(): string[] {
    return Array.from(this.map.keys()).sort()
  }
}

export const DecorRegistry = new _DecorRegistry()

// Device add-ons registry — category-level UI decorators
export type DeviceAddonCtx = {
  alias: string
  category?: string
  center?: [number, number, number]
  modelTopY?: number
  selected?: boolean
  metadataVisible?: boolean
  customLabel?: string
}
export type DeviceAddon = (ctx: DeviceAddonCtx) => React.ReactNode

class _DeviceAddonRegistry {
  private map = new Map<string, DeviceAddon[]>() // key: normalized category

  private norm(key: string) {
    const k = (key || '').trim()
    const lower = k.toLowerCase()
    // crude singularization for common plurals
    const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower
    return { raw: k, lower, singular }
  }

  register(category: string, addon: DeviceAddon) {
    if (!category || typeof addon !== 'function') return
    const { lower, singular } = this.norm(category)
    const keys = new Set([lower, singular])
    keys.forEach((key) => {
      const list = this.map.get(key) || []
      list.push(addon)
      this.map.set(key, list)
    })
  }

  get(category?: string): DeviceAddon[] {
    if (!category) return []
    const { lower, singular } = this.norm(category)
    const out: DeviceAddon[] = []
    const seen = new Set<DeviceAddon>()
    for (const key of [lower, singular]) {
      const list = this.map.get(key) || []
      for (const fn of list) {
        if (!seen.has(fn)) { seen.add(fn); out.push(fn) }
      }
    }
    return out
  }

  listCategories(): string[] {
    return Array.from(this.map.keys()).sort()
  }
}

export const DeviceAddons = new _DeviceAddonRegistry()
