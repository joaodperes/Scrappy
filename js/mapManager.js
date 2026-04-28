// mapManager.js – Map selection and level switching
import { profile } from './progression.js';

export function isMapUnlocked(mapId) {
  if (mapId === 'scrapyard') return true;
  if (mapId === 'jungle') {
    return profile.level >= 5; // or check a specific challenge
  }
  return false;
}

let _currentMap = 'scrapyard';
let _levelBuilt = false;

export function getCurrentMap() {
  return _currentMap;
}

export function setCurrentMap(mapId) {
  _currentMap = mapId;
  _levelBuilt = false;
}

export function isLevelBuilt() {
  return _levelBuilt;
}

export function markLevelBuilt() {
  _levelBuilt = true;
}

export const MAPS = {
  scrapyard: {
    id: 'scrapyard',
    name: 'SCRAPYARD',
    icon: '🏭',
    desc: 'Multi-tiered industrial arena. Vertical combat across 5 floors.',
    theme: 'industrial',
    weapons: ['PISTOL','SMG','SHOTGUN','CHAINGUN','RAILGUN','PLASMA','ROCKET','GLAUNCHER','ELECTRON','ION'],
    enemies: ['scout','heavy','sniper','drone','pistol','shotgun','rocket','grenadier','electron_bot','ion_sniper','ninja','armored','giantbot'],
    music: 'industrial',
  },
  jungle: {
    id: 'jungle',
    name: 'TEMPLE RUINS',
    icon: '🌴',
    desc: 'Ancient jungle temple. Lava rivers, moving platforms, and destructible ruins.',
    theme: 'jungle',
    weapons: ['PISTOL','SHOTGUN','CHAINGUN','TESLA','CROSSBOW','FLAMETHROWER','ROCKET','GLAUNCHER','PLASMA','RAILGUN'],
    enemies: ['scout','heavy','medic_bot','shield_bot','teleport_bot','swarm_host','sniper','drone','shotgun','rocket','giantbot'],
    music: 'jungle',
  },
};

// Filter weapons/enemies by map
export function getMapWeapons() {
  return MAPS[_currentMap]?.weapons || MAPS.scrapyard.weapons;
}

export function getMapEnemies() {
  return MAPS[_currentMap]?.enemies || MAPS.scrapyard.enemies;
}