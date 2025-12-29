import * as React from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'

export type PacketModelProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  color?: string
  emissive?: string
}

export default function PacketModel({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = '#ffffff',
  emissive = '#00ffff',
}: PacketModelProps) {
  const { scene } = useGLTF('/inventory/Packets/network_packet.gltf') as unknown as { scene: THREE.Group }
  const groupRef = React.useRef<THREE.Group>(null)
  const tMatRef = React.useRef<{ body?: THREE.MeshStandardMaterial; flap?: THREE.MeshStandardMaterial; stamp?: THREE.MeshStandardMaterial }>({})

  React.useEffect(() => {
    // Assign materials and clean node names
    scene.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false
        o.receiveShadow = false
        const mat = (o.material ||= new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial
        mat.color = new THREE.Color(color)
        mat.emissive = new THREE.Color(emissive)
        mat.emissiveIntensity = o.name === 'packet_flap' ? 0.16 : o.name === 'packet_stamp' ? 0.1 : 0.12
        mat.metalness = 0.0
        mat.roughness = 0.18
        mat.toneMapped = true
        if (o.name === 'packet_body') tMatRef.current.body = mat
        if (o.name === 'packet_flap') tMatRef.current.flap = mat
        if (o.name === 'packet_stamp') tMatRef.current.stamp = mat
      }
    })
  }, [scene, color, emissive])

  // Subtle emissive pulse
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const s = 0.08 * Math.sin(t * 2.2)
    if (tMatRef.current.body) tMatRef.current.body.emissiveIntensity = 0.12 + s
    if (tMatRef.current.flap) tMatRef.current.flap.emissiveIntensity = 0.16 + s
    if (tMatRef.current.stamp) tMatRef.current.stamp.emissiveIntensity = 0.10 + s
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/inventory/Packets/network_packet.gltf')