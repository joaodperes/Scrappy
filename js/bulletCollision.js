// Shared shooter collision contract, independent of Babylon scene setup.
// Glass is always bullet-permeable. Solid geometry and destructibles block.
export function blocksBullet(mesh){
  if(!mesh || mesh.isEnabled?.()===false || !mesh.checkCollisions)return false;
  const data=mesh.metadata||{};
  // The invisible collision controller sits exactly at the camera origin.
  // Ray predicates must never count it as a bullet-blocking world obstacle.
  if(mesh.name==='_playerBody' || mesh.name?.startsWith('wep_') || mesh.name?.startsWith('wm_'))return false;
  if(data.type==='glass'||data.generator==='createGlass')return false;
  if(data.enemy||data.remotePlayer)return false;
  return true;
}
export function closestBulletHit(candidates){
  const weight={barrel:0,destructible:1,wall:2,enemy:3};
  return candidates.filter(x=>x.hit?.hit===true&&Number.isFinite(x.hit.distance))
    .sort((a,b)=>(a.hit.distance-b.hit.distance)||
      ((weight[a.kind]??4)-(weight[b.kind]??4)))[0]||null;
}

// Return the first fraction (0..1) where a moving point/shot intersects a
// target sphere, or null. Unlike end-position overlap, this cannot tunnel
// through a thin target during a slow frame or fast projectile movement.
export function segmentSphereHit(start,end,center,radius){
  if(!Number.isFinite(radius)||radius<=0)return null;
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
  const ox=start.x-center.x,oy=start.y-center.y,oz=start.z-center.z;
  const a=dx*dx+dy*dy+dz*dz;
  const c=ox*ox+oy*oy+oz*oz-radius*radius;
  if(c<=0)return 0;
  if(a<1e-12)return null;
  const halfB=ox*dx+oy*dy+oz*dz;
  const disc=halfB*halfB-a*c;
  if(disc<0)return null;
  const t=(-halfB-Math.sqrt(disc))/a;
  return t>=0&&t<=1?t:null;
}
