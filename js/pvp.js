// pvp.js – Team Deathmatch mode: remote player rendering, round state, respawn  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { remotePlayers, player } from './gameState.js';
import { connect, disconnect, send, on, off, sendMoveThrottled, sendHit, sendReady, getMyId, getMyTeam } from './network.js';
import { sfx } from './audio.js';
import { updatePvpHUD } from './ui.js';
import { hurtPlayer } from './player.js';

// PvP state
let pvpActive       = false;
let roundActive     = false;
let redScore        = 0;
let blueScore       = 0;
let timeLeft        = 600; // 10 minutes
let respawnTimer    = 0;
let localDead       = false;

// Team spawn areas
const TEAM_SPAWNS = {
  RED:  [[-24,0,-24],[-20,0,-28],[-28,0,-20]],
  BLUE: [[ 24,0, 24],[ 20,0, 28],[ 28,0, 20]],
};

// ── Remote player mesh factory ────────────────────────────────
function makeRemotePlayerMesh(team) {
  const col  = team === 'RED' ? new BABYLON.Color3(.8,.13,.07) : new BABYLON.Color3(.07,.27,.8);
  const mat  = new BABYLON.StandardMaterial('rpMat_' + team + '_' + Date.now(), scene);
  mat.diffuseColor = col;
  const g    = new BABYLON.TransformNode('rp_' + team, scene);
  const body = BABYLON.MeshBuilder.CreateBox('rpBody', { width:.7, height:1.6, depth:.4 }, scene);
  body.material = mat; body.parent = g;
  body.position.y = .8;
  const head = BABYLON.MeshBuilder.CreateBox('rpHead', { size:.45 }, scene);
  head.material = mat; head.parent = g;
  head.position.y = 1.7;
  // Name tag
  const tag = makeNameTag('?', col);
  tag.parent = g;
  tag.position.y = 2.1;
  tag.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  return g;
}

