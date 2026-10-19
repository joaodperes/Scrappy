// Standalone main-menu Quests destination; no nested Loadout panels.
import { getQuestBoard, claimProfileQuest } from './progression.js';

const C={
  bg:'#0d1a05',panel:'#14230b',line:'#557733',
  text:'#e5f4cb',accent:'#d8f030',dim:'#a8c38b',warn:'#f4bf67',
};
const F='"Courier New",monospace';
let _onClose=null;
const e=(tag,css,text)=>{
  const el=document.createElement(tag);
  if(css)el.style.cssText=css;
  if(text!==undefined)el.textContent=text;
  return el;
};

export function hideQuestPage(){
  document.getElementById('questPage')?.remove();
  const cb=_onClose;
  _onClose=null;
  cb?.();
}
export function showQuestPage(onClose){
  document.getElementById('questPage')?.remove();
  _onClose=onClose;
  const page=e('div',
    `position:fixed;inset:0;z-index:1100;display:flex;flex-direction:column;background:${C.bg};color:${C.text};font-family:${F}`);
  page.id='questPage';
  const top=e('div','display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 28px;border-bottom:2px solid '+C.line);
  top.appendChild(e('h1','font-size:22px;letter-spacing:3px;color:'+C.accent,'QUESTS & SCRAPS'));
  const close=e('button','background:transparent;border:1px solid '+C.line+';color:'+C.accent+';font-family:'+F+';padding:8px 14px;cursor:pointer','✕ BACK TO MENU');
  close.onclick=hideQuestPage;
  top.appendChild(close);page.appendChild(top);
  const body=e('div','flex:1;overflow-y:auto;padding:24px 28px;max-width:1100px;width:100%;margin:0 auto;box-sizing:border-box');
  body.id='questPageContent';page.appendChild(body);
  document.body.appendChild(page);
  renderQuestPage();
}
export function renderQuestPage(){
  const body=document.getElementById('questPageContent');
  if(!body)return;
  body.replaceChildren();
  const board=getQuestBoard();
  body.appendChild(e('p','font-size:20px;color:'+C.warn+';font-weight:bold;margin:0 0 12px','SCRAPS BALANCE: '+board.scraps));
  body.appendChild(e('p','font-size:12px;color:'+C.dim+';line-height:1.65;margin:0 0 20px',
    'Daily reset: 00:00 UTC · Weekly reset: Monday 00:00 UTC. Complete objectives in Survival and claim rewards here. Local Scraps are not yet a multiplayer-authoritative currency.'));
  for(const cadence of ['daily','weekly']){
    body.appendChild(e('h2','font-size:17px;color:'+C.accent+';margin:20px 0 12px',
      cadence==='daily'?'DAILY MISSIONS':'WEEKLY MISSIONS & COLLECTOR'));
    for(const q of board.quests.filter(q=>q.cadence===cadence)){
      const card=e('div','background:'+C.panel+';border:1px solid '+C.line+
        ';padding:14px 16px;margin:9px 0;border-radius:5px;display:flex;align-items:center;flex-wrap:wrap;gap:16px');
      const info=e('div','flex:1;min-width:220px');
      info.appendChild(e('div','font-weight:bold;color:'+C.text+';font-size:14px',q.label));
      info.appendChild(e('div','font-size:12px;color:'+C.dim+';margin-top:6px',q.desc));
      const reward=q.reward.skin
        ? 'Collector: '+q.reward.skin.toUpperCase()+' for '+q.reward.weapon+
          ' · owned duplicate: '+q.reward.duplicateScraps+' Scraps'
        : q.reward.scraps+' Scraps';
      info.appendChild(e('div','font-size:11px;color:'+C.warn+';margin-top:5px',reward));
      info.appendChild(e('div','font-size:12px;color:'+C.accent+';margin-top:8px',
        q.progress+' / '+q.target+' ('+Math.round(q.progress/q.target*100)+'%)'));
      card.appendChild(info);
      const claim=e('button','padding:10px 13px;min-width:135px;border:1px solid '+C.line+
        ';background:'+(q.complete&&!q.claimed?C.accent:'#223819')+
        ';color:'+(q.complete&&!q.claimed?'#0b1705':C.dim)+
        ';font-family:'+F+';font-size:12px;cursor:pointer',
        q.claimed?'✓ CLAIMED':q.complete?'CLAIM REWARD':'IN PROGRESS');
      claim.disabled=q.claimed||!q.complete;
      claim.onclick=()=>{
        const result=claimProfileQuest(q.id);
        if(result.ok)renderQuestPage();
      };
      card.appendChild(claim);
      body.appendChild(card);
    }
  }
}
