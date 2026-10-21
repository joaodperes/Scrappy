const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/roomSettings.js'),'utf8');
const uri='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
test('competitive presets, even TDM teams and mutually exclusive no-limit options',async()=>{
  const {TIME_LIMITS,KILL_LIMITS,PVP_ROOM_SIZES,validateMatchSettings}=await import(uri);
  assert.deepEqual(TIME_LIMITS.map(x=>x[0]),[0,300,600,900,1200,1800]);
  assert.deepEqual(KILL_LIMITS.map(x=>x[0]),[0,15,30,50,80,100]);
  assert.deepEqual(PVP_ROOM_SIZES,[6,10,14]);
  assert.ok(PVP_ROOM_SIZES.every(n=>n%2===0));
  assert.equal(validateMatchSettings('tdm',0,0,14).valid,false);
  assert.equal(validateMatchSettings('tdm',0,30,14).valid,true);
  assert.equal(validateMatchSettings('ffa',600,0,6).valid,true);
  assert.equal(validateMatchSettings('ffa',600,50,8).valid,false);
  assert.equal(validateMatchSettings('ffa',720,50,6).valid,false);
  assert.equal(validateMatchSettings('survival',600,0,2).valid,true);
});
