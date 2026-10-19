const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pvp=fs.readFileSync(path.join(__dirname,'../js/pvp.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server/server.js'),'utf8');
test('received player damage uses exactly the server-applied value',()=>{
 const i=pvp.indexOf("  on('hit', msg => {"),j=pvp.indexOf("  on('killed'",i);
 assert.ok(i>=0&&j>i);
 const chunk=pvp.slice(i,j);
 const callbacks=new Map();
 let taken=0;
 new Function('on','getMyId','hurtPlayer',chunk)(
   (k,fn)=>callbacks.set(k,fn),()=> 'self',d=>{taken+=d});
 callbacks.get('hit')({targetId:'self',dmg:40});
 assert.equal(taken,40);
 callbacks.get('hit')({targetId:'another',dmg:40});
 assert.equal(taken,40);
 assert.doesNotMatch(chunk,/damageMult/);
});
test('the kill event does not preempt the server authoritative roundEnd',()=>{
 const killed=pvp.slice(pvp.indexOf("  on('killed', msg => {"),
   pvp.indexOf("  on('damageConfirmed'",pvp.indexOf("  on('killed', msg => {")));
 assert.doesNotMatch(killed,/_handleRoundEnd\(/);
 assert.match(pvp,/on\('roundEnd',\s*msg => _handleRoundEnd\(msg, onRoundEnd\)\)/);
 assert.match(server,/_broadcastAll\(room,\{type:'roundEnd',winner,scores,teams,reason\}\)/);
});
