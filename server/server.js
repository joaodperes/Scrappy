// server.js – BotArena FFA WebSocket server
// Supports pre-game lobby: players join and wait until the host sends hostStartGame.
const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss  = new WebSocketServer({ port });

const rooms = new Map();
// rooms: Map<roomId, { players: Map<id, player>, config, started, hostId }>
let _nextId = 1;
const GUN_POOL=['SMG','SHOTGUN','CHAINGUN','DMR','COMET','RAILGUN','TESLA','CROSSBOW','ELECTRON','ION'];
// Room directory configuration is validated server-side: clients may be
// modified and their dropdown restrictions cannot be trusted. Historical
// non-directory PvP connections retain their existing compatibility path.
const VALID_MAPS=new Set(['scrapyard','jungle','city','terminal']);
const VALID_MODES=new Set(['survival','ffa','tdm','gunGame']);
function validateHostedRoomConfig(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    return {ok:false,error:'Missing room configuration'};
  if(!VALID_MODES.has(input.mode))return {ok:false,error:'Unsupported game mode'};
  const mapId=input.mapId===undefined?'scrapyard':input.mapId;
  if(!VALID_MAPS.has(mapId))return {ok:false,error:'Unsupported map'};
  if(!Number.isInteger(input.maxPlayers)||input.maxPlayers<2||input.maxPlayers>14)
    return {ok:false,error:'Invalid room capacity'};
  if(input.mode==='survival'&&input.maxPlayers!==2)
    return {ok:false,error:'Survival rooms require two slots'};
  if(input.mode==='tdm'&&input.maxPlayers%2!==0)
    return {ok:false,error:'TDM requires even room capacity'};
  const duration=input.roundDuration===undefined?600:input.roundDuration;
  const score=input.scoreLimit===undefined?30:input.scoreLimit;
  if(!Number.isInteger(duration)||duration<0||duration>1800)
    return {ok:false,error:'Invalid round duration'};
  if(!Number.isInteger(score)||score<0||score>500)
    return {ok:false,error:'Invalid score limit'};
  if(input.mode!=='survival' && duration===0&&score===0)
    return {ok:false,error:'Choose a time limit or a kill limit'};
  if(input.name!==undefined&&typeof input.name!=='string')
    return {ok:false,error:'Invalid room name'};
  const name=(input.name||'Room').trim().slice(0,48)||'Room';
  return {ok:true,config:{
    directoryRoom:true,mode:input.mode,mapId,
    maxPlayers:input.maxPlayers,roundDuration:duration,scoreLimit:score,
    fillBots:input.mode!=='survival'&&input.fillBots===true,
    name,difficulty:input.mode==='survival'&&['normal','hard','nightmare'].includes(input.difficulty)?input.difficulty:'normal',
    hardMode:input.mode==='survival'&&input.hardMode===true,
    respawnDelay:5,
  }};
}

// One seed per match, shared with every client. A replay can reproduce
// the exact weapon ladder independently of arrival order or RNG timing.
function randomizedGunOrder(seed){
  let state=(seed>>>0)||0x9e3779b9;
  const nextRandom=()=>{
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state>>>0)/4294967296;
  };
  const others=GUN_POOL.slice();
  for(let i=others.length-1;i>0;i--){
    const j=Math.floor(nextRandom()*(i+1));
    [others[i],others[j]]=[others[j],others[i]];
  }
  return ['PISTOL',...others,'KNIFE'];
}

function scoreByTeam(room){
  const teams={RED:0,BLUE:0};
  for(const p of room.players.values())if(p.team)teams[p.team]+=p.score;
  return teams;
}
function finishMatch(room){
  if(!room.started)return;
  room.started=false;
  if(room.roundTimer)clearTimeout(room.roundTimer);
  const scores=[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,team:p.team}));
  scores.sort((a,b)=>b.score-a.score);
  const teams=scoreByTeam(room);
  const winner=room.config?.mode==='tdm'
    ? (teams.RED===teams.BLUE?'DRAW':teams.RED>teams.BLUE?'RED':'BLUE')
    : (scores.length>1 && scores[0].score===scores[1].score?'DRAW':scores[0]?.name||'DRAW');
  _broadcastAll(room,{type:'roundEnd',winner,scores,teams});
}

