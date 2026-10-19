// Room configuration/lobby foundation. Multiplayer match runtimes are not
// enabled until team replication, bot controllers and authoritative scoring exist.
import { MAPS, getRoomCapacity, isModeSupported, getCurrentMap, isHardModeUnlocked } from './mapManager.js';
import { profile } from './progression.js';
import { HARD_MODE_MODIFIERS } from './hardModeRules.js';

const MODES = [
  ['survival', 'Survival (solo / co-op planned)'],
  ['tdm', 'Team Deathmatch'],
  ['ffa', 'Free-for-all'],
  ['gunGame', 'Gun Game'],
];
const CSS = {
  screen:'position:fixed;inset:0;z-index:925;background:#10121d;color:#f4f6f7;overflow-y:auto;font:14px "Courier New",monospace;padding:30px 20px',
  box:'background:#262735;border:1px solid #5f6b6d;border-radius:8px;padding:18px;max-width:690px;margin:16px auto',
  row:'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:10px 0',
  field:'padding:9px 12px;background:#181b28;color:#f8faf7;border:1px solid #5f6b6d;font:14px "Courier New",monospace;max-width:100%',
  button:'padding:11px 18px;background:#15cab6;color:#10121d;border:0;border-radius:5px;cursor:pointer;font-weight:bold',
  secondary:'padding:10px 16px;background:#34374a;color:#f8faf7;border:1px solid #5f6b6d;border-radius:5px;cursor:pointer',
};
let root = null, socket = null, config = null, participants = [], host = false, roomId = '';
let actions = {};
let welcomePacket = null;
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
  r.appendChild(dom('span','min-width:140px',label));
  r.appendChild(input);parent.appendChild(r);return input;
}
function input(type, value='', placeholder='') {
  const e=dom('input',CSS.field);e.type=type;e.value=value;e.placeholder=placeholder;return e;
}
function selector(options, value) {
  const e=dom('select',CSS.field);
  for(const [id,label] of options){const o=dom('option','',label);o.value=id;e.appendChild(o)}
  e.value=value;return e;
}
function message(target, msg, error=false) {
  target.textContent=msg;target.style.color=error?'#e85e76':'#15cab6';
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
  root.appendChild(dom('h1','text-align:center;font-size:25px;letter-spacing:3px',title));
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
  for(const p of participants){target.appendChild(dom('div','padding:7px 0',p.name + (p.id==='self'?' (YOU)':'')))}
  const bots = config?.fillBots && config?.mode !== 'survival'
    ? Math.max(0,(config.maxPlayers||2)-participants.length) : 0;
  if(bots) target.appendChild(dom('p','color:#adaeb5',bots+' potential bot slots (AI players not active yet)'));
  target.appendChild(dom('p','color:#adaeb5;font-size:12px;margin-top:14px',participants.length+'/'+(config?.maxPlayers||2)+' human participants; ' + (config?.mode||'survival')));
}
function lobby() {
  shell('ROOM LOBBY');
  const box=dom('section',CSS.box);root.appendChild(box);
  box.appendChild(dom('h2','color:#15cab6',roomId));
  box.appendChild(dom('p','color:#adaeb5', (config?.name||'Room')+' · '+(config?.mapId||'scrapyard')+' · '+(config?.mode||'survival')));
  const roster=dom('div','margin:22px 0');box.appendChild(roster);
  const status=dom('p','margin:16px 0;color:#adaeb5');box.appendChild(status);
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
        const cfg={mapId:config.mapId,hardMode:config.hardMode};
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
    participants=[...data.players.map(p=>({id:p.id,name:p.name})),{id:'self',name:profile.displayName||profile.name||'YOU'}];
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
    participants=data.players.map(p=>({id:p.id,name:p.name}));
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
}
// Offline Survival uses the existing solo game flow. Do not construct a
// WebSocket or create a lobby: no room server is needed for local map testing.
function soloPage() {
  clearSocket();
  shell('SINGLE PLAYER — SURVIVAL');
  const box=dom('section',CSS.box);
  root.appendChild(box);
  box.appendChild(dom('p','color:#adaeb5;line-height:1.6',
    'Choose a map and start a local Survival run. No room or multiplayer server is required.'));
  const map=selector(Object.values(MAPS).map(m=>[m.id,m.icon+' '+m.name]),getCurrentMap());
  const hard=input('checkbox');
  const modifier=selector([['auto','Automatic (map-specific starting rule)'],
      ...HARD_MODE_MODIFIERS.map(m=>[m.id,m.label+' — '+m.desc])],'auto');
  const hardHint=dom('p','color:#adaeb5;font-size:12px');
  row(box,'Map',map);
  row(box,'Hard mode',hard);
  row(box,'First Hard modifier',modifier);
  box.appendChild(hardHint);
  function refresh(){
    const unlocked=isHardModeUnlocked(map.value);
    hard.disabled=!unlocked;
    if(!unlocked)hard.checked=false;
    modifier.disabled=!unlocked||!hard.checked;
    hardHint.textContent=unlocked
      ? 'Hard modifiers rotate every three waves. Choose the first one or use Automatic.'
      : 'Defeat a boss wave on this map to unlock Hard Mode.';
  }
  map.onchange=refresh;
  hard.onchange=refresh;
  refresh();
  const actionsRow=dom('div',CSS.row);
  box.appendChild(actionsRow);
  const start=button('START SOLO SURVIVAL',()=>{
    start.disabled=true;
    const cfg={mapId:map.value,hardMode:!hard.disabled&&hard.checked,
      hardModifier:!hard.disabled&&hard.checked?modifier.value:'auto'};
    closePage();
    actions.onStartSurvival?.(cfg);
  });
  actionsRow.appendChild(start);
  actionsRow.appendChild(button('BACK',showPlayPage,true));
}

