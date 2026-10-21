# Offline arena modes — initial development slice (October 19, 2026)

**Scope:** single browser, no WebSocket service and no new Firebase services. An initial prototype used Survival robots, but the new runtime uses **player-shaped local arena actors with team/individual combat**. Real Firefox/Chromium gameplay verification, multi-floor nav QA and weapon effect parity are still outstanding.

## Entry and settings

From signed-in Home, choose **PLAY → LOCAL MODES**, then select:
- Survival (unchanged original endless waves, Normal/Hard/Nightmare).
- Gun Game (human plus five bots with individual Pistol→Knife progression).
- Kill Confirmed (RED human + two bot allies versus three BLUE bots; score enemy tags, deny friendly tags).
- Free-for-all (human plus 5 independent player-like bots).
- Team Deathmatch (human plus 2 RED allies versus 3 BLUE bots).

Select a built-in map, arena duration (5/10/15 minutes) and point goal (10/15/25/50), then click **START LOCAL MATCH**. Arena settings are disabled/hidden for Survival and difficulty is only selectable for Survival. No local path calls the WebSocket room-browser functions.

## Implemented local mechanics

- `js/localArenaRules.js`: deterministic 12-weapon ladder (Pistol, ten shuffled firearms, Knife); only eliminations using the current ladder gun count. Local Gun Game finishes with the last Knife kill regardless of selected point goal.
- `js/localArenaActors.js` creates five box-modeled, player-like participants using the existing six personality presets from `assets/bot-personalities.json`, with distinct team/skin colors, nameplates, held weapon models, basic navigation/line-of-sight, individual HP, and 5-second respawns. Bots acquire the human and one another as targets according to game-mode team rules. `js/localArenaRuntime.js` owns match lifecycle, score attribution, local human damage, and the scoreboard. Human hits use the existing `js/enemies.js` target map and the same first-person weapon pipeline; Survival robot spawning is no longer used.
- Kill Confirmed spawns team-colored physical tags at fallen participants. Eliminations alone award **no points**: collecting enemy tags scores, collecting friendly tags denies opponents. AI bots pursue and collect/deny tags. Tags expire after 18 seconds without awarding points.
- A local death is attributed to the actual bot killer (or to the opposing side if unknown) and triggers a five-second respawn if the match continues. Kill Confirmed deaths instead drop recoverable tags; Gun Game deaths can advance the killer's weapon rung. Reaching a point goal (FFA/TDM/KC) or running out of time finishes with a results screen. Gun Game wins only with Knife; timer can end it.
- Saved PvP two-firearm selection is reused as a *local practice loadout* outside Gun Game, with Knife and Wonder weapons excluded from standard selection. Survival retains its fixed Pistol Secondary. No Firestore shop or online room required.

## Deliberate limitations and follow-up engineering

- **FFA/TDM source-level rules now implement bot-versus-bot competition.** FFA scores individual bot kills; TDM has RED/BLUE teams, ally filtering and team score, not simply the human's death count. Bot weapon effects approximate actual `WDEFS` damage/range/rate rather than fully reproducing specialized projectile, heat, attachment or reload behavior. All maps and slopes require browser/navmesh QA before acceptance.
- Bot profiles come from `assets/bot-personalities.json` (with a fallback copy in the browser module). Their primary and secondary guns come from actual `WDEFS` and render via `makeScaledWeaponModel`; outside Gun Game, a bot swaps to its configured Pistol if the primary magazine runs dry, and respawns with its primary. Gun Game always retains the assigned ladder weapon. Bots use simplified hit resolution, not every special projectile/attachment effect. The Node-only `server/botBrain.js` and `server/botSession.js` are not imported in the browser. The existing competitive networking remains deferred.
- Local arena eliminations award modest general/weapon XP, but carry an explicit `ARENA` event source, so they **do not progress Survival-only daily/weekly kill or damage quests**. Advanced or chained player attacks (Tesla/Aegis/flamethrower etc.) retain correct arena kill attribution. The user accepted client-reported XP for a friends-only game; progression balance still needs playtesting.
- Local Gun Game has no server-side synchronized weapon seed because **only one browser participates**. Weapon spawn interference and rapid swapping/reloading must be browser-tested.
- Death timer and time-limit pause semantics, projectile collision in vertical maps, and UI layout/pointer lock after respawn still require real gameplay QA. A source test passing is not a physics test.
- Do not connect local modes to networking as part of this PR. Human PvP, network bots, rooms/rejoin, production servers and co-op are a separate future scope.

## Manual playtest

1. Stop the Node server entirely. Start the static site; confirm all five local modes are selectable and the browser makes no WebSocket requests on launch.
2. Gun Game: start with Pistol, kill robots until ten intermediate guns and final Knife, verify no premature score-limit win and no wrong-gun progression.
3. Kill Confirmed: kill a robot, see one gold dog tag, watch score remain unchanged, collect the tag, see score +1. Let a tag expire and verify it cannot score.
4. Local FFA/TDM: verify distinct human-shaped competitors use own weapon models, fight each other, switch targets by team, respawn, and increment individual (FFA) or shared team (TDM) scores. Check vertical navigation and genuine hit occlusion.
5. Escape → Quit to Menu, choose another arena mode, then Survival. No orphaned tags, timers, overlays or stale weapons.
6. Test Scrapyard, City, Jungle mine and Moon Base ramps, physics and graphics in Chromium and Firefox; inspect the game tab's F12 Console.

## Tests

`node --test scripts/local-arena-rules.test.cjs scripts/local-arena-runtime.test.cjs scripts/play-page.test.cjs scripts/solo-flow.test.cjs`

The three tests only exercise pure rules and DOM simulation. Browser movement/rendering must still be validated. The [owner validation checklist](OWNER_VALIDATION_TODO.md) is the acceptance gate.
