import type { RoomConfigV1 } from '@/schemas/room-contract'
import type { RoomConfig, RoomObject } from '@/utils/glb-loader'
import type { RoomDescription } from '@/utils/room-loader'

type EngineLighting = 'bright' | 'dim' | 'ambient' | 'dramatic'
function toEngineLighting(input?: string): EngineLighting {
  const allowed: EngineLighting[] = ['bright', 'dim', 'ambient', 'dramatic']
  if (input && (allowed as string[]).includes(input)) return input as EngineLighting
  return 'bright'
}

function toModelNamePath(model: string, category?: string): string {
  if (!model) return category || ''
  // Guardrail: authors sometimes include '/public' prefix; Next serves from root
  if (model.startsWith('/public/')) model = model.replace(/^\/public/, '')
  // Accept absolute or already-suffixed paths (handled by useOptimizedGLB)
  if (model.startsWith('/')) return model
  if (model.toLowerCase().endsWith('.glb')) return `/${model}`
  // Fallback: if author provided 'inventory/', keep it; engine will prefix '/'
  if (model.startsWith('inventory/')) return model
  // As a last resort, if no model provided, try category as a hint (e.g., 'router', 'server')
  return category || model
}

export function toEngineConfig(v1: RoomConfigV1): RoomConfig {
  const objects: RoomObject[] = v1.devices.map((d) => ({
    id: d.alias,
    type: 'model',
    modelName: toModelNamePath(d.model, d.category),
    position: d.position,
    rotation: d.rotation as any,
    scale: d.scale as any,
    quality: (d.quality as any) ?? 'medium',
    interactive: true,
    physics: undefined,
    metadata: { ...(d.metadata || {}), category: d.category, alias: d.alias },
  }))

  // Map V1 structure -> engine roomStructure (adds safe defaults expected by DynamicRoomStructure)
  const roomStructure: RoomDescription['structure'] = {
    dimensions: {
      width: v1.structure.dimensions.width,
      height: v1.structure.dimensions.height,
      depth: v1.structure.dimensions.depth,
    },
    floor: {
      material: { color: '#808080', roughness: 0.95, textureRepeat: [8, 6] },
    },
    walls: {
      material: { color: '#ffffff', roughness: 0.95 },
      // accent_wall optional; author can add via future schema revisions
    } as any,
    ceiling: {
      material: { color: '#e5e7eb', roughness: 0.95 },
      thickness: 0.05,
      // lights optional
    },
    // Engine expects decorative_elements; forward V1 decor items verbatim
    decorative_elements: (v1.structure.decor || []).map((el: any) => ({ ...el })),
  }

  const engineConfig: RoomConfig = {
    id: v1.id,
    name: v1.meta.title,
    description: v1.meta.summary,
    environment: {
      background: v1.environment?.background,
      lighting: toEngineLighting(v1.theme?.lighting as any),
      shadows: v1.environment?.shadows ?? true,
    },
    camera: {
      position: v1.camera.position as any,
      target: v1.camera.target as any,
      fov: v1.camera.fov ?? 60,
    },
    objects,
    roomStructure,
    // Forward v1 DSL and content fields for engines that opt-in (typed as any to avoid coupling)
    ...(v1.flows ? { flows: v1.flows as any } : {}),
    ...(v1.phases ? { phases: v1.phases as any } : {}),
    ...(v1.terminal ? { terminal: v1.terminal as any } : {}),
    ...(v1.content ? { content: v1.content as any } : {}),
  }

  return engineConfig
}
