// server.js – Scrappy PvP WebSocket server
// Team Deathmatch: two teams (RED/BLUE), 10-minute rounds, respawn after 5s.
//
// Run:  node server.js [port]   (default port 8080)
// Hosting: Railway / Render / Fly.io free tier all work; just set the PORT env var.

'use strict';
const { WebSocketServer, WebSocket } = require('ws');

const PORT          = parseInt(process.env.PORT || process.argv[2] || '8080', 10);
const ROUND_SECS    = 600;   // 10 minutes
const RESPAWN_DELAY = 5;     // seconds
const STATE_HZ      = 20;    // broadcast state at 20 Hz
const MAX_ROOM_SIZE = 8;

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] Scrappy PvP listening on ws://0.0.0.0:${PORT}`);

// ── Rooms ─────────────────────────────────────────────────────
/** @type {Map<string, Room>} */
const rooms = new Map();

class Room {
  constructor(id) {
    this.id       = id;
    /** @type {Map<string, Player>} */
    this.players  = new Map();
    this.redScore = 0;
    this.blueScore= 0;
    this.timeLeft = ROUND_SECS;
    this.active   = false;  // round running
    this.started  = false;
    this._stateInterval = null;
    this._roundInterval = null;
  }

  redCount()  { return [...this.players.values()].filter(p=>p.team==='RED').length; }
  blueCount() { return [...this.players.values()].filter(p=>p.team==='BLUE').length; }

  assignTeam() { return this.redCount() <= this.blueCount() ? 'RED' : 'BLUE'; }

  addPlayer(player) {
    this.players.set(player.id, player);
    this._tryStart();
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) this._stop();
  }

  _tryStart() {
    if (this.started) return;
    if (this.redCount() > 0 && this.blueCount() > 0) {
      this.started = true;
      this.active  = true;
      this.timeLeft = ROUND_SECS;
      this.broadcast({ type:'roundStart', duration: ROUND_SECS });
      console.log(`[room ${this.id}] Round started – ${this.players.size} players`);

      this._stateInterval = setInterval(() => this._broadcastState(), 1000/STATE_HZ);
      this._roundInterval = setInterval(() => this._tick(), 1000);
    }
  }

  _tick() {
    if (!this.active) return;
    this.timeLeft = Math.max(0, this.timeLeft - 1);
    // Broadcast scores every second
    this.broadcast({ type:'scores', redScore:this.redScore, blueScore:this.blueScore, timeLeft:this.timeLeft });
    if (this.timeLeft <= 0) this._endRound();
  }

  _endRound() {
    this.active = false;
    let winner;
    if (this.redScore > this.blueScore)       winner = 'RED';
    else if (this.blueScore > this.redScore)  winner = 'BLUE';
    else                                       winner = 'TIE';
    this.broadcast({ type:'roundEnd', redScore:this.redScore, blueScore:this.blueScore, winner });
    console.log(`[room ${this.id}] Round ended – ${winner} (R${this.redScore} B${this.blueScore})`);
    this._stop();
  }

  _stop() {
    clearInterval(this._stateInterval);
    clearInterval(this._roundInterval);
    this._stateInterval = null;
    this._roundInterval = null;
    this.started = false;
  }

  _broadcastState() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({ id:p.id, name:p.name, x:p.x, y:p.y, z:p.z, yaw:p.yaw, hp:p.hp, team:p.team });
    }
    this.broadcast({ type:'state', players });
  }

  broadcast(msg, excludeId = null) {
    const str = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id === excludeId) continue;
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(str);
    }
  }

  send(id, msg) {
    const p = this.players.get(id);
    if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
  }
}

// ── Player state ─────────────────────────────────────────────
let _nextId = 1;
class Player {
  constructor(ws, name, room) {
    this.ws   = ws;
    this.name = name;
    this.room = room;
    this.id   = String(_nextId++);
    this.team = room.assignTeam();
    this.hp   = 100;
    this.alive= true;
    // Position – updated on 'move' messages
    this.x = 0; this.y = 1.72; this.z = 0; this.yaw = 0;
    // Spawn positions per team – Smelting District map
    const RED_SPAWNS  = [[-18, 0, -24], [-24, 0, -16], [-14, 0, -10]]; // Loading bay
    const BLUE_SPAWNS = [[ 16, 0,  18], [ 22, 0,  12], [ 20, 0,  20]]; // Smelter hall
    const opts = this.team === 'RED' ? RED_SPAWNS : BLUE_SPAWNS;
    const [sx,,sz] = opts[Math.floor(Math.random()*opts.length)];
    this.x = sx; this.z = sz;
  }
}

