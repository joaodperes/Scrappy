// projectiles.js – rockets, plasma balls, enemy shots, collision  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';
import { explosiveBarrels, isBarrelMesh, detonateBarrelByMesh } from './level.js';
import { WDEFS } from './weapons.js';
import { projs, enemies, cb } from './gameState.js';
import { spawnSparks } from './particles.js';
import { sfx } from './audio.js';
import { applyExplosionImpulse } from './player.js';

// ── Player projectiles ────────────────────────────────────────
export function fireRocket() {
  const fwd = new BABYLON.Vector3(-Math.sin(0) * Math.cos(0), 0, 1); // overridden below
  camera.getForwardRay(1).direction.normalizeToRef(fwd);
  const pos = camera.position.clone().add(fwd.scale(.7));
  pos.y -= .12;
  const g = new BABYLON.TransformNode('rocket', scene);
  const body  = BABYLON.MeshBuilder.CreateCylinder('rBody',  { diameter:.14, height:.46, tessellation:8 }, scene);
  body.rotation.x = Math.PI/2; body.parent = g; body.material = M.rocketMat; body.isPickable = false;
  const nose  = BABYLON.MeshBuilder.CreateCylinder('rNose',  { diameterTop:0, diameterBottom:.14, height:.16, tessellation:8 }, scene);
  nose.rotation.x = -Math.PI/2; nose.position.z = -.31; nose.parent = g; nose.material = M.rocketNose; nose.isPickable = false;
  const flame = BABYLON.MeshBuilder.CreateCylinder('rFlame', { diameterTop:0, diameterBottom:.12, height:.18, tessellation:6 }, scene);
  flame.rotation.x = Math.PI/2; flame.position.z = .28; flame.parent = g; flame.material = M.orange; flame.isPickable = false;
  g.position.copyFrom(pos);
  // Orient parent to face direction
  const targetPos = pos.clone().add(fwd);
  g.lookAt(targetPos);

  const light = new BABYLON.PointLight('rLight', pos.clone(), scene);
  light.diffuse = new BABYLON.Color3(1, .4, 0); light.intensity = 2.2; light.range = 8;

  projs.push({ g, light, dir: fwd.clone(), speed: WDEFS.ROCKET.speed, life: 6, dmg: WDEFS.ROCKET.dmg, splash: WDEFS.ROCKET.splash, owner:'player', type:'rocket' });
}

export function firePlasma(modDmg) {
  const fwd = new BABYLON.Vector3();
  camera.getForwardRay(1).direction.normalizeToRef(fwd);
  const pos = camera.position.clone().add(fwd.scale(.6));
  pos.y -= .1;
  const mesh = BABYLON.MeshBuilder.CreateSphere('plasma', { diameter:.2, segments:8 }, scene);
  mesh.position.copyFrom(pos); mesh.material = M.plasmaMat; mesh.isPickable = false;
  const light = new BABYLON.PointLight('pLight', pos.clone(), scene);
  light.diffuse = new BABYLON.Color3(.27, .53, 1); light.intensity = 2.0; light.range = 7;
  
  // Use modDmg if provided, otherwise fallback to WDEFS
  const dmg = modDmg || WDEFS.PLASMA.dmg;
  projs.push({ g:null, mesh, light, dir: fwd.clone(), speed: WDEFS.PLASMA.speed || 40, life: 4, dmg: dmg, splash:0, owner:'player', type:'player_plasma' });
}

// ── Enemy shots ───────────────────────────────────────────────
const _eBulletSize = { bullet:.12, heavy:.19, sniper:.07, plasma:.14, electron:.10, ion:.08 };
const _eBulletCol  = { bullet: new BABYLON.Color3(1,.93,.27), heavy: new BABYLON.Color3(1,.53,0), sniper: new BABYLON.Color3(0,1,.8), plasma: new BABYLON.Color3(.27,.53,1), electron: new BABYLON.Color3(0,.9,1), ion: new BABYLON.Color3(.7,.1,1) };


