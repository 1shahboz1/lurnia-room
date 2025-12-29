import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { RoomConfigV1 } from '@/schemas/room-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LayoutEntry = {
  id?: string
  modelName?: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  // Optional world-space hints captured during design-time staging
  worldPosition?: [number, number, number]
  worldQuaternion?: [number, number, number, number]
  worldScale?: [number, number, number]
  worldCenter?: [number, number, number]
  category?: string
  customLabel?: string
  __deleted?: boolean
}

type LayoutMap = Record<string, LayoutEntry>

type PublishRequest = {
  slug?: string
  layout?: unknown
  // Allow overriding the safety check for baseline/template rooms
  force?: boolean
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function asVec3(v: any): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null
  const a = Number(v[0]); const b = Number(v[1]); const c = Number(v[2])
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null
  return [a, b, c]
}

function asQuat4(v: any): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4) return null
  const a = Number(v[0]); const b = Number(v[1]); const c = Number(v[2]); const d = Number(v[3])
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return null
  return [a, b, c, d]
}

function normalizeCategory(raw: string | undefined | null): 'desktop'|'laptop'|'switch'|'router'|'firewall'|'server'|'earth'|'misc' {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return 'misc'

  // Handle folder/category labels from inventory (e.g. "Routers", "Switches")
  if (s === 'desktops' || s === 'desktop') return 'desktop'
  if (s === 'laptops' || s === 'laptop') return 'laptop'
  if (s === 'routers' || s === 'router') return 'router'
  if (s === 'switches' || s === 'switch') return 'switch'
  if (s === 'servers' || s === 'server') return 'server'
  if (s === 'firewall' || s === 'firewalls') return 'firewall'
  if (s === 'earth') return 'earth'

  // Other inventory props (monitors, peripherals, etc.) become misc
  return 'misc'
}

function guessCategoryFromModelName(modelName: string | undefined | null): string {
  const m = String(modelName || '').toLowerCase()
  if (m.includes('inventory/desktops/')) return 'desktop'
  if (m.includes('inventory/laptops/')) return 'laptop'
  if (m.includes('inventory/routers/')) return 'router'
  if (m.includes('inventory/switches/')) return 'switch'
  if (m.includes('inventory/servers/')) return 'server'
  if (m.includes('inventory/firewall/')) return 'firewall'
  if (m.includes('inventory/earth/')) return 'earth'
  return 'misc'
}

function toModelUrl(modelName: string): string {
  const s = String(modelName || '').trim()
  if (!s) return ''

  // Already a URL path
  if (s.startsWith('/')) {
    if (s.toLowerCase().endsWith('.glb') || s.toLowerCase().endsWith('.gltf')) return s
    // If it's an inventory path missing extension
    if (s.startsWith('/inventory/')) return `${s}.glb`
    return s
  }

  // Inventory modelName is stored without extension (e.g. "inventory/routers/router")
  if (s.startsWith('inventory/')) {
    if (s.toLowerCase().endsWith('.glb') || s.toLowerCase().endsWith('.gltf')) return `/${s}`
    return `/${s}.glb`
  }

  // Relative .glb
  if (s.toLowerCase().endsWith('.glb') || s.toLowerCase().endsWith('.gltf')) return `/${s}`

  // Unknown model namespace — keep as-is (will likely fail asset checks)
  return s
}

