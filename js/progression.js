// progression.js – XP, levels, unlocks, challenges, persistence
// localStorage (offline) + Firebase cross-session sync

const XP_BASE = 200, XP_EXP = 1.4;
export function xpForLevel(level) { return Math.floor(XP_BASE * Math.pow(level, XP_EXP)); }
export function totalXpForLevel(level) { let t=0; for(let i=1;i<level;i++) t+=xpForLevel(i); return t; }
export function levelFromTotalXp(xp) { let lv=1; while(xp>=totalXpForLevel(lv+1)) lv++; return lv; }

export const XP_GRANTS = {
  killScout:15,killHeavy:30,killSniper:25,killDrone:20,killShotgun:22,killRocket:28,
  killPistol:12,killGrenadier:24,killGiantbot:200,killPvpPlayer:50,
  waveComplete:40,bossWave:120,matchWin:80,
};

// ── Attachment definitions ─────────────────────────────────────
export const ATTACHMENTS = {
  // Sights
  red_dot: {
    id:'red_dot', name:'Red Dot', slot:'sight',
    desc:'−30% spread. Adds a visible red laser pointer — betrays position in PvP!',
    icon:'🎯', mods:{spread:-0.30},
    visual:{type:'sight',style:'red_dot',adsZoom:0.88},
  },
  acog: {
    id:'acog', name:'ACOG Scope', slot:'sight',
    desc:'+25% range, −20% spread. Right-click shows circular scope overlay with zoom.',
    icon:'🔭', mods:{spread:-0.20,range:+0.25},
    visual:{type:'sight',style:'acog',adsZoom:0.62,scopeShape:'circle'},
  },
  thermal: {
    id:'thermal', name:'Thermal Optic', slot:'sight',
    desc:'Enemies glow through cover. Right-click zooms with circular overlay.',
    icon:'🌡️', mods:{},
    visual:{type:'sight',style:'thermal',adsZoom:0.55,scopeShape:'circle'},
  },
  // Barrels
  suppressor: {
    id:'suppressor', name:'Suppressor', slot:'barrel',
    desc:'−20% damage. Enemies not alerted at long range.',
    icon:'🔇', mods:{damage:-0.20},
    visual:{type:'barrel',style:'suppressor'},
  },
  heavy_barrel: {
    id:'heavy_barrel', name:'Heavy Barrel', slot:'barrel',
    desc:'+15% damage, −10% fire rate.',
    icon:'💪', mods:{damage:+0.15,cd:+0.10},
    visual:{type:'barrel',style:'heavy'},
  },
  compensator: {
    id:'compensator', name:'Compensator', slot:'barrel',
    desc:'−25% spread, no damage penalty.',
    icon:'⚙️', mods:{spread:-0.25},
    visual:{type:'barrel',style:'compensator'},
  },
  extended_barrel: {
    id:'extended_barrel', name:'Extended Barrel', slot:'barrel',
    desc:'+20% range, −10% spread.',
    icon:'📏', mods:{range:+0.20,spread:-0.10},
    visual:{type:'barrel',style:'extended'},
  },
  // Magazines — sizes: quick < normal < extended < drum
  quick_mag: {
    id:'quick_mag', name:'Quick Mag', slot:'magazine',
    desc:'+10% fire rate. Smaller than standard mag.',
    icon:'⚡', mods:{cd:-0.10},
    visual:{type:'magazine',style:'quick',magScale:0.72},
  },
  extended_mag: {
    id:'extended_mag', name:'Extended Mag', slot:'magazine',
    desc:'+50% ammo. Visibly longer magazine.',
    icon:'🔋', mods:{ammoMult:+0.50},
    visual:{type:'magazine',style:'extended',magScale:1.55},
  },
  drum_mag: {
    id:'drum_mag', name:'Drum Magazine', slot:'magazine',
    desc:'+100% ammo, −15% fire rate. Large cylindrical drum.',
    icon:'🥁', mods:{ammoMult:+1.00,cd:+0.15},
    visual:{type:'magazine',style:'drum',magScale:2.1},
  },
  // Grips
  angled_grip: {
    id:'angled_grip', name:'Angled Grip', slot:'grip',
    desc:'−20% spread while moving.',
    icon:'✊', mods:{spread:-0.20},
    visual:{type:'grip',style:'angled'},
  },
  vertical_grip: {
    id:'vertical_grip', name:'Vertical Grip', slot:'grip',
    desc:'−15% spread, better stability.',
    icon:'↕️', mods:{spread:-0.15},
    visual:{type:'grip',style:'vertical'},
  },
  // Stocks
  heavy_stock: {
    id:'heavy_stock', name:'Heavy Stock', slot:'stock',
    desc:'+10% damage.',
    icon:'🏋️', mods:{damage:+0.10},
    visual:{type:'stock',style:'heavy'},
  },
  folded_stock: {
    id:'folded_stock', name:'Folded Stock', slot:'stock',
    desc:'+10% move speed while ADS. Wire skeleton stock.',
    icon:'🏃', mods:{},
    visual:{type:'stock',style:'folded'},
  },
  // Specials — weapon-unique
  akimbo: {
    id:'akimbo', name:'Akimbo', slot:'special',
    desc:'Dual-wield! Doubles fire rate & ammo. Disables ADS.',
    icon:'⚔️', mods:{cd:-0.45,ammoMult:+1.0},
    visual:{type:'special',style:'akimbo'},
    disablesAds:true,
  },
  auto_fire: {
    id:'auto_fire', name:'Auto Fire', slot:'special',
    desc:'Shotgun becomes fully automatic. Not compatible with Akimbo.',
    icon:'🔁', mods:{cd:-0.35},
    visual:{type:'special',style:'auto'},
    incompatibleWith:['akimbo'],
  },
  power_cell: {
    id:'power_cell', name:'Power Cell', slot:'special',
    desc:'20% chance to recover 1 Railgun round on kill.',
    icon:'🔋', mods:{},
    visual:{type:'special',style:'power_cell'},
  },
  cluster_rounds: {
    id:'cluster_rounds', name:'Cluster Rounds', slot:'special',
    desc:'Grenades split into 4 bomblets on first wall impact. −20% direct damage.',
    icon:'💥', mods:{damage:-0.20},
    visual:{type:'special',style:'cluster'},
  },
};

