// exactRestore.ts - non-invasive, feature-flagged save/restore hardening for GLB transforms
// Usage: import '@/utils/exactRestore' once (e.g., from src/app/room/page.tsx)

/* eslint-disable no-console */

function isEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('exactRestore') === '0') return false
    if (params.get('exactRestore') === '1') return true
  } catch {}
  // default: enabled
  return true
}

function isPlainObject(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function asVecN(v: any, n: number): number[] | undefined {
  if (!Array.isArray(v)) return undefined
  if (v.length < n) return undefined
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const num = Number(v[i])
    if (!isFinite(num)) return undefined
    out.push(num)
  }
  return out
}

function normalizeEntry(entry: any) {
  if (!isPlainObject(entry)) return null
  const id = String(entry.id || '')
  if (!id) return null
  const modelName = typeof entry.modelName === 'string' ? entry.modelName : undefined
  const position = asVecN(entry.position, 3) || [0, 0, 0]
  const rotation = asVecN(entry.rotation, 3) || [0, 0, 0]
  let scale: any = entry.scale
  if (Array.isArray(scale)) {
    const s = asVecN(scale, 3) || [1, 1, 1]
    scale = [s[0], s[1], s[2]]
  } else if (typeof scale !== 'number') {
    scale = 1
  }
  const worldPosition = asVecN(entry.worldPosition, 3)
  const worldQuaternion = asVecN(entry.worldQuaternion, 4)
  const worldScale = asVecN(entry.worldScale, 3)
  const worldCenter = asVecN(entry.worldCenter, 3)

  // Use world transform as source of truth if present
  const out: any = { id, modelName, position, rotation, scale }
  if (worldPosition && worldQuaternion && worldScale) {
    out.worldPosition = worldPosition
    out.worldQuaternion = worldQuaternion
    out.worldScale = worldScale
  }
  if (worldCenter) out.worldCenter = worldCenter
  if (entry.__deleted) out.__deleted = true
  return out
}

function normalizeLayout(layout: any): Record<string, any> {
  const out: Record<string, any> = {}
  if (!isPlainObject(layout)) return out
  Object.keys(layout).forEach((k) => {
    const norm = normalizeEntry(layout[k])
    if (norm) out[norm.id] = norm
  })
  return out
}

function fixAllSavedLayouts() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('roomLayout:')) keys.push(k)
    }
    keys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw)
        const normalized = normalizeLayout(parsed)
        localStorage.setItem(key, JSON.stringify(normalized))
        try {
          const ids = Object.keys(normalized)
          console.log('🧩 EXACT_RESTORE/normalized', { key, count: ids.length, sample: ids.slice(0, 3) })
        } catch {}
      } catch (e) {
        console.warn('EXACT_RESTORE: failed to normalize', key, e)
      }
    })
  } catch {}
}

function patchGlobalSave() {
  try {
    const w: any = window as any
    const orig = w.__saveRoomLayout
    w.__saveRoomLayout = function patchedSave() {
      try { orig?.() } catch (e) { console.warn('EXACT_RESTORE: original save failed', e) }
      // After original save writes current map, re-normalize to ensure world fields are present and consistent
      setTimeout(() => {
        try { fixAllSavedLayouts() } catch {}
      }, 60)
    }
  } catch {}
}

function ensureRestoreReady() {
  // Normalize any existing saved layouts early so consumers read consistent data
  try { fixAllSavedLayouts() } catch {}
}

(function init() {
  if (typeof window === 'undefined') return
  if (!isEnabled()) return
  try {
    ensureRestoreReady()
    // Patch shortly after hydration to let VirtualRoom install globals
    setTimeout(() => patchGlobalSave(), 0)
    console.log('✅ EXACT_RESTORE enabled')
  } catch (e) {
    console.warn('EXACT_RESTORE init failed', e)
  }
})()
