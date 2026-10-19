// mapManager.js – unified configuration for all maps
import { profile } from './progression.js';
import { player } from './gameState.js';
import { TIER_1, TIER_2, TIER_3, TIER_4, TIER_5, TIER_6 } from './constants.js';

const BABYLON = window.BABYLON;

// ── Helper to warn about missing entries ──
const _warnedMissingMapData = new Set();
import { getMapMarkers } from './mapLayoutStore.js';
import { canUnlockNightmare } from './hardModeRules.js';
import { loadMapCatalog } from './mapCatalog.js';

export function resolveMapData(table, mapId, fallbackId = 'scrapyard', tableName = 'map data') {
  if (table[mapId] !== undefined) return table[mapId];
  const warnKey = tableName + ':' + mapId;
  if (MAP_CONFIG[mapId] && !_warnedMissingMapData.has(warnKey)) {
    _warnedMissingMapData.add(warnKey);
    console.warn(`[mapManager] ${tableName} has no entry for map "${mapId}" — falling back to "${fallbackId}".`);
  }
  return table[fallbackId];
}

// ── Unified Map Configuration ────────────────────────────────
export const MAP_CONFIG = {
  scrapyard: {
    meta: {
      id: 'scrapyard',
      teamSize: 4, supportedModes: ['survival','tdm','ffa','gunGame'],
      name: 'SCRAPYARD', icon: '🏭',
      desc: 'Multi-tiered industrial arena. Vertical combat across 5 floors.',
      levelModule: './level.js', buildFn: 'buildLevel',
      spawn: { x: -19, yOffset: 0, z: -12 },
      unlockHint: null,
    },
    wave: {
      botPool: ['scout','drone','heavy','sniper','pistol','shotgun','rocket','grenadier','dmr_bot','burst_bot', 'ninja'],
      bossPool: ['rocket','burst_bot','sniper','dmr_bot'],
      hardPool: ['electron_bot', 'ion_sniper', 'drone', 'armored', 'ninja'],
      fixed: {
        1:  [{ type:'scout', count:2 }],
        2:  [{ type:'scout', count:3 }],
        3:  [{ type:'scout', count:3 }, { type:'drone', count:1 }],
        4:  [{ type:'scout', count:4 }, { type:'drone', count:2 }],
        5:  [{ type:'scout', count:4 }, { type:'drone', count:1 }, { type:'heavy', count:1 }],
        6:  [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:1 }, { type:'ninja', count:2 }],
        7:  [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:1 }],
        8:  [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:2 }, { type:'dmr_bot', count:1 }],
        9:  [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:2 }, { type:'dmr_bot', count:1 }, { type:'burst_bot', count:1 } ],
        11: [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:1 },{ type:'burst_bot', count:1 }],
        12: [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:1 },{ type:'burst_bot', count:1 }],
        13: [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:2 }, { type:'rocket', count:1 },{ type:'burst_bot', count:1 }],
        14: [{ type:'scout', count:3 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'ninja', count:3 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:2 }, { type:'rocket', count:1 }, { type:'grenadier', count:1 },{ type:'burst_bot', count:1 }],
      },
      budgetMultiplier: 1.0,
      spawns: [
        [ 14,  7, 44], [  8,  7, 44], [ 20,  7, 44], [ -25, 7, -44], [ -22, 7, -40],
        [ 34,  3,-18], [ -40, 2.5, 26],
        [ 26,  0, 18], [ 22,  0, 12], [ 28,  0,  6], [ 20, 0, 20],
        [ -30, 0,-26], [ -26, 0,-22], [ -14, 0,-28], [ -24, 0,-12],
        [ 34,  0,-34], [ 38, 0,-16], [ -44, 0, 24], [ -36, 0, 28],
        [ -4,  0, 18], [  4, 0, 18], [ 0, 0, 20], [ 8, 0, 0], [ 12, 0, 6],
        [ -9,-1.5, -4], [ 8,-1.5, 4], [ 0,-1.5, -6],
      ],
    },
    secretKits: () => [
      { tag: 'secret_health', type: 'secret_health', pos: new BABYLON.Vector3(-3, TIER_5 + 0.22 + 1.0, 22) },
      { tag: 'secret_armor',  type: 'secret_armor',  pos: new BABYLON.Vector3( 3, TIER_5 + 0.22 + 1.0, 22) },
    ],
    weaponSpawns: () => {
      const T1 = TIER_1 + 0.77, T2 = TIER_2 + 0.77, T3 = TIER_3 + 0.77, T5 = TIER_5 + 0.77;
      const CEIL_TOP = TIER_5 + 12.18;
      const spawns = [
        { wName: 'SHOTGUN',     x:  -5,  y: T1, z:   0 },
        { wName: 'SHOTGUN',     x:   5,  y: T1, z:   0 },
        { wName: 'COMET', x: -38,  y: T2, z:  38 }, // Replaced Plasma
        { wName: 'DMR',         x:  38,  y: T2, z: -38 }, // Replaced Plasma
        { wName: 'CHAINGUN',    x: -30,  y: T3, z:   0 },
        { wName: 'COMET', x:  30,  y: T3, z:   0 }, // Replaced Electron
        { wName: 'RAILGUN',     x:   0,  y: T5, z: -30 }, // Replaced Ion
        { wName: 'GLAUNCHER',   x:   0,  y: T5, z:  -9 },
        { wName: 'ROCKET',      x:   0,  y: CEIL_TOP, z: 0 },
      ];
      if (player.hardMode) {
        spawns.push(
          { wName: 'PLASMA',   x: -36,  y: T2, z:  30 },
          { wName: 'ELECTRON', x:  30,  y: T3, z:  10 },
          { wName: 'ION',      x:  10,  y: T5, z: -30 }
        );
      }
      return spawns;
    },
    walkableSpawns: [
      [-30, 0,  30], [ 30, 0,  30], [-30, 0, -30], [ 30, 0, -30], 
      [-22, 0,   0], [ 22, 0,   0], [  0, 0,  26], [  0, 0, -26],
      [-34, 6,  34], [ 34, 6,  34], [-34, 6, -34], [ 34, 6, -34],
      [  0, 12,  38], [-18, 12,  38], [ 18, 12,  38],
      [  0, 12, -38], [-18, 12, -38], [ 18, 12, -38],
      [-36, 12,  10], [-36, 12, -10],
      [ 36, 12,  10], [ 36, 12, -10],
      [ 0, 18,  20], [ 0, 18,  8], [ 0, 18, -8], [ 0, 18, -20],
    ],
  },
  jungle: {
    meta: {
      id: 'jungle',
      teamSize: 4, supportedModes: ['survival','tdm','ffa','gunGame'], name: 'TEMPLE RUINS', icon: '🌴',
      desc: 'Ancient jungle temple. Lava rivers, moving platforms, and destructible ruins.',
      levelModule: './levelJungle.js', buildFn: 'buildJungleLevel',
      spawn: { x: 15, yOffset: 1, z: -55 },
      // The deepest Jungle chamber is at y=-45; do not reset mid-dungeon.
      fallResetY: -58,
      unlockHint: 'Defeat a Boss in Scrapyard',
    },
    wave: { 
      botPool: ['scout','drone','heavy','sniper','shotgun','rocket','medic_bot','shield_bot','teleport_bot','swarm_host'], 
      bossPool: ['medic_bot','shield_bot','teleport_bot','swarm_host'], 
      fixed: {
        1:  [{ type:'swarm_host', count:2 }],
        2:  [{ type:'swarm_host', count:2 }, { type:'medic_bot', count:2 }],
        3:  [{ type:'teleport_bot', count:3 }, { type:'ninja', count:3 }],
        4:  [{ type:'teleport_bot', count:2 }, { type:'ninja', count:2 }, {type:'medic_bot', count:2 }, {type:'shield_bot', count:2 }],
      },
      budgetMultiplier: 1.0, 
      spawns: [
        [-24,0,-22], [0,0,-30], [24,0,-22], [-32,0,-44], [0,0,-52], [32,0,-44],
        [-14,0,-60], [14,0,-60],
        [-24,0,22], [0,0,34], [24,0,22], [-32,0,44], [0,0,52], [32,0,44],
        [-25,3.5,-22], [25,3.5,-22], [-25,3.5,22], [25,3.5,22],
        // Avoid the M1→M2 ramp opening at x=0,z=26.
        [12,-6,26], [0,-6,-26], [-20,-6,0], [20,-6,0], [0,-6,0],
        // Each deeper location has a physical floor and a ramp route up.
        [0,-12,57], [0,-12,47], [-24,-28,37], [23,-28,-40],
        [-20,-43,52], [22,-43,52],
      ],
    },
    secretKits: () => [
      { tag: 'secret_health', type: 'secret_health', pos: new BABYLON.Vector3(-25, 5.77 + 1.0, 30) },
      { tag: 'secret_armor',  type: 'secret_armor',  pos: new BABYLON.Vector3( 25, 5.77 + 1.0, 30) },
    ],
    weaponSpawns: () => [ 
      { wName: 'SMG',        x: -10, y: 0, z:  10 },
      { wName: 'SMG',        x:  10, y: 0, z: -10 },
      { wName: 'SHOTGUN',    x: -20, y: 0, z:  20 },
      { wName: 'SHOTGUN',    x:  20, y: 0, z: -20 },
      { wName: 'PISTOL',     x:   0, y: 0, z:   0 }, 
      { wName: 'PLASMA',     x: -25, y: 3.5, z:  22 },
      { wName: 'PLASMA',     x:  25, y: 3.5, z: -22 },
      { wName: 'CHAINGUN',   x:   0, y: 3.5, z:  38 },
      { wName: 'FLAMETHROWER', x: -10, y: -15, z:  26 },
      { wName: 'TESLA',        x:  10, y: -15, z: -26 },
      { wName: 'RAILGUN',      x:   0, y: -15, z:   0 },
      { wName: 'CROSSBOW',     x:   0, y: -30, z:  57 },
      { wName: 'ROCKET',       x:   0, y: -30, z:  47 },
      { wName: 'GLAUNCHER',    x:  28, y: -45, z:  57 },
    ],
    walkableSpawns: [
      // Surface and raised ruins
      [-34,0,34],[34,0,34],[-34,0,-34],[34,0,-34],
      [-14,0,0],[14,0,0],[0,0,-24],[0,0,24],
      [-24,5,24],[24,5,24],[-24,5,-24],[24,5,-24],
      // Underground floors (M1, M2, M3, M4).
      [-20,-6,-20],[20,-6,22],[-42,-6,0],[42,-6,0],
      [-20,-13,25],[20,-13,-25],[0,-13,-35],[0,-13,50],
      [-22,-28,42],[20,-28,-40],[0,-28,-53],
      [-20,-43,53],[20,-43,53],[0,-43,-35],
    ],
  },
  city: {
    meta: {
      id: 'city',
      teamSize: 6, supportedModes: ['survival','tdm','ffa','gunGame'], name: 'ROOFTOP CITY', icon: '🏙️',
      desc: 'Glass skyscrapers and ziplines. Fight from street to penthouse.',
      levelModule: './levelCity.js', buildFn: 'buildCityLevel',
      spawn: { x: -18, yOffset: 0, z: -10 },
      unlockHint: 'Deal 50K Damage with Flamethrower',
    },
    wave: { 
      botPool: ['pistol','sniper','rocket','grenadier','drone','ninja','rivet_bot','enforcer','tactician'], 
      bossPool: ['tactician','sniper','rivet_bot','enforcer'], 
      fixed: {
        1:  [{ type:'rivet_bot', count:2 }, {type:'sniper', count:2 }],
        2:  [{ type:'rivet_bot', count:3 }, { type:'enforcer', count:3 }],
        3:  [{ type:'rivet_bot', count:2 }, { type:'enforcer', count:2 }, { type:'sniper', count:2 }, { type:'ninja', count:2 }],
        4:  [{ type:'rivet_bot', count:2 }, { type:'enforcer', count:2 }, { type:'sniper', count:2 }, { type:'ninja', count:2 }, { type:'tactician', count:2 }],   
      },
      budgetMultiplier: 1.8,
      spawns: [
        [ 0, 9.5, 0],   // centre hub roof
        [ 36, 17.5, -36], [ -36, 17.5, 36], [ 36, 17.5, 36], [ -36, 17.5, -36],
        [ 0, 13.5, 44], [ 0, 13.5, -44], [ 44, 13.5, 0], [ -44, 13.5, 0],
        [ 20, 1.5, 44], [ -20, 1.5, -44], [ 44, 1.5, 20], [ -44, 1.5, -20],
        [ 70, 1.5, 0], [ -70, 1.5, 0], [ 0, 1.5, 70], [ 0, 1.5, -70],
        [ 30, 1.5, 30], [ -30, 1.5, -30], [ 30, 1.5, -30], [ -30, 1.5, 30],
      ], 
    },
    secretKits: () => [
      { tag: 'city_health', type: 'secret_health', pos: new BABYLON.Vector3(-1.5, 8 + 0.22 + 1.0, 0) },
      { tag: 'city_armor',  type: 'secret_armor',  pos: new BABYLON.Vector3( 1.5, 8 + 0.22 + 1.0, 0) },
      { tag: 'city_ammo',   type: 'secret_ammo',   pos: new BABYLON.Vector3( 0,   8 + 0.22 + 1.0, 2.5) },
    ],
    weaponSpawns: () => [ 
      { wName: 'SMG',       x:  -8, y: 1.5, z:  -8 },
      { wName: 'PHALANX',   x:   8, y: 1.5, z:   8 },
      { wName: 'PLASMA',    x:   0, y: 1.5, z: -22 },
      { wName: 'SMG',       x: -22, y: 1.5, z:   0 },
      { wName: 'RIVETER',   x:   8, y: 1.5, z:  -8 },
      { wName: 'RIVETER',   x:  44, y: 1.5, z: -20 },
      { wName: 'RAILGUN',  x: -44, y: 1.5, z:  20 },
      { wName: 'PLASMA',    x:  20, y: 1.5, z:  44 },
      { wName: 'SMG',       x: -20, y: 1.5, z: -44 },
      { wName: 'PHALANX',   x:  44, y: 1.5, z:  20 },
      { wName: 'AEGIS',   x: -70, y: 1.5, z: -30 },
      { wName: 'RAILGUN',  x:  70, y: 1.5, z:  30 },
      { wName: 'PLASMA',    x: -30, y: 1.5, z:  70 },
      { wName: 'SMG',       x:  30, y: 1.5, z: -70 },
      { wName: 'AEGIS',     x: -70, y: 1.5, z:  30 },
      { wName: 'RAILGUN',  x:   0, y: 9.5, z:   0 },
      { wName: 'RAILGUN',   x:  36, y: 17.5, z: -36 },
      { wName: 'ELECTRON',  x:  36, y: 17.5, z:  36 },
      { wName: 'GLAUNCHER', x: -36, y: 13.5, z:  36 },
      { wName: 'ROCKET',    x: -36, y: 21.5, z: -36 },
      { wName: 'ION',       x: -34, y: 21.5, z: -34 },
      { wName: 'ELECTRON',  x: -60, y: 13.5, z:   0 },
      { wName: 'RAILGUN',   x:   0, y: 17.5, z: -60 },
      { wName: 'GLAUNCHER', x:  60, y: 13.5, z:   0 },
      { wName: 'ROCKET',    x: -80, y: 21.5, z: -80 },
      { wName: 'ION',       x:  80, y: 17.5, z: -80 },
      { wName: 'RAILGUN',   x:   0, y: 17.5, z: -80 },
      { wName: 'ELECTRON',  x: -80, y: 17.5, z:  80 },
      { wName: 'GLAUNCHER', x:  80, y: 13.5, z:  80 },
    ],
    walkableSpawns: [ 
      [-18,0,-10],[18,0,-10],[-18,0,10],[18,0,10],
      [0,0,-28],[0,0,28],[-28,0,0],[28,0,0],
      [-50,0,-10],[50,0,10],[0,0,-50],[0,0,50],
      [-50,0,10],[50,0,-10],
      [-80,0,-30],[80,0,30],[-30,0,-80],[30,0,80],
      [-80,0,30],[80,0,-30],[-30,0,80],[30,0,-80],
      [-36,20+1,-36],[36,16+1,-36],[36,16+1,36],[-36,12+1,36],[0,8+1,0],
      [-60,12+1,0],[60,12+1,0],[0,16+1,-60],[0,12+1,60],
      [-80,20+1,-80],[80,16+1,-80],[80,12+1,80],[-80,16+1,80],
      [-80,12+1,0],[80,12+1,0],[0,16+1,-80],[0,12+1,80],
    ],
  },
  terminal: {
    meta: {
      id: 'terminal',
      teamSize: 4, supportedModes: ['survival','tdm','ffa','gunGame'], name: 'MOON BASE', icon: '🌙',
      desc: 'Futuristic space arena.',
      levelModule: './levelTerminal.js', buildFn: 'buildTerminalLevel',
      spawn: { x: -19, yOffset: 0, z: -12 },
      unlockHint: 'Achieve a 20‑kill combo',
      gravityMult: 0.55,
    },
    wave: {
      botPool: ['medic_bot','shield_bot','teleport_bot','swarm_host','electron_bot', 'ion_sniper', 'armored', 'ninja'],
      bossPool: ['medic_bot','swarm_host', 'electron_bot', 'ion_sniper'],
      budgetMultiplier: 1.0,
      fixed:{},
      spawns: [
        [0, 0, 0],
        //[-20, 0, -10], [20, 0, -10], [-20, 0, 10], [20, 0, 10],
        //[0, 0, -16], [0, 0, 16], [-15, 0, 0], [15, 0, 0], [0, 0, 0],
        //[-20, 6, -16], [20, 6, -16], [-20, 6, 16], [20, 6, 16]
      ],
    },
    secretKits: () => [
      { tag: 'secret_health', type: 'secret_health', pos: new BABYLON.Vector3(-15, 6.22 + 1.0, -16) },
      { tag: 'secret_armor',  type: 'secret_armor',  pos: new BABYLON.Vector3( 15, 6.22 + 1.0, -16) },
    ],
    weaponSpawns: () => [
      { wName: 'FLAMETHROWER',   x:  40, y: 20.77, z:  30 },
      { wName: 'FLAMETHROWER',   x: -40, y: 20.77, z:  30 },
      { wName: 'PLASMA',    x:  40, y: 20.77, z: -30 },
      { wName: 'TESLA',  x: -40, y: 20.77, z: -30 },
      { wName: 'ION',    x:   0, y: 32.77, z:   0 },
      { wName: 'ION',       x:  30, y: 28.77, z:   0 },
      { wName: 'ELECTRON',  x: -30, y: 28.77, z:   0 },
      { wName: 'TESLA',       x:   0, y: 28.77, z:  25 },
      { wName: 'ELECTRON', x:   0, y: 28.77, z: -25 },
    ],
    walkableSpawns: [ 
      [-20, 0, -10], [20, 0, -10], [-20, 0, 10], [20, 0, 10],
      [0, 0, -16], [0, 0, 16], [-15, 0, 0], [15, 0, 0], [0, 0, 0],
      [-20, 6, -16], [20, 6, -16], [-20, 6, 16], [20, 6, 16],
    ],
  },
};

