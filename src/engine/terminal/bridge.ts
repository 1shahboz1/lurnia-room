'use client'

import type { Command } from '@/types/terminal'

// Room-driven terminal command spec (subset of RoomConfigV1.terminal.commands)
export type RoomTerminalCommand = {
  id: string
  match: string // e.g., "dig*", "curl*"
  onRun: Array<{ phase?: string; flow?: string }>
  help?: string
}

/**
 * Compile room terminal specs to legacy Terminal Command[]
 * Notes:
 * - We currently support mapping to startPhase effects only. Flow triggers are ignored for now.
 * - Args are not extracted; commands accept free-form tails (e.g., "dig example.com").
 */
export function compileToTerminalCommands(specs: RoomTerminalCommand[] | undefined | null): Command[] {
  const list = Array.isArray(specs) ? specs : []
  return list.map((c) => {
    // Build help text from onRun targets if not provided
    const targets = (c.onRun || [])
      .map((e) => (e.phase ? `phase:${e.phase}` : (e.flow ? `flow:${e.flow}` : '')))
      .filter(Boolean)
      .join(', ')
    const help = c.help || (targets ? `Run ${targets}` : 'Run room action')

    // Map to legacy Command: id + no args + startPhase effects
    const effects = (c.onRun || [])
      .filter((e) => !!e.phase)
      .map((e) => ({ type: 'startPhase' as const, phase: e.phase as any }))

    return {
      id: c.id,
      usage: c.id,
      help,
      args: [],
      effects,
    }
  })
}
