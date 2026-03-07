// enemies.js – robot AI, spawning, hit/destroy logic  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M, robotTex } from './textures.js';
import { makeScaledWeaponModel, ROBOT_DROPS } from './weapons.js';
import { enemies, player, cb } from './gameState.js';
import { spawnSparks } from './particles.js';
import { fireEnemyShot } from './projectiles.js';
import { sfx } from './audio.js';

// ── Mesh→enemy lookup for hitscan raycasting ─────────────────
export const _meshToEnemy = new Map();
export function rebuildMeshMap() {
  _meshToEnemy.clear();
  for (const e of enemies) {
    if (!e.alive) continue;
    e.group.getChildMeshes().forEach(m => _meshToEnemy.set(m, e));
  }
}

// ── Simple AABB wall check (uses scene mesh picking instead of collidables[]) ─
// A lightweight radius check: cast a short ray downward + outward to see if any
// collision-enabled static mesh occupies the test position.
function checkWallSimple(pos, rad) {
  const dirs = [
    new BABYLON.Vector3( rad, 0, 0),
    new BABYLON.Vector3(-rad, 0, 0),
    new BABYLON.Vector3(0, 0,  rad),
    new BABYLON.Vector3(0, 0, -rad),
  ];
  for (const d of dirs) {
    const origin = new BABYLON.Vector3(pos.x, pos.y + 0.5, pos.z);
    const ray    = new BABYLON.Ray(origin, d, rad);
    const hit    = scene.pickWithRay(ray, m => m.checkCollisions && !m.metadata?.enemy);
    if (hit.hit) return true;
  }
  return false;
}