export function fireEnemyShot(e, dir, dmg, speed, type, customStartPos = null) {
  // If a custom position (like a shoulder) is provided, use it. Otherwise, use the center muzzle.
  const startPos = customStartPos ? customStartPos.clone() : new BABYLON.Vector3(e.group.position.x, e.group.position.y + (e.muzzleOffY || 1.0), e.group.position.z);
  
  startPos.addInPlace(dir.scale(0.6)); // Push it slightly forward so it doesn't hit the bot itself
  
  const d = _eBulletSize[type] || _eBulletSize.bullet;
  const mesh = BABYLON.MeshBuilder.CreateSphere('eshot', { diameter: d*2, segments:5 }, scene);
  mesh.position.copyFrom(startPos);
  const mat = new BABYLON.StandardMaterial('eshotMat', scene);
  const col = _eBulletCol[type] || _eBulletCol.bullet;
  mat.emissiveColor = col; mat.disableLighting = true;
  mesh.material = mat; mesh.isPickable = false;
  projs.push({ g:null, mesh, light:null, dir: dir.clone(), speed, life:5, dmg, owner:'enemy', type });
}

// ── Explosion ─────────────────────────────────────────────────
export function boom(pos, splashR, baseDmg, hurtBots) {
  sfx.explosion();
  import('./progression.js').then(({ recordBarrelDestroyed }) => recordBarrelDestroyed());
  const flash = BABYLON.MeshBuilder.CreateSphere('flash', { diameter: splashR*.7*2, segments:10 }, scene);
  flash.position.copyFrom(pos);
  const fmat = new BABYLON.StandardMaterial('flashMat', scene);
  fmat.emissiveColor = new BABYLON.Color3(1, .53, 0); fmat.alpha = .8;
  flash.material = fmat; flash.isPickable = false;
  const el = new BABYLON.PointLight('boom', pos.clone(), scene);
  el.diffuse = new BABYLON.Color3(1, .47, 0); el.intensity = 10; el.range = splashR*4.5;
  setTimeout(() => { flash.dispose(); el.dispose(); }, 230);
  spawnSparks(pos, 0xff8800, 22);
  // Make explosions detonate nearby barrels (with a slight delay to allow cool chain-reactions)
  for (const b of explosiveBarrels) {
    if (!b.alive) continue;
    if (BABYLON.Vector3.Distance(pos, b.pos) < splashR * 1.2) {
      setTimeout(() => {
        if (!b.alive) return; // Prevent double-triggering
        const bPos = detonateBarrelByMesh(b.meshes[0]);
        if (bPos) boom(bPos.clone(), 3.6, 78, true);
      }, 100);
    }
  }
  if (hurtBots) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = BABYLON.Vector3.Distance(e.group.position, pos);
      if (d < splashR) cb.hitRobot && cb.hitRobot(e, baseDmg * (1 - d/splashR),false, true); // isHeadshot, isExplosive
    }
  }
  const dp = BABYLON.Vector3.Distance(camera.position, pos);
  if (dp < splashR) cb.hurtPlayer && cb.hurtPlayer(baseDmg * (1 - dp/splashR) * .65);
  // We multiply splashR by 1.5 so the physics push reaches slightly further than the damage
  applyExplosionImpulse(pos, splashR * 1.5, 20);
}

// ── Hitscan ────────────────────────────────────────────────────
const _rcDir = new BABYLON.Vector3();

