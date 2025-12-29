import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { RoomConfigV1 } from '../src/schemas/room-contract'

// Generate JSON Schema for RoomConfigV1 so n8n/LLM can validate/produce rooms safely.
const schema = zodToJsonSchema(RoomConfigV1, { name: 'RoomConfigV1' })

const outPath = join(process.cwd(), 'public', 'schemas', 'RoomConfigV1.schema.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(schema, null, 2), 'utf-8')

console.log(`✅ Wrote JSON Schema: ${outPath}`)
