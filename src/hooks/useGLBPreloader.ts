import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';

// Common inventory models that users are likely to add first
// Based on the logs, these are the most frequently added models
const COMMON_MODELS = [
  // Desktop computers
  '/inventory/desktops/gaming_desktop_pc.glb',
  '/inventory/desktops/high_school_desktop_pc_ultra_low_poly.glb',
  
  // Monitors
  '/inventory/monitors/ultrawide_monitor.glb',
  
  // Peripherals
  '/inventory/peripherals/gaming_keyboard.glb',
  
  // Networking
  '/inventory/routers/maga_network_router.glb',
  '/inventory/switches/Switch.glb',
  
  // Servers
  '/inventory/servers/server_v2_console.glb'
];

// Less common models to preload with lower priority
const SECONDARY_MODELS = [
  '/inventory/desktops/office_desktop_pc.glb',
  '/inventory/monitors/standard_monitor.glb',
  '/inventory/peripherals/gaming_mouse.glb',
  '/inventory/peripherals/wireless_keyboard.glb',
  '/inventory/routers/basic_router.glb',
  '/inventory/switches/managed_switch.glb',
  '/inventory/servers/tower_server.glb'
];

export function useGLBPreloader(options: { 
  preloadCommon?: boolean;
  preloadSecondary?: boolean;
  delay?: number;
} = {}) {
  const { 
    preloadCommon = true, 
    preloadSecondary = false, 
    delay = 1000 // Wait 1 second after component mount before preloading
  } = options;

  useEffect(() => {
    if (!preloadCommon) return;

    // Preload common models after a short delay to not interfere with initial room loading
    const timer = setTimeout(() => {
      console.log('🚀 Starting GLB preloader for common models...');
      
      COMMON_MODELS.forEach((modelPath, index) => {
        // Stagger preloading to avoid overwhelming the network
        setTimeout(() => {
          try {
            useGLTF.preload(modelPath);
            if (process.env.NODE_ENV === 'development') {
              console.log(`📦 Preloaded: ${modelPath}`);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to preload ${modelPath}:`, error);
          }
        }, index * 200); // 200ms between each preload
      });
      
    }, delay);

    return () => clearTimeout(timer);
  }, [preloadCommon, delay]);

  useEffect(() => {
    if (!preloadSecondary) return;

    // Preload secondary models after a longer delay
    const timer = setTimeout(() => {
      console.log('🚀 Starting GLB preloader for secondary models...');
      
      SECONDARY_MODELS.forEach((modelPath, index) => {
        setTimeout(() => {
          try {
            useGLTF.preload(modelPath);
            if (process.env.NODE_ENV === 'development') {
              console.log(`📦 Preloaded secondary: ${modelPath}`);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to preload secondary ${modelPath}:`, error);
          }
        }, index * 300); // Slower staggering for secondary models
      });
      
    }, delay + 3000); // Wait 4 seconds total before secondary preloading

    return () => clearTimeout(timer);
  }, [preloadSecondary, delay]);

  // Utility function to preload a specific model on demand
  const preloadModel = (modelPath: string) => {
    try {
      useGLTF.preload(modelPath);
      if (process.env.NODE_ENV === 'development') {
        console.log(`📦 On-demand preloaded: ${modelPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to preload ${modelPath}:`, error);
    }
  };

  return { preloadModel };
}

// Preload a specific inventory item by filename
export function preloadInventoryItem(filename: string) {
  const modelPath = `/inventory/${filename}.glb`;
  try {
    useGLTF.preload(modelPath);
    if (process.env.NODE_ENV === 'development') {
      console.log(`📦 Inventory preloaded: ${modelPath}`);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to preload inventory item ${modelPath}:`, error);
  }
}