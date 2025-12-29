'use client'

import React, { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type ScenarioPhase = { id: string; title?: string; note?: string; state?: 'pending'|'active'|'done'|'error' }
export type ScenarioDevice = { id: string; label: string; type?: string; zone?: string }
export type ScenarioHop = { id: string; from: string; to: string; label?: string; phase?: string; t: number }

export default function InspectorPanelScenario({
  open,
  onOpenChange,
  phases,
  devices,
  liveHops,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  phases: ScenarioPhase[]
  devices: ScenarioDevice[]
  liveHops: ScenarioHop[]
}) {
  const [tab, setTab] = useState<string>('packets')

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Inspector"
      data-qa="inspector-sheet"
      data-loc="src/components/inspector/InspectorPanelScenario.tsx:sheet-content"
      style={{ top: 5, right: 5, position: 'fixed', height: '94vh', width: 380, background: '#ffffff', color: '#0f172a', borderRadius: 12, boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', padding: '0px 20px 20px 20px', zIndex: 9999 }}
    >
      <div className="mb-6 space-y-1 text-left">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" data-loc="src/components/inspector/InspectorPanelScenario.tsx:title">Inspector</h2>
          <button
            onClick={(e) => { onOpenChange(false); (e.target as HTMLElement).blur() }}
            style={{ background: 'none', border: '2px solid white', borderRadius: 6, width: 32, height: 32, fontSize: 20, cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p style={{ marginTop: -6, color: '#666', fontSize: '14px' }}>Live data for this scenario</p>
      </div>

      <div className="mt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="relative w-full rounded-md" style={{ marginBottom: 24 }}>
            <div aria-hidden className="absolute inset-0 rounded-md bg-muted/30 z-0" style={{ pointerEvents: 'none' }} />
            <div className="relative z-10 flex items-center px-1 py-1">
              <TabsList className="w-full overflow-x-auto flex items-center justify-center rounded-[12px]" style={{ height: 36 }}>
                <div className="items-center justify-center" style={{ display: 'grid', gridAutoFlow: 'column', columnGap: '48px', justifyContent: 'center', alignItems: 'center' }}>
                  <TabsTrigger value="phases" className="inline-flex items-center justify-center text-center text-[15px] font-medium h-9 min-w-[88px] px-5 rounded-[8px] whitespace-nowrap select-none transition-all data-[state=active]:!bg-slate-700 data-[state=active]:!text-primary">Phases</TabsTrigger>
                  <TabsTrigger value="packets" className="inline-flex items-center justify-center text-center text-[15px] font-medium h-9 min-w-[88px] px-5 rounded-[8px] whitespace-nowrap select-none transition-all data-[state=active]:!bg-slate-700 data-[state=active]:!text-primary">Packets</TabsTrigger>
                  <TabsTrigger value="devices" className="inline-flex items-center justify-center text-center text-[15px] font-medium h-9 min-w-[88px] px-5 rounded-[8px] whitespace-nowrap select-none transition-all data-[state=active]:!bg-slate-700 data-[state=active]:!text-primary">Devices</TabsTrigger>
                </div>
              </TabsList>
            </div>
          </div>

          <TabsContent value="phases" className="!mt-0">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Phases</h3>
              <ul className="list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px', marginTop: 6 }}>
                {(phases || []).map((ph) => (
                  <li key={ph.id} className="flex items-center justify-between border rounded-[12px]" style={{ padding: '4px 24px' }}>
                    <div className="flex flex-col">
                      <div className="font-semibold text-foreground" style={{ fontWeight: 660 }}>{ph.title || ph.id}</div>
                      {ph.note && <div className="text-sm text-muted-foreground" style={{ lineHeight: '20px' }}>{ph.note}</div>}
                    </div>
                    <div className="text-xs" style={{ color: ph.state === 'active' ? '#2563eb' : ph.state === 'done' ? '#16a34a' : '#64748b' }}>{ph.state || 'pending'}</div>
                  </li>
                ))}
                {(!phases || phases.length === 0) && (<li className="px-3 py-2 text-sm text-muted-foreground">No phases</li>)}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="packets" className="!mt-0">
            <ScrollArea className="h-[65vh] pr-2">
              <ul className="list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px', marginTop: 6 }}>
                {(liveHops || []).slice(-50).reverse().map((h) => (
                  <li key={h.id} className="flex items-center justify-between border rounded-[12px] px-4 py-2">
                    <div className="text-sm text-foreground truncate">{h.label || 'Hop'}: {h.from} → {h.to} {h.phase ? `(${h.phase})` : ''}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.t).toLocaleTimeString()}</div>
                  </li>
                ))}
                {(!liveHops || liveHops.length === 0) && (<li className="px-3 py-2 text-sm text-muted-foreground">No recent hops</li>)}
              </ul>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="devices" className="!mt-0">
            <ScrollArea className="h-[65vh] pr-2">
              <ul className="list-none pl-0 flex flex-col" style={{ marginLeft: -32, rowGap: '12px', marginTop: 6 }}>
                {(devices || []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between border rounded-[12px] px-4 py-2">
                    <div className="text-sm font-medium text-foreground truncate">{d.label} <span className="text-xs text-muted-foreground">({d.type || 'device'})</span></div>
                    {d.zone && <div className="text-xs text-muted-foreground">{d.zone}</div>}
                  </li>
                ))}
                {(!devices || devices.length === 0) && (<li className="px-3 py-2 text-sm text-muted-foreground">No devices</li>)}
              </ul>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
