import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Blob as NodeBlob } from 'buffer'

// Minimal Node polyfills for GLTFExporter (FileReader/Blob)
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = NodeBlob
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    constructor() { this.result = null; this.onloadend = null }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab
        if (typeof this.onloadend === 'function') this.onloadend()
      })
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((ab) => {
        const buffer = Buffer.from(ab)
        const type = blob.type || 'application/octet-stream'
        const base64 = buffer.toString('base64')
        this.result = `data:${type};base64,${base64}`
        if (typeof this.onloadend === 'function') this.onloadend()
      })
    }
  }
}

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Output path (matches runtime loader in PacketHop)
const outDir = path.resolve(__dirname, '../public/inventory/Network Packet')
const outPath = path.join(outDir, 'network-packet.glb')

// Ensure output dir exists
fs.mkdirSync(outDir, { recursive: true })

// Scene root for export
const scene = new THREE.Scene()

// Shared material params (neutral cyan/white glow, glossy PBR)
const baseColor = new THREE.Color('#ffffff')
const emissiveColor = new THREE.Color('#00ffff')

function makeBody() {
  // Credit-card proportions (in meters-ish): 0.85 x 0.54, thickness 0.02
  const width = 0.85
  const height = 0.54
  const radius = 0.06 // rounded corners
  const depth = 0.02

  // Rounded rectangle shape in XY plane (front faces +Z after extrude)
  const s = new THREE.Shape()
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)

  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hh - r)
  s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hh)
  s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hh + r)
  s.absarc(-hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI, false)

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
    curveSegments: 5,
    steps: 1,
  }

  const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)
  geom.center() // center at origin

  // Vertex-color gradient (bottom slightly more cyan, top white)
  const pos = geom.attributes.position
  let minY = Infinity, maxY = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = THREE.MathUtils.clamp((y - minY) / (maxY - minY || 1), 0, 1)
    // Blend from slightly cyan (bottom) to white (top)
    const c = new THREE.Color().lerpColors(new THREE.Color('#e0ffff'), baseColor, t)
    colors[i * 3 + 0] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity: 0.12,
    metalness: 0.0,
    roughness: 0.18,
    vertexColors: true,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'packet_body'
  return mesh
}

function makeFlap() {
  // Small triangular flap on front face (+Z)
  const flapWidth = 0.42
  const flapHeight = 0.16
  const depth = 0.004

  // Triangle shape: base along +Y near top; apex points downward
  const s = new THREE.Shape()
  const half = flapWidth / 2
  s.moveTo(-half, 0)
  s.lineTo(half, 0)
  s.lineTo(0, -flapHeight)
  s.closePath()

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 1,
    curveSegments: 3,
    steps: 1,
  }
  const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)

  // Position: sit on front face z = bodyDepth/2 + depth/2 (after centering body)
  // Body depth was 0.02, centered => front face at z = +0.01
  geom.translate(0, 0.13, 0.01 + depth / 2 + 0.0005)

  // Slight cyan tint
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity: 0.16,
    metalness: 0.0,
    roughness: 0.15,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'packet_flap'
  return mesh
}

function makeStamp() {
  // Small rounded-rect stamp at front top-right
  const w = 0.16
  const h = 0.12
  const r = 0.025
  const depth = 0.006

  const s = new THREE.Shape()
  const hw = w / 2, hh = h / 2
  const rr = Math.min(r, hw, hh)
  s.moveTo(-hw + rr, -hh)
  s.lineTo(hw - rr, -hh)
  s.absarc(hw - rr, -hh + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(hw, hh - rr)
  s.absarc(hw - rr, hh - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(-hw + rr, hh)
  s.absarc(-hw + rr, hh - rr, rr, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hh + rr)
  s.absarc(-hw + rr, -hh + rr, rr, Math.PI, 1.5 * Math.PI, false)

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 1,
    curveSegments: 4,
    steps: 1,
  }
  const geom = new THREE.ExtrudeGeometry(s, extrudeSettings)
  // Place on front face near top-right
  geom.translate(0.25, 0.18, 0.01 + depth / 2 + 0.0005)

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity: 0.1,
    metalness: 0.0,
    roughness: 0.2,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'packet_stamp'
  return mesh
}

// Build
const group = new THREE.Group()
group.name = 'packet'
const body = makeBody()
const flap = makeFlap()
const stamp = makeStamp()

// Ensure front faces +Z: geometry already extruded along +Z and centered
// Add children
group.add(body)
group.add(flap)
group.add(stamp)

// Add a small backface offset so total faces < 500 and still nice; geometries are already low-poly

scene.add(group)

// Export GLB
const exporter = new GLTFExporter()
exporter.parse(
  scene,
  (result) => {
    if (result instanceof ArrayBuffer) {
      fs.writeFileSync(outPath, Buffer.from(result))
      console.log(`✅ Wrote GLB: ${outPath}`)
    } else if (typeof result === 'string' && result.startsWith('data:')) {
      // DataURL -> GLB
      const base64 = result.split(',')[1]
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'))
      console.log(`✅ Wrote GLB (from DataURL): ${outPath}`)
    } else {
      // JSON glTF fallback
      const gltfPath = outPath.replace(/\.glb$/, '.gltf')
      fs.writeFileSync(gltfPath, JSON.stringify(result, null, 2))
      console.log(`✅ Wrote GLTF JSON: ${gltfPath}`)
    }
  },
  {
    binary: true,
    onlyVisible: true,
    truncateDrawRange: true,
    embedImages: true,
  }
)
