// pvp.js – Free-For-All multiplayer: host/join lobby, pre-game waiting room, bots, modifiers
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { remotePlayers, player, roomConfig, setRoomConfig, DEFAULT_ROOM_CONFIG } from './gameState.js';
import { connect, disconnect, send, on, off, sendMoveThrottled, sendHit, sendReady, getMyId } from './network.js';
import { sfx } from './audio.js';
import { updateFfaHUD, showRoomConfigBanner, hideFfaHUD } from './ui.js';
import { hurtPlayer } from './player.js';
import { spawnBot, updateEnemies } from './enemies.js';
import { enemies } from './gameState.js';

// ── FFA state ─────────────────────────────────────────────────
let ffaActive     = false;
let roundActive   = false;
let timeLeft      = 600;
let respawnTimer  = 0;
let localDead     = false;
let myName        = 'ANON';
let myScore       = 0;

// Pre-game lobby state
let _inPreLobby   = false;
let _isHost       = false;
let _prelobbyOnStart = null;   // callback when host clicks "START GAME"

// Scoreboard: id → { name, score }
const _scores     = new Map();

// Bot management
let _botSpawnTimer  = 0;
const BOT_SPAWN_INTERVAL = 12;
const BOT_TYPES = ['scout', 'heavy', 'drone', 'sniper', 'shotgun', 'pistol'];

// ── Spawn positions ───────────────────────────────────────────
const FFA_SPAWNS = [
  [-24, 0,  24], [ 24, 0,  24], [-24, 0, -24], [ 24, 0, -24],
  [  0, 0,  30], [  0, 0, -30], [-30, 0,   0], [ 30, 0,   0],
  [ 14, 0,  14], [-14, 0, -14], [ 14, 0, -14], [-14, 0,  14],
  [-34, 6,  34], [ 34, 6,  34], [-34, 6, -34], [ 34, 6, -34],
];

function _chooseFarSpawn() {
  const occupied = [camera.position];
  for (const rp of remotePlayers.values()) {
    if (rp.alive) occupied.push(rp.group.position);
  }
  let best = FFA_SPAWNS[0], bestDist = -1;
  for (const sp of FFA_SPAWNS) {
    const sv = new BABYLON.Vector3(sp[0], sp[1], sp[2]);
    const minD = Math.min(...occupied.map(p => BABYLON.Vector3.Distance(sv, p)));
    if (minD > bestDist) { bestDist = minD; best = sp; }
  }
  return best;
}

// ── Remote player mesh factory ─────────────────────────────────
function _hueToColor3(hue) {
  const h = hue / 60, x = 1 - Math.abs(h % 2 - 1);
  let r = 0, g = 0, b = 0;
  if      (h < 1) { r=1; g=x; }
  else if (h < 2) { r=x; g=1; }
  else if (h < 3) { g=1; b=x; }
  else if (h < 4) { g=x; b=1; }
  else if (h < 5) { r=x; b=1; }
  else            { r=1; b=x; }
  return new BABYLON.Color3(r, g, b);
}
function _playerHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function makeRemotePlayerMesh(id, name) {
  const col = _hueToColor3(_playerHue(id));
  const mat = new BABYLON.StandardMaterial('rpMat_' + id, scene);
  mat.diffuseColor  = col;
  mat.emissiveColor = col.scale(0.3);
  const g    = new BABYLON.TransformNode('rp_' + id, scene);
  const body = BABYLON.MeshBuilder.CreateBox('rpBody', { width: 0.7, height: 1.6, depth: 0.4 }, scene);
  body.material = mat; body.parent = g; body.position.y = 0.8;
  body.isPickable = true; body.metadata = { remotePlayer: true, id };
  const head = BABYLON.MeshBuilder.CreateBox('rpHead', { size: 0.45 }, scene);
  head.material = mat; head.parent = g; head.position.y = 1.7;
  head.isPickable = true; head.metadata = { remotePlayer: true, id };
  const tag = _makeNameTag(name, col);
  tag.parent = g; tag.position.y = 2.25;
  tag.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  return g;
}