export function hitscan(meshToEnemy, spread = 0, dmg = 20, range = 90, falloff = 0.5) {
  camera.getForwardRay(1).direction.normalizeToRef(_rcDir);
  // Muzzle flash: bright sphere 0.5m in front
  const flashPos = camera.position.clone().addInPlace(_rcDir.scale(0.5));
  const flash = BABYLON.MeshBuilder.CreateSphere('mflash', { diameter: 0.09, segments: 4 }, scene);
  flash.position.copyFrom(flashPos);
  const fmat = new BABYLON.StandardMaterial('mflashM', scene);
  fmat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.4); fmat.disableLighting = true;
  flash.material = fmat; flash.isPickable = false;
  setTimeout(() => flash.dispose(), 55);
  if (spread > 0) {
    _rcDir.x += (Math.random()-.5)*spread*2;
    _rcDir.y += (Math.random()-.5)*spread*2;
    _rcDir.normalize();
  }
  const ray  = new BABYLON.Ray(camera.position, _rcDir, range);
  const barrelHit = scene.pickWithRay(ray, m => m.isEnabled() && isBarrelMesh(m));
  const hits = scene.multiPickWithRay(ray, m => meshToEnemy.has(m));
  hits.sort((a,b) => a.distance - b.distance);

  if (barrelHit?.hit) {
    const enemyDist = hits.length > 0 ? hits[0].distance : Infinity;
    if (barrelHit.distance <= enemyDist) {
      const boomPos = detonateBarrelByMesh(barrelHit.pickedMesh);
      if (boomPos) {
        boom(boomPos, 3.6, 78, true);
        spawnSparks(boomPos, 0xffaa44, 9);
        return { hit: true, barrel: true };
      }
    }
  }

  if (hits.length > 0) {
    spawnSparks(hits[0].pickedPoint, 0xffcc44, 5);
    const pickedMesh = hits[0].pickedMesh;
    const e = meshToEnemy.get(pickedMesh);
    
    if (e) {
      const dist = hits[0].distance;
      const falloffStart = range * 0.4;
      let scaled = dist > falloffStart ? 1.0 - falloff * ((dist - falloffStart) / (range - falloffStart)) : 1.0;
      
      // DAMAGE MULTIPLIER LOGIC
      // For instakill-level damage (railgun = 9999), skip the leg-shot penalty
      // so it always one-shots non-boss enemies regardless of hit location.
      let locMult = 1.0;
      const mName = pickedMesh.name.toLowerCase();
      const isHeadshot = mName.includes('hd') || mName.includes('vis') || mName.includes('horn');
      if (isHeadshot) {
          locMult = 2.0; // Headshot bonus applies to all weapons
      } else if ((mName.includes('leg') || mName.includes('ft')) && dmg < 1000) {
          locMult = 0.5; // Leg penalty only for non-instakill weapons
      }

      // Special Railgun / Boss Logic
      if (dmg >= 100 && e.type === 'giantbot' && e.railgunImmune) {
        cb.hitRobot && cb.hitRobot(e, 250 * locMult, isHeadshot);
      } else {
        cb.hitRobot && cb.hitRobot(e, Math.max(dmg * scaled, dmg * 0.15) * locMult, isHeadshot);
      }

      // Power Cell: 20% chance to recover 1 railgun round on kill
      // We check hp after applying damage by listening for the alive flag change
      if (dmg >= 9000 || (e.hp !== undefined && e.hp - Math.max(dmg * scaled, dmg * 0.15) * locMult <= 0)) {
        import('./progression.js').then(({ hasPowerCell }) => {
          if (hasPowerCell() && Math.random() < 0.20) {
            import('./weapons.js').then(({ WDEFS, curWep, refreshSlotHUD }) => {
              if (curWep === 'RAILGUN') {
                WDEFS.RAILGUN.ammo = Math.min((WDEFS.RAILGUN.ammo || 0) + 1, WDEFS.RAILGUN.startAmmo);
                refreshSlotHUD();
              }
            });
          }
        });
      }

      return { hit: true, target: e };
    }
  }
  const miss = camera.position.clone().add(_rcDir.scale(Math.min(range, 40)));
  spawnSparks(miss, 0x886655, 2);
  return { hit: false };
}

// ── Update loop ───────────────────────────────────────────────
const _bodyVec = new BABYLON.Vector3();

