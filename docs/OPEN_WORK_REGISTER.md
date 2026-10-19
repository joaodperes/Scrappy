# Remaining work register — offline first

**Owner revision:** October 19, 2026. Work stays on `fix/foundations-room-flow-20261018` (draft PR #2). **Human PvP and network co-op are deferred to a separate PR**, not acceptance blockers for offline work. Follow the [current roadmap](APPROVED_PRIORITY_ROADMAP.md), not the historic October 18 list below it.

## Current PR — gameplay and product work

1. **Map QA** (`assets/maps/jungle.json`, `js/levelJungle.js`, `js/jungleMaterials.js`, `js/levelTerminal.js`, `js/mapManager.js`): owner must test Jungle's underground strata, lava, ceiling/ramps, Lantern/NVG, enemy traversal and textured materials; Moon Base's low gravity, platforms, balcony and local bot routes in Chromium + Firefox. Scrapyard/City remain regression baselines.

2. **Melee / weapon categories** (`js/weapons.js`, `js/weaponCategories.js`, `js/player.js`, `js/projectiles.js`, `js/loadout.js`): actual dedicated Knife/special slot, animations and hit windows, regular-map availability and cosmetics. Gun Game finale currently uses the existing Knife through PvE hitscan; browser test it before approving.

3. **Offline game modes** (`js/localArenaRules.js`, `js/localArenaRuntime.js`, `js/roomFlow.js`, `js/main.js`, `js/enemies.js`): Gun Game and Kill Confirmed robot matches have source-level runtime implementations and tests; finish browser QA and fix collision, pickups, score, respawn and weapon progress issues. FFA/TDM are explicitly labeled **Practice** because bots target the human, not each other.

4. **Full local FFA/TDM factions and bot personas** (`js/enemies.js`, `js/botNavigation.js`, `js/gameState.js`, `assets/bot-personalities.json`): introduce friendly/opposing local bot groups, bot-vs-bot target/weapon/HP simulation, team kill attribution and balanced score/respawn. Reuse the six personality presets where practical, while keeping server-only Node helpers out of browser imports. This is needed before removing PRACTICE labeling.

5. **Progression/quests** (`js/questRules.js`, `js/progression.js`, `js/questPage.js`): test UTC resets, local/offline arena kill credit and balances, duplicate Collector handling, Firestore sync during two concurrent signed-in browsers. Casual client-reported PvE progress is accepted, but account separation and loss/duplication prevention are still required.

6. **Free Firebase Spark cosmetic/XP shop** (`js/progression.js`, `js/loadout.js`, `server/economyLedger.js` as optional isolated domain reference): implement user-owned `player_profiles/{uid}` Firestore transaction for whole wallet updates, bounded/idempotent purchase receipts, cosmetic-only and directly applied XP purchases, no purchasable PvE stat bonuses. Account sync writes must not overwrite a newer transaction. Verify deployed Firestore rules and test simultaneous browsers. **No paid Cloud Functions or Cloud Run required.** The existing Node ledger is not a usable player wallet.

7. **Earned PvE stats/equipment** (`js/pveStatsRules.js`, `js/progression.js`, `js/player.js`): hook tested pure rules to persistence, an explicit allocation/respec UI and Survival effects, excluding local competitive modes if stats create imbalance; owner approves the balance. No Scraps purchases for earned stats.

8. **Documentation/reference cleanup**: done in part: README now correctly describes Babylon.js, local Play flow and dependencies. `LOCAL_DEVELOPMENT.md`, `LOCAL_ARENA_MODES.md`, `OWNER_VALIDATION_TODO.md` and this register reflect the new scope; historic `FOUNDATIONS_AND_NEXT_STEPS.md` is labeled superseded. Before PR close, audit links, references, unused assets and possible developer-script moves. Preserve browser-imported modules and vendored Babylon; postpone risky deletions/reorganization until the owner confirms offline gameplay.

9. **Final offline acceptance**: run Node test suite and GitHub CI on final HEAD, then owner walks the [offline checklist](OWNER_VALIDATION_TODO.md) in Firefox and Chromium. Only merge or close draft PR #2 on explicit owner instruction.

## Later / separate PR — not prerequisites for current offline features

- Hosted public/private room discovery, WebSocket authentication, reconnect, hosting and observability (`js/roomFlow.js`, `js/network.js`, `server/server.js`).
- Human FFA, TDM, Gun Game, Kill Confirmed over the network, plus server-authoritative hits, ammo, movement and synchronized remote skins/attachments (`server/pvpIntegrity.js` is pure groundwork, not active).
- Networked bot actors/replication, server collision/navmesh and round lifecycle (`server/botBrain.js`, `server/botSession.js` are not connected).
- Strict two-human synchronized co-op Survival: waves, enemies, bosses, pickups, per-user rewards and rejoin.
- Production deployment decisions, costs and paid cloud services. No paid infrastructure has been authorized.

## Current source-level validation

- `scripts/local-arena-rules.test.cjs` — Gun Game ladder, Knife finale, Kill Confirmed tags, expired tags and time/death rules.
- `scripts/local-arena-runtime.test.cjs` — mocked local robot replenishment, tag collection and weapon switching.
- `scripts/play-page.test.cjs` / `scripts/solo-flow.test.cjs` — local-first UI with no WebSocket launch, Survivor Hard/Nightmare selection and clearly separated experimental online controls.
- Existing map, weapon, quests, server/room and Firebase progression tests should remain in CI as **regression coverage**, even when network work is deferred.
- A V8-based simulated execution of the four new/updated suites passed **17/17** cases; this is not actual Node CI or a real Babylon browser playthrough. Confirm with `node --test scripts/*.test.cjs` and `node --test server/*.test.js` before merge.

**Work policy:** avoid scope creep into new multiplayer or cloud-hosting features before the owner signs off on offline gameplay; never claim that a bot-practice arena is full TDM/FFA until actual bot factions fight.
