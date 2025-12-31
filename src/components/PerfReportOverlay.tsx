'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePerformanceStats } from '@/components/PerformanceStats'

type RenderMode = 'safe' | 'normal'

type WebGLInfo = {
  vendor?: string
  renderer?: string
  version?: string
  shadingLanguageVersion?: string
}

function readWebGLInfo(): WebGLInfo {
  try {
    const w = window as any
    return (w.__WEBGL_INFO__ || {}) as WebGLInfo
  } catch {
    return {}
  }
}

function formatMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export default function PerfReportOverlay({
  enabled,
  roomId,
  renderMode,
  renderModeSource,
  renderModeLocked,
  isFullyLoaded,
  progress,
  loadMs,
}: {
  enabled: boolean
  roomId?: string
  renderMode: RenderMode
  renderModeSource: string
  renderModeLocked: boolean
  isFullyLoaded: boolean
  progress: number
  loadMs: number | null
}) {
  const { metrics } = usePerformanceStats()

  const [copied, setCopied] = useState(false)
  const [webgl, setWebgl] = useState<WebGLInfo>({})

  const env = useMemo(() => {
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as any
    const scr = typeof window !== 'undefined' ? window.screen : undefined
    return {
      ua: nav?.userAgent || 'unknown',
      cores: typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
      deviceMemoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio : null,
      screen: scr ? `${scr.width}x${scr.height}` : 'unknown',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setWebgl(readWebGLInfo())
    const t = setInterval(() => setWebgl(readWebGLInfo()), 1500)
    return () => clearInterval(t)
  }, [enabled])

  const copyReport = useCallback(async () => {
    const lines: string[] = []
    lines.push('AI Rooms 3D — Performance Report')
    lines.push(`room: ${roomId || 'unknown'}`)
    lines.push(`loaded: ${isFullyLoaded ? 'yes' : 'no'} (progress=${Math.round(progress)}%)`)
    lines.push(`loadTime: ${formatMs(loadMs)}`)
    lines.push('')
    lines.push(`renderMode: ${renderMode} (source=${renderModeSource}${renderModeLocked ? ', locked' : ''})`)
    lines.push(`fps: ${metrics.fps} (frameTime=${metrics.frameTime} ms)`)
    lines.push(`drawCalls: ${metrics.drawCalls}  triangles: ${metrics.triangles}`)
    lines.push(`geometries: ${metrics.geometries}  textures: ${metrics.textures}  programs: ${metrics.programs}`)
    lines.push('')
    lines.push(`dpr: ${env.dpr}  viewport: ${env.viewport}  screen: ${env.screen}`)
    lines.push(`cores: ${env.cores ?? 'n/a'}  deviceMemoryGB: ${env.deviceMemoryGb ?? 'n/a'}`)
    lines.push(`webgl.vendor: ${webgl.vendor || 'n/a'}`)
    lines.push(`webgl.renderer: ${webgl.renderer || 'n/a'}`)
    lines.push(`webgl.version: ${webgl.version || 'n/a'}`)
    lines.push(`webgl.glsl: ${webgl.shadingLanguageVersion || 'n/a'}`)

    const text = lines.join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
      return
    } catch {
      // Fallback: old-school textarea copy
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        ta.style.top = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      } catch {
        // ignore
      }
    }
  }, [env.cores, env.deviceMemoryGb, env.dpr, env.screen, env.viewport, isFullyLoaded, loadMs, metrics.drawCalls, metrics.fps, metrics.frameTime, metrics.geometries, metrics.programs, metrics.textures, metrics.triangles, progress, renderMode, renderModeLocked, renderModeSource, roomId, webgl.renderer, webgl.shadingLanguageVersion, webgl.vendor, webgl.version])

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.82)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: 12,
        padding: 12,
        color: '#e5e7eb',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.35,
        maxWidth: 420,
        pointerEvents: 'auto',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      }}
      role="region"
      aria-label="Performance report"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Perf Report</div>
        <button
          onClick={copyReport}
          style={{
            background: copied ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.2)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: '#e5e7eb',
            borderRadius: 10,
            padding: '6px 10px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>

      <div style={{ marginTop: 8, opacity: 0.95 }}>
        <div>room: <span style={{ color: '#93c5fd' }}>{roomId || 'unknown'}</span></div>
        <div>loaded: {isFullyLoaded ? 'yes' : 'no'} (progress {Math.round(progress)}%) • load {formatMs(loadMs)}</div>
        <div>mode: <span style={{ color: renderMode === 'safe' ? '#fbbf24' : '#4ade80' }}>{renderMode.toUpperCase()}</span> <span style={{ opacity: 0.7 }}>({renderModeSource}{renderModeLocked ? ', locked' : ''})</span></div>
      </div>

      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(148, 163, 184, 0.18)' }}>
        <div>fps: <span style={{ fontWeight: 800 }}>{metrics.fps}</span> • frame {metrics.frameTime} ms</div>
        <div>calls: {metrics.drawCalls} • tris: {metrics.triangles}</div>
        <div>tex: {metrics.textures} • geo: {metrics.geometries} • prog: {metrics.programs}</div>
      </div>

      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(148, 163, 184, 0.18)', opacity: 0.9 }}>
        <div>dpr: {env.dpr ?? 'n/a'} • viewport: {env.viewport}</div>
        <div>cores: {env.cores ?? 'n/a'} • mem: {env.deviceMemoryGb ?? 'n/a'} GB</div>
        <div style={{ marginTop: 6 }}>
          <div style={{ opacity: 0.85 }}>webgl: {webgl.renderer || 'n/a'}</div>
        </div>
      </div>

      <div style={{ marginTop: 8, opacity: 0.65, fontSize: 11 }}>
        Tip: share this report text (no screenshots needed).
      </div>
    </div>
  )
}
