// textures.js – Babylon.js materials & procedural robot texture
const BABYLON = window.BABYLON;
import { scene } from './scene.js';

// ── Texture-ready gate ──────────────────────────────────────────────────────
export let texturesReady = true;   // Babylon loads async; we enable buttons immediately
let _onReady = null;
export function setOnTexturesReady(cb) { _onReady = cb; if (texturesReady) cb(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
const LQ = 'assets/textures/lq/';

function lqMat(name, file, uScale = 3, vScale = 2) {
  const mat = new BABYLON.StandardMaterial(name + '_' + Math.random().toString(36).slice(2), scene);
  const tex = new BABYLON.Texture(LQ + file, scene);
  tex.uScale = uScale; tex.vScale = vScale;
  mat.diffuseTexture = tex;
  mat.specularColor  = new BABYLON.Color3(0.08, 0.08, 0.08);
  return mat;
}

function colMat(name, hex, emissiveHex = 0x000000) {
  const mat = new BABYLON.StandardMaterial(name + '_' + Math.random().toString(36).slice(2), scene);
  mat.diffuseColor  = BABYLON.Color3.FromHexString('#' + hex.toString(16).padStart(6,'0'));
  mat.emissiveColor = BABYLON.Color3.FromHexString('#' + emissiveHex.toString(16).padStart(6,'0'));
  mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  return mat;
}

// ── Procedural pickup textures (canvas-generated, Quake / Doom style) ─────────
//
//  pickupTex(name, drawFn) – creates a 64×64 DynamicTexture using an HTML canvas.
//  drawFn receives a CanvasRenderingContext2D and the canvas (64×64) to draw on.
//
function pickupTex(name, drawFn) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  drawFn(c.getContext('2d'), c);
  const mat  = new BABYLON.StandardMaterial(name + '_mat', scene);
  const dtex = new BABYLON.DynamicTexture(name + '_dt', { width:64, height:64 }, scene, false);
  dtex.getContext().drawImage(c, 0, 0);
  dtex.update();
  mat.diffuseTexture = dtex;
  mat.emissiveTexture = dtex;          // self-lit so pickups glow in dark areas
  mat.emissiveColor   = new BABYLON.Color3(0.35, 0.35, 0.35);
  mat.specularColor   = new BABYLON.Color3(0.18, 0.18, 0.18);
  mat.specularPower   = 32;
  return mat;
}

// Health: dark steel box + bold red cross (classic medkit)
function _drawHealth(ctx) {
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,64,64);
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.strokeRect(2,2,60,60);
  ctx.fillStyle = '#bb1111'; ctx.fillRect(6,6,52,52);
  // Top/left shadow for depth
  ctx.fillStyle = '#881100'; ctx.fillRect(6,6,52,4); ctx.fillRect(6,6,4,52);
  // Cross – horizontal
  ctx.fillStyle = '#ffffff'; ctx.fillRect(14,25,36,14);
  // Cross – vertical
  ctx.fillRect(25,14,14,36);
  // Cross highlight edge
  ctx.fillStyle = '#ffe8e8'; ctx.fillRect(14,25,36,3); ctx.fillRect(25,14,3,36);
  // Corner rivets
  for (const [rx,ry] of [[5,5],[59,5],[5,59],[59,59]]) {
    ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(rx,ry,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#999'; ctx.beginPath(); ctx.arc(rx-.5,ry-.5,1,0,Math.PI*2); ctx.fill();
  }
}

// Armor: dark-blue steel plate with hexagonal badge and rivets
function _drawArmor(ctx) {
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0,0,64,64);
  ctx.strokeStyle = '#223344'; ctx.lineWidth = 2; ctx.strokeRect(2,2,60,60);
  ctx.fillStyle = '#183060'; ctx.fillRect(7,7,50,50);
  // Plate edges
  ctx.fillStyle = '#2255aa'; ctx.fillRect(7,7,50,5); ctx.fillRect(7,7,5,50);
  ctx.fillStyle = '#0c1a35'; ctx.fillRect(7,52,50,5); ctx.fillRect(52,7,5,50);
  // Hexagonal badge (approx: two rects overlapping)
  ctx.fillStyle = '#2266cc'; ctx.fillRect(22,18,20,28); ctx.fillRect(18,24,28,16);
  // Badge shine
  ctx.fillStyle = '#55aaff'; ctx.fillRect(22,18,20,4); ctx.fillRect(22,18,4,28);
  ctx.fillStyle = '#0a2050'; ctx.fillRect(22,42,20,4); ctx.fillRect(38,18,4,28);
  // 8-point rivet grid
  for (const [rx,ry] of [[10,10],[54,10],[10,54],[54,54],[32,9],[32,55],[9,32],[55,32]]) {
    ctx.fillStyle='#225'; ctx.beginPath(); ctx.arc(rx,ry,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#6af'; ctx.beginPath(); ctx.arc(rx-.5,ry-.5,1,0,Math.PI*2); ctx.fill();
  }
}

// Ammo: olive-drab crate, metal bands, stencilled lightning bolt
function _drawAmmo(ctx) {
  ctx.fillStyle = '#181806'; ctx.fillRect(0,0,64,64);
  // Crate body
  ctx.fillStyle = '#454b17'; ctx.fillRect(4,4,56,56);
  // Faint wood grain
  ctx.strokeStyle = '#393f12'; ctx.lineWidth = 1;
  for (let y=14; y<58; y+=10) { ctx.beginPath(); ctx.moveTo(4,y); ctx.lineTo(60,y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(32,4); ctx.lineTo(32,60); ctx.stroke();
  // Horizontal metal band
  ctx.fillStyle = '#282c0a'; ctx.fillRect(4,28,56,8);
  ctx.fillStyle = '#585e22'; ctx.fillRect(4,28,56,2);
  // Vertical metal band
  ctx.fillStyle = '#282c0a'; ctx.fillRect(28,4,8,56);
  ctx.fillStyle = '#585e22'; ctx.fillRect(28,4,2,56);
  // Stencil lightning bolt (yellow)
  ctx.fillStyle = '#d4d444';
  ctx.beginPath();
  ctx.moveTo(35,11); ctx.lineTo(23,34); ctx.lineTo(31,34);
  ctx.lineTo(27,53); ctx.lineTo(41,30); ctx.lineTo(33,30);
  ctx.lineTo(42,11); ctx.closePath(); ctx.fill();
  // Corner brackets
  ctx.strokeStyle = '#888840'; ctx.lineWidth = 2;
  for (const [bx,by,dx,dy] of [[4,4,1,1],[60,4,-1,1],[4,60,1,-1],[60,60,-1,-1]]) {
    ctx.beginPath(); ctx.moveTo(bx,by+dy*8); ctx.lineTo(bx,by); ctx.lineTo(bx+dx*8,by); ctx.stroke();
  }
}

// ── Procedural robot texture (canvas-generated) ───────────────────────────────
export function robotTex(name, r, g, b) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
  for (let y = 8; y < 32; y += 8) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(32,y); ctx.stroke(); }
  for (let x = 8; x < 32; x += 8) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,32); ctx.stroke(); }
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${150+Math.random()*60},${20+Math.random()*20},0,${.1+Math.random()*.18})`;
    ctx.fillRect(Math.random()*32, Math.random()*32, 2, 2);
  }
  const mat = new BABYLON.StandardMaterial(name, scene);
  const dtex = new BABYLON.DynamicTexture(name+'_dt', 32, scene, false);
  const dctx = dtex.getContext();
  dctx.drawImage(c, 0, 0);
  dtex.update();
  mat.diffuseTexture = dtex;
  mat.specularColor  = new BABYLON.Color3(0.05, 0.05, 0.05);
  return mat;
}

// Barrel body: rusty maroon steel drum with weld seam, ridges and rust stains
function _drawBarrel(ctx) {
  ctx.fillStyle = '#5a0c0c'; ctx.fillRect(0,0,64,128);
  // Weld seam
  ctx.fillStyle = '#3a0808'; ctx.fillRect(30,0,4,128);
  ctx.fillStyle = '#7a1010'; ctx.fillRect(31,0,1,128);
  // Horizontal construction ridges
  for (let y = 0; y < 128; y += 16) {
    ctx.fillStyle = '#3a0808'; ctx.fillRect(0,y,64,2);
    ctx.fillStyle = '#6e1010'; ctx.fillRect(0,y+2,64,1);
  }
  // Rust patches
  for (const [px,py,pw,ph] of [[8,20,14,18],[40,35,18,12],[5,70,12,22],[44,85,16,14],[20,105,20,10],[50,55,10,20]]) {
    ctx.fillStyle = 'rgba(160,60,10,0.55)'; ctx.fillRect(px,py,pw,ph);
    ctx.fillStyle = 'rgba(200,100,20,0.22)'; ctx.fillRect(px+2,py+2,pw-4,ph-4);
  }
  // Dents
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(10,50,6,4); ctx.fillRect(48,90,5,3); ctx.fillRect(22,15,4,5);
  ctx.fillStyle = 'rgba(255,180,120,0.08)'; ctx.fillRect(0,0,64,8);
}

// Barrel hoop: dark steel band with bolt holes and micro scratches
function _drawBarrelHoop(ctx) {
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0,0,64,16);
  ctx.fillStyle = '#2e2e2e'; ctx.fillRect(0,0,64,3);
  ctx.fillStyle = '#111';    ctx.fillRect(0,13,64,3);
  for (let x = 6; x < 64; x += 14) {
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x,8,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x-.5,7.5,1,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(80,80,80,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(i*8+3,4); ctx.lineTo(i*8+8,12); ctx.stroke();
  }
}

// Jump pad: dark metal + neon green chevrons inside a glow ring
function _drawJumpPad(ctx) {
  ctx.fillStyle = '#0e1a0e'; ctx.fillRect(0,0,64,64);
  ctx.strokeStyle = '#1a2e1a'; ctx.lineWidth = 1;
  for (let i = 8; i < 64; i += 8) {
    ctx.beginPath(); ctx.moveTo(i,0);  ctx.lineTo(i,64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i);  ctx.lineTo(64,i); ctx.stroke();
  }
  ctx.strokeStyle = '#00cc44'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32,32,28,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,204,68,0.3)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(32,32,24,0,Math.PI*2); ctx.stroke();
  // Three stacked upward chevrons (fades in intensity bottom to top)
  for (const [cy, alpha] of [[42,0.45],[33,0.70],[24,1.0]]) {
    ctx.strokeStyle = `rgba(0,255,85,${alpha})`; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(22,cy); ctx.lineTo(32,cy-9); ctx.lineTo(42,cy); ctx.stroke();
  }
  ctx.fillStyle = '#00ff55'; ctx.beginPath(); ctx.arc(32,32,3,0,Math.PI*2); ctx.fill();
}

// Weapon drop ring: glowing yellow targeting circle
function _drawWDropRing(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,64,64);
  ctx.strokeStyle = 'rgba(255,200,0,0.12)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(32,32,28,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,0,0.30)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(32,32,27,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,80,0.90)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32,32,26,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,80,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(32,32,20,0,Math.PI*2); ctx.stroke();
  // Tick marks at cardinal points
  ctx.strokeStyle = '#ffe040'; ctx.lineWidth = 2;
  for (const [x1,y1,x2,y2] of [[32,4,32,12],[60,32,52,32],[32,60,32,52],[4,32,12,32]]) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
}

  export const rwCache1 = lqMat('rwCache1', 'met_brn_block.png', 3, 2);
  export const rwCache2 = lqMat('rwCache2', 'met_grn_flat.png',  3, 2);

  export const M = {
    rustWall:   lqMat('rustWall',   'met_brn_block.png', 3, 2),
    rustWall2:  lqMat('rustWall2',  'met_grn_flat.png',  3, 2),
    dirt:       lqMat('dirt',       'med_bigdirt.png',  14, 14),
    concrete:   lqMat('concrete',   'conc1_1.png',       4, 4),
    ceiling:    lqMat('ceiling',    'met_brn_flat.png',  4, 4),
    bridge:     lqMat('bridge',     'met_brn_grate.png', 4, 4),
    scrap:      lqMat('scrap',      'darkrock.png',      4, 4),
    barrel:     pickupTex('barrel',      _drawBarrel),
    barrelHoop: pickupTex('barrelHoop',  _drawBarrelHoop),
    barrelBand: colMat('barrelBand', 0xffcc00),
    jumpPad:    pickupTex('jumpPad',     _drawJumpPad),
    wdropRing:  pickupTex('wdropRing',   _drawWDropRing),
    yellow:     colMat('yellow',     0xcebb00),
    black:      colMat('black',      0x111111),
    grey:       colMat('grey',       0x555555),
    gunMetal:   colMat('gunMetal',   0x2a2a2a),
    gunBrown:   colMat('gunBrown',   0x2a1508),
    ledGreen:   colMat('ledGreen',   0x44ff44, 0x44ff44),
    ledRed:     colMat('ledRed',     0xff3300, 0xff3300),
    ledBlue:    colMat('ledBlue',    0x3399ff, 0x3399ff),
    ledCyan:    colMat('ledCyan',    0x00ffcc, 0x00ffcc),
    healthMat:  pickupTex('health', _drawHealth),
    armorMat:   pickupTex('armor',  _drawArmor),
    ammoMat:    pickupTex('ammo',   _drawAmmo),
    rocketMat:  colMat('rocketMat',  0xbb3300),
    rocketNose: colMat('rocketNose', 0x774400),
    orange:     colMat('orange',     0xff8800, 0xff8800),
    plasmaMat:  colMat('plasmaMat',  0x4488ff, 0x4488ff),
    carpet:     lqMat('carpet',     'gravel1.png',       10, 10),
  };