export function buildRobot(type) {
  const g = new BABYLON.TransformNode('robot_' + type, scene);
  const sc = {
    scout:    { r:72,  gr:80, b:72, led: M.ledGreen, flyH:0   },
    heavy:    { r:100, gr:68, b:48, led: M.ledRed,   flyH:0   },
    sniper:   { r:45,  gr:58, b:78, led: M.ledCyan,  flyH:0   },
    drone:    { r:52,  gr:52, b:88, led: M.ledBlue,  flyH:1.4 },
    pistol:   { r:90,  gr:90, b:90, led: M.ledWhite, flyH:0   },
    shotgun:  { r:120, gr:90, b:60, led: M.ledYellow,flyH:0   },
    rocket:   { r:80,  gr:40, b:40, led: M.ledOrange,flyH:0   },
  }[type] || { r:70, gr:70, b:70, led: M.ledGreen, flyH:0 };

  const bmat = robotTex('robot_' + type + '_' + Math.random().toString(36).slice(2), sc.r, sc.gr, sc.b);
  const led  = sc.led;

  function addBox(name, sx, sy, sz, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateBox(name, { width:sx, height:sy, depth:sz }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true };
    return m;
  }
  function addSphere(name, r, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateSphere(name, { diameter: r*2, segments:8 }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true };
    return m;
  }
  function addCyl(name, d, h, mat, px, py, pz, rotX) {
    const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter:d, height:h, tessellation:8 }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    if (rotX) m.rotation.x = rotX;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true };
    return m;
  }
  function addTorus(name, d, t, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateTorus(name, { diameter:d, thickness:t, tessellation:16 }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    m.rotation.x = Math.PI/2;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true };
    return m;
  }

  if (type === 'drone') {
    addSphere('body', .58, bmat, 0, 1.5, 0);
    addTorus('ring', 1.24, .14, bmat, 0, 1.5, 0);
    addSphere('eye', .14, led, 0, 1.5, .58);
    addCyl('bbl', .08, .4, M.gunMetal, 0, 1.28, .75, Math.PI/2);
    for (const s of [-1,1]) {
      addBox('arm'+s, .72, .04, .1, M.gunMetal, s*.56, 1.72, 0);
      addCyl('rotor'+s, .56, .04, led, s*.88, 1.76, 0, 0);
    }
  } else {
    // Humanoid bots: thinner torso, longer legs, more human-like proportions
    let torsoSlim = 0.7, bodyH = 1.18, bodyW = 0.48, bodyD = 0.32;
    let armLen = 0.7, armW = 0.10, legW = 0.13, legH = 0.7, footL = 0.22, footH = 0.11;
    let headW = 0.32, headH = 0.36, headD = 0.28;
    let led = sc.led;
    // Adjust for specific types
    if (type === 'heavy') { torsoSlim = 0.90; bodyH = 1.65; bodyW = 1.15 * torsoSlim; bodyD = .72 * torsoSlim; armLen = .88; armW = .16; legW = .24; legH = .65; footL = .34; footH = .14; headW = .52; headH = .40; headD = .36; }
    if (type === 'sniper') { torsoSlim = 0.84; bodyH = 1.1; bodyW = .78 * torsoSlim; bodyD = .52 * torsoSlim; armLen = .64; armW = .11; legW = .20; legH = .52; footL = .28; footH = .14; headW = .4; headH = .31; headD = .29; }
    if (type === 'scout') { torsoSlim = 0.8; bodyH = 1.05; bodyW = .62; bodyD = .36; armLen = .62; armW = .10; legW = .15; legH = .62; footL = .22; footH = .10; headW = .32; headH = .28; headD = .24; }
    if (type === 'pistol') { torsoSlim = 0.7; bodyH = 1.08; bodyW = 0.48; bodyD = 0.32; armLen = 0.7; armW = 0.10; legW = 0.13; legH = 0.7; footL = 0.22; footH = 0.11; headW = 0.32; headH = 0.36; headD = 0.28; }
    if (type === 'shotgun') { torsoSlim = 0.8; bodyH = 1.12; bodyW = 0.54; bodyD = 0.34; armLen = 0.72; armW = 0.12; legW = 0.16; legH = 0.68; footL = 0.25; footH = 0.12; headW = 0.34; headH = 0.33; headD = 0.26; }
    if (type === 'rocket') { torsoSlim = 0.75; bodyH = 1.15; bodyW = 0.52; bodyD = 0.36; armLen = 0.74; armW = 0.13; legW = 0.17; legH = 0.7; footL = 0.28; footH = 0.13; headW = 0.36; headH = 0.34; headD = 0.29; }
    const bodyY = bodyH/2+.28;
    addBox('body', bodyW, bodyH, bodyD, bmat, 0, bodyY, 0);
    addBox('panel', bodyW*.55, bodyH*.38, .06, bmat, 0, bodyY, bodyW*.28);
    addSphere('glow', .08, led, 0, bodyY+.05, bodyW*.31);
    for (const s of [-1,1]) {
      addBox('leg'+s, legW, legH, legW*1.2, bmat, s*(bodyW/2-.12), .22, 0);
      addBox('foot'+s, footL, footH, footL*1.1, bmat, s*(bodyW/2-.12), .03, .06);
    }
    const headY = bodyY + bodyH/2 + headH*.42;
    addBox('head', headW, headH, headD, bmat, 0, headY, 0);
    addBox('visor', headW*.78, .14, headW*.18, led, 0, headY, headW*.38);
    addBox('armL', armW, armW, armLen, bmat, bodyW/2+armW/2, bodyY+bodyH*.18, -armLen*.1);
    addBox('armR', armW, armW, armLen, bmat, -bodyW/2-armW/2, bodyY+bodyH*.18, -armLen*.1);
    // Weapon model
    let wepName = 'SMG', wepScale = 0.50;
    if (type==='heavy') { wepName = 'CHAINGUN'; wepScale = 0.62; }
    else if (type==='sniper') { wepName = 'RAILGUN'; wepScale = 0.50; }
    else if (type==='pistol') { wepName = 'PISTOL'; wepScale = 0.44; }
    else if (type==='shotgun') { wepName = 'SHOTGUN'; wepScale = 0.54; }
    else if (type==='rocket') { wepName = 'ROCKET'; wepScale = 0.56; }
    const wm = makeScaledWeaponModel(wepName, wepScale);
    wm.parent = g;
    const wOff = [bodyW/2+armW/2, bodyY+bodyH*.18-.02, .42];
    wm.position.set(...wOff);
    wm.rotation.y = Math.PI;
    wm.getChildMeshes().forEach(c => { c.isPickable = false; });
  }

  const stat = {
    scout:    { hp:55,  maxHp:55,  speed:5.0, dmg:9,  range:26, rate:.85, projT:'bullet', projV:26, score:100, muzzleOffY:1.0 },
    heavy:    { hp:200, maxHp:200, speed:2.3, dmg:28, range:24, rate:2.4, projT:'heavy',  projV:55, score:260, muzzleOffY:1.35 },
    sniper:   { hp:38,  maxHp:38,  speed:2.8, dmg:32, range:48, rate:2.8, projT:'sniper', projV:40, score:210, muzzleOffY:1.0 },
    drone:    { hp:48,  maxHp:48,  speed:6.0, dmg:7,  range:22, rate:.48, projT:'plasma', projV:24, score:155, muzzleOffY:0.5 },
    pistol:   { hp:30,  maxHp:30,  speed:4.2, dmg:7,  range:22, rate:.65, projT:'bullet', projV:22, score:70,  muzzleOffY:1.0 },
    shotgun:  { hp:80,  maxHp:80,  speed:2.7, dmg:18, range:18, rate:1.1, projT:'shotgun',projV:18, score:140, muzzleOffY:1.0 },
    rocket:   { hp:120, maxHp:120, speed:2.0, dmg:40, range:28, rate:2.2, projT:'rocket', projV:14, score:200, muzzleOffY:1.1 },
  }[type] || {};

  return {
    group:g, type, alive:true,
    hp:stat.hp, maxHp:stat.maxHp,
    speed:stat.speed, dmg:stat.dmg,
    range:stat.range, rate:stat.rate,
    projT:stat.projT, projV:stat.projV,
    score:stat.score,
    atkTimer: Math.random()*stat.rate,
    animT: Math.random()*10,
    flyH: sc.flyH,
    muzzleOffY: stat.muzzleOffY || 1.0,
  };
}

