'use client'

import React from 'react'
import { toast } from "react-hot-toast"
import GLBPreviewModal from './glb-preview-modal'

// Add thin scrollbar styles
const scrollbarStyles = `
  .category-scrollbar::-webkit-scrollbar {
    height: 4px !important;
    -webkit-appearance: none;
  }
  .category-scrollbar::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 2px;
    height: 4px !important;
  }
  .category-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 2px;
    height: 4px !important;
    min-height: 4px !important;
    max-height: 4px !important;
  }
  .category-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
    height: 4px !important;
  }
  .category-scrollbar::-webkit-scrollbar-thumb:active {
    background: #64748b;
    height: 4px !important;
    min-height: 4px !important;
    max-height: 4px !important;
  }
`

interface InventoryItem {
  id: string
  name: string
  displayName: string
  filename: string
  relativePath: string
  category: string
  emoji: string
  fileSize: number
  polygonCount: number
  inRoom: boolean
  description: string
}

interface InventorySheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onAddToRoom?: (item: InventoryItem) => void
  currentRoomItems?: string[]
  onPreviewModalChange?: (open: boolean) => void
}

export function InventorySheet({ 
  isOpen, 
  onOpenChange, 
  onAddToRoom,
  currentRoomItems = [],
  onPreviewModalChange
}: InventorySheetProps) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [activeCategory, setActiveCategory] = React.useState('all')
  const [inventoryItems, setInventoryItems] = React.useState<InventoryItem[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [previewModal, setPreviewModal] = React.useState<{ isOpen: boolean; item: InventoryItem | null }>({ isOpen: false, item: null })

  React.useEffect(() => {
    if (isOpen && inventoryItems.length === 0) {
      fetchInventoryData()
    }
  }, [isOpen])

  const fetchInventoryData = async () => {
    setLoading(true)
    try {
      // Static file served from /public/inventory/index.json
      // Avoids Vercel serverless function size limits caused by scanning the filesystem at runtime.
      const response = await fetch('/inventory/index.json')
      if (!response.ok) throw new Error('Failed to fetch inventory')
      const data = await response.json()
      
      // Handle both old format (array) and new format (object with items and categories)
      if (Array.isArray(data)) {
        setInventoryItems(data)
        setAllCategories([])
      } else {
        setInventoryItems(data.items || [])
        setAllCategories(data.allCategories || [])
      }
      
      console.log(`📦 Loaded ${data.items?.length || data.length} inventory items`)
    } catch (error) {
      console.error('Failed to load inventory:', error)
      toast.error('Failed to load inventory items')
    } finally {
      setLoading(false)
    }
  }

  const categories = React.useMemo(() => {
    const categoryMap = new Map()
    
    // First, add all categories from folders (even empty ones)
    allCategories.forEach(category => {
      const categoryId = category.toLowerCase()
      categoryMap.set(categoryId, { id: categoryId, label: category, count: 0 })
    })
    
    // Then count items in each category
    inventoryItems.forEach(item => {
      const category = item.category.toLowerCase()
      if (categoryMap.has(category)) {
        categoryMap.get(category).count++
      } else {
        // Fallback for items not in allCategories
        categoryMap.set(category, { id: category, label: item.category, count: 1 })
      }
    })
    
    return [
      { id: 'all', label: 'All', count: inventoryItems.length },
      ...Array.from(categoryMap.values())
    ]
  }, [inventoryItems, allCategories])

  const filteredItems = React.useMemo(() => {
    return inventoryItems.filter(item => {
      const matchesCategory = activeCategory === 'all' || item.category.toLowerCase() === activeCategory
      const matchesSearch = item.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [searchQuery, activeCategory, inventoryItems])

  const handleAddToRoom = (item: InventoryItem) => {
    if (onAddToRoom) {
      onAddToRoom(item)
      // Toast notification removed for cleaner UX
    }
  }

  const handlePreview = (item: InventoryItem) => {
    setPreviewModal({ isOpen: true, item })
    onPreviewModalChange?.(true)
  }

  const closePreview = () => {
    setPreviewModal({ isOpen: false, item: null })
    onPreviewModalChange?.(false)
  }

  // Removed early return to allow animations

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
      {/* Backdrop overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: `rgba(0, 0, 0, ${isOpen ? 0.1 : 0})`,
          zIndex: 9998,
          transition: 'background-color 0.3s ease-in-out',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
        onClick={() => onOpenChange(false)}
      />
    <div style={{
      position: 'fixed', top: 5, right: isOpen ? 5 : -500, width: '420px', height: '94vh',
      backgroundColor: 'white', zIndex: 9999, padding: '20px',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', borderRadius: '12px',
      transition: 'right 0.3s ease-in-out', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>Inventory</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Drop network hardware into the virtual room. Browse by category or search.
          </p>
        </div>
        <button onClick={() => onOpenChange(false)} style={{
          background: 'none', border: '2px solid white', borderRadius: '6px',
          width: '32px', height: '32px', fontSize: '20px', cursor: 'pointer',
          alignSelf: 'flex-start', marginTop: '-4px',
          outline: 'none'
        }}
        onFocus={(e) => (e.target as HTMLElement).style.border = '2px solid #3b82f6'}
        onBlur={(e) => (e.target as HTMLElement).style.border = '2px solid white'}
        onMouseDown={(e) => (e.target as HTMLElement).style.border = '2px solid #3b82f6'}
        onMouseUp={(e) => (e.target as HTMLElement).style.border = '2px solid white'}
        >×</button>
      </div>

      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input
          type="text" placeholder="Search equipment..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 10px 10px 40px', border: '1px solid #ddd',
            borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box'
          }}
        />
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px', 
        overflowX: 'auto', 
        paddingBottom: '16px',
        whiteSpace: 'nowrap',
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #f1f5f9'
      }}
      className="category-scrollbar">
        {categories.map(category => (
          <button key={category.id} onClick={() => setActiveCategory(category.id)} style={{
            padding: '6px 12px', borderRadius: '16px',
            border: activeCategory === category.id ? '2px solid #3b82f6' : '1px solid #ddd',
            backgroundColor: activeCategory === category.id ? '#eff6ff' : 'white',
            color: activeCategory === category.id ? '#3b82f6' : '#666',
            fontSize: '12px', cursor: 'pointer',
            flexShrink: 0, whiteSpace: 'nowrap',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: '500'
          }}>
            <span>{category.label} </span>
            <span style={{ fontWeight: '700', color: '#111827' }}>{category.count}</span>
          </button>
        ))}
      </div>

      {/* Scrollable items section */}
      <div style={{
        flex: 1, overflowY: 'auto', paddingRight: '5px'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>Loading inventory...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            {inventoryItems.length === 0 ? 'No inventory items found' : 'No items match your search'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px'
          }}>
            {filteredItems.map(item => {
              const isInRoom = currentRoomItems.includes(item.name)
              return (
                <div key={item.id} style={{
                  border: '1px solid #eee',
                  borderRadius: '12px',
                  backgroundColor: '#fafafa',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  height: '200px'
                }}>
                  {/* Icon/Emoji at top */}
                  <div style={{ marginBottom: '8px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => {
                      const category = item.category.toLowerCase()
                      // Map known categories to existing public/ images
                      const categoryIconSrc: Record<string, string> = {
                        routers: '/router_emoji.png',
                        switches: '/Switch.png', // note: capital S matches file name
                        desktops: '/desktop.png',
                        desktop: '/desktop.png',
                        servers: '/server.png',
                        server: '/server.png',
                        cables: '/cable.png',
                        cable: '/cable.png',
                        firewall: '/Firewall.png', // note: capital F matches file name
                        firewalls: '/Firewall.png',
                        laptops: '/desktop.png', // reuse desktop icon for laptops
                        laptop: '/desktop.png',
                        monitors: '/desktop.png', // reuse desktop icon for monitors
                        monitor: '/desktop.png',
                        peripherals: '/cable.png', // reuse cable icon for peripherals
                        peripheral: '/cable.png',
                        storage: '/server.png', // reuse server icon for storage
                        misc: '/cable.png', // reuse cable icon for misc items
                        cars: '/car.png',
                        car: '/car.png',
                        vehicles: '/car.png',
                        vehicle: '/car.png',
                        earth: '/inventory/Earth/earth.png',
                        earths: '/inventory/Earth/earth.png',
                      }
                      const src = categoryIconSrc[category]
                      return src ? (
                        <img
                          src={src}
                          alt={item.category}
                          style={{ width: '65px', height: '65px', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ fontSize: '70px' }}>
                          {item.emoji}
                        </div>
                      )
                    })()}
                  </div>
                  
                  {/* Item name */}
                  <h4 style={{
                    margin: '0 0 6px 0',
                    fontSize: '14px',
                    fontWeight: '600',
                    lineHeight: '1.2',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    textAlign: 'center'
                  }}>
                    {item.category.toLowerCase() === 'earth' ? 'Internet' : item.displayName}
                  </h4>
                  
                  {/* Item info */}
                  <p style={{
                    margin: '0 0 6px 0',
                    fontSize: '11px',
                    color: '#666',
                    lineHeight: '1.4',
                    whiteSpace: 'nowrap'
                  }}>
                    {(item.fileSize / (1024 * 1024)).toFixed(1)} MB • {item.polygonCount.toLocaleString()} polys
                  </p>
                  
                  {/* Buttons at bottom */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    width: '100%',
                    marginTop: '6px'
                  }}>
                    <button 
                      onClick={() => handleAddToRoom(item)} 
                      disabled={isInRoom} 
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: isInRoom ? '#ccc' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: isInRoom ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isInRoom ? 'Added' : 'Add'}
                    </button>
                    
                    <button 
                      onClick={() => handlePreview(item)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: '#f8f9fa',
                        color: '#666',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Preview
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fixed refresh button at bottom */}
      <button onClick={fetchInventoryData} disabled={loading} style={{
        width: '100%', padding: '10px', marginTop: '20px', border: '1px solid #ddd',
        borderRadius: '6px', backgroundColor: 'white', cursor: loading ? 'not-allowed' : 'pointer',
        flexShrink: 0
      }}>
        {loading ? 'Refreshing...' : 'Refresh Inventory'}
      </button>
    </div>

    {/* Preview Modal */}
    {previewModal.item && (
      <GLBPreviewModal
        isOpen={previewModal.isOpen}
        onClose={closePreview}
        modelPath={`/inventory/${(previewModal.item as any).relativePath}`}
        modelName={previewModal.item.displayName}
      />
    )}
    </>
  )
}

export default InventorySheet
