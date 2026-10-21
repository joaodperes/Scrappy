// Ensure embedded <script type="module"> scripts parse in CI.
// node scripts/check-inline-modules.cjs
const fs=require('node:fs');
const cp=require('node:child_process');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scrappy-modules-'));
try{
  for(const page of ['index.html','editor.html']){
    const src=fs.readFileSync(path.join(root,page),'utf8');
    const matches=[...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    let checked=0;
    for(const [,attrs,body] of matches){
      if(!body.trim())continue;
      if(/\bsrc\s*=/.test(attrs))continue;
      const fname=path.join(tmp,page+'-'+checked+'.mjs');
      fs.writeFileSync(fname,body);
      cp.execFileSync(process.execPath,['--check',fname],{stdio:'inherit'});
      checked++;
    }
    console.log(page+': '+checked+' inline scripts syntax-checked');
  }
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}
