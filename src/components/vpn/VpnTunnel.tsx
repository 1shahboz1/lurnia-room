'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, RoundedBox, Text } from '@react-three/drei'
import * as THREE from 'three'

type Vec3 = [number, number, number]

function v3ToArr(v: THREE.Vector3): Vec3 {
  return [v.x, v.y, v.z]
}

function nearlyEqualVec3(a: Vec3, b: Vec3, eps = 1e-3) {
  return (
    Math.abs(a[0] - b[0]) <= eps &&
    Math.abs(a[1] - b[1]) <= eps &&
    Math.abs(a[2] - b[2]) <= eps
  )
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function damp(current: number, target: number, lambda: number, dt: number) {
  // Exponential smoothing toward target
  const t = 1 - Math.exp(-lambda * Math.max(0, dt))
  return current + (target - current) * t
}

export type VpnTunnelProps = {
  enabled?: boolean
  from: string
  via: string
  to: string

  // Geometry / layout
  radius?: number
  radialSegments?: number
  tubularSegments?: number
  lift?: number // extra lift applied to control points
  startYOffset?: number
  viaYOffset?: number
  endYOffset?: number

  // Animation (along tunnel length)
  buildSeconds?: number
  disintegrateSeconds?: number
  edgeWidth?: number // UV-space width (0..1) for the build/erase front softness
  noiseAmp?: number // UV-space jitter for dusty edge

  // Visuals
  colorA?: string
  colorB?: string
  opacity?: number
  glowStrength?: number
  flowSpeed?: number
  flowFrequency?: number

  // Labels
  showLabel?: boolean
  labelText?: string
  labelLift?: number // extra height above tunnel top

  // Encryption visualization (Option A): persistent sheath + subtle badge
  showEncryptionSheath?: boolean
  encryptionSheathColor?: string
  encryptionSheathOpacity?: number
  encryptionSheathRadiusMul?: number
  encryptionSheathSpeed?: number
  encryptionSheathFrequency?: number

  showEncryptionBadge?: boolean
  encryptionBadgeText?: string
  encryptionBadgeU?: number // 0..1 along curve

  // Rendering
  depthTest?: boolean
  renderOrder?: number
}

export default function VpnTunnel({
  enabled = true,
  from,
  via,
  to,
  radius = 0.22,
  radialSegments = 22,
  tubularSegments = 160,
  lift = 1.25,
  startYOffset = 1.1,
  viaYOffset = 1.5,
  endYOffset = 1.0,
  buildSeconds = 2.2,
  disintegrateSeconds = 1.9,
  edgeWidth = 0.07,
  noiseAmp = 0.09,
  colorA = '#3b82f6',
  colorB = '#a855f7',
  opacity = 0.28,
  glowStrength = 1.1,
  flowSpeed = 0.35,
  flowFrequency = 6.0,
  showLabel = true,
  labelText = 'Virtual Private Network\n(VPN)',
  labelLift = 0.85,

  showEncryptionSheath = true,
  encryptionSheathColor = '#22c55e',
  encryptionSheathOpacity = 0.22,
  encryptionSheathRadiusMul = 1.34,
  encryptionSheathSpeed = 0.32,
  encryptionSheathFrequency = 12.0,

  showEncryptionBadge = true,
  encryptionBadgeText = 'Encrypted Tunnel',
  encryptionBadgeU = 0.55,

  depthTest = true,
  renderOrder = 2100,
}: VpnTunnelProps) {
  const { scene } = useThree()

  // Anchor world positions (throttled updates)
  const [startArr, setStartArr] = useState<Vec3 | null>(null)
  const [viaArr, setViaArr] = useState<Vec3 | null>(null)
  const [endArr, setEndArr] = useState<Vec3 | null>(null)

  const warnedMissingRef = useRef(false)
  const tickRef = useRef(0)

  const tmpStart = useRef(new THREE.Vector3())
  const tmpVia = useRef(new THREE.Vector3())
  const tmpEnd = useRef(new THREE.Vector3())

  // Progressive build/disintegration (from Remote User -> Firewall, along tube u axis)
  // vUv.x is 0..1 along the tunnel length.
  const buildRef = useRef(enabled ? 1 : 0)
  const eraseRef = useRef(enabled ? 0 : 1)
  const targetBuildRef = useRef(enabled ? 1 : 0)
  const targetEraseRef = useRef(enabled ? 0 : 1)
  const firstMountRef = useRef(true)

  // Label animation (no React re-render loops)
  const labelGroupRef = useRef<THREE.Group | null>(null)
  const titleBorderMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const titleBgMatRef = useRef<THREE.MeshBasicMaterial | null>(null)

  // Encryption state (0..1) once the tunnel is fully established
  const encryptionVisRef = useRef(enabled ? 1 : 0)

  // Encryption badge
  const badgeGroupRef = useRef<THREE.Group | null>(null)
  const badgeBorderMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const badgeBgMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const badgeTextRef = useRef<any>(null)

  const badgeTmpRef = useRef({
    p: new THREE.Vector3(),
    tan: new THREE.Vector3(),
    nrm: new THREE.Vector3(),
    bin: new THREE.Vector3(),
    rad: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    out: new THREE.Vector3(),
  })

  useEffect(() => {
    // Don't auto-animate on first mount: keep initial state (so rooms don't "build" on page load)
    if (firstMountRef.current) {
      firstMountRef.current = false
      buildRef.current = enabled ? 1 : 0
      eraseRef.current = enabled ? 0 : 1
      targetBuildRef.current = buildRef.current
      targetEraseRef.current = eraseRef.current
      return
    }

    if (enabled) {
      // Rebuild from scratch when turning on.
      buildRef.current = 0
      eraseRef.current = 0
      targetBuildRef.current = 1
      targetEraseRef.current = 0
    } else {
      // Disintegrate from the start when turning off.
      targetBuildRef.current = buildRef.current
      targetEraseRef.current = 1
    }
  }, [enabled])

  const shellMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthTest,
      depthWrite: false,
      // Normal blending makes the tunnel readable on bright backgrounds (the room is light).
      // We keep additive glow on the inner core mesh.
      blending: THREE.NormalBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
        uGlow: { value: glowStrength },
        uFlowSpeed: { value: flowSpeed },
        uFlowFreq: { value: flowFrequency },
        uFresnelPow: { value: 2.6 },
        uBuild: { value: enabled ? 1 : 0 },
        uErase: { value: enabled ? 0 : 1 },
        uEdge: { value: edgeWidth },
        uNoiseAmp: { value: noiseAmp },
        uTransition: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosW;
        varying vec3 vNrmW;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosW = worldPos.xyz;
          vNrmW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uGlow;
        uniform float uFlowSpeed;
        uniform float uFlowFreq;
        uniform float uFresnelPow;
        uniform float uBuild;
        uniform float uErase;
        uniform float uEdge;
        uniform float uNoiseAmp;
        uniform float uTransition;
        varying vec2 vUv;
        varying vec3 vPosW;
        varying vec3 vNrmW;

        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosW);
          float ndv = max(0.0, dot(normalize(vNrmW), viewDir));
          float fresnel = pow(1.0 - ndv, uFresnelPow);

          // Subtle animated flow along tube length (u axis)
          float phase = vUv.x * uFlowFreq - uTime * uFlowSpeed;
          float wave = 0.5 + 0.5 * sin(phase);
          float stripe = smoothstep(0.35, 0.85, wave);

          // Progressive build/disintegrate mask (from u=0 -> u=1)
          // Only add noisy "dust" during transitions; keep stable (no flicker) when fully built.
          float trans = clamp(uTransition, 0.0, 1.0);
          float n = rand(vec2(vUv.x * 61.0 + uTime * 0.15 * trans, vUv.y * 17.0));
          float jitter = (n - 0.5) * uNoiseAmp * trans;
          float u = vUv.x + jitter;
          float buildMask = 1.0 - smoothstep(uBuild, uBuild + uEdge, u);
          float eraseMask = smoothstep(uErase, uErase + uEdge, u);
          float mask = buildMask * eraseMask;

          vec3 base = mix(uColorA, uColorB, wave);
          vec3 col = base * (0.9 + 0.95 * fresnel) * uGlow;
          col += base * stripe * 0.26;

          // Edge "dust" sparkle during transitions
          float edgeBand = 0.0;
          edgeBand = max(edgeBand, 1.0 - smoothstep(0.0, uEdge * 2.5, abs(vUv.x - uBuild)));
          edgeBand = max(edgeBand, 1.0 - smoothstep(0.0, uEdge * 2.5, abs(vUv.x - uErase)));
          float speck = smoothstep(0.7, 1.0, n) * edgeBand * trans;
          col += base * speck * 0.6;

          // Keep the tunnel readable even when viewed head-on (not just at the rim)
          float a = uOpacity * (0.42 + 0.58 * fresnel) * mask;

          gl_FragColor = vec4(col, a);
        }
      `,
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sheathMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthTest,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(encryptionSheathColor) },
        uOpacity: { value: encryptionSheathOpacity },
        uSpeed: { value: encryptionSheathSpeed },
        uFreq: { value: encryptionSheathFrequency },
        uBuild: { value: enabled ? 1 : 0 },
        uErase: { value: enabled ? 0 : 1 },
        uEdge: { value: edgeWidth },
        uNoiseAmp: { value: noiseAmp },
        uTransition: { value: 0 },
        uEncrypted: { value: enabled ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosW;
        varying vec3 vNrmW;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosW = worldPos.xyz;
          vNrmW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uSpeed;
        uniform float uFreq;
        uniform float uBuild;
        uniform float uErase;
        uniform float uEdge;
        uniform float uNoiseAmp;
        uniform float uTransition;
        uniform float uEncrypted;
        varying vec2 vUv;
        varying vec3 vPosW;
        varying vec3 vNrmW;

        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          // Fresnel emphasis
          vec3 viewDir = normalize(cameraPosition - vPosW);
          float ndv = max(0.0, dot(normalize(vNrmW), viewDir));
          float fresnel = pow(1.0 - ndv, 2.0);

          // Diagonal hatch pattern in UV space, scrolling along the tunnel
          float scroll = uTime * uSpeed;
          float x = vUv.x * uFreq + scroll;
          float y = vUv.y * (uFreq * 0.55);
          float diag = x + y;
          float s = sin(diag * 6.2831853);
          float stripes = smoothstep(0.25, 0.75, s * 0.5 + 0.5);

          // Subtle secondary lines for texture richness
          float s2 = sin((x * 1.7 - y * 0.9) * 6.2831853);
          float micro = smoothstep(0.35, 0.85, s2 * 0.5 + 0.5);

          float pattern = clamp(stripes * 0.8 + micro * 0.35, 0.0, 1.0);

          // Progressive build/disintegrate mask (same approach as main tube)
          float trans = clamp(uTransition, 0.0, 1.0);
          float n = rand(vec2(vUv.x * 61.0 + uTime * 0.15 * trans, vUv.y * 17.0));
          float jitter = (n - 0.5) * uNoiseAmp * trans;
          float u = vUv.x + jitter;
          float buildMask = 1.0 - smoothstep(uBuild, uBuild + uEdge, u);
          float eraseMask = smoothstep(uErase, uErase + uEdge, u);
          float mask = buildMask * eraseMask;

          float a = uOpacity * (0.35 + 0.65 * fresnel) * pattern * mask * clamp(uEncrypted, 0.0, 1.0);
          vec3 col = uColor * (0.65 + 0.85 * fresnel);

          gl_FragColor = vec4(col, a);
        }
      `,
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const coreMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthTest,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: opacity * 0.7 },
        uColorA: { value: new THREE.Color('#60a5fa') },
        uColorB: { value: new THREE.Color('#c4b5fd') },
        uGlow: { value: glowStrength * 0.75 },
        uFlowSpeed: { value: flowSpeed },
        uFlowFreq: { value: Math.max(3.5, flowFrequency * 0.7) },
        uFresnelPow: { value: 1.5 },
        uBuild: { value: enabled ? 1 : 0 },
        uErase: { value: enabled ? 0 : 1 },
        uEdge: { value: edgeWidth },
        uNoiseAmp: { value: noiseAmp },
        uTransition: { value: 0 },
      },
      vertexShader: shellMat.vertexShader,
      fragmentShader: shellMat.fragmentShader,
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep uniforms in sync when props change
  useEffect(() => {
    shellMat.uniforms.uColorA.value.set(colorA)
    shellMat.uniforms.uColorB.value.set(colorB)
    shellMat.uniforms.uGlow.value = glowStrength
    shellMat.uniforms.uFlowSpeed.value = flowSpeed
    shellMat.uniforms.uFlowFreq.value = flowFrequency
    shellMat.uniforms.uEdge.value = edgeWidth
    shellMat.uniforms.uNoiseAmp.value = noiseAmp

    sheathMat.uniforms.uColor.value.set(encryptionSheathColor)
    sheathMat.uniforms.uOpacity.value = encryptionSheathOpacity
    sheathMat.uniforms.uSpeed.value = encryptionSheathSpeed
    sheathMat.uniforms.uFreq.value = encryptionSheathFrequency
    sheathMat.uniforms.uEdge.value = edgeWidth
    sheathMat.uniforms.uNoiseAmp.value = noiseAmp

    coreMat.uniforms.uGlow.value = glowStrength * 0.75
    coreMat.uniforms.uFlowSpeed.value = flowSpeed
    coreMat.uniforms.uFlowFreq.value = Math.max(3.5, flowFrequency * 0.7)
    coreMat.uniforms.uEdge.value = edgeWidth
    coreMat.uniforms.uNoiseAmp.value = noiseAmp
  }, [
    shellMat,
    sheathMat,
    coreMat,
    colorA,
    colorB,
    glowStrength,
    flowSpeed,
    flowFrequency,
    edgeWidth,
    noiseAmp,
    encryptionSheathColor,
    encryptionSheathOpacity,
    encryptionSheathSpeed,
    encryptionSheathFrequency,
  ])

  // Dispose materials
  useEffect(() => {
    return () => {
      try { shellMat.dispose() } catch {}
      try { sheathMat.dispose() } catch {}
      try { coreMat.dispose() } catch {}
    }
  }, [shellMat, sheathMat, coreMat])

  useFrame((state, delta) => {
    // Advance shader time
    const t = state.clock.elapsedTime
    shellMat.uniforms.uTime.value = t
    sheathMat.uniforms.uTime.value = t
    coreMat.uniforms.uTime.value = t

    // Progress animation (constant speed)
    const buildTarget = targetBuildRef.current
    const eraseTarget = targetEraseRef.current

    if (buildRef.current !== buildTarget) {
      const step = Math.max(1e-4, delta / Math.max(0.15, buildSeconds))
      buildRef.current = buildRef.current < buildTarget ? Math.min(buildTarget, buildRef.current + step) : Math.max(buildTarget, buildRef.current - step)
    }

    if (eraseRef.current !== eraseTarget) {
      const step = Math.max(1e-4, delta / Math.max(0.15, disintegrateSeconds))
      eraseRef.current = eraseRef.current < eraseTarget ? Math.min(eraseTarget, eraseRef.current + step) : Math.max(eraseTarget, eraseRef.current - step)
    }

    // Apply uniforms
    shellMat.uniforms.uOpacity.value = opacity
    coreMat.uniforms.uOpacity.value = opacity * 0.7
    shellMat.uniforms.uBuild.value = buildRef.current
    coreMat.uniforms.uBuild.value = buildRef.current
    shellMat.uniforms.uErase.value = eraseRef.current
    coreMat.uniforms.uErase.value = eraseRef.current

    sheathMat.uniforms.uBuild.value = buildRef.current
    sheathMat.uniforms.uErase.value = eraseRef.current

    const inTransition =
      Math.abs(buildRef.current - buildTarget) > 1e-3 ||
      Math.abs(eraseRef.current - eraseTarget) > 1e-3
    shellMat.uniforms.uTransition.value = inTransition ? 1 : 0
    sheathMat.uniforms.uTransition.value = inTransition ? 1 : 0
    coreMat.uniforms.uTransition.value = inTransition ? 1 : 0

    // Label visibility follows tunnel visibility.
    const tunnelVis = clamp01(buildRef.current * (1 - eraseRef.current))
    const established = !!enabled && buildRef.current >= 0.985 && eraseRef.current <= 0.02

    const labelVisible = !!showLabel && tunnelVis > 0.05
    const titleAlpha = tunnelVis

    if (labelGroupRef.current) {
      labelGroupRef.current.visible = labelVisible
      const s = 0.97 + 0.03 * tunnelVis
      labelGroupRef.current.scale.setScalar(s)
    }

    if (titleBorderMatRef.current) titleBorderMatRef.current.opacity = 0.35 * titleAlpha
    if (titleBgMatRef.current) titleBgMatRef.current.opacity = 0.72 * titleAlpha

    // Encryption is a steady-state: fade sheath/badge in once tunnel is established.
    const encTarget = (showEncryptionSheath || showEncryptionBadge) && established ? 1 : 0
    encryptionVisRef.current = damp(encryptionVisRef.current, encTarget, 10.0, delta)
    const enc = clamp01(encryptionVisRef.current)

    sheathMat.uniforms.uEncrypted.value = (!!showEncryptionSheath ? 1 : 0) * enc

    // Place + pulse the badge subtly (never disappears while encrypted; just gentle pulse)
    if (badgeGroupRef.current) {
      const badgeVisible = !!showEncryptionBadge && enc > 0.05
      badgeGroupRef.current.visible = badgeVisible

      if (badgeVisible && curveRefForEmits.current) {
        const curve = curveRefForEmits.current
        const tmp = badgeTmpRef.current

        const u = clamp01(encryptionBadgeU ?? 0.55)
        curve.getPoint(u, tmp.p)
        curve.getTangent(u, tmp.tan)
        tmp.tan.normalize()

        tmp.nrm.crossVectors(tmp.tan, tmp.up)
        if (tmp.nrm.lengthSq() < 1e-6) tmp.nrm.set(1, 0, 0)
        tmp.nrm.normalize()
        tmp.bin.crossVectors(tmp.tan, tmp.nrm).normalize()

        // Fixed radial offset so it sits "near" the tunnel rather than directly on it.
        const angle = 0.9
        const ca = Math.cos(angle)
        const sa = Math.sin(angle)
        tmp.rad.copy(tmp.nrm).multiplyScalar(ca).addScaledVector(tmp.bin, sa)

        tmp.out.copy(tmp.p)
        tmp.out.addScaledVector(tmp.rad, radius * (1.9 + (encryptionSheathRadiusMul - 1.0) * 0.6))
        tmp.out.y += 0.22

        badgeGroupRef.current.position.copy(tmp.out)

        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
        badgeGroupRef.current.scale.setScalar(0.98 + 0.04 * pulse)

        const a = enc * (0.82 + 0.18 * pulse)
        if (badgeBorderMatRef.current) badgeBorderMatRef.current.opacity = 0.35 * a
        if (badgeBgMatRef.current) badgeBgMatRef.current.opacity = 0.72 * a

        try {
          const mesh = badgeTextRef.current as any
          const mat = mesh?.material
          if (mat) {
            if (Array.isArray(mat)) {
              mat.forEach((m) => { if (m) { m.transparent = true; m.opacity = a } })
            } else {
              mat.transparent = true
              mat.opacity = a
            }
          }
        } catch {}
      }
    }

    // Throttle anchor updates (~20 fps)
    tickRef.current += delta
    if (tickRef.current < 1 / 20) return
    tickRef.current = 0

    const find = (name: string) => scene.getObjectByName(`${name}-center`) || scene.getObjectByName(name)
    const a = find(from)
    const b = find(via)
    const c = find(to)

    if (!a || !b || !c) {
      if (!warnedMissingRef.current) {
        warnedMissingRef.current = true
        console.warn('[VPN] Tunnel anchors missing:', {
          from,
          via,
          to,
          found: {
            from: !!a,
            via: !!b,
            to: !!c,
          },
        })
      }
      // If anchors are missing, hide by dropping geometry state.
      if (startArr || viaArr || endArr) {
        setStartArr(null)
        setViaArr(null)
        setEndArr(null)
      }
      return
    }
    warnedMissingRef.current = false

    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    c.updateMatrixWorld(true)

    a.getWorldPosition(tmpStart.current)
    b.getWorldPosition(tmpVia.current)
    c.getWorldPosition(tmpEnd.current)

    tmpStart.current.y += startYOffset
    tmpVia.current.y += viaYOffset
    tmpEnd.current.y += endYOffset

    const sArr = v3ToArr(tmpStart.current)
    const vArr = v3ToArr(tmpVia.current)
    const eArr = v3ToArr(tmpEnd.current)

    if (!startArr || !viaArr || !endArr) {
      setStartArr(sArr)
      setViaArr(vArr)
      setEndArr(eArr)
      return
    }

    // Avoid useless re-renders
    if (!nearlyEqualVec3(startArr, sArr) || !nearlyEqualVec3(viaArr, vArr) || !nearlyEqualVec3(endArr, eArr)) {
      setStartArr(sArr)
      setViaArr(vArr)
      setEndArr(eArr)
    }
  })

  // Keep a ref to the latest curve for per-frame emit positioning.
  const curveRefForEmits = useRef<THREE.CatmullRomCurve3 | null>(null)

  const { shellGeo, sheathGeo, coreGeo, labelPos } = useMemo(() => {
    if (!startArr || !viaArr || !endArr) {
      curveRefForEmits.current = null
      return {
        shellGeo: null as THREE.TubeGeometry | null,
        sheathGeo: null as THREE.TubeGeometry | null,
        coreGeo: null as THREE.TubeGeometry | null,
        labelPos: null as Vec3 | null,
      }
    }

    const start = new THREE.Vector3().fromArray(startArr)
    const mid = new THREE.Vector3().fromArray(viaArr)
    const end = new THREE.Vector3().fromArray(endArr)

    // Build a smooth, continuous curve that *passes through* the WAN anchor.
    const d1 = start.distanceTo(mid)
    const d2 = mid.distanceTo(end)
    const dynLift = Math.max(lift, Math.min(3.0, Math.max(d1, d2) * 0.12))

    const p1 = start.clone().lerp(mid, 0.55)
    const p2 = mid.clone().lerp(end, 0.45)
    p1.y += dynLift
    p2.y += dynLift

    const points = [start, p1, mid, p2, end]
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
    curveRefForEmits.current = curve

    const shell = new THREE.TubeGeometry(curve, tubularSegments, radius * 1.18, radialSegments, false)
    const sheath = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      radius * Math.max(1.18, encryptionSheathRadiusMul),
      radialSegments,
      false
    )
    const core = new THREE.TubeGeometry(curve, tubularSegments, radius * 0.7, Math.max(12, Math.floor(radialSegments * 0.6)), false)

    // Label anchor: find the top-most point along the curve and place the label above it.
    const samples = 26
    const tmp = new THREE.Vector3()
    const top = new THREE.Vector3()
    let maxY = -Infinity
    for (let i = 0; i <= samples; i++) {
      curve.getPoint(i / samples, tmp)
      if (tmp.y > maxY) {
        maxY = tmp.y
        top.copy(tmp)
      }
    }
    top.y += labelLift

    return { shellGeo: shell, sheathGeo: sheath, coreGeo: core, labelPos: v3ToArr(top) }
  }, [startArr, viaArr, endArr, tubularSegments, radius, radialSegments, lift, labelLift, encryptionSheathRadiusMul])

  // Dispose tube geometries
  useEffect(() => {
    return () => {
      try { shellGeo?.dispose() } catch {}
      try { sheathGeo?.dispose() } catch {}
      try { coreGeo?.dispose() } catch {}
    }
  }, [shellGeo, sheathGeo, coreGeo])

  // If not ready, don't render (material still exists but geometry doesn't)
  if (!shellGeo || !sheathGeo || !coreGeo) return null


  return (
    <group>
      <mesh geometry={shellGeo} material={shellMat} renderOrder={renderOrder} />
      {showEncryptionSheath && (
        <mesh geometry={sheathGeo} material={sheathMat} renderOrder={renderOrder + 1} />
      )}
      <mesh geometry={coreGeo} material={coreMat} renderOrder={renderOrder + 2} />

      {/* VPN label (follows tunnel anchors) */}
      {showLabel && labelPos && (
        <group ref={labelGroupRef} position={labelPos}>
          <Billboard follow>
            <group>
              {/* Border */}
              <RoundedBox args={[6.9, 1.85, 0.05]} radius={0.18} smoothness={6} position={[0, 0, -0.08]} renderOrder={renderOrder + 50}>
                <meshBasicMaterial
                  ref={titleBorderMatRef}
                  color="#6366f1"
                  transparent
                  opacity={0.35}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                />
              </RoundedBox>

              {/* Backplate */}
              <RoundedBox args={[6.55, 1.65, 0.05]} radius={0.16} smoothness={6} position={[0, 0, -0.06]} renderOrder={renderOrder + 51}>
                <meshBasicMaterial
                  ref={titleBgMatRef}
                  color="#0b1220"
                  transparent
                  opacity={0.72}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                />
              </RoundedBox>

              {/* Title */}
              <Text
                position={[0, 0.22, 0.02]}
                fontSize={0.52}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000"
                material-depthTest={false}
                material-depthWrite={false}
                material-transparent
                material-toneMapped={false}
                renderOrder={renderOrder + 52}
              >
                {labelText}
              </Text>
            </group>
          </Billboard>
        </group>
      )}

      {/* Encryption badge (subtle, persistent while tunnel is encrypted) */}
      {showEncryptionBadge && (
        <group ref={badgeGroupRef} visible={false}>
          <Billboard follow>
            <group>
              <RoundedBox args={[3.35, 0.68, 0.05]} radius={0.16} smoothness={6} position={[0, 0, -0.06]} renderOrder={renderOrder + 60}>
                <meshBasicMaterial
                  ref={badgeBorderMatRef}
                  color="#22c55e"
                  transparent
                  opacity={0}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                />
              </RoundedBox>
              <RoundedBox args={[3.15, 0.56, 0.05]} radius={0.14} smoothness={6} position={[0, 0, -0.05]} renderOrder={renderOrder + 61}>
                <meshBasicMaterial
                  ref={badgeBgMatRef}
                  color="#052e16"
                  transparent
                  opacity={0}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                />
              </RoundedBox>
              <Text
                ref={badgeTextRef}
                position={[0, 0, 0.02]}
                fontSize={0.30}
                color="#dcfce7"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000"
                material-depthTest={false}
                material-depthWrite={false}
                material-transparent
                material-toneMapped={false}
                renderOrder={renderOrder + 62}
              >
                {encryptionBadgeText}
              </Text>
            </group>
          </Billboard>
        </group>
      )}
    </group>
  )
}
