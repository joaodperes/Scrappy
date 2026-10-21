// Run with: node scripts/check-module-imports.cjs
// Catch missing ES module files/exports before the browser aborts main.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'js');
function findJs(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const abs=path.join(dir,entry.name);
    if(entry.isDirectory()) return findJs(abs);
    return entry.isFile()&&entry.name.endsWith('.js')&&entry.name!=='babylon.max.js'?[abs]:[];
  });
}
const files=findJs(root);
const contents=new Map(files.map(file=>[file,fs.readFileSync(file,'utf8')]));
const exportsByFile=new Map();
for(const [file,source] of contents){
  const names=new Set();
  for(const m of source.matchAll(/\bexport\s+(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][\w$]*)/g)) names.add(m[1]);
  for(const m of source.matchAll(/\bexport\s*\{([^}]+)\}/g)){
    for(const item of m[1].split(',')){
      const alias=item.trim().split(/\s+as\s+/).pop()?.trim();
      if(alias) names.add(alias);
    }
  }
  if(/\bexport\s+default\b/.test(source))names.add('default');
  exportsByFile.set(file,names);
}
const issues=[];
for(const [file,source] of contents){
  // Anchor to a statement boundary, excluding dynamic import() calls.
  const re=/^\s*import\s+(?!\()(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]\s*;?/gm;
  for(const match of source.matchAll(re)){
    const spec=match[2];
    if(!spec.startsWith('.'))continue;
    const resolved=path.resolve(path.dirname(file),spec);
    const display=path.relative(path.dirname(root),file);
    if(!fs.existsSync(resolved)){
      issues.push(display+': missing module '+spec);
      continue;
    }
    const exported=exportsByFile.get(resolved);
    if(!exported) continue; // Non-JS assets are checked only for existence.
    const clause=match[1]||'';
    const named=clause.match(/\{([^}]+)\}/);
    if(named){
      for(const part of named[1].split(',')){
        const imported=part.trim().split(/\s+as\s+/)[0]?.trim();
        if(imported&&!exported.has(imported))
          issues.push(display+': '+spec+' does not export '+imported);
      }
    }
    const defaultImport=clause.replace(/\{[^}]+\}/g,'').replace(/\*\s+as\s+\w+/g,'').replace(/,/g,'').trim();
    if(defaultImport&&!exported.has('default'))
      issues.push(display+': '+spec+' has no default export ('+defaultImport+')');
  }
}
if(issues.length){
  console.error('ES module linking errors:\n'+issues.map(s=>' - '+s).join('\n'));
  process.exitCode=1;
}else console.log('Verified '+files.length+' JS modules: imports and exports resolve.');
