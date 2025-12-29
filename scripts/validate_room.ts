#!/usr/bin/env tsx

/*
  Room Bundler CLI - Task 1: Validate and cross-ref
  - Zod validation against RoomConfigV1
  - JSON Schema validation via Ajv
  - Cross-check references (devices, flows, phases, terminal mappings)
  - Decor type check against manifest
  - Asset existence checks under public/

  Usage: tsx scripts/validate_room.ts [path/to/room.json]
*/

import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { RoomConfigV1 } from '../src/schemas/room-contract'

const projectRoot = process.cwd()
const publicDir = path.join(projectRoot, 'public')

const decorManifestPath = path.join(projectRoot, 'src', 'config', 'decor-types.json')
const decorTypes: string[] = fs.existsSync(decorManifestPath)
  ? JSON.parse(fs.readFileSync(decorManifestPath, 'utf-8'))
  : []

function readJson(p: string) {
  const raw = fs.readFileSync(p, 'utf-8')
  try { return JSON.parse(raw) } catch (e) {
    throw new Error(`Invalid JSON at ${p}: ${(e as Error).message}`)
  }
}

function existsPublicAsset(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  // Normalize leading '/public' (authoring mistake) -> '/'
  let rel = url.startsWith('/public/') ? url.slice('/public'.length) : url
  // Remove leading slash for filesystem join
  if (rel.startsWith('/')) rel = rel.slice(1)
  const abs = path.join(publicDir, rel)
  return fs.existsSync(abs)
}

function main() {
  const input = process.argv[2] || path.join(projectRoot, 'public', 'rooms', 'test-room.final.json')
  if (!fs.existsSync(input)) {
    console.error(`✖ Input not found: ${input}`)
    process.exit(1)
  }

  const json = readJson(input)
  const errors: string[] = []
  const warnings: string[] = []

  // 1) Zod validation
  const zres = RoomConfigV1.safeParse(json)
  if (!zres.success) {
    for (const issue of zres.error.issues) {
      errors.push(`Zod: ${issue.path.join('.')} - ${issue.message}`)
    }
  }

  // 2) JSON Schema validation via Ajv (from Zod)
  try {
    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv as any)
    const schema = zodToJsonSchema(RoomConfigV1, { name: 'RoomConfigV1' }) as any
    const validate = ajv.compile(schema)
    const ok = validate(json)
    if (!ok) {
      for (const err of validate.errors || []) {
        errors.push(`Schema: ${err.instancePath || '(root)'} ${err.message}`)
      }
    }
  } catch (e) {
    warnings.push(`Schema validation skipped: ${(e as Error).message}`)
  }

  // Continue cross-checks even if schema errors exist to give a full report
  const cfg = json as any

  // 3) Build indexes
  const deviceAliases = new Set<string>((cfg.devices || []).map((d: any) => d.alias))
  const flowIds = new Set<string>((cfg.flows || []).map((f: any) => f.id))
  const phaseIds = new Set<string>((cfg.phases || []).map((p: any) => p.id))
  const decorList: Array<{id:string,type:string}> = (cfg.structure?.decor || []).map((d: any) => ({ id: String(d.id), type: String(d.type) }))

  // 4) Cross-check: flows.path aliases must exist
  for (const f of cfg.flows || []) {
    if (!Array.isArray(f.path)) continue
    f.path.forEach((alias: string, i: number) => {
      if (!deviceAliases.has(alias)) {
        errors.push(`Flow '${f.id}': path[${i}] references missing device alias '${alias}'`)
      }
    })
  }

  // 5) Cross-check: phases actions references
  for (const p of cfg.phases || []) {
    for (const act of p.actions || []) {
      if (act.playFlow && !flowIds.has(act.playFlow)) {
        errors.push(`Phase '${p.id}': playFlow references missing flow '${act.playFlow}'`)
      }
      if (act.pauseFlow && !flowIds.has(act.pauseFlow)) {
        errors.push(`Phase '${p.id}': pauseFlow references missing flow '${act.pauseFlow}'`)
      }
      if (act.cameraTo && act.cameraTo.target && !deviceAliases.has(act.cameraTo.target)) {
        errors.push(`Phase '${p.id}': cameraTo.target references missing device alias '${act.cameraTo.target}'`)
      }
      if (act.showDecor) {
        for (const id of act.showDecor) {
          if (!decorList.find(d => d.id === id)) {
            warnings.push(`Phase '${p.id}': showDecor references unknown decor id '${id}'`)
          }
        }
      }
      if (act.hideDecor) {
        for (const id of act.hideDecor) {
          if (!decorList.find(d => d.id === id)) {
            warnings.push(`Phase '${p.id}': hideDecor references unknown decor id '${id}'`)
          }
        }
      }
    }
  }

  // 6) Cross-check: terminal commands map to existing phase/flow
  const cmds = (cfg.terminal && Array.isArray(cfg.terminal.commands)) ? cfg.terminal.commands : []
  for (const c of cmds) {
    if (!Array.isArray(c.onRun) || c.onRun.length === 0) {
      errors.push(`Terminal '${c.id}': onRun must contain at least one effect`)
      continue
    }
    for (const eff of c.onRun) {
      if (typeof eff.phase === 'string' && !phaseIds.has(eff.phase)) {
        errors.push(`Terminal '${c.id}': references missing phase '${eff.phase}'`)
      }
      if (typeof eff.flow === 'string' && !flowIds.has(eff.flow)) {
        errors.push(`Terminal '${c.id}': references missing flow '${eff.flow}'`)
      }
    }
  }

  // 7) Decor types must exist in manifest
  if (decorTypes.length === 0) {
    warnings.push('Decor manifest missing or empty; skipping decor type validation')
  } else {
    for (const d of decorList) {
      if (!decorTypes.includes(d.type)) {
        warnings.push(`Decor '${d.id}': unknown type '${d.type}' (not in manifest)`) // warn, not error to allow expansion
      }
    }
  }

  // 8) Verify assets exist
  // 8a) Device model assets
  for (const d of (cfg.devices || [])) {
    if (!existsPublicAsset(d.model)) {
      errors.push(`Device '${d.alias}': model not found at '${d.model}' (expected under /public)`)    
    }
  }
  // 8b) Decor image assets (best-effort: check any field ending with Url or ending with .png/.jpg)
  for (const d of (cfg.structure?.decor || [])) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v !== 'string') continue
      const lk = k.toLowerCase()
      if (lk.endsWith('url') || /\.(png|jpg|jpeg|webp)$/i.test(v)) {
        if (!existsPublicAsset(v)) {
          warnings.push(`Decor '${d.id}': asset not found '${v}'`)
        }
      }
    }
  }

  // Report
  const unique = (arr: string[]) => Array.from(new Set(arr))
  const finalErrors = unique(errors)
  const finalWarnings = unique(warnings)

  if (finalErrors.length) {
    console.error('\n✖ Validation errors:')
    for (const e of finalErrors) console.error('  -', e)
  }
  if (finalWarnings.length) {
    console.warn('\n⚠ Warnings:')
    for (const w of finalWarnings) console.warn('  -', w)
  }

  if (!finalErrors.length && !finalWarnings.length) {
    console.log('✅ Validation passed with no issues')
  } else if (!finalErrors.length) {
    console.log(`\n✅ No errors. ${finalWarnings.length} warning(s).`)
  }

  process.exit(finalErrors.length ? 1 : 0)
}

main()
