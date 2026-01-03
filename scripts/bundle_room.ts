#!/usr/bin/env tsx

/*
  Room Bundler (Epic E — Task 2: Normalize/Enrich)
  - Input: RoomConfigV1 source JSON
  - Validates with Zod (strict)
  - Does NOT inject colors or backgrounds (author/AI must specify look explicitly)
  - Warn-only checks: firewall_wall too-thin thickness, missing background, out-of-bounds positions
  - Optional clamp/snap (only when flags are provided) of device + decor positions to room bounds
  - Output: public/rooms/<slug>.final.json

  Usage:
    tsx scripts/bundle_room.ts <path/to/room.source.json> [--slug <slug>] [--clamp none|soft|hard] [--grid <step>] [--dry-run] [--bundle-assets]

  Notes:
  - This script intentionally avoids asset copying/hashing (Task 3) and manifest writing (Task 4).
  - It does not change /room behavior; it only writes a .final.json used by /[scenario].
*/

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { RoomConfigV1 } from '../src/schemas/room-contract'
import type { z } from 'zod'

// CLI args
type ClampMode = 'none' | 'soft' | 'hard'
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx scripts/bundle_room.ts <path/to/room.source.json> [--slug <slug>] [--clamp none|soft|hard] [--grid <step>] [--dry-run] [--bundle-assets]')
  process.exit(1)
}

function readFlag(name: string, fallback?: string): string | undefined {
  const ix = args.indexOf(name)
  if (ix >= 0 && ix + 1 < args.length) return args[ix + 1]
  return fallback
}
function hasFlag(name: string): boolean {
  return args.includes(name)
}

const inputPath = args[0]
const explicitSlug = readFlag('--slug')
const clampMode = (readFlag('--clamp', 'none') as ClampMode) || 'none'
const gridStep = Number(readFlag('--grid', '0')) || 0
const dryRun = hasFlag('--dry-run')
const updateIndex = hasFlag('--update-index')
const screenshotUrl = readFlag('--screenshot-url')
const bundleAssets = hasFlag('--bundle-assets')

// Derive slug from filename if not provided
const base = path.basename(inputPath)
const inferredSlug = base.replace(/\.(source|final)\.json$/i, '').replace(/\.json$/i, '')
const slug = explicitSlug || inferredSlug || 'test-room'

// Read and validate input JSON
function readJson(p: string): unknown {
  const raw = fs.readFileSync(p, 'utf-8')
  try { return JSON.parse(raw) } catch (e) { throw new Error(`Invalid JSON at ${p}: ${(e as Error).message}`) }
}

const raw = readJson(inputPath)
const parsed = RoomConfigV1.safeParse(raw)
if (!parsed.success) {
  console.error('✖ Zod validation failed for input:')
  for (const issue of parsed.error.issues) {
    console.error(' -', (issue.path.join('.') || '(root)'), '-', issue.message)
  }
  process.exit(1)
}

type V1 = z.infer<typeof RoomConfigV1>
const v1: V1 = parsed.data

// Helpers for normalization (no color injection by default)
// Note: we keep optional clamp utilities below; visual defaults are not applied.

function clamp(val: number, min: number, max: number) { return Math.min(max, Math.max(min, val)) }
function snap(val: number, step: number) { return step > 0 ? Math.round(val / step) * step : val }

function clampPosition(pos: [number, number, number], dims: { width: number, height: number, depth: number }, mode: ClampMode, step: number): [number, number, number] {
  if (mode === 'none') return [ snap(pos[0], step), snap(pos[1], step), snap(pos[2], step) ]
  const halfX = Math.max(0, dims.width / 2)
  const halfZ = Math.max(0, dims.depth / 2)
  const ceilY = Math.max(0, dims.height)
  const margin = mode === 'hard' ? 0.25 : 0.15
  const minX = -halfX + margin
  const maxX = +halfX - margin
  const minZ = -halfZ + margin
  const maxZ = +halfZ - margin
  const minY = 0
  const maxY = Math.max(0, ceilY - margin)
  const nx = snap(clamp(pos[0], minX, maxX), step)
  const ny = snap(clamp(pos[1], minY, maxY), step)
  const nz = snap(clamp(pos[2], minZ, maxZ), step)
  return [nx, ny, nz]
}

function normalize(v: V1): V1 {
  const out: any = JSON.parse(JSON.stringify(v)) // deep clone

  // No environment or color injection here. We only modify positions if clamp flags are provided.

  // Optional clamp/snap of device positions (and decor position if present)
  const dims = out.structure?.dimensions
  if (dims && (clampMode !== 'none' || gridStep > 0)) {
    // devices
    if (Array.isArray(out.devices)) {
      out.devices = out.devices.map((d: any) => {
        if (Array.isArray(d?.position) && d.position.length === 3) {
          d.position = clampPosition(d.position, dims, clampMode, gridStep)
        }
        return d
      })
    }
    // decor
    if (Array.isArray(out.structure?.decor)) {
      out.structure.decor = out.structure.decor.map((el: any) => {
        if (Array.isArray(el?.position) && el.position.length === 3) {
          el.position = clampPosition(el.position, dims, clampMode, gridStep)
        }
        return el
      })
    }
  }

return out as V1
}

