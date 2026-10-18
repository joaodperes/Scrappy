// Validate four built-in maps against the exact schema used by the browser.
// Usage: node scripts/validate-map-data.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  // mapSchema.js is a browser ESM module, whereas Node's test scripts are CJS.
  // Loading via a data URL uses the SAME validation implementation in both.
  const moduleSource=fs.readFileSync(path.join(root,'js/mapSchema.js'),'utf8');
  const uri='data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64');
  const {validateMapDocument,MAP_SCHEMA_VERSION}=await import(uri);
  let total=0;
  for(const name of ['scrapyard','jungle','city','terminal']){
    const layout=JSON.parse(fs.readFileSync(path.join(root,'assets/maps',name+'.json'),'utf8'));
    assert.equal(Number(layout.version),MAP_SCHEMA_VERSION,name+' must be v2');
    const result=validateMapDocument(layout,{expectedMap:name,strictIds:true});
    assert.ok(result.valid,name+' failed schema validation:\n'+result.errors.map(e=>'  - '+e).join('\n'));
    total+=result.document.objects.length;
    console.log(name+': '+layout.objects.length+' entities, '+layout.markers.length+' markers validated');
  }
  console.log('Validated '+total+' entities across 4 built-in maps.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
