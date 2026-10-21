// Pure player-like bot roster planning, *not* a running bot controller.
// Server authoritative movement/combat is a separate priority-10 dependency.
const catalog=require('../assets/bot-personalities.json');
const PRESETS=Object.freeze(catalog.personalities.map(p=>Object.freeze(p)));
const ROOM_SIZES=new Set([6,10,14]);
function validPersona(p){
 return !!p && typeof p.id==='string' && /^[a-z][a-z0-9_]{2,32}$/.test(p.id) &&
   typeof p.name==='string' && p.name.length>=2 && p.name.length<=20 &&
   ['assault','defense','close','flank','precision','support',
    'demolition','control','explosives','area-denial'].includes(p.role) &&
   Number.isFinite(p.aggression)&&p.aggression>=0&&p.aggression<=1 &&
   Number.isFinite(p.aim)&&p.aim>=0&&p.aim<=1 &&
   Number.isFinite(p.reactionMs)&&p.reactionMs>=100&&p.reactionMs<=2000 &&
   Number.isFinite(p.preferredRange)&&p.preferredRange>=2&&p.preferredRange<=80 &&
   typeof p.loadout?.primary==='string' && typeof p.loadout?.secondary==='string' &&
   typeof p.skin==='string';
}
function validateBotCatalog(source=catalog){
 const errors=[];
 if(source?.version!==1||!Array.isArray(source?.personalities))return ['Expected v1 personalities array'];
 const ids=new Set();
 for(const p of source.personalities){
   if(!validPersona(p))errors.push('Invalid bot personality: '+String(p?.id));
   if(ids.has(p?.id))errors.push('Duplicate persona ID: '+p.id);
   ids.add(p?.id);
 }
 if(source.personalities.length<4)errors.push('At least four personas required');
 return errors;
}
function planBotSlots(config={},humans=[],seed=0){
 const size=Number(config.maxPlayers),mode=config.mode;
 if(!config.fillBots||!ROOM_SIZES.has(size)||!['ffa','tdm','gunGame'].includes(mode))return [];
 const humanList=Array.isArray(humans)?humans:[];
 // Clamp visible humans to the room capacity. Real ownership is decided by
 // server join/leave transactions, not by the client-supplied roster.
 const remaining=Math.max(0,size-humanList.length);
 const teamLimit=size/2;
 const counts={RED:humanList.filter(h=>h?.team==='RED').length,
               BLUE:humanList.filter(h=>h?.team==='BLUE').length};
 const offset=Math.abs(Math.trunc(Number(seed)||0))%PRESETS.length;
 const planned=[];
 for(let i=0;i<remaining;i++){
   let team=null;
   if(mode==='tdm'){
     const available=['RED','BLUE'].filter(t=>counts[t]<teamLimit);
     if(!available.length)break;
     team=available.sort((a,b)=>counts[a]-counts[b]||a.localeCompare(b))[0];
     counts[team]++;
   }
   const persona=PRESETS[(i+offset)%PRESETS.length];
   planned.push({
     id:'bot_'+String(i+1).padStart(2,'0'),
     displayName:persona.name,
     personalityId:persona.id,
     role:persona.role,
     team,
     loadout:{...persona.loadout},
     skin:persona.skin,
     aggression:persona.aggression,
     aim:persona.aim,
     reactionMs:persona.reactionMs,
     preferredRange:persona.preferredRange,
     owner:'server',
   });
 }
 return planned;
}
module.exports={PRESETS,ROOM_SIZES,validateBotCatalog,planBotSlots};
