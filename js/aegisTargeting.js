// Aegis smart-pistol targeting, kept independent from Babylon for testing.
// ADS acquires targets inside the cone. Acquired locks remain when the player
// moves the crosshair away. Firing, any locked target's death or weapon
// switching resets the entire lock group; walls block smart shots.
export function updateAegisLocks(previous,candidates,maxTargets,valid,canAcquire) {
  const limit=Math.max(1,Math.floor(Number(maxTargets)||3));
  const locked=[];
  for(const enemy of previous){
    if(locked.length===limit)break;
    if(!locked.includes(enemy)&&valid(enemy))locked.push(enemy);
  }
  for(const enemy of candidates){
    if(locked.length===limit)break;
    if(!locked.includes(enemy)&&valid(enemy)&&canAcquire(enemy))locked.push(enemy);
  }
  return locked;
}
export function hasDeadAegisLock(locked){
  return locked.some(enemy=>!enemy?.alive || enemy.group?.isDisposed?.());
}
export function getAegisFireTargets(locked,valid,visible) {
  return locked.filter((enemy,i)=>locked.indexOf(enemy)===i&&valid(enemy)&&visible(enemy));
}
