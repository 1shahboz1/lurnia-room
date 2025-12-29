'use client'

import React from 'react'

interface PrimaryAction {
  type: 'playFlow' | 'openPanel' | 'simulateAttack' | 'custom'
  label: string
  flowId?: string
  panelId?: string
}

interface SecondaryAction {
  id: string
  label: string
  state?: 'normal' | 'warning' | 'success'
  badge?: string
}

interface PrimaryActionPanelProps {
  description?: string
  primaryAction: PrimaryAction
  secondaryActions?: SecondaryAction[]
  onPrimaryClick: () => void
  onSecondaryClick: (actionId: string) => void
}

export default function PrimaryActionPanel({
  description,
  primaryAction,
  secondaryActions = [],
  onPrimaryClick,
  onSecondaryClick,
}: PrimaryActionPanelProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9400,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Description */}
      {description && (
        <div
          style={{
            maxWidth: 600,
            textAlign: 'center',
            fontSize: 14,
            color: '#cbd5e1',
            lineHeight: 1.5,
            background: 'rgba(17, 24, 39, 0.8)',
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid rgba(148, 163, 184, 0.15)',
          }}
        >
          {description}
        </div>
      )}

      {/* Action buttons container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(17, 24, 39, 0.95)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 12,
          padding: '14px 18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* Primary Action Button */}
        <button
          onClick={onPrimaryClick}
          style={{
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 10,
            border: '1px solid rgba(59, 130, 246, 0.5)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(37, 99, 235, 0.25))',
            color: '#dbeafe',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.2)'
          }}
        >
          {primaryAction.label}
        </button>

        {/* Divider */}
        {secondaryActions.length > 0 && (
          <div
            style={{
              width: 1,
              height: 32,
              background: 'rgba(148, 163, 184, 0.2)',
            }}
          />
        )}

        {/* Secondary Action Buttons */}
        {secondaryActions.map((action) => {
          const stateColors = {
            normal: {
              border: 'rgba(148, 163, 184, 0.2)',
              bg: 'rgba(15, 23, 42, 0.5)',
              color: '#e5e7eb',
            },
            warning: {
              border: 'rgba(251, 146, 60, 0.4)',
              bg: 'rgba(234, 88, 12, 0.15)',
              color: '#fed7aa',
            },
            success: {
              border: 'rgba(34, 197, 94, 0.4)',
              bg: 'rgba(34, 197, 94, 0.15)',
              color: '#bbf7d0',
            },
          }

          const colors = stateColors[action.state || 'normal']

          return (
            <button
              key={action.id}
              onClick={() => onSecondaryClick(action.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.color,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {action.label}
              {action.badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(251, 146, 60, 0.25)',
                    color: '#fb923c',
                    border: '1px solid rgba(251, 146, 60, 0.3)',
                  }}
                >
                  {action.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
