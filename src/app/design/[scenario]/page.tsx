import { RoomConfigV1 } from '@/schemas/room-contract'
import { toEngineConfig } from '@/engine/adapters/fromV1'
import ClientDesignSandbox from './ClientDesignSandbox'

export const dynamic = 'force-dynamic'

export default async function DesignScenarioPage({ params }: { params: { scenario: string } }) {
  const slug = params.scenario
  const srcPath = `/rooms/${slug}.source.json`

  let data: any | null = null
  let loadError: string | null = null
  try {
    if (typeof window === 'undefined') {
      const { readFile } = await import('fs/promises')
      const { join } = await import('path')
      const filePath = join(process.cwd(), 'public', 'rooms', `${slug}.source.json`)
      const raw = await readFile(filePath, 'utf-8')
      data = JSON.parse(raw)
    } else {
      const res = await fetch(srcPath, { cache: 'no-store' })
      if (!res.ok) loadError = `Source not found at ${srcPath}`
      else data = await res.json()
    }
  } catch (e: any) {
    if (e?.code === 'ENOENT') loadError = `Source not found at ${srcPath}`
    else if (e?.name === 'SyntaxError') loadError = `Invalid JSON in ${srcPath}`
    else loadError = `Failed to load ${srcPath}: ${e?.message || 'unknown error'}`
  }

  // Validate against v1 schema (non-throwing)
  const parsed = data ? RoomConfigV1.safeParse(data) : null

  // Prepare optional preview if valid
  const engineConfig = parsed?.success ? toEngineConfig(parsed.data) : null

  // Collect design-time hints (best-effort, tolerant to missing fields)
  const hints: string[] = []
  try {
    if (data) {
      const decor = (data?.structure?.decor ?? []) as any[]
      for (const el of decor) {
        if (!el || typeof el !== 'object') continue
        if (el.type === 'window_view' && el.scale == null) {
          hints.push(`decor '${el.id || 'window'}' (window_view) is missing scale; include e.g. [7.5,4.2,0.15] to avoid camera issues`)
        }
        if (el.type === 'ceiling_light_panels' && (!Array.isArray(el.panels) || el.panels.length === 0)) {
          hints.push(`decor '${el.id || 'ceiling-panels'}' has no panels; add panels: [{ position:[x,y,z], size:[w,0.03,d] }]`)
        }
        if (el.type === 'firewall_wall' && (typeof el.thickness === 'number') && el.thickness < 0.02) {
          hints.push(`decor '${el.id || 'panel'}' thickness < 0.02; using >= 0.02 avoids z-fighting and occlusion`)
        }
      }
      const devices = (data?.devices ?? []) as any[]
      for (const d of devices) {
        if (typeof d?.model === 'string' && d.model.startsWith('/public/')) {
          hints.push(`device '${d.alias || d.model}': model path starts with /public; adapter strips this prefix (prefer '/inventory/...')`)
        }
      }
    }
  } catch {}

  const isValid = !!(parsed && parsed.success)
  const isInvalid = !!(parsed && !parsed.success)
  const validationErrors = isInvalid ? parsed!.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) : []

  const headerClass = loadError || isInvalid ? 'border-red-500 bg-red-500/10' : isValid ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-500 bg-gray-500/10'
  const statusText = loadError ? 'Load error' : isInvalid ? 'Invalid v1 config' : isValid ? 'Valid v1 config' : 'No data'
  const statusColor = loadError || isInvalid ? 'text-red-300' : isValid ? 'text-emerald-300' : 'text-gray-300'

  if (isValid && engineConfig) {
    return (
      <ClientDesignSandbox engineConfig={engineConfig} slug={slug} />
    )
  }

  return (
    <div className="h-screen w-full relative bg-black text-white">
      {/* Overlay with validation status and hints */}
      <div className="absolute top-4 right-4 max-w-xl z-50">
        <div className={`rounded-lg border ${headerClass} p-4 shadow-lg`}> 
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Design Sandbox — {slug}.source.json</h2>
            <span className={`text-xs ${statusColor}`}>{statusText}</span>
          </div>

          {loadError && (
            <div className="mt-2 text-sm text-red-300">
              {loadError}
            </div>
          )}

          {!loadError && isInvalid && (
            <div className="mt-2">
              <div className="text-xs text-red-200 mb-1">Validation errors:</div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-red-200/90 max-h-48 overflow-auto">
                {validationErrors.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </div>
          )}

          {!!hints.length && (
            <div className="mt-3">
              <div className="text-xs text-yellow-200 mb-1">Hints:</div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-yellow-200/90 max-h-40 overflow-auto">
                {hints.map((h, i) => (<li key={i}>{h}</li>))}
              </ul>
            </div>
          )}

          <div className="mt-3 text-[11px] text-gray-300/80">
            Path: <code className="text-gray-200">{srcPath}</code>
          </div>
        </div>
      </div>

      <div className="h-full w-full grid place-items-center">
        <div className="text-center text-gray-300">
          <div className="text-xl font-semibold mb-2">No preview</div>
          <div className="text-sm">
            {loadError ? 'Create the source JSON to enable preview.' : isInvalid ? `Fix the validation errors in ${srcPath} to enable live preview.` : `Add ${srcPath} to preview the draft.`}
          </div>
        </div>
      </div>
    </div>
  )
}
