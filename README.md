# Scrappy – Browser FPS

A fast-paced first-person shooter built entirely in vanilla JavaScript + Three.js, with no build step required.

## Features

- **Solo Wave Mode** – survive endless waves of increasingly difficult AI robots
- **PvP Mode** – real-time multiplayer via WebSocket (requires running the Node.js server)
- **Multiple weapon classes** – Pistol, SMG, Shotgun, Chaingun, Railgun, Plasma Rifle, Rocket Launcher
- **Multi-floor office-park arena** – four distinct buildings (1–3 floors), sky-bridges, stair ramps, and jump pads
- **Procedural textures** – all art is generated with Canvas 2D at startup, no external image assets required
- **Leaderboard** – score submission via Firebase Firestore (requires Firebase credentials)

---

## Running Locally

### Requirements

- Any modern browser (Chrome/Edge/Firefox)
- Node.js 18+ *(only needed for PvP server or local HTTP serving)*
- Python 3 *(optional alternative for a quick static server)*

### Quick Start (Solo Mode)

```bash
# Option A – Python static server
python -m http.server 3000
# Open http://localhost:3000

# Option B – Node static server (no install needed in Node 18+)
node -e "require('http').createServer((q,r)=>{require('fs').readFile('.' + q.url.replace(/\/$/,'/index.html'), (e,d)=>{ r.writeHead(e?404:200); r.end(d||'Not found'); })}).listen(3000)"
# Open http://localhost:3000
```

> **Important:** The game uses ES Modules (`import`/`export`). You **must** serve files over HTTP — opening `index.html` directly via `file://` will not work.

### PvP Server

```bash
cd server
npm install
node server.js          # defaults to port 8080
```

Then in the game menu: enter a player name, room code and point the server URL to `ws://localhost:8080`.

---

## Project Structure

```
index.html          – single-page app shell + HUD markup
js/
  main.js           – game loop, mode orchestration
  scene.js          – Three.js renderer / camera / clock
  level.js          – multi-floor map geometry, collidables, jump pads
  player.js         – movement, input, jump pad trigger, shooting
  enemies.js        – robot AI, spawning, hit/destroy
  projectiles.js    – hitscan (with damage falloff), rockets, plasma
  weapons.js        – weapon definitions, inventory, equip/swap
  pickups.js        – health/armor/ammo drops, weapon drops (w/ 45 s despawn)
  waves.js          – solo wave composition and spawning
  particles.js      – spark pool (pre-allocated, zero GC)
  textures.js       – procedural Canvas2D materials
  audio.js          – Web Audio API sound effects
  lighting.js       – ambient + point lights setup
  ui.js             – HUD updates, hit marker, death screen
  network.js        – WebSocket helpers shared by pvp.js
  pvp.js            – PvP game mode logic
  leaderboard.js    – Firebase Firestore score submission & display
  gameState.js      – shared mutable state (enemies, projs, player, cb)
server/
  server.js         – Node.js WebSocket relay server
  package.json
```

---

## TODO / Next Steps

### Firebase (Leaderboard)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add a **Web App** to the project and copy the config object
3. Open `js/leaderboard.js` and replace the placeholder `firebaseConfig` object with your real credentials:
   ```js
   const firebaseConfig = {
     apiKey:            "YOUR_API_KEY",
     authDomain:        "YOUR_PROJECT.firebaseapp.com",
     projectId:         "YOUR_PROJECT_ID",
     storageBucket:     "YOUR_PROJECT.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId:             "YOUR_APP_ID",
   };
   ```
4. In Firestore, create a collection called `scores` with **Security Rules** allowing public reads and writes (or authenticated writes if you add Firebase Auth)
5. Enable **Firestore Database** in the Firebase console (not Realtime Database)

### Hosting / Deployment

- The client is a static site — it can be deployed to **GitHub Pages**, **Netlify**, **Vercel**, or any static host
- The PvP WebSocket server requires a persistent Node.js host (e.g. **Railway**, **Render**, **fly.io**, or a VPS)
- Update the default `pvpServer` URL in `index.html` to point to your deployed WebSocket server

### Web Assets / Art Direction

Three.js supports loading external textures (`THREE.TextureLoader`) and GLTF models (`GLTFLoader`).  
For the "rusty office park" vibe, good free sources include:

| Resource | URL | License |
|---|---|---|
| Kenney game assets | https://kenney.nl/assets | CC0 |
| Poly Haven (textures/HDRIs) | https://polyhaven.com | CC0 |
| Sketchfab (GLTF models) | https://sketchfab.com/features/free-3d-models | Mixed |
| Quaternius (low-poly packs) | https://quaternius.com | CC0 |
| OpenGameArt | https://opengameart.org | Mixed |

Replace the `rwCache1`/`rwCache2` texture calls in `textures.js` with `THREE.TextureLoader().load('path/to/texture.jpg')` and apply to the wall/floor materials. For GLTF props, use:
```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('models/desk.glb', gltf => scene.add(gltf.scene));
```

### Other Planned Work

- [ ] Add a minimap / floor indicator HUD element to help players navigate the multi-floor map
- [ ] Elevator / lift mechanic as an alternative to jump pads
- [ ] Per-gun reload animations and sound variations
- [ ] Enemy pathfinding that uses building stairs instead of walking through walls
- [ ] Wave victory screen with per-wave summary
- [ ] Firebase Auth so leaderboard scores are verified
- [ ] Mobile/gamepad controller support
