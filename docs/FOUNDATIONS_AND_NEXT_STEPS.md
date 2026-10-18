# Scrappy implementation status (2026-10-18)

This branch is a **foundations** pass against current `main`, not completion of the entire
TODO. Keep the original `fix/bot-map-traversal` PR separate until this branch is tested.

## Implemented in this branch

- Recast navigation (no straight-line placeholder) and unified `#c` rendering/input canvas.
- Editable mesh picking, Babylon version alignment, mutable hazards, composite barrel movement.
- Version-one JSON gameplay entities: `createJumpPad`, `createMovingPlatform`,
  `createPowerSwitch`, with platform IDs resolved on map import.
- Scrapyard's existing pads become editable fallback objects, avoiding JSON duplicates.
- CSS extracted from `index.html` and `editor.html` into `css/`.
- `roomFlow.js`: create, browse, join, lobby roster, password prompt, room capacity,
  mode/maps, auth-gated Play button, solo Survival startup countdown.
- Room-directory server messages, server-enforced room capacity/password, host ownership
  protection, and tests (`cd server && npm test`).
- Basic bot off-mesh navigation links re-integrated against the *current* enemy AI.

## Not implemented: do not advertise as playable

- Co-op Survival over WebSocket; TDM, FFA, and Gun Game runtime/teams/scoring/respawn.
  Non-Survival rooms are lobby-only; solo Survival can start from a room.
- Server-side ready acknowledgments and synchronized pre-match freeze for multiplayer.
- Bot fill with real player-model controllers / AI presets; late joiner bot replacement;
  team selection and authoritative scoring; actual 5-second multiplayer respawns.
- All historic Jungle gameplay features: the current `jungle.json` contains static
  geometry only, and does **not** define pads/platforms/switches. Rebuild through
  the editor or explicitly author those objects based on the current layout.
- Legacy hardcoded complex objects (e.g. City ziplines and some stair composites)
  are not yet independently editable in the JSON inspector.
- End-to-end browser/Firefox renderer and multiplayer testing.

## Required verification before merge

1. `cd server && npm test`, then `npm start`; open the game over HTTP (not file://).
2. Confirm Google login -> Play -> Create Room -> lobby -> solo countdown -> Survival.
3. Open a second browser to Browse Rooms; confirm password rejection, correct join,
   capacity 2 for Survival, and room removal when everyone leaves.
4. Load Scrapyard, Jungle, City, and Terminal in normal gameplay; verify first
   spawn, navmesh building, gameplay rendering and FPS mouse/pointer lock.
5. For each map open `editor.html?map=<id>`. Select/move/export/import static props.
   Add and export a pad, moving platform and power switch; set a switch's
   `targetPlatformIds` to the platform's exported `id`; verify on reimport.
6. Test bots reaching the player across stair tiers and using pads/activated platforms.
   Confirm no ceiling/floor snapping, stuck loops, or fall-through.
7. Confirm old FFA network flow still works (it is not the new room runtime).
8. Check Firefox/WebGL2 warnings after unified Babylon version; no GPU warning
   can be considered fixed solely by a source review.

## Remaining implementation order

1. Stabilize/test the above; restore lost Jungle gameplay entities to the JSON map.
2. Build an authoritative, centrally hosted WebSocket match protocol:
   join/ready/5-second synchronized freeze, map/mode limits, teams,
   player-model bots, bot replacement, scoreboards, death/respawn and rewards.
3. Deliver Survival co-op, TDM, FFA, then Gun Game. Share mode-independent match
   state, damage events and progression; Gun Game uses unique weapon order with
   Pistol first and Knife last.
4. Implement secondary/melee weapon categories and loadout equipment.
5. Implement rotating quests and the Scraps economy server-authoritatively.
6. Add Hard Mode Elite/modifiers and independent player progression/equipment.

### Economy decision (overrides ambiguous older TODO language)

**Scraps buy cosmetics and weapon XP packs only.** Do not sell damage, armor,
speed, equipment bonuses, or other stat upgrades for Scraps. If PvE equipment
progression is added, it must be earned separately and disabled/normalized in
competitive PvP. Track Scrap awards centrally so duplicate Collector rewards
and maxed-weapon conversion cannot be claimed twice.
