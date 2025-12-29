# AI Rooms 3D - Virtual Learning Environment

A professional 3D virtual learning room with interactive objects and advanced rotation gizmos.

## Features

### 🎮 Professional Rotation Gizmo
- **🔴 Red Ring**: X-axis rotation (pitch)
- **🟢 Green Ring**: Y-axis rotation (yaw)  
- **🔵 Blue Ring**: Z-axis rotation (roll)
- **⚪ Center Sphere**: Visual reference

### 🏠 Template Room Design
- Smart board on back wall
- Hexagon design patterns
- Windows with transparency
- Professional lighting setup
- Interactive furniture

### 🖱️ Controls
- **Left Click**: Select/Deselect objects
- **Drag Rings**: Rotate on X/Y/Z axis
- **Right Drag**: Orbit camera
- **Scroll**: Zoom in/out
- **Middle Drag**: Pan camera

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Add Your GLB Files
Place your GLB files in the `public/assets/` directory:
```
public/
  assets/
    server.glb
    router.glb
    your-model.glb
```

### 3. Update Asset Configuration
Edit `src/components/VirtualRoom.tsx` and update the `sampleAssets` array:

```typescript
const sampleAssets: GLBAsset[] = [
  {
    id: 'server_1',
    name: 'Main Server',
    fileName: 'server.glb',  // Your GLB filename
    position: [2, 0, -3],
    rotation: [0, 0, 0],
    scale: 1,
    category: 'electronics'
  },
  {
    id: 'router_1',
    name: 'Network Router',
    fileName: 'router.glb',  // Your GLB filename
    position: [-2, 0, -3],
    rotation: [0, 0, 0],
    scale: 1,
    category: 'electronics'
  }
]
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view your 3D room.

## Project Structure

```
src/
  app/
    page.tsx                 # Main page
    layout.tsx              # App layout
    globals.css             # Global styles
  components/
    VirtualRoom.tsx         # Main room component
    ProfessionalRotationGizmo.tsx  # Rotation controls
    GLBAssetLoader.tsx      # GLB asset loader
```

## Adding New Assets

1. **Add GLB file** to `public/assets/`
2. **Update asset configuration** in `VirtualRoom.tsx`
3. **Position and scale** as needed
4. **Test rotation** with the gizmo system

## Troubleshooting

### GLB Files Not Loading
- Ensure files are in `public/assets/` directory
- Check file names match the configuration
- Verify GLB files are valid 3D models

### Rotation Not Working
- Make sure you've selected an object first (click on it)
- Look for the colored rings around the selected object
- Drag the rings to rotate on different axes

### Performance Issues
- Reduce model complexity if needed
- Check browser console for errors
- Ensure GLB files are optimized

## Customization

### Room Design
Edit the `RoomTemplate` component in `VirtualRoom.tsx` to modify:
- Wall colors and materials
- Furniture placement
- Lighting setup
- Decorative elements

### Gizmo Appearance
Modify `ProfessionalRotationGizmo.tsx` to change:
- Ring colors and opacity
- Gizmo scale and positioning
- Visual feedback effects

## Dependencies

- **Next.js 14**: React framework
- **React Three Fiber**: 3D rendering
- **Three.js**: 3D graphics library
- **@react-three/drei**: 3D utilities and helpers

## License

MIT License - Feel free to use and modify for your projects!