function _makeNameTag(name, col3) {
  const W = 256, H = 64;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  if (ctx.roundRect) { ctx.roundRect(4, 4, 248, 56, 8); ctx.fill(); } else ctx.fillRect(4, 4, 248, 56);
  ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgb(${Math.round(col3.r*255)},${Math.round(col3.g*255)},${Math.round(col3.b*255)})`;
  ctx.fillText(name.slice(0, 14), 128, 32);
  const plane = BABYLON.MeshBuilder.CreatePlane('nameTag', { width: 1.4, height: 0.36 }, scene);
  const mat   = new BABYLON.StandardMaterial('ntMat_' + Date.now(), scene);
  const tex   = new BABYLON.DynamicTexture('ntTex_' + Date.now(), { width: W, height: H }, scene, false);
  tex.getContext().drawImage(cv, 0, 0); tex.update();
  mat.diffuseTexture = tex; mat.emissiveColor = BABYLON.Color3.White();
  mat.diffuseTexture.hasAlpha = true; mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true; mat.backFaceCulling = false;
  plane.material = mat; plane.isPickable = false;
  return plane;
}

export const _remoteMeshMap = new Map();

function _rebuildMeshMap() {
  _remoteMeshMap.clear();
  for (const [id, rp] of remotePlayers) {
    if (!rp.alive) continue;
    rp.group.getChildMeshes().forEach(m => { if (m.isPickable) _remoteMeshMap.set(m, { id, rp }); });
  }
}

function _applyConfig(cfg) {
  if (cfg.lowGravity) cfg.gravityMult = 0.35;
  player.maxHp    = Math.round(100 * (cfg.healthMult ?? 1));
  player.hp       = player.maxHp;
  player.maxArmor = Math.round(100 * (cfg.armorMult  ?? 1));
  player.armor    = 0;
  if (cfg.infiniteAmmo || cfg.instagib) player.buffs['infinite_ammo'] = 999999;
  if (cfg.instagib)                     player.buffs['quad_damage']   = 999999;
}

// ── Pre-game lobby overlay ────────────────────────────────────
// Shows room code + player list while waiting for the host to start
function _showPreLobbyOverlay(roomCode, isHost, onHostStart) {
  document.getElementById('_ffaPreLobby')?.remove();

  const FONT = '"Courier New",monospace';
  const overlay = document.createElement('div');
  overlay.id = '_ffaPreLobby';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:950',
    'background:rgba(4,6,2,0.96)',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px',
    `font-family:${FONT};color:#d8f030`,
    'pointer-events:all',
  ].join(';');

  // Title
  const title = document.createElement('div');
  title.style.cssText = `font-size:22px;letter-spacing:5px;font-weight:bold;text-shadow:0 0 14px #d8f030`;
  title.textContent = 'WAITING FOR PLAYERS';
  overlay.appendChild(title);

  // Room code box
  const codeBox = document.createElement('div');
  codeBox.style.cssText = `
    border:1px solid #2a5;padding:14px 28px;background:#071209;text-align:center;
    min-width:280px;
  `;
  codeBox.innerHTML = `
    <div style="font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:6px">ROOM CODE — SHARE WITH FRIENDS</div>
    <div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:#d8f030;text-shadow:0 0 16px #d8f030">${roomCode}</div>
    <div style="font-size:10px;color:#557733;margin-top:6px">Friends → FFA → JOIN → enter this code</div>
  `;
  overlay.appendChild(codeBox);

  // Player list
  const listWrap = document.createElement('div');
  listWrap.style.cssText = `min-width:280px;border:1px solid #222;background:#0a0a0a;padding:10px 16px`;
  const listTitle = document.createElement('div');
  listTitle.style.cssText = `font-size:10px;color:#557733;letter-spacing:2px;margin-bottom:8px`;
  listTitle.textContent = 'PLAYERS IN LOBBY';
  listWrap.appendChild(listTitle);
  const list = document.createElement('div');
  list.id = '_ffaPreLobbyList';
  listWrap.appendChild(list);
  overlay.appendChild(listWrap);

  // Status
  const status = document.createElement('div');
  status.id = '_ffaPreLobbyStatus';
  status.style.cssText = `font-size:12px;color:#557733;letter-spacing:1px`;
  status.textContent = isHost ? 'You are the host. Click START when ready.' : 'Waiting for host to start the game…';
  overlay.appendChild(status);

  // Start button (host only)
  if (isHost) {
    const startBtn = document.createElement('button');
    startBtn.id = '_ffaStartBtn';
    startBtn.style.cssText = [
      `font-family:${FONT};font-size:15px;font-weight:bold;letter-spacing:2px`,
      'background:#1a3a1a;border:2px solid #3a8;color:#d8f030',
      'padding:12px 32px;cursor:pointer',
    ].join(';');
    startBtn.textContent = '▶ START GAME';
    startBtn.onclick = () => {
      startBtn.disabled = true;
      startBtn.textContent = 'STARTING…';
      // Tell server to broadcast roundStart to all players in the room
      send({ type: 'hostStartGame' });
    };
    overlay.appendChild(startBtn);
  }

  document.body.appendChild(overlay);
  _updatePreLobbyList();
}

