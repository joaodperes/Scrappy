# Multiplayer room reliability — source-level checkpoint

**Branch:** `fix/foundations-room-flow-20261018`
**Roadmap:** Priority 9 (rooms and browsing), independent subset of Priority 12 (Gun Game), isolated Priority 7 weapon-category guard.

## Implemented in this batch

### Hosted-room input validation

`server/server.js` now validates **new directory-room** configuration on the server rather than relying on browser dropdown restrictions:

- Known built-in maps (`scrapyard`, `jungle`, `city`, `terminal`); a missing map defaults to `scrapyard` for compatibility with older clients. Exposing catalog-backed community maps in multiplayer still requires a shared catalog validation design.
- Game modes `survival`, `ffa`, `tdm`, `gunGame` only.
- Capacity is an integer 2–14 (the normal browser UI offers 6/10/14 for competitive rooms). Survival remains exactly 2 slots, and TDM requires even capacity. Older two- and four-player test rooms remain supported.
- Time limit 0–1800 seconds; kill limit 0–500, both integers. Competitive modes cannot disable both limits simultaneously. Missing values default to 600 seconds/30 kills.
- Hosted room names are bounded and trimmed, client-provided bots are reduced to an opt-in boolean, difficulty values are whitelisted, and room codes use safe alphanumeric/underscore/hyphen characters.
- The first host owns the room config; joiners cannot overwrite it. Existing password and capacity checks are preserved. Legacy non-directory sessions are not forcibly migrated.

The validator improves basic input hygiene but is **not** identity verification, anti-cheat or authoritative movement/weapon validation. Priority 13 remains open.

### Countdown/disconnect lifecycle

- Countdown transitions use a per-room generation number, so a stale callback cannot start a canceled match.
- When a player leaves a directory competitive room and fewer than two humans remain, the server cancels the five-second countdown, clears the timer, and broadcasts `roundCancelled`.
- The room frontend maintains the real local player ID for its **(YOU)** label, keeps team information in roster refresh packets, and can show cancellation feedback and re-enable Start.
- If the room socket has already been transferred into the competitive runtime, `pvp.js` handles `roundCancelled` and `main.js` leaves the pending match with **MATCH CANCELLED** instead of hanging on the pre-game overlay.
- The WebSocket server uses one `close` handler for interval cleanup, presence removal, host reassignment, countdown cancellation and empty-room deletion. Its previous two callbacks were easy to miss with the lightweight test harness.

### Weapon/mode consistency

`js/weaponCategories.js` exposes `isCompetitiveFirearm` and `normalizeCompetitiveLoadout`: ordinary FFA/TDM slots cannot select Knife or boss Wonder weapons. The PvP Loadout tab, room picker and match startup all use the same rule. Aegis is still a Primary; Pistol is the standard Survival Secondary. The Knife remains enabled as the final Gun Game weapon but not as an ordinary firearm.

Two bot personality data entries were corrected to use Pistol rather than Aegis as Secondary. Real bot controllers remain disabled.

### Gun Game seed

`server/server.js` now generates a single 32-bit `gunSeed` per Gun Game match, uses a deterministic XorShift32 Fisher-Yates shuffle of the predefined non-Pistol weapon pool, and broadcasts the seed and full shared order in `roundCountdown` and `roundStart`. Pistol is always first and Knife always last. The server owns scoring and advancement for the existing human Gun Game runtime; authoritative hit verification is still Priority 13.

## Testing

```sh
node --test server/roomSafety.test.js server/roomDirectory.test.js server/matchLifecycle.test.js server/gunGame.test.js server/botSlots.test.js
node --test scripts/weapon-categories.test.cjs scripts/menu-quest-regressions.test.cjs
node scripts/check-module-imports.cjs
```

Twenty room/match/bot server tests were executed in a mocked JavaScript server environment against the current source and passed. Dedicated tests also check seeded Gun Game reproduction, invalid room settings, protected-room passwords, host succession, and disconnection before countdown completion. **This is not a full Node/npm invocation nor a real WebSocket/browser integration test.**

## Owner multiplayer QA (remains open)

1. Host/browse/join a public and password room using separate browsers, including failed password retry.
2. Verify three players in TDM: even team balancing and correct (YOU) labels after joins/leaves.
3. Start a match, then disconnect a player during countdown and verify all remaining clients exit the overlay gracefully and can re-host.
4. Start a Gun Game match with two players: confirm both display the same weapon sequence, Pistol-to-Knife progression, timer/score termination, respawns and Kill challenge updates.
5. Test the Room URL and reconnect after network interruption. Robust authenticated rejoin/presence restoration is **not yet implemented**; do not claim Priority 9 production-complete.
6. Verify high latency, disconnect during active round, and invalid weapon/damage packets. These are downstream Priority 13 anti-cheat and synchronization gates.
7. A catalog-backed community map is not yet validated server-side for rooms. The default built-in maps are supported. Co-op and real AI combat are not enabled.
