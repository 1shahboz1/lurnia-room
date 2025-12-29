'use client'

import { useState, useEffect } from 'react'

export function LabelEditor() {
  const [servers, setServers] = useState<Array<{ id: string; label: string; modelName: string }>>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = () => {
    const key = 'roomLayout:networking-lab-v1'
    const raw = localStorage.getItem(key)
    if (raw) {
      const layout = JSON.parse(raw)
      const serverList = Object.entries(layout)
        .filter(([_, entry]: any) => entry.modelName && entry.modelName.includes('server'))
        .map(([id, entry]: any) => ({
          id,
          label: entry.customLabel || 'servers',
          modelName: entry.modelName,
        }))
      setServers(serverList)
    }
  }

  const updateLabel = (id: string, newLabel: string) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, label: newLabel } : s))
  }

  const saveLabels = () => {
    const key = 'roomLayout:networking-lab-v1'
    const raw = localStorage.getItem(key)
    if (raw) {
      const layout = JSON.parse(raw)
      servers.forEach(server => {
        if (layout[server.id]) {
          layout[server.id].customLabel = server.label
        }
      })
      localStorage.setItem(key, JSON.stringify(layout))
      alert('Labels saved! Please refresh the page to see changes.')
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#3b82f6',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 10000,
        }}
      >
        Edit Labels
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
      zIndex: 10000,
      minWidth: '400px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Edit Server Labels</h3>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ×
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {servers.map((server, index) => (
          <div key={server.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#666' }}>
              Server {index + 1} ({server.id.slice(-6)})
            </label>
            <input
              type="text"
              value={server.label}
              onChange={(e) => updateLabel(server.id, e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '14px',
              }}
              placeholder="Enter label..."
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={saveLabels}
          style={{
            flex: 1,
            background: '#10b981',
            color: 'white',
            padding: '10px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Save Labels
        </button>
        <button
          onClick={() => {
            setServers(prev => prev.map((s, i) => ({
              ...s,
              label: ['DNS Server', 'PKI Server', 'Web Server', 'CDN Edge'][i] || s.label
            })))
          }}
          style={{
            background: '#f59e0b',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Reset to Default
        </button>
      </div>
    </div>
  )
}
