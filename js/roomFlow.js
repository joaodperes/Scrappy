// Offline-first Play UI, with the previous network room/lobby prototype
// isolated behind clearly labeled experimental controls. Local modes run
// against client-side robots and never open the WebSocket room browser.
import { MAPS, getRoomCapacity, isModeSupported, getCurrentMap, isMapUnlocked, isHardModeUnlocked, isNightmareUnlocked } from './mapManager.js';
import { profile } from './progression.js';
import { HARD_MODE_MODIFIERS } from './hardModeRules.js';
import { TIME_LIMITS, KILL_LIMITS, PVP_ROOM_SIZES, validateMatchSettings } from './roomSettings.js';

const OFFLINE_MODES = [
  ['survival','Survival (endless waves)'],
  ['gunGame','Gun Game (vs robots)'],
  ['killConfirmed','Kill Confirmed (vs robots)'],
  ['ffa','Free-for-all (local bots · beta)'],
  ['tdm','Team Deathmatch (local bots · beta)'],
];
const MODES = [
  ['survival', 'Survival (solo / co-op planned)'],
  ['tdm', 'Team Deathmatch'],
  ['ffa', 'Free-for-all'],
  ['gunGame', 'Gun Game'],
];
const CSS = {
  screen:'position:fixed;inset:0;z-index:925;background:radial-gradient(ellipse at 50% 35%,#1c2a10 0%,#090d06 100%);color:#e7f3da;overflow-y:auto;font:14px "Courier New",monospace;padding:24px 20px;box-sizing:border-box',
  box:'background:#182416;border:1px solid #536b30;border-radius:8px;padding:22px;max-width:790px;margin:16px auto;box-sizing:border-box;min-height:260px',
  row:'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0',
  field:'padding:10px 12px;background:#101a0b;color:#e7f3da;border:1px solid #647b36;border-radius:4px;font:14px "Courier New",monospace;width:min(100%,420px);box-sizing:border-box',
  button:'padding:11px 18px;background:#c4ea48;color:#18220c;border:1px solid #9cc72a;border-radius:5px;cursor:pointer;font-weight:bold;min-width:152px',
  secondary:'padding:10px 16px;background:#1d2a15;color:#cbe9a2;border:1px solid #627a3d;border-radius:5px;cursor:pointer;min-width:152px',
};
let root = null, socket = null, config = null, participants = [], host = false, roomId = '';
let actions = {};
let welcomePacket = null;
let selfPlayerId = null;
let countdown = null;