async function existsPublicAsset(url: string): Promise<boolean> {
  if (!url || typeof url !== 'string') return false
  let rel = url.startsWith('/public/') ? url.slice('/public'.length) : url
  if (rel.startsWith('/')) rel = rel.slice(1)
  const abs = path.join(process.cwd(), 'public', rel)
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

function extractTimestamp(id: string | undefined | null): number {
  const s = String(id || '')
  const m = s.match(/-(\d{10,})$/)
  if (!m) return 0
  const n = Number(m[1])
  return Number.isFinite(n) ? n : 0
}

function desiredServerAliasFromLabel(label: string | undefined | null): string | null {
  const t = String(label || '').toLowerCase()
  if (!t) return null
  if (t.includes('dns')) return 'dns1'
  if (t.includes('pki') || t.includes('ca ') || t.includes('certificate')) return 'pki1'
  if (t.includes('cdn')) return 'cdn1'
  if (t.includes('web') || t.includes('origin')) return 'web1'
  return null
}

function titleForDevice(alias: string, category: string, fallback?: string): string {
  const cat = String(category || '').toLowerCase()

  // Canonical, user-friendly labels (avoid embedding model names like "C8500 12x")
  if (cat === 'desktop') return 'Desktop'
  if (cat === 'laptop') return 'Laptop'
  if (cat === 'switch') return 'Switch'
  if (cat === 'router') return 'Router'
  if (cat === 'firewall') return 'Firewall'
  if (cat === 'earth') return 'Internet'

  if (cat === 'server') {
    // Default server role for this project: Web Server.
    // Keep special cases for other roles if explicitly assigned.
    if (alias === 'cdn1') return 'CDN Edge'
    if (alias === 'pki1') return 'PKI Server'
    return 'Web Server'
  }

  return fallback || alias
}

async function normalizeLayout(layout: unknown): Promise<LayoutMap> {
  if (typeof layout === 'string') {
    const parsed = JSON.parse(layout)
    if (!isPlainObject(parsed)) return {}
    return parsed as any
  }
  if (isPlainObject(layout)) return layout as any
  return {}
}

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Design publish is disabled in production.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as PublishRequest | null
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })

    const slug = String(body.slug || '').trim().toLowerCase()
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ ok: false, error: 'Invalid slug. Use lowercase letters, numbers, and hyphens only.' }, { status: 400 })
    }

    if (slug === 'baseline' && !body.force) {
      return NextResponse.json({ ok: false, error: 'Refusing to overwrite baseline template. Pass force=true if you really intend this.' }, { status: 403 })
    }

    const layoutMap = await normalizeLayout(body.layout)
    const entries = Object.entries(layoutMap)
      .map(([k, v]) => ({ key: k, entry: v }))
      .filter(({ entry }) => entry && !entry.__deleted && typeof entry.modelName === 'string' && entry.modelName.length > 0)

    if (entries.length === 0) {
      return NextResponse.json({ ok: false, error: 'No models found in layout to publish.' }, { status: 400 })
    }

    const roomsDir = path.join(process.cwd(), 'public', 'rooms')
    const srcPath = path.join(roomsDir, `${slug}.source.json`)

    const raw = await fs.readFile(srcPath, 'utf-8')
    const parsedJson = JSON.parse(raw)
    const v1Parsed = RoomConfigV1.safeParse(parsedJson)
    if (!v1Parsed.success) {
      return NextResponse.json({
        ok: false,
        error: 'Existing source JSON is not a valid RoomConfigV1; fix it before publishing.',
        details: v1Parsed.error.issues.map(i => ({ path: i.path, message: i.message }))
      }, { status: 400 })
    }

    // Sort entries deterministically by timestamp (from generated id) then key
    const sorted = entries
      .map(({ key, entry }) => {
        const id = String(entry.id || key)
        return { key, entry, ts: extractTimestamp(id) }
      })
      .sort((a, b) => (a.ts - b.ts) || a.key.localeCompare(b.key))

    // Group by category for deterministic aliasing
    const usedAliases = new Set<string>()
    const devices: any[] = []
    const missingAssets: string[] = []

    // First pass: split entries into server vs non-server
    const nonServers: Array<{ key: string; entry: LayoutEntry }> = []
    const serverCandidates: Array<{ key: string; entry: LayoutEntry }> = []

    for (const it of sorted) {
      const entry = it.entry as LayoutEntry
      const cat = normalizeCategory(entry.category || guessCategoryFromModelName(entry.modelName || ''))
      if (cat === 'server') serverCandidates.push({ key: it.key, entry })
      else nonServers.push({ key: it.key, entry })
    }

    // Bucket non-server entries by category
    const byCat: Record<string, Array<{ key: string; entry: LayoutEntry }>> = {}
    for (const it of nonServers) {
      const cat = normalizeCategory(it.entry.category || guessCategoryFromModelName(it.entry.modelName || ''))
      byCat[cat] = byCat[cat] || []
      byCat[cat].push(it)
    }

    const addDeviceFromEntry = (alias: string, cat: string, entry: LayoutEntry) => {
      if (usedAliases.has(alias)) return
      const modelUrl = toModelUrl(String(entry.modelName || ''))

      // Prefer local-space position when present; fall back to captured world-space position.
      // (In most rooms local == world, but we keep both around for debugging/robust restore.)
      const pos = asVec3(entry.position) || asVec3((entry as any).worldPosition) || [0, 0, 0]
      const rot = asVec3(entry.rotation)
      const scl = (typeof entry.scale === 'number') ? entry.scale : (Array.isArray(entry.scale) ? entry.scale : undefined)

      // Persist world-space hints so rooms can restore based on the "green sphere" center even
      // for poorly-authored GLBs with weird pivots/origins.
      const worldPosition = asVec3((entry as any).worldPosition)
      const worldQuaternion = asQuat4((entry as any).worldQuaternion)
      const worldScale = asVec3((entry as any).worldScale)
      const worldCenter = asVec3((entry as any).worldCenter)

      const title = titleForDevice(alias, cat, entry.customLabel || undefined)

      const metadata: Record<string, unknown> = {
        title,
        // Preserve whatever label was present in the layout (often model-specific) for debugging
        ...(entry.customLabel && entry.customLabel !== title ? { originalTitle: entry.customLabel } : {}),
        originalId: entry.id,
        originalModelName: entry.modelName,
        ...(worldPosition ? { worldPosition } : {}),
        ...(worldQuaternion ? { worldQuaternion } : {}),
        ...(worldScale ? { worldScale } : {}),
        ...(worldCenter ? { worldCenter } : {}),
      }

      devices.push({
        alias,
        category: cat,
        model: modelUrl,
        position: pos,
        ...(rot ? { rotation: rot } : {}),
        ...(scl != null ? { scale: scl } : {}),
        metadata,
      })
      usedAliases.add(alias)
    }

    // Place standard singletons (1 each)
    const singletonOrder: Array<{ cat: any; alias: string }> = [
      { cat: 'desktop', alias: 'desktop1' },
      { cat: 'laptop', alias: 'laptop1' },
      { cat: 'switch', alias: 'switch1' },
      { cat: 'router', alias: 'router1' },
      { cat: 'firewall', alias: 'firewall1' },
      { cat: 'earth', alias: 'earth1' },
    ]

    // Track only unassigned, non-core extras after singletons are placed
    const remaining: Array<{ key: string; entry: LayoutEntry }> = []

    const singletonCats = new Set(singletonOrder.map(s => String(s.cat)))

    for (const s of singletonOrder) {
      const list = byCat[s.cat] || []
      if (list.length > 0) {
        addDeviceFromEntry(s.alias, s.cat, list[0].entry)
        for (let i = 1; i < list.length; i++) {
          remaining.push(list[i])
        }
      }
    }

    // Any categories not covered by singleton order (e.g., misc) go straight to remaining
    for (const [cat, list] of Object.entries(byCat)) {
      if (singletonCats.has(cat)) continue
      for (const it of list) remaining.push(it)
    }

    // Servers: reserve labeled ones first
    const unassignedServers: Array<{ key: string; entry: LayoutEntry }> = []
    for (const it of serverCandidates) {
      const desired = desiredServerAliasFromLabel(it.entry.customLabel || '')
      if (desired && !usedAliases.has(desired) && ['dns1','pki1','cdn1','web1'].includes(desired)) {
        addDeviceFromEntry(desired, 'server', it.entry)
      } else {
        unassignedServers.push(it)
      }
    }

    // Fill remaining server slots by order (dns1 -> pki1 -> cdn1 -> web1)
    const slotAliases = ['dns1','pki1','cdn1','web1']
    for (const alias of slotAliases) {
      if (usedAliases.has(alias)) continue
      const next = unassignedServers.shift()
      if (!next) break
      addDeviceFromEntry(alias, 'server', next.entry)
    }

    // Any extra servers become server1, server2, ...
    let serverN = 1
    for (const it of unassignedServers) {
      while (usedAliases.has(`server${serverN}`)) serverN++
      addDeviceFromEntry(`server${serverN}`, 'server', it.entry)
      serverN++
    }

    // Remaining non-core extras: assign sequential aliases by category
    const counters: Record<string, number> = { desktop: 2, laptop: 2, switch: 2, router: 2, firewall: 2, earth: 2, misc: 1 }
    for (const it of remaining) {
      const entry = it.entry
      const cat = normalizeCategory(entry.category || guessCategoryFromModelName(entry.modelName || ''))
      const base = cat === 'misc' ? 'misc' : cat
      let n = counters[base] || 1
      while (usedAliases.has(`${base}${n}`)) n++
      counters[base] = n + 1
      addDeviceFromEntry(`${base}${n}`, cat, entry)
    }

    // Asset existence checks (fail fast with a helpful error)
    for (const d of devices) {
      const ok = await existsPublicAsset(d.model)
      if (!ok) missingAssets.push(d.model)
    }
    if (missingAssets.length) {
      return NextResponse.json({
        ok: false,
        error: 'Some model assets were not found under /public. Publishing aborted.',
        missingAssets: Array.from(new Set(missingAssets)).sort(),
      }, { status: 400 })
    }

    const out = {
      ...v1Parsed.data,
      id: slug,
      devices,
    }

    // Re-validate output to guarantee correctness
    const outCheck = RoomConfigV1.safeParse(out)
    if (!outCheck.success) {
      return NextResponse.json({
        ok: false,
        error: 'Publishing produced an invalid RoomConfigV1 (this should not happen).',
        details: outCheck.error.issues.map(i => ({ path: i.path, message: i.message })),
      }, { status: 500 })
    }

    await fs.writeFile(srcPath, JSON.stringify(outCheck.data, null, 2) + '\n', 'utf-8')

    return NextResponse.json({
      ok: true,
      slug,
      devicesWritten: devices.length,
      file: `/rooms/${slug}.source.json`,
    })
  } catch (e: any) {
    console.error('design publish failed', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
