// Pure server-authoritative combat *validation interface*.
// This is NOT wired into server.js: a live implementation needs authenticated
// player ownership, server-owned weapon/equip state, trusted collision/nav
// geometry and verified movement snapshots. It never trusts claimed damage.
//
// Using a server-supplied weapon spec keeps attack metadata and damage on
// the server. The adapter supplies true line of sight against solid map meshes.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const position=p=>p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const length=(x,y,z)=>Math.hypot(x,y,z);
function finiteSpec(spec){
  return spec&&typeof spec.id==='string'&&
    finite(spec.damage)&&spec.damage>0&&spec.damage<=500&&
    finite(spec.range)&&spec.range>0&&spec.range<=200&&
    finite(spec.cooldownMs)&&spec.cooldownMs>=50&&spec.cooldownMs<=5000;
}
function validatedHitIntent(context){
  const {shooter,victim,match,weaponSpecs,lineOfSight,nowMs}=context||{};
  const deny=reason=>({ok:false,reason});
  if(!match?.started||!finite(nowMs)||!shooter||!victim)return deny('No live match');
  if(String(shooter.id)===String(victim.id))return deny('Self hit');
  if(!position(shooter.position)||!position(victim.position))return deny('Invalid actor position');
  if(shooter.alive===false||victim.alive===false||
     shooter.hp<=0||victim.hp<=0||shooter.deadUntil>nowMs||victim.deadUntil>nowMs)
    return deny('Inactive actor');
  if(match.mode==='tdm'&&(!shooter.team||!victim.team||shooter.team===victim.team))
    return deny('Friendly or unassigned team');
  if(!['tdm','ffa','gunGame'].includes(match.mode))return deny('Not a PvP mode');
  if(typeof lineOfSight!=='function')return deny('Missing authoritative geometry');
  if(typeof weaponSpecs!=='function')return deny('Missing authoritative weapon rules');
  const weapon=shooter.equippedWeapon;
  if(!weapon||typeof weapon!=='string')return deny('No equipped weapon');
  const spec=weaponSpecs(weapon);
  if(!finiteSpec(spec)||spec.id!==weapon)return deny('Unknown weapon');
  if(match.mode==='gunGame'&&match.gunOrder?.[shooter.weaponIndex]!==weapon)
    return deny('Incorrect Gun Game weapon');
  if(match.mode!=='gunGame'&&
    (!Array.isArray(shooter.allowedWeapons)||!shooter.allowedWeapons.includes(weapon)))
    return deny('Weapon not permitted in loadout');
  if(nowMs<(shooter.lastShotAt||0)+spec.cooldownMs-1e-6)
    return deny('Weapon cooldown');
  const a=shooter.position,b=victim.position;
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  const distance=length(dx,dy,dz);
  if(distance>spec.range+1e-6||distance===0)return deny('Outside weapon range');
  // Shooter aim should be reconstructed from the server's last verified
  // movement/aim snapshot; a client-provided ray alone isn't proof.
  const forward=shooter.verifiedAim;
  if(!position(forward))return deny('No verified aim');
  const fLen=length(forward.x,forward.y,forward.z);
  if(fLen<0.9||fLen>1.1)return deny('Aim vector not normalized');
  const alignment=(forward.x*dx+forward.y*dy+forward.z*dz)/(fLen*distance);
  if(alignment<Math.cos((spec.aimToleranceDeg||6)*Math.PI/180))
    return deny('Target outside aim cone');
  try{
    if(lineOfSight(a,b,match.mapId)!==true)return deny('Target blocked');
  }catch{
    return deny('Geometry verification failed');
  }
  return {
    ok:true,
    weapon,
    damage:spec.damage,
    distance,
    nextShotAt:nowMs+spec.cooldownMs,
  };
}
module.exports={validatedHitIntent};