function createPage() {
  shell('CREATE ROOM');
  const box=dom('section',CSS.box);root.appendChild(box);
  const map=selector(Object.values(MAPS).map(m=>[m.id,m.icon+' '+m.name]),getCurrentMap());
  const mode=selector(MODES,'survival');
  const bots=input('checkbox');bots.checked=true;
  const hard=input('checkbox');
  const name=input('text',((profile.displayName||profile.name||'Player') + "'s Room").slice(0,48));
  name.maxLength=48;
  const password=input('password','','Optional password');
  const url=input('url',endpoint());url.style.width='100%';
  const info=dom('p','color:#adaeb5;margin:12px 0');
  function refresh(){
    for(const o of mode.options)o.disabled=!isModeSupported(map.value,o.value);
    if(!isModeSupported(map.value,mode.value))mode.value='survival';
    const survival=mode.value==='survival';
    bots.disabled=survival;bots.checked=survival?false:bots.checked;
    hard.disabled=!survival || !isHardModeUnlocked(map.value);
    if(hard.disabled)hard.checked=false;
    info.textContent='Capacity: '+getRoomCapacity(map.value,mode.value)+
      (survival?' players (co-op planned; solo runtime available)':' players (lobby-only; match runtime pending)');
  }
  row(box,'Map',map);row(box,'Mode',mode);row(box,'Fill with bots',bots);
  row(box,'Hard mode (Survival)',hard);row(box,'Room name',name);
  row(box,'Password',password);row(box,'Room server',url);
  box.appendChild(info);map.onchange=refresh;mode.onchange=refresh;refresh();
  const status=dom('div','min-height:26px;color:#adaeb5');box.appendChild(status);
  const buttons=dom('div',CSS.row);box.appendChild(buttons);
  buttons.appendChild(button('CREATE ROOM',()=>{
    const cfg={directoryRoom:true,mode:mode.value,mapId:map.value,
      maxPlayers:getRoomCapacity(map.value,mode.value),fillBots:bots.checked,
      hardMode:mode.value==='survival'&&!hard.disabled&&hard.checked,name:name.value||'Room'};
    const code=randCode();
    message(status,'Connecting to room server…');
    wsConnect(url.value,()=>send({type:'join',room:code,name:profile.displayName||profile.name||'Player',
        isHost:true,config:cfg,password:password.value}),
      data=>onRoomPacket(data,status,{config:cfg}),err=>message(status,err,true));
  }));
  buttons.appendChild(button('BACK',showPlayPage,true));
}
function browsePage() {
  shell('BROWSE ROOMS');
  const box=dom('section',CSS.box);root.appendChild(box);
  const url=input('url',endpoint());url.style.width='100%';
  row(box,'Room server',url);
  const status=dom('p','color:#adaeb5;margin:12px 0','Connect to browse active rooms.');
  box.appendChild(status);
  const list=dom('div','margin:16px 0');box.appendChild(list);
  const buttons=dom('div',CSS.row);box.appendChild(buttons);
  const refresh=()=>{
    message(status,'Connecting to room directory…');
    wsConnect(url.value,()=>send({type:'listRooms'}),data=>{
      if(data.type==='roomList'){
        list.replaceChildren();
        for(const r of data.rooms||[]){
          const item=dom('div','display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #5f6b6d');
          const title=dom('div','',r.name+' · '+r.mode+' · '+r.mapId+' · '+r.humans+'/'+r.maxPlayers);
          item.appendChild(title);
          const joinBtn=button('JOIN',()=>{
            const password=r.hasPassword ? prompt('Room password:') : '';
            if(password===null)return;
            message(status,'Joining '+r.name+'…');
            send({type:'join',room:r.id,requireExisting:true,password,name:profile.displayName||profile.name||'Player'});
          });
          item.appendChild(joinBtn);list.appendChild(item);
        }
        if(!(data.rooms||[]).length)list.appendChild(dom('p','color:#adaeb5','No open rooms on this server.'));
      } else onRoomPacket(data,status,{});
    },err=>message(status,err,true));
  };
  buttons.appendChild(button('REFRESH',refresh));
  buttons.appendChild(button('BACK',showPlayPage,true));
  refresh();
}
export function initRoomFlow(callbacks={}){actions=callbacks}
export function showPlayPage(){
  if(countdown){clearInterval(countdown);countdown=null;}
  clearSocket();shell('PLAY SCRAPPY');
  const box=dom('section',CSS.box);root.appendChild(box);
  box.appendChild(dom('p','line-height:1.6;color:#adaeb5;margin-bottom:18px',
    'Single Player starts local Survival without networking. Create Room and Browse Rooms use the separate multiplayer server.'));
  const buttons=dom('div',CSS.row);box.appendChild(buttons);
  buttons.appendChild(button('SINGLE PLAYER',soloPage));
  buttons.appendChild(button('CREATE ROOM',createPage));
  buttons.appendChild(button('BROWSE ROOMS',browsePage));
  buttons.appendChild(button('BACK TO MENU',back,true));
}
