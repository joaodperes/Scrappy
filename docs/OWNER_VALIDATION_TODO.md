# Owner playtest and acceptance to-do — 19 October 2026

**Scope revision:** this PR is now **offline-first**. The owner explicitly
postponed human multiplayer, network co-op and networked-bot features until
a separate later PR. The local game modes below must work without running a
Node WebSocket service. FFA/TDM are *bot practice*, not full team AI yet.

## Offline player-like AI matches — updated acceptance checks

- [ ] **Local Play navigation:** Home → Play opens LOCAL PLAY; select Local Modes; online controls are clearly marked experimental and not a prerequisite.
- [ ] **Gun Game start:** choose a map, duration and score setting with **no** Node server. Every AI competitor starts with Pistol; when bots kill you or each other, their individual weapon advances. Your valid kills advance your own ladder. Incorrect equipped weapons must not advance.
- [ ] **Gun Game finish:** after progressing through all guns, a Knife elimination shows VICTORY; reaching a generic point target early must not finish the ladder.
- [ ] **Kill Confirmed:** RED/BLUE deaths drop team-colored tags. Eliminations alone do not score. You and RED bot allies collect BLUE tags for team points and deny RED tags; BLUE opponents collect RED tags and deny BLUE tags. Expired/denied tags cannot score twice.
- [ ] **Offline FFA / TDM:** confirm five player-shaped AI competitors spawn, hold visible weapons, have distinct names/skins and actually shoot **each other**. FFA counts each bot's own kills; TDM has two RED allies and three BLUE opponents, and teammates cannot damage one another. Verify score/time limits and results.
- [ ] **Local arena loadout:** select local Primary/Secondary weapons without an online room; saved pair persists into local FFA/TDM and Kill Confirmed, while Gun Game always overrides with its weapon ladder.
- [ ] **Local match death/respawn:** after a death, there is a five-second respawn with HP reset and no wave counter reset; if score/time goal ends the match, a single result screen appears.
- [ ] **Local menu/cleanup:** quit through Pause and return to Menu; retry different local mode/map; no leftover dog tags, HUD overlays, bot entities, duplicate score events or orphaned timers.
- [ ] **Survival Gear:** Loadout → SURVIVAL GEAR; earn boss-wave points, allocate Vitality/Mobility/Scavenger, equip at wave 10/20/30, unequip, and use free Reset. Verify HP, speed, ammo pickups and armor change in Survival, but never in Gun Game/FFA/TDM/Kill Confirmed.
- [ ] **Quest separation:** local arena kills, Tesla chains and arena damage grant ordinary XP but do not advance Survival-only PvE kills/damage quests. Survival robot kills and damage still advance those objectives.
- [ ] **Survival regression:** return to Survival after a Gun Game or Kill Confirmed match; its endless waves, standard Secondary Pistol, difficulty selection and existing quests still work.
- [ ] **Document checks:** README and LOCAL_DEVELOPMENT instructions match the actual Babylon.js implementation and browser menus.



