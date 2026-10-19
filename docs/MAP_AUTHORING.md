# Scrappy Map Authoring Guide (v2)

This is the shared workflow for **Scrapyard, Jungle, City and Moon Base**.
All map content is versioned in `assets/maps/<mapId>.json`; each map's
`js/level*.js` module is still responsible for scene-specific lighting,
materials and any remaining procedural legacy systems.

## Local setup

```sh
git switch fix/foundations-room-flow-20261018
python3 -m http.server 3000
```

Open one of these URLs:

- `http://localhost:3000/editor.html?map=scrapyard`
- `http://localhost:3000/editor.html?map=jungle`
- `http://localhost:3000/editor.html?map=city`
- `http://localhost:3000/editor.html?map=terminal`

Press **F4** to show the editor panel. Drag the camera with the mouse and
scroll to zoom. Select a **colored/editable object** and use **G** for position,
**R** for rotation, or **S** for scale. Nudge with arrow keys; PageUp/PageDown
adjust elevation. Hold Shift for larger increments. Delete removes the selected
entity. The inspector accepts JSON parameters; **Apply & Validate** rebuilds
that object rather than only changing its metadata.

Do not change a parameter ID to refer to a missing platform. The exporter
validates switch references and blocks invalid exports.

### Camera and alignment controls

The editor uses brighter neutral lighting and a readable, scrollable inspector
without changing the final game's materials or atmosphere.

- **Zoom:** mouse wheel is faster and adjusts speed according to distance.
  Zooming changes the editor camera, not the map geometry.
- **Axis-constrained gizmos:** press **G** to move, **R** to rotate or **S**
  to scale. Drag a red X, green Y, or blue Z handle for single-axis editing.
- **Snap position to grid:** enable the checkbox under *Alignment / Snapping*
  and set grid units (default 1). Gizmo movement and keyboard nudges snap
  to exact world-grid positions when committed.
- **Snap rotation to angle:** enable separately, set the angle in degrees
  (default 15°). Rotation gizmos snap to that increment; the **Align
  rotation** button aligns the selected object explicitly.
- **Align position:** explicitly rounds the current X/Y/Z coordinates to
  the chosen grid, even when automatic snapping is off.
- **Exact transform:** select an object and edit numeric **Position** (world
  units), **Rotation** (degrees) and **Scale** (multipliers). Click *Apply
  exact transform* or press Enter. Only finite, nonzero scale factors are
  accepted, and currently enabled snap rules still apply.
- **Reset scale (1, 1, 1):** restores all three scaling multipliers to 1.
  This **does not** overwrite an entity's underlying dimensions, such as
  a wall's `sx`, `sy` or `sz` parameters. Edit those separately in the
  JSON parameter inspector when you intend to change the generated size.

After changing structure, click **Rebuild NavMesh** and check **Show NavMesh**.
Finish by exporting and re-importing to verify transforms persist.

### Add geometry or gameplay objects

Select the corresponding `+` button. The objects currently supported by
the shared runtime are listed in `js/mapSchema.js` under
`ENTITY_DEFINITIONS`; the actual generators are in `js/levelHelpers.js`.

Geometry: floors, walls, columns/pillars, glass, free-form ramps, rise ramps,
ceilings, crates and barrels.

Gameplay: lava, spike traps, destructible walls, jump pads, moving platforms,
zipline cable cars, rooftop lifts, skybridges, staircase flights and activation switches. Give moving platforms stable IDs and list those IDs
in the connected switch's `targetPlatformIds` parameter.

### Spawn and pickup markers

The colored spheres in editor mode are **marker gizmos**, not gameplay
geometry. They do not collide with players, do not contribute to Recast,
and do not appear in normal matches.

- Player Spawn: optional replacement for the map's main spawn.
- Enemy Spawn: when present, replaces the legacy Survival enemy spawn list.
- PvP Spawn: when present, replaces the PvP spawn list.
- Weapon Pickup: when any exist, replaces the map's normal static weapon
  spawns. Set `weapon` to an existing weapon definition ID (e.g. `SMG`).
- Health/Armor/Ammo Pickup: augment the map's existing secret kits with
  respawning consumables, at the marker's `position`.

Use the inspector to set marker `modes` when appropriate (e.g.
`["survival"]`), and for a PvP spawn optionally `team` = `RED`,
`BLUE`, or `ANY`. There is not yet authoritative PvP team-spawn enforcement;
the team field is preserved for that future integration.