// Allow bots to spawn anywhere on the map, as long as they're far from the player
const MIN_SPAWN_DIST = 18;

export function spawnBot(type, x, spawnY, z, scale = 1.0) {
  // Try to spawn anywhere in the arena, as long as far from player and not inside wall
  let px = x, pz = z;
  const testP = new BABYLON.Vector3(px, spawnY, pz);
  const tooClose = () => {
    const dx = testP.x - camera.position.x;
    const dz = testP.z - camera.position.z;
    return (dx*dx + dz*dz) < MIN_SPAWN_DIST * MIN_SPAWN_DIST;
  };
  let attempts = 0;
  while ((checkWallSimple(testP, 1.3) || tooClose()) && attempts < 60) {
    // Try a random spot in the arena bounds
    px = (Math.random() - 0.5) * 84; // ARENA_W - margin
    pz = (Math.random() - 0.5) * 84; // ARENA_D - margin
    testP.set(px, spawnY, pz);
    attempts++;
  }
  const e = buildRobot(type);
  e.hp     = Math.round(e.hp     * scale);
  e.maxHp  = Math.round(e.maxHp  * scale);
  e.dmg    = Math.round(e.dmg    * scale);
  e.speed  = e.speed * (0.85 + 0.15 * Math.min(scale, 2.0));
  e.group.position.set(px, spawnY + (e.flyH > 0 ? e.flyH : 0), pz);
  enemies.push(e);
  rebuildMeshMap();
}

export function hitRobot(e, dmg) {
  if (!e.alive) return;
  e.hp -= dmg;
  if (cb.showHitMarker) cb.showHitMarker();
  sfx.hit();
  if (e.hp <= 0) destroyRobot(e);
}