**Branch to test:** `fix/foundations-room-flow-20261018` (open Draft PR #2).  
**Do not merge into main until the owner confirms acceptance.**  
**Current status:** these tasks are NOT all feature complete. This checklist distinguishes source-implemented / ready-to-evaluate behaviors from systems that cannot yet honestly be validated in a browser.

## Test preparation

- [ ] Check out the branch above. Record the short commit SHA. Hard-refresh after each code update.
- [ ] Use latest Firefox and a Chromium-family browser on desktop; write down OS, browser version and graphics adapter.
- [ ] Start site from repository root with `python3 -m http.server 3000`; open `http://localhost:3000` (not `file://`). Sign in with Google and set a display name.
- [ ] **Optional, deferred only:** for later multiplayer investigation, start `cd server && npm ci && npm start` and use two browsers. **Do not run this for offline PR acceptance.**
- [ ] Run from repository root: `node scripts/validate-map-data.cjs`, `node scripts/check-module-imports.cjs`, `node --test scripts/*.test.cjs server/*.test.js`. Record errors and results.
- [ ] When an issue occurs, attach the **page console** stack trace (F12 → Console), the map/mode, reproduction sequence and a screenshot or 15–30 second video. Firefox *Browser Console* browser/extension messages are not a reliable substitute for the game tab.

## A. Ready for owner browser validation (source implementation exists)

### Baseline menus, startup and regression

- [ ] **[1–2] Map editor/JSON** — open Scrapyard, City, Jungle and Moon Base in the editor; move an editable wall/ramp/car, save/export/import, and verify it remains in place with the same collision. Confirm no missing entity/material keys. Test undo/redo and navigation debug.
- [ ] **[menu] Authentication** — Google sign in, name save, logout, login again; no blank menu or duplicate widgets. Home buttons Play, Loadout, Quests and Leaderboards are consistently sized.
- [ ] **[menu] Play** — LOCAL PLAY is the default, with LOCAL MODES for Survival, Gun Game, Kill Confirmed, FFA Practice and TDM Practice. Experimental online room browsing is separate. Map choice appears only in Play; no duplicate Home selector. Back/Close return cleanly.
- [ ] **[solo] Start** — launch and end Survival on *each* of the four maps, then restart. No startup crash, blank canvas or weapons disappearing. Starting Secondary should be the **Pistol**.
- [ ] **[combat] Hits and barrels** — shoot robots and explosive barrels close/far and through glass vs opaque walls; rockets/plasma projectiles should not tunnel through geometry at high movement speed.
- [ ] **[combat] Plasma sniper** — precision hitscan works; a visible blue beam persists briefly after firing; actual hit corresponds to the beam and glass/opaque wall behavior.
- [ ] **[combat] Aegis** — classified Primary, not Secondary. ADS locks up to 3 visible enemies (6 Multi-Thread; 1 Single-Thread), stays locked after moving reticle away, clears on shot/death/swap/ADS exit; one shot hits every valid locked enemy and consumes one round.
- [ ] **[loadout] PvP selection** — loadout selectors remain inline in one window. Change Primary and second firearm, close/reopen and verify persistence. Back/Close never crash; Aegis allowed Primary, Knife/Wonder excluded from standard PvP.
- [ ] **[loadout] Collector effects** — all Aurora, Nebula, Cinder and Tundra finishes animate/change hue on the weapon in game, not just static preview swatches. Check re-equip, weapon swaps and frame rate.

### Survival, maps and hazards

- [ ] **[3] Hard unlock** — Normal boss-wave clear on a map unlocks Hard for that map. Hard mutator rotates each wave without consecutive repeat; Normal has no unexpected modifiers.
- [ ] **[3] Nightmare unlock** — clear Hard boss wave, then verify additional persistent modifiers every ten waves and correct score/rewards. Include an extended run.
- [ ] **[4] Elites** — Bulwark, Frenzied, Regenerator visual markers, mitigation, low-health trigger and healing; bosses and summons excluded from normal Elite budget. Check frame rate on later Hard waves.
- [ ] **[5] Jungle** — test each of **5 guarded ramps** in both directions *without jumping*: both surface→mine −1 entrances, then −1→−2, −2→−3 and −3→−4. No ceilings/floors blocking travel or unintended fall-reset at −25.
- [ ] **[5] Jungle boundaries and hazards** — lava solid and damaging, spike traps, solid ceilings, border walls with no gaps, destructible gates, optional wall destruction and safe weapons/pickup locations on all four depths.
- [ ] **[5] Jungle textures** — soil/moss/ruins/metal/ceiling rock visible with distinct texture patterns; no solid-color placeholders, stretched UVs, missing-image purple patches or jarring seams on tilted ramps. Compare surface sunlight vs mine darkness.
- [ ] **[5] Jungle visibility** — Lantern noticeably lights mine darkness; NVG makes enemies legible; monster outline effects and performance remain acceptable. Check moving platforms, jumps and bot pursuit between depths.
- [ ] **[6] Moon Base** — low gravity affects player and enemy movement, exposed raised platforms are reachable, weapon/health/armor pickups rest on solid platforms, balcony cover protects without blocking routes, bot pathing works on ramps.
- [ ] **[6] Moon Base PvP** — both separate human browsers have jetpacks and can reach floaters and balcony. Confirm landings and reset behavior.
- [ ] **[Scrapyard/City] Regression** — preserved Scrapyard layout/traversal quality and City rooftops/ziplines/lifts/cars; no collisions or lighting regressions after Jungle/Moon changes.

### Progression, quests, leaderboards

- [ ] **[8] Daily/weekly quests** — Home Quests board tracks PvE kills, damage and Survival waves; successful completion produces a toast. PvP damage/kills and environmental damage must **not** advance PvE objectives.
- [ ] **[8] Claim** — claim once; balance increases exactly once; re-opening, reload, duplicate click and repeat claim do not duplicate Scraps. UTC midnight daily reset and Monday UTC weekly reset keep their own progress.
- [ ] **[8] Collector weekly reward** — earn weekly finish, select it on the intended weapon; repeat ownership pays Scraps, not a duplicate skin. Check all animated effects and persistent ownership after logout/login.
- [ ] **[8] Weapon XP** — at PvE weapon max XP, surplus converts to Scraps at 25 XP : 1 Scrap with retained remainder; PvP rewards should not produce extra PvE Scraps.
- [ ] **[leaderboards]** — score submission and pagination/load by map/mode, empty states, authentication and Firestore error handling; no duplicate score submissions after restart.

### Multiplayer: **deferred to separate future PR (NOT a blocker for this PR)**

- [ ] **[9] Public room** — host with a valid map, mode, timer and kill limit; another browser can browse it, join, see both players and correct **(YOU)** label. Room disappears when full/started.
- [ ] **[9] Password and membership** — wrong password rejected; correct retry succeeds. A late guest cannot take host controls. On host leave, a remaining connected human gets host role and can start later.
- [ ] **[9] Capacity/constraints** — 6/10/14 selections, balanced RED/BLUE TDM assignment, invalid combinations rejected; both No Limit options cannot be selected at once.
- [ ] **[9] Countdown** — host starts synchronized five-second countdown. If a guest closes their browser before it ends, the server announces cancellation and a remaining host can start anew after a new guest joins.
- [ ] **[11] Damage synchronization** — compare shooter-reported confirmed damage against victim HP after one hit. A custom damage multiplier must be applied **once**, not twice; both clients should converge on the same remaining HP.
- [ ] **[11] Server-owned results** — a kill near score limit must not display two result screens or award a premature winner; only the server `roundEnd` packet concludes FFA/TDM/Gun Game.
- [ ] **[11] Live opponent disconnect** — once a two-human match has started, close the guest browser; the remaining client should see **MATCH CANCELLED** and return cleanly, not wait out a 5/10-minute timer.
- [ ] **[11] FFA** — two real clients see replicated player positions, hits, deaths, scores, leaderboard and 5-second respawn; matches finish on configured time or kill limit; test map transitions.
- [ ] **[11] TDM** — shared team score and teammate friendly fire prevention. Three or more players distribute across teams without losing join/leave roster information.
- [ ] **[12] Gun Game** — every human gets the **same randomized order**, beginning Pistol and ending Knife; a legal kill advances one weapon; final **human Knife hit** finishes match. Verify score/time display and respawn.
- [ ] **[11–13] Disconnect** — disconnect and reconnect during lobby and active round. **Do not mark seamless rejoin as passed:** authenticated session restoration is not yet implemented. Capture state lost or stuck screens.
- [ ] **[13] Security observation** — attempt intentionally invalid fire/damage packets only in a local/private server test; log any impossible range/damage/speed results. Server-side authoritative validation is **not complete** and must not be approved as secure.

## B. Deferred and unfinished work (not a blocker for offline PR review)

These are developer-owned gates, **not failures you need to reproduce today**.

- [ ] **[7/17] Melee completion** — add and verify dedicated melee slot, controlled regular-map availability, animation/skin progression, hit windows, consistent PvE/PvP collisions and specials. Existing Knife only provides a basic melee attack and Gun Game finale.
- [ ] **[8/13] Trusted rewards** — deploy Firebase identity token verification, prevent forged PvP XP/quest events, add durable cross-device transaction-backed Scraps ledger and atomic claims; validate account switches and double spends.
- [ ] **[9] Network operations** — deploy a trusted persistent WSS service, enforce authenticated rooms/reconnect, validate shared community map catalogs, observability and multiple-server durability before production.
- [ ] **[10] Live humanoid bots** — the tested `server/botBrain.js`/`botSession.js` decision modules still need authoritative movement/navmesh, physics, weapons, HP, networking, model skins and human replacement integration. The server intentionally does not spawn these bots.
- [ ] **[11/12/13] Competitive completion** — full live bots, attachments, Gun Game rewards, robust server-side hit verification and anti-cheat, performance/latency and real-client integration tests.
- [ ] **[14] Two-player co-op Survival** — server-authoritative shared waves, enemy ownership, boss state, pickups, reward claims, disconnect/rejoin; no working co-op match should be claimed yet.
- [ ] **[15] Cosmetic shop** — the new `server/economyLedger.js` is a verified-grant/transaction domain scaffold, **not a usable account wallet**. Add real authenticated persistent storage, reward proof verification, cosmetic catalog/assets, direct-use XP grants and purchase UI. Never connect an untrusted local Scraps balance to spendable items.
- [ ] **[16] Earned PvE equipment/stat UI** — pure `js/pveStatsRules.js` can calculate bounded earned points, gear unlocks, respec and competitive normalization. Still needs approved balance, real profile persistence, UI and Survival application. No PvE bonus may leak into PvP.
- [ ] **[18] Final cleanup** — only after other milestones and browser QA pass: audit source/assets/duplicates, fix stale README, organize developer scripts, run all CI and both browser smoke suites. Never delete working runtime code solely to tidy filenames.

## Reporting template

When returning test results, include: **SHA**, **browser/device**, **map**, **mode/difficulty**, **pass/fail for each checkbox**, **steps to reproduce failures**, **F12 Console error**, and **screenshot/video if useful**. Short labels such as `J5 ramps FAIL` or `GunGame Knife PASS` are enough to identify the item; attach details only for failures.

**Acceptance rule:** a checkbox in part A is only a source-implemented feature pending your real test, not evidence of passing it. Part B must be implemented, protected by tests and actually browser/network-tested before declaring the full approved roadmap complete.