export const WEAPON_ATTACHMENT_SLOTS = {
  PISTOL:    ['sight','barrel','special'],
  SMG:       ['sight','barrel','magazine','grip','stock'],
  SHOTGUN:   ['sight','barrel','magazine','grip','stock','special'],
  CHAINGUN:  ['barrel','magazine','grip'],
  RAILGUN:   ['sight','barrel','special'],
  PLASMA:    ['sight','magazine'],
  ROCKET:    ['sight'],
  GLAUNCHER: ['sight','barrel','special'],
};

export const WEAPON_SPECIALS = {
  PISTOL:['akimbo'], SHOTGUN:['akimbo','auto_fire'],
  RAILGUN:['power_cell'], GLAUNCHER:['cluster_rounds'],
};

// ── Skins ─────────────────────────────────────────────────────
export const WEAPON_SKINS = {
  default:    {id:'default',   name:'Factory',  desc:'Standard issue.',          body:[0.45,0.45,0.45],accent:[0.25,0.25,0.25],grip:[0.30,0.20,0.10]},
  midnight:   {id:'midnight',  name:'Midnight', desc:'All-black tactical.',      body:[0.05,0.05,0.05],accent:[0.10,0.10,0.10],grip:[0.05,0.05,0.05]},
  desert:     {id:'desert',    name:'Desert',   desc:'Sand and tan camo.',       body:[0.70,0.60,0.35],accent:[0.55,0.44,0.22],grip:[0.42,0.30,0.14]},
  arctic:     {id:'arctic',    name:'Arctic',   desc:'Snow-pattern white.',      body:[0.90,0.92,0.95],accent:[0.75,0.80,0.85],grip:[0.60,0.65,0.70]},
  hazard:     {id:'hazard',    name:'Hazard',   desc:'Safety orange and black.', body:[0.85,0.40,0.02],accent:[0.10,0.10,0.10],grip:[0.06,0.06,0.06]},
  plasma_glow:{id:'plasma_glow',name:'Plasma', desc:'Cyan energy accents.',     body:[0.10,0.15,0.25],accent:[0.05,0.80,0.90],grip:[0.05,0.10,0.15]},
  gold:       {id:'gold',      name:'Gold',     desc:'Prestige finish.',         body:[0.80,0.65,0.10],accent:[0.90,0.75,0.20],grip:[0.50,0.35,0.05]},
  crimson:    {id:'crimson',   name:'Crimson',  desc:'Blood red.',               body:[0.55,0.05,0.05],accent:[0.35,0.02,0.02],grip:[0.18,0.04,0.04]},
};

