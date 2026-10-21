// Cosmetic + direct-apply XP store. Uses the existing Firebase Spark profile
// and a Firestore transaction on player_profiles/{uid}, no Cloud Functions.
import {SHOP_ITEMS} from './shopRules.js';
import {getShopSnapshot,refreshProfileShopWallet,purchaseProfileShopItem,
 WEAPON_SKINS,PLAYER_SKINS,getWeaponLevelProgress} from './progression.js';
const C={bg:'#0d1a05',panel:'#14230b',line:'#557733',accent:'#d8f030',text:'#e5f4cb',muted:'#a8c38b'};
const F='"Courier New",monospace';
let _close=null,filter='playerSkin',weapon='PISTOL',busy=false,notice='';
const el=(tag,style,text)=>{
 const n=document.createElement(tag);if(style)n.style.cssText=style;
 if(text!==undefined)n.textContent=text;return n;
};
export function hideShopPage(){
 document.getElementById('shopPage')?.remove();
 const callback=_close;_close=null;callback?.();
}
export function showShopPage(onClose){
 document.getElementById('shopPage')?.remove();
 _close=onClose;filter='playerSkin';notice='';
 const page=el('div',`position:fixed;inset:0;z-index:1100;background:${C.bg};color:${C.text};font-family:${F};display:flex;flex-direction:column`);
 page.id='shopPage';
 const header=el('div',`display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 24px;border-bottom:2px solid ${C.line}`);
 header.appendChild(el('h1',`font-size:22px;letter-spacing:3px;color:${C.accent};margin:0`,'SCRAPS SHOP'));
 const close=el('button',`padding:10px 16px;background:transparent;border:1px solid ${C.line};color:${C.accent};cursor:pointer;font:13px monospace`,'✕ BACK TO MENU');
 close.onclick=hideShopPage;header.appendChild(close);page.appendChild(header);
 const body=el('div','flex:1;overflow-y:auto;margin:0 auto;max-width:1180px;width:100%;box-sizing:border-box;padding:24px');
 body.id='shopPageContent';page.appendChild(body);document.body.appendChild(page);
 renderShopPage();
}
function rowButton(parent,label,click,selected=false){
 const button=el('button',`border:1px solid ${C.line};padding:10px 13px;background:${selected?C.accent:C.panel};color:${selected?'#102006':C.text};cursor:pointer;font:12px monospace`,label);
 button.onclick=click;parent.appendChild(button);return button;
}
export function renderShopPage(){
 const body=document.getElementById('shopPageContent');if(!body)return;
 body.replaceChildren();
 const wallet=getShopSnapshot();
 body.appendChild(el('p',`font-size:21px;font-weight:bold;color:${C.accent}`,
   'AVAILABLE SCRAPS: '+wallet.scraps));
 body.appendChild(el('p',`font-size:12px;color:${C.muted}`,
   'EARNED '+wallet.earnedScraps+'  ·  SPENT '+wallet.spentScraps));
 body.appendChild(el('p',`font-size:12px;color:${C.muted};line-height:1.55`,
   'Cosmetics never change combat statistics. Weapon XP is applied instantly to that gun, not stored as a consumable. Purchases use your existing Firebase login and a transaction; no paid backend required.'));
 if(notice)body.appendChild(el('p',`color:#f4bf67;font-size:13px`,notice));
 if(!wallet.ready){
  body.appendChild(el('p',`color:#f4bf67`,
    wallet.loggedIn?'Wallet connection unavailable. You cannot buy until it reconnects.':'Sign in with Google to use the shop.'));
  rowButton(body,'RETRY CONNECTION',async()=>{notice='';await refreshProfileShopWallet();renderShopPage()});
  return;
 }
 const tabs=el('div','display:flex;flex-wrap:wrap;gap:8px;margin:20px 0');body.appendChild(tabs);
 for(const [kind,label] of [['playerSkin','PLAYER SKINS'],['weaponSkin','WEAPON FINISHES'],['weaponXp','WEAPON XP']]){
  rowButton(tabs,label,()=>{filter=kind;notice='';renderShopPage()},filter===kind);
 }
 if(filter!=='playerSkin'){
  const line=el('div','display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px');body.appendChild(line);
  line.appendChild(el('label','font-size:12px;color:'+C.muted,'WEAPON'));
  const selector=el('select',`background:${C.panel};color:${C.text};border:1px solid ${C.line};padding:9px;font:13px monospace`);
  const weapons=[...new Set(SHOP_ITEMS.filter(i=>i.weapon).map(i=>i.weapon))];
  if(!weapons.includes(weapon))weapon=weapons[0];
  for(const w of weapons){const opt=el('option','',w);opt.value=w;selector.appendChild(opt)}
  selector.value=weapon;selector.onchange=()=>{weapon=selector.value;renderShopPage()};line.appendChild(selector);
  if(filter==='weaponXp'){
   const status=getWeaponLevelProgress(weapon);
   line.appendChild(el('span','color:'+C.muted+';font-size:12px',
     'LEVEL '+status.level+' · '+status.xp+'/18000 XP · '+
       (status.isMax?'MAXED':(18000-status.xp)+' XP TO CAP'));
  }
 }
 const list=SHOP_ITEMS.filter(item=>item.kind===filter&&(!item.weapon||item.weapon===weapon));
 const grid=el('div','display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px');body.appendChild(grid);
 for(const item of list){
  const owned=wallet.owned.includes(item.id);
  const card=el('div',`padding:17px;border:1px solid ${C.line};border-radius:6px;background:${C.panel}`);
  const skin=item.kind==='weaponSkin'?WEAPON_SKINS[item.skin]:item.kind==='playerSkin'?PLAYER_SKINS[item.skin]:null;
  if(skin){
   const color=skin.accent||skin.visor||[.4,.7,.3];
   const preview=el('div','height:35px;border-radius:4px;margin-bottom:12px;border:1px solid #455339');
   preview.style.background='rgb('+color.map(x=>Math.round(255*x)).join(',')+')';
   card.appendChild(preview);
  }
  card.appendChild(el('div','font-size:14px;font-weight:bold;color:'+C.text,item.label));
  card.appendChild(el('p','font-size:12px;color:'+C.muted,
   item.kind==='weaponXp'?'Directly adds XP to '+item.weapon:
   item.kind==='weaponSkin'?'Cosmetic finish for '+item.weapon:'Player appearance'));
  card.appendChild(el('p','font-size:13px;color:#f4bf67',item.cost+' SCRAPS'));
  const capped=item.kind==='weaponXp'&&
    getWeaponLevelProgress(item.weapon).xp+item.amount>18000;
  if(capped)card.appendChild(el('p','font-size:12px;color:#f4bf67',
    'Cannot apply full XP pack: weapon is at or near maximum.'));
  const btn=rowButton(card,owned?'✓ OWNED':busy?'PROCESSING…':'BUY',async()=>{
   if(busy||owned||capped)return;
   const description=item.kind==='weaponXp'
     ?'Apply '+item.amount+' XP directly to '+item.weapon+'?'
     :'Unlock '+item.label+'?';
   if(!window.confirm('Spend '+item.cost+' Scraps?\n'+description))return;
   busy=true;notice='';renderShopPage();
   // A unique request ID prevents accidental double-charging if retried.
   const req='shop_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,11);
   const result=await purchaseProfileShopItem(item.id,req);
   busy=false;
   notice=result.ok?(result.duplicate?'Already processed: ':'Purchased: ')+item.label:
     result.reason||'Unable to complete purchase';
   renderShopPage();
  });
  btn.disabled=busy||owned||capped||wallet.scraps<item.cost;
  if(btn.disabled)btn.style.opacity='.6';
  grid.appendChild(card);
 }
}
