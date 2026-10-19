# Player-like bot profiles and slot planning — priority 10 foundation

**Implemented:** `assets/bot-personalities.json`, `server/botSlots.js`, and `server/botSlots.test.js`.

The catalog defines six named AI archetypes with bounded aggression/accuracy/reaction metrics, preferred combat ranges, primary/secondary weapons and existing player suit IDs. Its v1 schema is validated by the pure server-side planner.

`planBotSlots(config, humans, seed)` returns deterministic candidate bots for competitive room sizes **6, 10, 14**, only when `fillBots` is opted into. It never fills Survival/co-op rooms. For TDM it respects equal RED/BLUE half-team capacities, and recomputes from authoritative human slots. When more humans join, the last planned bot slots disappear, preserving previous `bot_NN` identifiers. Every planned bot explicitly declares `owner:'server'` so any later controller knows **the room server**, not clients, owns gameplay decisions.

**Important: these are proposed roster entries only.** Bot clients are not spawned, replicated, scored, or controlled by this module. `server/server.js` does not yet instantiate or broadcast them, and `roomFlow.js` continues to say bot fill is not active. Activating them now would misrepresent functionality and create easy client spoofing issues.

Remaining priority-10 work: shared navigation/agent traversal, server (or deterministic local test) simulation ticks, target/weapon AI, bot skin model instantiation, authoritative damage/death/respawn, team avoidance and friendly fire, network snapshots and replacement while a match is active; bots must never consume a human's verified slot. This depends on secure room/session ownership and needs human multi-client gameplay QA from priorities 9, 11 and 13.

Automated data/slot checks: `node --test server/botSlots.test.js`.
