import { Billboard, Text } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'

export type ClientInfraLabelProps = {
  targets?: string[]            // object names to try (e.g., ['Web Server','CDN Edge','web','cdn'])
  aliasFallback?: string[]      // alias names to try (e.g., ['desktop1','switch1'])
  fallbackPosition?: [number, number, number] // used if nothing found
  lift?: number                 // vertical offset above computed center/top
  fontSize?: number
  color?: string
  occlude?: boolean             // when true, depthTest so walls/objects can occlude the label
  offset?: [number, number, number] // extra world-space offset (x,y,z) applied after positioning
  debug?: boolean
}

export default function ClientInfraLabel({
  targets = ['Web Server', 'CDN Edge', 'web', 'cdn'],
  aliasFallback = [],
  fallbackPosition = [0, 3.0, 0],
  lift = 0.8,
  fontSize = 2.0,
  color = '#10b981',
  occlude = true,
  offset = [0, 0, 0],
  debug = false,
}: ClientInfraLabelProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), acc: new THREE.Vector3(), box: new THREE.Box3() }), [])
  const { scene } = useThree()

  const findTargets = () => {
    const found: THREE.Object3D[] = []
    for (const t of targets) {
      const o = scene.getObjectByName(t)
      if (o) found.push(o)
    }
    for (const t of aliasFallback) {
      const o = scene.getObjectByName(t)
      if (o && !found.includes(o)) found.push(o)
    }
    return found
  }

  const lastLogRef = useRef(0)
  useFrame((state) => {
    const g = groupRef.current
    if (!g) return

    const objs = findTargets()
    if (objs.length) {
      // Union world-space bounds of all found objects
      tmp.box.makeEmpty()
      let any = false
      for (const o of objs) {
        try { o.updateMatrixWorld(true) } catch {}
        const b = new THREE.Box3().setFromObject(o)
        if (isFinite(b.min.x) && isFinite(b.max.x)) {
          if (!any) { tmp.box.copy(b); any = true } else { tmp.box.union(b) }
        }
      }
      if (any) {
        const c = tmp.box.getCenter(tmp.acc)
        c.y = tmp.box.max.y + lift
        c.x += offset[0]; c.y += offset[1]; c.z += offset[2]
        g.position.copy(c)
        if (debug && state.clock.elapsedTime - lastLogRef.current > 0.75) {
          lastLogRef.current = state.clock.elapsedTime
          try { console.log('[ClientInfraLabel] pos', { mode: 'union', found: objs.length, pos: { x: c.x.toFixed(2), y: c.y.toFixed(2), z: c.z.toFixed(2) }, offset, lift }) } catch {}
        }
        return
      }
    }

    // Fallback position if nothing is found or bounds invalid
    const fx = fallbackPosition[0] + offset[0]
    const fy = fallbackPosition[1] + offset[1]
    const fz = fallbackPosition[2] + offset[2]
    g.position.set(fx, fy, fz)
    if (debug && state.clock.elapsedTime - lastLogRef.current > 0.75) {
      lastLogRef.current = state.clock.elapsedTime
      try { console.log('[ClientInfraLabel] pos', { mode: 'fallback', pos: { x: fx.toFixed(2), y: fy.toFixed(2), z: fz.toFixed(2) }, offset, lift }) } catch {}
    }
  })

  return (
    <group ref={groupRef}>
      <Billboard follow>
        <Text
          fontSize={fontSize}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000"
          material-depthTest={occlude}
          material-depthWrite={false}
          material-transparent
          material-toneMapped={false}
        >
          Service Provider
        </Text>
      </Billboard>
    </group>
  )
}
