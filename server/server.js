// server.js – BotArena FFA WebSocket server
// Supports pre-game lobby: players join and wait until the host sends hostStartGame.
const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss  = new WebSocketServer({ port });

const rooms = new Map();
// rooms: Map<roomId, { players: Map<id, player>, config, started, hostId }>
let _nextId = 1;

wss.on('connection', ws => {
  const id = String(_nextId++);
  let roomId = null, name = 'ANON';

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'listRooms') {
      const list = [];
      for (const [rid, r] of rooms) {
        if (r.started || !r.config?.directoryRoom) continue;
        const cap = Math.max(2, Math.min(24, Number(r.config.maxPlayers)||2));
        if (r.players.size >= cap) continue;
        list.push({id:rid,name:r.config.name||rid,mapId:r.config.mapId||'scrapyard',
          mode:r.config.mode||'survival',humans:r.players.size,maxPlayers:cap,
          hasPassword:!!r.password});
      }
      ws.send(JSON.stringify({type:'roomList',rooms:list}));
      return;
    }

    // ── JOIN ──────────────────────────────────────────────────
    if (msg.type === 'join') {
      if (roomId !== null) {
        ws.send(JSON.stringify({type:'roomError',message:'Already in a room'}));
        return;
      }
      name = String(msg.name || 'ANON').slice(0,20);
      const requestedId = String(msg.room || 'default').slice(0,20);

      if (!rooms.has(requestedId) && msg.requireExisting) {
        ws.send(JSON.stringify({type:'roomError',message:'Room no longer exists'}));
        return;
      }
      if (!rooms.has(requestedId)) {
        rooms.set(requestedId, {
          players: new Map(),
          config:  msg.config ?? null,
          started: false,
          hostId:  null,
          password: typeof msg.password === 'string' ? msg.password.slice(0,100) : '',
        });
      }
      const room = rooms.get(requestedId);

      // Never allow a new joiner to usurp an existing host.
      if (room.config?.directoryRoom) {
        const capacity = Math.max(2, Math.min(24, Number(room.config.maxPlayers) || 2));
        if (room.started || room.players.size >= capacity) {
          ws.send(JSON.stringify({type:'roomError',message:'Room is full or already started'}));
          return;
        }
        if (room.password && room.password !== String(msg.password||'')) {
          ws.send(JSON.stringify({type:'roomError',message:'Incorrect room password'}));
          return;
        }
      }

      roomId = requestedId;
      if (!room.hostId) room.hostId = id;
      // Use existing config if room already had one set by host
      const roomCfg = room.config ?? msg.config ?? {};

      // Send welcome with list of existing players + room details
      const existingPlayers = [...room.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score,
      }));
      ws.send(JSON.stringify({
        type:    'welcome',
        id,
        roomId,                // ← clients use this to display the room code in the lobby
        players: existingPlayers,
        config:  roomCfg,
        isHost:  room.hostId === id,
        started: room.started,
      }));

      // Add this player to the room
      room.players.set(id, {
        id, ws, name,
        x: 0, y: 1.72, z: 0, yaw: 0,
        hp: 100, score: 0,
        config: roomCfg,
      });

      // Notify existing players
      _broadcast(room, id, { type: 'playerJoined', id, name });
      _broadcastAll(room, {type:'roomUpdated',players:[...room.players.values()].map(p=>({id:p.id,name:p.name}))});

      // If game already started (late joiner), send roundStart immediately
      if (room.started) {
        ws.send(JSON.stringify({
          type:     'roundStart',
          duration: roomCfg?.roundDuration ?? 600,
        }));
      }
    }

    // All participants receive one server-clock countdown.
    else if (msg.type === 'hostStartGame') {
      const room=rooms.get(roomId);
      if (!room || room.hostId !== id || room.started || room.preparing) return;
      if (room.config?.directoryRoom && room.players.size < 2) {
        ws.send(JSON.stringify({type:'roomError',message:'Two players are required'}));
        return;
      }
      room.preparing=true;
      _broadcastAll(room,{type:'roundCountdown',startsAt:Date.now()+5000});
      room.countdownTimer=setTimeout(()=>{
        room.preparing=false;
        if (room.config?.directoryRoom && room.players.size<2) return;
        room.started=true;
        const duration=Math.max(60,Math.min(1800,Number(room.config?.roundDuration)||600));
        _broadcastAll(room,{type:'roundStart',duration});
        room.roundTimer=setTimeout(()=>{
          if(!room.started)return;
          room.started=false;
          const scores=[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score}));
          scores.sort((a,b)=>b.score-a.score);
          _broadcastAll(room,{type:'roundEnd',winner:scores[0]?.name||'DRAW',scores});
        },duration*1000);
      },5000);
    }

    // ── POSITION UPDATE ───────────────────────────────────────
    else if (msg.type === 'move') {
      const room = rooms.get(roomId); if (!room) return;
      const p = room.players.get(id); if (!p) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
    }

    // ── HIT REGISTRATION ─────────────────────────────────────
    else if (msg.type === 'hit') {
      const room = rooms.get(roomId); if (!room) return;
      if (!room.started) return;   // no damage before game starts
      const target = room.players.get(msg.targetId); if (!target) return;
      target.hp = Math.max(0, (target.hp || 100) - (msg.dmg || 0));
      target.ws.send(JSON.stringify({ type: 'hit', targetId: msg.targetId, dmg: msg.dmg }));

      if (target.hp <= 0) {
        const killer = room.players.get(id);
        if (killer) killer.score++;
        target.hp = 100;
        const sp = _randSpawn();
        _broadcastAll(room, {
          type:        'killed',
          victimId:    msg.targetId,
          killerId:    id,
          killerName:  room.players.get(id)?.name,
          killerScore: killer?.score ?? 0,
        });

        // Check score limit
        const scoreLimit = room.config?.scoreLimit ?? 0;
        if (scoreLimit > 0 && (killer?.score ?? 0) >= scoreLimit) {
          room.started = false;
          _broadcastAll(room, {
            type:   'roundEnd',
            winner: room.players.get(id)?.name ?? 'Unknown',
            scores: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
          });
        }

        // Respawn victim
        const respawnDelay = (room.config?.respawnDelay ?? 5) * 1000;
        setTimeout(() => {
          if (!room.players.has(msg.targetId)) return;
          target.ws.send(JSON.stringify({
            type: 'respawn', playerId: msg.targetId, x: sp[0], z: sp[2],
          }));
          _broadcastAll(room, {
            type: 'respawn', playerId: msg.targetId, x: sp[0], z: sp[2],
          });
        }, respawnDelay);
      }
    }

    else if (msg.type === 'ready') { /* acknowledged */ }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId); if (!room) return;
    room.players.delete(id);
    _broadcast(room, id, { type: 'playerLeft', id });
    _broadcastAll(room, {type:'roomUpdated',players:[...room.players.values()].map(p=>({id:p.id,name:p.name}))});

    // If host left, reassign to first remaining player
    if (room.hostId === id && room.players.size > 0) {
      room.hostId = [...room.players.keys()][0];
      const newHost = room.players.get(room.hostId);
      if (newHost) {
        newHost.ws.send(JSON.stringify({ type: 'hostAssigned', id: room.hostId }));
      }
    }

    if (room.players.size === 0) rooms.delete(roomId);
  });

  // Push state 20×/sec
  const stateTick = setInterval(() => {
    const room = rooms.get(roomId); if (!room) return;
    const players = [...room.players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score,
    }));
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', players }));
  }, 50);

  ws.on('close', () => clearInterval(stateTick));
});

function _broadcast(room, excludeId, msg) {
  const json = JSON.stringify(msg);
  for (const [pid, p] of room.players)
    if (pid !== excludeId && p.ws.readyState === 1) p.ws.send(json);
}

function _broadcastAll(room, msg) {
  const json = JSON.stringify(msg);
  for (const p of room.players.values())
    if (p.ws.readyState === 1) p.ws.send(json);
}

const SPAWNS = [
  [-20,0,20],[20,0,20],[-20,0,-20],[20,0,-20],
  [0,0,28],[0,0,-28],[-28,0,0],[28,0,0],
];
function _randSpawn() { return SPAWNS[Math.floor(Math.random() * SPAWNS.length)]; }

console.log(`BotArena WS server running on port ${port}`);
