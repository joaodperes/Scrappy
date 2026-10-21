# Moon Base — independent source implementation (priority 6)

Status: Source implemented on `fix/foundations-room-flow-20261018`; **in-game QA required** before acceptance.

## Data ownership

Moon Base is built through the v2 `assets/maps/terminal.json`, using `js/levelTerminal.js` only for materials/lighting/NavMesh. The old balcony and four ground-to-balcony ramp boxes are preserved.

The base uses `gravityMult: 0.55` for the map. `player.js` already provides a hold-Space, overheat/cooldown jetpack on Moon in all player modes, including PvP. Bot jump and fall integration in `enemies.js` now uses the same map gravity multiplier; the setting is looked up once per update rather than per bot.

## Platforms and traversal

- Existing y=8 perimeter balcony: half-height barriers on exposed outer sides; four original entry ramps from the ground remain.
- Four new y=14 covered resource platforms at (±20, ±24), each with a separate ramp rising from the y=8 north/south balcony and guardrails. The platform's outer (ramp-facing) side is intentionally open for bot/player access.
- The four original y=20 weapon platforms now have partial cover, with an open jetpack-entry side.
- Previously unsupported y=28/y=32 weapon pickup coordinates now have **five solid landing platforms** with partial cover, accessible by player jetpacks. These high pads are not promised as bot-reachable.
- Four survival health/armor marker pickups live on the new y=14 platforms; weapon pickups include four new y=14 pickups (SMG/DMR/Riveter/Rocket) in map configuration. Resource markers have offset positions to avoid overlapping weapons.
- Map-specific enemy/PvP spawns include ground, balcony and new y=14 platform points; four invalid old y=6 PvP entries have been removed.

## Automated checks

`node scripts/validate-map-data.cjs`

`node --test scripts/moon-base.test.cjs`

Checks cover map schema, protected floater geometry and ramp entrances, balcony cover, health/armor markers, pickup floor support, jetpack logic and bot gravity references. **These are geometric/source checks, not a simulated Babylon/Recast playthrough.**

## Browser QA to close priority 6

1. On Chrome and Firefox, walk a bot/player from the concourse up every original balcony ramp and down again; verify no collision spikes.
2. Have ground-following AI traverse each new y=8→14 floater ramp. Confirm Recast connects its endpoints and bot falling/jumping is visibly affected by Moon gravity.
3. Enter all y=20/28/32 platforms with the jetpack; verify jetpack heat lockout/cooldown, landing support, cover heights and at least one accessible side.
4. Collect all y=14 health, armor and weapon pickups and all previous high pickups. Verify none floats without a platform or clips into barriers.
5. Run a PvP match with two remote clients: confirm each human has a jetpack, position sync remains usable at altitude, and spawn protection is fair. Human-vs-human authority/anticheat belongs to priority 13, not this map milestone.

Do not mark source-level geometry tests as final bot navigation/gameplay acceptance.
