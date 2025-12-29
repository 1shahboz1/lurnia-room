import * as React from 'react'
import { Text as DreiText } from '@react-three/drei'
import * as THREE from 'three'

export type DoubleTextProps = React.ComponentProps<typeof DreiText> & {
  frontOffset?: number
  backOffset?: number
  duplicateBack?: boolean
}

// Renders text readable from both front and back by duplicating the text and flipping the back copy.
// To keep layout consistent when viewed from the back, we swap left/right anchors on the back copy.
export default function Text({
  frontOffset = 0,
  backOffset = 0.0002,
  duplicateBack = true,
  children,
  position,
  rotation,
  ...rest
}: DoubleTextProps) {
  const pos: [number, number, number] = Array.isArray(position)
    ? (position as [number, number, number])
    : [0, 0, 0]

  const frontPos: [number, number, number] = [pos[0], pos[1], (pos[2] ?? 0) + frontOffset]
  const backPos: [number, number, number] = [pos[0], pos[1], (pos[2] ?? 0) - backOffset]

  const ax = (rest as any).anchorX as string | undefined
  const ay = (rest as any).anchorY
  const backAnchorX = ax === 'left' ? 'right' : ax === 'right' ? 'left' : ax

  return (
    <group>
      <DreiText {...rest} position={frontPos} rotation={rotation}>
        {children}
      </DreiText>
      {duplicateBack && (
        <DreiText
          {...rest}
          position={backPos}
          rotation={[0, Math.PI, 0]}
          anchorX={backAnchorX as any}
          anchorY={ay as any}
        >
          {children}
        </DreiText>
      )}
    </group>
  )
}