export function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt;

    // ── GRENADE: fully self-contained physics — skip shared movement code ──
    if (p.type === 'grenade') {
      p.fuse -= dt;
      
      if (!p.vel) {
            p.vel = p.dir.scale(p.speed || 30);
        }

      // Apply gravity to velocity — tuned for a satisfying lobbed arc
      p.vel.y -= 9.8 * dt;

      const speed   = p.vel.length();
      const moveDir = speed > 0.001 ? p.vel.scale(1 / speed) : new BABYLON.Vector3(0, -1, 0);

      // ── Barrel proximity check (same radius as other projectiles) ──
      let grenadeHitBarrel = false;
      for (const b of explosiveBarrels) {
        if (!b.alive) continue;
        if (BABYLON.Vector3.Distance(p.mesh.position, b.pos) < 0.85) {
          b.alive = false;
          for (const m of b.meshes) { m.setEnabled(false); m.checkCollisions = false; }
          boom(b.pos.clone(), 3.5, 70, true);
          spawnSparks(b.pos.clone(), 0xffaa44, 10);
          p.mesh.dispose();
          if (p.light) p.light.dispose();
          projs.splice(i, 1);
          grenadeHitBarrel = true;
          break;
        }
      }
      if (grenadeHitBarrel) continue;

      // Raycast in velocity direction for collisions
      const gRay = new BABYLON.Ray(p.mesh.position, moveDir, speed * dt + 0.3);
      const gHit = scene.pickWithRay(gRay, m => m.checkCollisions && m.isEnabled());

      if (gHit?.hit) {
        if (gHit.pickedMesh.metadata?.enemy || gHit.pickedMesh.name === '_playerBody') {
          // Direct hit on enemy/player → instant explosion
          boom(p.mesh.position.clone(), p.splash, p.dmg, true);
          p.mesh.dispose();
          if (p.light) p.light.dispose();
          projs.splice(i, 1);
        } else if (isBarrelMesh(gHit.pickedMesh)) {
          // Hit an explosive barrel → chain-detonate the barrel, then the grenade too
          const bPos = detonateBarrelByMesh(gHit.pickedMesh);
          if (bPos) boom(bPos.clone(), 3.6, 78, true);
          boom(p.mesh.position.clone(), p.splash, p.dmg, true);
          p.mesh.dispose();
          if (p.light) p.light.dispose();
          projs.splice(i, 1);
        } else {
          // Wall/floor → bounce
          // Cluster grenades split into 4 bomblets on FIRST wall hit
          if (p.isCluster && !p._hasSplit) {
            p._hasSplit = true;
            const splitDmg    = p.dmg * 0.5;
            const splitSplash = p.splash * 0.55;
            const splitSpeed  = Math.max(p.vel.length() * 0.6, 6.0);
            const right = new BABYLON.Vector3(1, 0, 0);
            const up    = new BABYLON.Vector3(0, 1, 0);
            const fwd   = p.vel.clone().normalize();
            // 4 bomblets spread in a cone from impact point
            const spreadDirs = [
              fwd.add(right.scale( 0.50)).add(up.scale(0.35)).normalize(),
              fwd.add(right.scale(-0.50)).add(up.scale(0.35)).normalize(),
              fwd.add(right.scale( 0.20)).add(up.scale(0.65)).normalize(),
              fwd.add(right.scale(-0.20)).add(up.scale(0.65)).normalize(),
            ];
            for (const sd of spreadDirs) {
              fireGrenade(p.owner, p.mesh.position.clone(), sd, splitSpeed, splitDmg, splitSplash, false);
            }
            p.mesh.dispose(); if (p.light) p.light.dispose();
            projs.splice(i, 1);
          } else {
            const n   = gHit.getNormal(true);
            const dot = BABYLON.Vector3.Dot(p.vel, n);
            p.vel.subtractInPlace(n.scale(2 * dot));
            p.vel.scaleInPlace(0.65);
            p.mesh.position.copyFrom(gHit.pickedPoint).addInPlace(n.scale(0.12));
          }
        }
      } else {
        // Free-flight: advance by velocity
        p.mesh.position.addInPlace(p.vel.scale(dt));
      }

      // Track light with grenade
      if (p.light) p.light.position.copyFrom(p.mesh.position);

      // Fuse expired → explode
      if (p.fuse <= 0) {
        boom(p.mesh.position.clone(), p.splash, p.dmg, true);
        p.mesh.dispose();
        if (p.light) p.light.dispose();
        projs.splice(i, 1);
      }
      continue; // Skip all shared movement / hit code below
    }

    // ── All other projectiles: shared linear movement ─────────────
    const step = p.dir.scale(p.speed * dt);
    const obj  = p.g || p.mesh;
    obj.position.addInPlace(step);
    if (p.light) p.light.position.copyFrom(obj.position);
    let hit = false;

    // ── Check explosive barrels ───────────────────────────────
    let hitBarrel = null;
    for (const b of explosiveBarrels) {
      if (!b.alive) continue;
      if (BABYLON.Vector3.Distance(obj.position, b.pos) < 0.7) {
        hitBarrel = b;
        break;
      }
    }

    if (hitBarrel) {
      hitBarrel.alive = false;
      for (const m of hitBarrel.meshes) { m.setEnabled(false); m.checkCollisions = false; }
      boom(hitBarrel.pos.clone(), 3.5, 70, true);
      hit = true;
    } else {
      // ── Check scene collision (walls/floors) for hitscan-style projectile ─
      const wallRay = new BABYLON.Ray(obj.position.subtract(step), step.normalize(), step.length() + 0.15);
      const wHit = scene.pickWithRay(wallRay, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
      if (wHit.hit) {
        if (p.type === 'rocket') boom(obj.position.clone(), p.splash, p.dmg, false);
        else spawnSparks(obj.position.clone(), 0xffaa55, 4);
        hit = true;
      }
    }

    if (!hit) {
      if (p.owner === 'player' && p.type === 'rocket') {
        for (const e of enemies) {
          if (!e.alive) continue;
          const bodyCy = e.group.position.y + (e.flyH > 0 ? 0.5 : 1.0);
          _bodyVec.set(e.group.position.x, bodyCy, e.group.position.z);
          if (BABYLON.Vector3.Distance(obj.position, _bodyVec) < 1.6) {
            boom(obj.position.clone(), p.splash, p.dmg, true);
            hit = true; break;
          }
        }
      } else if (p.owner === 'player' && p.type === 'player_plasma') {
        for (const e of enemies) {
          if (!e.alive) continue;
          const bodyCy = e.group.position.y + (e.flyH > 0 ? 0.5 : 1.0);
          _bodyVec.set(e.group.position.x, bodyCy, e.group.position.z);
          if (BABYLON.Vector3.Distance(obj.position, _bodyVec) < 1.1) {
            cb.hitRobot && cb.hitRobot(e, p.dmg);
            spawnSparks(obj.position.clone(), 0x4488ff, 8);
            hit = true; break;
          }
        }
      } else if (p.owner === 'enemy') {
        // Check barrel hits for enemy projectiles
        let hitBarrel = false;
        for (const b of explosiveBarrels) {
            if (!b.alive) continue;
            if (BABYLON.Vector3.Distance(obj.position, b.pos) < 0.7) {
                b.alive = false;
                for (const m of b.meshes) { m.setEnabled(false); m.checkCollisions = false; }
                boom(b.pos.clone(), 3.5, 70, true);
                hitBarrel = true;
                break;
            }
        }
        if (hitBarrel) {
            hit = true;
        } else if (BABYLON.Vector3.Distance(obj.position, camera.position) < .95) {
            cb.hurtPlayer && cb.hurtPlayer(p.dmg);
            spawnSparks(obj.position.clone(), 0xff3300, 5);
            hit = true;
        }
      }
    }

    if (hit || p.life <= 0) {
      if (p.g) { p.g.getChildMeshes().forEach(m => m.dispose()); p.g.dispose(); }
      else if (p.mesh) p.mesh.dispose();
      if (p.light) p.light.dispose();
      projs.splice(i, 1);
    }
  }
}

export function fireGrenade(owner, origin, dir, speed, dmg, splash, isCluster = false) {
  const mesh = BABYLON.MeshBuilder.CreateSphere('grenade', { diameter: 0.28, segments: 6 }, scene);
  mesh.position.copyFrom(origin);

  const mat = new BABYLON.StandardMaterial('grenadeMat', scene);
  // Cluster grenades are red to distinguish them
  mat.emissiveColor = isCluster ? new BABYLON.Color3(0.9, 0.1, 0.1) : new BABYLON.Color3(0.1, 0.9, 0.1);
  mat.disableLighting = true;
  mesh.material = mat;
  mesh.isPickable = false;

  const light = new BABYLON.PointLight('grenadeLight', origin.clone(), scene);
  light.diffuse  = isCluster ? new BABYLON.Color3(1.0, 0.2, 0.2) : new BABYLON.Color3(0.2, 1.0, 0.2);
  light.intensity = 1.2;
  light.range     = 4.0;

  projs.push({
    type:      'grenade',
    mesh, light, owner, dmg, splash,
    fuse:      1.5,
    vel:       dir.scale(speed),
    life:      6.0,
    isCluster,
    _hasSplit: false,   // cluster only splits once
  });
}