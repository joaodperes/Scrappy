// Firebase Spark-compatible, friends-only shop rules. Economy is earned
// locally (casual anti-cheat policy), but purchases are serialized using a
// Firestore transaction on player_profiles/{uid}. The shop ledger is a
// SIBLING of "profile", not part of it: ordinary profile saves can't erase
// purchases or re-credit spent scraps.
export const SHOP_WEAPON_SKINS=Object.freeze(['patina','volt','emberfall','sunburst']);
export const SHOP_PLAYER_SKINS=Object.freeze(['scavenger','reclaimer']);
// Bound Firestore profile document growth without discarding old receipts.
// Retaining existing receipts preserves idempotency for every completed purchase.
export const MAX_SHOP_RECEIPTS=2048;
const PAINTED_WEAPONS=Object.freeze(['PISTOL','SMG','SHOTGUN','CHAINGUN','RAILGUN','ROCKET','GLAUNCHER',
 'ELECTRON','ION','PLASMA','COMET','DMR','FLAMETHROWER','TESLA','CROSSBOW','RIVETER','PHALANX','AEGIS']);
export const SHOP_ITEMS=Object.freeze([
 ...SHOP_PLAYER_SKINS.map((skin,i)=>Object.freeze({id:'player_'+skin,kind:'playerSkin',skin,label:skin.toUpperCase(),cost:175+125*i})),
 ...PAINTED_WEAPONS.flatMap((weapon,i)=>SHOP_WEAPON_SKINS.map((skin,j)=>Object.freeze({
  id:'finish_'+weapon+'_'+skin,kind:'weaponSkin',weapon,skin,label:weapon+' · '+skin.toUpperCase(),cost:105+45*j+Math.floor(i/6)*10
 }))),
 ...PAINTED_WEAPONS.map(weapon=>Object.freeze({
  id:'xp_'+weapon+'_250',kind:'weaponXp',weapon,amount:250,
  label:weapon+' · 250 XP',cost:85,
 })),
]);
const index=new Map(SHOP_ITEMS.map(item=>[item.id,item]));
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const ids=obj=>obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{};
// "__proto__" mutates a normal object's prototype rather than saving a
// receipt. Reject it so every accepted request ID has a durable own key.
const validReceiptId=id=>typeof id==='string'&&
 /^[A-Za-z0-9_-]{8,90}$/.test(id)&&id!=='__proto__';
export function normalizeShopWallet(value){
 const w=ids(value);
 const receipts={};
 for(const [key,id] of Object.entries(ids(w.receipts))){
  if(validReceiptId(key)&&index.has(id))receipts[key]=id;
 }
 const spent=valid(w.spent)?w.spent:0;
 const owned=Array.isArray(w.owned)?[...new Set(w.owned.filter(id=>index.get(id)?.kind!=='weaponXp'&&index.has(id)))]:[];
 const xpBonuses={};
 for(const weapon of PAINTED_WEAPONS){
  const n=ids(w.xpBonuses)[weapon];
  if(valid(n)&&n>0)xpBonuses[weapon]=Math.min(18000,n);
 }
 return {spent,receipts,owned,xpBonuses};
}
export function shopAvailableScraps(grossEarned,wallet){
 const gross=valid(grossEarned)?grossEarned:0;
 return Math.max(0,gross-normalizeShopWallet(wallet).spent);
}
export function purchaseShopItem(grossEarned,rawWallet,itemId,requestId,weaponXp=0){
 const wallet=normalizeShopWallet(rawWallet);
 const item=index.get(itemId);
 if(!item)return {ok:false,reason:'Unknown shop item',wallet};
 if(!validReceiptId(requestId))
   return {ok:false,reason:'Invalid transaction ID',wallet};
 if(Object.hasOwn(wallet.receipts,requestId)){
  if(wallet.receipts[requestId]!==itemId)return {ok:false,reason:'Transaction ID collision',wallet};
  return {ok:true,duplicate:true,item,wallet,balance:shopAvailableScraps(grossEarned,wallet)};
 }
 // Never evict an XP receipt: a retry after history pruning could otherwise
 // charge the user twice. Keep a bounded ledger and fail closed until a future
 // migration to a dedicated per-user receipt collection is approved.
 if(Object.keys(wallet.receipts).length>=MAX_SHOP_RECEIPTS)
   return {ok:false,reason:'Purchase history full; contact the game owner',wallet};
 if((item.kind==='playerSkin'||item.kind==='weaponSkin')&&wallet.owned.includes(itemId))
  return {ok:false,reason:'Already owned',wallet};
 if(item.kind==='weaponXp'){
  const baseline=Math.max(0,Number(weaponXp)||0);
  const current=wallet.xpBonuses[item.weapon]||0;
  if(baseline+current+item.amount>18000)return {ok:false,reason:'Weapon XP already maxed',wallet};
 }
 if(shopAvailableScraps(grossEarned,wallet)<item.cost)
  return {ok:false,reason:'Not enough Scraps',wallet};
 if(wallet.spent>Number.MAX_SAFE_INTEGER-item.cost)
  return {ok:false,reason:'Wallet limit reached',wallet};
 wallet.spent+=item.cost;
 wallet.receipts[requestId]=itemId;
 if(item.kind==='weaponXp'){
  const cap=Math.max(0,18000-Math.max(0,Number(weaponXp)||0));
  wallet.xpBonuses[item.weapon]=Math.min(cap,(wallet.xpBonuses[item.weapon]||0)+item.amount);
 }else wallet.owned.push(itemId);
 return {ok:true,item,wallet,balance:shopAvailableScraps(grossEarned,wallet)};
}
export function getShopItem(id){return index.get(id)||null}
