'use client'

export default function LoadingGateOverlay({
  visible,
  progress,
}: {
  visible: boolean
  progress: number
}) {
  if (!visible) return null

  const pct = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'auto',
        // Slight dim + blur keeps it feeling modern without hiding the scene completely.
        background: 'rgba(2, 6, 23, 0.25)',
        backdropFilter: 'blur(6px)',
        cursor: 'wait',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Loading"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: 220,
          height: 120,
          borderRadius: 14,
          background: 'rgba(2, 6, 23, 0.82)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
          color: '#e5e7eb',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          alignItems: 'center',
          justifyItems: 'center',
          padding: 14,
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            opacity: 0.8,
          }}
        >
          Loading
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {pct}%
        </div>
      </div>
    </div>
  )
}
