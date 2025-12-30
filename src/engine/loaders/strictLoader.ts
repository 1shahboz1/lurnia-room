// Strict loader for /rooms/<slug>.final.json with Zod validation
// Works on both server (Node) and client (browser).

import { RoomConfigV1 } from '@/schemas/room-contract'
import type { z } from 'zod'

export class RoomNotFoundError extends Error {
  code = 'NOT_FOUND' as const
  constructor(public slug: string) {
    super(`Room not found: ${slug}`)
    this.name = 'RoomNotFoundError'
  }
}

export class RoomValidationError extends Error {
  code = 'VALIDATION_FAILED' as const
  constructor(public slug: string, public details: string[]) {
    super(`Invalid RoomConfigV1 for '${slug}':\n` + details.join('\n'))
    this.name = 'RoomValidationError'
  }
}

function summarizeZodErrors(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
}

// Load and validate a room.final.json by slug.
// - On server: read from filesystem (fast, absolute)
// - On client: fetch from /rooms/<slug>.final.json
export async function loadRoomFinal(slug: string) {
  if (!slug || typeof slug !== 'string') throw new RoomNotFoundError(String(slug))

  const pathRel = `/rooms/${slug}.final.json`

  async function resolveBaseUrlOnServer(): Promise<string> {
    // Prefer request headers (works reliably on Vercel + custom domains)
    try {
      const { headers } = await import('next/headers')
      const h = headers()
      const host = h.get('x-forwarded-host') || h.get('host')
      const proto = h.get('x-forwarded-proto') || 'https'
      if (host) return `${proto}://${host}`
    } catch {
      // ignore
    }

    // Fallbacks
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'http://localhost:3000'
  }

  try {
    let data: unknown

    const baseUrl = typeof window === 'undefined'
      ? await resolveBaseUrlOnServer()
      : ''

    const res = await fetch(`${baseUrl}${pathRel}`, { cache: 'no-store' })
    if (!res.ok) throw new RoomNotFoundError(slug)
    data = await res.json()

    const parsed = RoomConfigV1.safeParse(data)
    if (!parsed.success) {
      const details = summarizeZodErrors(parsed.error)
      throw new RoomValidationError(slug, details)
    }

    return parsed.data
  } catch (e: any) {
    if (e instanceof RoomNotFoundError || e instanceof RoomValidationError) throw e
    if (e?.code === 'ENOENT') throw new RoomNotFoundError(slug)
    if (e?.name === 'SyntaxError') throw new RoomValidationError(slug, ['JSON parse error'])
    throw e
  }
}
