export type ModelQuality = 'high' | 'medium' | 'low'

export interface GLBModelConfig {
  name: string
  basePath: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  quality?: ModelQuality
  castShadow?: boolean
  receiveShadow?: boolean
}

export function getModelPath(baseName: string, quality: ModelQuality = 'medium'): string {
  const basePath = `/models/${baseName}`
  switch (quality) {
    case 'high':
      return `${basePath}_ktx2.glb`
    case 'medium':
      return `${basePath}_opt.glb`
    case 'low':
      return `${basePath}_opt.glb`
    default:
      return `${basePath}.glb`
  }
}

export function getModelFallbacks(baseName: string, _quality: ModelQuality): string[] {
  const basePath = `/models/${baseName}`
  return [`${basePath}.glb`]
}

import { useGLTF } from '@react-three/drei'
import { useMemo, useState } from 'react'
import type { GLTF } from 'three-stdlib'

export function useOptimizedGLB(modelName: string, _quality: ModelQuality = 'medium') {
  const modelPath = useMemo(() => {
    if (!modelName) return ''
    return modelName.startsWith('inventory/') ? `/${modelName}.glb` : `/models/${modelName}.glb`
  }, [modelName])
  const gltfResult = useGLTF(modelPath || '/models/router.glb')
  const gltf = useMemo(() => gltfResult, [gltfResult])
  return { gltf, loading: false, error: null as any, modelPath }
}

export interface RoomObject {
  id: string
  type: 'model' | 'primitive'
  modelName?: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  quality?: ModelQuality
  interactive?: boolean
  physics?: { enabled: boolean; type: 'static' | 'dynamic' | 'kinematic' }
  metadata?: Record<string, unknown>
}

export interface RoomConfig {
  id: string
  name: string
  description?: string
  environment?: { background?: string; lighting?: 'bright' | 'dim' | 'ambient' | 'dramatic'; shadows?: boolean }
  camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number }
  objects: RoomObject[]
  roomStructure?: any
}

export function useRoomManager(config: RoomConfig) {
  const [loadedObjects, setLoadedObjects] = useState<Record<string, GLTF>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleObjectLoad = (objectId: string, gltf: GLTF) => {
    setLoadedObjects(prev => ({ ...prev, [objectId]: gltf }))
  }
  const handleObjectError = (objectId: string, error: string) => {
    setErrors(prev => ({ ...prev, [objectId]: error }))
  }
  const isFullyLoaded = useMemo(() => {
    return config.objects.every(obj => obj.id in loadedObjects || obj.id in errors)
  }, [config.objects, loadedObjects, errors])
  const totalProgress = useMemo(() => {
    if (config.objects.length === 0) return 100
    const loaded = Object.keys(loadedObjects).length
    const errored = Object.keys(errors).length
    return Math.round(((loaded + errored) / config.objects.length) * 100)
  }, [config.objects.length, loadedObjects, errors])

  return { loadedObjects, errors, isFullyLoaded, totalProgress, handleObjectLoad, handleObjectError }
}

export const availableModels = {
  router: { name: 'Router', basePath: 'router', category: 'networking', description: '' },
  server: { name: 'Server', basePath: 'server', category: 'infrastructure', description: '' }
} as const
export type AvailableModelKey = keyof typeof availableModels

export function preloadModels(_modelNames: AvailableModelKey[], _quality: ModelQuality = 'medium') {
  return Promise.resolve([])
}

export function getModelInfo(modelName: string, quality: ModelQuality = 'medium') {
  const basePath = `/models/${modelName}`
  const modelPath = getModelPath(modelName, quality)
  return { name: modelName, path: modelPath, basePath, quality, fallbacks: getModelFallbacks(modelName, quality) }
}
