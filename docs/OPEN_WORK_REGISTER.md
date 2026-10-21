# Remaining work register — offline first

**Owner revision:** October 19, 2026. Work stays on `fix/foundations-room-flow-20261018` (draft PR #2). **Human PvP and network co-op are deferred to a separate PR**, not acceptance blockers for offline work. Follow the [current roadmap](APPROVED_PRIORITY_ROADMAP.md), not the historic October 18 list below it.

## Current PR — gameplay and product work

1. **Map QA** (`assets/maps/jungle.json`, `js/levelJungle.js`, `js/jungleMaterials.js`, `js/levelTerminal.js`, `js/mapManager.js`): owner must test Jungle's underground strata, lava, ceiling/ramps, Lantern/NVG, enemy traversal and textured materials; Moon Base's low gravity, platforms, balcony and local bot routes in Chromium + Firefox. Scrapyard/City remain regression baselines.

2. **Melee / weapon categories** (`js/weapons.js`, `js/weaponCategories.js`, `js/player.js`, `js/projectiles.js`, `js/loadout.js`): actual dedicated Knife/special slot, animations and hit windows, regular-map availability and cosmetics. Gun Game finale currently uses the existing Knife through PvE hitscan; browser test it before approving.

3. **Offline game modes** (`js/localArenaRules.js`, `js/localArenaRuntime.js`, `js/localArenaActors.js`, `js/roomFlow.js`, `js/main.js`, `js/enemies.js`): source now has box-modeled player-like participants, actual held weapon models/personas, bot-versus-bot target selection, FFA/TDM scoring, independent Gun Game ladders, and Kill Confirmed tag claim/denial. Browser QA still needed for collision, vertical pathfinding, weapon parity, fairness, score, respawn and tag collection; no gameplay acceptance claim yet.

4. **Local AI parity and pathing** (`js/localArenaActors.js`, `js/botNavigation.js`, `assets/bot-personalities.json`): extend existing faction and bot-vs-bot combat with authentic per-weapon behaviors (projectile/heat/burst/attachments), better model/skin animation, jump pads/platforms/vertical nav and team fairness. Bots now pursue and collect/deny Kill Confirmed tags and can finish Gun Game independently; test behavior on every map before approval.

5. **Progression/quests** (`js/questRules.js`, `js/progression.js`, `js/questPage.js`): test UTC resets, local/offline arena kill credit and balances, duplicate Collector handling, Firestore sync during two concurrent signed-in browsers. Casual client-reported PvE progress is accepted, but account separation and loss/duplication prevention are still required.

6. **Free Firebase Spark cosmetic/XP shop** (`js/progression.js`, `js/loadout.js`, `server/economyLedger.js` as optional isolated domain reference): implement user-owned `player_profiles/{uid}` Firestore transaction for whole wallet updates, bounded/idempotent purchase receipts, cosmetic-only and directly applied XP purchases, no purchasable PvE stat bonuses. Account sync writes must not overwrite a newer transaction. Verify deployed Firestore rules and test simultaneous browsers. **No paid Cloud Functions or Cloud Run required.** The existing Node ledger is not a usable player wallet.

7. **Earned PvE stats/equipment** (`js/pveStatsRules.js`, `js/pveBuildPage.js`, `js/loadout.js`, `js/progression.js`, `js/player.js`, `js/pickups.js`): Loadout now offers Survival Gear ranks, unlockable gear and free respec; bonuses affect Survival health, movement, ammo pickups and starting armor, and are reset for local arenas/network matches. Isolated UI/stat tests passed; remaining work is real browser effects, Firebase persistence/account-switch test and owner balance feedback. No Scraps purchases for earned stats.

8. **Documentation/reference cleanup**: done in part: README now correctly describes Babylon.js, local Play flow and dependencies. `LOCAL_DEVELOPMENT.md`, `LOCAL_ARENA_MODES.md`, `OWNER_VALIDATION_TODO.md` and this register reflect the new scope; historic `FOUNDATIONS_AND_NEXT_STEPS.md` is labeled superseded. Before PR close, audit links, references, unused assets and possible developer-script moves. Preserve browser-imported modules and vendored Babylon; postpone risky deletions/reorganization until the owner confirms offline gameplay.

9. **Final offline acceptance**: run Node test suite and GitHub CI on final HEAD, then owner walks the [offline checklist](OWNER_VALIDATION_TODO.md) in Firefox and Chromium. Only merge or close draft PR #2 on explicit owner instruction.

## Later / separate PR — not prerequisites for current offline features

- Hosted public/private room discovery, WebSocket authentication, reconnect, hosting and observability (`js/roomFlow.js`, `js/network.js`, `server/server.js`).
- Human FFA, TDM, Gun Game, Kill Confirmed over the network, plus server-authoritative hits, ammo, movement and synchronized remote skins/attachments (`server/pvpIntegrity.js` is pure groundwork, not active).
- Networked bot actors/replication, server collision/navmesh and round lifecycle (`server/botBrain.js`, `server/botSession.js` are not connected).
- Strict two-human synchronized co-op Survival: waves, enemies, bosses, pickups, per-user rewards and rejoin.
- Production deployment decisions, costs and paid cloud services. No paid infrastructure has been authorized.

## October 21 local AI source checkpoint

- `js/localArenaActors.js`: bot death and respawn now clear fire/poison
  damage-over-time and obsolete route/target state. Respawning refills the
  current weapon magazine even when the held gun model does not change.
- Local bots no longer use a straight-line movement fallback when Recast
  cannot route to an opponent. Kill Confirmed prioritizes reachable tags
  by navigable route (with brief path scan caching) rather than pursuing
  unreachable targets between disconnected floors; tag destinations project
  to the tag's floor instead of below it.
- `scripts/local-arena-actors.test.cjs`: three additional regressions cover
  respawn cleanup, unreachable movement rejection, and navigable tags.
  All **8/8 actor tests passed in a V8 mocked execution** after this change.
  Full Node/GitHub CI and Firefox/Chromium physics remain to be verified.
  No multiplayer code or hosting service changed.

## October 21 offline combat and economy checkpoint

- `js/localArenaActors.js`, `js/localArenaRuntime.js`: local bots
  use heat/cooling for heat-based firearms, spend burst ammunition, cycle
  back from an empty sidearm to a reloaded primary, approximate short-range
  shotgun damage, and render shot tracers even on missed shots. Finished
  rounds stop updating any remaining bots immediately.
- `scripts/local-arena-actors.test.cjs`: 12/12 focused mocked V8 checks
  passed covering team filtering, firefights, navigation/tag pursuit, ammo,
  heat, burst, visual misses, respawns and match stop. This is **not**
  a full Node test run or a browser physics playtest.
- `js/shopRules.js`: owner-profile Firestore transaction receipts now
  fail closed at 2,048 retained entries, preserving replay idempotency
  instead of pruning XP receipts. Prototype-mutating receipt IDs are rejected.
  Targeted pure V8 checks for purchases, caps and duplicates passed.
  Deployed Firestore owner-only rules and concurrent-browser account writes
  remain unverified.
- `js/questRules.js`, `js/progression.js`: only Survival PvE overflow
  weapon XP converts to Scraps; local arena kills still earn weapon XP but
  do not convert excess. Purchased XP bonuses reduce the remaining base XP
  capacity (including zero-capacity cases). Focused conversion checks passed.
- `js/progression.js`: ordinary profile flushes are serialized in the
  current tab and tracked with a revision token so a stale, failed or
  cross-account completion does not silently clear pending local progress.
  `scripts/profile-cloud-flush.test.cjs` has two focused mocked race checks.
  **This is not cross-device reconciliation:** simultaneous signed-in
  browsers can still overwrite ordinary `profile` field snapshots and must
  be tested against live Firestore before owner acceptance.
- Next engineering work: browser-navmesh/geometry verification across
  Jungle and Moon Base, human/bot weapon and melee balance, Firestore
  account-switch and concurrent reward/shop tests, full Node/CI runs.
  No multiplayer activation, paid cloud changes, or unsafe code cleanup.

## Current source-level validation

- `scripts/local-arena-rules.test.cjs` — Gun Game ladder, Knife finale, Kill Confirmed tags, expired tags and time/death rules.
- `scripts/local-arena-runtime.test.cjs` — mocked local robot replenishment, tag collection and weapon switching.
- `scripts/play-page.test.cjs` / `scripts/solo-flow.test.cjs` — local-first UI with no WebSocket launch, Survivor Hard/Nightmare selection and clearly separated experimental online controls.
- Existing map, weapon, quests, server/room and Firebase progression tests should remain in CI as **regression coverage**, even when network work is deferred.
- A V8-based simulated execution of five focused suites passed **32/32** cases in the latest development pass; this is not actual Node CI or a real Babylon browser playthrough. Confirm with `node --test scripts/*.test.cjs` and `node --test server/*.test.js` before merge.

**Work policy:** avoid scope creep into new multiplayer or cloud-hosting features before the owner signs off on offline gameplay; never claim that a bot-practice arena is full TDM/FFA until actual bot factions fight.


## October 21 feature decisions — XP, Scraps, challenge credit

- Local Gun Game, FFA, TDM and Kill Confirmed currently award **20 general XP per human bot elimination**, and `recordKill('arena', weapon, {source:'ARENA',killMethod})` grants weapon XP using `WEAPON_XP_GRANTS.arena`. Bot-versus-bot eliminations do not grant human XP. No XP is currently tied to a match win, team victory or tag collection. Keep these modes as practice rewards for now; a future explicit balance decision may add participation/win XP, with caps to avoid idle farming.
- `js/main.js` local results now show XP earned during that match and **SCRAPS +0 (ARENA)**. This does not imply Survival weapon overflow grants Scraps to arena matches. Survival conversion still occurs per eligible PvE kill in `js/progression.js`; **a dedicated Survival end-of-run conversion breakdown remains to be implemented**, including fractional per-weapon remainder accounting. Avoid estimating converted Scraps by simply subtracting wallet balances because quest claims and purchases also change the balance.
- Players can see Scraps in **Home → QUESTS** (`js/questPage.js`, `SCRAPS BALANCE`) and **SCRAPS SHOP** (`js/shopPage.js`, `AVAILABLE SCRAPS`). The shop subtracts the transactional wallet's spent amount from earned Scraps; no separate global HUD counter is necessary for minimum shop readiness.
- `resolveKillAttribution` preserves the base gun and the finishing method. A Tesla chain kill records `weaponKey:'TESLA'`, `killMethod:'TESLA_CHAIN'`; `progression.js` updates `killsWith`, `killsByMethod`, `killsByWeaponMethod` and legacy challenge compatibility. Arena kills remain excluded from **Survival-only quests**, but general weapon challenges can read these counters. Mode-specific challenges require explicit eligibility policy rather than assuming every PvE/arena kill qualifies.
- Feature follow-up: add explicit Survival match/run reward ledger (start/end XP, weapon XP, quest Scraps, max-rank conversion Scraps) and display a reliable results breakdown; consider challenge mode filters and per-mode XP tuning before acceptance. Browser QA and cloud race checks stay documented separately, per owner request.


## October 21 additional feature implementation checkpoint

- Survival death screen (`js/main.js`) now displays run XP gain and net Scraps increase, measured from the start of the Survival run. This is a **net balance delta**, not a trustworthy categorized reward ledger; spending/claims during the run can change the total. Follow-up: add explicit per-run weapon-overflow conversion, quest reward, and weapon-XP counters before labeling the result as gross earned currency.
- `js/progression.js` now defines `WEAPON_XP_GRANTS.arena=12` explicitly instead of relying on the default fallback of 8. Existing local mode human bot kills still award 20 account XP. Review economy balancing with owner before adding match-win or participation farming incentives.
- Remaining feature engineering, distinct from browser testing: (1) complete dedicated melee category, animation, hit windows and map availability; (2) bot specialized projectile/explosion/chain/attachment parity and vertical movement; (3) complete Survival run reward ledger; (4) per-mode challenge eligibility and match progression balancing; (5) shop XP-cap explanations and purchase confirmation; (6) Jungle/Moon Base source-level corrections informed by playtests. Do not mark these as complete merely because the roadmap lists source foundations.
- Owner requested **feature work first**; keep all manual/automated test tasks in the existing validation checklist for later. No multiplayer, paid service, or branch merge.


## October 21 follow-on offline feature implementation (source, unaccepted)

- Survival end screen now uses the **explicit per-run reward ledger** in `js/progression.js`, showing earned account XP, weapon XP by gun, Scraps converted from excess Survival weapon XP by gun, and Scraps claimed from quests. It is not a net wallet-balance inference; unclaimed quests do not count as claimed rewards.
- Local arena results grant the existing 20 account XP per human elimination, with the conditional short-session-resistant participation (25 XP) and victory (80 XP) bonuses in `js/main.js`. **Do not grant an additional unconditional victory bonus in the runtime:** it would double-pay successful matches. The results also display per-weapon arena XP gain and bot participant kills/deaths.
- `js/localArenaRuntime.js` preserves bot stats before deleting actors at match end; `js/localArenaActors.js` renders a Knife close-range slash rather than a gun tracer. Launcher bots now fire gravitational, fuse-limited lobbed grenades with swept world collision and delayed area impact, instead of direct straight-line launcher bolts. These are source-level behavior upgrades and still require owner playtest.
- More feature work remains: nuanced bot weapon attachments, complete melee/map-spawn polish, advanced vertical AI fairness/animation, and Jungle/Moon Base geometry and lighting corrections after real map inspection. Launcher bots now have one reflected grenade bounce and Riveter rounds have one wall ricochet; projectile behaviors require browser validation. Do not mark as testing-only; neither browser acceptance nor every weapon effect is complete.
- No human multiplayer, paid Firebase product, deployment, or draft PR merge is included.

- Arena bot gun damage now factors WDEFS distance falloff and competitive-mode multipliers, rather than maintaining point-blank damage across the entire weapon range.
