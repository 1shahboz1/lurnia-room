'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Light temperature to RGB conversion
export function temperatureToRGB(temperature: number): string {
  temperature = Math.max(1000, Math.min(40000, temperature))
  
  let red, green, blue
  
  if (temperature >= 6600) {
    red = 329.698727446 * Math.pow(temperature / 100 - 60, -0.1332047592)
  } else {
    red = 255
  }
  
  if (temperature >= 6600) {
    green = 288.1221695283 * Math.pow(temperature / 100 - 60, -0.0755148492)
  } else {
    green = 99.4708025861 * Math.log(temperature / 100) - 161.1195681661
  }
  
  if (temperature >= 6600) {
    blue = 255
  } else if (temperature <= 1900) {
    blue = 0
  } else {
    blue = 138.5177312231 * Math.log(temperature / 100 - 10) - 305.0447927307
  }
  
  red = Math.max(0, Math.min(255, red))
  green = Math.max(0, Math.min(255, green))
  blue = Math.max(0, Math.min(255, blue))
  
  const r = Math.round(red).toString(16).padStart(2, '0')
  const g = Math.round(green).toString(16).padStart(2, '0')
  const b = Math.round(blue).toString(16).padStart(2, '0')
  
  return `#${r}${g}${b}`
}

export function SoftDirectionalLight({
  position,
  target,
  intensity = 1,
  temperature = 5500,
  castShadow = true,
  shadowMapSize = 2048,
  shadowCameraNear = 0.5,
  shadowCameraFar = 500,
  shadowRadius = 5,
  shadowBias = -0.0001,
  ...props
}: {
  position: [number, number, number]
  target?: [number, number, number]
  intensity?: number
  temperature?: number
  castShadow?: boolean
  shadowMapSize?: number
  shadowCameraNear?: number
  shadowCameraFar?: number
  shadowRadius?: number
  shadowBias?: number
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null!)
  const color = temperatureToRGB(temperature)
  
  useMemo(() => {
    if (lightRef.current) {
      lightRef.current.shadow.mapSize.width = shadowMapSize
      lightRef.current.shadow.mapSize.height = shadowMapSize
      lightRef.current.shadow.camera.near = shadowCameraNear
      lightRef.current.shadow.camera.far = shadowCameraFar
      lightRef.current.shadow.radius = shadowRadius
      lightRef.current.shadow.bias = shadowBias
      
      lightRef.current.shadow.camera.left = -50
      lightRef.current.shadow.camera.right = 50
      lightRef.current.shadow.camera.top = 50
      lightRef.current.shadow.camera.bottom = -50
      
      if (target) {
        lightRef.current.target.position.set(target[0], target[1], target[2])
      }
    }
  }, [shadowMapSize, shadowCameraNear, shadowCameraFar, shadowRadius, shadowBias, target])
  
  return (
    <directionalLight
      ref={lightRef}
      position={position}
      color={color}
      intensity={intensity}
      castShadow={castShadow}
      {...props}
    />
  )
}

export function RealisticPointLight({
  position,
  intensity = 1,
  temperature = 3000,
  distance = 0,
  decay = 2,
  power = 100,
  castShadow = false,
  shadowMapSize = 1024,
  ...props
}: {
  position: [number, number, number]
  intensity?: number
  temperature?: number
  distance?: number
  decay?: number
  power?: number
  castShadow?: boolean
  shadowMapSize?: number
}) {
  const color = temperatureToRGB(temperature)
  const calculatedIntensity = power / (4 * Math.PI)
  
  return (
    <pointLight
      position={position}
      color={color}
      intensity={calculatedIntensity}
      distance={distance}
      decay={decay}
      castShadow={castShadow}
      shadow-mapSize={[shadowMapSize, shadowMapSize]}
      {...props}
    />
  )
}

