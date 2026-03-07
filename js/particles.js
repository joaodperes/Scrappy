// particles.js – spark pool (pre-allocated, zero GC during gameplay)  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene } from './scene.js';
import { _sparkPool } from './gameState.js';

const SPARK_POOL_SIZE = 120;

// Material cache keyed by integer colour
const _sparkMatCache = {};
function _getSparkMat(col) {
  if (!_sparkMatCache[col]) {
    const mat = new BABYLON.StandardMaterial('spark_' + col, scene);
    mat.emissiveColor = new BABYLON.Color3(((col>>16)&0xff)/255, ((col>>8)&0xff)/255, (col&0xff)/255);
    mat.disableLighting = true;
    _sparkMatCache[col] = mat;
  }
  return _sparkMatCache[col];
}

for (let i = 0; i < SPARK_POOL_SIZE; i++) {
  const sm = BABYLON.MeshBuilder.CreateSphere('spark', { diameter:.11, segments:3 }, scene);
  sm.material = _getSparkMat(0xffcc44);
  sm.setEnabled(false);
  sm.isPickable = false;
  _sparkPool.push({ mesh: sm, vel: new BABYLON.Vector3(), life: 0, active: false });
}

export function spawnSparks(pos, col, count = 6) {
  let spawned = 0;
  for (const sp of _sparkPool) {
    if (spawned >= count) break;
    if (sp.active) continue;
    sp.active = true; sp.mesh.setEnabled(true);
    sp.mesh.material = _getSparkMat(col);
    sp.mesh.position.copyFrom(pos);
    sp.vel.set((Math.random()-.5)*9, Math.random()*6+1, (Math.random()-.5)*9);
    sp.life = .35 + Math.random()*.25;
    spawned++;
  }
}

export function updateParticles(dt) {
  for (const sp of _sparkPool) {
    if (!sp.active) continue;
    sp.life -= dt; sp.vel.y -= 22 * dt;
    sp.mesh.position.addInPlace(sp.vel.scale(dt));
    if (sp.life <= 0) { sp.active = false; sp.mesh.setEnabled(false); }
  }
}
