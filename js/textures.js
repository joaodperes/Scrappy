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

  // ── Cached materials (prevents flickering and improves performance) ────────────
  export const rwCache1 = lqMat('rwCache1', 'met_brn_block.png', 3, 2);
  export const rwCache2 = lqMat('rwCache2', 'met_grn_flat.png',  3, 2);

  export const M = {
    rustWall:   lqMat('rustWall',   'met_brn_block.png', 3, 2),
    rustWall2:  lqMat('rustWall2',  'met_grn_flat.png',  3, 2),
    dirt:       lqMat('dirt',       'med_bigdirt.png',  14, 14),
    concrete:   colMat('concrete',   0x4b5047),
    ceiling:    lqMat('ceiling',    'met_brn_flat.png',  4, 4),
    bridge:     colMat('bridge',     0x5a5f54),
    scrap:      lqMat('scrap',      'darkrock.png',      4, 4),
    barrel:     colMat('barrel',     0x880000), // darker red
    barrelBand: colMat('barrelBand', 0xffcc00),
    yellow:     colMat('yellow',     0xcebb00),
    black:      colMat('black',      0x111111),
    grey:       colMat('grey',       0x555555),
    gunMetal:   colMat('gunMetal',   0x2a2a2a),
    gunBrown:   colMat('gunBrown',   0x2a1508),
    ledGreen:   colMat('ledGreen',   0x44ff44, 0x44ff44),
    ledRed:     colMat('ledRed',     0xff3300, 0xff3300),
    ledBlue:    colMat('ledBlue',    0x3399ff, 0x3399ff),
    ledCyan:    colMat('ledCyan',    0x00ffcc, 0x00ffcc),
    healthMat:  colMat('healthMat',  0xff2233, 0x881122),
    armorMat:   colMat('armorMat',   0x2244ee, 0x112288),
    ammoMat:    colMat('ammoMat',    0xccbb00, 0x887700),
    rocketMat:  colMat('rocketMat',  0xbb3300),
    rocketNose: colMat('rocketNose', 0x774400),
    orange:     colMat('orange',     0xff8800, 0xff8800),
    plasmaMat:  colMat('plasmaMat',  0x4488ff, 0x4488ff),
    jumpPad:    colMat('jumpPad',    0x00cc66, 0x003311),
    carpet:     colMat('carpet',     0x3d4a35),
  };
