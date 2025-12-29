/*
  RoomConfig v1 — canonical, versioned room contract for scalable generation.
  - Strict enough for safety, flexible enough for decor-specific props.
  - Use this both in the app (runtime validation) and in tooling.
*/

import { z } from 'zod'

// Basic vector types
export const Vec3 = z.tuple([z.number(), z.number(), z.number()])
export const Vec3OrNumber = z.union([z.number(), z.tuple([z.number(), z.number(), z.number()])])

// Devices placed in the room
export const Device = z.object({
  alias: z.string().min(1, 'device.alias required'),
  category: z.enum([
    'desktop',
    'laptop',
    'switch',
    'router',
    'firewall',
    'server',
    'earth',
    'misc',
  ], { required_error: 'device.category required' }),
  model: z.string().min(1, 'device.model URL required'),
  position: Vec3,
  rotation: Vec3.optional(),
  scale: Vec3OrNumber.optional(),
  quality: z.enum(['low','medium','high']).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict()

// Decor primitive instance — allow passthrough props so new types can add fields
export const Decor = z.object({
  id: z.string().min(1, 'decor.id required'),
  type: z.string().min(1, 'decor.type required'), // e.g. 'ceiling_soffit', 'window_view', 'tunnel', 'firewall_wall'
  position: Vec3.optional(),
  rotation: Vec3.optional(),
  scale: Vec3OrNumber.optional(),
}).passthrough() // allow component-specific props without breaking schema

export const Link = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}).strict()

export const Flow = z.object({
  id: z.string().min(1),
  path: z.array(z.string().min(1)).min(2, 'flow.path needs at least 2 nodes'),
  style: z.object({
    color: z.string().default('#00e5ff'),
    speed: z.number().default(1.0),
    width: z.number().optional(),
    shape: z.enum(['pill','dot','arrow']).optional(),
  }).default({}),
}).strict()

// Phase actions (normalized to keep deterministic)
const PhaseAction_ShowDecor = z.object({ showDecor: z.array(z.string().min(1)).min(1) })
const PhaseAction_HideDecor = z.object({ hideDecor: z.array(z.string().min(1)).min(1) })
const PhaseAction_PlayFlow  = z.object({ playFlow: z.string().min(1) })
const PhaseAction_PauseFlow = z.object({ pauseFlow: z.string().min(1) })
const PhaseAction_HUD       = z.object({ hud: z.string().min(1) })
const PhaseAction_CameraTo  = z.object({ cameraTo: z.object({ target: z.string().min(1) }) })

export const Phase = z.object({
  id: z.string().min(1),
  actions: z.array(
    z.union([
      PhaseAction_ShowDecor,
      PhaseAction_HideDecor,
      PhaseAction_PlayFlow,
      PhaseAction_PauseFlow,
      PhaseAction_HUD,
      PhaseAction_CameraTo,
    ])
  ).default([]),
}).strict()

// Terminal command mapping
const TerminalEffectPhase = z.object({ phase: z.string().min(1) })
const TerminalEffectFlow  = z.object({ flow: z.string().min(1) })

export const Terminal = z.object({
  commands: z.array(z.object({
    id: z.string().min(1),
    match: z.string().min(1), // e.g. "curl*", "dig*"
    onRun: z.array(z.union([TerminalEffectPhase, TerminalEffectFlow])).min(1),
  })).default([]),
}).strict()

export const Board = z.object({
  id: z.string().min(1),
  anchor: z.string().min(1), // device alias to anchor to
  title: z.string().min(1),
  md: z.string().min(1),     // markdown
}).strict()

export const RoomConfigV1 = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string().min(1), // slug, e.g. 'firewall'
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
  }).strict(),
  theme: z.object({
    palette: z.string().optional(),
    lighting: z.string().optional(),
  }).strict().default({}),
  environment: z.object({
    background: z.string().optional(),
    shadows: z.boolean().default(true),
  }).strict().default({}),
  camera: z.object({
    position: Vec3,
    target: Vec3,
    fov: z.number().default(60),
  }).strict(),
  structure: z.object({
    dimensions: z.object({ width: z.number(), height: z.number(), depth: z.number() }).strict(),
    decor: z.array(Decor).default([]),
  }).strict(),
  devices: z.array(Device).default([]),
  links: z.array(Link).default([]),
  flows: z.array(Flow).default([]),
  phases: z.array(Phase).default([]),
  terminal: Terminal.default({ commands: [] }),
  content: z.object({ boards: z.array(Board).default([]) }).strict().default({ boards: [] }),
}).strict()

export type RoomConfigV1 = z.infer<typeof RoomConfigV1>
