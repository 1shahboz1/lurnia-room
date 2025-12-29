/**
 * Centralized Logging System
 * 
 * This utility provides controlled logging with different levels to reduce
 * console noise in development and disable logging in production.
 */

export enum LogLevel {
  NONE = 0,     // No logs
  ERROR = 1,    // Only errors
  WARN = 2,     // Errors and warnings
  INFO = 3,     // Errors, warnings, and info
  DEBUG = 4,    // All logs including debug
  VERBOSE = 5   // All logs including verbose component lifecycle
}

// Configuration - easily adjustable
const CONFIG = {
  // Set to LogLevel.NONE to disable all logging
  // Set to LogLevel.ERROR for production
  // Set to LogLevel.DEBUG for development debugging
  currentLevel: LogLevel.WARN, // Reduced from DEBUG to WARN to minimize output
  
  // Component-specific overrides
  componentLevels: {
    'VirtualRoom': LogLevel.ERROR,      // Reduced from DEBUG
    'DynamicRoomStructure': LogLevel.ERROR, // Reduced from DEBUG  
    'ShellMaterial': LogLevel.ERROR,    // Reduced from DEBUG
    'OptimizedModel': LogLevel.ERROR,   // Reduced from DEBUG
    'FirstPersonControls': LogLevel.ERROR, // Reduced from DEBUG
    'WindowView': LogLevel.ERROR,       // Reduced from DEBUG
    'InteractiveModel': LogLevel.ERROR, // Reduced from DEBUG
  } as Record<string, LogLevel>
}

class Logger {
  private shouldLog(level: LogLevel, component?: string): boolean {
    const effectiveLevel = component && CONFIG.componentLevels[component] 
      ? CONFIG.componentLevels[component] 
      : CONFIG.currentLevel
    
    return level <= effectiveLevel
  }

  // Error level - always important
  error(message: string, data?: any, component?: string) {
    if (this.shouldLog(LogLevel.ERROR, component)) {
      console.error(`❌ ${component ? `[${component}] ` : ''}${message}`, data || '')
    }
  }

  // Warning level - important issues
  warn(message: string, data?: any, component?: string) {
    if (this.shouldLog(LogLevel.WARN, component)) {
      console.warn(`⚠️ ${component ? `[${component}] ` : ''}${message}`, data || '')
    }
  }

  // Info level - general information
  info(message: string, data?: any, component?: string) {
    if (this.shouldLog(LogLevel.INFO, component)) {
      console.log(`ℹ️ ${component ? `[${component}] ` : ''}${message}`, data || '')
    }
  }

  // Debug level - development debugging
  debug(message: string, data?: any, component?: string) {
    if (this.shouldLog(LogLevel.DEBUG, component)) {
      console.log(`🐛 ${component ? `[${component}] ` : ''}${message}`, data || '')
    }
  }

  // Verbose level - detailed component lifecycle
  verbose(message: string, data?: any, component?: string) {
    if (this.shouldLog(LogLevel.VERBOSE, component)) {
      console.log(`📝 ${component ? `[${component}] ` : ''}${message}`, data || '')
    }
  }

  // Special logging methods for existing patterns
  material(message: string, data?: any) {
    this.verbose(`🧿 ${message}`, data, 'ShellMaterial')
  }

  texture(message: string, data?: any) {
    this.verbose(`🔥 ${message}`, data, 'TextureSystem')
  }

  model(message: string, data?: any) {
    this.verbose(`🎯 ${message}`, data, 'OptimizedModel')
  }

  controls(message: string, data?: any) {
    this.debug(`🎮 ${message}`, data, 'FirstPersonControls')
  }

  loading(message: string, data?: any) {
    this.info(`📦 ${message}`, data, 'Loading')
  }

  // Geometry generation logging
  geometry(message: string, data?: any) {
    this.verbose(`📐 ${message}`, data, 'GeometrySystem')
  }

  // Lighting system logging
  lighting(message: string, data?: any) {
    this.verbose(`💡 ${message}`, data, 'LightingSystem')
  }

  // Component general logging
  component(message: string, data?: any) {
    this.debug(`🧩 ${message}`, data, 'Component')
  }

  // Component lifecycle logging
  lifecycle(message: string, component: string, data?: any) {
    this.verbose(`🔄 ${message}`, data, component)
  }

  // Performance logging
  performance(message: string, data?: any) {
    this.debug(`⚡ ${message}`, data, 'Performance')
  }
}

// Export singleton instance
export const logger = new Logger()

// Export convenience functions for backward compatibility
export const log = {
  error: (message: string, data?: any, component?: string) => logger.error(message, data, component),
  warn: (message: string, data?: any, component?: string) => logger.warn(message, data, component),
  info: (message: string, data?: any, component?: string) => logger.info(message, data, component),
  debug: (message: string, data?: any, component?: string) => logger.debug(message, data, component),
  verbose: (message: string, data?: any, component?: string) => logger.verbose(message, data, component),
  
  // Special methods
  material: (message: string, data?: any) => logger.material(message, data),
  texture: (message: string, data?: any) => logger.texture(message, data),
  model: (message: string, data?: any) => logger.model(message, data),
  controls: (message: string, data?: any) => logger.controls(message, data),
  loading: (message: string, data?: any) => logger.loading(message, data),
  geometry: (message: string, data?: any) => logger.geometry(message, data),
  lighting: (message: string, data?: any) => logger.lighting(message, data),
  component: (message: string, data?: any) => logger.component(message, data),
  lifecycle: (message: string, component: string, data?: any) => logger.lifecycle(message, component, data),
  performance: (message: string, data?: any) => logger.performance(message, data),
}

// Export configuration for runtime adjustments
export const logConfig = {
  setLevel: (level: LogLevel) => {
    CONFIG.currentLevel = level
  },
  setComponentLevel: (component: string, level: LogLevel) => {
    CONFIG.componentLevels[component] = level
  },
  getCurrentLevel: () => CONFIG.currentLevel,
  getComponentLevel: (component: string) => CONFIG.componentLevels[component] || CONFIG.currentLevel
}
