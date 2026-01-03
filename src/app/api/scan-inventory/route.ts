import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { promises as fs } from 'fs'

// Get category from folder path
function getCategoryFromPath(relativePath: string): string {
  const pathParts = relativePath.split('/')
  if (pathParts.length > 1) {
    // Use the folder name as category, capitalize first letter
    const folderName = pathParts[0]
    return folderName.charAt(0).toUpperCase() + folderName.slice(1)
  }
  return 'Other'
}

// Get emoji for category
function getCategoryEmoji(category: string): string {
  switch (category.toLowerCase()) {
    case 'routers': return '🌐'
    case 'switches': return '🔀'
    case 'servers': return '🖥️'
    case 'storage': return '💾'
    case 'desktops': return '🖥️'
    case 'laptops': return '💻'
    case 'monitors': return '🖥️'
    case 'cables': return '🔌'
    case 'peripherals': return '⌨️'
    case 'misc': return '📦'
    case 'firewall': return '🛡️'
    case 'accesspoint': return '📡'
    case 'access point': return '📡'
    case 'rack': return '🏗️'
    case 'car':
    case 'cars':
    case 'vehicle':
    case 'vehicles':
      return '🚗'
    default: return '📦'
  }
}

// Estimate polygon count from file size (rough approximation)
function estimatePolygonCount(fileSizeBytes: number): number {
  // Very rough estimation: assume 1MB = ~10,000 polygons for GLB files
  // This is just a placeholder - actual polygon counting would require GLB parsing
  const sizeInMB = fileSizeBytes / (1024 * 1024)
  return Math.round(sizeInMB * 8000) // Adjusted multiplier based on typical models
}

async function getAllCategoryFolders(inventoryPath: string): Promise<string[]> {
  const categories: string[] = []
  try {
    const entries = await readdir(inventoryPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        categories.push(entry.name.charAt(0).toUpperCase() + entry.name.slice(1))
      }
    }
  } catch (error) {
    console.warn(`Failed to read category folders:`, error)
  }
  return categories
}

async function scanDirectoryRecursively(dirPath: string, relativePath = ''): Promise<Array<{filename: string, filepath: string, relativePath: string}>> {
  const items: Array<{filename: string, filepath: string, relativePath: string}> = []
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      const currentRelativePath = relativePath ? join(relativePath, entry.name) : entry.name
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subItems = await scanDirectoryRecursively(fullPath, currentRelativePath)
        items.push(...subItems)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
        items.push({
          filename: entry.name,
          filepath: fullPath,
          relativePath: currentRelativePath
        })
      }
    }
  } catch (error) {
    console.warn(`Failed to scan directory ${dirPath}:`, error)
  }
  
  return items
}

export async function GET() {
  try {
    const inventoryPath = join(process.cwd(), 'public', 'inventory')
    
    try {
      // Get all category folders first
      const allCategories = await getAllCategoryFolders(inventoryPath)
      const glbFiles = await scanDirectoryRecursively(inventoryPath)
      
      // Get detailed information for each GLB file
      const inventoryItems = await Promise.all(
        glbFiles.map(async (fileInfo) => {
          try {
            const stats = await stat(fileInfo.filepath)
            const name = fileInfo.filename.replace('.glb', '')
            const displayName = name.replace(/_/g, ' ').replace(/-/g, ' ')
            const category = getCategoryFromPath(fileInfo.relativePath)
            
            return {
              id: `inventory-${name}`,
              name,
              displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
              filename: fileInfo.filename,
              relativePath: fileInfo.relativePath,
              category,
              emoji: getCategoryEmoji(category),
              fileSize: stats.size,
              polygonCount: estimatePolygonCount(stats.size),
              inRoom: false,
              description: `${category} equipment - ${(stats.size / (1024 * 1024)).toFixed(1)}MB`
            }
          } catch (error) {
            console.warn(`Failed to get stats for ${fileInfo.filename}:`, error)
            // Fallback without stats
            const name = fileInfo.filename.replace('.glb', '')
            const displayName = name.replace(/_/g, ' ').replace(/-/g, ' ')
            const category = getCategoryFromPath(fileInfo.relativePath)
            
            return {
              id: `inventory-${name}`,
              name,
              displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
              filename: fileInfo.filename,
              relativePath: fileInfo.relativePath,
              category,
              emoji: getCategoryEmoji(category),
              fileSize: 0,
              polygonCount: 0,
              inRoom: false,
              description: `${category} equipment`
            }
          }
        })
      )
      
      console.log(`📦 Found ${inventoryItems.length} inventory GLB files with metadata`)
      
      // Return both items and all categories
      return NextResponse.json({
        items: inventoryItems,
        allCategories: allCategories
      })
    } catch (dirError) {
      // Directory doesn't exist or can't be read
      console.log('📦 Inventory directory not found or empty, returning empty array')
      return NextResponse.json([])
    }
  } catch (error) {
    console.error('❌ Error scanning inventory directory:', error)
    return NextResponse.json([], { status: 500 })
  }
}