export const PLAYER_SKINS = {
  default:{id:'default',name:'Standard',body:[0.30,0.35,0.40],visor:[0.20,0.80,0.90]},
  ghost:  {id:'ghost',  name:'Ghost',   body:[0.85,0.88,0.90],visor:[0.70,0.75,0.80]},
  oni:    {id:'oni',    name:'Oni',     body:[0.60,0.05,0.05],visor:[1.00,0.30,0.00]},
  forest: {id:'forest', name:'Forest',  body:[0.15,0.30,0.10],visor:[0.30,0.80,0.20]},
  void:   {id:'void',   name:'Void',    body:[0.04,0.02,0.08],visor:[0.50,0.10,0.90]},
  gold:   {id:'gold',   name:'Prestige',body:[0.70,0.55,0.08],visor:[1.00,0.85,0.20]},
};

// ── Unlock table ──────────────────────────────────────────────
export const UNLOCK_TABLE = [
  // PISTOL
  {id:'red_dot',weapon:'PISTOL',type:'attachment',level:2},{id:'suppressor',weapon:'PISTOL',type:'attachment',level:5},
  {id:'heavy_barrel',weapon:'PISTOL',type:'attachment',level:9},{id:'extended_barrel',weapon:'PISTOL',type:'attachment',level:14},
  {id:'akimbo',weapon:'PISTOL',type:'attachment',level:8},
  // SMG
  {id:'red_dot',weapon:'SMG',type:'attachment',level:3},{id:'compensator',weapon:'SMG',type:'attachment',level:4},
  {id:'extended_mag',weapon:'SMG',type:'attachment',level:5},{id:'angled_grip',weapon:'SMG',type:'attachment',level:6},
  {id:'folded_stock',weapon:'SMG',type:'attachment',level:10},{id:'quick_mag',weapon:'SMG',type:'attachment',level:11},
  {id:'drum_mag',weapon:'SMG',type:'attachment',level:18},
  // SHOTGUN
  {id:'red_dot',weapon:'SHOTGUN',type:'attachment',level:4},{id:'compensator',weapon:'SHOTGUN',type:'attachment',level:7},
  {id:'extended_mag',weapon:'SHOTGUN',type:'attachment',level:9},{id:'vertical_grip',weapon:'SHOTGUN',type:'attachment',level:11},
  {id:'heavy_stock',weapon:'SHOTGUN',type:'attachment',level:14},{id:'akimbo',weapon:'SHOTGUN',type:'attachment',level:12},
  {id:'auto_fire',weapon:'SHOTGUN',type:'attachment',level:16},
  // CHAINGUN
  {id:'heavy_barrel',weapon:'CHAINGUN',type:'attachment',level:8},{id:'drum_mag',weapon:'CHAINGUN',type:'attachment',level:12},
  {id:'vertical_grip',weapon:'CHAINGUN',type:'attachment',level:16},{id:'compensator',weapon:'CHAINGUN',type:'attachment',level:20},
  // RAILGUN
  {id:'acog',weapon:'RAILGUN',type:'attachment',level:13},{id:'extended_barrel',weapon:'RAILGUN',type:'attachment',level:15},
  {id:'power_cell',weapon:'RAILGUN',type:'attachment',level:20},
  // PLASMA
  {id:'thermal',weapon:'PLASMA',type:'attachment',level:20},{id:'extended_mag',weapon:'PLASMA',type:'attachment',level:22},
  // ROCKET
  {id:'red_dot',weapon:'ROCKET',type:'attachment',level:18},
  // GLAUNCHER
  {id:'acog',weapon:'GLAUNCHER',type:'attachment',level:14},{id:'compensator',weapon:'GLAUNCHER',type:'attachment',level:16},
  {id:'cluster_rounds',weapon:'GLAUNCHER',type:'attachment',level:22},
  // Weapon skins
  {id:'midnight',weapon:'PISTOL',type:'weaponSkin',level:3},{id:'midnight',weapon:'SMG',type:'weaponSkin',level:4},
  {id:'midnight',weapon:'SHOTGUN',type:'weaponSkin',level:5},{id:'midnight',weapon:'CHAINGUN',type:'weaponSkin',level:6},
  {id:'midnight',weapon:'RAILGUN',type:'weaponSkin',level:7},{id:'midnight',weapon:'PLASMA',type:'weaponSkin',level:8},
  {id:'midnight',weapon:'ROCKET',type:'weaponSkin',level:9},{id:'midnight',weapon:'GLAUNCHER',type:'weaponSkin',level:10},
  {id:'desert',weapon:'PISTOL',type:'weaponSkin',level:6},{id:'desert',weapon:'SMG',type:'weaponSkin',level:7},
  {id:'desert',weapon:'SHOTGUN',type:'weaponSkin',level:8},{id:'desert',weapon:'CHAINGUN',type:'weaponSkin',level:9},
  {id:'desert',weapon:'RAILGUN',type:'weaponSkin',level:10},{id:'desert',weapon:'PLASMA',type:'weaponSkin',level:11},
  {id:'desert',weapon:'ROCKET',type:'weaponSkin',level:12},{id:'desert',weapon:'GLAUNCHER',type:'weaponSkin',level:13},
  {id:'arctic',weapon:'PISTOL',type:'weaponSkin',level:12},{id:'arctic',weapon:'SMG',type:'weaponSkin',level:13},
  {id:'arctic',weapon:'SHOTGUN',type:'weaponSkin',level:14},{id:'arctic',weapon:'CHAINGUN',type:'weaponSkin',level:15},
  {id:'arctic',weapon:'RAILGUN',type:'weaponSkin',level:16},{id:'arctic',weapon:'PLASMA',type:'weaponSkin',level:17},
  {id:'arctic',weapon:'ROCKET',type:'weaponSkin',level:18},{id:'arctic',weapon:'GLAUNCHER',type:'weaponSkin',level:19},
  {id:'hazard',weapon:'PISTOL',type:'weaponSkin',level:18},{id:'hazard',weapon:'SMG',type:'weaponSkin',level:19},
  {id:'hazard',weapon:'SHOTGUN',type:'weaponSkin',level:20},{id:'hazard',weapon:'CHAINGUN',type:'weaponSkin',level:21},
  {id:'hazard',weapon:'RAILGUN',type:'weaponSkin',level:22},{id:'hazard',weapon:'PLASMA',type:'weaponSkin',level:23},
  {id:'hazard',weapon:'ROCKET',type:'weaponSkin',level:24},{id:'hazard',weapon:'GLAUNCHER',type:'weaponSkin',level:25},
  {id:'plasma_glow',weapon:'PISTOL',type:'weaponSkin',level:24},{id:'plasma_glow',weapon:'SMG',type:'weaponSkin',level:25},
  {id:'plasma_glow',weapon:'SHOTGUN',type:'weaponSkin',level:26},{id:'plasma_glow',weapon:'CHAINGUN',type:'weaponSkin',level:27},
  {id:'plasma_glow',weapon:'RAILGUN',type:'weaponSkin',level:28},{id:'plasma_glow',weapon:'PLASMA',type:'weaponSkin',level:29},
  {id:'plasma_glow',weapon:'ROCKET',type:'weaponSkin',level:30},{id:'plasma_glow',weapon:'GLAUNCHER',type:'weaponSkin',level:31},
  // Player skins
  {id:'ghost',type:'playerSkin',level:10},{id:'forest',type:'playerSkin',level:17},
  {id:'oni',type:'playerSkin',level:24},{id:'void',type:'playerSkin',level:30},
  // Challenges
  {id:'crimson',weapon:'PISTOL',type:'weaponSkin',challenge:{desc:'Kill 25 enemies with the Pistol',track:'killsWith:PISTOL',target:25}},
  {id:'crimson',weapon:'SMG',type:'weaponSkin',challenge:{desc:'Kill 100 enemies with the SMG',track:'killsWith:SMG',target:100}},
  {id:'crimson',weapon:'SHOTGUN',type:'weaponSkin',challenge:{desc:'Kill 50 enemies with the Shotgun',track:'killsWith:SHOTGUN',target:50}},
  {id:'crimson',weapon:'CHAINGUN',type:'weaponSkin',challenge:{desc:'Kill 75 enemies with the Chaingun',track:'killsWith:CHAINGUN',target:75}},
  {id:'crimson',weapon:'RAILGUN',type:'weaponSkin',challenge:{desc:'Kill 30 enemies with the Railgun',track:'killsWith:RAILGUN',target:30}},
  {id:'crimson',weapon:'PLASMA',type:'weaponSkin',challenge:{desc:'Kill 40 enemies with the Plasma',track:'killsWith:PLASMA',target:40}},
  {id:'crimson',weapon:'ROCKET',type:'weaponSkin',challenge:{desc:'Kill 30 enemies with the Rocket',track:'killsWith:ROCKET',target:30}},
  {id:'crimson',weapon:'GLAUNCHER',type:'weaponSkin',challenge:{desc:'Kill 25 enemies with the Launcher',track:'killsWith:GLAUNCHER',target:25}},
  {id:'gold',weapon:'RAILGUN',type:'weaponSkin',challenge:{desc:'Kill 50 enemies with the Railgun',track:'killsWith:RAILGUN',target:50}},
  {id:'gold',weapon:'CHAINGUN',type:'weaponSkin',challenge:{desc:'Kill 150 with the Chaingun',track:'killsWith:CHAINGUN',target:150}},
  {id:'gold',weapon:'ROCKET',type:'weaponSkin',challenge:{desc:'Kill 50 enemies with the Rocket',track:'killsWith:ROCKET',target:50}},
  {id:'gold',type:'playerSkin',challenge:{desc:'Reach Wave 20 in solo mode',track:'maxWave',target:20}},
  {id:'suppressor',weapon:'SMG',type:'attachment',challenge:{desc:'Kill 25 Snipers',track:'killsOfType:sniper',target:25}},
  {id:'acog',weapon:'SMG',type:'attachment',challenge:{desc:'Kill 30 Drones',track:'killsOfType:drone',target:30}},
  {id:'thermal',weapon:'RAILGUN',type:'attachment',challenge:{desc:'Defeat 3 Boss waves',track:'bossWaveClears',target:3}},
  {id:'void',type:'playerSkin',challenge:{desc:'Kill 25 players in FFA',track:'pvpKills',target:25}},
];

