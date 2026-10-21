// Stable combat attribution for weapon challenges. A kill has TWO distinct
// dimensions: the weapon that caused it and its mechanism (direct shot,
// chain arc, poison, etc). Never infer either from a later weapon swap.
export const SPECIAL_KILL_WEAPONS=Object.freeze({
  TESLA_CHAIN:'TESLA', PHALANX_SHATTER:'PHALANX',
  THUNDERBOLT:'THUNDERBOLT', OMEGA_STORM:'OMEGA',
  FLAMETHROWER:'FLAMETHROWER', FLAME_DOT:'FLAMETHROWER',
  POISON:'CROSSBOW', AEGIS:'AEGIS',
});
const NON_WEAPON_SOURCES=new Set(['ENVIRONMENT','BARREL_EXPLOSION']);
export function resolveKillAttribution(heldWeapon,source='PLAYER',explicitWeapon=null,isExplosive=false){
  const safeSource=typeof source==='string'&&source.length<64?source:'PLAYER';
  const method=safeSource==='PLAYER'?(isExplosive?'EXPLOSION':'DIRECT'):safeSource;
  const weaponKey=NON_WEAPON_SOURCES.has(safeSource)?null:
    (SPECIAL_KILL_WEAPONS[safeSource]||explicitWeapon||heldWeapon||null);
  return {weaponKey,killMethod:method,source:safeSource};
}
