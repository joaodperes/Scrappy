# Scrappy implementation status — October 18, 2026 (historical snapshot)

**Superseded:** This is a historical PR checkpoint, not the active work order. The owner changed the scope on October 19 to **offline local modes first, multiplayer in a later PR, documentation cleanup in the current PR**. Use [APPROVED_PRIORITY_ROADMAP.md](APPROVED_PRIORITY_ROADMAP.md) for the active order and [LOCAL_ARENA_MODES.md](LOCAL_ARENA_MODES.md) for the new modes.

Consolidated work on Draft PR #2 (`fix/foundations-room-flow-20261018`).
PR #1 was closed **without merging** after its navigation approach was integrated
and adapted to the current AI. Main has not been altered.

## Implemented (source-level; browser QA still required)

- Actual Recast navigation, single Babylon gameplay canvas, editor mesh picking,
  mutable composite/skin hazards, editor/runtime Babylon.js version alignment.
- Extracted `css/game.css` and `css/editor.css` and fixed duplicate DOM IDs.
- Four maps load through shared JSON primitive/entity system.
- Editor can author/serialize `createJumpPad`, `createMovingPlatform` and
  `createPowerSwitch`, including target IDs. Existing Scrapyard jump pads
  become editor-exportable entities. Bot off-mesh navigation was ported from PR #1.
- Jungle's 83-object current JSON was **extended**, not overwritten, with 29
  editable gameplay objects (boundary, ramps, pads, lava/spikes, destructibles,
  platforms and switches). Historical Jungle geometry provided *design guidance*
  but is not geometrically identical to the newer mine-centric JSON layout.
- Repaired formerly fatal top-level `pvp.js` undeclared reference.
- New room flow: Play -> Create/Browse -> password/capacity/host/team lobby;
  map-defined team sizes; disabled Hard Mode outside Survival.
- Solo Survival room can launch locally. Human FFA/TDM/Gun Game matches now
  connect new lobbies to the existing multiplayer client over one socket.
- Server 5-second pre-match countdown, finite match timer, team allocation,
  TDM friendly-fire protection, team/FFA scores, individual death/respawn,
  per-map respawn locations, and Gun Game randomized unique weapon sequence
  starting Pistol and ending Knife.
- Simple Knife melee weapon + model (not the full secondary/melee/skin system).
- PvP scoreboard on Escape, death grayscale, two-gun loadout selector for
  FFA/TDM, Gun Game weapon-progress notification; PvP hitscan vs remote-player
  meshes with local occlusion, server-bounded damage and challenge/XP events.
- Simulated-client TDM and Gun Game lifecycle checks performed. Automated
  room directory, match lifecycle and Gun Game test files added.
- CI workflow checks JS syntax, JSON map schemas and Node protocol tests.

## Important limits (NOT DONE)

- **Competitive network security:** shots, damage, weapon selection and
  movement still originate on clients. Server bounds/rate limits are not
  authoritative line-of-sight/hit validation. Do not use this as a
  cheat-resistant public PvP ranking system.
- Browser end-to-end QA in Firefox/Chromium, WebGL warnings, connection/reconnect
  behavior, map passability, device performance and network jitter.
- Projectile weapons in PvP still need dedicated remote-hit handling; current
  direct PvP hit integration primarily covers hitscan + knife.
- The restored Jungle geometry is *not* confirmed passable or balanced in 3D;
  ramps/platform dock alignment, hazard heights and terrain connections
  require a full navigation and collision test.
- `Fill with bots` is UI placeholder only. Server-managed player-model AI
  controllers, configurable JSON bot personas, bot replacement on late join,
  team selection, loadout skins on remote players remain to be developed.
- Survival co-op needs authoritative PvE world replication; only solo Survival
  is enabled from the new flow.
- Multiplayer-specific loadout/account validation, reconnect, seamless room
  migrations, server readiness acknowledgments and true input freeze during
  the countdown need hardening.
- The full weapon-category/melee/skins system, rotating daily/weekly quests,
  Collector rewards, server-authoritative Scraps shop/XP packs, Hard Mode
  Elite/modifier rewrite and earned PvE equipment progression are not part
  of the current implementation.

## Test commands

```bash
cd server && npm test
cd .. && node scripts/validate-map-data.cjs
```

To test multiplayer, run the WebSocket server (`cd server && npm start`) and
serve the root game over HTTP. Open two authenticated game clients on the same
reachable WebSocket server, create a room in one, browse/join it in the other,
and start FFA/TDM/Gun Game. Verify end-of-match, opposite TDM teams, respawns,
Gun Game order (Pistol first, Knife last), challenges and rejoin behavior.

To test Jungle, visit `editor.html?map=jungle` and inspect the 29 added
entity roots. Test both the new mine and the upper ruins, switch activation,
lava and spikes, collision, ramps, and moving-platform routes. The historical
map and the newest layout are different; remaining historical features must
be adapted, not pasted at conflicting coordinates.

## Recommended next engineering order

1. Run CI and browser QA, fix regressions and correct map geometry.
2. Make PvP authoritative and complete projectile hits, loadout validation and
   readiness/reconnect behavior; implement actual player-model bots and
   server-controlled bot replacement.
3. Build replicated co-op Survival on the same room protocol, with per-map
   NPC waves and shared state.
4. Extend Knife into full Primary/Secondary/Wonder system and reusable melee
   weapons/attachments/skins.
5. Add daily and weekly quests, Collector rewards and the Scraps economy with
   server-enforced balances and transaction IDs.
6. Add Elite/Hard Mode modifiers and separately earned PvE equipment.

### Currency rule

**Scraps are exclusively for cosmetics and weapon XP packs.** Never sell
player/weapon damage, mobility, durability, armor, or equipment power for
Scraps. Earnable PvE equipment must have its own separate progression path and
be normalized/disabled for competitive PvP.
