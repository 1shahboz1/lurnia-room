'use client'

// Minimal, deterministic Flow runner with window event wiring
// Events emitted:
// - 'flow:segment' { flowId, index, from, to, color?, speed? }
// - 'flow:ended'   { flowId }
// Commands listened (optional external control):
// - 'flow:pause'   { flowId? }
// - 'flow:resume'  { flowId? }
// - 'flow:stop'    { flowId? }
// Arrival notifications expected from renderer:
// - 'flow:segment-arrival' { flowId, index }

export type FlowStyle = { color?: string; speed?: number; width?: number; shape?: 'pill'|'dot'|'arrow' }
export type FlowSpec = { id: string; path: string[]; style?: FlowStyle }

type Resolver = (() => void) | null

export class FlowRunner {
  private flows: Map<string, FlowSpec>
  private currentId: string | null = null
  private segIdx: number = -1
  private paused = false
  private doneResolver: Resolver = null

  constructor(flows: FlowSpec[] = []) {
    this.flows = new Map((flows || []).map(f => [f.id, f]))
    this.handleArrival = this.handleArrival.bind(this)
    this.handleExternalCtl = this.handleExternalCtl.bind(this)
  }

  attachWindow() {
    if (typeof window === 'undefined') return this
    window.addEventListener('flow:segment-arrival', this.handleArrival as any)
    window.addEventListener('flow:pause', this.handleExternalCtl as any)
    window.addEventListener('flow:resume', this.handleExternalCtl as any)
    window.addEventListener('flow:stop', this.handleExternalCtl as any)
    ;(window as any).__FLOW_RUNNER__ = this
    return this
  }

  detachWindow() {
    if (typeof window === 'undefined') return this
    window.removeEventListener('flow:segment-arrival', this.handleArrival as any)
    window.removeEventListener('flow:pause', this.handleExternalCtl as any)
    window.removeEventListener('flow:resume', this.handleExternalCtl as any)
    window.removeEventListener('flow:stop', this.handleExternalCtl as any)
    return this
  }

  private emit(name: string, detail: any) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })) } catch {}
  }

  private getCurrent(): FlowSpec | null {
    if (!this.currentId) return null
    return this.flows.get(this.currentId) || null
  }

  private emitSegment() {
    const cur = this.getCurrent(); if (!cur) return
    const from = cur.path[this.segIdx]
    const to = cur.path[this.segIdx + 1]
    const color = cur.style?.color
    const speed = cur.style?.speed
    this.emit('flow:segment', { flowId: cur.id, index: this.segIdx, from, to, color, speed })
  }

  private complete(flowId: string) {
    const r = this.doneResolver; this.doneResolver = null
    this.currentId = null; this.segIdx = -1; this.paused = false
    this.emit('flow:ended', { flowId })
    if (r) try { r() } catch {}
  }

  private handleArrival(e: any) {
    const d = e?.detail || {}
    if (!this.currentId || d.flowId !== this.currentId) return
    if (this.paused) return // ignore while paused
    // advance
    const cur = this.getCurrent(); if (!cur) return
    if (d.index !== this.segIdx) return // out-of-sync arrival; ignore
    if (this.segIdx + 1 < cur.path.length - 1) {
      this.segIdx += 1
      this.emitSegment()
    } else {
      this.complete(cur.id)
    }
  }

  private handleExternalCtl(e: any) {
    const d = e?.detail || {}
    const id: string | null = d.flowId || this.currentId
    const name = (e?.type || '').toLowerCase()
    if (!id || id !== this.currentId) return
    if (name === 'flow:pause') {
      this.paused = true
      this.emit('packet-control', { action: 'pause' })
    } else if (name === 'flow:resume') {
      this.paused = false
      this.emit('packet-control', { action: 'resume' })
    } else if (name === 'flow:stop') {
      this.emit('packet-control', { action: 'pause' })
      const fid = this.currentId
      this.currentId = null; this.segIdx = -1; this.paused = false
      if (fid) this.emit('flow:ended', { flowId: fid })
      const r = this.doneResolver; this.doneResolver = null; if (r) try { r() } catch {}
    }
  }

  play(flowId: string): Promise<void> {
    const cur = this.flows.get(flowId)
    if (!cur || !Array.isArray(cur.path) || cur.path.length < 2) {
      return Promise.reject(new Error(`Unknown or invalid flow: ${flowId}`))
    }
    // Reset any current flow
    this.currentId = cur.id
    this.segIdx = 0
    this.paused = false

    // Apply optional speed via packet-control (renderer may choose to honor)
    if (typeof cur.style?.speed === 'number') {
      const v = Math.max(0.1, Math.min(4, Number(cur.style.speed)))
      this.emit('packet-control', { action: 'speed', value: v })
    }

    // Emit first segment and resolve when done
    this.emitSegment()
    return new Promise<void>((resolve) => {
      this.doneResolver = resolve
    })
  }
}
