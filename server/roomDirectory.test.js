// node --test server/roomDirectory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function boot() {
  let server;
  class FakeServer {
    constructor() { server = this; this.handlers = {}; }
    on(event, handler) { this.handlers[event] = handler; }
  }
  class Client {
    constructor() { this.handlers = {}; this.sent = []; this.readyState = 1; }
    on(event, cb) { this.handlers[event] = cb; }
    send(text) { this.sent.push(JSON.parse(text)); }
    emit(message) { this.handlers.message(JSON.stringify(message)); }
    latest(type) { return this.sent.filter(m => m.type === type).at(-1); }
    close() { this.handlers.close?.(); }
  }
  const code = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  vm.runInNewContext(code, {
    require: name => {
      if (name !== 'ws') throw Error('Unexpected module: ' + name);
      return {WebSocketServer:FakeServer};
    },
    process: {env:{PORT:8080}},
    setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,
    console:{log:()=>{}},
  });
  function connect() { const client = new Client(); server.handlers.connection(client); return client; }
  function host(password='') {
    const client=connect();
    client.emit({type:'join',room:'TEST1',name:'Alice',isHost:true,
      password,config:{directoryRoom:true,maxPlayers:2,mode:'tdm',mapId:'city',name:'Match'}});
    return client;
  }
  return {connect,host};
}

test('room directory lists hosted, non-full rooms without credentials',()=>{
  const {connect,host}=boot();
  host('private');
  const browser=connect();browser.emit({type:'listRooms'});
  const list=browser.latest('roomList').rooms;
  assert.equal(list.length,1);
  assert.equal(list[0].name,'Match');
  assert.equal(list[0].hasPassword,true);
  assert.equal(Object.hasOwn(list[0],'password'),false);
});

test('incorrect password is rejected but same socket may retry',()=>{
  const {connect,host}=boot();host('secret');
  const guest=connect();
  guest.emit({type:'join',room:'TEST1',name:'Bob',requireExisting:true,password:'wrong'});
  assert.equal(guest.latest('roomError').message,'Incorrect room password');
  guest.emit({type:'join',room:'TEST1',name:'Bob',requireExisting:true,password:'secret'});
  assert.equal(guest.latest('welcome').isHost,false);
});

test('late joiner cannot seize host and capacity is respected',()=>{
  const {connect,host}=boot();
  const owner=host();
  const guest=connect();guest.emit({type:'join',room:'TEST1',name:'Bob',requireExisting:true,isHost:true});
  assert.equal(guest.latest('welcome').isHost,false);
  const extra=connect();extra.emit({type:'join',room:'TEST1',name:'Charlie',requireExisting:true});
  assert.match(extra.latest('roomError').message,/full/);
  const roster=owner.latest('roomUpdated');
  assert.equal(roster.players.length,2);
});

test('nonexistent room cannot be joined through directory',()=>{
  const {connect}=boot();
  const guest=connect();
  guest.emit({type:'join',room:'MISSING',name:'Bob',requireExisting:true});
  assert.equal(guest.latest('roomError').message,'Room no longer exists');
  assert.equal(guest.latest('welcome'),undefined);
});
