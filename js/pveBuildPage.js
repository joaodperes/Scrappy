// Earned (never purchased) Survival bonuses. Called from normal Loadout.
import {profile,saveProfile} from './progression.js';
import {PVE_STAT_KEYS,PVE_EQUIPMENT,normalizedPveBuild,allocatePvePoint,
  respecPveBuild,equipPveGear,unequipPveGear,pveModifiers} from './pveStatsRules.js';

const styles={
  line:'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 14px;margin:8px 0;border:1px solid #5F6B6D;border-radius:6px;background:#323447',
  button:'padding:8px 18px;border:1px solid #15CAB6;background:#262735;color:#F8FAF7;cursor:pointer;font:12px monospace',
};
const text=(tag,value,css='')=>{
 const node=document.createElement(tag);
 node.textContent=value;
 if(css)node.style.cssText=css;
 return node;
};
function makeButton(label,disabled,callback){
 const el=text('button',label,styles.button);
 el.type='button';el.disabled=!!disabled;
 if(disabled)el.style.opacity='0.42';
 el.onclick=()=>{if(!el.disabled)callback()};
 return el;
}
// Account already persists this optional field within player_profiles/{uid}.
function saveBuild(build){
 profile.pveBuild={ranks:{...build.ranks},equipment:build.equipment};
 saveProfile();
}
export function renderPveBuild(parent){
 const build=normalizedPveBuild(profile);
 const mods=pveModifiers(build,'survival');
 parent.appendChild(text('h2','SURVIVAL STATS & EQUIPMENT',
  'font-size:20px;color:#15CAB6;margin:0 0 10px'));
 parent.appendChild(text('p',
  'Earn points from Survival boss-wave progress. Free respec. No bonus is active in arena modes, PvP or Gun Game.',
  'font-size:13px;color:#ADAEB5;line-height:1.6'));
 parent.appendChild(text('p',
  'EARNED '+build.earned+' · SPENT '+build.spent+' · AVAILABLE '+build.available,
  'font-size:15px;font-weight:bold;color:#F8FAF7'));
 const desc={
  vitality:'Max HP +5 per point',
  mobility:'Movement speed +1.2% per point',
  scavenger:'Ammo box yield +3.5% per point',
 };
 for(const key of PVE_STAT_KEYS){
  const line=text('div','',styles.line);
  const label=text('div',key.toUpperCase()+' '+build.ranks[key]+'/5 · '+desc[key],
    'font-size:13px;color:#F8FAF7');
  line.appendChild(label);
  line.appendChild(makeButton('+ ALLOCATE',build.available<=0||build.ranks[key]>=5,()=>{
    const result=allocatePvePoint(profile,key);
    if(!result.ok)return;
    saveBuild(result.build);parent.replaceChildren();renderPveBuild(parent);
  }));
  parent.appendChild(line);
 }
 parent.appendChild(text('h3','WAVE-UNLOCKED EQUIPMENT (ONE ACTIVE)',
  'font-size:16px;color:#15CAB6;margin-top:24px'));
 const maxWave=Number(profile.stats?.maxWave)||0;
 for(const [id,gear] of Object.entries(PVE_EQUIPMENT)){
  const earned=maxWave>=gear.unlocksAtWave;
  const worn=build.equipment===id;
  const line=text('div','',styles.line);
  line.appendChild(text('span',gear.label+' · '+(earned?'UNLOCKED':'Wave '+gear.unlocksAtWave+' required'),
   'font-size:13px;color:#F8FAF7'));
  line.appendChild(makeButton(worn?'UNEQUIP':earned?'EQUIP':'LOCKED',!earned,()=>{
    if(worn)saveBuild(unequipPveGear(profile));
    else{
      const result=equipPveGear(profile,id);
      if(!result.ok)return;
      saveBuild(result.build);
    }
    parent.replaceChildren();renderPveBuild(parent);
  }));
  parent.appendChild(line);
 }
 parent.appendChild(text('p',
  'SURVIVAL: '+mods.maxHp+' HP · '+Math.round(mods.speedMult*100)+
  '% speed · '+Math.round(mods.ammoDropMult*100)+'% ammo yield · '+
  mods.startingArmor+' starting armor',
  'font-size:12px;color:#ADAEB5;margin-top:20px'));
 parent.appendChild(makeButton('RESET POINTS (FREE)',build.spent===0,()=>{
  saveBuild(respecPveBuild(profile));
  parent.replaceChildren();renderPveBuild(parent);
 }));
}
