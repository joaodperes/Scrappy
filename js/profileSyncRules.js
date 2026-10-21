// Pure, browser-independent reconciliation for two profile snapshots.
// 'base' is the cloud profile from which this browser started accumulating
// unsynced changes. A full local snapshot is NOT the source of truth.
const BLOCKED_KEYS=new Set(['__proto__','prototype','constructor']);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const NUMERIC_EARNED=new Set(['totalXp','scraps']);
function safeSum(remote,delta){
 return Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,remote)+Math.max(0,delta));
}
function mergeValue(base,local,remote,path){
 if(same(local,base))return clone(remote);
 if(same(remote,base))return clone(local);
 if(local===undefined)return clone(remote);
 if(remote===undefined)return clone(local);
 if(Array.isArray(local)&&Array.isArray(remote)){
  // Unlocks/claims are monotonic sets. Do not erase cloud additions from
  // another device when an old local snapshot is applied.
  const result=remote.map(clone),seen=new Set(result.map(x=>JSON.stringify(x)));
  for(const item of local){
   const key=JSON.stringify(item);
   if(!seen.has(key)){result.push(clone(item));seen.add(key)}
  }
  return result;
 }
 if(obj(local)&&obj(remote)){
  // Quest counters reset on their UTC daily/weekly period boundary.
  // Never carry yesterday's kills/claims into today's period.
  if(path[0]==='questProgress'&&path.length===2&&local.key!==remote.key)
   return clone((local.key||'')>(remote.key||'')?local:remote);
  const result={};
  for(const key of new Set([...Object.keys(remote),...Object.keys(local)])){
   if(BLOCKED_KEYS.has(key))continue;
   result[key]=mergeValue(base?.[key],local[key],remote[key],[...path,key]);
  }
  return result;
 }
 if(typeof local==='number'&&typeof remote==='number'&&
    Number.isFinite(local)&&Number.isFinite(remote)){
  const key=path.at(-1);
  if(key==='level'||key==='maxWave'||key==='maxWaveHard'||
     (path[0]==='stats'&&(/^maxWave/.test(key)||key==='bestStreak')))
   return Math.max(local,remote);
  if(NUMERIC_EARNED.has(path[0])&&path.length===1||
     path[0]==='stats'&&path.length>=2||
     path[0]==='questProgress'&&path.includes('metrics')){
   const previous=Number.isFinite(base)?base:0;
   return safeSum(remote,Math.max(0,local-previous));
  }
  // Config settings, equipment choices and UI state: local if changed.
  return local;
 }
 // Selection fields use local preference only if this browser changed it.
 return clone(local);
}
export function reconcileProfile(base,local,remote,{levelForXp,weaponXpCaps={}}={}){
 const merged=mergeValue(base||{},local||{},remote||{},[]);
 if(typeof merged.totalXp==='number'&&typeof levelForXp==='function')
  merged.level=levelForXp(merged.totalXp);
 if(obj(merged.stats?.weaponXp)){
  for(const [gun,amount]of Object.entries(merged.stats.weaponXp)){
   const cap=Number.isFinite(weaponXpCaps[gun])?weaponXpCaps[gun]:18000;
   merged.stats.weaponXp[gun]=Math.max(0,Math.min(cap,Math.floor(Number(amount)||0)));
  }
 }
 return merged;
}
// Legacy cached profiles predate the cloud-recovery protocol and lack a
// common baseline. Max/union only; never add unknown historic deltas.
export function importLegacyProfile(cache,cloud){
 if(!cache||!cloud||cache.firebaseUid!==cloud.firebaseUid)return clone(cloud);
 function conservative(a,b,path=[]){
  if(Array.isArray(a)&&Array.isArray(b)){
   const seen=new Set(b.map(x=>JSON.stringify(x)));
   return [...b,...a.filter(x=>!seen.has(JSON.stringify(x)))].map(clone);
  }
  if(obj(a)&&obj(b)){
   if(path[0]==='questProgress'&&path.length===2&&a.key!==b.key)
    return clone((a.key||'')>(b.key||'')?a:b);
   const out=clone(b);
   for(const [k,v]of Object.entries(a)){
    if(BLOCKED_KEYS.has(k)||k==='firebaseUid')continue;
    out[k]=conservative(v,b[k],[...path,k]);
   }
   return out;
  }
  if(typeof a==='number'&&typeof b==='number'&&
     (path[0]==='stats'||path[0]==='questProgress'||
       NUMERIC_EARNED.has(path[0])))
   return Math.max(a,b);
  return clone(b===undefined?a:b);
 }
 return conservative(cache,cloud);
}
