'use client'

import React from 'react'

type PhaseStatus = 'completed' | 'active' | 'locked'

interface Phase {
  id: string
  label: string
  status: PhaseStatus
}

interface PhaseIndicatorProps {
  phases: Phase[]
  currentPhaseId: string
  onPhaseClick?: (phaseId: string) => void
}

export default function PhaseIndicator({ phases, currentPhaseId, onPhaseClick }: PhaseIndicatorProps) {
  if (!phases || phases.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9400,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(17, 24, 39, 0.95)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {phases.map((phase, index) => {
        const isActive = phase.id === currentPhaseId
        const isCompleted = phase.status === 'completed'
        const isLocked = phase.status === 'locked'

        return (
          <React.Fragment key={phase.id}>
            <button
              onClick={() => {
                if (onPhaseClick) onPhaseClick(phase.id)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                border: isActive
                  ? '1px solid rgba(59, 130, 246, 0.5)'
                  : '1px solid rgba(148, 163, 184, 0.15)',
                background: isActive
                  ? 'rgba(59, 130, 246, 0.15)'
                  : isCompleted
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(15, 23, 42, 0.5)',
                color: isLocked ? '#94a3b8' : '#e5e7eb',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isActive ? 700 : 600,
                transition: 'all 0.2s ease',
                opacity: isLocked ? 0.72 : 1,
              }}
            >
              {isCompleted && <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>}
              {isActive && <span style={{ color: '#3b82f6', fontSize: 16 }}>●</span>}
              {isLocked && <span style={{ color: '#64748b', fontSize: 16 }}>🔒</span>}
              <span>{phase.label}</span>
            </button>

            {index < phases.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: isCompleted
                    ? 'rgba(34, 197, 94, 0.4)'
                    : 'rgba(148, 163, 184, 0.2)',
                  borderRadius: 2,
                }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