// Community maps use one catalog entry plus one map document and the same
// generic builder. Existing built-in configurations remain unchanged.
export async function registerCommunityMaps(){
  const entries=await loadMapCatalog();
  for(const item of entries){
    if(MAP_CONFIG[item.id])throw Error('Map ID collision: '+item.id);
    const meta={
      ...item,id:item.id,unlockHint:null,
      levelModule:'./levelCommunity.js',buildFn:'buildCommunityLevel',
    };
    MAP_CONFIG[item.id]={
      meta,
      wave:{
        botPool:['scout','drone','heavy','shotgun','sniper'],
        bossPool:['rocket','sniper'],
        hardPool:['electron_bot','ion_sniper'],
        budgetMultiplier:1,
        fixed:{},
        spawns:[[item.spawn.x,item.spawn.yOffset,item.spawn.z]],
      },
      secretKits:()=>[],
      weaponSpawns:()=>[],
      walkableSpawns:[[item.spawn.x,item.spawn.yOffset,item.spawn.z]],
    };
    MAPS[item.id]=meta;
  }
  return entries.map(m=>m.id);
}

// ── Helper getters ────────────────────────────────────────────
export function getMapMeta(mapId) {
  const meta=resolveMapData(MAP_CONFIG,mapId,'scrapyard','map meta').meta;
  const sp=getMapMarkers(mapId,'playerSpawn')[0];
  return sp?{...meta,spawn:{x:sp.position.x,yOffset:sp.position.y,z:sp.position.z}}:meta;
}
export function getWaveConfig(mapId) {
  const wave=resolveMapData(MAP_CONFIG,mapId,'scrapyard','wave config').wave;
  const markers=getMapMarkers(mapId,'enemySpawn','survival');
  return markers.length?{...wave,spawns:markers.map(m=>[m.position.x,m.position.y,m.position.z])}:wave;
}
export function getSecretKits(mapId) {
  const cfg = resolveMapData(MAP_CONFIG, mapId, 'scrapyard', 'secret kits');
  return (cfg.secretKits || (() => []))();
}
export function getWeaponSpawns(mapId) {
  const cfg = resolveMapData(MAP_CONFIG, mapId, 'scrapyard', 'weapon spawns');
  const markers=getMapMarkers(mapId,'weaponPickup','survival');
  return markers.length?markers.map(m=>({wName:m.weapon,x:m.position.x,y:m.position.y,z:m.position.z})):(cfg.weaponSpawns || (() => []))();
}
export function isModeSupported(mapId, mode) {
  const meta = getMapMeta(mapId);
  return !!meta?.supportedModes?.includes(mode);
}
export function getRoomCapacity(mapId, mode) {
  if (mode === 'survival') return 2;
  const meta = getMapMeta(mapId);
  return Math.max(2, Math.min(24, (meta?.teamSize || 4) * 2));
}
export function getWalkableSpawns(mapId) {
  const markers=getMapMarkers(mapId,'pvpSpawn');
  return markers.length?markers.map(m=>[m.position.x,m.position.y,m.position.z]):
    resolveMapData(MAP_CONFIG,mapId,'scrapyard','walkable spawns').walkableSpawns || [];
}