function makeNameTag(name, teamColor) {
  const w = 256, h = 64;
  const c   = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (ctx.roundRect) { ctx.roundRect(4,4,248,56,8); ctx.fill(); }
  else { ctx.fillRect(4,4,248,56); }
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const r = Math.round(teamColor.r*255), g = Math.round(teamColor.g*255), b = Math.round(teamColor.b*255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillText(name.slice(0,12), 128, 32);
  const plane = BABYLON.MeshBuilder.CreatePlane('nameTag', { width:1.4, height:.35 }, scene);
  const mat   = new BABYLON.StandardMaterial('ntMat_' + Date.now(), scene);
  const tex   = new BABYLON.DynamicTexture('ntTex_' + Date.now(), { width:w, height:h }, scene, false);
  tex.getContext().drawImage(c, 0, 0);
  tex.update();
  mat.diffuseTexture = tex; mat.emissiveColor = BABYLON.Color3.White();
  mat.diffuseTexture.hasAlpha = true; mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true; mat.backFaceCulling = false;
  plane.material = mat; plane.isPickable = false;
  return plane;
}

// ── Network event wiring ──────────────────────────────────────
function wireNetworkEvents(onRoundEnd) {
  on('playerJoined', msg => {
    if (msg.id === getMyId()) return;
    const g = makeRemotePlayerMesh(msg.team);
    remotePlayers.set(msg.id, { group:g, hp:100, team:msg.team, name:msg.name, alive:true });
    rebuildRemoteMeshMap();
  });

  on('playerLeft', msg => {
    const rp = remotePlayers.get(msg.id);
    if (rp) {
      rp.group.getChildMeshes().forEach(m => m.dispose());
      rp.group.dispose();
      remotePlayers.delete(msg.id);
    }
    rebuildRemoteMeshMap();
  });

  on('state', msg => {
    for (const pd of (msg.players || [])) {
      if (pd.id === getMyId()) continue;
      let rp = remotePlayers.get(pd.id);
      if (!rp) {
        const g = makeRemotePlayerMesh(pd.team || 'BLUE');
        rp = { group:g, hp:pd.hp??100, team:pd.team||'BLUE', name:pd.name||'?', alive:true };
        remotePlayers.set(pd.id, rp);
        rebuildRemoteMeshMap();
      }
      // Smooth interpolation – just snap for now (can add lerp later)
      rp.group.position.set(pd.x, pd.y, pd.z);
      rp.group.rotation.y = pd.yaw;
      rp.hp = pd.hp;
      rp.alive = pd.hp > 0;
      rp.group.getChildMeshes().forEach(m => { if (!(m.name === 'nameTag')) m.setEnabled(rp.alive); });
    }
  });

  on('hit', msg => {
    // Server tells us we were hit
    if (msg.targetId === getMyId()) {
      hurtPlayer(msg.dmg);
    }
  });

  on('died', msg => {
    if (msg.playerId === getMyId()) {
      localDead   = true;
      respawnTimer = 5;
      showRespawnOverlay(5);
      document.exitPointerLock();
    } else {
      const rp = remotePlayers.get(msg.playerId);
      if (rp) { rp.alive = false; rp.group.getChildMeshes().forEach(m => m.setEnabled(false)); }
    }
  });

  on('respawn', msg => {
    if (msg.playerId === getMyId()) {
      player.hp   = 100;
      player.armor= 0;
      camera.position.set(msg.x, 1.72, msg.z);
      localDead   = false;
      hideRespawnOverlay();
      document.getElementById('c')?.requestPointerLock();
    } else {
      const rp = remotePlayers.get(msg.playerId);
      if (rp) { rp.alive = true; rp.group.getChildMeshes().forEach(m => m.setEnabled(true)); rp.hp = 100; rp.group.position.set(msg.x, 0, msg.z); }
    }
  });

  on('scores', msg => {
    redScore  = msg.redScore  ?? redScore;
    blueScore = msg.blueScore ?? blueScore;
    timeLeft  = msg.timeLeft  ?? timeLeft;
    updatePvpHUD(redScore, blueScore, timeLeft);
  });

  on('roundStart', msg => {
    roundActive = true; timeLeft = msg.duration ?? 600;
    redScore = 0; blueScore = 0;
    updatePvpHUD(0, 0, timeLeft);
    announceText('FIGHT!', 2200);
  });

  on('roundEnd', msg => {
    roundActive = false;
    redScore  = msg.redScore;
    blueScore = msg.blueScore;
    updatePvpHUD(redScore, blueScore, 0);
    const winner = msg.winner === 'TIE' ? 'TIE GAME' : `${msg.winner} WINS`;
    onRoundEnd(winner, redScore, blueScore);
  });

  on('disconnected', () => stopPvp());
}

// ── Remote player raycaster for hitscan ──────────────────────
export const _remoteMeshMap = new Map(); // Mesh → remotePlayer entry

function rebuildRemoteMeshMap() {
  _remoteMeshMap.clear();
  for (const [id, rp] of remotePlayers) {
    if (!rp.alive) continue;
    rp.group.getChildMeshes().forEach(m => { _remoteMeshMap.set(m, { id, rp }); });
  }
}

/** Called by player.js shoot() when a hitscan fires in PvP mode. */
export function checkPvpHitScan(dmg, range, spread = 0) {
  const fwd = camera.getForwardRay(1).direction.clone().normalize();
  if (spread > 0) {
    fwd.x += (Math.random()-.5)*spread*2;
    fwd.y += (Math.random()-.5)*spread*2;
    fwd.normalizeToRef(fwd);
  }
  const ray  = new BABYLON.Ray(camera.position.clone(), fwd, range);
  const hits = scene.multiPickWithRay(ray, m => _remoteMeshMap.has(m));
  if (hits && hits.length > 0) {
    const entry = _remoteMeshMap.get(hits[0].pickedMesh);
    if (entry && entry.rp.team !== getMyTeam()) {
      sendHit(entry.id, dmg, 'hitscan');
      return true;
    }
  }
  return false;
}

// ── Lifecycle ─────────────────────────────────────────────────
export function startPvp(serverUrl, playerName, roomId, onRoundEnd) {
  pvpActive = true; localDead = false;
  redScore = 0; blueScore = 0; timeLeft = 600;

  // Clear all bots / pickups from the scene (should already be clear if coming from menu)
  clearRemotePlayers();

  wireNetworkEvents(onRoundEnd);
  connect(serverUrl, playerName, roomId);

  // Position player at own team spawn after welcome msg arrives
  on('welcome', msg => {
    const team  = msg.team;
    const spawnOpts = TEAM_SPAWNS[team] || TEAM_SPAWNS.RED;
    const sp = spawnOpts[Math.floor(Math.random()*spawnOpts.length)];
    camera.position.set(sp[0], 1.72, sp[2]);
    // Populate existing players
    for (const pd of (msg.players || [])) {
      if (pd.id === msg.id) continue;
      const g = makeRemotePlayerMesh(pd.team);
      remotePlayers.set(pd.id, { group:g, hp:pd.hp??100, team:pd.team, name:pd.name, alive:true });
    }
    rebuildRemoteMeshMap();
    sendReady();
    announceText(`TEAM ${team}`, 2000);
  });
}

export function stopPvp() {
  pvpActive = false; roundActive = false;
  disconnect();
  clearRemotePlayers();
  off('playerJoined'); off('playerLeft'); off('state');
  off('hit'); off('died'); off('respawn'); off('scores');
  off('roundStart'); off('roundEnd'); off('welcome'); off('disconnected');
}

function clearRemotePlayers() {
  for (const rp of remotePlayers.values()) {
    rp.group.getChildMeshes().forEach(m => m.dispose());
    rp.group.dispose();
  }
  remotePlayers.clear(); _remoteMeshMap.clear();
}

export function updatePvp(dt) {
  if (!pvpActive) return;
  if (roundActive) {
    timeLeft = Math.max(0, timeLeft - dt);
    updatePvpHUD(redScore, blueScore, timeLeft);
  }
  if (localDead && respawnTimer > 0) {
    respawnTimer -= dt;
    const el = document.getElementById('respawnCountdown');
    if (el) el.textContent = Math.ceil(respawnTimer);
  }
  // Throttled position push
  sendMoveThrottled(dt, camera.position.x, camera.position.y, camera.position.z,
    camera.rotation.y);
}

export function isPvpActive() { return pvpActive; }
export function isLocalDead() { return localDead; }

// ── Respawn overlay ───────────────────────────────────────────
function showRespawnOverlay(secs) {
  let el = document.getElementById('respawnOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'respawnOverlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Arial';
    el.innerHTML = '<h2 style="font-size:40px;color:#ff3322;letter-spacing:3px">YOU WERE SCRAPPED</h2><p style="margin:12px;font-size:18px">Respawn in <span id="respawnCountdown">5</span>s…</p>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function hideRespawnOverlay() {
  const el = document.getElementById('respawnOverlay');
  if (el) el.style.display = 'none';
}

// ── Generic announcement ──────────────────────────────────────
function announceText(txt, durationMs) {
  const el = document.getElementById('waveAnnounce');
  if (!el) return;
  el.textContent = txt; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), durationMs);
}