// Validation checks that do NOT mutate config
function validateForWarnings(v: V1) {
  const warnings: string[] = []

  // Environment background missing (warn-only)
  if (!v.environment || !v.environment.background) {
    warnings.push('environment.background is missing (visual style should be explicit in source JSON)')
  }

  // Decor-specific checks
  const decor = v.structure?.decor || []
  for (const el of decor as any[]) {
    if (!el || typeof el !== 'object') continue
    const type = String(el.type || '')
    if (type === 'firewall_wall') {
      const t = Number((el as any).thickness)
      if (!Number.isNaN(t) && t > 0 && t < 0.02) {
        warnings.push(`decor.firewall_wall thickness < 0.02 may cause z-fighting (value: ${t})`)
      }
    }
  }

  // Out-of-bounds checks (warn-only)
  const dims = v.structure?.dimensions
  if (dims) {
    const halfX = Math.max(0, dims.width / 2)
    const halfZ = Math.max(0, dims.depth / 2)
    const ceilY = Math.max(0, dims.height)
    const inBounds = (p: [number, number, number]) => (
      p[0] >= -halfX && p[0] <= halfX &&
      p[2] >= -halfZ && p[2] <= halfZ &&
      p[1] >= 0 && p[1] <= ceilY
    )

    for (const d of (v.devices as any[] || [])) {
      if (Array.isArray(d?.position) && d.position.length === 3) {
        if (!inBounds(d.position)) warnings.push(`device '${d.alias || d.model}' position out of room bounds: [${d.position.join(', ')}]`)
      }
    }
    for (const el of (decor as any[])) {
      if (Array.isArray(el?.position) && el.position.length === 3) {
        if (!inBounds(el.position)) warnings.push(`decor '${el.id || el.type}' position out of room bounds: [${el.position.join(', ')}]`)
      }
    }
  }

  return { warnings }
}

const enriched = normalize(v1)

// Re-validate after normalization to guarantee schema conformance
const finalCheck = RoomConfigV1.safeParse(enriched)
if (!finalCheck.success) {
  console.error('✖ Normalization produced an invalid config (this should not happen):')
  for (const issue of finalCheck.error.issues) {
    console.error(' -', (issue.path.join('.') || '(root)'), '-', issue.message)
  }
  process.exit(1)
}

// Emit warnings (non-fatal)
const { warnings } = validateForWarnings(finalCheck.data)
if (warnings.length) {
  console.warn('\n⚠ Warnings:')
  for (const w of warnings) console.warn(' -', w)
}

// Asset pipeline (copy + hash + rewrite URLs)
// Supported file types: glb, gltf, png, jpg, jpeg, webp, gif, svg
const ASSET_EXT = new Set(['.glb','.gltf','.png','.jpg','.jpeg','.webp','.gif','.svg'])
const PUBLIC_DIR = path.join(process.cwd(), 'public')
const ROOM_ASSETS_DIR = path.join(PUBLIC_DIR, 'rooms', slug, 'assets')

function isHttpUrl(s: string) { return /^https?:\/\//i.test(s) }
function isDataUrl(s: string) { return /^data:/i.test(s) }
function getExtLower(p: string) { return path.extname(p || '').toLowerCase() }
function looksLikeAssetPath(s: string) {
  const ext = getExtLower(s)
  return ASSET_EXT.has(ext) && !isHttpUrl(s) && !isDataUrl(s)
}

function toPublicRelative(p: string): string {
  // Normalize various authoring forms to a path under /public
  // /public/x -> x; /x -> x; x -> x
  if (!p) return p
  if (p.startsWith('/public/')) return p.slice('/public/'.length)
  if (p.startsWith('/')) return p.slice(1)
  return p
}

function resolvePublicFile(rel: string): string {
  const abs = path.join(PUBLIC_DIR, rel)
  if (!fs.existsSync(abs)) {
    throw new Error(`Asset not found in public/: '${rel}' (resolved to ${abs})`)
  }
  return abs
}

function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
}

const absToUrlCache = new Map<string, string>()
const hashToName = new Map<string, string>()

// Records for manifest
type AssetRecord = { originalPublicPath: string, url: string, hash: string, bytes: number, ext: string }
const assetMap = new Map<string, AssetRecord>() // key = url