wss.on('connection', ws => {
  const id = String(_nextId++);
  let roomId = null, name = 'ANON';

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'listRooms') {
      const list = [];
      for (const [rid, r] of rooms) {
        if (r.started || r.preparing || !r.config?.directoryRoom) continue;
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
      name = String(msg.name || 'ANON').trim().slice(0,20)||'ANON';
      const requestedId = String(msg.room || 'default').trim().slice(0,20);
      if(!/^[a-zA-Z0-9_-]{2,20}$/.test(requestedId)){
        ws.send(JSON.stringify({type:'roomError',message:'Invalid room code'}));
        return;
      }

      if (!rooms.has(requestedId) && msg.requireExisting) {
        ws.send(JSON.stringify({type:'roomError',message:'Room no longer exists'}));
        return;
      }
      if (!rooms.has(requestedId)) {
        const candidate=msg.config||{};
        let safeConfig=msg.config??null;
        if(candidate.directoryRoom){
          const checked=validateHostedRoomConfig(candidate);
          if(!checked.ok){
            ws.send(JSON.stringify({type:'roomError',message:checked.error}));
            return;
          }
          safeConfig=checked.config;
        }
        rooms.set(requestedId, {
          players: new Map(),
          config:  safeConfig,
          started: false,
          hostId:  null,
          password: typeof msg.password === 'string' ? msg.password.slice(0,100) : '',
          gunOrder:null, gunSeed:null, preparing:false,
        });
      }
      const room = rooms.get(requestedId);

      // Never allow a new joiner to usurp an existing host.
      if (room.config?.directoryRoom) {
        const capacity = room.config.maxPlayers;
        if (room.started || room.preparing || room.players.size >= capacity) {
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

      // For TDM, put each arriving human on the smaller team.
      const tally={RED:0,BLUE:0};
      for(const p of room.players.values())if(p.team)tally[p.team]++;
      const team=roomCfg.mode==='tdm'?(tally.RED<=tally.BLUE?'RED':'BLUE'):null;
      // Send welcome with list of existing players + room details
      const existingPlayers = [...room.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score, team:p.team,
      }));
      ws.send(JSON.stringify({
        type:    'welcome',
        id,
        roomId,                // ← clients use this to display the room code in the lobby
        players: existingPlayers,
        config:  roomCfg,
        isHost:  room.hostId === id,
        started: room.started,
        team,gunOrder:room.gunOrder,gunSeed:room.gunSeed,
      }));

      // Add this player to the room
      room.players.set(id, {
        id, ws, name,
        x: 0, y: 1.72, z: 0, yaw: 0,
        hp: 100, score: 0, team, weaponIndex:0, deadUntil: 0, lastHitAt: 0,
        config: roomCfg,
      });

      // Notify existing players
      _broadcast(room, id, { type: 'playerJoined', id, name, team });
      _broadcastAll(room, {type:'roomUpdated',players:[...room.players.values()].map(p=>({id:p.id,name:p.name,team:p.team}))});

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
      room.countdownVersion=(room.countdownVersion||0)+1;
      const countdownVersion=room.countdownVersion;
      room.gunSeed=room.config?.mode==='gunGame'?Math.floor(Math.random()*4294967296)>>>0:null;
      room.gunOrder=room.gunSeed===null?null:randomizedGunOrder(room.gunSeed);
      _broadcastAll(room,{type:'roundCountdown',startsAt:Date.now()+5000,
        gunOrder:room.gunOrder,gunSeed:room.gunSeed});
      room.countdownTimer=setTimeout(()=>{
        // A disconnected player might have canceled this countdown while
        // the callback was already in the event queue.
        if(!room.preparing||room.countdownVersion!==countdownVersion)return;
        room.preparing=false;room.countdownTimer=null;
        if (room.config?.directoryRoom && room.players.size<2){
          _broadcastAll(room,{type:'roundCancelled',reason:'Not enough connected players'});
          return;
        }
        room.started=true;
        for(const p of room.players.values()){
          p.score=0;p.hp=100;p.deadUntil=0;p.lastHitAt=0;p.weaponIndex=0;
        }
        // 0 = unlimited clock: the score limit alone ends the round.
        // Preserve old custom durations for already-created rooms.
        const configured=room.config?.roundDuration;
        const parsed=configured===undefined?600:Number(configured);
        const duration=Number.isFinite(parsed)?Math.max(0,Math.min(1800,parsed)):600;
        _broadcastAll(room,{type:'roundStart',duration,mode:room.config?.mode,
          gunOrder:room.gunOrder,gunSeed:room.gunSeed});
        room.roundTimer=duration>0?setTimeout(()=>finishMatch(room),duration*1000):null;
      },5000);
    }

    // ── POSITION UPDATE ───────────────────────────────────────
    else if (msg.type === 'move') {
      const room = rooms.get(roomId); if (!room) return;
      const p = room.players.get(id); if (!p) return;
      if(!room.started||p.deadUntil>Date.now())return;
      if(!['x','y','z','yaw'].every(k=>Number.isFinite(msg[k])))return;
      p.x=Math.max(-250,Math.min(250,msg.x));
      p.y=Math.max(-100,Math.min(200,msg.y));
      p.z=Math.max(-250,Math.min(250,msg.z));p.yaw=msg.yaw;
    }

    // ── SERVER-ENFORCED DAMAGE / SCORING ──────────────────────
    else if(msg.type==='hit'){
      const room=rooms.get(roomId);if(!room?.started)return;
      const shooter=room.players.get(id),victim=room.players.get(String(msg.targetId));
      if(!shooter||!victim||shooter===victim)return;
      if(victim.deadUntil>Date.now()||shooter.deadUntil>Date.now())return;
      if(room.config?.mode==='tdm' && shooter.team===victim.team)return;
      if(room.config?.mode==='gunGame'){
        const expected=room.gunOrder?.[shooter.weaponIndex||0];
        if(!expected || msg.weapon!==expected)return;
      }
      const dmg=Number(msg.dmg),time=Date.now();
      if(!Number.isFinite(dmg)||dmg<=0||dmg>160)return;
      if(time-shooter.lastHitAt<35)return;
      if(Math.hypot(shooter.x-victim.x,shooter.y-victim.y,shooter.z-victim.z)>140)return;
      shooter.lastHitAt=time;
      const beforeHp=victim.hp;
      victim.hp=Math.max(0,victim.hp-dmg);
      const applied=Math.max(0,beforeHp-victim.hp);
      victim.ws.send(JSON.stringify({type:'hit',targetId:victim.id,dmg:applied}));
      shooter.ws.send(JSON.stringify({type:'damageConfirmed',targetId:victim.id,damage:applied,weapon:String(msg.weapon||'PISTOL').slice(0,28)}));
      if(victim.hp>0)return;
      const finalKnife=room.config?.mode==='gunGame' &&
        shooter.weaponIndex===room.gunOrder.length-1 && msg.weapon==='KNIFE';
      shooter.score++;
      if(room.config?.mode==='gunGame' && !finalKnife) {
        shooter.weaponIndex=Math.min(room.gunOrder.length-1,shooter.weaponIndex+1);
        _broadcastAll(room,{type:'weaponProgress',playerId:id,
          weaponIndex:shooter.weaponIndex,weapon:room.gunOrder[shooter.weaponIndex]});
      }
      const delay=Math.max(1000,Math.min(15000,(Number(room.config?.respawnDelay)||5)*1000));
      victim.deadUntil=time+delay;
      _broadcastAll(room,{type:'killed',victimId:victim.id,killerId:id,
        killerName:shooter.name,killerScore:shooter.score,team:shooter.team,weapon:String(msg.weapon||'PISTOL').slice(0,28),teams:scoreByTeam(room)});
      const limit=Math.max(0,Math.min(500,Number(room.config?.scoreLimit)||0));
      if(finalKnife || (limit>0 && (room.config?.mode==='tdm'
        ? Math.max(...Object.values(scoreByTeam(room)))>=limit
        : shooter.score>=limit))){finishMatch(room);return;}
      setTimeout(()=>{
        if(!room.started||!room.players.has(victim.id))return;
        victim.hp=100;victim.deadUntil=0;
        const sp=_randSpawn(room);
        _broadcastAll(room,{type:'respawn',playerId:victim.id,x:sp[0],y:sp[1],z:sp[2]});
      },delay);
    }

    else if (msg.type === 'ready') { /* acknowledged */ }
  });

  ws.on('close', () => {
    // Keep one close handler for presence, timers and room lifecycle.
    // This also makes the mocked WebSocket listener model faithfully test
    // the entire path instead of accidentally overwriting the first handler.
    clearInterval(stateTick);
    const room = rooms.get(roomId); if (!room) return;
    room.players.delete(id);
    _broadcast(room, id, { type: 'playerLeft', id });
    _broadcastAll(room, {type:'roomUpdated',players:[...room.players.values()].map(p=>({id:p.id,name:p.name,team:p.team}))});

    // If host left, reassign to first remaining player
    if (room.hostId === id && room.players.size > 0) {
      room.hostId = [...room.players.keys()][0];
      const newHost = room.players.get(room.hostId);
      if (newHost) {
        newHost.ws.send(JSON.stringify({ type: 'hostAssigned', id: room.hostId }));
      }
    }

    if(room.preparing && room.players.size<2){
      clearTimeout(room.countdownTimer);
      room.countdownTimer=null;room.preparing=false;
      room.countdownVersion=(room.countdownVersion||0)+1;
      room.gunOrder=null;room.gunSeed=null;
      _broadcastAll(room,{type:'roundCancelled',reason:'Not enough connected players'});
    }
    if (room.players.size === 0){
      clearTimeout(room.countdownTimer);
      clearTimeout(room.roundTimer);
      rooms.delete(roomId);
    }
  });

  // Push state 20×/sec
  const stateTick = setInterval(() => {
    const room = rooms.get(roomId); if (!room) return;
    const players = [...room.players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score, team:p.team,
    }));
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', players }));
  }, 50);


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

// Map-specific fallback spawn sets. Match clients also validate level geometry.
const SPAWNS_BY_MAP={
  scrapyard:[[-24,0,24],[24,0,24],[-24,0,-24],[24,0,-24],[0,0,30],[0,0,-30]],
  jungle:[[-50,0,0],[50,0,0],[-45,0,45],[45,0,-45],[0,0,52],[0,0,-52]],
  city:[[-18,0,-10],[18,0,10],[-50,0,-10],[50,0,10],[-70,0,0],[70,0,0]],
  terminal:[[-20,0,-20],[20,0,20],[-35,0,0],[35,0,0],[0,0,-30],[0,0,30]],
};
function _randSpawn(room){
  const options=SPAWNS_BY_MAP[room.config?.mapId]||SPAWNS_BY_MAP.scrapyard;
  return options[Math.floor(Math.random()*options.length)];
}

console.log(`BotArena WS server running on port ${port}`);
