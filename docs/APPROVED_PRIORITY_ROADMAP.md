# Approved development order — October 18, 2026

This replaces the previous ordering in FOUNDATIONS_AND_NEXT_STEPS.md.
All development and testing now takes place on the single branch
`fix/foundations-room-flow-20261018` (Draft PR #2). Do not split feature work
into new development branches unless the owner changes this instruction.
**Do not merge unfinished systems because CI passes static checks.** Scrapyard is A+, City is A−.
Moon Base is a distinct low-gravity/jetpack game experience.

| # | Milestone | Acceptance criteria and technical dependencies |
|---|---|---|
| 1 | **Full shared map JSON architecture and definitions** | Versioned shared document and entity registry; stable IDs; reliable validation; transform/parameter round-trip; gameplay markers; turn remaining procedural traversal objects into serializable definitions; backward compatibility for all 4 existing maps |
| 2 | **Complete map editor + contributor guide** | Every intended object selectable and editable; geometry and all runtime behaviors actually update on edit; cross-map material palette; Recast debug and route validation; placement, undo/redo and save/import/export safety; documented creation and testing for community maps |
| 3 | **Hard Mode rewrite** | Replace fixed multipliers with automatic, non-repeating per-wave modifiers; Nightmare stacks persistent modifiers every 10 completed waves; document progression, wave scaling and rewards while keeping Normal Survival unaffected |
| 4 | **Elite enemies for Hard Mode** | Typed Elite modifiers/traits, AI behaviors, visuals, encounter budget, loot, boss interactions; test combinatorial interactions and performance |
| 5 | **Jungle repair** | A real below-surface mine/dungeon, not a perforated floor; solid ceilings/platforms/walls, correct excavation entrances, ramps/lifts, mine lighting/Lantern/NVG, destructibles and enemy nav; preserve the good surface arena |
| 6 | **Moon Base rewrite** | Low gravity also affects bot vertical physics/trajectory; every PvP player has jetpack; additional raised weapon/health/armor platforms, exposed side(s) for entry; cover on new/existing platforms and balcony; ramp access and bot navigation to balcony |
| 7 | **Weapon categories + melee** | Pistol remains the standard Survival Secondary; Aegis is a Primary weapon. Separate Melee/Wonder categories, animation and exclusive special slot remain to be implemented/validated; no configurable Survival sidearm. |
| 8 | **Daily/weekly quests + Scraps rewards only** | Quests keyed by UTC day/week; explicit idempotent local claims; rotating Collector weapon finishes and duplicate-owner Scraps; max-rank PvE XP conversion; **offline MVP implemented**, but secure server-authoritative currency/claim ledger, cross-device consistency and anti-farm remain open; **no shop yet** |
| 9 | **Room creation and browsing** | Production-safe centralized shared server, lobby lifecycle, room visibility/passwords, capacity and mode settings; reconnection, player presence, synchronized readiness |
| 10 | **Player-model bots** | JSON personalities and loadouts/skins, reusable traversal AI, team awareness, server/local match ownership and slots, bot replacement when people join. **Partial:** six personas, server-owned slot planner and TDM team allocation tested; no live bots yet. |
| 11 | **TDM + FFA** | Locally testable complete matches with bots, team rules, scoreboard, spawns, 5-second respawn, time/score limits, attachments, mode XP |
| 12 | **Gun Game** | Shared match seed and unique randomized weapon progression from Pistol to Knife, transitions and kills/challenges, bots |
| 13 | **PvP humans** | Authoritative server hit/weapon validation, anti-cheat, synchronization, remote skins/loadouts, teams, reconnect and latency tests; deploy & load-test |
| 14 | **Co-op Survival** | Exactly 2 players max, authoritative synchronized waves and enemies, pickups, rewards, damage and boss state, disconnect/rejoin |
| 15 | **Cosmetic shop** | Scraps redeem **only** cosmetics and direct-use weapon XP packs; tiers allowed; atomic purchase ledger and balances |
| 16 | **Player stats and equipment** | Earned PvE stat bonuses/equipment and respec balance; never bought using Scraps; normalized or disabled in competitive modes |
| 17 | **Melee/Knife completion and availability** | Current Knife has a model and ammo-free close-range hit and is the last Gun Game weapon, but is not fully integrated as a dedicated melee category or spawned in standard maps. Finish melee input/animation/hit validation, player progression and PvP compatibility, add controlled map/test availability, coordinate with category work in priority 7; avoid claiming the weapon fully implemented until gameplay QA passes. |
| 18 | **Repository cleanup and logical file reorganization — ALWAYS LAST** | Audit files before removal; delete genuinely obsolete/support/generated duplicates without destroying needed tests, docs or workflows; group code by purpose, move test/development scripts found under `js/` into `scripts/` when they are not browser runtime modules; update every import, URL, HTML reference, GitHub Actions path and documentation; run complete CI and browser smoke tests after each batch. Preserve functional runtime modules in `js/`, rather than moving files solely because their names contain “script”. |

## Map priorities and design constraints

- **Scrapyard (A+):** regression baseline, not a redesign candidate.
- **City (A−):** limit scope to minor polish and migrating hardcoded
  bridge/lift/zipline/car features to editor-safe data where practical.
- **Jungle:** surface plus a complete underground dungeon/mine, solid floors and
  ceilings; mine paths should be deliberate doors/tunnels, not open holes.
  Ensure meaningful lantern lighting and strong enemy visual silhouettes.
- **Moon Base:** gravity multiplier applies to *both* humanoid players and
  PvE/PvP bots; jetpack on all human PvP players. Floater weapon/health/armor
  platforms require a safe landing, cover with at least one open access side,
  and reachable routes from the main ring. Balcony half/full-height cover
  while preserving sightlines. Ramps must be navigable by Recast agents.

## Current implementation checkpoint — 19 October 2026

### Priorities 1–2: architecture and editor (owner-tested; accepted for now)

- All four shipped layout files use versioned JSON with stable IDs, shared
  definitions and validation. Scrapyard staircases/pads and City's 13 ziplines,
  17 lifts, 8 skybridges, 44 car wrecks and 33 independent roof/relay pads
  are now represented as JSON entities.
- Composite cars own another 44 roof jump pads inside their entity; they
  are not separately serialized so moving a car moves its roof boost.
- The editor can add and transform all these types, visualize Recast,
  round-trip JSON and author spawn/pickup markers.
- A two-file community-map workflow now exists: a `v2` layout plus an
  entry in `assets/maps/catalog.json`, with runtime/editor discovery and
  `levelCommunity.js` as the reusable builder.
- **Owner confirmation 19 Oct 2026:** priorities 1 and 2 have been tested; no
  changes are required at present. Reopen only for concrete new regressions.

### Priority 3: Hard/Nightmare rules (owner-tested; accepted for now)

- All difficulty selection happens in the **single Play configuration screen**.
  The old main-screen checkbox and player-selected mutator are removed.
- **Hard** unlocks on a normal boss-wave clear on that map. One of four
  modifiers rotates **each wave**, no consecutive repeat.
- **Nightmare** unlocks on the first *Hard* boss-wave clear on that same map
  (past profiles with a Hard wave-10+ clear also qualify).
  Waves 1–10 play like Hard; waves 11–20 lock the previous modifier and
  rotate one additional modifier; waves 21–30 lock two and rotate one more;
  wave 31+ has all four modifiers always active.
- All active effects multiply the Hard base enemy HP/damage/speed or
  wave enemy count. Boss group counts remain controlled by boss-wave logic.
  Score remains 2×; Normal Survival remains unchanged.
- The Play page now uses two top-level choices, Create Room and Browse Rooms;
  Solo is a suboption in Create Room, with match settings scoped to that
  submenu. PvP limits use fixed presets and room sizes of 6/10/14.
- City opaque grey walls, street surfaces and skybridge railings now
  participate in bullet raycasts, while `createGlass` always permits
  shooting through it. Shared collision rules are used by hitscan,
  PvP raycasts, rockets and other physical projectiles.
- **Owner confirmation 19 Oct 2026:** priority 3 has been tested and requires
  no additional changes now. Monitor future regressions, without reopening
  this milestone preemptively.

### Priority 4: Elites (owner-tested, accepted for now)

- A deterministic `eliteRules.js` encounter planner budgets Elites separately
  from Hard/Nightmare wave modifiers, excluding bosses and summons. Normal
  Survival is unchanged. Dual-trait Elites start at wave 25 with explicit cost.
- Three typed traits are wired to spawned PvE enemies: **Bulwark** (direct-hit
  mitigation), **Frenzied** (one-time low-HP speed/damage/attack buff), and
  **Regenerator** (limited out-of-combat healing). Colored, non-collidable halo
  rings, boosted score/XP and one extra consumable identify/reward encounters.
- Boss special projectile attacks previously bypassed Hard/Nightmare damage
  modifiers; they now use the per-wave difficulty multiplier.
- Pure rules, budgets, invalid inputs, trait combinations and boss damage
  have automated tests. See `docs/ELITE_ENCOUNTERS.md` for precise formulas.
- **Owner confirmation:** Elite behavior has been tested and works as expected.
  Accepted for now; reopen only for specific observed regressions.

### October 19 owner-test regression fixes — Survival launch confirmed by owner

- Owner reported all-map play startup failure: `js/main.js` referenced an
  unimported `profile` in the now-reverted Survival Secondary initialization.
  Restored standard Pistol start and imported `profile` for the existing PvP
  flow; added visible error feedback if map building fails.
- Replaced nested PvP Loadout picker with inline selectors to prevent Back
  and Close from dropping the active menu callback. Room picker cancellation
  no longer overwrites the selected match loadout.
- Removed the redundant Home map dropdown; normalized Home menu buttons,
  moved Quests to Home, and queued completion/reward toasts.
- Fixed Collector Aurora's undefined `parentMesh` branch and implemented
  distinct animated emissive palettes for all four Collector finishes.
- **Owner confirmation:** game launching again and Jungle layout is better. This
  confirms the previously reported all-map startup blocker was resolved.
  Further PvP Loadout, Collector visuals, Jungle texture and other browser QA
  are still outstanding.
- **Open gate:** owner must verify actual Firefox/Chromium gameplay and
  browser Console diagnostics. The supplied Firefox Browser Console dump
  consists largely of browser/extension service messages rather than a
  game-page stack trace.

### Priority 5: Jungle dungeon repair (owner confirms improved layout; textured source update awaiting QA)

- Previously the map had 112 editable entities with perforated central ground
  and only a single underground level at −7.5. Deep pickups at −15/−30/−45
  were unsupported; old floor tiles/walls and one southern gate were misplaced.
- **Implemented in `assets/maps/jungle.json`:** 161 editable entities;
  continuous surface (two deliberate excavated entrances), M1 at −7.5,
  M2 at −15, M3 at −30, M4 at −45. Two guarded surface ramps plus one
  guarded ramp per deeper transition; openings cut from upper floor slabs.
  Guarded ramps preserve independent walkable geometry and slight floor
  overlaps so Recast can connect modular slabs.
- Added each stratum's enclosing perimeter, solid overhead ceiling sections,
  cover, optional side-room destructibles, solid lava and spikes. Corrected
  southern gate and displaced mine barrel. The established surface ruins,
  jump pads, lift switches and map borders remain intact.
- `js/mapManager.js`: bot and PvP spawns moved onto actual walkable floors
  with no spawn in a ramp shaft. Deep enemy positions at −28 and −43.
  `js/player.js`: respects Jungle-specific fall reset below the deepest
  floor (−58) and returns to map spawn on actual fall. `js/levelJungle.js`:
  light fixtures now cover all four mine depths.
- `scripts/jungle-dungeon.test.cjs`: schema, shafts, guarded ramps,
  upper/lower landing, deep weapon floor support, layer walls/ceilings,
  bot/PvP spawn support and navigable planar room routes. Full instructions
  and exact route coordinates: `docs/JUNGLE_DUNGEON.md`.
- **Owner feedback 19 Oct 2026:** Jungle now plays better, but was still
  visibly unfinished without textures. Added `js/jungleMaterials.js` with ten
  tiled local image-based materials for soil, moss, ruins, each mine rock
  stratum, ceilings, ramps and rails. Assigned 121 textured entities in
  `assets/maps/jungle.json`; all 161 entities retain the same geometry,
  hazards and serialized IDs. Legacy material aliases remain supported.
  `scripts/jungle-textures.test.cjs` checks recipe assets and stratification.
  **Browser visual approval of the textures is still pending.**
- **Open gate:** Chromium/Firefox collision and in-game Recast bot route
  validation, lower-level pickup access, lava/damage tests, Lantern/NVG,
  weapon spawn visibility, performance and editor round-trip. Code-level
  geometry validation alone is not a passed gameplay test.

### Priority 6: Moon Base (source implementation; browser QA pending)

- Existing Moon `gravityMult:0.55` and local player jetpack logic were
  retained. Bot jumping/falling now respects the map's low-gravity multiplier.
- Four new y=14 floating platforms have ramp connections from the y=8
  balcony, plus partial protective barriers and weapon/health/armor pickups.
  Exposed balcony sides have half-height cover. Previously floating y=28/y=32
  weapon pickups now have solid high platforms with partial cover; original
  four y=20 weapon platforms have cover. Invalid y=6 PvP spawn points removed.
- `scripts/moon-base.test.cjs` validates map schema, geometry, supported
  pickup positions and gravity/jetpack wiring. Detailed contract:
  `docs/MOON_BASE.md`.
- **Open gate:** Babylon/Recast bot reachability on balcony and all y=14
  ramps, two-client PvP jetpacks, weapon pickups and collision/performance
  testing in Chromium and Firefox. Do not mark accepted solely from schema.

### Priority 7: Weapons (category groundwork only; melee pending)

- Created `js/weaponCategories.js` as groundwork for Primary / Secondary /
  Melee / Wonder taxonomy. **Aegis stays Primary; Pistol is the standard
  Survival Secondary.** The unwanted Survival Secondary picker and saved
  sidearm customization were removed after owner testing.
- PvP competitive weapon selection now occurs **inline within Loadout**;
  the previous nested picker broke Back and Close. Two distinct weapons
  save directly to the existing `pvpLoadout` profile setting.
- **Still open:** authoritative slot enforcement, full Primary/Secondary
  weapon balancing, finished melee timing/special slot, blades/hilts skins,
  special slot compatibility and broader end-to-end QA (part overlaps
  priority 17). The source work does not close the full priority.

### Priority 8: Daily/weekly quests + Scraps (offline MVP implemented)

- UTC 00:00 day reset and Monday 00:00 week reset, quest progress fed
  by existing PvE kill/damage/wave completion events. The **Home → QUESTS**
  page now shows objectives, Scraps balance and claim buttons; the former
  Loadout tab was removed. Quest completions and claims display in-game
  toasts using the existing challenge notification queue.
- A local claim ledger makes payouts idempotent per period; rotating
  weekly **animated** Collector weapon finishes are Aurora, Nebula, Cinder and Tundra
  across Pistol/SMG/Shotgun/DMR. Duplicate-owned weekly Collector rewards
  pay Scraps instead; surplus max-rank PvE weapon XP converts to Scraps
  at a 25:1 rate with retained remainder.
- See `js/questRules.js`, `scripts/quest-rules.test.cjs` and
  `docs/QUESTS_AND_SCRAPS.md`.
- **Open gate:** browser profile/Firestore persistence, cross-device claim
  races, verified anti-farm/anti-cheat ledger and authoritative PvP accounting.
  The shop (priority 15) must not spend unverified local Scraps.

### Priority 10: Player-model bots (personas and slot allocator only)

- Added six data-driven, bounded bot personality presets to
  `assets/bot-personalities.json`: name, role, range, aggression,
  accuracy, reaction, human weapon loadout and player skin.
- `server/botSlots.js` calculates deterministic prospective bot rosters
  only in opt-in competitive 6/10/14 rooms, balances TDM slots within each
  half team, and yields slots to newly joined humans. Unit tests verify
  catalog integrity and human slot replacement.
- **Not activated:** no server AI simulation, network replication,
  combat/respawn, authoritative score validation or bot navigation.
  The room lobby correctly continues to say bots are not active.
  `docs/BOT_PERSONAS.md` records dependencies before activation.

### Priority 17: Melee completion — after the currently approved gameplay priorities

- The present Knife is functional as a basic ammo-free close-range attack,
  with a model and a Gun Game finale; it has no regular map weapon spawn and
  does not meet the complete melee/skin/category acceptance criteria.
- Coordinate with priority 7, add proper melee combat verification and a
  deliberate test/availability path without changing established map balance.

### Priority 18: Repository maintenance — always the final task

- Inventory repo files and ownership (runtime, editor, tests, documentation,
  generated/vendor assets, CI). Build a dependency/reference graph first.
- Remove confirmed duplicate/outdated/support artifacts only after checking
  import usage, asset URLs, workflow scripts, contributor docs and test needs.
- Move actual developer/test scripts that are misplaced under `js/` to
  `scripts/`; keep browser ES modules under `js/` even if they implement
  scripting logic. Update all path references atomically and test each batch.
- Modernize demonstrably stale documentation and file layout only after
  behavior-preserving automated and in-browser smoke checks. In particular,
  `README.md` still describes a Three.js renderer while the runtime uses
  Babylon.js; do not delete `js/babylon.max.js` without resolving all its
  HTML/editor usage and vendoring/license constraints.

## Follow-up combat and Play screen changes — 19 October 2026

- User reported inconsistent hits against enemies/explosive barrels; projectile
  collision previously checked only end-of-frame proximity. Shared linear
  projectiles now sweep the traveled segment and resolve the nearest target
  vs solid wall. Invisible player collision controller/viewmodels no longer
  block raycast shots; pure regression tests cover these rules.
- Plasma Rifle Sniper mode is intentionally hitscan (not a traveling plasma
  bolt). It now renders a distinct bright blue precision beam for 0.28 seconds
  to make impacts, missed aim and wall blocking visible.
- Play uses main-menu green colors, standardized Create/Browse panels,
  local Solo nested under Create, map/mode/difficulty settings only in Create,
  unlock prerequisites only in their respective dropdown options, aligned 42px\n  Map/Difficulty selects, collapsible help including Elite rules,
  context-sensitive PvP controls, room directory table and presets.
  PvP time limits: unlimited / 5/10/15/20/30 minutes; kills: unlimited /
  15/30/50/80/100; both may not be unlimited simultaneously.
  PvP room capacity: 6/10/14 (TDM split evenly). The server supports
  untimed matches that end by score; legacy custom-duration rooms remain
  compatible.
- PvP weapon selection is accessible while creating/joining and in the
  Loadout screen; saved weapon slots persist in the profile and are used
  on match start. Gun Game auto-progression and Survival weapon discovery
  bypass preset weapon selection. Server-authoritative validation is still
  an outstanding multiplayer priority.
- Player suit skins are sorted by expected unlock sequence (Standard first).
  Gladiator's new criterion is 250 PvP kills across competitive modes,
  contingent on trustworthy PvP kill validation in priority 13.
- **Remaining verification:** full Node CI, live Firefox/Chromium aiming
  (especially barrel raycasts, long-distance Plasma Sniper shots and
  glass/opaque collisions), room-browser connection and match-mode UX.

## Play-menu and Aegis regression checkpoint — 19 October 2026

- Unified Play setup crash: browser `select.options` is an
  `HTMLOptionsCollection`, not an Array. `roomFlow.js` converts it to
  an array before calling `.find()`; new tests use a realistic collection.
- Main-menu Leaderboards uses the same large `.btn` styling, width and
  menu button container as Play and Loadout.
- **Aegis smart pistol:** ADS paints up to 3 visible enemies (6 with
  Multi-Thread, 1 with Single-Thread). Locks persist after moving the
  crosshair away, but the **entire group clears after firing, any locked
  enemy's death, weapon swap or exiting ADS**. One trigger pull costs one
  round and damages every valid locked enemy, regardless of reticle position.
  After firing, locks may reacquire following the pistol's normal cooldown.
  Glass remains penetrable; opaque walls block lock acquisition and damage.
  **Multi-Thread** increases capacity to 6 without reducing damage per
  target. **Single-Thread** increases damage by **150% (2.5×)**, so its
  unmodified base Aegis hit rises from 30 to 75.
- Red highlights and a visible lock-count HUD provide immediate feedback.
  The target-count/damage modifiers still come from the existing
  `getEffectiveStats('AEGIS',...)` weapon attachment system.
- The Aegis changes apply to PvE robot targets. The later authoritative
  human-PvP implementation will need separate network/remote-player target
  locking and server hit validation.
- **QA outstanding:** live Firefox/Chromium ADS acquisition, 3/6/1
  attachment loadouts, visible targets behind glass vs grey walls,
  reticle moved off the target before firing, magazine/reload edge cases.

## Independent-work execution policy

- Continue source changes and automated tests on
  `fix/foundations-room-flow-20261018` while awaiting browser playtests.
- Never mark Moon (6) or Jungle (5) fully accepted without physics, Recast
  bot routes and Chromium/Firefox gameplay verification.
- The client-side quest/Scraps prototype (8) is **not** a secure ledger.
  Do not connect the shop (15), paid unlocks or competitive rewards to it
  before server-side identity, atomic claims and anti-farm controls.
- A standalone bot profile/slot planner (10) is safe to implement; **real**
  networked bots need room authorization, authoritative simulation and
  multiplayer validation from priorities 9, 11 and 13.
- PvE stats (16) and competitive balance-affecting effects should await
  a safe normalization contract with human PvP. Melee timing/asset QA in 17
  should not be implied by classifying Knife as `melee`.
- Repository cleanup (18) remains last, regardless of added gameplay work.

## Work gates

For each phase, record: implementation files, tests, regression risks, screenshots
or short recordings of behavior, and remaining known issues. Test both Firefox
and Chromium for geometry and editor work. CI's JS syntax/map schema checks
are necessary but not sufficient to pass movement/combat acceptance tests.

## Hosting architecture (proposal, not deployed)

- **Frontend**: Firebase Hosting static app, using the existing Firebase
  Authentication/Firestore project. Production deploy should contain a
  curated `dist/` of public site files, never `server/` or admin credentials.
- **Realtime**: independently hosted Node WebSocket service, initially
  Google Cloud Run over a dedicated `wss://` URL. Do **not** proxy extended
  WebSocket matches through Firebase Hosting rewrites (60-second timeout).
  Cloud Run streams also have request timeouts: configure sensible durations,
  client reconnection and heartbeat. Start with one instance while rooms are
  in memory; move matchmaking/room state to shared storage (Redis/pub-sub or
  equivalent) before horizontal scale.
- **Identity/security**: clients present Firebase ID tokens; verify tokens
  server-side before joining public matchmaking, recording XP/Scraps or
  issuing rewards. Firestore security rules should reject client-forged
  competitive results and currency purchases. Secrets only in server runtime.
- **Ops**: add per-room logs, metrics, rate limits, connection capacity and
  cost/budget alerts. Deploy only after anti-cheat and integration testing.

Cloud services are optional during local Single Player development and
should not be provisioned or charged without explicit user approval.
