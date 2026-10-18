// network.js – WebSocket client for PvP TDM
// Handles connection, message sending/receiving, and reconnect logic.

/** @type {WebSocket|null} */
let _ws = null;
let _id  = null;   // local player id assigned by server
let _team = null;  // 'RED' | 'BLUE'
let _connected = false;

const _handlers = new Map(); // type → callback

export function getMyId()   { return _id; }
export function getMyTeam() { return _team; }
export function isConnected() { return _connected; }

/**
 * Connect to the WS server.
 * @param {string} serverUrl  e.g. 'ws://localhost:8080'
 * @param {string} playerName
 * @param {string} roomId
 */
export function connect(serverUrl, playerName, roomId, meta = {}) {
  if (_ws) disconnect();
  _ws = new WebSocket(serverUrl);

  _ws.addEventListener('open', () => {
    _connected = true;
    send({ type: 'join', name: playerName, room: roomId, ...meta });
    console.log('[net] Connected to', serverUrl);
  });

  wireSocket(_ws);

  _ws.addEventListener('error', err => {
    console.error('[net] WS error', err);
  });
}

function deliver(msg) {
  if (msg.type === 'welcome') {
    _id=msg.id;_team=msg.team;
  }
  const handler=_handlers.get(msg.type);
  if (handler) handler(msg);
  else _handlers.get('*')?.(msg);
}
function wireSocket(ws) {
  ws.addEventListener('message',evt=>{
    let msg;try{msg=JSON.parse(evt.data)}catch{return}
    if(_ws===ws)deliver(msg);
  });
  ws.addEventListener('close',()=>{
    if(_ws!==ws)return;
    _connected=false;
    _handlers.get('disconnected')?.();
  });
}
// Transfer an already authenticated/validated room socket from roomFlow
// without leaving and recreating its room (which would orphan the lobby).
export function adoptConnection(ws,welcome) {
  if(_ws && _ws!==ws)disconnect();
  _ws=ws;_connected=ws.readyState===WebSocket.OPEN;
  ws.onmessage=null;ws.onclose=null;ws.onerror=null;
  wireSocket(ws);
  deliver({...welcome,type:'welcome'});
}

export function disconnect() {
  if (_ws) { _ws.close(); _ws = null; }
  _connected = false; _id = null; _team = null;
}

export function send(obj) {
  if (_ws && _ws.readyState === WebSocket.OPEN) _ws.send(JSON.stringify(obj));
}

/** Register a handler for a message type. Use '*' for any unhandled type. */
export function on(type, fn) { _handlers.set(type, fn); }
export function off(type)    { _handlers.delete(type); }

// ── Throttled position sending ─────────────────────────────────
let _moveTick = 0;
const MOVE_HZ = 20; // send 20 updates/sec

/**
 * Call every frame; sends position at MOVE_HZ.
 */
export function sendMoveThrottled(dt, x, y, z, yaw) {
  _moveTick += dt;
  if (_moveTick >= 1/MOVE_HZ) {
    _moveTick = 0;
    send({ type: 'move', x, y, z, yaw });
  }
}

/** Tell server we shot at a remote player. */
export function sendHit(targetId, dmg, weapon) {
  send({ type: 'hit', targetId, dmg, weapon });
}

/** Tell server we fired (cosmetic – for other clients to show bullet trail). */
export function sendShoot(ox, oy, oz, dx, dy, dz, weapon) {
  send({ type: 'shoot', ox, oy, oz, dx, dy, dz, weapon });
}

/** Signal ready to start the round. */
export function sendReady() { send({ type: 'ready' }); }
