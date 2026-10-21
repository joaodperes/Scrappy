# Player-like bot profiles and slot planning — deferred network foundation

**Offline-first revision (19 October):** Local Gun Game, Kill Confirmed and FFA/TDM *practice* use the existing Babylon PvE robot AI; they do not import this Node-only planner. The user postponed network rooms/PvP to a later PR. Offline bot factions/personas can eventually adapt the pure profile data and targeting rules, but no feature in this document is evidence that bots fight each other in local FFA/TDM. See [LOCAL_ARENA_MODES.md](LOCAL_ARENA_MODES.md).

**Implemented:** `assets/bot-personalities.json`, `server/botSlots.js`, and `server/botSlots.test.js`.

The catalog defines six named AI archetypes with bounded aggression/accuracy/reaction metrics, preferred combat ranges, primary/secondary weapons and existing player suit IDs. Its v1 schema is validated by the pure server-side planner.

`planBotSlots(config, humans, seed)` returns deterministic candidate bots for competitive room sizes **6, 10, 14**, only when `fillBots` is opted into. It never fills Survival/co-op rooms. For TDM it respects equal RED/BLUE half-team capacities, and recomputes from authoritative human slots. When more humans join, the last planned bot slots disappear, preserving previous `bot_NN` identifiers. Every planned bot explicitly declares `owner:'server'` so any later controller knows **the room server**, not clients, owns gameplay decisions.

## Deterministic decision and session foundation (19 October batch)

- `server/botBrain.js` implements pure server-side intent selection. It chooses targets based on validated actor positions/teams, separates visible from obstructed targets, avoids firing into blocked lines of sight, and requests next navigation waypoints from an injected trusted adapter. Each personality's aggression, reaction time, preferred range and aim influence its steering and fire-intent cadence. It never applies damage or awards kills.
- `server/botSession.js` composes the existing slot planner and bot brains into a server-owned roster. Human arrivals release slots, surviving matching slots preserve their state, spawn positions must be provided by the server, dead bots wait for a bounded respawn time, and frame updates return intent commands without mutating human actors or producing damage.
- `server/botBrain.test.js` (10 cases) and `server/botSession.test.js` (5 cases) cover target selection, TDM friendly-fire exclusion, blocked navigation, deterministic decisions, cooldowns, slot replacement, spawn safety and delayed respawn. Combined with 5 existing bot slot tests: **20 simulated cases passed**.

**Still disabled in real rooms:** neither module is imported by `server/server.js`. No server-owned actor is spawned/replicated, no movement integration or Recast navmesh adapter is wired, and no bot attacks can affect a human. A trusted map-spawn source, collision-safe movement, server-enforced weapons/LOS/damage, state snapshots, late-join replacement and browser QA are required before enabling bot fill.

**Important: these are proposed roster entries only.** Bot clients are not spawned, replicated, scored, or controlled by this module. `server/server.js` does not yet instantiate or broadcast them, and `roomFlow.js` continues to say bot fill is not active. Activating them now would misrepresent functionality and create easy client spoofing issues.

Remaining priority-10 work: shared navigation/agent traversal, server (or deterministic local test) simulation ticks, target/weapon AI, bot skin model instantiation, authoritative damage/death/respawn, team avoidance and friendly fire, network snapshots and replacement while a match is active; bots must never consume a human's verified slot. This depends on secure room/session ownership and needs human multi-client gameplay QA from priorities 9, 11 and 13.

Automated foundation checks: `node --test server/botSlots.test.js server/botBrain.test.js server/botSession.test.js`.
