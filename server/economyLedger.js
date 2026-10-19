// Transactional economy *domain* (not a hosted wallet or a live shop).
// All mutations are synchronous, owner-scoped, idempotent, and require a
// trusted verifier. No client-supplied progress or localStorage balance may
// mint authoritative Scraps. Persistence/identity adapters must be added
// before connecting this code to the browser or allowing real purchases.
const MAX_BALANCE=Number.MAX_SAFE_INTEGER;
const MAX_XP=18000;
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_:-]{1,128}$/.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function validatedCatalog(entries){
  if(!Array.isArray(entries))throw Error('Expected catalog array');
  const items=new Map();
  for(const x of entries){
    if(!x||!validId(x.id)||items.has(x.id)||!integer(x.cost)||x.cost===0)
      throw Error('Invalid or duplicate shop item');
    if(x.type==='cosmetic'){
      if(!validId(x.cosmeticId))throw Error('Invalid cosmetic grant');
    }else if(x.type==='weaponXp'){
      if(!validId(x.weapon)||!integer(x.amount)||x.amount<=0||x.amount>3000)
        throw Error('Invalid weapon XP pack');
    }else throw Error('Only cosmetics and direct-use weapon XP packs are permitted');
    items.set(x.id,Object.freeze({...x}));
  }
  return items;
}
function createLedger(catalog=[],verifier=null){
  const items=validatedCatalog(catalog);
  const accounts=new Map();
  const requireUser=userId=>{
    if(!validId(userId))throw Error('Invalid authenticated user ID');
    if(!accounts.has(userId))accounts.set(userId,{balance:0,cosmetics:new Set(),
      weaponXp:new Map(),receipts:new Map()});
    return accounts.get(userId);
  };
  const snapshot=userId=>{
    const a=requireUser(userId);
    return {balance:a.balance,cosmetics:[...a.cosmetics].sort(),
      weaponXp:Object.fromEntries([...a.weaponXp].sort(([x],[y])=>x.localeCompare(y)))};
  };
  // A receiptId may represent one verified PvE quest claim, daily/weekly
  // reward or verified max-level weapon XP conversion. Never accept the
  // client as the verifier; failed proof leaves no receipt or balance change.
  const grant=(userId,receiptId,amount,proof)=>{
    const a=requireUser(userId);
    if(!validId(receiptId)||!integer(amount)||amount===0||amount>1000000)
      return {ok:false,reason:'Invalid grant'};
    if(a.receipts.has('grant:'+receiptId))
      return {...a.receipts.get('grant:'+receiptId),duplicate:true};
    if(typeof verifier!=='function'||verifier({userId,receiptId,amount,proof})!==true)
      return {ok:false,reason:'Unverified reward'};
    if(a.balance>MAX_BALANCE-amount)return {ok:false,reason:'Balance overflow'};
    a.balance+=amount;
    const result=Object.freeze({ok:true,amount,balance:a.balance});
    a.receipts.set('grant:'+receiptId,result);
    return result;
  };
  // Atomic within this single JS process. A deployed multi-instance ledger
  // MUST replace Map state with an actual database transaction.
  const purchase=(userId,requestId,itemId)=>{
    const a=requireUser(userId);
    if(!validId(requestId))return {ok:false,reason:'Invalid purchase ID'};
    if(a.receipts.has('purchase:'+requestId)){
      const prev=a.receipts.get('purchase:'+requestId);
      if(prev.itemId!==itemId)return {ok:false,reason:'Purchase ID reused for another item'};
      return {...prev,duplicate:true};
    }
    const item=items.get(itemId);
    if(!item)return {ok:false,reason:'Item unavailable'};
    if(a.balance<item.cost)return {ok:false,reason:'Insufficient Scraps'};
    if(item.type==='cosmetic'&&a.cosmetics.has(item.cosmeticId))
      return {ok:false,reason:'Cosmetic already owned'};
    a.balance-=item.cost;
    if(item.type==='cosmetic')a.cosmetics.add(item.cosmeticId);
    else a.weaponXp.set(item.weapon,Math.min(MAX_XP,
      (a.weaponXp.get(item.weapon)||0)+item.amount));
    const result=Object.freeze({ok:true,itemId,cost:item.cost,balance:a.balance});
    a.receipts.set('purchase:'+requestId,result);
    return result;
  };
  return {snapshot,grant,purchase};
}
module.exports={validatedCatalog,createLedger,MAX_XP};