function dom(tag, css, txt) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (txt != null) e.textContent = txt;
  return e;
}
function button(label, onClick, secondary = false) {
  const e = dom('button', secondary ? CSS.secondary : CSS.button, label);
  e.type='button'; e.onclick=onClick; return e;
}
function row(parent, label, input) {
  const r=dom('label',CSS.row);
  r.appendChild(dom('span','width:155px;min-width:155px;flex-shrink:0',label));
  r.appendChild(input);parent.appendChild(r);return input;
}
function input(type, value='', placeholder='') {
  const e=dom('input',CSS.field);e.type=type;e.value=value;e.placeholder=placeholder;return e;
}
function selector(options, value) {
  const e=dom('select',CSS.field);
  for(const [id,label] of options){const o=dom('option','',label);o.value=id;e.appendChild(o)}
  e.value=value;e.style.height='42px';return e;
}
function message(target, msg, error=false) {
  target.textContent=msg;target.style.color=error?'#ff8b7e':'#c4ea48';
}
function endpoint() {
  const local=['localhost','127.0.0.1'].includes(location.hostname);
  return window.SCRAPPY_WS_URL || (local ? 'ws://localhost:8080' : 'wss://' + location.host + '/ws');
}
function wsConnect(url, onReady, onMessage, onError) {
  if (socket) { socket.onclose=null;socket.close(); }
  try { socket=new WebSocket(url); }
  catch(e){onError('Invalid WebSocket server URL');return;}
  const client=socket;
  client.onopen=()=>{if(socket===client)onReady()};
  client.onerror=()=>{if(socket===client)onError('Cannot connect. Ensure the room server is deployed and reachable.')};
  client.onclose=()=>{if(socket===client)onError('Disconnected from the room server.')};
  client.onmessage=ev=>{
    if(socket!==client)return;
    let data;try{data=JSON.parse(ev.data)}catch{return}
    onMessage(data);
  };
}
function send(data){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data))}
function clearSocket() {
  if(socket){const s=socket;socket=null;s.onclose=null;s.close();}
}
function closePage() {
  if(countdown){clearInterval(countdown);countdown=null}
  clearSocket();
  selfPlayerId=null;
  root?.remove();root=null;
}
function back() {
  closePage();
  const menu=document.getElementById('menuScreen');
  if(menu)menu.className='screen visible';
}
function shell(title) {
  if(!root){root=dom('div',CSS.screen);root.id='_roomFlow';document.body.appendChild(root)}
  root.replaceChildren();
  root.appendChild(dom('h1','text-align:center;font-size:32px;letter-spacing:4px;color:#d8f030;text-shadow:0 0 20px #486e1a;margin:8px 0 20px',title));
  return root;
}
function randCode() {
  const a=new Uint8Array(5);
  crypto.getRandomValues(a);
  return Array.from(a, n=>(n%36).toString(36)).join('').toUpperCase();
}
function lobbyRoster(target){
  target.replaceChildren();
  target.appendChild(dom('h3','margin:0 0 12px','PLAYERS IN ROOM'));
  for(const p of participants){target.appendChild(dom('div','padding:7px 0',p.name + (p.id===selfPlayerId?' (YOU)':'')))}
  const bots = config?.fillBots && config?.mode !== 'survival'
    ? Math.max(0,(config.maxPlayers||2)-participants.length) : 0;
  if(bots) target.appendChild(dom('p','color:#a8c38b',bots+' potential bot slots (AI players not active yet)'));
  target.appendChild(dom('p','color:#a8c38b;font-size:12px;margin-top:14px',participants.length+'/'+(config?.maxPlayers||2)+' human participants; ' + (config?.mode||'survival')));
}
function lobby() {
  shell('ROOM LOBBY');
  const box=dom('section',CSS.box);root.appendChild(box);
  box.appendChild(dom('h2','color:#c4ea48',roomId));
  box.appendChild(dom('p','color:#a8c38b', (config?.name||'Room')+' · '+(config?.mapId||'scrapyard')+' · '+(config?.mode||'survival')));
  const roster=dom('div','margin:22px 0');box.appendChild(roster);
  const status=dom('p','margin:16px 0;color:#a8c38b');box.appendChild(status);
  const buttons=dom('div',CSS.row);box.appendChild(buttons);
  if(config?.mode === 'ffa' || config?.mode === 'tdm'){
    buttons.appendChild(button('SELECT TWO WEAPONS',()=>{
      actions.onSelectLoadout?.(config,slots=>{
        if(slots)message(status,'Loadout selected: '+slots.primary+' + '+slots.secondary);
      });
    },true));
  }
  if(host) {
    const start=button('START MATCH',()=>{
      if(config.mode !== 'survival') {
        if(participants.length < 2)
          return message(status,'At least two connected humans are required until AI player bots are available.',true);
        start.disabled=true;
        message(status,'Starting synchronized match…');
        send({type:'hostStartGame'});
        return;
      }
      if(participants.length !== 1) return message(status,'Co-op replication is not implemented yet; solo only for now.',true);
      start.disabled=true;
      let sec=5;
      message(status,'Starting solo Survival in 5…');
      countdown=setInterval(()=>{
        sec-=1;
        if(sec>0){message(status,'Starting solo Survival in '+sec+'…');return}
        clearInterval(countdown);countdown=null;
        const cfg={mapId:config.mapId,difficulty:config.difficulty||
          (config.hardMode?'hard':'normal'),hardMode:!!config.hardMode};
        closePage();
        actions.onStartSurvival?.(cfg);
      },1000);
    });
    buttons.appendChild(start);
    message(status,config.mode==='survival'
      ? 'Solo Survival can launch. Co-op requires the multiplayer runtime.'
      : 'Human multiplayer requires 2+ connected players. Bot fill and co-op are not yet active.',false);
  } else {
    message(status,'Waiting for the host. Match runtimes will be enabled in a later phase.');
  }
  buttons.appendChild(button('LEAVE ROOM',()=>showPlayPage(),true));
  lobbyRoster(roster);
  root._refreshRoster=()=>lobbyRoster(roster);
  root._status=status;
}
function onRoomPacket(data,status,joinData){
  if(data.type==='error' || data.type==='roomError'){
    root?.querySelectorAll('button').forEach(b=>{if(b.textContent==='START MATCH')b.disabled=false});
    return message(root?._status||status,data.message||'Room request rejected',true);
  }
  if(data.type==='welcome'){
    welcomePacket=data;
    roomId=data.roomId;config=data.config||joinData.config||{};
    host=!!data.isHost;
    selfPlayerId=data.id;
    participants=[...(data.players||[]).map(p=>({id:p.id,name:p.name,team:p.team})),
      {id:data.id,name:profile.displayName||profile.name||'YOU',team:data.team}];
    lobby();return;
  }
  if(data.type==='roundCountdown' && config?.mode !== 'survival') {
    if(!actions.onStartMatch) return message(root?._status||status,'Match runtime unavailable',true);
    const matchSocket=socket;
    socket=null; // preserve the live room; gameplay takes ownership
    const buffered=[];
    matchSocket.onmessage=event=>{
      try{buffered.push(JSON.parse(event.data))}catch{}
    };
    const session={
      socket:matchSocket,welcome:welcomePacket,startsAt:data.startsAt,
      buffered,
      closeLobby:()=>{
        if(countdown){clearInterval(countdown);countdown=null}
        root?.remove();root=null;
      },
    };
    const target=root?._status||status;
    message(target,'Starting match in 5…');
    if(countdown)clearInterval(countdown);
    countdown=setInterval(()=>{
      const seconds=Math.max(0,Math.ceil((data.startsAt-Date.now())/1000));
      message(target,'Match begins in '+seconds+'…');
      if(seconds===0){clearInterval(countdown);countdown=null}
    },100);
    actions.onStartMatch({...config},session);
    return;
  }
  if(data.type==='roomUpdated'){
    participants=(data.players||[]).map(p=>({id:p.id,name:p.name,team:p.team}));
    root?._refreshRoster?.();return;
  }
  if(data.type==='playerJoined'){
    participants.push({id:data.id,name:data.name});root?._refreshRoster?.();
  }
  if(data.type==='playerLeft'){
    participants=participants.filter(p=>p.id!==data.id);root?._refreshRoster?.();
  }
  if(data.type==='hostAssigned'){
    host=true;lobby();
  }
  if(data.type==='roundCancelled'){
    if(countdown){clearInterval(countdown);countdown=null}
    root?.querySelectorAll('button').forEach(b=>{if(b.textContent==='START MATCH')b.disabled=false});
    message(root?._status||status,data.reason||'Match countdown cancelled',true);
  }
}

 // Main Play screen contains exactly two top-level destinations.
 // All match settings live within Create Room; Solo is a local suboption.
 export function initRoomFlow(callbacks={}){actions=callbacks}
 export function showPlayPage(){
   if(countdown){clearInterval(countdown);countdown=null}
   clearSocket();
   shell('PLAY SCRAPPY');
   const top=dom('div','max-width:790px;margin:-8px auto 20px;display:flex;justify-content:flex-end');
   const backButton=button('✕ BACK TO MENU',back,true);
   backButton.style.minWidth='unset';
   backButton.style.background='transparent';
   backButton.style.padding='6px 14px';
   top.appendChild(backButton);
   root.appendChild(top);
   const nav=dom('div','max-width:790px;margin:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px');
   root.appendChild(nav);
   const pane=dom('section',CSS.box);root.appendChild(pane);
   let destination='create',solo=true;
   const createNav=button('LOCAL PLAY',()=>{solo=true;show('create')},true);
   const browseNav=button('BROWSE ONLINE (EXPERIMENTAL)',()=>show('browse'),true);
   createNav.style.width=browseNav.style.width='100%';
   nav.appendChild(createNav);nav.appendChild(browseNav);
   function show(where){
     destination=where;
     clearSocket();
     pane.replaceChildren();
     createNav.style.borderColor=where==='create'?'#c4ea48':'#627a3d';
     browseNav.style.borderColor=where==='browse'?'#c4ea48':'#627a3d';
     pane.appendChild(dom('h2','margin:0 0 16px;color:#c4ea48;font-size:19px',where==='create'?(solo?'PLAY OFFLINE':'ONLINE ROOM (EXPERIMENTAL)'):'ONLINE ROOMS (EXPERIMENTAL)'));
     const content=dom('div');pane.appendChild(content);
     const status=dom('p','min-height:22px;margin:14px 0 0;color:#a8c38b;font-size:12px');
     pane.appendChild(status);
     const makeChoice=(label,choices,value)=>row(content,label,selector(choices,value));
     if(where==='browse'){
       const url=input('url',endpoint());
       row(content,'Room server',url);
       const loadoutAction=button('SELECT PVP LOADOUT',()=>{
         actions.onSelectLoadout?.({mode:'ffa'},()=>message(status,'PvP weapon selection saved for this match.'));
       },true);
       content.appendChild(loadoutAction);
       const wrap=dom('div','overflow-x:auto;margin-top:15px');content.appendChild(wrap);
       const table=dom('table','width:100%;border-collapse:collapse;color:#e7f3da;font-size:12px;text-align:left');
       wrap.appendChild(table);
       const headers=dom('tr');
       for(const title of ['ROOM','PLAYERS','CAPACITY','MODE','MAP','PASSWORD','']){
         headers.appendChild(dom('th','padding:10px 8px;border-bottom:1px solid #627a3d;color:#c4ea48',title));
       }
       table.appendChild(headers);
       const rows=dom('tbody');table.appendChild(rows);
       const refresh=()=>{
         message(status,'Loading available rooms…');
         wsConnect(url.value,()=>send({type:'listRooms'}),data=>{
           if(data.type!=='roomList')return onRoomPacket(data,status,{});
           rows.replaceChildren();
           for(const room of (data.rooms||[])){
             const tr=dom('tr');
             const values=[room.name,room.humans,room.maxPlayers,room.mode,room.mapId,room.hasPassword?'🔒 Yes':'No'];
             for(const value of values)tr.appendChild(dom('td','padding:10px 8px;border-bottom:1px solid #425831',String(value??'')));
             const action=dom('td','padding:8px;border-bottom:1px solid #425831');
             const join=button('JOIN',()=>{
               const password=room.hasPassword?prompt('Room password:'):'';
               if(password===null)return;
               message(status,'Joining '+room.name+'…');
               send({type:'join',room:room.id,requireExisting:true,password,
                 name:profile.displayName||profile.name||'Player'});
             });
             join.style.minWidth='64px';action.appendChild(join);
             tr.appendChild(action);rows.appendChild(tr);
           }
           if(!(data.rooms||[]).length){
             const tr=dom('tr'),td=dom('td','padding:16px 8px;color:#a8c38b','No open rooms on this server.');
             td.colSpan=7;tr.appendChild(td);rows.appendChild(tr);
           }
           message(status,(data.rooms||[]).length+' available rooms.');
         },err=>message(status,err,true));
       };
       const refreshBtn=button('REFRESH ROOMS',refresh,true);
       content.appendChild(refreshBtn);
       refresh();
       return;
     }
     // Two choices *within* Create Room, not additional top-level menu cards.
     const choice=dom('div','display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px');
     content.appendChild(choice);
     const soloBtn=button('LOCAL MODES',()=>{solo=true;show('create')},true);
     const onlineBtn=button('ONLINE (EXPERIMENTAL)',()=>{solo=false;show('create')},true);
     soloBtn.style.width=onlineBtn.style.width='100%';
     soloBtn.style.borderColor=solo?'#c4ea48':'#627a3d';
     onlineBtn.style.borderColor=!solo?'#c4ea48':'#627a3d';
     choice.appendChild(soloBtn);choice.appendChild(onlineBtn);

     const map=makeChoice('Map',Object.values(MAPS).map(m=>[m.id,
       (m.icon||'🗺️')+' '+m.name+(isMapUnlocked(m.id)?'':' 🔒 '+(m.unlockHint||'Not unlocked'))
     ]),getCurrentMap());
     const mode=makeChoice('Game mode',solo?OFFLINE_MODES:MODES,'survival');
     const difficulty=makeChoice('Survival difficulty',[
       ['normal','Normal'],['hard','Hard'],['nightmare','Nightmare'],
     ],'normal');
     const offlineDetails=dom('div');content.appendChild(offlineDetails);
     let offlineDuration=null,offlineScore=null;
     if(solo){
       offlineDuration=selector([['300','5 minutes'],['600','10 minutes'],['900','15 minutes']],'600');
       offlineScore=selector([['10','10 points'],['15','15 points'],['25','25 points'],['50','50 points']],'25');
       row(offlineDetails,'Arena duration',offlineDuration);
       row(offlineDetails,'Points to win',offlineScore);
       const arenaLoadout=button('SELECT ARENA LOADOUT',()=>{
         actions.onSelectLoadout?.({mode:'ffa'},slots=>{
           if(slots)arenaWeapons.textContent='Current local weapons: '+slots.primary+' / '+slots.secondary;
         });
       },true);
       offlineDetails.appendChild(arenaLoadout);
       const arenaWeapons=dom('p','font-size:12px;color:#bcd1a0','Local arenas use a saved two-firearm loadout; Gun Game overrides it.');
       offlineDetails.appendChild(arenaWeapons);
       mode.addEventListener('change',()=>{
         arenaLoadout.style.display=mode.value==='gunGame'?'none':'inline-block';
         arenaWeapons.style.display=mode.value==='gunGame'?'none':'block';
       });
       offlineDetails.appendChild(dom('p','font-size:12px;color:#bcd1a0;line-height:1.5',
         'Offline arena modes use existing PvE robots. FFA/TDM are practice variants: bots target you, not one another. Gun Game switches weapons on elimination; Kill Confirmed scores collected tags. No multiplayer server needed.'));
     }
     const help=dom('details','border:1px solid #4b6336;border-radius:5px;padding:10px 14px;margin:12px 0;color:#bfd5a3');
     const summary=dom('summary','cursor:pointer;font-weight:bold;color:#c4ea48','HELP: HARD / NIGHTMARE MODIFIERS');
     help.appendChild(summary);
     const info=dom('div','padding-top:9px;font-size:12px;line-height:1.6');
     for(const def of HARD_MODE_MODIFIERS)info.appendChild(dom('div','margin:4px 0',def.label+': '+def.desc));
     info.appendChild(dom('p','margin-bottom:8px','Hard rotates one modifier per wave; Nightmare permanently stacks previous modifiers on waves 11, 21 and 31.'));
     info.appendChild(dom('strong','color:#c4ea48','ELITE ENEMIES'));
     info.appendChild(dom('p','margin:5px 0',
       'Hard and Nightmare introduce Elites starting at wave 5. Elites have a colored halo: amber Bulwark (armored), red Frenzied (enrages below 40% HP), cyan Regenerator (heals outside combat), and purple dual-trait Elites starting at wave 25. Stronger Elites reward bonus XP, score and a consumable. Boss waves limit Elite minions.'));
     help.appendChild(info);content.appendChild(help);

     const roomDetails=dom('div');content.appendChild(roomDetails);
     const pvpDetails=dom('div');content.appendChild(pvpDetails);
     let nameField,password,bots,duration,kills,size,url,pvpLoadout;
     const chosenLabel=dom('p','font-size:12px;color:#a8c38b');
     if(!solo){
       nameField=input('text',((profile.displayName||profile.name||'Player')+"'s Room").slice(0,48));nameField.maxLength=48;
       password=input('password','','Optional password');
       bots=input('checkbox');bots.checked=false;bots.style.width='auto';
       url=input('url',endpoint());
       const makeRoomField=(label,control)=>{const r=dom('label',CSS.row);r.appendChild(dom('span','min-width:155px',label));r.appendChild(control);roomDetails.appendChild(r);return r};
       makeRoomField('Room name',nameField);
       makeRoomField('Password',password);
       const botRow=makeRoomField('Fill with bots',bots);
       makeRoomField('Room server',url);
       duration=selector(TIME_LIMITS.map(([n,name])=>[String(n),name]),'600');
       kills=selector(KILL_LIMITS.map(([n,name])=>[String(n),name]),'30');
       size=selector(PVP_ROOM_SIZES.map(n=>[String(n),mode?.value==='tdm'?String(n)+' ('+(n/2)+' vs '+(n/2)+')':String(n)+' players']),'6');
       const addPvpField=(label,control)=>{const r=dom('label',CSS.row);r.appendChild(dom('span','min-width:155px',label));r.appendChild(control);pvpDetails.appendChild(r)};
       addPvpField('Time limit',duration);
       addPvpField('Kill limit',kills);
       addPvpField('Max room size',size);
       pvpLoadout=button('SELECT PVP LOADOUT',()=>{
         actions.onSelectLoadout?.({mode:mode.value},slots=>{
           if(slots)chosenLabel.textContent='Weapons: '+slots.primary+' + '+slots.secondary+' (attachments configured in Loadout)';
         });
       },true);
       pvpDetails.appendChild(pvpLoadout);
       pvpDetails.appendChild(chosenLabel);
       // Hide all competitive-only settings when in Survival.
       const updateBotRow=()=>{botRow.style.display=mode.value==='survival'?'none':'flex'};
       mode.addEventListener('change',updateBotRow);
       updateBotRow();
     }
     const refreshSettings=()=>{
       if(mode){
         const supported=val=>solo&&val!=='survival'||isModeSupported(map.value,val);
         for(const opt of mode.options)opt.disabled=!supported(opt.value);
         if(!supported(mode.value))mode.value='survival';
       }
       const currentMode=mode?.value||'survival';
       const survival=currentMode==='survival';
       for(const opt of map.options){
         const meta=MAPS[opt.value];
         const unlocked=isMapUnlocked(opt.value);
         opt.disabled=!unlocked;
         opt.textContent=(meta?.icon||'🗺️')+' '+(meta?.name||opt.value)+
           (unlocked?'':' 🔒 '+(meta?.unlockHint||'Not unlocked'));
       }
       if(Array.from(map.options).find(o=>o.value===map.value)?.disabled){
         map.value=Array.from(map.options).find(o=>!o.disabled)?.value||'scrapyard';
       }
       difficulty.disabled=!survival;
       for(const opt of difficulty.options){
         const locked=opt.value==='hard'?!isHardModeUnlocked(map.value):
           opt.value==='nightmare'?!isNightmareUnlocked(map.value):false;
         opt.disabled=!survival||locked;
         opt.textContent=opt.value==='hard'&&locked?'Hard 🔒 Clear a Normal boss wave on this map':
           opt.value==='nightmare'&&locked?'Nightmare 🔒 Clear a Hard boss wave on this map':
           opt.value==='hard'?'Hard':opt.value==='nightmare'?'Nightmare':'Normal';
       }
       if(Array.from(difficulty.options).find(o=>o.value===difficulty.value)?.disabled)difficulty.value='normal';
       if(help)help.style.display=survival?'block':'none';
       if(offlineDetails)offlineDetails.style.display=solo&&!survival?'block':'none';
       if(pvpDetails)pvpDetails.style.display=survival?'none':'block';
       if(size){
         // Present both team sizes when TDM is selected.
         for(const opt of size.options){
           const n=Number(opt.value);
           opt.textContent=currentMode==='tdm'?n+' players ('+(n/2)+' vs '+(n/2)+')':n+' players';
         }
       }
       if(pvpLoadout)pvpLoadout.style.display=currentMode==='ffa'||currentMode==='tdm'?'inline-block':'none';
       if(bots)bots.disabled=survival;
     };
     map.onchange=refreshSettings;
     if(mode)mode.onchange=refreshSettings;
     refreshSettings();
     const actionRow=dom('div',CSS.row);content.appendChild(actionRow);
     if(solo){
       actionRow.appendChild(button('START LOCAL MATCH',()=>{
         const selected=mode.value;
         const cfg={mapId:map.value,mode:selected,difficulty:difficulty.value,
           hardMode:selected==='survival'&&difficulty.value!=='normal',
           duration:Number(offlineDuration?.value)||600,
           scoreLimit:Number(offlineScore?.value)||25,
           seed:Math.floor(Math.random()*0x100000000)};
         closePage();
         if(selected==='survival')actions.onStartSurvival?.(cfg);
         else actions.onStartLocalMode?.(cfg);
       }));
     }else{
       actionRow.appendChild(button('CREATE ROOM',()=>{
         const currentMode=mode.value;
         const time= currentMode==='survival'?600:Number(duration.value);
         const score=currentMode==='survival'?0:Number(kills.value);
         const capacity=currentMode==='survival'?2:Number(size.value);
         const check=validateMatchSettings(currentMode,time,score,capacity);
         if(!check.valid)return message(status,check.error,true);
         const cfg={
           directoryRoom:true,mode:currentMode,mapId:map.value,
           maxPlayers:capacity,fillBots:currentMode!=='survival'&&bots.checked,
           difficulty:currentMode==='survival'?difficulty.value:'normal',
           hardMode:currentMode==='survival'&&difficulty.value!=='normal',
           roundDuration:time,scoreLimit:score,name:nameField.value||'Room',
         };
         message(status,'Connecting to room server…');
         wsConnect(url.value,()=>send({type:'join',room:randCode(),name:profile.displayName||profile.name||'Player',
           isHost:true,config:cfg,password:password.value}),
           data=>onRoomPacket(data,status,{config:cfg}),
           err=>message(status,err,true));
       }));
     }
   }
   show('create');
 }
