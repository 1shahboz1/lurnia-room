import * as React from 'react'
import { useMemo, useState } from 'react'
import { PACKET_TYPE_GROUPS, ALL_PACKET_TYPES } from '@/components/packet/packetTypes'

export interface PacketTypePickerProps {
  value: string
  onSelect: (next: string) => void
  onClose: () => void
}

export default function PacketTypePicker({ value, onSelect, onClose }: PacketTypePickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PACKET_TYPE_GROUPS as Record<string, { emoji: string; items: string[] }>
    const copy: Record<string, { emoji: string; items: string[] }> = {}
    for (const [cat, group] of Object.entries(PACKET_TYPE_GROUPS)) {
      const list = group.items.filter((it) => it.toLowerCase().includes(q))
      if (list.length) copy[cat] = { emoji: group.emoji, items: list }
    }
    return copy
  }, [query])

  return (
    <div className="w-[420px] max-h-[420px] overflow-y-auto rounded-lg shadow-2xl bg-white/95 backdrop-blur border border-slate-200 p-3 text-slate-800">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search packet types..."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={onClose}
          className="px-3 py-2 rounded-md text-sm bg-slate-100 hover:bg-slate-200 border border-slate-300"
        >
          Close
        </button>
      </div>

      {Object.keys(filtered).length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">No matches</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(filtered).map(([category, { emoji, items }]) => (
            <div key={category}>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-2">
                <span className="text-base">{emoji}</span>
                <span>{category}</span>
                <div className="flex-1 h-px bg-slate-200 ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(items as string[]).map((item) => {
                  const isActive = item === value
                  return (
                    <button
                      key={item}
                      onClick={() => onSelect(item)}
                      className={
                        `text-left text-sm px-3 py-2 rounded-md border transition-colors ` +
                        (isActive
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800')
                      }
                      title={item.split('_').join(' ')}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}