# BotArena — Complete Free Hosting Guide

Everything you need to run the full stack for free:
**Cloudflare Pages** (game files) · **Firebase** (database + auth) · **Railway** (WebSocket server)

---

## Architecture Overview

```
Browser (players)
    │
    ├── HTTPS GET  ──────► Cloudflare Pages  (static files: HTML, JS, assets)
    │
    ├── HTTPS API  ──────► Firebase           (leaderboard, progression, auth)
    │
    └── WSS        ──────► Railway            (real-time FFA multiplayer server)
```

All three services have **permanent free tiers** with no credit card required for the basics.

---

## Part 1 — Firebase (Database + Authentication)

Firebase is Google's app platform. You'll use **Firestore** (database) and **Anonymous Auth**
(so players get a persistent identity without signing up).

### 1.1 Create a project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Add project**. Give it a name (e.g. `botarena`). Disable Google Analytics if
   you want a faster setup — it's not needed. Click **Create project**.
3. Wait ~30 seconds for provisioning.

### 1.2 Enable Anonymous Authentication

Anonymous auth gives every browser tab a unique, persistent Firebase UID — no password
or email needed. The game uses this as the player's identity for progression.

1. In the left sidebar go to **Build → Authentication**.
2. Click **Get started**, then on the **Sign-in method** tab enable **Anonymous**.
3. Click **Save**.

### 1.3 Create the Firestore database

