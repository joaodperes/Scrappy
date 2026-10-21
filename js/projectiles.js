// projectiles.js – rockets, plasma balls, enemy shots, collision  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M, fireTex } from './textures.js';
import { explosiveBarrels, walkableMeshes, isBarrelMesh, detonateBarrelByMesh } from './level.js';
import { WDEFS, curWep } from './weapons.js';
import { projs, enemies, player, cb } from './gameState.js';
import { spawnSparks } from './particles.js';
import { sfx } from './audio.js';
import { applyExplosionImpulse } from './player.js';
import { getCurrentMap, getMapMeta } from './mapManager.js';
import { getLoadout } from './progression.js';
import { blocksBullet, closestBulletHit, segmentSphereHit } from './bulletCollision.js';

// ── Player projectiles ────────────────────────────────────────
export function fireRocket(effSpeed, effSplash, spread = 0) {
  const fwd = new BABYLON.Vector3();
  camera.getForwardRay(1).direction.normalizeToRef(fwd);
  
  // Apply a tiny random jitter so burst rockets diverge visually
  if (spread > 0) {
      fwd.x += (Math.random() - 0.5) * spread;
      fwd.y += (Math.random() - 0.5) * spread;
      fwd.z += (Math.random() - 0.5) * spread;
      fwd.normalize();
  }

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

  projs.push({ g, light, dir: fwd.clone(), speed: effSpeed || WDEFS.ROCKET.speed, life: 6, dmg: WDEFS.ROCKET.dmg, splash: effSplash ?? WDEFS.ROCKET.splash, owner:'player', type:'rocket', weaponKey:'ROCKET' });
}

