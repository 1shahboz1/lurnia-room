import { RoomConfig } from '@/utils/glb-loader';

// Room template types for different learning scenarios
export type RoomTemplate = 
  | 'learning-space';

// Room builder utility
export class RoomBuilder {
  private config: Partial<RoomConfig> = {
    objects: []
  };

  static create(id: string, name: string): RoomBuilder {
    const builder = new RoomBuilder();
    builder.config.id = id;
    builder.config.name = name;
    return builder;
  }

  description(desc: string): RoomBuilder {
    this.config.description = desc;
    return this;
  }

  lighting(type: 'bright' | 'dim' | 'ambient' | 'dramatic'): RoomBuilder {
    if (!this.config.environment) {
      this.config.environment = {};
    }
    this.config.environment.lighting = type;
    this.config.environment.shadows = type !== 'ambient';
    return this;
  }

  camera(position: [number, number, number], target?: [number, number, number], fov?: number): RoomBuilder {
    this.config.camera = {
      position,
      target: target || [0, 0, 0],
      fov: fov || 60
    };
    return this;
  }

  addModel(
    id: string, 
    modelName: string, 
    position: [number, number, number],
    options?: {
      rotation?: [number, number, number];
      scale?: number | [number, number, number];
      quality?: 'low' | 'medium' | 'high';
      interactive?: boolean;
      physics?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): RoomBuilder {
    this.config.objects!.push({
      id,
      type: 'model',
      modelName,
      position,
      rotation: options?.rotation,
      scale: options?.scale || 1,
      quality: options?.quality,
      interactive: options?.interactive !== false,
      physics: options?.physics ? {
        enabled: true,
        type: 'static'
      } : undefined,
      metadata: options?.metadata
    });
    return this;
  }

  build(): RoomConfig {
    if (!this.config.id || !this.config.name) {
      throw new Error('Room must have id and name');
    }
    
    return {
      id: this.config.id,
      name: this.config.name,
      description: this.config.description,
      environment: this.config.environment || { lighting: 'bright', shadows: true },
      camera: this.config.camera || { 
        position: [10, 8, 10] as [number, number, number], 
        target: [0, 0, 0] as [number, number, number], 
        fov: 60 
      },
      objects: this.config.objects || []
    };
  }
}

// Predefined room templates
export const roomTemplates = {
  // Learning Space Template (used as fallback)
  'learning-space': () =>
    RoomBuilder
      .create('learning-space', 'Interactive Learning Space')
      .description('General purpose learning environment for IT concepts')
      .lighting('bright')
      .camera([6, 5, 6], [0, 1, 0], 70)
      .build()
};

// Get room configuration by template
export function getRoomByTemplate(template: RoomTemplate, customizations?: Partial<RoomConfig>): RoomConfig {
  const roomConfig = roomTemplates[template]();
  
  if (customizations) {
    return {
      ...roomConfig,
      ...customizations,
      environment: {
        ...roomConfig.environment,
        ...customizations.environment
      },
      camera: customizations.camera || roomConfig.camera,
      objects: customizations.objects || roomConfig.objects
    };
  }
  
  return roomConfig;
}

// Available room templates info
export const availableRoomTemplates = {
  'learning-space': {
    name: 'Learning Space',
    description: 'General purpose interactive learning environment',
    complexity: 'simple',
    modelCount: 0,
    topics: ['IT Fundamentals', 'Hardware Overview', 'Basic Concepts']
  }
};

export type RoomTemplateInfo = typeof availableRoomTemplates[keyof typeof availableRoomTemplates];
