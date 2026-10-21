# Local development / startup verification

## What must be running

The browser game uses static ES modules and the public Firebase web SDK.
**No local `.env` file is required to load the game or its leaderboards.**
The Firebase web configuration is currently embedded in `index.html`.

Start a static HTTP server from the repository root, for example:

```sh
python3 -m http.server 3000
```

Then open `http://localhost:3000` and sign in with Google. The **Play**, **Loadout**
and **Leaderboards** controls are intentionally hidden until authentication and
the player's display name are available.

### Local single-player gameplay (no WebSocket server)

After signing in, select **PLAY → LOCAL MODES**, choose a map and
a mode, then press **START LOCAL MATCH**. Survival supports Normal / Hard /
Nightmare. Offline robot arenas include **Gun Game**, **Kill Confirmed**,
**FFA Practice** and **TDM Practice**, with local score and time goals.
No mode in this local path opens `ws://localhost:8080`, creates a room or
requires a WebSocket server. FFA/TDM remain labeled *Practice* until the
owner validates browser gameplay. Local actors already fight one another
and use RED/BLUE team rules in TDM; their multi-floor navigation and
specialized weapon effects still require QA.

**ONLINE (EXPERIMENTAL)** and **BROWSE ONLINE (EXPERIMENTAL)** remain
available for developers exercising the older multiplayer prototype; they
require a separate WebSocket server. They are **not** part of offline
acceptance or a required condition for closing this PR. Browser messages about `WEBGL_debug_renderer_info` deprecation
and missing Recast WebAssembly source maps are development-tool warnings,
not the reason the multiplayer connection fails.


For networked rooms, start the separate WebSocket server in a second terminal:

```sh
cd server
npm install
npm start
```

This step is **optional** and solely for the deferred multiplayer prototype.
The default local WebSocket address is `ws://localhost:8080`. The server reads
`PORT` from the environment if provided, defaulting to port 8080; no other
server environment variables are required by the current implementation.
For remote deployment, set `window.SCRAPPY_WS_URL` before loading `main.js`
or provide the WebSocket server URL in the room UI.

## External service setup

- Firebase Authentication must enable Google sign-in and authorize the
  **localhost** hostname (Firebase Console → Authentication → Settings →
  Authorized domains). A successful login is required for the game menu.
- Firestore access must be permitted by the project's security rules for
  user profile and leaderboard reads. The client queries `scores` and
  `scores_hard` by score and filters by map; no local credentials file is used.
- If the console shows `auth/unauthorized-domain`, this is an authorized-domain
  setting, **not** a missing `.env` file.
- If the leaderboard displays `ERROR LOADING SCORES`, inspect Firestore
  permission/network errors in the console and Firestore rules.

## When Play/Loadout/Leaderboard do not work

1. Hard-refresh the browser (Ctrl/Cmd+Shift+R) after updating the PR branch.
2. Look for a **module import/export error** in the browser console. Any such
   error can prevent all bindings in `main.js` from running.
3. Check that Google sign-in completed and the display name is set.
4. Run `node scripts/check-module-imports.cjs` from the repository root
   to verify local named imports. The CI workflow runs this automatically.
5. Run `node scripts/validate-map-data.cjs` and `cd server && npm test` for
   additional source-level tests. Browser gameplay still requires manual QA.

Do not put Firebase admin/service-account credentials into the static web app
or commit private API secrets to the repository.
