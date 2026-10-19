// Weapon slot taxonomy. Gameplay behavior stays in weapons.js and player.js;
// this module only provides safe, shared classification / eligibility logic.
export const SECONDARY_WEAPONS=Object.freeze(['PISTOL','AEGIS']);
export const MELEE_WEAPONS=Object.freeze(['KNIFE']);
export function getWeaponCategory(id,def={}){
  if(def.wonderWeapon)return 'wonder';
  if(def.melee || MELEE_WEAPONS.includes(id))return 'melee';
  if(SECONDARY_WEAPONS.includes(id))return 'secondary';
  return 'primary';
}
export function canUseSecondary(id,weapons,profile){
  if(!SECONDARY_WEAPONS.includes(id))return false;
  if(!weapons[id]||getWeaponCategory(id,weapons[id])!=='secondary')return false;
  if(id==='PISTOL')return true;
  return !!(profile?.discoveredWeapons?.includes(id) ||
    profile?.unlockedWeapons?.includes(id) ||
    Number(profile?.stats?.weaponXp?.[id]||0)>0);
}
export function selectedSecondary(weapons,profile){
  const requested=profile?.pveSecondary||'PISTOL';
  return canUseSecondary(requested,weapons,profile)?requested:'PISTOL';
}