// ── Profile ───────────────────────────────────────────────────
const STORAGE_KEY = 'botarena_profile';
const _WEAPONS = ['PISTOL','SMG','SHOTGUN','CHAINGUN','RAILGUN','PLASMA','ROCKET','GLAUNCHER'];

const _defaultProfile = () => ({
  name:'ANON', totalXp:0, level:1,
  unlocked:['default'],
  unlockedWeaponSkins:{PISTOL:[],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[]},
  unlockedAttachments:{PISTOL:['red_dot'],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[]},
  loadouts:{
    PISTOL:{skin:'default',attachments:{}},SMG:{skin:'default',attachments:{}},
    SHOTGUN:{skin:'default',attachments:{}},CHAINGUN:{skin:'default',attachments:{}},
    RAILGUN:{skin:'default',attachments:{}},PLASMA:{skin:'default',attachments:{}},
    ROCKET:{skin:'default',attachments:{}},GLAUNCHER:{skin:'default',attachments:{}},
  },
  playerSkin:'default',
  firebaseUid:null,
  stats:{totalKills:0,pvpKills:0,bossWaveClears:0,maxWave:0,killsOfType:{},killsWith:{}},
});

export let profile = _defaultProfile();

// ── Firebase cross-session persistence ────────────────────────
let _fbReady = false;

