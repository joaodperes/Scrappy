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
| 3 | **Hard Mode rewrite** | Replace the simple 2× scaling with explicit modifier selection, wave scaling, UI explanation, deterministic run modifiers, and player-facing reward expectations; keep default Survival unaffected |
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
