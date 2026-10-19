# Remaining engineering work — ordered blockers, not an acceptance claim

**Current branch:** `fix/foundations-room-flow-20261018`.  
**Companion owner test list:** [OWNER_VALIDATION_TODO.md](OWNER_VALIDATION_TODO.md).  
Do not merge a partial system or activate money/rewards solely because static tests pass. This register lists the open engineering work after the 19 October implementation pass, with code entry points.

## Implement / integrate before requesting acceptance

1. **Priorities 5–6: map runtime QA and source corrections.** Browser-confirm Jungle geometry, textured materials, mine ramps and Recast bots, and Moon Base low-gravity, jetpack and balcony routes. Relevant modules: `js/levelJungle.js`, `js/jungleMaterials.js`, `assets/maps/jungle.json`, `js/levelTerminal.js`, `js/mapManager.js`; behavioral docs `JUNGLE_DUNGEON.md`, `MOON_BASE.md`. Do not redesign until owner records failures.

2. **Priorities 7/17: actual dedicated Knife/melee gameplay.** Introduce a real special/melee slot and input/action animation while keeping Gun Game Knife finale. Enforce melee target/range/timing consistently for PvE and PvP, add controlled map availability/unlock and cosmetic progression; respect Aegis Primary/Pistol Secondary. Relevant: `js/weaponCategories.js`, `js/weapons.js`, `js/player.js`, `js/projectiles.js`, `js/loadout.js`, `js/pvp.js`; validate with Firefox/Chromium. Current melee call already passes through `hitscan()`, which delegates to PvP when applicable; do not create a duplicate damage path.

3. **Priority 8: trusted quests/Scraps ledger.** Replace untrusted client `profile.scraps` awards with Firebase-user-owned verified events/atomic claims. The offline MVP is `js/questRules.js` + `js/progression.js` + `js/questPage.js`. `server/economyLedger.js` is a standalone idempotent state machine, **not** deployed or authenticated. Add trusted event receipts, cross-device reconciliations, anti-farm validation and database transactions. Do not spend provisional local Scraps in the shop.

4. **Priority 9: production rooms.** The current in-memory WS server is `server/server.js`; browser UI is `js/roomFlow.js`, `js/network.js`. Implement authenticated identity/token verification, reconnection/reclaiming player ID and host rights, rate limiting/heartbeat, server-side validation of catalog custom maps, multi-instance shared directory and deployment. Existing disconnect paths end an active PvP round after losing its last opponent, intentionally **not** seamless rejoin. Do not deploy paid infrastructure without owner approval.

5. **Priority 10: visible networked bots.** Existing `server/botSlots.js`, `botBrain.js`, `botSession.js` only plan authoritative bot intent; create real collision-safe server navmesh/map spawn adapters, simulate movement/weapons, validate damage and LOS, replicate human-like player model/skin/equipment, fill vacancies, yield slots to humans and synchronize score/respawn. No bot packet should be trusted as a browser client. Only activate after two-client server tests.

6. **Priorities 11–13: competitive match completion.** `server/server.js` has lobby, countdown, scoring, seeded Gun Game and HP/kill events. `js/pvp.js` has client rendering/UI. The server still accepts `msg.dmg` with basic numerical/range throttles, rather than authoritative weapon/aim/geometry verification. `server/pvpIntegrity.js` is a *fail-closed validation contract* with tests, **not wired**. Replace the old hit path with server-owned equip, ammo, aim, verified movement snapshots and collision LOS. Verify hit registration, remote player loadouts/skins/attachments, reward anti-forgery, spectator/death states, latency/lag compensation and TDM team score. Source-level Gun Game order is deterministic but human multi-browser Knife finale must be tested.

7. **Priority 14: 2-player authoritative co-op Survival.** No live co-op runtime exists. Create server-owned wave director, unique enemy IDs/ownership, shared difficulty/boss states, replicated projectiles/damage, pickup and quest rewards, safe reconnect, per-player score, and strict 2-human maximum. Existing `js/waves.js`, `js/enemies.js`, `js/roomFlow.js` are currently solo or competitive and must not be called 'working co-op' from a room UI alone.

8. **Priority 15: actual cosmetics/XP-pack shop.** After (3) and (6), define approved cosmetic art/catalog and tier costs, actual UI in `js/loadout.js` or separate Home screen, atomic database purchases and refunds/duplicates, direct-use XP-pack caps and account recovery. Test balance and item ownership in two concurrent sessions. `server/economyLedger.js` is **in-memory single-process**, meant only as domain logic to adapt to trusted storage.

9. **Priority 16: applied PvE-only stats/equipment.** `js/pveStatsRules.js` is a tested pure allocation/respec/earned-gear rules engine, not yet hooked into `profile`, user-facing menus, stat effects or `js/player.js`. Review balance with owner and wire chosen modifiers to *Survival only*; assert PvP normalization and never price these upgrades in Scraps.

10. **Priority 18: cleanup LAST.** Only after the above is genuinely accepted: audit `js/` against browser imports and `editor.html`, `.github/workflows/quality.yml`, tests, map assets and vendored `js/babylon.max.js`. Update `README.md` from obsolete Three.js instructions to Babylon. Make moves/delete in small batches with automated and both-browser smoke tests. Do not prune tests/docs/runtime modules preemptively.

## Current source/test baseline

- `server/roomSafety.test.js` covers live opponent departure; `scripts/pvp-sync-regressions.test.cjs` verifies server-applied damage is not multiplied twice client-side and matches end only on the server result.
- `server/pvpIntegrity.test.js`: 7 isolated combat-contract cases.
- `server/economyLedger.test.js`: 7 isolated economy-domain cases.
- `scripts/pve-stats-rules.test.cjs`: 5 pure PvE-stat cases.
- Existing server room, Gun Game and bot tests continue to run in the same test glob.
- Local mocked execution of server tests passed **50/50**; pure PvE stats passed **5/5** and PvP sync passed **2/2**. Run the actual Node test suite and GitHub CI on the current branch, then do game/browser validation. These local mocked checks do not prove production correctness.

## Blocking environment/deployment decisions

Cloud Run/Firebase Admin credentials, Firestore security rules, hosting topology, durable shared room storage, budget approval and real multi-client test infrastructure are not available in this development session. Do **not** fake authentication or enable shop/payout/bot combat with client-trusted state as a shortcut. The owner should test ready features in `OWNER_VALIDATION_TODO.md`, then reopen failures or explicitly approve deployment/provisioning when implementation prerequisites are satisfied.