function _updatePreLobbyList() {
  const list = document.getElementById('_ffaPreLobbyList');
  if (!list) return;
  list.innerHTML = '';

  // Local player
  const meDiv = document.createElement('div');
  meDiv.style.cssText = 'font-size:13px;color:#d8f030;padding:3px 0;display:flex;align-items:center;gap:8px';
  meDiv.innerHTML = `<span style="color:#3a8">▶</span> ${_esc(myName)} <span style="font-size:10px;color:#557733">(YOU)</span>`;
  list.appendChild(meDiv);

  // Remote players
  for (const [, rp] of remotePlayers) {
    const div = document.createElement('div');
    div.style.cssText = 'font-size:13px;color:#aaa;padding:3px 0;display:flex;align-items:center;gap:8px';
    div.innerHTML = `<span style="color:#3a8">▶</span> ${_esc(rp.name)}`;
    list.appendChild(div);
  }

  const count = 1 + remotePlayers.size;
  const status = document.getElementById('_ffaPreLobbyStatus');
  if (status && !_isHost) {
    status.textContent = `${count} player${count !== 1 ? 's' : ''} in lobby. Waiting for host…`;
  }
}

function _hidePreLobbyOverlay() {
  document.getElementById('_ffaPreLobby')?.remove();
  _inPreLobby = false;
}

// ── Network event wiring ──────────────────────────────────────
function _wireEvents(onRoundEnd, onGameStart) {
  on('welcome', msg => {
    setRoomConfig(msg.config ?? {});
    _applyConfig(roomConfig);

    // Place player off to the side while in lobby — game hasn't started
    const sp = _chooseFarSpawn();
    camera.position.set(sp[0], 1.72, sp[2]);

    for (const pd of (msg.players ?? [])) {
      if (pd.id === msg.id) continue;
      const g = makeRemotePlayerMesh(pd.id, pd.name ?? '?');
      remotePlayers.set(pd.id, { group: g, hp: player.maxHp, name: pd.name ?? '?', alive: true, score: 0 });
      _scores.set(pd.id, { name: pd.name ?? '?', score: 0 });
    }
    _rebuildMeshMap();
    sendReady();

    // Show pre-game lobby (not straight into gameplay)
    _inPreLobby = true;
    _showPreLobbyOverlay(msg.roomId ?? '??????', _isHost, null);
    showRoomConfigBanner(roomConfig);
  });

  on('playerJoined', msg => {
    if (msg.id === getMyId()) return;
    const g = makeRemotePlayerMesh(msg.id, msg.name ?? '?');
    remotePlayers.set(msg.id, { group: g, hp: player.maxHp, name: msg.name ?? '?', alive: true, score: 0 });
    _scores.set(msg.id, { name: msg.name ?? '?', score: 0 });
    _rebuildMeshMap();
    _updatePreLobbyList();
    if (_inPreLobby) updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
  });

  on('playerLeft', msg => {
    const rp = remotePlayers.get(msg.id);
    if (rp) { rp.group.getChildMeshes().forEach(m => m.dispose()); rp.group.dispose(); remotePlayers.delete(msg.id); }
    _scores.delete(msg.id);
    _rebuildMeshMap();
    _updatePreLobbyList();
    if (!_inPreLobby) updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
  });

  on('state', msg => {
    for (const pd of (msg.players ?? [])) {
      if (pd.id === getMyId()) { myScore = pd.score ?? myScore; continue; }
      let rp = remotePlayers.get(pd.id);
      if (!rp) {
        const g = makeRemotePlayerMesh(pd.id, pd.name ?? '?');
        rp = { group: g, hp: player.maxHp, name: pd.name ?? '?', alive: true, score: 0 };
        remotePlayers.set(pd.id, rp); _rebuildMeshMap();
      }
      rp.group.position.set(pd.x, pd.y, pd.z);
      rp.group.rotation.y = pd.yaw ?? 0;
      rp.hp    = pd.hp ?? rp.hp;
      rp.alive = (pd.hp ?? 1) > 0;
      rp.score = pd.score ?? rp.score;
      rp.group.getChildMeshes().forEach(m => { if (m.name !== 'nameTag') m.setEnabled(rp.alive); });
      const sc = _scores.get(pd.id) ?? { name: rp.name, score: 0 };
      sc.score = rp.score; _scores.set(pd.id, sc);
    }
    if (!_inPreLobby) updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
  });

  on('hit', msg => {
    if (msg.targetId === getMyId()) hurtPlayer(msg.dmg * (roomConfig.damageMult ?? 1));
  });

  on('killed', msg => {
    if (msg.victimId === getMyId()) {
      localDead = true;
      respawnTimer = roomConfig.respawnDelay ?? 5;
      _showRespawnOverlay(respawnTimer);
      document.exitPointerLock();
    } else {
      const rp = remotePlayers.get(msg.victimId);
      if (rp) { rp.alive = false; rp.group.getChildMeshes().forEach(m => m.setEnabled(false)); }
    }
    if (msg.killerId) {
      const sc = _scores.get(msg.killerId);
      if (sc) sc.score++;
      if (msg.killerId === getMyId()) myScore++;
      updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
      if (roomConfig.scoreLimit > 0 && (msg.killerScore ?? 0) >= roomConfig.scoreLimit) {
        _handleRoundEnd({ winner: msg.killerName ?? 'Someone', scores: msg.scores }, onRoundEnd);
      }
    }
  });

  on('respawn', msg => {
    if (msg.playerId === getMyId()) {
      player.hp = player.maxHp; player.armor = 0;
      const sp = _chooseFarSpawn();
      camera.position.set(sp[0], 1.72, sp[2]);
      localDead = false;
      _hideRespawnOverlay();
      document.getElementById('c')?.requestPointerLock();
    } else {
      const rp = remotePlayers.get(msg.playerId);
      if (rp) { rp.alive = true; rp.hp = player.maxHp; rp.group.position.set(msg.x, 0, msg.z); rp.group.getChildMeshes().forEach(m => m.setEnabled(true)); }
      _rebuildMeshMap();
    }
  });

  on('roundStart', msg => {
    roundActive = true;
    timeLeft = msg.duration ?? roomConfig.roundDuration ?? 600;
    myScore = 0; _scores.forEach(s => { s.score = 0; });

    // Close pre-game lobby and actually begin the round
    if (_inPreLobby) {
      _hidePreLobbyOverlay();
      onGameStart?.();   // triggers main.js to fully activate the game
    }

    updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
    _announce('FIGHT!', 2200);
  });

  on('roundEnd',    msg => _handleRoundEnd(msg, onRoundEnd));
  on('disconnected', ()  => stopFfa());
}