export function RealisticSpotLight({
  position,
  target,
  angle = Math.PI / 6,
  penumbra = 0.5,
  intensity = 1,
  temperature = 3000,
  distance = 0,
  decay = 2,
  power = 800,
  castShadow = true,
  shadowMapSize = 1024,
  ...props
}: {
  position: [number, number, number]
  target?: [number, number, number]
  angle?: number
  penumbra?: number
  intensity?: number
  temperature?: number
  distance?: number
  decay?: number
  power?: number
  castShadow?: boolean
  shadowMapSize?: number
}) {
  const lightRef = useRef<THREE.SpotLight>(null!)
  const color = temperatureToRGB(temperature)
  const calculatedIntensity = power / (4 * Math.PI)
  
  useMemo(() => {
    if (lightRef.current && target) {
      lightRef.current.target.position.set(target[0], target[1], target[2])
      lightRef.current.shadow.mapSize.width = shadowMapSize
      lightRef.current.shadow.mapSize.height = shadowMapSize
    }
  }, [target, shadowMapSize])
  
  return (
    <spotLight
      ref={lightRef}
      position={position}
      color={color}
      intensity={calculatedIntensity}
      angle={angle}
      penumbra={penumbra}
      distance={distance}
      decay={decay}
      castShadow={castShadow}
      {...props}
    />
  )
}

export function AreaLight({
  position,
  size = [2, 2],
  intensity = 1,
  temperature = 4000,
  resolution = 4,
  ...props
}: {
  position: [number, number, number]
  size?: [number, number]
  intensity?: number
  temperature?: number
  resolution?: number
}) {
  const lights = useMemo(() => {
    const lightArray = []
    const [width, height] = size
    const stepX = width / (resolution - 1)
    const stepY = height / (resolution - 1)
    const lightIntensity = intensity / (resolution * resolution)
    
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const offsetX = (x * stepX) - width / 2
        const offsetY = (y * stepY) - height / 2
        
        lightArray.push({
          position: [
            position[0] + offsetX,
            position[1] + offsetY,
            position[2]
          ] as [number, number, number],
          intensity: lightIntensity
        })
      }
    }
    
    return lightArray
  }, [position, size, intensity, resolution])
  
  const color = temperatureToRGB(temperature)
  
  return (
    <group>
      {lights.map((light, index) => (
        <pointLight
          key={index}
          position={light.position}
          color={color}
          intensity={light.intensity}
          distance={20}
          decay={2}
          {...props}
        />
      ))}
    </group>
  )
}