function copyAndHashAsset(relOrAbsLike: string): string {
  // If already pointing at /rooms/<slug>/assets, leave as-is
  if (relOrAbsLike.startsWith(`/rooms/${slug}/assets/`)) return relOrAbsLike

  const rel = toPublicRelative(relOrAbsLike)
  const abs = resolvePublicFile(rel)

  if (absToUrlCache.has(abs)) return absToUrlCache.get(abs) as string

const buf = fs.readFileSync(abs)
  const h = hashBuffer(buf)
  const ext = getExtLower(abs)
  const base = path.basename(abs, ext)
  const fileName = `${base}.${h}${ext}`

  // Deduplicate by hash
  const finalName = hashToName.get(h) || fileName
  hashToName.set(h, finalName)

  const destDir = ROOM_ASSETS_DIR
  const destAbs = path.join(destDir, finalName)
  const url = `/rooms/${slug}/assets/${finalName}`

  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true })
    if (!fs.existsSync(destAbs)) fs.writeFileSync(destAbs, buf)
  }

absToUrlCache.set(abs, url)
  // Save record for manifest
  assetMap.set(url, { originalPublicPath: rel, url, hash: h, bytes: buf.byteLength, ext })
  return url
}

function rewriteDeviceModels(v: V1): number {
  let count = 0
  if (Array.isArray(v.devices)) {
    for (const d of v.devices as any[]) {
      const s = d?.model
      if (typeof s === 'string' && looksLikeAssetPath(s) && getExtLower(s).match(/\.(glb|gltf)$/i)) {
        d.model = copyAndHashAsset(s)
        count++
      } else if (typeof s === 'string' && !isHttpUrl(s) && !isDataUrl(s)) {
        // Allow model paths without extension if they already include absolute hashed asset
        if (s.startsWith(`/rooms/${slug}/assets/`)) {
          // already hashed
        } else if (getExtLower(s) === '') {
          // Model paths like '/models/router' are not supported at this stage — must specify the concrete .glb
          throw new Error(`Device model must point to a concrete .glb/.gltf: '${s}' (device: ${d.alias || d.category || 'unknown'})`)
        }
      }
    }
  }
  return count
}

const ASSET_KEY_RE = /(url$|image|texture|src)/i

function deepRewriteDecor(el: any): number {
  let c = 0
  if (!el || typeof el !== 'object') return c
  if (Array.isArray(el)) {
    for (let i = 0; i < el.length; i++) c += deepRewriteDecor(el[i])
    return c
  }
  for (const k of Object.keys(el)) {
    const v = (el as any)[k]
    if (typeof v === 'string') {
      if ((ASSET_KEY_RE.test(k) || looksLikeAssetPath(v)) && looksLikeAssetPath(v)) {
        (el as any)[k] = copyAndHashAsset(v)
        c++
      }
    } else if (v && typeof v === 'object') {
      c += deepRewriteDecor(v)
    }
  }
  return c
}

function rewriteDecorAssets(v: V1): number {
  let count = 0
  const decor = v.structure?.decor || []
  for (let i = 0; i < (decor as any[]).length; i++) {
    count += deepRewriteDecor((decor as any[])[i])
  }
  return count
}

function rewriteBoardMarkdown(v: V1): number {
  let count = 0
  const boards = (v as any)?.content?.boards
  if (!Array.isArray(boards)) return count
  const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g
  for (const b of boards) {
    if (typeof b?.md === 'string') {
      let md = b.md as string
      let m: RegExpExecArray | null
      let replaced = false
      const seen = new Set<string>()
      while ((m = IMG_RE.exec(md)) !== null) {
        const orig = m[1]
        if (!orig || isHttpUrl(orig) || isDataUrl(orig)) continue
        if (!looksLikeAssetPath(orig)) continue
        if (seen.has(orig)) continue
        const url = copyAndHashAsset(orig)
        const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        md = md.replace(new RegExp(`\\(${esc}\\)`,'g'), `(${url})`)
        replaced = true
        seen.add(orig)
        count++
      }
      if (replaced) b.md = md
    }
  }
  return count
}

function runAssetPipeline(v: V1) {
  let copied = 0
  copied += rewriteDeviceModels(v)
  copied += rewriteDecorAssets(v)
  copied += rewriteBoardMarkdown(v)
  return { copied, unique: hashToName.size }
}

// Apply asset pipeline on the validated data (non-dry-run still guards writes)
// Default behavior: do NOT copy/hash assets into per-room folders.
// To opt-in (e.g. for offline sharing), pass --bundle-assets.
const finalConfig: V1 = JSON.parse(JSON.stringify(finalCheck.data))
const { copied, unique } = bundleAssets ? runAssetPipeline(finalConfig) : { copied: 0, unique: 0 }

