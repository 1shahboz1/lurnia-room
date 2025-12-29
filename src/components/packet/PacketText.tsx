import * as React from 'react'
import { useEffect, useRef } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

export type PacketTextProps = Omit<React.ComponentProps<typeof Text>, 'depthTest' | 'depthWrite' | 'polygonOffset' | 'polygonOffsetFactor' | 'polygonOffsetUnits'> & {
  depthTest?: boolean
  depthWrite?: boolean
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
}

export default function PacketText({
  depthTest,
  depthWrite,
  polygonOffset,
  polygonOffsetFactor,
  polygonOffsetUnits,
  ...rest
}: PacketTextProps) {
  const ref = useRef<any>(null)

  useEffect(() => {
    const obj = ref.current as any
    if (!obj) return
    const mat = obj.material as THREE.Material & {
      depthTest?: boolean
      depthWrite?: boolean
      polygonOffset?: boolean
      polygonOffsetFactor?: number
      polygonOffsetUnits?: number
      side?: THREE.Side
      toneMapped?: boolean
    }
    if (mat) {
      const dt = depthTest ?? false
      const dw = depthWrite ?? false
      const po = polygonOffset ?? true
      const pof = polygonOffsetFactor ?? -2
      const pou = polygonOffsetUnits ?? -2

      mat.depthTest = dt
      mat.depthWrite = dw
      mat.side = THREE.FrontSide
      mat.polygonOffset = po
      mat.polygonOffsetFactor = pof
      mat.polygonOffsetUnits = pou
      ;(mat as any).toneMapped = false
      mat.needsUpdate = true
    }
  }, [depthTest, depthWrite, polygonOffset, polygonOffsetFactor, polygonOffsetUnits])

  return <Text ref={ref} {...rest} />
}
