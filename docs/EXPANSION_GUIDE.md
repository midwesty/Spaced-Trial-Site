# Expansion Guide

## Add a new location
1. Create a new map object in `data/maps.json`
2. Add a travel node to `data/config.json`
3. Optionally seed NPCs in the map's `actors` array
4. Add related quests and dialogue nodes

## Add a companion
1. Add a template to `data/companions.json`
2. Give them a `dialogueId`
3. Add dialogue nodes in `data/dialogue.json`
4. Place them on a starting map with `startMapId`

## Add items
1. Add item definitions to `data/items.json`
2. Reference them from class starting gear, loot tables, inventories, or shops later

## Add or tweak rules
- Core engine flow: `js/engine.js`
- Rendering: `js/ui.js`
- Data loading: `js/data.js`
- Save/state: `js/state.js`

## Good next upgrades
- Shops and economy screen
- More detailed pathfinding
- More ability targeting templates
- Nested container UI
- Actual line-of-sight cones
- Relationship scenes on ship rests
- More cinematic intro presentation
- Audio playback system for voiced dialogue