export function firePlasma(modDmg, projSpeed) {
  const fwd = new BABYLON.Vector3();
  camera.getForwardRay(1).direction.normalizeToRef(fwd);
  const pos = camera.position.clone().add(fwd.scale(.6));
  pos.y -= .1;
  const mesh = BABYLON.MeshBuilder.CreateSphere('plasma', { diameter:.2, segments:8 }, scene);
  mesh.position.copyFrom(pos);
  
  // GUARANTEE IT IS GLOWING BLUE
  const pMat = new BABYLON.StandardMaterial('pMat', scene);
  pMat.emissiveColor = new BABYLON.Color3(.27, .53, 1);
  pMat.disableLighting = true;
  mesh.material = pMat; 
  mesh.isPickable = false;
  
  const light = new BABYLON.PointLight('pLight', pos.clone(), scene);
  light.diffuse = new BABYLON.Color3(.27, .53, 1); light.intensity = 2.0; light.range = 7;
  
  const dmg = modDmg || WDEFS.PLASMA.dmg;
  projs.push({ g:null, mesh, light, dir: fwd.clone(), speed: projSpeed || WDEFS.PLASMA.speed || 40, life: 4, dmg: dmg, splash:0, owner:'player', type:'player_plasma', weaponKey:'PLASMA' });
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
export async function boom(pos, splashR, baseDmg, hurtBots, weaponKey=null) {
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
  // Destructible walls – scan all meshes for metadata.destructible
  for (const mesh of scene.meshes) {
      if (!mesh.metadata?.destructible || !mesh.isEnabled()) continue;
      const wDist = BABYLON.Vector3.Distance(pos, mesh.getAbsolutePosition());
      if (wDist < splashR) {
        const dmgToWall = baseDmg * (1 - wDist / splashR);
        mesh.metadata.hp -= dmgToWall;
        spawnSparks(mesh.getAbsolutePosition(), 0xaaaaaa, 3);
        if (mesh.metadata.hp <= 0) {
            mesh.dispose();
            const mod=await import(getMapMeta(getCurrentMap()).levelModule);
            const idx=walkableMeshes.indexOf(mesh);
            if(idx!==-1)walkableMeshes.splice(idx,1);
            walkableMeshes.forEach(m=>m.computeWorldMatrix(true));
            navPlugin.createNavMesh(walkableMeshes,mod.NAVMESH_PARAMS);
        }
      }
  }
  if (hurtBots) {
    for (const e of (cb.getDamageableActors?.()||enemies)) {
      if (!e.alive) continue;
      const d = BABYLON.Vector3.Distance(e.group.position, pos);
      if (d < splashR) cb.hitRobot?.(e,baseDmg*(1-d/splashR),false,true,
        weaponKey==='ENVIRONMENT'?'BARREL_EXPLOSION':'PLAYER',weaponKey==='ENVIRONMENT'?null:weaponKey); // isHeadshot, isExplosive
    }
  }
  const dp = BABYLON.Vector3.Distance(camera.position, pos);
  if (dp < splashR) cb.hurtPlayer && cb.hurtPlayer(baseDmg * (1 - dp/splashR) * .65);
  // We multiply splashR by 1.5 so the physics push reaches slightly further than the damage
  applyExplosionImpulse(pos, splashR * 1.5, 20);
}

// ── Hitscan ────────────────────────────────────────────────────
const _rcDir = new BABYLON.Vector3();

export function hitscan(meshToEnemy, spread = 0, dmg = 20, range = 90, falloff = 0.5,
                        flashColor = new BABYLON.Color3(1, 0.9, 0.4),
                        hitSparkColor = 0xffcc44,
                        missSparkColor = 0x886655) {
  if(cb.isPvpActive?.()){
    const hit=cb.pvpHitscan?.(dmg,range,spread) || false;
    return {hit,target:null};
  }
  camera.getForwardRay(1).direction.normalizeToRef(_rcDir);
  // Muzzle flash: bright sphere 0.5m in front
  const flashPos = camera.position.clone().addInPlace(_rcDir.scale(0.5));
  const flash = BABYLON.MeshBuilder.CreateSphere('mflash', { diameter: 0.09, segments: 4 }, scene);
  flash.position.copyFrom(flashPos);
  const fmat = new BABYLON.StandardMaterial('mflashM', scene);
  fmat.emissiveColor = flashColor;
  fmat.disableLighting = true;
  flash.material = fmat; flash.isPickable = false;
  setTimeout(() => {flash.dispose();fmat.dispose();}, 55);
  if (spread > 0) {
    _rcDir.x += (Math.random()-.5)*spread*2;
    _rcDir.y += (Math.random()-.5)*spread*2;
    _rcDir.normalize();
  }
  const ray  = new BABYLON.Ray(camera.position, _rcDir, range);
  const barrelHit = scene.pickWithRay(ray, m => m.isEnabled() && isBarrelMesh(m));
  const wallHit = scene.pickWithRay(ray, blocksBullet);
  const hits = scene.multiPickWithRay(ray, m => meshToEnemy.has(m)) || [];
  hits.sort((a,b) => a.distance - b.distance);
  const nearest=closestBulletHit([
    {kind:'barrel',hit:barrelHit},
    {kind:wallHit?.pickedMesh?.metadata?.destructible?'destructible':'wall',hit:wallHit},
    {kind:'enemy',hit:hits.length?{...hits[0],hit:true}:null},
  ]);
  const endDist=nearest?.hit.distance ?? range;
  const endPos = camera.position.clone().add(_rcDir.scale(endDist));
  
  //Use CreateTube instead of CreateLines for visible thickness
  // Plasma's sniper trigger is hitscan (there is no traveling projectile).
  // A bright persistent blue beam makes the exact aim line and impact clear.
  const plasmaSniper=curWep==='PLASMA' && !!player.plasmaAltMode;
  const isBeam = plasmaSniper || curWep === 'ELECTRON' || curWep === 'ION';
  const tracer = BABYLON.MeshBuilder.CreateTube('tracer', {
      path: [flashPos, endPos],
      radius: plasmaSniper ? 0.1 : isBeam ? 0.06 : 0.015,
      updatable: false
  }, scene);
  
  // Use emissive color for the beam to make it glow
  const tracerMat = new BABYLON.StandardMaterial('tracerMat', scene);
  tracerMat.emissiveColor = plasmaSniper ? new BABYLON.Color3(.25,.65,1) : flashColor;
  tracerMat.disableLighting = true;
  tracerMat.alpha = 0.8;
  tracer.material = tracerMat;
  tracer.isPickable = false;
  
  // Fade tracer out over ~80ms
  let fadeTimer = 0;
  const tracerLife = plasmaSniper ? 0.28 : isBeam ? 0.12 : 0.08; // Beams linger slightly longer
  const onBeforeRender = () => {
      fadeTimer += scene.getEngine().getDeltaTime() / 1000;
      tracer.material.alpha = 1.0 - (fadeTimer / tracerLife);
      if (fadeTimer >= tracerLife) {
          tracer.dispose();
          tracerMat.dispose(); // Don't forget to clean up the material
          scene.onBeforeRenderObservable.removeCallback(onBeforeRender);
      }
  };
  scene.onBeforeRenderObservable.add(onBeforeRender);

  if(nearest?.kind==='barrel'){
    const boomPos=detonateBarrelByMesh(nearest.hit.pickedMesh);
    if(boomPos){
      boom(boomPos,3.6,78,true);
      spawnSparks(boomPos,0xffaa44,9);
      return {hit:true,barrel:true};
    }
    return {hit:false,blocked:true};
  }

  // Destructible walls take damage only when they're the first obstruction.
  if(nearest?.kind==='destructible'){
      const dWallHit=nearest.hit;
      const wall = dWallHit.pickedMesh;
      // Apply damage
      wall.metadata.hp -= dmg;
      // Orange flash on hit
      if (wall.material?.emissiveColor) {
          const orig = wall.material.emissiveColor.clone();
          wall.material.emissiveColor.set(.9, .35, 0);
          setTimeout(() => { if (wall.material) wall.material.emissiveColor.copyFrom(orig); }, 110);
      }
      spawnSparks(dWallHit.pickedPoint ?? wall.getAbsolutePosition(), 0xff6600, 4);
      if (wall.metadata.hp <= 0) {
          spawnSparks(wall.getAbsolutePosition(), 0xff8800, 14);
          wall.dispose();
          import('./mapManager.js').then(({ getCurrentMap }) => {
              const map = getCurrentMap();
              const mapPromise = map === 'jungle' ? import('./levelJungle.js') : import('./level.js');
              mapPromise.then(levelModule => {
                  const idx = levelModule.walkableMeshes.indexOf(wall);
                  if (idx !== -1) levelModule.walkableMeshes.splice(idx, 1);
                  import('./scene.js').then(({ navPlugin }) => {
                      navPlugin.createNavMesh(levelModule.walkableMeshes, levelModule.NAVMESH_PARAMS);
                  });
              });
          });
      }
      return { hit: true, destructible: true };
  }

  if(nearest?.kind==='wall'){
    spawnSparks(nearest.hit.pickedPoint ?? endPos,missSparkColor,3);
    return {hit:false,blocked:true};
  }
  if (nearest?.kind==='enemy') {
    spawnSparks(hits[0].pickedPoint, hitSparkColor, 5);
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
          // Replace global multiplier with weapon specific multiplier
          const weaponDef = WDEFS[curWep];
          locMult = isHeadshot ? (weaponDef?.headshotMult || 1.5) : 1.0;
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
  spawnSparks(miss, missSparkColor, 2);
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
      if (p.fuse === undefined)   p.fuse   = 1.5;  // fireEnemyShot() never sets this
      if (p.splash === undefined) p.splash = 3.5;  // ditto — also fixes silent/no-damage booms
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
      const gHit = scene.pickWithRay(gRay, m => blocksBullet(m) ||
        (m.isEnabled() && m.metadata?.enemy));

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
            p.vel.scaleInPlace(0.30); // Reduced speed to minimize bouncing
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
  } else if (p.type === 'flame') {
    p.life -= dt;
    p.mesh.position.addInPlace(p.dir.scale(p.speed * dt));

    // Calculate balance modifiers on the fly
    let impactMult = 1.0;
    let dotDmg = 4; // Base DOT
    if (p.isCryo) {
        impactMult = 0.6; // 40% reduction
        dotDmg *= 0.5;       // Weaker burn
    } else if (p.isSticky) {
        impactMult = 0.8; // 20% reduction
        dotDmg *= 0.75;       // Slightly reduced burn
    }

    // ── STICKY FUEL: Check if flame hits the ground/wall ──
    if (p.isSticky) {
        const ray = new BABYLON.Ray(p.mesh.position, p.dir, p.speed * dt + 0.2);
        const pick = scene.pickWithRay(ray, m => blocksBullet(m) && m.name !== '_playerBody');
        if (pick && pick.hit) {
            const n = pick.getNormal(true);
            
            // Create a flame plane instead of a flat disc
            const patchMesh = BABYLON.MeshBuilder.CreatePlane('sticky_patch', { width: 1.5, height: 1.5 }, scene);
            patchMesh.position = pick.pickedPoint.add(n.scale(0.1));
            
            // If it hits a floor, billboard it so it stands up. If it hits a wall, plaster it against the wall.
            if (Math.abs(n.y) > 0.8) patchMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
            else patchMesh.lookAt(patchMesh.position.add(n));

            const patchMat = new BABYLON.StandardMaterial('patchMat', scene);
            patchMat.diffuseTexture = fireTex;
            patchMat.emissiveTexture = fireTex;
            patchMat.emissiveColor = new BABYLON.Color3(0.5, 0.2, 0); // Darker, oil-like fire
            patchMat.useAlphaFromDiffuseTexture = true;
            patchMat.disableLighting = true;
            patchMesh.material = patchMat;

            // Add a small light so the puddle actually casts a glow
            const patchLight = new BABYLON.PointLight('patchLight', patchMesh.position, scene);
            patchLight.diffuse = new BABYLON.Color3(1.0, 0.4, 0.0);
            patchLight.intensity = 0.8;
            patchLight.range = 4.0;

            projs.push({
                type: 'sticky_patch', mesh: patchMesh, light: patchLight,
                damage: p.dmg * impactMult,
                dotDmg: dotDmg,             
                life: 3.5, tickTimer: 0
            });

            p.mesh.dispose();
            projs.splice(i, 1);
            continue;
        }
    }

    let hitEnemy = false;
    for (const e of (cb.getDamageableActors?.()||enemies)) {
        if (!e.alive) continue;
        const bodyCy = e.group.position.y + (e.flyH > 0 ? 0.5 : 1.0);
        const ep = new BABYLON.Vector3(e.group.position.x, bodyCy, e.group.position.z);
        if (BABYLON.Vector3.Distance(p.mesh.position, ep) < 0.8) {
            
            // Apply Scaled Impact Damage
            cb.hitRobot?.(e,p.dmg*impactMult,false,false,'FLAMETHROWER','FLAMETHROWER');
            
            // Apply Scaled Burn DOT
            if (!e._flameDotted) {
                e._flameDotted = true;
                if (!e._dots) e._dots = [];
                e._dots.push({ dmg: dotDmg, remaining: 3 });
                setTimeout(() => { if (e) e._flameDotted = false; }, 500);
            }

            // Apply Cryo Effect
            if (p.isCryo) {
                e.cryoTimer = 4.0; 
            }
            
            hitEnemy = true;
            break;
        }
    }
    if (hitEnemy || p.life <= 0) {
        p.mesh.dispose();
        projs.splice(i, 1);
        continue;
    }
  } else if (p.type === 'sticky_patch') {
    // ── STICKY FUEL: AOE Damage Tick ──
    p.life -= dt;
    if (p.life <= 0) {
      if (p.light) p.light.dispose();
      p.mesh.dispose();
      projs.splice(i, 1);
      continue;
    }
    p.tickTimer -= dt;
    if (p.tickTimer <= 0) {
        p.tickTimer = 0.3; // Damage ticks every 300ms
        for (const e of (cb.getDamageableActors?.()||enemies)) {
            if (!e.alive) continue;
            if (BABYLON.Vector3.Distance(p.mesh.position, e.group.position) < 1.8) {
                cb.hitRobot?.(e, p.damage, false, false, 'FLAMETHROWER');
                if (!e._dots) e._dots = [];
                // Use the dotDmg stored when the patch was created
                e._dots.push({ dmg: p.dotDmg, remaining: 1.0 }); 
            }
        }
    }
  } else if (p.type === 'rivet') {
      p.life -= dt;
      let step = p.dir.scale(p.speed * dt);
      let destroyed = false;

      // 1. EXPLOSIVE BARREL CHECK (New!)
      for (const b of explosiveBarrels) {
          if (!b.alive) continue;
          if (BABYLON.Vector3.Distance(p.mesh.position, b.pos) < 0.8) {
              b.alive = false;
              for (const m of b.meshes) { m.setEnabled(false); m.checkCollisions = false; }
              boom(b.pos.clone(), 3.5, 70, true); // Detonate the barrel!
              destroyed = true;
              break;
          }
      }

      if (destroyed) {
          p.mesh.dispose();
          projs.splice(i, 1);
          continue; 
      }

      // 2. MAGNETIC HOMING
      if (p.isMagnetic) {
          let closest = null, minDist = 2.0; 
          for (const e of (cb.getDamageableActors?.()||enemies)) {
              if (!e.alive) continue;
              const bodyCenter = e.group.position.clone();
              bodyCenter.y += (e.flyH > 0 ? 0.5 : 1.0);
              
              const dist = BABYLON.Vector3.Distance(p.mesh.position, bodyCenter);
              if (dist < minDist) { minDist = dist; closest = e; }
          }
          if (closest) {
              const bodyCenter = closest.group.position.clone();
              bodyCenter.y += (closest.flyH > 0 ? 0.5 : 1.0);
              const toEnemy = bodyCenter.subtract(p.mesh.position).normalize();
              
              p.dir = BABYLON.Vector3.Lerp(p.dir, toEnemy, dt * 12).normalize();
              p.mesh.lookAt(p.mesh.position.clone().add(p.dir));
              step = p.dir.scale(p.speed * dt); 
          }
      }

      // 3. WALL BOUNCING
      const wallRay = new BABYLON.Ray(p.mesh.position, p.dir, step.length() + 0.2);
      const wHit = scene.pickWithRay(wallRay, blocksBullet);
      
      if (wHit?.hit) {
          if (p.bounces > 0) {
              p.bounces--;
              const normal = wHit.getNormal(true);
              const dot = BABYLON.Vector3.Dot(p.dir, normal);
              p.dir.subtractInPlace(normal.scale(2 * dot)).normalize();
              
              p.mesh.position.copyFrom(wHit.pickedPoint).addInPlace(normal.scale(0.1));
              p.mesh.lookAt(p.mesh.position.clone().add(p.dir));
              spawnSparks(wHit.pickedPoint, 0xffaa00, 6);
              
              continue; // Keep the rivet alive!
          } else {
              destroyed = true; 
          }
      } else {
          p.mesh.position.addInPlace(step);
      }

      // 4. ENEMY HIT LOGIC
      if (!destroyed) {
          for (const e of (cb.getDamageableActors?.()||enemies)) {
              if (!e.alive) continue;
              const bodyCenter = e.group.position.clone();
              bodyCenter.y += (e.flyH > 0 ? 0.5 : 1.0);
              
              if (BABYLON.Vector3.Distance(p.mesh.position, bodyCenter) < 1.2) {
                  if (p.isSuperheated) {
                      if (!e._dots) e._dots = [];
                      e._dots.push({ dmg: 15, remaining: 4.0 }); 
                      spawnSparks(bodyCenter, 0xff4400, 10);
                  } else {
                      cb.hitRobot(e,p.dmg,false,false,'PLAYER','RIVET');
                  }
                  destroyed = true; 
                  break; 
              }
          }
      }

      // 5. CLEANUP
      if (destroyed || p.life <= 0) {
          p.mesh.dispose();
          projs.splice(i, 1);
      }
      
      continue; 
  }

    // ── Linear projectiles: swept collision (no tunnelling between frames) ──
    const obj=p.g || p.mesh;
    const from=obj.position.clone();
    const step=p.dir.scale(p.speed*dt);
    const distance=step.length();
    const to=from.add(step);
    const direction=distance>1e-8?step.scale(1/distance):p.dir;
    const wallHit=distance>1e-8
      ? scene.pickWithRay(new BABYLON.Ray(from,direction,distance),blocksBullet)
      : null;
    let earliest=wallHit?.hit?{kind:'wall',t:Math.min(1,wallHit.distance/distance),point:wallHit.pickedPoint}:null;

    // Geometry and targets compete on the same segment. A wall *behind*
    // an enemy/barrel cannot steal the hit, but a wall in front blocks it.
    for(const b of explosiveBarrels){
      if(!b.alive)continue;
      const t=segmentSphereHit(from,to,b.pos,0.75);
      if(t!==null && (!earliest || t<earliest.t)){
        earliest={kind:'barrel',t,barrel:b};
      }
    }
    if(p.owner==='player' && (p.type==='rocket'||p.type==='player_plasma')){
      for(const e of (cb.getDamageableActors?.()||enemies)){
        if(!e.alive)continue;
        const center=e.group.position.clone();
        center.y+=e.flyH>0?0.5:1;
        const t=segmentSphereHit(from,to,center,p.type==='rocket'?1.6:1.1);
        if(t!==null && (!earliest || t<earliest.t))
          earliest={kind:'enemy',t,enemy:e};
      }
    }
    if(p.owner==='enemy'){
      const t=segmentSphereHit(from,to,camera.position,0.95);
      if(t!==null && (!earliest || t<earliest.t))
        earliest={kind:'player',t};
    }

    const impact=earliest?from.add(step.scale(earliest.t)):to;
    obj.position.copyFrom(impact);
    if(p.light)p.light.position.copyFrom(impact);
    let hit=false;
    if(earliest?.kind==='barrel'){
      const b=earliest.barrel;
      b.alive=false;
      for(const m of b.meshes){m.setEnabled(false);m.checkCollisions=false;}
      boom(b.pos.clone(),3.5,70,true,'ENVIRONMENT');
      hit=true;
    } else if(earliest?.kind==='enemy'){
      if(p.type==='rocket')boom(impact.clone(),p.splash,p.dmg,true,p.weaponKey||'ROCKET');
      else{
        cb.hitRobot?.(earliest.enemy,p.dmg,false,false,'PLAYER',p.weaponKey||'PLASMA');
        spawnSparks(impact.clone(),0x4488ff,8);
      }
      hit=true;
    } else if(earliest?.kind==='player'){
      cb.hurtPlayer?.(p.dmg);
      spawnSparks(impact.clone(),0xff3300,5);
      hit=true;
    } else if(earliest?.kind==='wall'){
      if(p.type==='rocket')boom(impact.clone(),p.splash,p.dmg,false);
      else spawnSparks(impact.clone(),0xffaa55,4);
      hit=true;
    }

    if(hit || p.life<=0){
      if(p.g){p.g.getChildMeshes().forEach(m=>m.dispose());p.g.dispose();}
      else if(p.mesh)p.mesh.dispose();
      if(p.light)p.light.dispose();
      projs.splice(i,1);
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

export function fireFlame(origin, dir, dmg, range) {
    const specialAtt = getLoadout('FLAMETHROWER').attachments?.special;
    const isCryo = specialAtt === 'cryo_core';
    const isSticky = specialAtt === 'sticky_fuel';

    // The base weapon range in WDEFS is 25. 
    // We create a multiplier based on the effective range vs base range.
    const rangeMult = (range || 25) / 25.0;

    const speed = 10 + Math.random() * 5;
    // Scale the lifespan of the projectile by the range multiplier
    const life = (0.18 + Math.random() * 0.12) * rangeMult;
    const mesh = BABYLON.MeshBuilder.CreatePlane('flame', { width: 0.25, height: 0.35 }, scene);
    mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    const mat = new BABYLON.StandardMaterial('flameMat', scene);
    if (isCryo) {
        mat.emissiveColor = new BABYLON.Color3(0.2, 0.6, 1.0);
    } else if (isSticky) {
        // Make Sticky fuel black/dark
        mat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        mat.emissiveColor = new BABYLON.Color3(0.0, 0.0, 0.0);
    } else {
        mat.diffuseTexture = fireTex;
        mat.emissiveTexture = fireTex;
        mat.emissiveColor = BABYLON.Color3.Black();
        mat.useAlphaFromDiffuseTexture = true;
    }
    
    mat.alpha = 1.0;
    mat.disableLighting = true;
    mesh.material = mat;
    mesh.position = origin.add(dir.scale(0.4));
    mesh.isPickable = false;

    projs.push({
        type: 'flame', mesh, dir: dir.clone(), speed, life, dmg,
        owner: 'player', splash: 0, light: null,
        isCryo, isSticky
    });
}

// Generates a jagged, glowing 3D lightning arc between two points
export function spawnLightningArc(startPos, endPos) {
    const points = [];
    const segments = 6 + Math.floor(Math.random() * 5); // 6 to 10 jagged joints
    points.push(startPos);

    const direction = endPos.subtract(startPos);
    const length = direction.length();
    direction.normalize();

    // Create jagged points along the path
    for (let i = 1; i < segments; i++) {
        const fraction = i / segments;
        const basePt = startPos.add(direction.scale(length * fraction));
        
        // Jitter peaks in the middle of the arc and pinches at the start/end
        const arcFactor = Math.sin(fraction * Math.PI); 
        
        const randomJitter = new BABYLON.Vector3(
            (Math.random() - 0.5) * 1.8,
            (Math.random() - 0.5) * 1.8,
            (Math.random() - 0.5) * 1.8
        ).scale(arcFactor);

        points.push(basePt.add(randomJitter));
    }
    points.push(endPos);

    // Create the tube (volume makes it visible and glow)
    const arcMesh = BABYLON.MeshBuilder.CreateTube('teslaArc', {
        path: points,
        radius: 0.06,           // Thick enough to see, thin enough to look like electricity
        tessellation: 3,        // Triangle tubes are computationally cheap
        updatable: false
    }, scene);

    // Make it glow cyan/blue
    const mat = new BABYLON.StandardMaterial('teslaMat', scene);
    mat.emissiveColor = new BABYLON.Color3(0.1, 0.8, 1.0); 
    mat.disableLighting = true; // Don't let shadows dull the lightning
    mat.alpha = 0.9;
    arcMesh.material = mat;

    // Lightning is fast! Destroy it after 75-125 milliseconds
    setTimeout(() => {
        arcMesh.dispose();
        mat.dispose();
    }, 75 + Math.random() * 50);
}

export function fireRivet(speed, dmg, isSuperheated, isMagnetic, bounces) {
    const fwd = new BABYLON.Vector3();
    camera.getForwardRay(1).direction.normalizeToRef(fwd);
    
    // Start slightly in front of the player
    const origin = camera.position.clone().add(fwd.scale(0.8));
    
    // Create the Rivet projectile mesh
    const mesh = BABYLON.MeshBuilder.CreateCylinder("rivet", {diameter: 0.05, height: 0.3}, scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copyFrom(origin);
    
    // Make it look like metal (or glowing orange if superheated)
    const mat = new BABYLON.StandardMaterial("rivetMat", scene);
    if (isSuperheated) {
        mat.emissiveColor = new BABYLON.Color3(1, 0.4, 0); // Glowing Orange
    } else {
        mat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4); // Grey metal
    }
    mesh.material = mat;

    // Add it to your game's projectile array so the engine tracks it
    projs.push({
        mesh: mesh,
        dir: fwd,
        speed: speed,
        dmg: dmg,
        type: 'rivet',
        bounces: bounces,
        isSuperheated: isSuperheated,
        isMagnetic: isMagnetic,
        life: 2.0 + (bounces * 0.5) // Disappears after 2 seconds
    });
}

export function createYellowEMPStunArc(startPos, endPos, scene) {
    // 1. Generate the jagged lightning path
    const segments = 6; // Number of "kinks" in the lightning arc
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
        const fraction = i / segments;
        // Find the straight-line point at this fraction
        const currentPos = BABYLON.Vector3.Lerp(startPos, endPos, fraction);
        
        // Add random jitter to the middle points to make it jagged
        if (i > 0 && i < segments) {
            const jitterAmount = 0.4; // How wild the lightning arcs out
            currentPos.x += (Math.random() - 0.5) * jitterAmount;
            currentPos.y += (Math.random() - 0.5) * jitterAmount;
            currentPos.z += (Math.random() - 0.5) * jitterAmount;
        }
        points.push(currentPos);
    }

    // 2. Create the tube (volume makes it visible and glow)
    const arcMesh = BABYLON.MeshBuilder.CreateTube('empArc', {
        path: points,
        radius: 0.05,           // Slightly thinner for sharp, intense electricity
        tessellation: 3,        // Triangle tubes are computationally cheap
        updatable: false
    }, scene);

    // 3. Make it glow intense yellow
    const mat = new BABYLON.StandardMaterial('empMat', scene);
    // RGB values: Max Red, High Green, Low Blue = Bright Yellow
    mat.emissiveColor = new BABYLON.Color3(1.0, 0.9, 0.1); 
    mat.disableLighting = true; // Don't let shadows dull the lightning
    mat.alpha = 0.9;
    arcMesh.material = mat;

    // 4. Clean up memory quickly (Lightning is fast!)
    setTimeout(() => {
        arcMesh.dispose();
        mat.dispose();
    }, 100 + Math.random() * 50); // Lasts between 100ms and 150ms
}