export function VolumetricLight({
  position,
  target,
  color = '#ffffff',
  intensity = 0.3,
  particleCount = 50,
  coneAngle = Math.PI / 4,
  distance = 10,
  ...props
}: {
  position: [number, number, number]
  target: [number, number, number]
  color?: string
  intensity?: number
  particleCount?: number
  coneAngle?: number
  distance?: number
}) {
  const particlesRef = useRef<THREE.BufferGeometry>(null!)
  const materialRef = useRef<THREE.PointsMaterial>(null!)
  
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3)
    const direction = new THREE.Vector3(
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2]
    ).normalize()
    
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      
      const t = Math.random()
      const rayPos = new THREE.Vector3(
        position[0] + direction.x * distance * t,
        position[1] + direction.y * distance * t,
        position[2] + direction.z * distance * t
      )
      
      const radius = Math.tan(coneAngle) * distance * t * Math.random()
      const angle = Math.random() * Math.PI * 2
      
      const up = new THREE.Vector3(0, 1, 0)
      const right = new THREE.Vector3().crossVectors(direction, up).normalize()
      const forward = new THREE.Vector3().crossVectors(right, direction).normalize()
      
      const offsetX = Math.cos(angle) * radius
      const offsetY = Math.sin(angle) * radius
      
      positions[i3] = rayPos.x + right.x * offsetX + forward.x * offsetY
      positions[i3 + 1] = rayPos.y + right.y * offsetX + forward.y * offsetY
      positions[i3 + 2] = rayPos.z + right.z * offsetX + forward.z * offsetY
    }
    
    return positions
  }, [position, target, particleCount, coneAngle, distance])
  
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.opacity = intensity * (0.5 + 0.3 * Math.sin(state.clock.elapsedTime * 2))
    }
  })
  
  return (
    <points>
      <bufferGeometry ref={particlesRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[particlePositions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color={color}
        size={0.02}
        transparent
        opacity={intensity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

export function SmartLightingSystem({
  timeOfDay = 12,
  enableDynamicLighting = false,
  roomDimensions = { width: 30, height: 9, depth: 24 },
  shadowMapSize = 2048,
  enableShadows = true
}: {
  timeOfDay?: number
  enableDynamicLighting?: boolean
  roomDimensions?: { width: number; height: number; depth: number }
  shadowMapSize?: number
  enableShadows?: boolean
}) {
  const [currentTime, setCurrentTime] = useState(timeOfDay)
  
  useFrame((state) => {
    if (enableDynamicLighting) {
      setCurrentTime((prev) => (prev + state.clock.getDelta() / 60) % 24)
    }
  })
  
  const lightingConfig = useMemo(() => {
    const hour = currentTime
    let ambientIntensity: number
    let sunIntensity: number
    let sunTemperature: number
    let sunPosition: [number, number, number]
    
    if (hour >= 6 && hour <= 18) {
      const dayProgress = (hour - 6) / 12
      const sunAngle = dayProgress * Math.PI
      
      ambientIntensity = 0.3 + 0.4 * Math.sin(sunAngle)
      sunIntensity = 1.0 + 1.5 * Math.sin(sunAngle)
      sunTemperature = 3000 + 3000 * Math.sin(sunAngle)
      
      sunPosition = [
        Math.sin(sunAngle) * 30,
        Math.cos(sunAngle) * 20 + 10,
        -roomDimensions.depth / 2 - 5
      ] as [number, number, number]
    } else {
      ambientIntensity = 0.1
      sunIntensity = 0
      sunTemperature = 2700
      sunPosition = [0, 20, 0]
    }
    
    return { ambientIntensity, sunIntensity, sunTemperature, sunPosition }
  }, [currentTime, roomDimensions])
  
  return (
    <group>
      <ambientLight 
        intensity={lightingConfig.ambientIntensity}
        color={temperatureToRGB(6500)}
      />
      
      {lightingConfig.sunIntensity > 0 && (
        <SoftDirectionalLight
          position={lightingConfig.sunPosition}
          target={[0, 0, 0]}
          intensity={lightingConfig.sunIntensity}
          temperature={lightingConfig.sunTemperature}
          castShadow={enableShadows}
          shadowMapSize={shadowMapSize}
        />
      )}
      
      <RealisticPointLight
        position={[0, roomDimensions.height - 0.5, 0]}
        power={1200}
        temperature={4000}
        distance={15}
      />
      
      <RealisticPointLight
        position={[roomDimensions.width / 3, roomDimensions.height - 1, roomDimensions.depth / 3]}
        power={600}
        temperature={3500}
        distance={12}
      />
      
      <RealisticPointLight
        position={[-roomDimensions.width / 3, roomDimensions.height - 1, -roomDimensions.depth / 3]}
        power={600}
        temperature={3500}
        distance={12}
      />
    </group>
  )
}

export function LightingHelper({ visible = false }: { visible?: boolean }) {
  const { scene } = useThree()
  
  useMemo(() => {
    if (!visible) return
    
    scene.traverse((child) => {
      if (child instanceof THREE.DirectionalLight) {
        const helper = new THREE.DirectionalLightHelper(child, 1)
        scene.add(helper)
      } else if (child instanceof THREE.PointLight) {
        const helper = new THREE.PointLightHelper(child, 0.5)
        scene.add(helper)
      } else if (child instanceof THREE.SpotLight) {
        const helper = new THREE.SpotLightHelper(child)
        scene.add(helper)
      }
    })
  }, [scene, visible])
  
  return null
}