export async function initFirebaseAuth() {
  if (typeof firebase === 'undefined') return;
  try {
    // signInAnonymously is idempotent — same UID returned every time for this browser
    const cred = await firebase.auth().signInAnonymously();
    const uid  = cred.user.uid;
    _fbReady   = true;

    const cloudProfile = await _loadFromFirestore(uid);
    if (cloudProfile && cloudProfile.totalXp >= profile.totalXp) {
      // Cloud save is at least as advanced — use it
      profile = _deepMerge(_defaultProfile(), cloudProfile);
      profile.firebaseUid = uid;
      _saveToLocalStorage();
      console.log('[progression] Cross-session profile restored from cloud');
    } else {
      // Local save is newer or cloud is empty — push up
      profile.firebaseUid = uid;
      await _saveToFirestore();
    }
  } catch (e) {
    console.warn('[progression] Firebase auth unavailable, offline mode:', e.message);
  }
}

async function _loadFromFirestore(uid) {
  try {
    const doc = await firebase.firestore().collection('player_profiles').doc(uid).get();
    return doc.exists ? doc.data().profile : null;
  } catch { return null; }
}

async function _saveToFirestore() {
  if (!_fbReady || !profile.firebaseUid) return;
  try {
    await firebase.firestore().collection('player_profiles').doc(profile.firebaseUid).set(
      { profile, updated_at: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (e) { console.warn('[progression] Firestore save failed:', e.message); }
}

function _saveToLocalStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch {}
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const saved = JSON.parse(raw); profile = _deepMerge(_defaultProfile(), saved); _migrateOldWeaponSkins(); }
  } catch {}
  initFirebaseAuth(); // async — runs after returning
}