### Example map document

```json
{
  "map": "scrapyard",
  "version": 2,
  "objects": [
    {
      "id": "demo_floor",
      "generator": "createSlab",
      "params": {
        "px": 0, "surfY": 0, "pz": 0, "sx": 20, "sz": 20,
        "mat": "concrete"
      },
      "position": { "x": 0, "y": -0.18, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "scaling": { "x": 1, "y": 1, "z": 1 }
    }
  ],
  "markers": [
    { "id": "spawn_default", "type": "playerSpawn",
      "position": { "x": 0, "y": 0, "z": 0 } },
    { "id": "health_01", "type": "healthPickup",
      "position": { "x": 5, "y": 1, "z": 2 } }
  ]
}
```

This *example* is illustrative; exporting it over Scrapyard would replace the
existing arena. Always save a backup before importing or changing a layout.

### Export → test → merge

1. **Export JSON**. The export retains IDs and all declared fields;
   it will refuse invalid entities or broken platform links.
2. Replace `assets/maps/<mapId>.json` in your working branch with the export.
3. Validate locally: `node scripts/validate-map-data.cjs`,
   `node --test scripts/map-schema.test.cjs`, and
   `node scripts/check-module-imports.cjs`.
4. Load the editor again and confirm that the objects, marker positions and
   switch links are intact. Click **Rebuild NavMesh** and **Show NavMesh**:
   this uses the actual Recast plugin, not a success-printing stub.
5. Test gameplay: `Play → Single Player → Select Map`. Verify falling,
   collisions, every ramp, jump pad, moving platform, switch, lava/spikes,
   destructibles, and spawn/weapon/health/armor placement.
6. Test AI routes from every major spawn to every important destination.
   Capture screenshots and reproducible start/end positions of failed routes.
7. Only then submit a PR with screenshots, baseline FPS, navigation findings,
   object counts, schema check result and any known limitations.

### How to build a brand-new map

Current menu registration is **not JSON-only**: copy a known working map as a
starting point, add its layout JSON, register the new map in
`js/mapManager.js` (`MAP_CONFIG`: `meta`, `wave`, spawns, weapon spawns,
`levelModule`, `buildFn`), and expose its entry in the editor's
`MAP_MODULES` and map-switcher links. Keep existing default values valid.
A future catalog-driven registration pass can remove the remaining JavaScript
registration step.

### Current exceptions and known limitations

- City now serializes **13 ziplines, 17 rooftop lifts and 8 skybridges**
  as composite, selectable entities. Edit zipline **start/end coordinates**
  or bridge endpoints in the inspector for route changes. Moving their
  anchors translates linked geometry; rotating a moving car alone does
  not redefine its movement path. Verify that cable and endpoint
  positions remain consistent after export/reimport.
- City's decorative **car wrecks, rooftop/relay jump pads and some
  boundaries** are still procedural. Finish migrating those before
  describing the City layout as fully JSON-authoritative.
- Scrapyard's **six staircase composites and 12 jump pads** are now
  serialized in `scrapyard.json`. Stairs are selected and moved as whole
  flights, not as individual mesh steps.
  Stair end flares are baked into the geometry rather than applied through
  the parent mesh's scale: otherwise importing `scaling: {x:1,y:1,z:1}`
  shortens child-step offsets, creating a uniform gap at connected platforms.
  After adjusting stairs, verify the last step reaches the original landing
  and run `node --test scripts/staircase-geometry.test.cjs`.
- Creator-defined maps do not yet provide procedural script hooks from JSON.
  Keep any remaining scene-specific effects in the appropriate level module.
- Rotation-quaternion-based procedural bridges are not editable as generic
  Euler-rotated slabs. They need a dedicated serialized bridge entity.
- Editor marker placement can affect existing gameplay spawn logic only once
  you export the JSON file; in-memory editor edits are not automatically
  persisted to the game server or Firebase.

## Safety rules for shared maps

Keep stable IDs once published. Never repurpose an ID to describe an unrelated
entity. Avoid overlap between hazard geometry and spawn points, ensure
destructibles do not permanently block the *only* route to a mandatory area,
and keep at least one safe human route to important weapon and health pickups.
Do not include secrets, Firebase admin credentials, or executable JavaScript
inside JSON map files.