// ── Connection handler ────────────────────────────────────────
wss.on('connection', ws => {
  let player   = null;
  let roomRef  = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      // Get or create room
      const roomId = (msg.room || 'default').slice(0, 32);
      if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId));
      roomRef = rooms.get(roomId);
      if (roomRef.players.size >= MAX_ROOM_SIZE) {
        ws.send(JSON.stringify({ type:'error', msg:'Room full' })); ws.close(); return;
      }

      player = new Player(ws, (msg.name || 'ANON').slice(0, 20), roomRef);

      // Tell the joining player who they are and who's already here
      const existingPlayers = [...roomRef.players.values()].map(p => ({
        id:p.id, name:p.name, team:p.team, x:p.x, y:p.y, z:p.z, yaw:p.yaw, hp:p.hp,
      }));
      ws.send(JSON.stringify({
        type: 'welcome', id: player.id, team: player.team,
        players: existingPlayers,
      }));

      // Tell others someone joined
      roomRef.broadcast({ type:'playerJoined', id:player.id, name:player.name, team:player.team }, player.id);
      roomRef.addPlayer(player);
      console.log(`[room ${roomId}] ${player.name} (${player.team}) joined — ${roomRef.players.size} players`);
      return;
    }

    if (!player) return; // not yet joined

    switch (msg.type) {
      case 'move':
        player.x   = +msg.x   || 0;
        player.y   = +msg.y   || 1.72;
        player.z   = +msg.z   || 0;
        player.yaw = +msg.yaw || 0;
        break;

      case 'hit': {
        // Client says it hit a target
        const target = roomRef.players.get(msg.targetId);
        if (!target || !target.alive) break;
        // Sanity-check teams (no friendly fire)
        if (target.team === player.team) break;
        const dmg = Math.min(Math.max(+msg.dmg || 0, 0), 120); // cap damage
        target.hp = Math.max(0, target.hp - dmg);
        // Relay hit to target
        roomRef.send(target.id, { type:'hit', targetId:target.id, dmg, killerId:player.id });
        if (target.hp <= 0 && target.alive) {
          target.alive = false;
          // Update team score
          if (player.team === 'RED') roomRef.redScore++;
          else                       roomRef.blueScore++;
          roomRef.broadcast({ type:'died', playerId:target.id, killerId:player.id });
          roomRef.broadcast({ type:'scores', redScore:roomRef.redScore, blueScore:roomRef.blueScore, timeLeft:roomRef.timeLeft });
          console.log(`[room ${roomRef.id}] ${player.name} killed ${target.name} — R${roomRef.redScore} B${roomRef.blueScore}`);
          // Schedule respawn
          setTimeout(() => {
            if (!roomRef.players.has(target.id)) return;
            target.hp = 100; target.alive = true;
            const opts = target.team === 'RED'
              ? [[-24,0,-24],[-20,0,-28],[-28,0,-20]]
              : [[ 24,0, 24],[ 20,0, 28],[ 28,0, 20]];
            const [rx,,rz] = opts[Math.floor(Math.random()*opts.length)];
            target.x = rx; target.z = rz;
            roomRef.broadcast({ type:'respawn', playerId:target.id, x:rx, y:1.72, z:rz });
          }, RESPAWN_DELAY * 1000);
        }
        break;
      }

      case 'shoot':
        // Relay cosmetic shoot event to other players
        roomRef.broadcast({ type:'shoot', shooterId:player.id,
          ox:msg.ox, oy:msg.oy, oz:msg.oz, dx:msg.dx, dy:msg.dy, dz:msg.dz, weapon:msg.weapon,
        }, player.id);
        break;

      case 'ready':
        // Counted by room._tryStart – no extra action needed
        break;
    }
  });

  ws.on('close', () => {
    if (player && roomRef) {
      roomRef.broadcast({ type:'playerLeft', id:player.id }, player.id);
      roomRef.removePlayer(player.id);
      console.log(`[room ${roomRef.id}] ${player.name} left — ${roomRef.players.size} remaining`);
      if (roomRef.players.size === 0) rooms.delete(roomRef.id);
    }
  });

  ws.on('error', err => console.error('[ws]', err.message));
});