export function saveProfile() {
  _saveToLocalStorage();
  _saveToFirestore(); // fire-and-forget
}

function _migrateOldWeaponSkins() {
  const oldIds = ['midnight','desert','arctic','hazard','plasma_glow','gold','crimson'];
  const hadOld = profile.unlocked.some(id => oldIds.includes(id));
  if (!hadOld) return;
  for (const sid of oldIds) {
    if (!profile.unlocked.includes(sid)) continue;
    for (const w of _WEAPONS) {
      if (!profile.unlockedWeaponSkins[w]) profile.unlockedWeaponSkins[w]=[];
      if (!profile.unlockedWeaponSkins[w].includes(sid)) profile.unlockedWeaponSkins[w].push(sid);
    }
  }
  profile.unlocked = profile.unlocked.filter(id => Object.keys(PLAYER_SKINS).includes(id));
}

function _deepMerge(base, override) {
  const out={...base};
  for (const k of Object.keys(override)) {
    if (override[k]!==null && typeof override[k]==='object' && !Array.isArray(override[k]))
      out[k]=_deepMerge(base[k]??{},override[k]);
    else out[k]=override[k];
  }
  return out;
}

// ── XP ────────────────────────────────────────────────────────
export function awardXp(amount) {
  if (amount<=0) return [];
  profile.totalXp+=amount;
  const oldLevel=profile.level;
  profile.level=levelFromTotalXp(profile.totalXp);
  const newUnlocks=[];
  if (profile.level>oldLevel) {
    for (let lv=oldLevel+1;lv<=profile.level;lv++) {
      for (const u of UNLOCK_TABLE) {
        if (u.level!==lv) continue;
        if (u.type==='attachment') {
          const w=profile.unlockedAttachments[u.weapon];
          if (w&&!w.includes(u.id)){w.push(u.id);newUnlocks.push({...u,reason:`Level ${lv}`});}
        } else if (u.type==='weaponSkin') {
          if (!profile.unlockedWeaponSkins[u.weapon]) profile.unlockedWeaponSkins[u.weapon]=[];
          if (!profile.unlockedWeaponSkins[u.weapon].includes(u.id)){profile.unlockedWeaponSkins[u.weapon].push(u.id);newUnlocks.push({...u,reason:`Level ${lv}`});}
        } else {
          if (!profile.unlocked.includes(u.id)){profile.unlocked.push(u.id);newUnlocks.push({...u,reason:`Level ${lv}`});}
        }
      }
    }
    _showLevelUpToast(oldLevel,profile.level,newUnlocks);
  }
  saveProfile(); return newUnlocks;
}

