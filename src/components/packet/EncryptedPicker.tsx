import React, { useEffect, useRef, useState } from 'react'

interface EncryptedItem {
  id: string
  label: string
  color?: string
}

interface EncryptedGroup {
  id: string
  title: string
  items: EncryptedItem[]
}

const ENCRYPTED_GROUPS: EncryptedGroup[] = [
  {
    id: 'encrypted',
    title: '🔒 Encrypted',
    items: [
      { id: 'TRUE', label: 'TRUE' },
      { id: 'FALSE', label: 'FALSE' },
    ],
  },
]

export default function EncryptedPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const items: EncryptedItem[] = ENCRYPTED_GROUPS.flatMap(g => g.items)
  const selected = items.find(i => i.id === value) ?? { id: value, label: value, color: 'bg-slate-300' }

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  const filteredGroups = ENCRYPTED_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(it => it.label.toLowerCase().includes(filter.toLowerCase())),
  })).filter(g => g.items.length > 0)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer"
        style={{ 
          color: '#0f172a',
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 'inherit',
          fontWeight: 500,
          fontFamily: 'inherit',
          outline: 'none',
          textAlign: 'center',
          justifyContent: 'center'
        }}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected.label}</span>
        <svg className="w-2 h-2" viewBox="0 0 20 20" fill="none" stroke="#64748b" style={{ width: '0.65em', height: '0.65em', marginLeft: '0.6em' }}>
          <path d="M6 8l4 4 4-4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div 
          id="encrypted-picker-dropdown"
          className="absolute z-50 right-0 bg-white shadow-lg"
          style={{
            width: '140px',
            maxHeight: '160px',
            fontSize: '10px',
            padding: '4px',
            marginTop: '3px',
            border: '1px solid #e2e8f0',
            borderRadius: '3px',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            backgroundColor: '#ffffff',
            opacity: 1,
            mixBlendMode: 'normal',
            overflow: 'hidden'
          }}
        >
          <input
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
            onKeyDown={(e) => { e.stopPropagation() }}
            onKeyUp={(e) => { e.stopPropagation() }}
            style={{
              width: '110px',
              fontSize: '6.5px',
              padding: '3px 5px',
              border: '1px solid #e2e8f0',
              borderRadius: '3px',
              fontFamily: 'inherit',
              marginBottom: '5px'
            }}
          />

          <div className="overflow-auto tp-scroll" style={{ maxHeight: '130px' }}>
            {filteredGroups.map((g) => (
              <div key={g.id} style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '6px', color: '#64748b', marginBottom: '2px', fontWeight: 600, textAlign: 'left' }}>{g.title}</div>
                <div style={{ display: 'grid', gap: '3px' }}>
                  {g.items.map((it) => (
                    <div
                      key={it.id}
                      role="option"
                      aria-selected={it.id === value}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(it.id)}
                      className="flex items-center justify-between cursor-pointer select-none rounded-[3px] px-1 py-[2px] border border-transparent hover:border-slate-300 hover:bg-slate-50 hover:ring-1 hover:ring-slate-300 ring-offset-0 transition-colors"
                      style={{
                        fontSize: '7px',
                        width: '91%',
                        marginLeft: '4px',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        backgroundColor: 'transparent'
                      }}
                    >
                      <div className="flex items-center" style={{ gap: '5px' }}>
                        <div className={`rounded-full ${it.color ?? 'bg-slate-300'}`} style={{ width: '6px', height: '6px', flexShrink: 0 }} />
                        <div style={{ fontWeight: 500, color: '#0f172a' }}>{it.label}</div>
                      </div>
                      {it.id === value ? <div style={{ fontSize: '6.5px', color: '#0284c7', marginLeft: '5px' }}>✓</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {filteredGroups.length === 0 && <div style={{ fontSize: '7px', color: '#64748b', padding: '6px', textAlign: 'center' }}>No results</div>}
          </div>
        </div>
      )}
    </div>
  )
}