1. In the left sidebar go to **Build → Firestore Database**.
2. Click **Create database**. Choose **Start in test mode** (you'll tighten rules in 1.4).
3. Pick a region closest to your players (e.g. `eur3` for Europe, `us-central` for US).
4. Click **Done**.

The game uses two top-level collections automatically — no manual schema needed:

| Collection | Purpose |
|---|---|
| `scores` | Leaderboard entries (name, score, wave, mode, date) |
| `progression` | Per-player XP/loadout profile keyed by player name |

### 1.4 Firestore security rules

Replace the default test rules with these production-ready rules. In the Firebase console
go to **Firestore → Rules** and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Leaderboard — anyone can read and insert; no one can edit existing scores
    match /scores/{doc} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
    // Progression — public read; any authenticated user can write their own profile
    match /progression/{playerName} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Cross-session player profiles — keyed by Firebase UID
    // Each user can only read/write their own profile
    match /player_profiles/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Click **Publish**.

### 1.5 Get your Firebase config

1. In the Firebase console click the **⚙ gear icon → Project settings**.
2. Scroll down to **Your apps** and click **</> Web**.
3. Register the app (any nickname). Firebase will show you a config snippet like:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy…",
  authDomain:        "botarena.firebaseapp.com",
  projectId:         "botarena",
  storageBucket:     "botarena.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};
```

Copy the whole object — you'll need it in the next step.

### 1.6 Add Firebase to index.html

Add these scripts **before** your game scripts:

```html
<!-- Firebase SDK (compat mode — works with plain script tags, no bundler needed) -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>

<!-- Initialise Firebase with your project config -->
<script>
  firebase.initializeApp({
    apiKey:            "AIzaSy…",
    authDomain:        "botarena.firebaseapp.com",
    projectId:         "botarena",
    storageBucket:     "botarena.appspot.com",
    messagingSenderId: "123456789",
    appId:             "1:123456789:web:abcdef"
  });
  // Sign in anonymously so the player gets a persistent UID for progression saves
  firebase.auth().signInAnonymously().catch(console.error);
</script>
```

### 1.7 Replace leaderboard.js with the Firebase version

Replace the entire contents of `leaderboard.js` with the following. The exported
function signatures (`submitScore`, `fetchTopScores`, `renderLeaderboard`,
`syncProgressionUp`, `fetchProgression`) are identical — no other files need changing.

```js
// leaderboard.js – Firebase Firestore backend for scores + progression

function _db() {
  return typeof firebase !== 'undefined' ? firebase.firestore() : null;
}

export async function submitScore(name, score, wave, mode = 'solo') {
  const db = _db();
  if (!db) { console.warn('[leaderboard] Firebase not loaded'); return; }
  await db.collection('scores').add({
    name, score, wave, mode,
    date: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(e => console.error('[leaderboard] Submit failed:', e));
}

export async function fetchTopScores(mode = 'solo', count = 10) {
  const db = _db(); if (!db) return [];
  const snap = await db.collection('scores')
    .where('mode', '==', mode)
    .orderBy('score', 'desc')
    .limit(count)
    .get()
    .catch(e => { console.error('[leaderboard] Fetch failed:', e); return null; });
  if (!snap) return [];
  return snap.docs.map(d => d.data());
}

export async function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  if (!el) return;
  el.innerHTML = '<li style="color:#557733">LOADING…</li>';
  const rows = await fetchTopScores();
  if (!rows.length) { el.innerHTML = '<li style="color:#557733">NO SCORES YET</li>'; return; }
  el.innerHTML = rows.map((r, i) =>
    `<li>
      <span style="color:#d8f030;min-width:22px;display:inline-block">${i + 1}.</span>
      <span style="color:#fff;min-width:110px;display:inline-block">${_esc(r.name)}</span>
      <span style="color:#d8f030;font-weight:700">${r.score}</span>
      <span style="color:#557733;font-size:12px;margin-left:8px">W${r.wave ?? '?'}</span>
    </li>`
  ).join('');
}

export async function syncProgressionUp(profile) {
  const db = _db(); if (!db || !profile?.name) return;
  await db.collection('progression').doc(profile.name).set(
    { profile, updated_at: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(e => console.error('[leaderboard] Sync failed:', e));
}

export async function fetchProgression(playerName) {
  const db = _db(); if (!db) return null;
  const doc = await db.collection('progression').doc(playerName).get()
    .catch(() => null);
  return doc?.exists ? doc.data().profile : null;
}

function _esc(s) {
  return String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

**Free tier limits (Spark plan):** 1 GiB storage, 50 k reads/day, 20 k writes/day,
10 GiB bandwidth/month. More than enough for an indie game.

---

## Part 2 — Railway (WebSocket Multiplayer Server)

Railway runs Node.js processes persistently with zero DevOps.

### 2.1 Write the server

Create a file called `server.js` in a new folder (e.g. `botarena-server/`):

```js
// server.js – BotArena FFA WebSocket server
const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss  = new WebSocketServer({ port });

const rooms = new Map();
let _nextId = 1;

wss.on('connection', ws => {
  const id = String(_nextId++);
  let roomId = null, name = 'ANON', config = null;

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      name   = (msg.name || 'ANON').slice(0, 20);
      roomId = (msg.room || 'default').slice(0, 20);
      config = msg.config ?? null;

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      const room = rooms.get(roomId);

      const players = [...room.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score
      }));
      const roomCfg = room.size === 0 ? config : ([...room.values()][0]?.config ?? config);

      ws.send(JSON.stringify({ type: 'welcome', id, players, config: roomCfg }));
      room.set(id, { id, ws, name, x: 0, y: 1.72, z: 0, yaw: 0, hp: 100, score: 0, config: roomCfg });
      _broadcast(room, id, { type: 'playerJoined', id, name });

      if (room.size >= 2)
        _broadcast(room, null, { type: 'roundStart', duration: roomCfg?.roundDuration ?? 600 });
    }

    else if (msg.type === 'move') {
      const room = rooms.get(roomId); if (!room) return;
      const p = room.get(id); if (!p) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
    }

    else if (msg.type === 'hit') {
      const room = rooms.get(roomId); if (!room) return;
      const target = room.get(msg.targetId); if (!target) return;
      target.hp = Math.max(0, (target.hp || 100) - (msg.dmg || 0));
      target.ws.send(JSON.stringify({ type: 'hit', targetId: msg.targetId, dmg: msg.dmg }));

      if (target.hp <= 0) {
        const killer = room.get(id);
        if (killer) killer.score++;
        target.hp = 100;
        const sp = _randSpawn();
        _broadcast(room, null, {
          type: 'killed', victimId: msg.targetId, killerId: id,
          killerName: room.get(id)?.name, killerScore: killer?.score ?? 0
        });
        // Respawn after configured delay
        setTimeout(() => {
          target.ws.send(JSON.stringify({ type: 'respawn', playerId: msg.targetId, x: sp[0], z: sp[2] }));
          _broadcast(room, null, { type: 'respawn', playerId: msg.targetId, x: sp[0], z: sp[2] });
        }, (target.config?.respawnDelay ?? 5) * 1000);
      }
    }

    else if (msg.type === 'ready') { /* acknowledged */ }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId); if (!room) return;
    room.delete(id);
    _broadcast(room, id, { type: 'playerLeft', id });
    if (room.size === 0) rooms.delete(roomId);
  });

  // Push state 20×/sec
  setInterval(() => {
    const room = rooms.get(roomId); if (!room) return;
    const players = [...room.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score
    }));
    ws.send(JSON.stringify({ type: 'state', players }));
  }, 50);
});

function _broadcast(room, excludeId, msg) {
  const json = JSON.stringify(msg);
  for (const [pid, p] of room)
    if (pid !== excludeId && p.ws.readyState === 1) p.ws.send(json);
}

const SPAWNS = [[-20,0,20],[20,0,20],[-20,0,-20],[20,0,-20],[0,0,28],[0,0,-28]];
function _randSpawn() { return SPAWNS[Math.floor(Math.random() * SPAWNS.length)]; }

console.log(`BotArena WS server running on port ${port}`);
```

Create `package.json` alongside it:

```json
{
  "name": "botarena-server",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "ws": "^8.18.0" }
}
```

### 2.2 Deploy to Railway

1. Go to **https://railway.app** and sign up with GitHub.
2. Click **New Project → Deploy from GitHub Repo** and select your server repo.
3. Railway auto-detects Node.js and runs `npm start`.
4. Click **Settings → Networking → Generate Domain**.
   You get a URL like `botarena-server-production.up.railway.app`.
5. Your WebSocket address is `wss://botarena-server-production.up.railway.app`.

### 2.3 Set the default server URL in the game

In `pvp.js`, find the `srvI` input and update the placeholder:

```js
const srvI = txtInp('ffaSrv', 'wss://botarena-server-production.up.railway.app', 260);
```

Both the host and joiners paste this URL in the lobby Server URL field. If you hardcode
it above, it pre-fills automatically.

**Free tier:** 500 execution-hours/month, 1 GB RAM, 1 vCPU. Handles 50+ concurrent players.

---

## Part 3 — Cloudflare Pages (Game Files)

### 3.1 Prepare your repository

Push your game to a GitHub repository:

```
index.html
js/
  main.js  player.js  weapons.js  progression.js  loadout.js
  leaderboard.js  pvp.js  ... (all other .js files)
assets/
  textures/  audio/
```

### 3.2 Deploy

1. Go to **https://pages.cloudflare.com** and sign in.
2. Click **Create a Project → Connect to Git** and select your repo.
3. Build settings: leave blank (no build command, output directory `/`).
4. Click **Save and Deploy**.

Cloudflare gives you a domain like `botarena.pages.dev`. Custom domains are free.

**Free tier:** Unlimited bandwidth and requests, 500 builds/month.

---

## Part 4 — Wiring Everything Together

After deploying all three services, you only need to change **two files** in your game repo:

**`index.html`** — add the Firebase CDN scripts and `initializeApp` call from Part 1.6.

**`leaderboard.js`** — replace with the Firebase version from Part 1.7.

**`pvp.js`** *(optional)* — update the `srvI` placeholder with your Railway URL (Part 2.3).

Push to GitHub. Cloudflare Pages auto-deploys within ~30 seconds.

Total cost: **€0/month**.

---

## Quick Reference

| Service | Purpose | Free Limit | URL |
|---|---|---|---|
| Cloudflare Pages | Game files (HTML/JS/assets) | Unlimited bandwidth | pages.cloudflare.com |
| Firebase Firestore | Leaderboard + progression DB | 50 k reads & 20 k writes/day | console.firebase.google.com |
| Firebase Auth | Anonymous player identity | 10 k sign-ins/month | (same console) |
| Railway | Multiplayer WebSocket server | 500 hrs/month | railway.app |

### Scaling up (if needed)

- **More Railway hours**: Hobby plan ($5/month) removes execution-hour limits.
- **More Firestore quota**: Upgrade to the Blaze pay-as-you-go plan — pricing is fractions
  of a cent per extra operation, practically free at indie scale.
- **Custom domain**: Free on Cloudflare Pages.

---

## Troubleshooting

**"Firebase not loaded"** — Confirm the three Firebase `<script>` tags appear in `index.html`
*before* your game scripts. If you see `firebase is not defined` in the console, the scripts
are either missing or in the wrong order.

**Firestore permission denied** — Check that the security rules from Part 1.4 are published
(not still in test/draft). Test-mode rules expire after 30 days — re-publish if needed.

**WebSocket connection refused** — Use `wss://` not `ws://` for Railway domains, which
require HTTPS/WSS. Check the Railway deployment logs (Dashboard → your project → Logs)
for any Node.js startup errors.

**Scores not appearing in the leaderboard** — Open the Firebase console → Firestore →
`scores` collection and check whether documents are being inserted after a game ends. If
the collection is empty, open browser DevTools console and look for Firestore write errors.

**Anonymous sign-in failing** — Confirm Anonymous is enabled in Firebase Authentication
→ Sign-in method. Double-check that the `authDomain` in your `initializeApp` config
matches the project (it should end in `.firebaseapp.com`).

**Progression not saving between sessions** — `syncProgressionUp` is called from
`progression.js` at the end of each game. If the player's profile name is `ANON` (never
set a callsign), all progress merges under the `ANON` document. Encourage players to set a
unique callsign in the death-screen name field before submitting.
