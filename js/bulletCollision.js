// Shared shooter collision contract, independent of Babylon scene setup.
// Glass is always bullet-permeable. Solid geometry and destructibles block.
export function blocksBullet(mesh){
  if(!mesh || mesh.isEnabled?.()===false || !mesh.checkCollisions)return false;
  const data=mesh.metadata||{};
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
