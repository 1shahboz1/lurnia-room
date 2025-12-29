'use client'

import { FlowRunner } from '@/engine/flows/flowRunner'

type Action_ShowDecor = { showDecor: string[] }
type Action_HideDecor = { hideDecor: string[] }
type Action_PlayFlow  = { playFlow: string }
type Action_PauseFlow = { pauseFlow: string }
type Action_HUD       = { hud: string }
type Action_CameraTo  = { cameraTo: { target: string } }

export type PhaseAction = Action_ShowDecor | Action_HideDecor | Action_PlayFlow | Action_PauseFlow | Action_HUD | Action_CameraTo
export type PhaseSpec = { id: string; actions: PhaseAction[] }

function isShow(a: PhaseAction): a is Action_ShowDecor { return (a as any).showDecor != null }
function isHide(a: PhaseAction): a is Action_HideDecor { return (a as any).hideDecor != null }
function isPlay(a: PhaseAction): a is Action_PlayFlow  { return (a as any).playFlow  != null }
function isPause(a: PhaseAction): a is Action_PauseFlow { return (a as any).pauseFlow != null }
function isHUD(a: PhaseAction): a is Action_HUD       { return (a as any).hud      != null }
function isCam(a: PhaseAction): a is Action_CameraTo  { return (a as any).cameraTo  != null }

export class PhaseRunner {
  private phases: Map<string, PhaseSpec>
  private flow: FlowRunner
  private running = false

  constructor(phases: PhaseSpec[] = [], flowRunner: FlowRunner) {
    this.phases = new Map((phases || []).map(p => [p.id, p]))
    this.flow = flowRunner
  }

  private emit(name: string, detail: any) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })) } catch {}
  }

  async run(phaseId: string): Promise<void> {
    const phase = this.phases.get(phaseId)
    if (!phase) throw new Error(`Unknown phase: ${phaseId}`)
    if (this.running) throw new Error('PhaseRunner already running')
    this.running = true
    this.emit('phase:started', { id: phaseId })
    try {
      for (const act of (phase.actions || [])) {
        if (isShow(act)) {
          this.emit('decor-visibility', { show: act.showDecor })
        } else if (isHide(act)) {
          this.emit('decor-visibility', { hide: act.hideDecor })
        } else if (isHUD(act)) {
          this.emit('hud:text', { text: act.hud })
        } else if (isCam(act)) {
          const target = act.cameraTo?.target
          if (target) this.emit('phase:camera', { target })
        } else if (isPause(act)) {
          this.emit('flow:pause', { flowId: act.pauseFlow })
        } else if (isPlay(act)) {
          await this.flow.play(act.playFlow)
        }
      }
    } finally {
      this.running = false
      this.emit('phase:ended', { id: phaseId })
    }
  }

  async runSequence(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.run(id)
    }
  }

  attachWindow() {
    if (typeof window === 'undefined') return this
    const onRun = (e: any) => {
      const id = e?.detail?.id
      if (id) this.run(id).catch(err => console.warn('[phaseRunner] run error', err))
    }
    const onRunSeq = (e: any) => {
      const arr = e?.detail?.ids
      if (Array.isArray(arr) && arr.length) this.runSequence(arr).catch(err => console.warn('[phaseRunner] runSequence error', err))
    }
    window.addEventListener('phase:run', onRun as any)
    window.addEventListener('phase:runSequence', onRunSeq as any)
    ;(window as any).__PHASE_RUNNER__ = this
    return this
  }
}