// ── Stats ─────────────────────────────────────────────────────
export function recordKill(botType, weaponKey) {
  const s=profile.stats; s.totalKills++;
  if (botType==='pvp') s.pvpKills++;
  else { s.killsOfType[botType]=(s.killsOfType[botType]||0)+1; if(botType==='giantbot')s.bossWaveClears=(s.bossWaveClears||0)+1; }
  if (weaponKey) s.killsWith[weaponKey]=(s.killsWith[weaponKey]||0)+1;
  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  saveProfile(); return n;
}

export function recordWaveComplete(waveNum, isBoss) {
  if (typeof waveNum!=='number'||isNaN(waveNum)) return;
  profile.stats.maxWave=Math.max(profile.stats.maxWave||0, waveNum);
  if (isBoss) profile.stats.bossWaveClears=(profile.stats.bossWaveClears||0)+1;
  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  saveProfile();
}

function _checkChallenges() {
  const s=profile.stats; const news=[];
  for (const u of UNLOCK_TABLE) {
    if (!u.challenge) continue;
    if (u.type==='attachment'){const w=profile.unlockedAttachments[u.weapon];if(!w||w.includes(u.id))continue;}
    else if (u.type==='weaponSkin'){const w=profile.unlockedWeaponSkins[u.weapon];if(w&&w.includes(u.id))continue;}
    else{if(profile.unlocked.includes(u.id))continue;}
    const {track,target}=u.challenge; let val=0;
    if(track==='pvpKills')val=s.pvpKills||0;
    else if(track==='maxWave')val=s.maxWave||0;
    else if(track==='bossWaveClears')val=s.bossWaveClears||0;
    else if(track.startsWith('killsOfType:'))val=s.killsOfType[track.split(':')[1]]||0;
    else if(track.startsWith('killsWith:'))val=s.killsWith[track.split(':')[1]]||0;
    if(val>=target){
      if(u.type==='attachment')profile.unlockedAttachments[u.weapon].push(u.id);
      else if(u.type==='weaponSkin'){if(!profile.unlockedWeaponSkins[u.weapon])profile.unlockedWeaponSkins[u.weapon]=[];profile.unlockedWeaponSkins[u.weapon].push(u.id);}
      else profile.unlocked.push(u.id);
      news.push({...u,reason:u.challenge.desc});
    }
  }
  return news;
}

// ── Loadout ───────────────────────────────────────────────────
export function getLoadout(wName){return profile.loadouts[wName]??{skin:'default',attachments:{}};}

export function setWeaponSkin(wName,skinId){
  if(!isWeaponSkinUnlocked(wName,skinId))return false;
  (profile.loadouts[wName]??={skin:'default',attachments:{}}).skin=skinId;
  saveProfile();return true;
}

export function setAttachment(wName,slot,attachId){
  if(attachId&&!isAttachmentUnlocked(wName,attachId))return false;
  const lo=(profile.loadouts[wName]??={skin:'default',attachments:{}});
  if(attachId){
    const att=ATTACHMENTS[attachId];
    if(att?.incompatibleWith){for(const inc of att.incompatibleWith){for(const[s,id] of Object.entries(lo.attachments)){if(id===inc)delete lo.attachments[s];}}}
    lo.attachments[slot]=attachId;
  } else delete lo.attachments[slot];
  saveProfile();return true;
}

export function isAttachmentUnlocked(wName,attachId){return!!(profile.unlockedAttachments?.[wName]?.includes(attachId));}
export function isWeaponSkinUnlocked(wName,skinId){return skinId==='default'||!!(profile.unlockedWeaponSkins?.[wName]?.includes(skinId));}
export function isSkinUnlocked(skinId){return skinId==='default'||profile.unlocked.includes(skinId);}
export function setPlayerSkin(skinId){if(!isSkinUnlocked(skinId))return false;profile.playerSkin=skinId;saveProfile();return true;}

export function getEffectiveStats(wName,baseDefs){
  const lo=getLoadout(wName); const out={...baseDefs};
  for(const[,id] of Object.entries(lo.attachments)){const att=ATTACHMENTS[id];if(!att)continue;
    for(const[mod,delta] of Object.entries(att.mods)){
      if(mod==='ammoMult')out.startAmmo=Math.round((baseDefs.startAmmo||0)*(1+delta));
      else if(mod==='damage')out.dmg=Math.round(baseDefs.dmg*(1+delta));
      else if(mod==='spread')out.spread=Math.max(0,(baseDefs.spread||0)*(1+delta));
      else if(mod==='range')out.range=Math.round(baseDefs.range*(1+delta));
      else if(mod==='cd')out.cd=Math.max(0.02,baseDefs.cd*(1+delta));
    }
  }
  return out;
}