export function destroyRobot(e) {
  e.alive = false;
  const pos = e.group.position.clone().add(new BABYLON.Vector3(0, 1, 0));
  spawnSparks(pos, 0xff8844, 16);
  sfx.robotDie();
  // Dispose all child meshes, then the root node
  e.group.getChildMeshes().forEach(m => m.dispose());
  e.group.dispose();
  rebuildMeshMap();
  player.score += e.score;
  const names = {
    scout:'Scout destroyed!',
    heavy:'Heavy down!',
    sniper:'Sniper eliminated!',
    drone:'Drone shot down!',
    pistol:'Pistol bot down!',
    shotgun:'Shotgunner destroyed!',
    rocket:'Rocket bot destroyed!'
  };
  const feed = document.getElementById('killFeed');
  if (feed) { feed.textContent = names[e.type]||'Robot destroyed!'; clearTimeout(feed._t); feed._t = setTimeout(()=>feed.textContent='',2200); }
  import('./pickups.js').then(({ spawnPickup, spawnWeaponDrop }) => {
    if (Math.random() < .45) spawnPickup(pos);
    const dropWep = ROBOT_DROPS[e.type];
    if (dropWep) spawnWeaponDrop(pos, dropWep);
  });
  cb.markHudDirty && cb.markHudDirty();
}

const _ePP     = new BABYLON.Vector3();
const _eMuzzle = new BABYLON.Vector3();
const _eDir    = new BABYLON.Vector3();
const _eSep    = new BABYLON.Vector3();
const _eLookAt = new BABYLON.Vector3();

export function updateEnemies(dt) {
  _ePP.copyFrom(camera.position);
  for (const e of enemies) {
    if (!e.alive) continue;
    e.animT += dt;
    if (e.flyH > 0) e.group.position.y = e.flyH + Math.sin(e.animT*1.9)*.18;
    else             e.group.position.y = Math.abs(Math.sin(e.animT*5.8))*.04;

    const dist   = BABYLON.Vector3.Distance(e.group.position, _ePP);
    const inRange    = dist < e.range;
    const targetDist = e.type==='sniper' ? 20 : 2.8;

    // Dynamic speed: move faster the further away from the player
    // Clamp min 1.0x, max 2.5x base speed for distant bots
    let speedBoost = 1.0 + Math.min(1.5, Math.max(0, (dist-8) * 0.07));
    let moveSpeed = e.speed * speedBoost;

    // Always move toward the player if not at target distance
    if (dist > targetDist + .5 || dist < targetDist - 1.5) {
      _eDir.copyFrom(_ePP).subtractInPlace(e.group.position);
      if (e.flyH===0) _eDir.y = 0;
      _eDir.normalize();
      for (const o of enemies) {
        if (o===e || !o.alive) continue;
        _eSep.copyFrom(e.group.position).subtractInPlace(o.group.position);
        const sl = _eSep.length();
        if (sl < 1.8) _eDir.addInPlace(_eSep.normalize().scaleInPlace(1.1));
      }
      _eDir.normalize();
      const sx = _eDir.x*moveSpeed*dt, sz = _eDir.z*moveSpeed*dt;
      if (e.flyH===0) {
        _eSep.set(e.group.position.x+sx, 0, e.group.position.z);
        if (!checkWallSimple(_eSep, .72)) e.group.position.x += sx;
        _eSep.set(e.group.position.x, 0, e.group.position.z+sz);
        if (!checkWallSimple(_eSep, .72)) e.group.position.z += sz;
      } else {
        _eSep.set(e.group.position.x+sx, 0, e.group.position.z+sz);
        if (!checkWallSimple(_eSep, .72)) { e.group.position.x+=sx; e.group.position.z+=sz; }
      }
    }
    _eLookAt.set(_ePP.x, e.group.position.y, _ePP.z);
    e.group.lookAt(_eLookAt);

    if (inRange) {
      e.atkTimer -= dt;
      if (e.atkTimer <= 0) {
        e.atkTimer = e.rate;
        _eMuzzle.set(e.group.position.x, e.group.position.y + e.muzzleOffY, e.group.position.z);
        const shootDir = _ePP.subtract(_eMuzzle).normalize();
        const spread = { scout:.065, heavy:.1, sniper:.012, drone:.07 }[e.type] || .07;
        shootDir.x += (Math.random()-.5)*spread;
        shootDir.y += (Math.random()-.5)*spread;
        shootDir.normalize();
        fireEnemyShot(e, shootDir, e.dmg, e.projV, e.projT);
      }
    }
  }
}
