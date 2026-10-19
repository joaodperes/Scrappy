// node --test scripts/jungle-dungeon.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const layout=JSON.parse(fs.readFileSync(path.join(base,'assets/maps/jungle.json'),'utf8'));
const byId=id=>layout.objects.find(o=>o.id===id);
const slabsAt=y=>layout.objects.filter(o=>o.generator==='createSlab' && o.params.surfY===y);
const floorAt=(x,z,y)=>slabsAt(y).some(o=>
  Math.abs(x-o.params.px)<o.params.sx/2-.02 &&
  Math.abs(z-o.params.pz)<o.params.sz/2-.02);
const shaftData=[
 ['j5-entry-west',-24,-19,7,0,-7.5],
 ['j5-entry-east',24,19,-7,0,-7.5],
 ['j5-ramp-m1-m2',0,43,9,-7.5,-15],
 ['j5-ramp-m2-m3',-34,-45,11,-15,-30],
 ['j5-ramp-m3-m4',34,45,-11,-30,-45],
];
test('Jungle v2 layout remains schema-valid and has unique stable IDs',async()=>{
  const src=fs.readFileSync(path.join(base,'js/mapSchema.js'),'utf8');
  const mod=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
  const valid=mod.validateMapDocument(layout,{expectedMap:'jungle',strictIds:true});
  assert.ok(valid.valid,valid.errors.join('\n'));
  assert.equal(new Set(layout.objects.map(o=>o.id)).size,layout.objects.length);
});
test('central arena is supported except for deliberate mine entrances',()=>{
  for(const [x,z] of [[0,0],[-15,0],[15,0],[0,15],[0,-15],[-18,-24],[17,27]])
    assert.equal(floorAt(x,z,0),true,'Surface floor '+x+','+z);
  assert.equal(floorAt(-24,-6,0),false,'West entry is excavated');
  assert.equal(floorAt(24,6,0),false,'East entry is excavated');
  assert.equal(byId('j-gate-south').position.z,-51,'Southern destructible must not block center');
});
test('all five guarded ramps connect correct heights with open floor slots',()=>{
  for(const [id,x,highZ,lowZ,upper,lower] of shaftData){
    const main=byId(id),left=byId(id+'-rail-left'),right=byId(id+'-rail-right');
    assert.equal(main.generator,'createRampBox',id);
    assert.equal(left.generator,'createRampBox',id+' left guard');
    assert.equal(right.generator,'createRampBox',id+' right guard');
    assert.ok(main.params.sx>=6,id+' usable width');
    assert.ok(Math.abs(main.params.rotX)<Math.PI/5,id+' traversable slope');
    assert.ok(Math.abs(main.params.pz-(highZ+lowZ)/2)<.001,id+' aligned center');
    assert.equal(floorAt(x,highZ,upper),true,id+' has a supported upper landing');
    assert.equal(floorAt(x,(highZ+lowZ)/2,upper),false,id+' no floor obstructs slope');
    assert.equal(floorAt(x,lowZ,lower),true,id+' has a supported lower landing');
    assert.ok(Math.abs(left.params.px-x)>3 && Math.abs(right.params.px-x)>3);
  }
});
test('mine floors support all existing deep weapon spawn locations',()=>{
  const samples=[
    [-10,26,-15,'FLAMETHROWER'],[10,-26,-15,'TESLA'],
    [0,0,-15,'RAILGUN'],[0,57,-30,'CROSSBOW'],
    [0,47,-30,'ROCKET'],[28,57,-45,'GLAUNCHER'],
  ];
  for(const [x,z,y,name] of samples)
    assert.equal(floorAt(x,z,y),true,name+' floor at '+y);
});
test('each mine level has floor, perimeter, room cover and solid ceiling',()=>{
  for(const [tag,y] of [['m1',-7.5],['m2',-15],['m3',-30],['m4',-45]]){
    assert.ok(slabsAt(y).length>0,tag+' floor');
    for(const side of ['west','east','north','south'])
      assert.equal(byId('j5-'+tag+'-wall-'+side).generator,'createWall',tag+' wall '+side);
    assert.ok(layout.objects.some(o=>o.id.startsWith('j5-'+tag+'-half-cover-')),tag+' cover');
    assert.ok(layout.objects.some(o=>o.id.startsWith('j5-'+tag+'-ceiling-')&&
      o.params.collides===true),tag+' solid ceiling');
  }
  assert.equal(layout.objects.some(o=>o.id==='jungle-entity-0034'),false,
    'Obsolete perforated mine slab grid was removed');
});
test('deep player fall reset and layered lighting agree with dungeon extent',()=>{
  const player=fs.readFileSync(path.join(base,'js/player.js'),'utf8');
  const map=fs.readFileSync(path.join(base,'js/mapManager.js'),'utf8');
  const jungle=fs.readFileSync(path.join(base,'js/levelJungle.js'),'utf8');
  assert.match(player,/currentMeta\.fallResetY \?\? -25/);
  assert.match(map,/fallResetY:\s*-58/);
  for(const depth of ['-4','-11','-24','-39'])
    assert.ok(jungle.includes(','+depth+','),'Mine lighting must cover '+depth);
});
test('Survival and PvP Jungle spawns stand on supported strata, never shaft holes',()=>{
  const src=fs.readFileSync(path.join(base,'js/mapManager.js'),'utf8');
  const part=src.slice(src.indexOf('  jungle: {'),src.indexOf('  city: {'));
  function spawns(key){
    const result=part.match(new RegExp('(?:^|\\n)\\s*'+key+':\\s*\\[([\\s\\S]*?)\\n\\s*\\],'));
    assert.ok(result,key+' missing');
    return new Function('return ['+result[1]+'];')();
  }
  const floorForSpawn=y=>y>=4?4.5:y>=0?0:y>-10?-7.5:y>-20?-15:y>-35?-30:-45;
  for(const kind of ['spawns','walkableSpawns']){
    for(const [index,[x,y,z]] of spawns(kind).entries()){
      assert.equal(floorAt(x,z,floorForSpawn(y)),true,
        kind+'['+index+'] unsupported at '+[x,y,z]);
    }
  }
});
