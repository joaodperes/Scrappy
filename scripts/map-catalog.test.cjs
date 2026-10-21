// node --test scripts/map-catalog.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/mapCatalog.js'),'utf8');
const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const example={version:1,maps:[{
  id:'cargo_bay',name:'Cargo Bay',icon:'📦',
  desc:'Community warehouse',teamSize:3,
  supportedModes:['survival','ffa'],
  spawn:{x:0,yOffset:1.5,z:-2},
}]};
test('valid catalog registers community metadata through the generic runtime',async()=>{
  const {validateMapCatalog,loadMapCatalog}=await import(url);
  const data=validateMapCatalog(example);
  assert.equal(data.valid,true,data.errors.join('\n'));
  assert.equal(data.maps[0].id,'cargo_bay');
  const maps=await loadMapCatalog(async()=>({ok:true,json:async()=>example}));
  assert.deepEqual(maps,data.maps);
});
test('rejects path traversal, duplicate IDs, built-in override, invalid spawn and mode',async()=>{
  const {validateMapCatalog}=await import(url);
  for(const badId of ['../city','city','jungle','CARGO','hello space','x']){
    const input=structuredClone(example);input.maps[0].id=badId;
    assert.equal(validateMapCatalog(input).valid,false,badId);
  }
  const duplicate=structuredClone(example);duplicate.maps.push({...duplicate.maps[0]});
  assert.equal(validateMapCatalog(duplicate).valid,false);
  const incorrect=structuredClone(example);
  incorrect.maps[0].spawn.x=Infinity;
  incorrect.maps[0].supportedModes=['ffa','admin'];
  assert.equal(validateMapCatalog(incorrect).valid,false);
});
test('shipped community catalog is valid and does not duplicate official maps',async()=>{
  const {validateMapCatalog}=await import(url);
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/catalog.json'),'utf8'));
  const result=validateMapCatalog(catalog);
  assert.equal(result.valid,true,result.errors.join(';'));
  for(const map of result.maps){
    const doc=JSON.parse(fs.readFileSync(path.join(root,'assets/maps',map.id+'.json'),'utf8'));
    assert.equal(doc.map,map.id);
    assert.equal(doc.version,2);
  }
});
