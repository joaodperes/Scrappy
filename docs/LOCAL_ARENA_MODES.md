# Offline arena modes — initial development slice (October 19, 2026)

**Scope:** single browser, no WebSocket service and no new Firebase services. An initial prototype used Survival robots, but the new runtime uses **player-shaped local arena actors with team/individual combat**. Real Firefox/Chromium gameplay verification, multi-floor nav QA and weapon effect parity are still outstanding.

## Entry and settings

From signed-in Home, choose **PLAY → LOCAL MODES**, then select:
- Survival (unchanged original endless waves, Normal/Hard/Nightmare).
- Gun Game (vs robots).
- Kill Confirmed (vs robots).
- Free-for-all (human plus 5 independent player-like bots).
- Team Deathmatch (human plus 2 RED allies versus 3 BLUE bots).

Select a built-in map, arena duration (5/10/15 minutes) and point goal (10/15/25/50), then click **START LOCAL MATCH**. Arena settings are disabled/hidden for Survival and difficulty is only selectable for Survival. No local path calls the WebSocket room-browser functions.

## Implemented local mechanics

- `js/localArenaRules.js`: deterministic 12-weapon ladder (Pistol, ten shuffled firearms, Knife); only eliminations using the current ladder gun count. Local Gun Game finishes with the last Knife kill regardless of selected point goal.
- `js/localArenaActors.js` creates five box-modeled, player-like participants using the existing six personality presets from `assets/bot-personalities.json`, with distinct team/skin colors, nameplates, held weapon models, basic navigation/line-of-sight, individual HP, and 5-second respawns. Bots acquire the human and one another as targets according to game-mode team rules. `js/localArenaRuntime.js` owns match lifecycle, score attribution, local human damage, and the scoreboard. Human hits use the existing `js/enemies.js` target map and the same first-person weapon pipeline; Survival robot spawning is no longer used.
- Kill Confirmed spawns glowing physical golden dog tags at defeated enemy positions. A frag increments unconfirmed tags but earns **no points** until the player approaches a tag. Tags expire after 20 seconds, reducing the pending tag count without awarding points.
- A local death grants one opposing point and triggers a 5-second respawn if the match continues. Reaching a point goal (FFA/TDM/KC) or running out of time finishes with a results screen. Gun Game wins only with Knife; timer can end it.
- Saved PvP two-firearm selection is reused as a *local practice loadout* outside Gun Game, with Knife and Wonder weapons excluded from standard selection. Survival retains its fixed Pistol Secondary. No Firestore shop or online room required.

## Deliberate limitations and follow-up engineering

- **FFA/TDM source-level rules now implement bot-versus-bot competition.** FFA scores individual bot kills; TDM has RED/BLUE teams, ally filtering and team score, not simply the human's death count. Bot weapon effects approximate actual `WDEFS` damage/range/rate rather than fully reproducing specialized projectile, heat, attachment or reload behavior. All maps and slopes require browser/navmesh QA before acceptance.
- Bot profiles come from `assets/bot-personalities.json` (with a fallback copy in the browser module). Their primary guns come from actual `WDEFS` and render via `makeScaledWeaponModel`. Bots use simplified hit resolution, not every special projectile/attachment effect. The Node-only `server/botBrain.js` and `server/botSession.js` are not imported in the browser. The existing competitive networking remains deferred.
- Local arena kills currently go through the existing PvE progression pipeline. The user has accepted client-reported progression for a friends-only game, but their impact on daily PvE quests and XP balancing should be checked before acceptance.
- Local Gun Game has no server-side synchronized weapon seed because **only one browser participates**. Weapon spawn interference and rapid swapping/reloading must be browser-tested.
- Death timer and time-limit pause semantics, projectile collision in vertical maps, and UI layout/pointer lock after respawn still require real gameplay QA. A source test passing is not a physics test.
- Do not connect local modes to networking as part of this PR. Human PvP, network bots, rooms/rejoin, production servers and co-op are a separate future scope.

## Manual playtest

1. Stop the Node server entirely. Start the static site; confirm all five local modes are selectable and the browser makes no WebSocket requests on launch.
2. Gun Game: start with Pistol, kill robots until ten intermediate guns and final Knife, verify no premature score-limit win and no wrong-gun progression.
3. Kill Confirmed: kill a robot, see one gold dog tag, watch score remain unchanged, collect the tag, see score +1. Let a tag expire and verify it cannot score.
4. Practice FFA/TDM: verify timed HUD, living bot count, enemy respawns, your death and 5-second return, match finish/result. Remember that opponent score is a practice abstraction.
5. Escape → Quit to Menu, choose another arena mode, then Survival. No orphaned tags, timers, overlays or stale weapons.
6. Test Scrapyard, City, Jungle mine and Moon Base ramps, physics and graphics in Chromium and Firefox; inspect the game tab's F12 Console.

## Tests

`node --test scripts/local-arena-rules.test.cjs scripts/local-arena-runtime.test.cjs scripts/play-page.test.cjs scripts/solo-flow.test.cjs`

The three tests only exercise pure rules and DOM simulation. Browser movement/rendering must still be validated. The [owner validation checklist](OWNER_VALIDATION_TODO.md) is the acceptance gate.
