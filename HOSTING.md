# Hosting the Scrappy PvP Server for Free

This guide explains how to get the multiplayer WebSocket server running on the internet at no cost so friends can join your games.

---

## Overview

The PvP server lives in `server/server.js`. It is a plain Node.js WebSocket server.  
Players connect to it via a `wss://` URL that you paste into the in-game PvP menu.

---

## Option 1 – Railway (Recommended, easiest)

Railway gives you a free tier that is more than enough for a small game server.

### Steps

1. **Create a free account** at https://railway.app and sign in with GitHub.

2. **Push your project to GitHub** (if not already):
   ```
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/YOUR_USERNAME/scrappy.git
   git push -u origin main
   ```

3. In Railway, click **New Project → Deploy from GitHub Repo** and select your repo.

4. Railway auto-detects Node.js. It will try to run `npm start` from the repo root.  
   Add a `package.json` to the repo root (if missing) with:
   ```json
   {
     "scripts": { "start": "node server/server.js" },
     "dependencies": { "ws": "^8.0.0" }
   }
   ```

5. In the Railway dashboard for your project, go to **Settings → Networking** and click **Generate Domain**. You will get a URL like `scrappy-production.up.railway.app`.

6. The server listens on `process.env.PORT` (Railway sets this automatically).  
   Make sure `server/server.js` uses `process.env.PORT || 3001` for its port, e.g.:
   ```js
   const PORT = process.env.PORT || 3001;
   server.listen(PORT, () => console.log('Listening on', PORT));
   ```

7. **Share the WSS address** with friends: `wss://scrappy-production.up.railway.app`  
   They paste this into the PvP server field in the game.

---

## Option 2 – Render

Render has a permanent-free Web Service tier (may spin down after 15 min of inactivity).

1. Create a free account at https://render.com.
2. Click **New → Web Service** and connect your GitHub repo.
3. Set:
   - **Runtime**: Node
   - **Build Command**: `npm install` (from the repo root, using the root `package.json` above)
   - **Start Command**: `node server/server.js`
4. Click **Create Web Service**. Render provides a URL like `https://scrappy.onrender.com`.
5. WebSocket connections use `wss://scrappy.onrender.com`.

> **Note**: Free Render services sleep after 15 minutes of no HTTP traffic.  
> Navigate to the Render URL in a browser once before starting a match to wake it up.  
> Or upgrade to the $7/month plan for always-on hosting.

---

## Option 3 – Fly.io

Fly.io offers a free allowance (3 shared-CPU VMs, 256 MB RAM each) which is plenty.

1. Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Sign up / log in:
   ```
   fly auth signup
   ```
3. From the repo root, run:
   ```
   fly launch
   ```
   - Choose a region close to your players.
   - Say **No** to Postgres and Redis.
   - Accept the generated `fly.toml`.

4. Edit the generated `fly.toml` to point at the server directory:
   ```toml
   [build]
     [build.args]
   
   [[services]]
     internal_port = 3001
     protocol = "tcp"
   ```

5. Deploy:
   ```
   fly deploy
   ```

6. Your app URL is `https://YOUR_APP_NAME.fly.dev`. WebSocket address: `wss://YOUR_APP_NAME.fly.dev`.

---

## Telling the Game Your Server Address

Once you have a `wss://` URL, players enter it in the game's PvP lobby.  
To make it the default so you don't have to type it every time, open `js/network.js` and
find the line that sets the default server address, then replace it with your URL.

---

## Optional: Leaderboard with Firebase (free)

The leaderboard (`js/leaderboard.js`) can persist scores in the cloud using Firebase Realtime Database.

1. Go to https://console.firebase.google.com and create a free project.
2. Add a **Realtime Database** (start in test mode).
3. Copy your database URL (looks like `https://your-app-default-rtdb.firebaseio.com`).
4. Open `js/leaderboard.js` and replace the placeholder `FIREBASE_URL` constant with your URL.
5. In the Firebase console, set your database rules to allow read/write (for open servers),  
   or add authentication rules if you want to restrict access.

---

## Quick Security Notes

- The free tiers above do not provide DDoS protection; they are fine for friends-only play.
- Do not store passwords or personal data in the game server.
- If you want to password-protect matches, add a simple shared token check inside `server/server.js`.