// ── Unlock logic ───────────────────────────────────────────────
export function isMapUnlocked(mapId) {
  if (mapId === 'scrapyard') return true;
  const stats = profile.stats || {};
  if (mapId === 'jungle') return true;   // placeholder
  if (mapId === 'city') return true;
  if (mapId === 'terminal') return true;
  return !!MAP_CONFIG[mapId]; // Catalog-registered maps are publicly playable.
}
export function isNightmareUnlocked(mapId){
  return canUnlockNightmare(profile.stats||{},mapId);
}
export function isHardModeUnlocked(mapId) {
  const stats = profile.stats || {};
  return (stats[`bossWaveClears_${mapId}`] || 0) > 0;
}

let _currentMap = 'scrapyard';
let _levelBuilt = false;
export function getCurrentMap() { return _currentMap; }
export function setCurrentMap(mapId) { _currentMap = mapId; _levelBuilt = false; }
export function isLevelBuilt() { return _levelBuilt; }
export function markLevelBuilt() { _levelBuilt = true; }

// ── Backward compatible MAPS ──────────────────────────────────
export const MAPS = Object.fromEntries(
  Object.entries(MAP_CONFIG).map(([id, cfg]) => [id, cfg.meta])
);

// ── Build function ─────────────────────────────────────────────
export async function buildMap(mapId) {
  const meta = getMapMeta(mapId);
  const mod = await import(meta.levelModule);
  // buildXLevel() is async — it awaits an assets/maps/<mapId>.json layout
  // fetch before baking the NavMesh, so this MUST be awaited too, or
  // callers could start spawning enemies against a stale/incomplete navmesh.
  await mod[meta.buildFn](undefined,mapId);
  return {
    hazardZones:     mod.hazardZones     || [],
    movingPlatforms: mod.movingPlatforms || [],
    powerSwitches:   mod.powerSwitches   || [],
  };
}

if (!MAP_CONFIG || Object.keys(MAP_CONFIG).length === 0) {
  console.error('[mapManager] MAP_CONFIG is empty – check imports from level.js');
}