// Helpers for gameplay logic
export function getAdsFov(wName){const id=getLoadout(wName).attachments?.sight;return ATTACHMENTS[id]?.visual?.adsZoom??null;}
export function getScopeShape(wName){const id=getLoadout(wName).attachments?.sight;return ATTACHMENTS[id]?.visual?.scopeShape??null;}
export function isAkimbo(wName){return getLoadout(wName).attachments?.special==='akimbo';}
export function isAutoFire(wName){return getLoadout(wName).attachments?.special==='auto_fire';}
export function hasPowerCell(){return getLoadout('RAILGUN').attachments?.special==='power_cell';}
export function hasClusterRounds(){return getLoadout('GLAUNCHER').attachments?.special==='cluster_rounds';}
export function hasLaserDot(wName){return getLoadout(wName).attachments?.sight==='red_dot';}

export function getLevelProgress(){
  const lv=profile.level;const x=profile.totalXp-totalXpForLevel(lv);const n=xpForLevel(lv);
  return{level:lv,xpThisLevel:x,xpNeeded:n,pct:x/n};
}
export function getChallengeProgress(ch){
  const s=profile.stats;const{track,target}=ch;let val=0;
  if(track==='pvpKills')val=s.pvpKills||0;else if(track==='maxWave')val=s.maxWave||0;
  else if(track==='bossWaveClears')val=s.bossWaveClears||0;
  else if(track.startsWith('killsOfType:'))val=s.killsOfType[track.split(':')[1]]||0;
  else if(track.startsWith('killsWith:'))val=s.killsWith[track.split(':')[1]]||0;
  return{val,target,pct:Math.min(1,val/target)};
}
export function getUnlockHint(u){if(u.level)return`Reach Level ${u.level}`;if(u.challenge)return u.challenge.desc;return '';}

// ── Toasts ────────────────────────────────────────────────────
function _showLevelUpToast(oldLv,newLv,unlocks){
  const d=document.createElement('div');
  d.style.cssText='position:fixed;top:22%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.55);border:1px solid rgba(216,240,48,.5);padding:14px 28px;z-index:1100;text-align:center;font-family:"Courier New",monospace;pointer-events:none;animation:_fadeToast 2.2s forwards';
  d.innerHTML=`<div style="font-size:10px;color:#557733;letter-spacing:3px">LEVEL UP</div><div style="font-size:32px;font-weight:bold;color:#d8f030;margin:2px 0">${newLv}</div>${unlocks.map(u=>`<div style="font-size:11px;color:#aaa;margin-top:2px">🔓 ${u.id.replace(/_/g,' ').toUpperCase()}${u.weapon?' ('+u.weapon+')':''}</div>`).join('')}`;
  _ensureToastStyle();document.body.appendChild(d);setTimeout(()=>d.remove(),2300);
}
function _showUnlockToasts(unlocks){
  unlocks.forEach((u,i)=>setTimeout(()=>{
    const d=document.createElement('div');
    d.style.cssText='position:fixed;bottom:90px;right:20px;background:rgba(0,0,0,.55);border:1px solid rgba(216,240,48,.4);padding:7px 14px;z-index:1100;font-family:"Courier New",monospace;font-size:11px;color:#d8f030;animation:_fadeToast 2.0s forwards';
    d.innerHTML=`🔓 ${u.id.replace(/_/g,' ').toUpperCase()}${u.weapon?' — '+u.weapon:''}<br><span style="color:#557733;font-size:9px">${u.reason}</span>`;
    _ensureToastStyle();document.body.appendChild(d);setTimeout(()=>d.remove(),2100);
  },i*500));
}
function _ensureToastStyle(){
  if(document.getElementById('_toastStyle'))return;
  const s=document.createElement('style');s.id='_toastStyle';
  s.textContent='@keyframes _fadeToast{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(s);
}
