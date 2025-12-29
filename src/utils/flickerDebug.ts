/**
 * Flickering Debug Utility
 * Tracks render state changes and detects potential z-fighting issues
 */

import * as THREE from 'three'

interface MeshState {
  id: string
  position: THREE.Vector3
  renderOrder: number
  depthTest: boolean
  depthWrite: boolean
  polygonOffset: boolean
  polygonOffsetFactor: number
  polygonOffsetUnits: number
  materialType: string
  visible: boolean
  timestamp: number
}

const meshStates = new Map<string, MeshState[]>()
const MAX_HISTORY = 10

export function trackMeshState(
  mesh: THREE.Mesh,
  id: string,
  label: string
) {
  const material = mesh.material as THREE.MeshBasicMaterial
  const worldPos = new THREE.Vector3()
  mesh.getWorldPosition(worldPos)

  const state: MeshState = {
    id,
    position: worldPos.clone(),
    renderOrder: mesh.renderOrder,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
    materialType: material.type,
    visible: mesh.visible,
    timestamp: Date.now()
  }

  if (!meshStates.has(id)) {
    meshStates.set(id, [])
  }

  const history = meshStates.get(id)!
  history.push(state)

  // Keep only recent history
  if (history.length > MAX_HISTORY) {
    history.shift()
  }

  // Detect rapid state changes (potential flickering)
  if (history.length >= 3) {
    const recent = history.slice(-3)
    const hasRapidChanges = recent.some((s, i) => {
      if (i === 0) return false
      const prev = recent[i - 1]
      const timeDiff = s.timestamp - prev.timestamp
      const posChanged = !s.position.equals(prev.position)
      const renderOrderChanged = s.renderOrder !== prev.renderOrder
      const depthChanged = s.depthTest !== prev.depthTest || s.depthWrite !== prev.depthWrite
      
      return timeDiff < 100 && (posChanged || renderOrderChanged || depthChanged)
    })

    if (hasRapidChanges) {
      console.warn(`⚡ [FLICKERING DETECTED] ${label} - ${id}:`, {
        recentStates: recent,
        message: 'Rapid render state changes detected - potential flickering'
      })
    }
  }
}

export function detectZFighting(
  meshes: Array<{ id: string, mesh: THREE.Mesh }>,
  threshold: number = 0.01
) {
  const positions = meshes.map(({ id, mesh }) => {
    const worldPos = new THREE.Vector3()
    mesh.getWorldPosition(worldPos)
    return { id, position: worldPos }
  })

  const conflicts: Array<{ mesh1: string, mesh2: string, distance: number }> = []

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = positions[i].position.distanceTo(positions[j].position)
      if (dist < threshold) {
        conflicts.push({
          mesh1: positions[i].id,
          mesh2: positions[j].id,
          distance: dist
        })
      }
    }
  }

  if (conflicts.length > 0) {
    console.error('🔴 [Z-FIGHTING DETECTED] Overlapping meshes:', conflicts)
  }

  return conflicts
}

export function logMeshHierarchy(root: THREE.Object3D, label: string) {
  console.group(`📊 [Mesh Hierarchy] ${label}`)
  
  const meshes: Array<{
    name: string
    type: string
    renderOrder: number
    localPos: [number, number, number]
    worldPos: [number, number, number]
    depthTest: boolean
    depthWrite: boolean
  }> = []

  root.traverse((obj) => {
    if ((obj as any).isMesh) {
      const mesh = obj as THREE.Mesh
      const material = mesh.material as THREE.MeshBasicMaterial
      const worldPos = new THREE.Vector3()
      mesh.getWorldPosition(worldPos)
      
      meshes.push({
        name: mesh.name || 'unnamed',
        type: material.type,
        renderOrder: mesh.renderOrder,
        localPos: mesh.position.toArray() as [number, number, number],
        worldPos: worldPos.toArray() as [number, number, number],
        depthTest: material.depthTest,
        depthWrite: material.depthWrite
      })
    }
  })

  console.table(meshes)
  console.groupEnd()
}

export function clearDebugHistory() {
  meshStates.clear()
  console.log('🧹 [Flicker Debug] History cleared')
}