// Re-validate after (optional) rewriting paths
const afterAssets = RoomConfigV1.safeParse(finalConfig)
if (!afterAssets.success) {
  console.error('✖ Asset rewriting produced an invalid config (this should not happen):')
  for (const issue of afterAssets.error.issues) {
    console.error(' -', (issue.path.join('.') || '(root)'), '-', issue.message)
  }
  process.exit(1)
}

// Output paths
const roomsDir = path.join(process.cwd(), 'public', 'rooms')
const outPath = path.join(roomsDir, `${slug}.final.json`)
const manifestPath = path.join(roomsDir, `${slug}.manifest.json`)

// Atomic write helper
function atomicWriteJSON(p: string, data: any) {
  const dir = path.dirname(p)
  const tmp = path.join(dir, `.${path.basename(p)}.tmp-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, p)
}

// Build manifest
const v = afterAssets.data as V1
const manifest = {
  slug,
  schemaVersion: (v as any).schemaVersion || (v1 as any).schemaVersion || '1.0',
  meta: v1.meta,
  counts: {
    devices: Array.isArray(v1.devices) ? v1.devices.length : 0,
    decor: Array.isArray((v1 as any)?.structure?.decor) ? (v1 as any).structure.decor.length : 0,
    flows: Array.isArray((v1 as any).flows) ? (v1 as any).flows.length : 0,
    phases: Array.isArray((v1 as any).phases) ? (v1 as any).phases.length : 0,
    boards: Array.isArray((v1 as any)?.content?.boards) ? (v1 as any).content.boards.length : 0,
  },
  assets: bundleAssets ? Array.from(assetMap.values()) : [],
  warnings,
  files: {
    final: `/rooms/${slug}.final.json`,
    manifest: `/rooms/${slug}.manifest.json`,
    preview: `/rooms/${slug}/preview.png`,
  },
  generatedAt: new Date().toISOString(),
}

// Write final + manifest atomically (unless dry-run)
if (!dryRun) {
  fs.mkdirSync(roomsDir, { recursive: true })
  atomicWriteJSON(outPath, v)
  atomicWriteJSON(manifestPath, manifest)
}

// Optional: preview screenshot (requires a running server and --screenshot-url)
async function maybeScreenshot() {
  if (!screenshotUrl || dryRun) return false
  try {
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.launch({ headless: 'new' as any })
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(screenshotUrl, { waitUntil: 'networkidle0', timeout: 45000 })
    const previewDir = path.join(roomsDir, slug)
    const previewPath = path.join(previewDir, 'preview.png') as `${string}.png`
    fs.mkdirSync(previewDir, { recursive: true })
    await page.screenshot({ path: previewPath, fullPage: false })
    await browser.close()
    return true
  } catch (e) {
    console.warn('⚠ Failed to generate screenshot:', (e as Error).message)
    return false
  }
}

// Optional: update public/rooms/index.json
function maybeUpdateIndex() {
  if (!updateIndex || dryRun) return false
  const indexPath = path.join(roomsDir, 'index.json')
  let list: any[] = []
  if (fs.existsSync(indexPath)) {
    try { list = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) } catch {}
    if (!Array.isArray(list)) list = []
  }
  const entry = {
    slug,
    title: v1.meta.title,
    summary: v1.meta.summary || '',
    final: `/rooms/${slug}.final.json`,
    manifest: `/rooms/${slug}.manifest.json`,
    preview: fs.existsSync(path.join(roomsDir, slug, 'preview.png')) ? `/rooms/${slug}/preview.png` : undefined,
  }
  const idx = list.findIndex((x: any) => x && x.slug === slug)
  if (idx >= 0) {
    list[idx] = entry
  } else {
    list.push(entry)
  }
  list.sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
  // atomic write
  const dir = path.dirname(indexPath)
  const tmp = path.join(dir, `.index.json.tmp-${Date.now()}`)
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8')
  fs.renameSync(tmp, indexPath)
  return true
}

// Kick optional steps (best-effort)
(async () => {
  const shot = await maybeScreenshot()
  const updated = maybeUpdateIndex()
  // Summary
  console.log(`✅ Normalize/enrich + assets complete${dryRun ? ' (dry-run)' : ''}`)
  console.log(`   slug: ${slug}`)
  console.log(`   clamp: ${clampMode}${gridStep > 0 ? `, grid=${gridStep}` : ''}`)
  if (warnings.length) console.log(`   warnings: ${warnings.length}`)
  console.log(`   assets: ${bundleAssets ? `copied=${copied}, unique=${unique}` : 'skipped (use --bundle-assets to enable)'}`)
  if (!dryRun) {
    console.log(`   wrote: ${outPath}`)
    console.log(`   wrote: ${manifestPath}`)
    if (shot) console.log(`   wrote: /rooms/${slug}/preview.png`)
    if (updated) console.log(`   updated: /rooms/index.json`)
  }
})()