function _handleRoundEnd(msg, onRoundEnd) {
  roundActive = false;
  updateFfaHUD(_buildScoreRows(), 0, getMyId());
  onRoundEnd?.(msg.winner ?? 'Nobody', _buildScoreRows());
}

function _buildScoreRows() {
  const rows = [{ id: getMyId() ?? 'me', name: myName, score: myScore }];
  for (const [id, sc] of _scores) {
    if (id !== getMyId()) rows.push({ id, name: sc.name, score: sc.score });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/**
 * Start FFA flow.
 * @param serverUrl  WebSocket server URL
 * @param name       Local player's callsign
 * @param roomId     Room code string
 * @param config     Room config (from host) or null (for joiners)
 * @param isHost     true if this player created the room
 * @param onGameStart  Called when server sends roundStart (game actually begins)
 * @param onRoundEnd   Called when round finishes
 */
export function startFfa(serverUrl, name, roomId, config, isHost, onGameStart, onRoundEnd) {
  ffaActive   = true;
  localDead   = false;
  _isHost     = isHost;
  _inPreLobby = true;
  myName      = name ?? 'ANON';
  myScore     = 0;
  timeLeft    = config?.roundDuration ?? 600;
  _scores.clear();
  _clearRemotePlayers();
  setRoomConfig({ ...DEFAULT_ROOM_CONFIG, ...(config ?? {}) });
  _wireEvents(onRoundEnd, onGameStart);
  connect(serverUrl, name, roomId, { type: 'ffa', config: roomConfig, isHost });
  _botSpawnTimer = BOT_SPAWN_INTERVAL;
}

export function stopFfa() {
  ffaActive   = false;
  roundActive = false;
  _inPreLobby = false;
  _isHost     = false;
  disconnect();
  _clearRemotePlayers();
  _hidePreLobbyOverlay();
  ['welcome','playerJoined','playerLeft','state','hit','killed',
   'respawn','roundStart','roundEnd','disconnected'].forEach(t => off(t));
  for (const e of enemies) {
    if (!e.alive) continue;
    e.group.getChildMeshes().forEach(m => m.dispose());
    e.group.dispose();
    e.alive = false;
  }
  enemies.length = 0;
}

function _clearRemotePlayers() {
  for (const rp of remotePlayers.values()) {
    rp.group.getChildMeshes().forEach(m => m.dispose()); rp.group.dispose();
  }
  remotePlayers.clear(); _remoteMeshMap.clear();
}

export function updateFfa(dt) {
  if (!ffaActive) return;

  // While in pre-game lobby, only sync position (no gameplay)
  if (_inPreLobby) {
    sendMoveThrottled(dt, camera.position.x, camera.position.y, camera.position.z, camera.rotation.y);
    return;
  }

  if (roundActive) {
    timeLeft = Math.max(0, timeLeft - dt);
    updateFfaHUD(_buildScoreRows(), timeLeft, getMyId());
  }

  // Periodic bot spawning
  if (roomConfig.addBots) {
    const liveCount  = enemies.filter(e => e.alive).length;
    const targetBots = roomConfig.botCount ?? 4;
    if (liveCount < targetBots) {
      _botSpawnTimer -= dt;
      if (_botSpawnTimer <= 0) {
        _botSpawnTimer = BOT_SPAWN_INTERVAL;
        const type = BOT_TYPES[Math.floor(Math.random() * BOT_TYPES.length)];
        const sp = _chooseFarSpawn();
        spawnBot(type, sp[0], sp[1], sp[2], 1.0);
      }
    }
    updateEnemies(dt);
  }

  if (localDead && respawnTimer > 0) {
    respawnTimer -= dt;
    const el = document.getElementById('respawnCountdown');
    if (el) el.textContent = Math.ceil(respawnTimer);
  }
  sendMoveThrottled(dt, camera.position.x, camera.position.y, camera.position.z, camera.rotation.y);
}

export function isFfaActive() { return ffaActive; }
export function isLocalDead() { return localDead; }
export function isFfaInPreLobby() { return _inPreLobby; }

export function checkFfaHitScan(dmg, range, spread = 0) {
  const fwd = camera.getForwardRay(1).direction.clone();
  if (spread > 0) {
    fwd.x += (Math.random() - 0.5) * spread * 2;
    fwd.y += (Math.random() - 0.5) * spread * 2;
    fwd.normalize();
  }
  const ray  = new BABYLON.Ray(camera.position.clone(), fwd, range);
  const hits = scene.multiPickWithRay(ray, m => _remoteMeshMap.has(m));
  if (hits?.length > 0) {
    const entry = _remoteMeshMap.get(hits[0].pickedMesh);
    if (entry) {
      const realDmg = (roomConfig.instagib ? 9999 : dmg) * (roomConfig.damageMult ?? 1);
      sendHit(entry.id, realDmg, 'hitscan');
      return true;
    }
  }
  return false;
}

function _showRespawnOverlay(secs) {
  let el = document.getElementById('ffaRespawnOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ffaRespawnOverlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:950;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:"Courier New",monospace;pointer-events:none';
    el.innerHTML = '<div style="font-size:38px;color:#ff3322;font-weight:bold;letter-spacing:3px;text-shadow:0 0 18px #f00">FRAGGED</div>' +
      '<div style="margin-top:14px;font-size:18px;color:#aaa">Respawning in <span id="respawnCountdown" style="color:#fff;font-weight:bold">' + Math.ceil(secs) + '</span>s</div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function _hideRespawnOverlay() {
  const el = document.getElementById('ffaRespawnOverlay');
  if (el) el.style.display = 'none';
}
function _announce(txt, ms) {
  const el = document.getElementById('waveAnnounce');
  if (!el) return;
  el.textContent = txt; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ── FFA Lobby UI ───────────────────────────────────────────────
// Stage 1: enter callsign, choose Host or Join
// Stage 2a (Host): full settings + server URL
// Stage 2b (Join): just room code entry, optional advanced server URL
export function showFfaLobby({ onStart, onBack }) {
  document.getElementById('ffaLobbyPanel')?.remove();

  function el(tag, css, html) {
    const d = document.createElement(tag);
    if (css)  d.style.cssText = css;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }
  function row(label, child) {
    const d = el('div', 'display:flex;justify-content:space-between;align-items:center;width:100%;margin:5px 0;gap:12px');
    const l = el('span', 'color:#aaa;font-size:13px;flex:1;min-width:160px'); l.textContent = label;
    d.appendChild(l); d.appendChild(child); return d;
  }
  function sectionTitle(t) {
    const d = el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:8px;border-bottom:1px solid #222;padding-bottom:4px');
    d.textContent = t; return d;
  }
  function box(title, children) {
    const b = el('div', 'width:100%;max-width:580px;border:1px solid #2a2a2a;padding:14px 16px;margin-bottom:12px;background:#0d0d0d');
    b.appendChild(sectionTitle(title)); children.forEach(c => b.appendChild(c)); return b;
  }
  const BS = 'background:#1a1a1a;border:1px solid #444;color:#d8f030;padding:7px 16px;font-family:"Courier New",monospace;font-size:13px;font-weight:bold;cursor:pointer;letter-spacing:1px';

  function toggle(cfg, key) {
    const btn = el('button', BS + ';min-width:60px;background:' + (cfg[key] ? '#1a4a1a' : '#2a1a1a'));
    btn.textContent = cfg[key] ? 'YES' : 'NO';
    btn.onclick = () => { cfg[key] = !cfg[key]; btn.textContent = cfg[key] ? 'YES' : 'NO'; btn.style.background = cfg[key] ? '#1a4a1a' : '#2a1a1a'; };
    return btn;
  }
  function slider(cfg, key, min, max, step, fmt) {
    const wrap = el('div', 'display:flex;align-items:center;gap:8px');
    const inp = el('input'); inp.type='range'; inp.min=min; inp.max=max; inp.step=step; inp.value=cfg[key];
    inp.style.cssText = 'width:130px;accent-color:#d8f030;cursor:pointer';
    const lbl = el('span', 'width:56px;text-align:right;font-size:13px;color:#d8f030');
    lbl.textContent = fmt(cfg[key]);
    inp.oninput = () => { cfg[key] = parseFloat(inp.value); lbl.textContent = fmt(cfg[key]); };
    wrap.appendChild(inp); wrap.appendChild(lbl); return wrap;
  }
  function numInp(cfg, key, min, max) {
    const inp = el('input'); inp.type='number'; inp.min=min; inp.max=max; inp.value=cfg[key];
    inp.style.cssText = 'width:72px;background:#111;border:1px solid #444;color:#d8f030;padding:5px 7px;font-family:inherit;font-size:13px';
    inp.oninput = () => { cfg[key] = parseInt(inp.value) || min; };
    return inp;
  }
  function txtInp(id, ph, w) {
    const inp = el('input'); inp.type='text'; inp.id=id; inp.placeholder=ph;
    inp.style.cssText = 'width:' + (w||200) + 'px;background:#111;border:1px solid #444;color:#d8f030;padding:6px 10px;font-family:inherit;font-size:13px';
    return inp;
  }
  const pct = v => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  const sec = v => v + 's';
  const num = v => String(v);
  const rld = v => { const inv = 2 - v; return (inv >= 1 ? '+' : '') + Math.round((inv - 1) * 100) + '%'; };

  const panel = el('div',
    'position:fixed;inset:0;background:#080808;z-index:900;overflow-y:auto;' +
    'display:flex;flex-direction:column;align-items:center;padding:28px 16px 56px;' +
    'font-family:"Courier New",monospace;color:#d8f030');
  panel.id = 'ffaLobbyPanel';

  panel.appendChild(el('h1', 'font-size:26px;letter-spacing:5px;margin:0 0 4px;text-shadow:0 0 14px #d8f030', 'FREE FOR ALL'));
  panel.appendChild(el('p', 'color:#557733;font-size:12px;margin:0 0 22px;letter-spacing:1px', 'HOST A ROOM · SHARE THE CODE · WAIT IN LOBBY · FRAG EVERYONE'));

  // ── Stage 1 ──────────────────────────────────────────────────
  const s1 = el('div', 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:580px;gap:16px');
  s1.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px', 'YOUR CALLSIGN'));
  const nameI = txtInp('ffaName', 'Enter callsign…', 260);
  nameI.style.cssText += ';font-size:18px;text-align:center';
  s1.appendChild(nameI);
  const modeRow = el('div', 'display:flex;gap:18px;margin-top:8px');
  const hostBtn1 = el('button', BS + ';min-width:160px;font-size:16px;padding:12px 20px;background:#1a3a1a;border-color:#2a5');
  hostBtn1.textContent = '⚔  HOST ROOM';
  const joinBtn1 = el('button', BS + ';min-width:160px;font-size:16px;padding:12px 20px;background:#1a1a3a;border-color:#44f');
  joinBtn1.textContent = '🔗  JOIN ROOM';
  modeRow.appendChild(hostBtn1);
  modeRow.appendChild(joinBtn1);
  s1.appendChild(modeRow);
  const backBtn0 = el('button', BS + ';margin-top:4px;min-width:110px;opacity:0.6');
  backBtn0.textContent = '← BACK';
  backBtn0.onclick = () => { panel.remove(); onBack?.(); };
  s1.appendChild(backBtn0);
  panel.appendChild(s1);

  // ── Stage 2a: HOST ────────────────────────────────────────────
  const s2h = el('div', 'display:none;flex-direction:column;align-items:center;width:100%;max-width:580px');
  const cfg = { ...DEFAULT_ROOM_CONFIG };
  const srvI = txtInp('ffaSrv', 'wss://your-server.railway.app', 340);
  const rmI  = txtInp('ffaRoom', 'Leave blank for auto-generated code', 340);
  s2h.appendChild(box('SERVER & ROOM', [
    el('div', 'font-size:10px;color:#557733;margin-bottom:8px', 'Your Railway WebSocket URL (see HOSTING_GUIDE.md). Local test: ws://localhost:8080'),
    row('Server URL', srvI),
    row('Room Code',  rmI),
  ]));
  s2h.appendChild(box('GAME RULES', [
    row('Max Players',   numInp(cfg, 'maxPlayers', 2, 16)),
    row('Round Time',    slider(cfg, 'roundDuration', 120, 1800, 60, v => Math.floor(v/60) + 'm')),
    row('Score Limit',   numInp(cfg, 'scoreLimit', 0, 100)),
    row('Respawn Delay', slider(cfg, 'respawnDelay', 1, 15, 1, sec)),
  ]));
  s2h.appendChild(box('BOTS', [
    row('Add Bots',  toggle(cfg, 'addBots')),
    row('Bot Count', slider(cfg, 'botCount', 1, 8, 1, num)),
  ]));
  s2h.appendChild(box('CONTENT', [
    row('Weapon Spawns',  toggle(cfg, 'weaponSpawns')),
    row('Health Pickups', toggle(cfg, 'healthSpawns')),
    row('Armor Pickups',  toggle(cfg, 'armorSpawns')),
    row('Rocket Jumping', toggle(cfg, 'allowRocketJump')),
  ]));
  s2h.appendChild(box('MODIFIERS', [
    row('Player Health', slider(cfg, 'healthMult',  0.25, 1.75, 0.05, pct)),
    row('Armor Amount',  slider(cfg, 'armorMult',   0.25, 1.75, 0.05, pct)),
    row('All Damage',    slider(cfg, 'damageMult',  0.25, 1.75, 0.05, pct)),
    row('Move Speed',    slider(cfg, 'speedMult',   0.25, 1.75, 0.05, pct)),
    row('Gravity',       slider(cfg, 'gravityMult', 0.25, 1.75, 0.05, pct)),
    row('Jump Height',   slider(cfg, 'jumpMult',    0.25, 1.75, 0.05, pct)),
    row('Fire Rate',     slider(cfg, 'reloadMult',  0.25, 1.75, 0.05, rld)),
  ]));
  s2h.appendChild(box('EXTRA OPTIONS', [
    row('Instagib (one-shot kills)', toggle(cfg, 'instagib')),
    row('Infinite Ammo',             toggle(cfg, 'infiniteAmmo')),
    row('Low Gravity',               toggle(cfg, 'lowGravity')),
    row('Big Head Mode',             toggle(cfg, 'bigHead')),
  ]));

  const hBtnRow = el('div', 'display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;justify-content:center');
  const backH = el('button', BS + ';min-width:110px'); backH.textContent = '← BACK';
  backH.onclick = () => { s2h.style.display = 'none'; s1.style.display = 'flex'; };

  const launchBtn = el('button', BS + ';min-width:180px;background:#1a3a1a;border-color:#2a5;font-size:15px');
  launchBtn.textContent = '⚔  CREATE ROOM & WAIT';
  launchBtn.onclick = () => {
    const name   = (document.getElementById('ffaName')?.value || 'ANON').trim();
    const server = (document.getElementById('ffaSrv')?.value  || 'ws://localhost:8080').trim();
    let   roomId = (document.getElementById('ffaRoom')?.value || '').trim();
    if (!roomId) roomId = _genRoomCode();
    launchBtn.disabled = true; launchBtn.textContent = 'CONNECTING…';
    setTimeout(() => {
      panel.remove();
      onStart?.({ name, server, roomId, config: { ...cfg }, isHost: true });
    }, 120);
  };
  hBtnRow.appendChild(backH); hBtnRow.appendChild(launchBtn);
  s2h.appendChild(hBtnRow);
  panel.appendChild(s2h);

  // ── Stage 2b: JOIN ────────────────────────────────────────────
  const s2j = el('div', 'display:none;flex-direction:column;align-items:center;width:100%;max-width:480px;gap:14px');
  s2j.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:4px', 'ENTER ROOM CODE'));
  const codeI = txtInp('ffaJoinCode', 'XXXXXX', 260);
  codeI.style.cssText += ';font-size:28px;text-align:center;letter-spacing:8px';
  codeI.maxLength = 8;
  codeI.oninput = () => { codeI.value = codeI.value.toUpperCase(); };
  s2j.appendChild(codeI);
  const advLbl = el('div', 'cursor:pointer;font-size:11px;color:#557733;margin-top:4px;user-select:none');
  advLbl.textContent = '▶  Advanced — custom server URL';
  const advBox = el('div', 'display:none;width:100%;margin-top:6px');
  advBox.appendChild(el('div', 'font-size:10px;color:#557733;margin-bottom:6px', 'Only needed if the host uses a custom server address.'));
  const joinSrvI = txtInp('ffaJoinSrv', 'wss://your-server.railway.app', 380);
  advBox.appendChild(joinSrvI);
  let _advOpen = false;
  advLbl.onclick = () => { _advOpen = !_advOpen; advBox.style.display = _advOpen ? 'block' : 'none'; advLbl.textContent = (_advOpen ? '▼' : '▶') + '  Advanced — custom server URL'; };
  s2j.appendChild(advLbl); s2j.appendChild(advBox);
  const jBtnRow = el('div', 'display:flex;gap:14px;margin-top:16px;justify-content:center');
  const backJ = el('button', BS + ';min-width:110px'); backJ.textContent = '← BACK';
  backJ.onclick = () => { s2j.style.display = 'none'; s1.style.display = 'flex'; };
  const connectBtn = el('button', BS + ';min-width:180px;background:#1a1a3a;border-color:#44f;font-size:15px');
  connectBtn.textContent = '🔗  JOIN & WAIT IN LOBBY';
  connectBtn.onclick = () => {
    const name   = (document.getElementById('ffaName')?.value || 'ANON').trim();
    const roomId = (document.getElementById('ffaJoinCode')?.value || '').trim();
    if (!roomId) { _flashMsg(connectBtn, 'ENTER A CODE FIRST!'); return; }
    const server = (document.getElementById('ffaJoinSrv')?.value || 'ws://localhost:8080').trim();
    connectBtn.disabled = true; connectBtn.textContent = 'CONNECTING…';
    panel.remove();
    onStart?.({ name, server, roomId, config: null, isHost: false });
  };
  jBtnRow.appendChild(backJ); jBtnRow.appendChild(connectBtn);
  s2j.appendChild(jBtnRow);
  panel.appendChild(s2j);

  // ── Stage 1 button wiring ─────────────────────────────────────
  hostBtn1.onclick = () => {
    const name = (document.getElementById('ffaName')?.value || '').trim();
    if (!name) { _flashMsg(hostBtn1, 'ENTER A CALLSIGN!'); return; }
    s1.style.display = 'none'; s2h.style.display = 'flex';
  };
  joinBtn1.onclick = () => {
    const name = (document.getElementById('ffaName')?.value || '').trim();
    if (!name) { _flashMsg(joinBtn1, 'ENTER A CALLSIGN!'); return; }
    s1.style.display = 'none'; s2j.style.display = 'flex';
  };

  document.body.appendChild(panel);
}

function _genRoomCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function _flashMsg(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg; btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
}
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export const isPvpActive = isFfaActive;
export const updatePvp   = updateFfa;
export const startPvp    = startFfa;
export const stopPvp     = stopFfa;
