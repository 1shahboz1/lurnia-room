# Inventory Folder Structure

This directory contains 3D GLB models organized by equipment category for the virtual learning environment.

## Current GLB Files (to be organized):
- `8_port_ethernet_switch.glb` → Should move to `switches/`
- `gaming_laptop.glb` → Should move to `laptops/`

## Category Folders:

### 📡 **switches/**
Network switches and hubs
- Examples: Ethernet switches, managed switches, PoE switches

### 🌐 **routers/**
Network routers and gateways
- Examples: Wireless routers, enterprise routers, access points

### 🖥️ **servers/**
Server hardware and rack equipment
- Examples: Rack servers, blade servers, tower servers

### 💾 **storage/**
Storage devices and solutions
- Examples: NAS devices, hard drives, SSDs, storage arrays

### 💻 **laptops/**
Laptop computers and mobile devices
- Examples: Gaming laptops, business laptops, notebooks

### 🖥️ **desktops/**
Desktop computers and workstations
- Examples: Desktop PCs, workstations, all-in-ones

### 📺 **monitors/**
Display devices and screens
- Examples: LCD monitors, LED displays, projectors

### 🔌 **cables/**
Cables and connectivity hardware
- Examples: Ethernet cables, power cables, USB cables, adapters

### 🖱️ **peripherals/**
Input devices and accessories
- Examples: Keyboards, mice, speakers, webcams, headsets

### 📦 **misc/**
Miscellaneous equipment that doesn't fit other categories
- Examples: UPS units, cooling systems, tools

## Usage:

1. Upload GLB files to their respective category folders
2. The scan-inventory API will automatically detect and categorize items
3. Files are accessible via `/inventory/{category}/{filename}.glb`
4. Metadata can be stored alongside GLB files or in separate metadata files

## File Naming Convention:
- Use lowercase with underscores: `8_port_ethernet_switch.glb`
- Be descriptive but concise
- Include key specifications when relevant