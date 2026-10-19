# Scrappy — browser FPS

**Scrappy** is a browser-first FPS powered by **Babylon.js** and native JavaScript ES modules. It runs without a frontend bundler. The game includes four shipped maps, robot combat, Survival waves, Hard/Nightmare difficulty, Elites, weapons and attachments, player progression and Firebase-backed profiles.

This README describes the current **offline-first testing branch** `fix/foundations-room-flow-20261018`. The project has experimental WebSocket room code, but **multiplayer is intentionally deferred** until offline modes and gameplay regressions are accepted. See [the approved scope](docs/APPROVED_PRIORITY_ROADMAP.md).

## Playing locally

Requirements: a modern desktop Chromium/Firefox browser and a static file server (Python 3 or equivalent).

```sh
git clone https://github.com/joaodperes/Scrappy.git
cd Scrappy
git checkout fix/foundations-room-flow-20261018
python3 -m http.server 3000
```

Visit **http://localhost:3000** (not `file://`). Sign in using Google and set your display name. The existing Firebase project is used for authentication, progression and leaderboards. For local sign-in, `localhost` must be allowed in Firebase Authentication authorized domains.

Select **PLAY → LOCAL MODES**, choose a map and:

- **Survival:** normal, Hard or Nightmare endless waves and Elites; uses the standard starting Pistol.
- **Gun Game (vs AI players):** deterministic shuffled weapon ladder, Pistol first and Knife final. Both the human and every bot advance independently by defeating opponents with their currently equipped gun.
- **Kill Confirmed (vs robots):** eliminate robots, then physically collect the glowing dog tag; a frag alone does not award a point.
- **Free-for-all / Team Deathmatch:** local player-shaped bot opponents use their own weapon loadouts, spawn/respawn, acquire each other as targets and score independent frags (FFA) or RED/BLUE team frags (TDM). TDM includes two allied bots on RED alongside the human against three BLUE bots.

Offline arena modes support configurable match time and point targets and five computer-controlled contestants. Their player-shaped meshes and firearm rules are separate from Survival robots. Shots use the real weapon definitions for range, damage and cooldown with simplified bot hit resolution (special projectile/attachment effects are not yet one-to-one identical to the human versions). These new modes still require owner gameplay QA and are not yet considered accepted.

### Experimental network rooms (not required for local modes)

The in-repo server can be started separately:

```sh
cd server
npm ci
npm test
npm start
```

By default it serves WebSocket connections at `ws://localhost:8080`. Multiplayer setup, authority, bot replication, co-op and reconnect are **outside this PR's acceptance scope** and must not be mistaken for production-ready multiplayer. Firebase static Hosting does not run a persistent Node WebSocket service.

## Tests

From the repository root (Node.js 22 recommended to match CI):

```sh
node scripts/check-module-imports.cjs
node scripts/check-inline-modules.cjs
node scripts/validate-map-data.cjs
node --test scripts/*.test.cjs
node --test server/*.test.js
```

See [GitHub Actions quality workflow](.github/workflows/quality.yml). Passing syntax/rules tests does not replace Firefox and Chromium gameplay checks, especially for Jungle/Moon Base geometry, bots, weapons and physics.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/` | Page shell, authentication widgets, HUD, visual style |
| `js/main.js` | Startup, rendering loop, mode orchestration |
| `js/scene.js`, `js/level*.js`, `js/mapManager.js` | Babylon.js scene, maps and geometry |
| `assets/maps/` | Versioned editable map JSON |
| `js/enemies.js`, `js/botNavigation.js`, `js/waves.js` | PvE robots, navigation and Survival |
| `js/localArenaRules.js`, `js/localArenaRuntime.js` | Offline arena scoring, spawning and match flow |
| `js/player.js`, `js/weapons.js`, `js/projectiles.js` | Input, first-person combat, weapon assets |
| `js/progression.js`, `js/questRules.js` | Player progression, quests and Firebase sync |
| `js/roomFlow.js`, `js/pvp.js`, `js/network.js` | Experimental room UX and networked matches (deferred) |
| `server/` | Separate Node/WebSocket prototype and pure server-side rules (deferred for PvP) |
| `editor.html`, `js/editorTransforms.js` | Shared JSON map editor |
| `scripts/` | Static checks and regression tests |
| `docs/` | Approved roadmap, feature contracts, authoring and test checklists |
| `.github/workflows/quality.yml` | CI syntax, imports, map data and tests |

The checked-in `js/babylon.max.js` is a required local Babylon runtime asset; it is **not an obsolete Three.js file**. Keep it unless the HTML/editor dependency and replacement license are reviewed.

## Progression and backend scope

Scrappy uses the existing Firebase Spark plan for Google sign-in and Firestore profiles. The owner explicitly chose a **free, friends-only** model: account-owned profile documents and transaction-safe shop spending, accepting simpler client-reported PvE rewards instead of paid anti-cheat infrastructure. Do not enable paid cloud infrastructure or expose admin credentials.

The shop, secure/concurrent wallet persistence, applied PvE equipment and browser gameplay QA remain work in progress. Pure testing modules are not a shipped UI. See [Firebase architecture](docs/FIREBASE_SPARK_DECISION.md) and [remaining work](docs/OPEN_WORK_REGISTER.md).

## Test and contribution resources

- [Approved priorities and current scope](docs/APPROVED_PRIORITY_ROADMAP.md)
- [Owner gameplay checklist](docs/OWNER_VALIDATION_TODO.md)
- [Unfinished engineering register](docs/OPEN_WORK_REGISTER.md)
- [Local troubleshooting](docs/LOCAL_DEVELOPMENT.md)
- [Map authoring/editor guide](docs/MAP_AUTHORING.md)
- [Jungle dungeon QA](docs/JUNGLE_DUNGEON.md) and [Moon Base QA](docs/MOON_BASE.md)
- [Hard mode](docs/ELITE_ENCOUNTERS.md) and [quests/Scraps](docs/QUESTS_AND_SCRAPS.md)

**Review policy:** develop on the existing draft PR #2 branch, await owner gameplay approval, then close/merge that PR as the owner chooses. Discuss PvP/co-op as a **separate follow-up scope**, not a prerequisite for accepting offline gameplay.
