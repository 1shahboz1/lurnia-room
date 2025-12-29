'use client'

import React, { useState } from 'react'

interface Tool {
  id: string
  label: string
  icon?: string
}

interface ToolsDrawerProps {
  tools: Tool[]
  onToolClick: (toolId: string) => void
}

export default function ToolsDrawer({ tools, onToolClick }: ToolsDrawerProps) {
  const [collapsed, setCollapsed] = useState(true)

  if (tools.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: '50%',
        // Lift the toolbox so it sits higher relative to the bottom action panel.
        transform: 'translateY(calc(-50% - 132px))',
        zIndex: 9400,
        pointerEvents: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {collapsed ? (
        /* Collapsed state: just icons */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 12,
            padding: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onToolClick(tool.id)}
              title={tool.label}
              style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'rgba(15, 23, 42, 0.5)',
                color: '#e5e7eb',
                fontSize: 18,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                e.currentTarget.style.transform = 'translateX(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)'
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'
                e.currentTarget.style.transform = 'translateX(0)'
              }}
            >
              {tool.icon ?? getIconForTool(tool.id)}
            </button>
          ))}

          {/* Expand button */}
          <div
            style={{
              width: 44,
              height: 1,
              background: 'rgba(148, 163, 184, 0.2)',
              margin: '4px 0',
            }}
          />
          <button
            onClick={() => setCollapsed(false)}
            title="Expand drawer"
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.5)',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
              e.currentTarget.style.color = '#dbeafe'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)'
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'
              e.currentTarget.style.color = '#94a3b8'
            }}
          >
            ←
          </button>
        </div>
      ) : (
        /* Expanded state: icons + labels */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 12,
            padding: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            minWidth: 180,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#94a3b8',
                letterSpacing: 0.5,
              }}
            >
              TOOLS
            </span>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse drawer"
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(148, 163, 184, 0.15)'
                e.currentTarget.style.color = '#e5e7eb'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#94a3b8'
              }}
            >
              →
            </button>
          </div>

          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onToolClick(tool.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'rgba(15, 23, 42, 0.5)',
                color: '#e5e7eb',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                e.currentTarget.style.transform = 'translateX(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)'
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'
                e.currentTarget.style.transform = 'translateX(0)'
              }}
            >
              <span style={{ fontSize: 16 }}>{tool.icon ?? getIconForTool(tool.id)}</span>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getIconForTool(toolId: string): string {
  const icons: Record<string, string> = {
    inspector: '🔍',
    terminal: '💻',
    'firewall-rules': '🛡️',
    mission: '✅',
  }
  return icons[toolId] || '⚙️'
}
