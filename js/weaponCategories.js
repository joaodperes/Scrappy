// Weapon slot taxonomy. Gameplay behavior stays in weapons.js and player.js;
// this module only provides safe, shared classification / eligibility logic.
export const SECONDARY_WEAPONS=Object.freeze(['PISTOL']);
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
  return id==='PISTOL';
}
export function selectedSecondary(weapons,profile){
  const requested=profile?.pveSecondary||'PISTOL';
  return canUseSecondary(requested,weapons,profile)?requested:'PISTOL';
}

/**
 * Standard FFA/TDM players pick two distinct firearms. Melee belongs in its
 * own eventual slot, and boss Wonder weapons are not selectable. Gun Game's
 * Knife finale is intentionally exempt because Gun Game does not use this
 * selection function.
 */
export function isCompetitiveFirearm(id,weapons){
  if(!id || typeof id!=='string')return false;
  const def=weapons?.[id];
  return !!def && !def.melee && !def.wonderWeapon && id!=='KNIFE';
}
export function normalizeCompetitiveLoadout(slots,weapons){
  const ids=Object.keys(weapons||{}).filter(id=>isCompetitiveFirearm(id,weapons));
  const primary=isCompetitiveFirearm(slots?.primary,weapons)?slots.primary:
    (ids.includes('SMG')?'SMG':ids[0]||null);
  const secondary=isCompetitiveFirearm(slots?.secondary,weapons)&&slots.secondary!==primary
    ?slots.secondary:(ids.includes('SHOTGUN')&&primary!=='SHOTGUN'
      ?'SHOTGUN':ids.find(id=>id!==primary)||null);
  return {primary,secondary};
}
