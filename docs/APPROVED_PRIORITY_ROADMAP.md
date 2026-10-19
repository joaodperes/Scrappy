# Approved development order — October 18, 2026

This replaces the previous ordering in FOUNDATIONS_AND_NEXT_STEPS.md.
Stay on Draft PR #2 only for foundation work; later large systems may be
reviewed independently when the branch stabilizes. **Do not merge unfinished
systems because CI passes static checks.** Scrapyard is A+, City is A−.
Moon Base is a distinct low-gravity/jetpack game experience.

| # | Milestone | Acceptance criteria and technical dependencies |
|---|---|---|
| 1 | **Full shared map JSON architecture and definitions** | Versioned shared document and entity registry; stable IDs; reliable validation; transform/parameter round-trip; gameplay markers; turn remaining procedural traversal objects into serializable definitions; backward compatibility for all 4 existing maps |
| 2 | **Complete map editor + contributor guide** | Every intended object selectable and editable; geometry and all runtime behaviors actually update on edit; cross-map material palette; Recast debug and route validation; placement, undo/redo and save/import/export safety; documented creation and testing for community maps |
| 3 | **Hard Mode rewrite** | Replace fixed multipliers with automatic, non-repeating per-wave modifiers; Nightmare stacks persistent modifiers every 10 completed waves; document progression, wave scaling and rewards while keeping Normal Survival unaffected |
| 4 | **Elite enemies for Hard Mode** | Typed Elite modifiers/traits, AI behaviors, visuals, encounter budget, loot, boss interactions; test combinatorial interactions and performance |
| 5 | **Jungle repair** | A real below-surface mine/dungeon, not a perforated floor; solid ceilings/platforms/walls, correct excavation entrances, ramps/lifts, mine lighting/Lantern/NVG, destructibles and enemy nav; preserve the good surface arena |
| 6 | **Moon Base rewrite** | Low gravity also affects bot vertical physics/trajectory; every PvP player has jetpack; additional raised weapon/health/armor platforms, exposed side(s) for entry; cover on new/existing platforms and balcony; ramp access and bot navigation to balcony |
| 7 | **Weapon categories + melee** | Primary / Secondary / Wonder; one Secondary in loadout replaces default Pistol; ammo-free melee timing, special-only slot, blades/hilts skins; Wonder no attachments; backward compatible progression |
| 8 | **Daily/weekly quests + Scraps rewards only** | Quests keyed by date/timezone UTC, idempotent rewards, weekly Collector cosmetics; duplicate-owned skin grants Scraps; maxed-weapon XP conversion to Scraps; balances and anti-farm constraints; **no shop yet** |
| 9 | **Room creation and browsing** | Production-safe centralized shared server, lobby lifecycle, room visibility/passwords, capacity and mode settings; reconnection, player presence, synchronized readiness |
| 10 | **Player-model bots** | JSON personalities and loadouts/skins, reusable traversal AI, team awareness, server/local match ownership and slots, bot replacement when people join |
| 11 | **TDM + FFA** | Locally testable complete matches with bots, team rules, scoreboard, spawns, 5-second respawn, time/score limits, attachments, mode XP |
| 12 | **Gun Game** | Shared match seed and unique randomized weapon progression from Pistol to Knife, transitions and kills/challenges, bots |
| 13 | **PvP humans** | Authoritative server hit/weapon validation, anti-cheat, synchronization, remote skins/loadouts, teams, reconnect and latency tests; deploy & load-test |
| 14 | **Co-op Survival** | Exactly 2 players max, authoritative synchronized waves and enemies, pickups, rewards, damage and boss state, disconnect/rejoin |
| 15 | **Cosmetic shop** | Scraps redeem **only** cosmetics and direct-use weapon XP packs; tiers allowed; atomic purchase ledger and balances |
| 16 | **Player stats and equipment** | Earned PvE stat bonuses/equipment and respec balance; never bought using Scraps; normalized or disabled in competitive modes |

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

### Priorities 1–2: architecture and editor

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
- **Remaining verification:** Browser gameplay and editor QA for parented
  geometry, physics, routes, material treatment and map import/export;
  documentation is not proof of in-game behavior. Test especially the car
  roof boosts after moving and reimporting cars.

### Priority 3: Hard/Nightmare rules (implemented, gameplay QA pending)

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
- Room setup, match mode/map/difficulty, time limit, kill limit, Solo and
  Room Browser now appear **on one Play page**, with details below the
  shared settings box; room/lobby functionality retains the existing server.
- City opaque grey walls, street surfaces and skybridge railings now
  participate in bullet raycasts, while `createGlass` always permits
  shooting through it. Shared collision rules are used by hitscan,
  PvP raycasts, rockets and other physical projectiles.
- **Open gate:** Browser QA of bullet impacts from multiple angles, Hard /
  Nightmare wave transitions and room form behavior. Also complete run
  balancing/reward rationale before marking priority 3 production-ready.

### Priority 4: Elites (source implementation on follow-up branch; QA pending)

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
- **Open gate:** gameplay QA and late-wave performance testing, especially
  combined native shield mitigation, regen/DOT, boss minions, cleanup and
  scoring/rewards. This does **not** close priorities 3 or 4 yet.

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
