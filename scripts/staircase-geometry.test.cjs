// Exercise the actual staircase factory with a minimal Babylon mesh model.
// Tests the failure mode that moved every upper step toward the first step.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/levelHelpers.js'),'utf8');
const start=source.indexOf('export function buildStaircase(');
assert.ok(start>0);
const end=source.indexOf('\n}',source.indexOf('export function createStaircase(',start))+2;
const factory=source.slice(start,end).replaceAll('export function','function');
function buildScenario(params){
  const meshes=[],walkableMeshes=[];
  const BABYLON={MeshBuilder:{CreateBox(name,dimensions){
    const mesh={
      name,dimensions,children:[],parent:null,
      position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}},
      scaling:{x:1,y:1,z:1},metadata:{},
      setParent(parent){
        const pos=this.position;
        const p=parent.position;
        this.local={
          x:(pos.x-p.x)/parent.scaling.x,
          y:(pos.y-p.y)/parent.scaling.y,
          z:(pos.z-p.z)/parent.scaling.z,
        };
        this.parent=parent;
        parent.children.push(this);
      },
      world(){
        if(!this.parent)return {...this.position};
        const p=this.parent.world();
        return {
          x:p.x+this.local.x*this.parent.scaling.x,
          y:p.y+this.local.y*this.parent.scaling.y,
          z:p.z+this.local.z*this.parent.scaling.z,
        };
      }
    };
    meshes.push(mesh);
    return mesh;
  }}};
  const scope={BABYLON,walkableMeshes,matConcrete:'concrete',getScene:()=>({}),
    _tagMeta(m,type,generator,p,editable){m.metadata={type,generator,params:p,editable}}};
  vm.createContext(scope);
  vm.runInContext(factory+'\nthis.make=createStaircase;',scope);
  const root=scope.make(...params,'concrete');
  return {root,meshes,walkableMeshes};
}
test('both staircase orientations retain full end-point positions after scale reset',()=>{
  const configs=[
    [32,0,14,6,11,12,0,1,.5,true],
    [-32,0,-14,6,11,12,0,-1,.5,true],
    [-27,12,0,8,15,13,1,0,.5,true],
    [27,12,0,8,15,13,-1,0,.5,true],
  ];
  for(const p of configs){
    const {root,meshes,walkableMeshes}=buildScenario(p);
    assert.equal(meshes.length,p[5]);
    assert.equal(walkableMeshes.length,p[5]);
    assert.deepEqual({...root.scaling},{x:1,y:1,z:1});
    assert.equal(root.children.length,p[5]-1);
    root.scaling={x:1,y:1,z:1}; // JSON applies the saved default.
    const final=meshes.at(-1).world();
    assert.ok(Math.abs(final.x-(p[0]+p[6]*(p[5]-1)*p[4]/p[5]))<1e-9);
    assert.ok(Math.abs(final.z-(p[2]+p[7]*(p[5]-1)*p[4]/p[5]))<1e-9);
    assert.ok(Math.abs(final.y-(p[1]+(p[5]-1)*.5+.25))<1e-9);
    assert.equal(meshes[0].dimensions[p[6]?'width':'depth'],
      (p[4]/p[5]+.2)*1.5);
    assert.equal(meshes.at(-1).dimensions[p[6]?'width':'depth'],
      (p[4]/p[5]+.2)*1.5);
  }
});
