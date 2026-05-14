// progression.js – XP, levels, unlocks, challenges, persistence
// localStorage (offline) + Firebase cross-session sync
import { player } from './gameState.js';

const XP_BASE = 200, XP_EXP = 1.4;
export function xpForLevel(level) { return Math.floor(XP_BASE * Math.pow(level, XP_EXP)); }
export function totalXpForLevel(level) { let t=0; for(let i=1;i<level;i++) t+=xpForLevel(i); return t; }
export function levelFromTotalXp(xp) { let lv=1; while(xp>=totalXpForLevel(lv+1)) lv++; return lv; }

export const XP_GRANTS = {
  killScout:15,killHeavy:30,killSniper:25,killDrone:20,killShotgun:22,killRocket:28,
  killPistol:12,killGrenadier:24, killElectron_bot:22, killIon_sniper:30,
  killGiantbot:200,killPvpPlayer:50,
  killMedic_bot:18, killShield_bot:25, killTeleport_bot:20, killSwarm_host:35,
  waveComplete:40,bossWave:120,matchWin:80,
};

// XP granted to the weapon used, based on enemy killed
export const WEAPON_XP_GRANTS = {
  scout:15, heavy:30, sniper:18, drone:14, shotgun:16, rocket:20,
  pistol:9, grenadier:17, giantbot:150, pvp:35,
  electron_bot:16, ion_sniper:22,
  medic_bot:14, shield_bot:20, teleport_bot:16, swarm_host:28,
};

// Cumulative XP required for each level (index = level - 1)
const WEAPON_LEVEL_THRESHOLDS = [0, 250, 600, 1200, 2200, 3800, 6000, 9000, 13000, 18000];

export function getWeaponLevel(wName) {
  const xp = profile.stats.weaponXp?.[wName] || 0;
  let level = 1;
  for (let i = 1; i < WEAPON_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= WEAPON_LEVEL_THRESHOLDS[i]) level = i + 1; else break;
  }
  return level;
}

export function getWeaponLevelProgress(wName) {
  const xp    = profile.stats.weaponXp?.[wName] || 0;
  const level = getWeaponLevel(wName);
  const isMax = level >= WEAPON_LEVEL_THRESHOLDS.length;
  const cur   = WEAPON_LEVEL_THRESHOLDS[level - 1] || 0;
  const next  = WEAPON_LEVEL_THRESHOLDS[level]     || cur;
  return { level, xp, xpThisLevel: xp - cur, xpNeeded: next - cur,
           pct: isMax ? 1 : (xp - cur) / (next - cur), isMax };
}

const _recentKillTimes = {}; // { PISTOL: [t1, t2, ...], ... }
let _damageFlushTimer = null;
let _lastAnyKillTime = 0;
let _currentCombo    = 0;

// ── Attachment definitions ─────────────────────────────────────
export const ATTACHMENTS = {
  // Sights
  red_dot: {
    id:'red_dot', name:'Red Dot', slot:'sight',
    desc:'-30% spread. Adds a visible red laser pointer - betrays position in PvP!',
    icon:'🎯', mods:{spread:-0.30},
    visual:{type:'sight',style:'red_dot',adsZoom:0.88},
    disabled:true, // Not fully implemented yet - hidden from loadout UI
  },
  holo_sight: {
    id:'holo_sight', name:'Holographic Sight', slot:'sight',
    desc:'Open holographic reticle with moderate zoom. Cleaner picture than iron sights, no stat changes.',
    icon:'🔷', mods:{},
    visual:{type:'sight',style:'holo',adsZoom:0.78, scopeShape:'holo'},
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
  // Magazines
  quick_swap_mag: {
    id:'quick_swap_mag', name:'Quick Swap', slot:'magazine',
    desc:'Speed-loaded mag. Improves reload speed by 10% but reduces capacity by 15%.',
    icon:'⚡',
    mods:{ reloadMult:0.90, ammoMult:-0.15 },
    visual:{type:'magazine',style:'quick',magScale:0.70},
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
  tactical_grip: {
    id:'tactical_grip', name:'Tactical Grip', slot:'grip',
    desc:'+25% ADS speed, −15% spread. Snappy and precise.',
    icon:'🤜', mods:{ spread:-0.15, adsSpeedMult:1.25 },
    visual:{type:'grip',style:'tactical'},
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
  recoil_dampener: {
    id:'recoil_dampener', name:'Recoil Dampener', slot:'stock',
    desc:'Significantly reduces recoil. Weapon stays on target after firing.',
    icon:'🎯', mods:{recoilMult:0.25},
    visual:{type:'stock',style:'recoil_pad'},
  },
  // Specials — weapon-unique
  endless_magazine: {
    id:'endless_magazine', name:'Endless Magazine', slot:'special', weapon:'PISTOL',
    desc:'Infinite reserve ammo. Never scavenge for pistol rounds again.',
    icon:'∞', mods:{ammoType:'infinite'},
    visual:{type:'special',style:'endless_mag'},
    starterGear:true,
  },
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
    desc:'20% chance to recover 1 round on kill.',
    icon:'🔋', mods:{},
    visual:{type:'special',style:'power_cell'},
  },
  cluster_rounds: {
    id:'cluster_rounds', name:'Cluster Rounds', slot:'special',
    desc:'Grenades split into 4 bomblets on first wall impact. −20% direct damage.',
    icon:'💥', mods:{damage:-0.20},
    visual:{type:'special',style:'cluster'},
  },
  energy_coil: {
    id:'energy_coil', name:'Energy Coil', slot:'special',
    desc:'Headshot kills instantly vent 40% heat.',
    icon:'🌀', mods:{},
    visual:{type:'special',style:'energy_coil'},
  },
  slow_trigger: {
    id:'slow_trigger', name:'Slow Trigger', slot:'special',
    desc:'Converts to 3-shot burst mode. −70% heat per shot. Brief pause between bursts.',
    icon:'⏱️', mods:{heatMult:-0.70},
    visual:{type:'special',style:'slow_trigger'},
  },
  freefall_coil: {
    id:'freefall_coil', name:'Freefall Coil', slot:'special',
    desc:'While airborne, each shot vents 35% extra heat.',
    icon:'🪂', mods:{ heatMult:-0.35 }, // used contextually — only applies when !player.onGround
    visual:{type:'special',style:'energy_coil'},
  },
  mag_50_cal: {
    id:'mag_50_cal', name:'.50 Caliber', slot:'magazine', weapon:'PISTOL',
    desc:'Reduces magazine size by 6 and lowers fire rate, but massively increases damage per shot.',
    icon:'💢',
    mods:{ magSize:-6, cdMult:1.4, dmgMult:2.2 },
    visual:{type:'magazine',style:'heavy',magScale:0.85},
  },
  pdw_conversion: {
    id:'pdw_conversion', name:'PDW Conversion', slot:'magazine', weapon:'PISTOL',
    desc:'Increases magazine to 18, enables full-auto fire, but reduces damage per shot.',
    icon:'🔄',
    special:'auto_fire',
    mods:{ magSize:10, cdMult:0.65, dmgMult:0.6 },
    visual:{type:'magazine',style:'extended',magScale:1.40},
  },
  quick_trigger: {
    id:'quick_trigger', name:'Quick Trigger', slot:'special',
    desc:'+12% fire rate. Hair-trigger modification.',
    icon:'⚡', mods:{ cd:-0.12 },
    visual:{type:'special',style:'quick_trigger'},
  },
  explosive_bullets: {
    id:'explosive_bullets', name:'Explosive Bullets', slot:'special', weapon:'ION',
    desc:'Shots cause a small explosion on impact.',
    icon:'💥', mods:{splash:2.0},
    visual:{type:'special',style:'explosive_bullets'},
    secret:true,
  },
  emp_rounds: {
    id:'emp_rounds', name:'EMP Rounds', slot:'special',
    desc:'15% chance to stun robots for 1 second.',
    icon:'⚡', mods:{empChance:0.15},
    visual:{type:'special',style:'emp_rounds'},
  },
  scavenger: {
  id:'scavenger', name:'Scavenger', slot:'magazine',
  desc:'+30% bonus ammo on ammo pickups and weapon drops for the currently equipped weapon.',
  icon:'🎒', mods:{ scavengerBonus: 0.30 },
  visual:{ type:'magazine', style:'extended', magScale: 1.15 },
},
  // ── Flamethrower ──────────────────────────────────────────────────
  napalm_tank: {
    id:'napalm_tank', name:'Napalm Tank', slot:'magazine',
    desc:'+40% tank capacity. Burn longer.',
    icon:'🔥', mods:{ heatMult: -0.40 }, // Changed from ammoMult to heatMult
    visual:{type:'magazine',style:'extended',magScale:1.3},
  },
  wide_nozzle: {
    id:'wide_nozzle', name:'Wide Nozzle', slot:'barrel',
    desc:'+40% spread, +30% range. Wider flame cone.',
    icon:'📐', mods:{spread:+0.40,range:+0.30},
    visual:{type:'barrel',style:'heavy'},
  },
  long_barrel_fl: {
    id:'long_barrel_fl', name:'Long Barrel', slot:'barrel',
    desc:'+50% range, −25% spread. Longer, tighter flame stream.',
    icon:'📏', mods:{range:+0.50, spread:-0.25},
    visual:{type:'barrel',style:'extended'},
  },
  efficiency_tank: {
    id:'efficiency_tank', name:'Efficiency Tank', slot:'magazine',
    desc:'+35% damage per tick, +30% heat generation per shot. More power, shorter window.',
    icon:'⚗️', mods:{damage:+0.35, heatMult:+0.30},
    visual:{type:'magazine',style:'drum',magScale:1.2},
  },
  // ── Tesla Cannon ──────────────────────────────────────────────────
  amplifier_coil: {
    id:'amplifier_coil', name:'Amplifier Coil', slot:'special',
    desc:'+2 chain targets. Lightning jumps further.',
    icon:'🔗', mods:{chainTargets:+2},
    visual:{type:'barrel',style:'extended'},
  },
  magnet_coil: {
    id:'magnet_coil', name:'Magnet Coil', slot:'special',
    desc:'+100% chain lightning range.',
    icon:'🧲', mods:{chainRange:+1.0},   // +1.0 = 100% additive multiplier, handled in player.js
    visual:{type:'special',style:'energy_coil'},
  },
  capacitor_bank: {
    id:'capacitor_bank', name:'Capacitor Bank', slot:'magazine',
    desc:'+50% magazine size. Longer bursts before reload.',
    icon:'🔋', mods:{ammoMult:+0.50},
    visual:{type:'magazine',style:'drum',magScale:1.5},
  },
  // ── Crossbow ──────────────────────────────────────────────────
  explosive_tips: {
    id:'explosive_tips', name:'Explosive Tips', slot:'special',
    desc:'Bolts explode on impact. +splash damage.',
    icon:'💥', mods:{splash:3.0},
    visual:{type:'special',style:'explosive_tips'},
  },
  quick_loader: {
    id:'quick_loader', name:'Quick Loader', slot:'special',
    desc:'Reload 30% faster.',
    icon:'⚡', mods:{reloadMult:0.70},
    visual:{type:'magazine',style:'quick',magScale:0.8},
  },
  bolt_recovery: {
    id:'bolt_recovery', name:'Bolt Recovery', slot:'special',
    desc:'60% chance to recover 1 extra bolt on kill.',
    icon:'🔄', mods:{boltRecoveryChance:0.60},
  },
  // ── Chaingun ──────────────────────────────────────────────────
  spinning_module: {
    id:'spinning_module', name:'Spinning Module', slot:'special',
    desc:'Converts to minigun mode: 1-second spin-up before firing, no magazine limit (fires until empty), rate of fire increases the longer it fires.',
    icon:'🌪️', mods:{},
    visual:{type:'special',style:'spinning_module'},
  },
  carbon_fiber: {
    id:'carbon_fiber', name:'Carbon Fiber', slot:'special',
    desc:'+25% movement speed, but spread increases by 35%.',
    icon:'🪶', mods:{ speedMult:1.25, spread:+0.35 },
    visual:{type:'special',style:'carbon_fiber'},
  },
  // ── Plasma Rifle ──────────────────────────────────────────────
  energy_converter: {
    id:'energy_converter', name:'Energy Converter', slot:'magazine',
    desc:'Converts to energy weapon. Plasma Rifle pickups now reset heat instead of refunding ammo.',
    icon:'⚡', mods:{},
    visual:{type:'magazine',style:'quick',magScale:1.0},
  },
  dual_trigger: {
    id:'dual_trigger', name:'Dual Trigger', slot:'special',
    desc:'Swap between semi-auto (3-shot burst) and sniper mode (single shot, 3× damage) with [Q].',
    icon:'🔀', mods:{},
    visual:{type:'special',style:'dual_trigger'},
  },
  plasma_accelerator: {
    id:'plasma_accelerator', name:'Plasma Accelerator', slot:'barrel',
    desc:'+60% projectile speed. Bolts are harder to dodge at range.',
    icon:'💨', mods:{speed:+0.60},
    visual:{type:'barrel',style:'extended'},
  },
  // ── Rocket Launcher ───────────────────────────────────────────
  heavy_propellant: {
    id:'heavy_propellant', name:'Heavy Propellant', slot:'barrel',
    desc:'+50% rocket speed. Rockets travel faster and are harder to sidestep, but splash radius is reduced by 15%.',
    icon:'🚀', mods:{speed:+0.50, splash:-0.15},
    visual:{type:'barrel',style:'extended'},
  },
  // ── Grenade Launcher ──────────────────────────────────────────
  long_barrel_gl: {
    id:'long_barrel_gl', name:'Long Barrel', slot:'barrel',
    desc:'+40% grenade velocity and +15% range. Flatter arc — better for direct shots, worse for lobbing over cover.',
    icon:'📏', mods:{speed:+0.40, range:+0.15},
    visual:{type:'barrel',style:'extended'},
  },
  // ── Crossbow ──────────────────────────────────────────────────
  lightweight_limbs: {
    id:'lightweight_limbs', name:'Lightweight Limbs', slot:'barrel',
    desc:'+35% bolt speed and −10% reload time, at the cost of −10% damage.',
    icon:'🏹', mods:{speed:+0.35, reloadMult:0.90, damage:-0.10},
    visual:{type:'barrel',style:'compensator'},
  },
  // ── Railgun ───────────────────────────────────────────────────
  efficiency_module: {
    id:'efficiency_module', name:'Efficiency Module', slot:'special',
    desc:'Railgun pickups grant 1 extra round.',
    icon:'🔩', mods:{},
    visual:{type:'special',style:'efficiency_module'},
  },
  // ── Launchers ─────────────────────────────────────────────────
  seasoned_vet_rocket: {
    id:'seasoned_vet_rocket', name:'Seasoned Vet', slot:'special',
    desc:'Kills with the Rocket Launcher grant 2× XP.',
    icon:'🎖️', mods:{},
    visual:{type:'special',style:'seasoned_vet'},
    secret:true,
  },
  seasoned_vet_glauncher: {
    id:'seasoned_vet_glauncher', name:'Seasoned Vet', slot:'special',
    desc:'Kills with the Grenade Launcher grant 2× XP.',
    icon:'🎖️', mods:{},
    visual:{type:'special',style:'seasoned_vet'},
    secret:true,
  },
  rocket_burst: {
    id:'rocket_burst', name:'Rocket Burst', slot:'special',
    desc:'Each shot fires 3 rockets in quick succession. Consumes only 1 ammo per burst.',
    icon:'🚀', mods:{},
    visual:{type:'special',style:'rocket_burst'},
  },
};

export const WEAPON_ATTACHMENT_SLOTS = {
  PISTOL:    ['sight','barrel','magazine','grip','stock','special'],
  SMG:       ['sight','barrel','magazine','grip','stock','special'],
  SHOTGUN:   ['sight','barrel','magazine','grip','stock','special'],
  CHAINGUN:  ['sight','barrel','magazine','grip','stock','special'],
  RAILGUN:   ['sight','barrel','stock','special'],
  PLASMA:    ['sight','barrel','magazine','grip','stock','special'],
  ROCKET:    ['sight','barrel','magazine','stock','special'],
  GLAUNCHER: ['sight','barrel','magazine','stock','special'],
  ELECTRON:  ['sight','barrel','grip','stock','special'],
  ION:       ['sight','barrel','grip','stock','special'],
  FLAMETHROWER: ['sight','barrel','magazine','grip','stock'],
  TESLA:        ['sight','grip','stock','special'],
  CROSSBOW:     ['sight','barrel','grip','stock','special'],
};

export const WEAPON_SPECIALS = {
  PISTOL:    ['endless_mag','akimbo','quick_trigger'],
  SMG:       ['quick_trigger','akimbo'],
  SHOTGUN:   ['akimbo','auto_fire'],
  CHAINGUN:  ['spinning_module', 'carbon_fiber'],
  RAILGUN:   ['power_cell','efficiency_module'],
  PLASMA:    ['dual_trigger','emp_rounds'],
  ROCKET:    ['seasoned_vet_rocket','rocket_burst'],
  GLAUNCHER: ['cluster_rounds','seasoned_vet_glauncher'],
  ELECTRON:  ['slow_trigger','freefall_coil','emp_rounds'],
  ION:       ['energy_coil','explosive_bullets','emp_rounds'],
  FLAMETHROWER: [],
  TESLA:     ['amplifier_coil','magnet_coil'],
  CROSSBOW:  ['explosive_tips', 'quick_loader', 'bolt_recovery'],
};

// ── Skins ─────────────────────────────────────────────────────
export const WEAPON_SKINS = {
  default:    {id:'default',    name:'Factory',    desc:'Standard issue.',           body:[0.45,0.45,0.45], accent:[0.25,0.25,0.25], grip:[0.30,0.20,0.10]},
  midnight:   {id:'midnight',   name:'Midnight',   desc:'All-black tactical.',       body:[0.05,0.05,0.05], accent:[0.10,0.10,0.10], grip:[0.05,0.05,0.05]},
  desert:     {id:'desert',     name:'Desert',     desc:'Sand and tan camo.',        body:[0.70,0.60,0.35], accent:[0.55,0.44,0.22], grip:[0.42,0.30,0.14]},
  arctic:     {id:'arctic',     name:'Arctic',     desc:'Snow-pattern white.',       body:[0.75,0.78,0.82], accent:[0.50,0.55,0.60], grip:[0.35,0.40,0.45]},
  hazard:     {id:'hazard',     name:'Hazard',     desc:'Safety orange and black.',  body:[0.90,0.30,0.02], accent:[0.10,0.10,0.10], grip:[0.06,0.06,0.06]},
  jungle:     {id:'jungle',     name:'Jungle',     desc:'Dark ops foliage.',         body:[0.10,0.22,0.06], accent:[0.16,0.32,0.09], grip:[0.07,0.14,0.04]},
  plasma_glow:{id:'plasma_glow',name:'Plasma',     desc:'Cyan energy accents.',      body:[0.10,0.15,0.25], accent:[0.05,0.80,0.90], grip:[0.05,0.10,0.15]},
  toxic:      {id:'toxic',      name:'Toxic',      desc:'Radioactive slime finish.', body:[0.18,0.78,0.04], accent:[0.38,0.96,0.14], grip:[0.09,0.48,0.02]},
  gold:       {id:'gold',       name:'Gold',       desc:'Prestige finish.',          body:[0.83,0.70,0.25], accent:[0.96,0.88,0.52], grip:[0.55,0.40,0.15]},
  crimson:    {id:'crimson',    name:'Crimson',    desc:'Blood red.',                body:[0.22,0.01,0.01], accent:[0.12,0.01,0.01], grip:[0.08,0.01,0.01]},
  bengal:     {id:'bengal',     name:'Bengal',     desc:'Predator stripe pattern.',  body:[0.78,0.35,0.04], accent:[0.06,0.06,0.06], grip:[0.52,0.22,0.03]},
  dark_matter:{id:'dark_matter',name:'Dark Matter',desc:'Cosmic singularity.',       body:[0.04,0.01,0.12], accent:[0.50,0.05,0.90], grip:[0.06,0.02,0.14]},
};

export const SKIN_DIFFICULTY_ORDER = [
  'default','midnight','desert','crimson','arctic','hazard',
  'jungle','plasma_glow','toxic','gold','bengal','dark_matter'
];

export const PLAYER_SKINS = {
  default:{id:'default',name:'Standard',body:[0.30,0.35,0.40],visor:[0.20,0.80,0.90]},
  ghost:  {id:'ghost',  name:'Ghost',   body:[0.85,0.88,0.90],visor:[0.70,0.75,0.80]},
  oni:    {id:'oni',    name:'Oni',     body:[0.60,0.05,0.05],visor:[1.00,0.30,0.00]},
  forest: {id:'forest', name:'Forest',  body:[0.15,0.30,0.10],visor:[0.30,0.80,0.20]},
  void:   {id:'void',   name:'Void',    body:[0.04,0.02,0.08],visor:[0.50,0.10,0.90]},
  gold:   {id:'gold',   name:'Prestige',body:[0.70,0.55,0.08],visor:[1.00,0.85,0.20]},
  gladiator: {id:'gladiator', name:'Gladiator', body:[0.2,0.2,0.2], visor:[1.0,0.0,0.2]}, // Red/Black PvP skin
};

// ── Unlock table ──────────────────────────────────────────────
//
// Philosophy: ALL unlocks are weapon-kill based — no player level gates.
//   • Attachments: kill X enemies with that specific weapon (or a specific enemy type)
//   • Weapon skins: 6 tiers per weapon, each with a unique weapon-related challenge
//   • Specials: secret:true — icon shows as ??? until 10% progress, then reveals description
//
// skin tiers (easiest → hardest):
//   midnight  ~25–50 kills   — first reward for committing to a weapon
//   desert    ~60–120 kills  — steady progression
//   crimson   ~90–150 kills  — mid-tier mastery
//   arctic    ~150–240 kills — long-term dedication
//   hazard    enemy-type goal— rewards reading the battlefield
//   plasma_glow higher goal  — advanced challenge
//   gold      prestige        — maximum dedication

const _WNAME = { PISTOL:'Pistol', SMG:'SMG', SHOTGUN:'Shotgun', CHAINGUN:'Chaingun',
  RAILGUN:'Railgun', PLASMA:'Plasma Rifle', ROCKET:'Rocket Launcher',
  GLAUNCHER:'Grenade Launcher', ELECTRON:'Electron', ION:'Ion Sniper' };

export const UNLOCK_TABLE = [

  // ════════════════════════════════════════════════════════════════
  //  ATTACHMENTS — all weapon-kill challenges
  // ════════════════════════════════════════════════════════════════

  // ── PISTOL ────────────────────────────────────────────────────
  { id:'endless_mag', weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Reach Pistol level {target}.', track:'weaponLevel:PISTOL', target:1 } },
  { id:'holo_sight',     weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Pistol', track:'killsWhileJumping:PISTOL', target:15 } },
  { id:'acog',           weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} Snipers with the Pistol', track:'killsOfCombo:sniper_PISTOL', target:15 } },
  { id:'thermal',        weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} Ion Snipers with the Pistol', track:'killsOfCombo:ion_sniper_PISTOL', target:10 } },
  { id:'suppressor',      weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Pistol',  track:'killsWith:PISTOL', target:25 } },
  { id:'heavy_barrel',    weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Pistol', track:'killsWhileJumping:PISTOL', target:15 } },
  { id:'extended_barrel', weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Pistol',  track:'killsWith:PISTOL', target:50 } },
  { id:'quick_swap_mag',  weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Pistol', track:'killsWith:PISTOL', target:40 } },
  { id:'mag_50_cal',      weapon:'PISTOL', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Pistol', track:'killsOfCombo:heavy_PISTOL', target:10 } },
  { id:'pdw_conversion',  weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Pistol while airborne', track:'killsWhileJumping:PISTOL', target:30 } },
  { id:'akimbo',          weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Pistol',  track:'killsWith:PISTOL', target:75 } },
  { id:'compensator',   weapon:'PISTOL', type:'attachment', challenge:{ track:'killsOfCombo:scout_PISTOL',     target:25  } }, // scouts are fast — reward spread control
  { id:'angled_grip',   weapon:'PISTOL', type:'attachment', challenge:{ track:'killsWhileJumping:PISTOL',      target:20  } },
  { id:'vertical_grip', weapon:'PISTOL', type:'attachment', challenge:{ track:'multiKillsWith:PISTOL',         target:10  } }, // grip = fast follow-up shots
  { id:'tactical_grip', weapon:'PISTOL', type:'attachment', challenge:{ track:'killsFullyEquipped:PISTOL',     target:30  } },
  { id:'folded_stock',  weapon:'PISTOL', type:'attachment', challenge:{ track:'killsBareWeapon:PISTOL',        target:40  } }, // earn the stock by going without it
  { id:'heavy_stock',   weapon:'PISTOL', type:'attachment', challenge:{ track:'killsOfCombo:heavy_PISTOL',     target:15  } },
  { id:'quick_trigger', weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ desc:'Hit {target} headshots with the Pistol.', track:'headshotKills:PISTOL', target:20 } },
  { id:'scavenger', weapon:'PISTOL',   type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Pistol', track:'killsWith:PISTOL',   target:60 } },


  // ── SMG ───────────────────────────────────────────────────────
  { id:'holo_sight',  weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                         track:'killsWith:SMG',         target:25  } },
  { id:'acog',        weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} Drones with the SMG',                          track:'killsOfCombo:drone_SMG', target:30  } },
  { id:'thermal',     weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} Electron Bots with the SMG',                   track:'killsOfCombo:electron_bot_SMG', target:20 } },
  { id:'compensator',  weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                         track:'killsWith:SMG',         target:30  } },
  { id:'angled_grip',  weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the SMG',          track:'killsWhileJumping:SMG', target:20  } },
  { id:'folded_stock', weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                         track:'killsWith:SMG',         target:65  } },
  { id:'extended_mag', weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                         track:'killsWith:SMG',         target:50  } },
  { id:'quick_mag',    weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                         track:'killsWith:SMG',         target:80  } },
  { id:'drum_mag',     weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the SMG',                        track:'killsWith:SMG',          target:130 } },
  { id:'suppressor',   weapon:'SMG', type:'attachment',
    challenge:{ desc:'Kill {target} Snipers with the SMG',                         track:'killsOfType:sniper',    target:25  } },
  { id:'suppressor',    weapon:'SMG', type:'attachment', challenge:{ track:'killsBareWeapon:SMG',              target:40  } },
  { id:'extended_barrel',weapon:'SMG',type:'attachment', challenge:{ track:'killsWhileJumping:SMG',            target:30  } },
  { id:'heavy_barrel',  weapon:'SMG', type:'attachment', challenge:{ track:'killsOfCombo:heavy_SMG',           target:20  } },
  { id:'quick_swap_mag',weapon:'SMG', type:'attachment', challenge:{ track:'damageDealt:SMG',                  target:15000} },
  { id:'heavy_stock',   weapon:'SMG', type:'attachment', challenge:{ track:'killsOfCombo:scout_SMG',           target:50  } },
  { id:'vertical_grip', weapon:'SMG', type:'attachment', challenge:{ track:'killsWhileScoped:SMG',             target:30  } },
  { id:'tactical_grip', weapon:'SMG', type:'attachment', challenge:{ track:'killsFullyEquipped:SMG',           target:40  } },
  { id:'quick_trigger', weapon:'SMG', type:'attachment', challenge:{ track:'multiKillsWith:SMG',               target:20  } },
  { id:'akimbo', weapon:'SMG', type:'attachment', secret:true,
    challenge:{ desc:'Hit {target} headshots with the SMG.', track:'headshotKills:SMG', target:10 } },
  { id:'recoil_dampener', weapon:'SMG', type:'attachment', challenge:{ track:'killsOfCombo:scout_SMG',      target:60  } },
  { id:'scavenger', weapon:'SMG',      type:'attachment',
  challenge:{ desc:'Kill {target} enemies with the SMG',    track:'killsWith:SMG',      target:60 } },

  // ── SHOTGUN ──────────────────────────────────────────────────
  { id:'holo_sight',     weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Shotgun',                      track:'killsWith:SHOTGUN',         target:20  } },
  { id:'acog',           weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Pistol bots with the Shotgun',                  track:'killsOfCombo:pistol_SHOTGUN', target:15  } },
  { id:'thermal',        weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Ion Snipers with the Shotgun',                  track:'killsOfCombo:ion_sniper_SHOTGUN', target:10 } },
  { id:'vertical_grip', weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Shotgun',                  track:'killsWith:SHOTGUN',   target:30  } },
  { id:'heavy_stock',   weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Shotgun',   track:'killsWhileJumping:SHOTGUN', target:15 } },
  { id:'compensator',   weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Shotgun',                  track:'killsWith:SHOTGUN',   target:20  } },
  { id:'extended_mag',  weapon:'SHOTGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Shotgun',                  track:'killsWith:SHOTGUN',   target:40  } },
  { id:'akimbo',        weapon:'SHOTGUN', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Shotgun',                  track:'killsWith:SHOTGUN',   target:60  } },
  { id:'auto_fire',     weapon:'SHOTGUN', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} Heavy robots with the Shotgun',             track:'killsOfType:heavy',   target:30  } },
  { id:'suppressor',    weapon:'SHOTGUN', type:'attachment', challenge:{ track:'killsFullyEquipped:SHOTGUN',   target:30  } },
  { id:'extended_barrel',weapon:'SHOTGUN',type:'attachment', challenge:{ track:'damageDealt:SHOTGUN',          target:20000} },
  { id:'heavy_barrel',  weapon:'SHOTGUN', type:'attachment', challenge:{ track:'killsOfType:heavy',            target:25  } },
  { id:'quick_swap_mag',weapon:'SHOTGUN', type:'attachment', challenge:{ track:'killsOfCombo:shotgun_SHOTGUN', target:15  } }, // mirror-match
  { id:'drum_mag',      weapon:'SHOTGUN', type:'attachment', challenge:{ track:'damageDealt:SHOTGUN',          target:45000} },
  { id:'folded_stock',  weapon:'SHOTGUN', type:'attachment', challenge:{ track:'multiKillsWith:SHOTGUN',       target:25  } },
  { id:'angled_grip',   weapon:'SHOTGUN', type:'attachment', challenge:{ track:'killsWhileJumping:SHOTGUN',    target:20  } },
  { id:'tactical_grip', weapon:'SHOTGUN', type:'attachment', challenge:{ track:'killsBareWeapon:SHOTGUN',      target:50  } },
  { id:'recoil_dampener', weapon:'SHOTGUN', type:'attachment', challenge:{ track:'headshotKills:SHOTGUN',      target:15  } },
  { id:'scavenger', weapon:'SHOTGUN',  type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Shotgun',track:'killsWith:SHOTGUN',  target:50 } },

  // ── CHAINGUN ─────────────────────────────────────────────────
  { id:'holo_sight',     weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Chaingun',                  track:'killsWith:CHAINGUN',          target:30  } },
  { id:'acog',           weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Scouts with the Chaingun',                   track:'killsOfCombo:scout_CHAINGUN', target:50  } },
  { id:'thermal',        weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Drones with the Chaingun',                   track:'killsOfCombo:drone_CHAINGUN', target:30  } },
  { id:'heavy_barrel',  weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Chaingun',                 track:'killsWith:CHAINGUN',  target:30  } },
  { id:'vertical_grip', weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Chaingun',                 track:'killsWith:CHAINGUN',  target:60  } },
  { id:'compensator',   weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Scouts with the Chaingun',                  track:'killsOfType:scout',   target:40  } },
  { id:'drum_mag',      weapon:'CHAINGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Chaingun',                track:'killsWith:CHAINGUN',  target:150 } },
  { id:'spinning_module', weapon:'CHAINGUN', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies while airborne with the Chaingun',  track:'killsWhileJumping:CHAINGUN', target:80 } },
  { id:'suppressor',    weapon:'CHAINGUN', type:'attachment', challenge:{ track:'killsOfType:scout',           target:80  } }, // suppress scouts
  { id:'extended_barrel',weapon:'CHAINGUN',type:'attachment', challenge:{ track:'damageDealt:CHAINGUN',        target:30000} },
  { id:'quick_swap_mag',weapon:'CHAINGUN', type:'attachment', challenge:{ track:'killsOfCombo:drone_CHAINGUN', target:50  } },
  { id:'extended_mag',  weapon:'CHAINGUN', type:'attachment', challenge:{ track:'damageDealt:CHAINGUN',        target:65000} },
  { id:'heavy_stock',   weapon:'CHAINGUN', type:'attachment', challenge:{ track:'killsFullyEquipped:CHAINGUN', target:50  } },
  { id:'folded_stock',  weapon:'CHAINGUN', type:'attachment', challenge:{ track:'multiKillsWith:CHAINGUN',     target:30  } },
  { id:'angled_grip',   weapon:'CHAINGUN', type:'attachment', challenge:{ track:'killsWhileJumping:CHAINGUN',  target:40  } },
  { id:'carbon_fiber',  weapon:'CHAINGUN', type:'attachment', secret:true, challenge:{ track:'multiKillsWith:CHAINGUN', target:30 } },
  { id:'scavenger', weapon:'CHAINGUN', type:'attachment',
  challenge:{ desc:'Kill {target} enemies with the Chaingun',track:'killsWith:CHAINGUN',target:80 } },

  // ── RAILGUN ──────────────────────────────────────────────────
  { id:'holo_sight',       weapon:'RAILGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Railgun',                   track:'killsWith:RAILGUN',          target:5   } },
  { id:'acog',             weapon:'RAILGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Snipers with the Railgun',                   track:'killsOfCombo:sniper_RAILGUN', target:15  } },
  { id:'thermal',          weapon:'RAILGUN', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Railgun',             track:'killsOfType:heavy',   target:15  } },
  { id:'extended_barrel', weapon:'RAILGUN', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Railgun',                  track:'killsWith:RAILGUN',   target:20  } },
  { id:'power_cell',      weapon:'RAILGUN', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} Snipers with the Railgun',                  track:'killsOfType:sniper',  target:25  } },
  { id:'efficiency_module', weapon:'RAILGUN', type:'attachment', secret:true,
    challenge:{ desc:'Pick up {target} Railgun ammo drops', track:'railgunPickups', target:20 } },
  { id:'suppressor',    weapon:'RAILGUN', type:'attachment', challenge:{ track:'killsOfCombo:sniper_RAILGUN',  target:20  } }, // sniper v sniper
  { id:'extended_barrel',weapon:'RAILGUN',type:'attachment', challenge:{ track:'killsWhileScoped:RAILGUN',     target:20  } },
  { id:'compensator',   weapon:'RAILGUN', type:'attachment', challenge:{ track:'killsOfCombo:heavy_RAILGUN',   target:12  } },
  { id:'heavy_barrel',  weapon:'RAILGUN', type:'attachment', challenge:{ track:'killsOfCombo:drone_RAILGUN',   target:15  } },
  //{ id:'quick_swap_mag',weapon:'RAILGUN', type:'attachment', challenge:{ track:'damageDealt:RAILGUN',          target:18000} },
  { id:'heavy_stock',   weapon:'RAILGUN', type:'attachment', challenge:{ track:'killsBareWeapon:RAILGUN',      target:15  } },
  { id:'folded_stock',  weapon:'RAILGUN', type:'attachment', challenge:{ track:'multiKillsWith:RAILGUN',       target:8   } }, // tight for a sniper — high bar

  // ── PLASMA ───────────────────────────────────────────────────
  { id:'holo_sight',         weapon:'PLASMA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',              track:'killsWith:PLASMA',           target:15  } },
  { id:'thermal',            weapon:'PLASMA', type:'attachment',
    challenge:{ desc:'Kill {target} Drone bots with the Plasma Rifle',           track:'killsOfCombo:drone_PLASMA',  target:20  } },
  { id:'acog',               weapon:'PLASMA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Plasma Rifle while scoped', track:'killsWhileScoped:PLASMA',    target:30  } },
  { id:'extended_mag',       weapon:'PLASMA', type:'attachment',
    challenge:{ desc:'Kill {target} Drones with the Plasma Rifle',               track:'killsOfType:drone',          target:30  } },
  { id:'plasma_accelerator', weapon:'PLASMA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Plasma Rifle while airborne', track:'killsWhileJumping:PLASMA', target:25  } },
  { id:'energy_converter', weapon:'PLASMA', type:'attachment', secret:true,
    challenge:{ desc:'Pick up {target} Plasma Rifle drops',                      track:'energyPickups:PLASMA',       target:15  } },
  { id:'dual_trigger',       weapon:'PLASMA', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',              track:'killsWith:PLASMA',           target:60  } },
  { id:'suppressor',    weapon:'PLASMA', type:'attachment', challenge:{ track:'killsWhileScoped:PLASMA',       target:20  } },
  { id:'extended_barrel',weapon:'PLASMA',type:'attachment', challenge:{ track:'damageDealt:PLASMA',            target:25000} },
  { id:'compensator',   weapon:'PLASMA', type:'attachment', challenge:{ track:'killsOfCombo:drone_PLASMA',     target:20  } },
  { id:'heavy_barrel',  weapon:'PLASMA', type:'attachment', challenge:{ track:'killsOfCombo:heavy_PLASMA',     target:20  } },
  { id:'quick_swap_mag',weapon:'PLASMA', type:'attachment', challenge:{ track:'multiKillsWith:PLASMA',         target:20  } },
  { id:'extended_mag',  weapon:'PLASMA', type:'attachment', challenge:{ track:'killsOfType:electron_bot',      target:25  } },
  { id:'drum_mag',      weapon:'PLASMA', type:'attachment', challenge:{ track:'damageDealt:PLASMA',            target:65000} },
  { id:'heavy_stock',   weapon:'PLASMA', type:'attachment', challenge:{ track:'killsFullyEquipped:PLASMA',     target:40  } },
  { id:'folded_stock',  weapon:'PLASMA', type:'attachment', challenge:{ track:'killsBareWeapon:PLASMA',        target:30  } },
  { id:'angled_grip',   weapon:'PLASMA', type:'attachment', challenge:{ track:'killsWhileJumping:PLASMA',      target:20  } },
  { id:'vertical_grip', weapon:'PLASMA', type:'attachment', challenge:{ track:'killsOfCombo:scout_PLASMA',     target:40  } },
  { id:'emp_rounds', weapon:'PLASMA', type:'attachment', challenge:{ track:'killsOfCombo:ninja_PLASMA',    target:30  } },

  // ── ROCKET ────────────────────────────────────────────────────
  { id:'holo_sight',   weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',                    track:'killsWith:ROCKET',          target:8   } },
  { id:'acog',         weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Rocket Launcher',     track:'killsWhileJumping:ROCKET',  target:5   } },
  { id:'thermal',      weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} bosses with the Rocket Launcher',                     track:'explosiveKills',           target:50   } },
  { id:'suppressor',   weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Rocket Launcher',     track:'killsWhileJumping:ROCKET',  target:15  } },
  { id:'heavy_barrel', weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',                    track:'killsWith:ROCKET',          target:20  } },
  { id:'seasoned_vet_rocket', weapon:'ROCKET', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} bosses with the Rocket Launcher',                     track:'killedBossWith:ROCKET',     target:1   } },
  { id:'extended_barrel',weapon:'ROCKET',type:'attachment', challenge:{ track:'killsWhileJumping:ROCKET',      target:10  } }, // rocket jump kills
  { id:'heavy_propellant',weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with direct rocket hits', track:'killsWith:ROCKET', target:30 } },
  { id:'quick_swap_mag',weapon:'ROCKET', type:'attachment', challenge:{ track:'killsOfCombo:heavy_ROCKET',     target:8   } },
  { id:'extended_mag',  weapon:'ROCKET', type:'attachment', challenge:{ track:'damageDealt:ROCKET',            target:22000} },
  { id:'heavy_stock',   weapon:'ROCKET', type:'attachment', challenge:{ track:'multiKillsWith:ROCKET',         target:15  } },
  { id:'folded_stock',  weapon:'ROCKET', type:'attachment', challenge:{ track:'killsOfCombo:scout_ROCKET',     target:20  } }, // rockets vs fast targets
  { id:'rocket_burst',  weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Rocket Launcher', track:'killsWith:ROCKET', target:25 } },

  // ── Wonder Weapon secret challenge ──────────────────────────
  // Tracked under player challenges (no weapon): requires picking up all 3 wonder weapons first
  { id:'wonder_weapon_secret', type:'playerSkin', secret:true,
    challenge:{ desc:'Collect all 3 Wonder Weapons in a single run', track:'allWonderWeaponsCollected', target:1 } },

  // ── GLAUNCHER ─────────────────────────────────────────────────
  { id:'holo_sight',   weapon:'GLAUNCHER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',              track:'killsWith:GLAUNCHER',               target:10  } },
  { id:'acog',         weapon:'GLAUNCHER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',              track:'killsWith:GLAUNCHER',               target:15  } },
  { id:'thermal',      weapon:'GLAUNCHER', type:'attachment',
    challenge:{ desc:'Kill {target} Grenadiers with the Grenade Launcher',           track:'killsOfCombo:grenadier_GLAUNCHER',  target:20  } },
  { id:'compensator',  weapon:'GLAUNCHER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',              track:'killsWith:GLAUNCHER',               target:25  } },
  { id:'cluster_rounds', weapon:'GLAUNCHER', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',              track:'explosiveKills',               target:30  } },
  { id:'seasoned_vet_glauncher', weapon:'GLAUNCHER', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} bosses with the Grenade Launcher',               track:'killedBossWith:GLAUNCHER',          target:1   } },
  { id:'suppressor',    weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'killsOfCombo:grenadier_GLAUNCHER', target:15 } },
  { id:'extended_barrel',weapon:'GLAUNCHER',type:'attachment', challenge:{ track:'killsOfType:grenadier',      target:15  } },
  { id:'long_barrel_gl', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with direct grenade hits', track:'killsWith:GLAUNCHER', target:25 } },
  { id:'heavy_barrel',  weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'multiKillsWith:GLAUNCHER',   target:15  } },
  { id:'quick_swap_mag',weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'killsWhileJumping:GLAUNCHER',target:20  } },
  { id:'extended_mag',  weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'damageDealt:GLAUNCHER',      target:18000} },
  { id:'heavy_stock',   weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'maxKillCombo',               target:8   } }, // reward big wave clearing
  { id:'folded_stock',  weapon:'GLAUNCHER', type:'attachment', challenge:{ track:'killsOfCombo:rocket_GLAUNCHER', target:12} },

  // ── ELECTRON ──────────────────────────────────────────────────
  { id:'holo_sight',       weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Electron',                      track:'killsWith:ELECTRON',          target:15  } },
  { id:'acog',             weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} Scouts with the Electron',                       track:'killsOfCombo:scout_ELECTRON', target:25  } },
  { id:'thermal',          weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Electron while scoped',         track:'killsWhileScoped:ELECTRON',   target:30  } },
  { id:'compensator',      weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Electron',                      track:'killsWith:ELECTRON',          target:35  } },
  { id:'heavy_barrel',     weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} Scouts with the Electron',                       track:'killsOfCombo:scout_ELECTRON', target:25  } },
  { id:'extended_barrel',  weapon:'ELECTRON', type:'attachment',
    challenge:{ desc:'Kill {target} bosses with the Electron',                        track:'killedBossWith:ELECTRON',  target:2  } },
  { id:'slow_trigger',    weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Electron while airborne', track:'killsWhileJumping:ELECTRON', target:30 } },
  
  { id:'heavy_stock',   weapon:'ELECTRON', type:'attachment', challenge:{ track:'killsOfCombo:electron_bot_ELECTRON', target:20 } },
  { id:'folded_stock',  weapon:'ELECTRON', type:'attachment', challenge:{ track:'damageDealt:ELECTRON',  target:5000  } },
  { id:'angled_grip',   weapon:'ELECTRON', type:'attachment', challenge:{ track:'multiKillsWith:ELECTRON',     target:20  } },
  { id:'vertical_grip', weapon:'ELECTRON', type:'attachment', challenge:{ track:'killsWhileScoped:ELECTRON',   target:25  } },
  { id:'freefall_coil', weapon:'ELECTRON', type:'attachment', secret:true, challenge:{ track:'killsWhileJumping:ELECTRON', target:40 } },
  { id:'emp_rounds', weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ desc:'Stun {target} enemies with EMP rounds', track:'empStuns', target:50 } },

  // ── ION ───────────────────────────────────────────────────────
  { id:'holo_sight',       weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper',                    track:'killsWith:ION',              target:15   } },
  { id:'acog',             weapon:'ION', type:'attachment',
    challenge:{ desc:'Get {target} multi-kills with the Ion Sniper',                    track:'multiKillsWith:ION',              target:5  } },
  { id:'thermal',        weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper while scoped',       track:'killsWhileScoped:ION',        target:30  } },
  { id:'extended_barrel',  weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper',                    track:'killsWith:ION',              target:30  } },
  { id:'energy_coil',      weapon:'ION', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper while airborne',       track:'killsWhileJumping:ION',       target:30  } },
  { id:'suppressor',    weapon:'ION', type:'attachment', challenge:{ track:'killsOfCombo:sniper_ION',          target:8   } },
  { id:'heavy_barrel',  weapon:'ION', type:'attachment', challenge:{ track:'killsOfCombo:heavy_ION',           target:10  } },
  { id:'compensator',   weapon:'ION', type:'attachment', challenge:{ track:'killsWhileScoped:ION',             target:25  } },
  //{ id:'quick_swap_mag',weapon:'ION', type:'attachment', challenge:{ track:'damageDealt:ION',                  target:15000} },
  { id:'heavy_stock',   weapon:'ION', type:'attachment', challenge:{ track:'killedBossWith:ION',               target:2   } },
  { id:'folded_stock',  weapon:'ION', type:'attachment', challenge:{ track:'multiKillsWith:ION',               target:5   } },
  { id:'angled_grip',   weapon:'ION', type:'attachment', challenge:{ track:'killsWhileJumping:ION',            target:15  } },
  { id:'vertical_grip', weapon:'ION', type:'attachment', challenge:{ track:'killsOfCombo:drone_ION',           target:20  } },
  { id:'explosive_bullets', weapon:'ION', type:'attachment', secret:true,
    challenge:{ desc:'Destroy {target} explosive barrels', track:'barrelDestroys', target:30 } },
  { id:'emp_rounds', weapon:'ION', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} Heavy robots with the Ion Sniper', track:'killsOfCombo:heavy_ELECTRON', target:15 } },

  // ── JUNGLE WEAPONS ATTACHMENTS ───────────────────────────────
  { id:'napalm_tank', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} Swarm Hosts with the Flamethrower', track:'killsOfCombo:swarm_host_FLAMETHROWER', target:10 } },
  { id:'wide_nozzle', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Flamethrower', track:'killsWith:FLAMETHROWER', target:50 } },
  { id:'holo_sight',     weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the environment', track:'killsWith:ENVIRONMENT', target:15 } },
  { id:'acog',           weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} Shield Bots with the Flamethrower', track:'killsOfCombo:shield_bot_FLAMETHROWER', target:15 } },
  { id:'thermal',        weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} Medic Bots with the Flamethrower', track:'killsOfCombo:medic_bot_FLAMETHROWER', target:10 } },
  { id:'angled_grip',   weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Flamethrower', track:'killsWhileJumping:FLAMETHROWER', target:15 } },
  { id:'vertical_grip', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Flamethrower', track:'damageDealt:FLAMETHROWER', target:40000 } },
  { id:'tactical_grip', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} Swarm Hosts with the Flamethrower', track:'killsOfCombo:swarm_host_FLAMETHROWER', target:8 } },
  { id:'heavy_stock',   weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Flamethrower', track:'killsOfCombo:heavy_FLAMETHROWER', target:20 } },
  { id:'folded_stock',  weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Flamethrower while airborne', track:'killsWhileJumping:FLAMETHROWER', target:25 } },
  { id:'efficiency_tank', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ desc:'Collect {target} Flamethrower pickups', track:'flamethrowerPickups', target:15 }},

  { id:'amplifier_coil', weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with Tesla Chain Lightning', track:'killsWith:TESLA_CHAIN', target:15 } },
  { id:'capacitor_bank', weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} Shield Bots with the Tesla Cannon', track:'killsOfCombo:shield_bot_TESLA', target:10 } },
  { id:'holo_sight',     weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Tesla Cannon', track:'killsWhileJumping:TESLA', target:15 } },
  { id:'acog',           weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} Swarm Hosts with the Tesla Cannon', track:'killsOfCombo:swarm_host_TESLA', target:15 } },
  { id:'thermal',        weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} Teleport Bots with the Tesla Cannon', track:'killsOfCombo:teleport_bot_TESLA', target:10 } },
  { id:'auto_fire',     weapon:'TESLA', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} Heavy robots with the Tesla Cannon',             track:'killsOfType:heavy',   target:30  } },
    { id:'angled_grip',   weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Tesla Cannon', track:'killsWhileJumping:TESLA', target:20 } },
  { id:'vertical_grip', weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Tesla Cannon', track:'killsWith:TESLA', target:40 } },
  { id:'tactical_grip', weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} Shield Bots with the Tesla Cannon', track:'killsOfCombo:shield_bot_TESLA', target:15 } },
  { id:'heavy_stock',   weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Tesla Cannon', track:'killsOfCombo:heavy_TESLA', target:20 } },
  { id:'folded_stock',  weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Tesla Cannon', track:'killsWith:TESLA', target:80 } },
  { id:'magnet_coil', weapon:'TESLA', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with Tesla Chain Lightning', track:'killsWith:TESLA_CHAIN', target:40 } },

  { id:'explosive_tips', weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} Teleport Bots with the Crossbow', track:'killsOfCombo:teleport_bot_CROSSBOW', target:10 } },
  { id:'quick_loader', weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Crossbow', track:'killsWith:CROSSBOW', target:50 } },
  { id:'holo_sight',     weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Crossbow', track:'killsWhileJumping:CROSSBOW', target:15 } },
  { id:'acog',           weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} Ninjas with the Crossbow', track:'killsOfCombo:ninja_CROSSBOW', target:15 } },
  { id:'thermal',        weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Crossbow', track:'killsOfCombo:heavy_CROSSBOW', target:10 } },
  { id:'extended_barrel',weapon:'CROSSBOW',type:'attachment', 
    challenge:{ desc:'Kill {target} enemies with the environment', track:'killsWith:ENVIRONMENT',      target:15  } },
  { id:'lightweight_limbs', weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Crossbow while airborne', track:'killsWhileJumping:CROSSBOW', target:15 } },
  { id:'heavy_barrel',  weapon:'CROSSBOW', type:'attachment', challenge:{ track:'multiKillsWith:CROSSBOW',   target:15  } },
  { id:'bolt_recovery', weapon:'CROSSBOW', type:'attachment', challenge:{ track:'headshotKills:CROSSBOW', target:30  } },
  { id:'angled_grip',   weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Crossbow', track:'killsWhileJumping:CROSSBOW', target:20 } },
  { id:'vertical_grip', weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Crossbow', track:'killsWith:CROSSBOW', target:40 } },
  { id:'tactical_grip', weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} Ninjas with the Crossbow', track:'killsOfCombo:ninja_CROSSBOW', target:20 } },
  { id:'heavy_stock',   weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} Heavy robots with the Crossbow', track:'killsOfCombo:heavy_CROSSBOW', target:15 } },
  { id:'folded_stock',  weapon:'CROSSBOW', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Crossbow', track:'killsWith:CROSSBOW', target:60 } },

  // ════════════════════════════════════════════════════════════════
  //  WEAPON SKINS — 7 tiers, all weapon-kill based, no level gates
  //  PISTOL · SMG · SHOTGUN · CHAINGUN · RAILGUN · PLASMA
  //  ROCKET · GLAUNCHER · ELECTRON · ION
  // ════════════════════════════════════════════════════════════════

  // ── MIDNIGHT (tier 1) ─────────────────────────────────────────
  { id:'midnight', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Pistol',           track:'killsWith:PISTOL',    target:30  } },
  { id:'midnight', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the SMG',              track:'killsWith:SMG',       target:20  } },
  { id:'midnight', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Shotgun',          track:'killsWith:SHOTGUN',   target:25  } },
  { id:'midnight', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',         track:'killsWith:CHAINGUN',  target:15  } },
  { id:'midnight', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Railgun',          track:'killsWith:RAILGUN',   target:10  } },
  { id:'midnight', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',     track:'killsWith:PLASMA',    target:20  } },
  { id:'midnight', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',  track:'killsWith:ROCKET',    target:15  } },
  { id:'midnight', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Grenade Launcher', track:'killsWith:GLAUNCHER', target:20  } },
  { id:'midnight', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Electron',         track:'killsWith:ELECTRON',  target:20  } },
  { id:'midnight', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Ion Sniper',       track:'killsWith:ION',       target:10  } },

  // ── DESERT (tier 2) ───────────────────────────────────────────
  { id:'desert', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Pistol',           track:'killsWith:PISTOL',    target:75  } },
  { id:'desert', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the SMG',              track:'killsWith:SMG',       target:50  } },
  { id:'desert', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Shotgun',          track:'killsWith:SHOTGUN',   target:60  } },
  { id:'desert', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',         track:'killsWith:CHAINGUN',  target:40  } },
  { id:'desert', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Railgun',          track:'killsWith:RAILGUN',   target:25  } },
  { id:'desert', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',     track:'killsWith:PLASMA',    target:50  } },
  { id:'desert', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',  track:'killsWith:ROCKET',    target:35  } },
  { id:'desert', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Grenade Launcher', track:'killsWith:GLAUNCHER', target:45  } },
  { id:'desert', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Electron',         track:'killsWith:ELECTRON',  target:50  } },
  { id:'desert', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Ion Sniper',       track:'killsWith:ION',       target:25  } },

  // ── CRIMSON (tier 3) ──────────────────────────────────────────
  { id:'crimson', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Pistol',           track:'killsWith:PISTOL',    target:120 } },
  { id:'crimson', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the SMG',               track:'killsWith:SMG',       target:90  } },
  { id:'crimson', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Shotgun',          track:'killsWith:SHOTGUN',   target:100 } },
  { id:'crimson', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',          track:'killsWith:CHAINGUN',  target:75  } },
  { id:'crimson', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Railgun',           track:'killsWith:RAILGUN',   target:50  } },
  { id:'crimson', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',      track:'killsWith:PLASMA',    target:85  } },
  { id:'crimson', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',   track:'killsWith:ROCKET',    target:60  } },
  { id:'crimson', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',  track:'killsWith:GLAUNCHER', target:75  } },
  { id:'crimson', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Electron',          track:'killsWith:ELECTRON',  target:85  } },
  { id:'crimson', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Ion Sniper',        track:'killsWith:ION',       target:50  } },

  // ── ARCTIC (tier 4) ───────────────────────────────────────────
  { id:'arctic', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Pistol',           track:'killsWith:PISTOL',    target:180 } },
  { id:'arctic', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the SMG',              track:'killsWith:SMG',       target:150 } },
  { id:'arctic', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Shotgun',          track:'killsWith:SHOTGUN',   target:160 } },
  { id:'arctic', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',         track:'killsWith:CHAINGUN',  target:120 } },
  { id:'arctic', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Railgun',           track:'killsWith:RAILGUN',   target:80  } },
  { id:'arctic', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',     track:'killsWith:PLASMA',    target:140 } },
  { id:'arctic', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',  track:'killsWith:ROCKET',    target:100 } },
  { id:'arctic', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Grenade Launcher', track:'killsWith:GLAUNCHER', target:130 } },
  { id:'arctic', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Electron',         track:'killsWith:ELECTRON',  target:140 } },
  { id:'arctic', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Ion Sniper',        track:'killsWith:ION',       target:80  } },

   // ── JUNGLE (tier 4 — sustained damage) ───────────────────────
  { id:'jungle', weapon:'PISTOL',    type:'weaponSkin', challenge:{ track:'damageDealt:PISTOL',    target:20000 } },
  { id:'jungle', weapon:'SMG',       type:'weaponSkin', challenge:{ track:'damageDealt:SMG',       target:35000 } },
  { id:'jungle', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ track:'damageDealt:SHOTGUN',   target:28000 } },
  { id:'jungle', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ track:'damageDealt:CHAINGUN',  target:48000 } },
  { id:'jungle', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ track:'damageDealt:RAILGUN',   target:22000 } },
  { id:'jungle', weapon:'PLASMA',    type:'weaponSkin', challenge:{ track:'damageDealt:PLASMA',    target:32000 } },
  { id:'jungle', weapon:'ROCKET',    type:'weaponSkin', challenge:{ track:'damageDealt:ROCKET',    target:26000 } },
  { id:'jungle', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ track:'damageDealt:GLAUNCHER', target:22000 } },
  { id:'jungle', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ track:'damageDealt:ELECTRON',  target:38000 } },
  { id:'jungle', weapon:'ION',       type:'weaponSkin', challenge:{ track:'damageDealt:ION',       target:24000 } },

  // ── TOXIC (tier 5 — multi-kills) ──────────────────────────────
  { id:'toxic', weapon:'PISTOL',    type:'weaponSkin', challenge:{ track:'multiKillsWith:PISTOL',    target:25  } },
  { id:'toxic', weapon:'SMG',       type:'weaponSkin', challenge:{ track:'multiKillsWith:SMG',       target:50  } },
  { id:'toxic', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ track:'multiKillsWith:SHOTGUN',   target:60  } },
  { id:'toxic', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ track:'multiKillsWith:CHAINGUN',  target:80  } },
  { id:'toxic', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ track:'multiKillsWith:RAILGUN',   target:15  } },
  { id:'toxic', weapon:'PLASMA',    type:'weaponSkin', challenge:{ track:'multiKillsWith:PLASMA',    target:40  } },
  { id:'toxic', weapon:'ROCKET',    type:'weaponSkin', challenge:{ track:'multiKillsWith:ROCKET',    target:35  } },
  { id:'toxic', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ track:'multiKillsWith:GLAUNCHER', target:35  } },
  { id:'toxic', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ track:'multiKillsWith:ELECTRON',  target:45  } },
  { id:'toxic', weapon:'ION',       type:'weaponSkin', challenge:{ track:'multiKillsWith:ION',       target:12  } },

  // ── HAZARD (tier 5 — enemy-type challenges) ───────────────────
  { id:'hazard', weapon:'PISTOL', type:'weaponSkin', challenge:{ desc:'Kill {target} Scouts with the Pistol', track:'killsOfCombo:scout_PISTOL', target:50 } },
  { id:'hazard', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} Drones with the SMG',              track:'killsOfCombo:drone_SMG',        target:30  } },
  { id:'hazard', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} Heavy robots with the SHOTGUN',        track:'killsOfCombo:heavy_SHOTGUN',        target:25  } },
  { id:'hazard', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} Scouts with the CHAINGUN',              track:'killsOfCombo:scout_CHAINGUN',        target:80  } },
  { id:'hazard', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} Snipers with the RAILGUN',             track:'killsOfCombo:sniper_RAILGUN',       target:20  } },
  { id:'hazard', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} Drones with the PLASMA',              track:'killsOfCombo:drone_PLASMA',        target:25  } },
  { id:'hazard', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Destroy {target} bosses with the ROCKET',            track:'bossWaveClears',           target:3   } },
  { id:'hazard', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} Grenadiers with the GLAUNCHER',          track:'killsOfCombo:grenadier_GLAUNCHER',    target:20  } },
  { id:'hazard', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} Electron Bots with the ELECTRON',       track:'killsOfCombo:electron_bot_ELECTRON', target:25  } },
  { id:'hazard', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} Ion Snipers with the ION',         track:'killsOfCombo:ion_sniper_ION',   target:15  } },

  // ── PLASMA GLOW (tier 6 — advanced weapon-kill challenges) ────
  { id:'plasma_glow', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} Drones with the PISTOL',             track:'killsOfCombo:drone_PISTOL',        target:60  } },
  { id:'plasma_glow', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} Heavy robots with the SMG',       track:'killsOfCombo:heavy_SMG',        target:20  } },
  { id:'plasma_glow', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} Shotgunners with the SHOTGUN',        track:'killsOfCombo:shotgun_SHOTGUN',      target:30  } },
  { id:'plasma_glow', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',      track:'killsWith:CHAINGUN',       target:200 } },
  { id:'plasma_glow', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} bosses with the RAILGUN',              track:'bossWaveClears',           target:5   } },
  { id:'plasma_glow', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} Electron Bots with the PLASMA',      track:'killsOfCombo:electron_bot_PLASMA', target:20  } },
  { id:'plasma_glow', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} Rocket bots with the ROCKET',        track:'killsOfCombo:rocket_ROCKET',       target:20  } },
  { id:'plasma_glow', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} Rocket bots with the GLAUNCHER',        track:'killsOfCombo:rocket_GLAUNCHER',       target:15  } },
  { id:'plasma_glow', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} Drones with the ELECTRON',             track:'killsOfCombo:drone_ELECTRON',        target:20  } },
  { id:'plasma_glow', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} Snipers with the ION',            track:'killsOfCombo:sniper_ION',       target:15  } },

  // ── GOLD (tier 7 — prestige, high kill counts) ────────────────
  { id:'gold', weapon:'PISTOL',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Pistol',           track:'killsWith:PISTOL',    target:1000 } },
  { id:'gold', weapon:'SMG',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the SMG',              track:'killsWith:SMG',       target:4500 } },
  { id:'gold', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Shotgun',          track:'killsWith:SHOTGUN',   target:1800 } },
  { id:'gold', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Chaingun',         track:'killsWith:CHAINGUN',  target:4000 } },
  { id:'gold', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Railgun',          track:'killsWith:RAILGUN',   target:1500 } },
  { id:'gold', weapon:'PLASMA',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Plasma Rifle',     track:'killsWith:PLASMA',    target:2200 } },
  { id:'gold', weapon:'ROCKET',    type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',  track:'killsWith:ROCKET',    target:1500 } },
  { id:'gold', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Grenade Launcher', track:'killsWith:GLAUNCHER', target:2000 } },
  { id:'gold', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Electron',         track:'killsWith:ELECTRON',  target:2000 } },
  { id:'gold', weapon:'ION',       type:'weaponSkin', challenge:{ desc:'Kill {target} enemies with the Ion Sniper',       track:'killsWith:ION',       target:1500 } },
  
  // ── BENGAL (prestige — weapon level 10) ──────────────────────
  { id:'bengal', weapon:'PISTOL',    type:'weaponSkin', challenge:{ track:'weaponLevel:PISTOL',    target:10 } },
  { id:'bengal', weapon:'SMG',       type:'weaponSkin', challenge:{ track:'weaponLevel:SMG',       target:10 } },
  { id:'bengal', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ track:'weaponLevel:SHOTGUN',   target:10 } },
  { id:'bengal', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ track:'weaponLevel:CHAINGUN',  target:10 } },
  { id:'bengal', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ track:'weaponLevel:RAILGUN',   target:10 } },
  { id:'bengal', weapon:'PLASMA',    type:'weaponSkin', challenge:{ track:'weaponLevel:PLASMA',    target:10 } },
  { id:'bengal', weapon:'ROCKET',    type:'weaponSkin', challenge:{ track:'weaponLevel:ROCKET',    target:10 } },
  { id:'bengal', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ track:'weaponLevel:GLAUNCHER', target:10 } },
  { id:'bengal', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ track:'weaponLevel:ELECTRON',  target:10 } },
  { id:'bengal', weapon:'ION',       type:'weaponSkin', challenge:{ track:'weaponLevel:ION',       target:10 } },

  // ── DARK MATTER (complete all weapon challenges) ──────────────
  { id:'dark_matter', weapon:'PISTOL',    type:'weaponSkin', challenge:{ track:'allChallengesComplete:PISTOL',    target:1 } },
  { id:'dark_matter', weapon:'SMG',       type:'weaponSkin', challenge:{ track:'allChallengesComplete:SMG',       target:1 } },
  { id:'dark_matter', weapon:'SHOTGUN',   type:'weaponSkin', challenge:{ track:'allChallengesComplete:SHOTGUN',   target:1 } },
  { id:'dark_matter', weapon:'CHAINGUN',  type:'weaponSkin', challenge:{ track:'allChallengesComplete:CHAINGUN',  target:1 } },
  { id:'dark_matter', weapon:'RAILGUN',   type:'weaponSkin', challenge:{ track:'allChallengesComplete:RAILGUN',   target:1 } },
  { id:'dark_matter', weapon:'PLASMA',    type:'weaponSkin', challenge:{ track:'allChallengesComplete:PLASMA',    target:1 } },
  { id:'dark_matter', weapon:'ROCKET',    type:'weaponSkin', challenge:{ track:'allChallengesComplete:ROCKET',    target:1 } },
  { id:'dark_matter', weapon:'GLAUNCHER', type:'weaponSkin', challenge:{ track:'allChallengesComplete:GLAUNCHER', target:1 } },
  { id:'dark_matter', weapon:'ELECTRON',  type:'weaponSkin', challenge:{ track:'allChallengesComplete:ELECTRON',  target:1 } },
  { id:'dark_matter', weapon:'ION',       type:'weaponSkin', challenge:{ track:'allChallengesComplete:ION',       target:1 } },

  // ── FLAMETHROWER SKINS ────────────────────────────────────────
  { id:'midnight', weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:20 } },
  { id:'desert',   weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:50 } },
  { id:'crimson',  weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:80 } },
  { id:'arctic',   weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:140 } },
  { id:'hazard',   weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsOfCombo:heavy_FLAMETHROWER', target:15 } },
  { id:'plasma_glow', weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:200 } },
  { id:'gold',     weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'killsWith:FLAMETHROWER', target:800 } },
  { id:'jungle',   weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'damageDealt:FLAMETHROWER', target:30000 } },
  { id:'toxic',    weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'multiKillsWith:FLAMETHROWER', target:30 } },
  { id:'bengal',   weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'weaponLevel:FLAMETHROWER', target:10 } },
  { id:'dark_matter', weapon:'FLAMETHROWER', type:'weaponSkin', challenge:{ track:'allChallengesComplete:FLAMETHROWER', target:1 } },

  // ── Tesla SKINS ────────────────────────────────────────
  { id:'midnight', weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:20 } },
  { id:'desert',   weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:50 } },
  { id:'crimson',  weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:80 } },
  { id:'arctic',   weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:140 } },
  { id:'hazard',   weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsOfCombo:heavy_TESLA', target:15 } },
  { id:'plasma_glow', weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:200 } },
  { id:'gold',     weapon:'TESLA', type:'weaponSkin', challenge:{ track:'killsWith:TESLA', target:800 } },
  { id:'jungle',   weapon:'TESLA', type:'weaponSkin', challenge:{ track:'damageDealt:TESLA', target:30000 } },
  { id:'toxic',    weapon:'TESLA', type:'weaponSkin', challenge:{ track:'multiKillsWith:TESLA', target:30 } },
  { id:'bengal',   weapon:'TESLA', type:'weaponSkin', challenge:{ track:'weaponLevel:TESLA', target:10 } },
  { id:'dark_matter', weapon:'TESLA', type:'weaponSkin', challenge:{ track:'allChallengesComplete:TESLA', target:1 } },

  // ── Crossbow SKINS ────────────────────────────────────────
  { id:'midnight', weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:20 } },
  { id:'desert',   weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:50 } },
  { id:'crimson',  weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:80 } },
  { id:'arctic',   weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:140 } },
  { id:'hazard',   weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsOfCombo:heavy_CROSSBOW', target:15 } },
  { id:'plasma_glow', weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:200 } },
  { id:'gold',     weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'killsWith:CROSSBOW', target:800 } },
  { id:'jungle',   weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'damageDealt:CROSSBOW', target:30000 } },
  { id:'toxic',    weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'multiKillsWith:CROSSBOW', target:30 } },
  { id:'bengal',   weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'weaponLevel:CROSSBOW', target:10 } },
  { id:'dark_matter', weapon:'CROSSBOW', type:'weaponSkin', challenge:{ track:'allChallengesComplete:CROSSBOW', target:1 } },

  // ════════════════════════════════════════════════════════════════
  //  PLAYER SKINS — kept separate, not weapon-related
  // ════════════════════════════════════════════════════════════════
  { id:'ghost',     type:'playerSkin', level:10 },
  { id:'forest',    type:'playerSkin', level:15 },
  { id:'oni',       type:'playerSkin', level:25 },
  { id:'void',      type:'playerSkin', level:30 },
  { id:'gold',       type:'playerSkin', level:40 },
  { id:'gladiator', type:'playerSkin', challenge:{ desc:'Defeat {target} players in FFA', track:'pvpKills', target:25 } },
];

// ── Profile ───────────────────────────────────────────────────
const STORAGE_KEY = 'botarena_profile';

const _defaultProfile = () => ({
  name:'ANON', displayName: '',totalXp:0, level:1,
  unlocked:['default'],
  unlockedWeaponSkins:{PISTOL:[],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[], FLAMETHROWER:[], TESLA:[], CROSSBOW:[]},
  unlockedAttachments:{PISTOL:['endless_magazine'],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[], FLAMETHROWER:[], TESLA:[], CROSSBOW:[]},
  loadouts:{
    PISTOL:{skin:'default',attachments:{special:'endless_magazine'}},
    SMG:{skin:'default',attachments:{}},
    SHOTGUN:{skin:'default',attachments:{}},CHAINGUN:{skin:'default',attachments:{}},
    RAILGUN:{skin:'default',attachments:{}},PLASMA:{skin:'default',attachments:{}},
    ROCKET:{skin:'default',attachments:{}},GLAUNCHER:{skin:'default',attachments:{}},
    ELECTRON:{skin:'default',attachments:{}},ION:{skin:'default',attachments:{}},
    FLAMETHROWER:{skin:'default',attachments:{}},TESLA:{skin:'default',attachments:{}},CROSSBOW:{skin:'default',attachments:{}},
  },
  playerSkin:'default',
  firebaseUid:null,
  stats:{totalKills:0,pvpKills:0,bossWaveClears:0,maxWave:0,killsOfType:{},killsWith:{},killsWhileJumping:{},killsWhileScoped:{},energyPickups:{},bossKillsWith:{}},
  maxWaveHard: 0,
  hardModeClears: 0
});

export let profile = _defaultProfile();

// ── Firebase cross-session persistence ────────────────────────
let _fbReady = false;

export function initFirebaseAuth() {
  if (typeof firebase === 'undefined') return;
  
  // Listen for auth state changes instead of forcing a popup immediately
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      // User is already logged in from a previous session!
      _fbReady = true;
      const uid = user.uid;
      const cloudProfile = await _loadFromFirestore(uid);
      
      if (cloudProfile && cloudProfile.totalXp >= profile.totalXp) {
        profile = _deepMerge(_defaultProfile(), cloudProfile);
        profile.firebaseUid = uid;
        _saveToLocalStorage();
        console.log('[progression] Cross-session profile restored from cloud');
      } else {
        profile.firebaseUid = uid;
        await _saveToFirestore();
      }
    } else {
      // No user is logged in. 
      // Instead of forcing a popup, we sign them in anonymously behind the scenes
      // so their progression still saves to the cloud without interrupting gameplay.
      try {
        const cred = await firebase.auth().signInAnonymously();
        profile.firebaseUid = cred.user.uid;
        _fbReady = true;
        await _saveToFirestore();
      } catch (e) {
        console.warn('[progression] Anonymous auth failed:', e.message);
      }
    }
  });
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
  initFirebaseAuth();
}

/**
 * Call once after auth resolves.
 * If the profile has no displayName yet, shows a modal to collect one.
 * Resolves with the chosen name (or 'ANON' if dismissed).
 */
export function ensureDisplayName() {
    return new Promise(resolve => {
        if (profile.displayName) { resolve(profile.displayName); return; }

        // Build a simple overlay modal
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999',
            'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px',
            'font-family:"Courier New",monospace;color:#d8f030',
        ].join(';');
        overlay.innerHTML = `
          <div style="font-size:28px;font-weight:bold;letter-spacing:4px">CHOOSE YOUR NAME</div>
          <div style="font-size:13px;color:#557733;letter-spacing:2px">This will appear on leaderboards and in PvP</div>
          <input id="_nameInput" maxlength="16" autocomplete="off" spellcheck="false"
            style="background:#111;border:1px solid #557733;color:#d8f030;font-family:inherit;
                   font-size:22px;padding:8px 16px;text-align:center;letter-spacing:3px;width:220px;outline:none" />
          <button id="_nameConfirm"
            style="background:#1a2200;border:1px solid #d8f030;color:#d8f030;font-family:inherit;
                   font-size:15px;padding:8px 28px;cursor:pointer;letter-spacing:2px">CONFIRM</button>
          <div id="_nameErr" style="font-size:12px;color:#f44;display:none">Name must be 1–16 characters.</div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#_nameInput');
        const btn   = overlay.querySelector('#_nameConfirm');
        const err   = overlay.querySelector('#_nameErr');
        input.focus();

        const confirm = () => {
            const v = input.value.trim();
            if (!v) { err.style.display = 'block'; return; }
            profile.displayName = v;
            profile.name = v;  // keep legacy field in sync
            saveProfile();
            overlay.remove();
            resolve(v);
        };
        btn.addEventListener('click', confirm);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    });
}

export function saveProfile() {
  _saveToLocalStorage();
  _saveToFirestore();
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
export function recordKill(botType, weaponKey, { isJumping = false, isScoped = false, xpMult = 1, isHeadshot = false, isExplosiveKill = false, source = 'PLAYER' } = {}) {
  const s = profile.stats; s.totalKills++;
  if (botType === 'pvp') s.pvpKills++;
  else { s.killsOfType[botType]=(s.killsOfType[botType]||0)+1; if(botType==='giantbot')s.bossWaveClears=(s.bossWaveClears||0)+1; }

  // ── Combo tracking (any kill, any weapon) ──────────────────────
  const now = Date.now();
  _currentCombo = (now - _lastAnyKillTime < 5000) ? _currentCombo + 1 : 1;
  _lastAnyKillTime = now;
  if (_currentCombo > (s.maxKillCombo || 0)) s.maxKillCombo = _currentCombo;

  if (weaponKey) {
    s.killsWith[weaponKey]=(s.killsWith[weaponKey]||0)+1;
    const comboKey = botType + '_' + weaponKey;
    if (!s.killsOfCombo) s.killsOfCombo = {};
    s.killsOfCombo[comboKey]=(s.killsOfCombo[comboKey]||0)+1;
    if (isJumping) { if(!s.killsWhileJumping)s.killsWhileJumping={}; s.killsWhileJumping[weaponKey]=(s.killsWhileJumping[weaponKey]||0)+1; }
    if (isScoped)  { if(!s.killsWhileScoped) s.killsWhileScoped={};  s.killsWhileScoped[weaponKey] =(s.killsWhileScoped[weaponKey] ||0)+1; }
    if (botType==='giantbot') { if(!s.bossKillsWith)s.bossKillsWith={}; s.bossKillsWith[weaponKey]=(s.bossKillsWith[weaponKey]||0)+1; }
    if (isHeadshot) {
      if (!s.headshotKills) s.headshotKills = {};
      s.headshotKills[weaponKey] = (s.headshotKills[weaponKey] || 0) + 1;
    }
    if (weaponKey === 'ROCKET' || weaponKey === 'GLAUNCHER' || isExplosiveKill) {
      s.explosiveKills = (s.explosiveKills || 0) + 1;
    }
    if (source === 'TESLA_CHAIN') 
      {
      s.killsWith[source]=(s.killsWith[source]||0)+1;  
    }

    // ── Multi-kill (within 3s window) ─────────────────────────────
    if (!_recentKillTimes[weaponKey]) _recentKillTimes[weaponKey] = [];
    _recentKillTimes[weaponKey] = _recentKillTimes[weaponKey].filter(t => now - t < 3000);
    if (_recentKillTimes[weaponKey].length >= 1) {
      if (!s.multiKillsWith) s.multiKillsWith = {};
      s.multiKillsWith[weaponKey]=(s.multiKillsWith[weaponKey]||0)+1;
    }
    _recentKillTimes[weaponKey].push(now);

    // ── Fully-equipped / bare-weapon kills ────────────────────────
    const lo    = getLoadout(weaponKey);
    const slots = WEAPON_ATTACHMENT_SLOTS[weaponKey] || [];
    if (slots.length > 0 && slots.every(slot => !!lo.attachments?.[slot])) {
      if (!s.killsFullyEquipped) s.killsFullyEquipped = {};
      s.killsFullyEquipped[weaponKey]=(s.killsFullyEquipped[weaponKey]||0)+1;
    }
    if (!lo.attachments || Object.values(lo.attachments).every(v => !v)) {
      if (!s.killsBareWeapon) s.killsBareWeapon = {};
      s.killsBareWeapon[weaponKey]=(s.killsBareWeapon[weaponKey]||0)+1;
    }
    // Only award weapon XP for actual weapons — not environmental/synthetic sources
    const PSEUDO_SOURCES = new Set(['ENVIRONMENT', 'TESLA_CHAIN']);
    if (weaponKey && !PSEUDO_SOURCES.has(weaponKey)) {
        const prevWepLevel = getWeaponLevel(weaponKey);

        const wxp = ((WEAPON_XP_GRANTS[botType] || 8) * xpMult);
        s.weaponXp[weaponKey] = (s.weaponXp[weaponKey] || 0) + wxp;

        const newWepLevel = getWeaponLevel(weaponKey);
        if (newWepLevel > prevWepLevel) {
            _showWeaponLevelUpToast(weaponKey, newWepLevel);
        }
    }
  }

  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile(); return n;

}

export function recordEmpStun() {
  const s = profile.stats;
  s.empStuns = (s.empStuns || 0) + 1;
  const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile();
}

// Track energy weapon pickups (for energy-weapon-specific unlock challenges)
export function recordEnergyPickup(weaponKey) {
  const s = profile.stats;
  if (!s.energyPickups) s.energyPickups = {};
  s.energyPickups[weaponKey] = (s.energyPickups[weaponKey] || 0) + 1;
  const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile(); return n;
}

export function recordBarrelDestroyed() {
  const s = profile.stats;
  s.barrelDestroys = (s.barrelDestroys || 0) + 1;
  const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile();
}

export function recordRailgunPickup() {
  const s = profile.stats;
  s.railgunPickups = (s.railgunPickups || 0) + 1;
  const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile();
}

// Track damage dealt per weapon (for damageDealt: challenges)
// Debounced — damage fires every frame so we batch the expensive work.
export function recordDamage(weaponKey, amount) {
  if (!weaponKey || !amount || amount <= 0) return;
  const s = profile.stats;
  if (!s.damageDealt) s.damageDealt = {};
  s.damageDealt[weaponKey] = (s.damageDealt[weaponKey] || 0) + amount;
  // Batch challenge checks — no need to run them on every bullet
  clearTimeout(_damageFlushTimer);
  _damageFlushTimer = setTimeout(() => {
    const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
    checkProgressMilestones();
    saveProfile();
  }, 2000);
}

export function recordWaveComplete(waveNum, isBoss) {
  if (typeof waveNum!=='number'||isNaN(waveNum)) return;
  profile.stats.maxWave=Math.max(profile.stats.maxWave||0, waveNum);

  if (player.hardMode) {
      profile.stats.maxWaveHard = Math.max(profile.stats.maxWaveHard||0, waveNum);
  }

  if (isBoss) profile.stats.bossWaveClears=(profile.stats.bossWaveClears||0)+1;
  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile();
}

function _allWeaponChallengesComplete(wName) {
  const requiredSkins = Object.keys(WEAPON_SKINS).filter(id => id !== 'dark_matter' && id !== 'default');
  if (!requiredSkins.every(id => profile.unlockedWeaponSkins[wName]?.includes(id))) return false;
  const requiredAtts = [...new Set(
    UNLOCK_TABLE.filter(u => u.type === 'attachment' && u.weapon === wName).map(u => u.id)
  )];
  return requiredAtts.every(id => profile.unlockedAttachments[wName]?.includes(id));
}

function _checkChallenges() {
  const s=profile.stats; const news=[];
  for (const u of UNLOCK_TABLE) {
    if (!u.challenge) continue;
    if (u.type==='attachment'){
      // Guard: attachment must belong to a known weapon slot in unlockedAttachments
      if (!u.weapon) continue;
      const w=profile.unlockedAttachments[u.weapon];
      if(!w||w.includes(u.id))continue;
    }
    else if (u.type==='weaponSkin'){const w=profile.unlockedWeaponSkins[u.weapon];if(w&&w.includes(u.id))continue;}
    else{if(profile.unlocked.includes(u.id))continue;}
    const {track,target}=u.challenge; let val=0;
    if(track==='pvpKills')val=s.pvpKills||0;
    else if(track==='maxWave')val=s.maxWave||0;
    else if(track==='bossWaveClears')val=s.bossWaveClears||0;
    else if(track.startsWith('killsOfType:'))val=s.killsOfType[track.split(':')[1]]||0;
    else if(track.startsWith('headshotKills:')){
      const trackWep=track.split(':')[1];
      val=(s.headshotKills||{})[trackWep]||0;
    }
    // killsWith: must match the exact weapon key in the track, not just any weapon
    else if(track.startsWith('killsWith:')){
      const trackWep=track.split(':')[1];
      // Only count progress toward this challenge entry if the tracked weapon matches
      // (prevents e.g. 'killsWith:SHOTGUN' from crediting an SMG challenge)
      val=s.killsWith[trackWep]||0;
    }
    else if(track.startsWith('killsWhileJumping:')){
      const trackWep=track.split(':')[1];
      val=(s.killsWhileJumping||{})[trackWep]||0;
    }
    else if(track.startsWith('killsWhileScoped:')){
      const trackWep=track.split(':')[1];
      val=(s.killsWhileScoped||{})[trackWep]||0;
    }
    else if(track.startsWith('killsOfCombo:'))val=(s.killsOfCombo||{})[track.split(':')[1]]||0;
    else if(track.startsWith('energyPickups:')){
      const trackWep=track.split(':')[1];
      val=(s.energyPickups||{})[trackWep]||0;
    }
    else if(track.startsWith('killedBossWith:')){
      const trackWep=track.split(':')[1];
      val=(s.bossKillsWith||{})[trackWep]||0;
    }
    else if(track.startsWith('multiKillsWith:'))      val=(s.multiKillsWith||{})[track.split(':')[1]]||0;
    else if(track.startsWith('damageDealt:')) val=Math.floor((s.damageDealt||{})[track.split(':')[1]]||0);
    else if(track.startsWith('killsFullyEquipped:'))   val=(s.killsFullyEquipped||{})[track.split(':')[1]]||0;
    else if(track.startsWith('killsBareWeapon:'))      val=(s.killsBareWeapon||{})[track.split(':')[1]]||0;
    else if(track==='maxKillCombo')                    val=s.maxKillCombo||0;
    else if(track.startsWith('weaponLevel:'))          val=getWeaponLevel(track.split(':')[1]);
    else if(track.startsWith('allChallengesComplete:'))val=_allWeaponChallengesComplete(track.split(':')[1])?1:0;
    else if(track === 'barrelDestroys') val = s.barrelDestroys || 0;
    else if(track === 'empStuns') val = s.empStuns || 0;
    else if(track === 'allWonderWeaponsCollected') val = s.allWonderWeaponsCollected || 0;
    if(val>=target){
      if(u.type==='attachment')profile.unlockedAttachments[u.weapon].push(u.id);
      else if(u.type==='weaponSkin'){if(!profile.unlockedWeaponSkins[u.weapon])profile.unlockedWeaponSkins[u.weapon]=[];profile.unlockedWeaponSkins[u.weapon].push(u.id);}
      else profile.unlocked.push(u.id);
      news.push({...u,reason:getChallengeDescription(u)});
    }
  }
  return news;
}

// Returns a human-friendly description for a challenge. Accepts either a
// challenge object or an unlock entry that contains `.challenge`. If the
// challenge already provides a string `desc`, the first numeric substring
// will be replaced with the `target` value so descriptions always reflect
// the authoritative target number.
export function getChallengeDescription(uOrCh){
  const c = uOrCh && uOrCh.challenge ? uOrCh.challenge : uOrCh;
  if(!c) return '';
  if(typeof c.desc === 'function') return c.desc(c);
  if(typeof c.desc === 'string'){
    if(c.target != null){
      if(c.desc.indexOf('{target}') !== -1) return c.desc.replace(/\{target\}/g, String(c.target));
      // Backwards-compat: replace first numeric substring if no {target} token
      return c.desc.replace(/\d+/, String(c.target));
    }
    return c.desc;
  }
  const track = c.track||''; const target = c.target||0;
  if(track.startsWith('killsWith:')){
    const wep = track.split(':')[1]; const wlabel = _WNAME?.[wep]??wep;
    return `Kill ${target} enemies with the ${wlabel}`;
  }
  if(track.startsWith('killsOfType:')){
    const t = track.split(':')[1].replace(/_/g,' ');
    return `Kill ${target} ${t} (any weapon)`;
  }
  if(track.startsWith('killsOfCombo:')){
    const part = track.split(':')[1] || '';
    const [b, ...wparts] = part.split('_');
    const bot = (b||'').replace(/_/g,' ');
    const wep = (wparts.join('_')||'').toUpperCase();
    const wlabel = _WNAME?.[wep]??wep;
    return `Kill ${target} ${bot} with the ${wlabel}`;
  }
  if(track.startsWith('killsWhileJumping:')){
    const wep=track.split(':')[1]; const wlabel=_WNAME?.[wep]??wep;
    return `Kill ${target} enemies with the ${wlabel} while airborne`;
  }
  if(track.startsWith('killsWhileScoped:')){
    const wep=track.split(':')[1]; const wlabel=_WNAME?.[wep]??wep;
    return `Kill ${target} enemies with the ${wlabel} while scoped`;
  }
  if(track.startsWith('energyPickups:')){
    const wep=track.split(':')[1]; const wlabel=_WNAME?.[wep]??wep;
    return `Pick up energy from defeated enemies ${target} times with the ${wlabel}`;
  }
  if(track.startsWith('killedBossWith:')){
    const wep=track.split(':')[1]; const wlabel=_WNAME?.[wep]??wep;
    return `Kill ${target} bosses with the ${wlabel}`;
  }
  if(track==='pvpKills') return `Defeat ${target} players in FFA`;
  if(track==='bossWaveClears') return `Defeat ${target} bosses`;
  if(track.startsWith('multiKillsWith:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Get ${target} multi-kills with the ${wlabel}`;
  }
  if(track.startsWith('damageDealt:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Deal ${Number(target).toLocaleString()} damage with the ${wlabel}`;
  }
  if(track.startsWith('killsFullyEquipped:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Kill ${target} enemies with a fully-equipped ${wlabel}`;
  }
  if(track.startsWith('killsBareWeapon:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Kill ${target} enemies with an unmodified ${wlabel}`;
  }
  if(track==='maxKillCombo') return `Reach a ${target}-kill combo`;
  if(track.startsWith('weaponLevel:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Reach ${wlabel} Prestige (Level 10)`;
  }
  if(track.startsWith('allChallengesComplete:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Complete all ${wlabel} challenges`;
  }
  if(track.startsWith('headshotKills:')){
    const wlabel=_WNAME?.[track.split(':')[1]]??track.split(':')[1];
    return `Get ${target} headshot kills with the ${wlabel}`;
  }
    return `${target} ${track}`;
}

// ── Progress milestones (in-game notification at 25/50/75%) ───
// Persisted in localStorage so we don't re-show on reload.
const _MILESTONE_STORAGE = 'botarena_milestones';
let _shownMilestones = null;

function _loadShownMilestones() {
  if (_shownMilestones) return;
  try { _shownMilestones = new Set(JSON.parse(localStorage.getItem(_MILESTONE_STORAGE) ?? '[]')); }
  catch { _shownMilestones = new Set(); }
}
function _saveShownMilestones() {
  try { localStorage.setItem(_MILESTONE_STORAGE, JSON.stringify([..._shownMilestones])); } catch {}
}

export function checkProgressMilestones() {
  _loadShownMilestones();
  const THRESHOLDS = [0.25, 0.50, 0.75];
  for (const u of UNLOCK_TABLE) {
    if (!u.challenge) continue;
    // Skip already fully unlocked items
    if (u.type==='attachment' && profile.unlockedAttachments[u.weapon]?.includes(u.id)) continue;
    if (u.type==='weaponSkin' && profile.unlockedWeaponSkins[u.weapon]?.includes(u.id)) continue;
    if (u.type==='playerSkin' && profile.unlocked?.includes(u.id)) continue;

    const prog = getChallengeProgress(u.challenge);
    for (const t of THRESHOLDS) {
      if (prog.pct < t) continue;
      const key = `${u.id}:${u.weapon??''}:${Math.round(t*100)}`;
      if (_shownMilestones.has(key)) continue;
      _shownMilestones.add(key);
      _saveShownMilestones();
      _showMilestoneToast(u, prog, t);
    }
  }
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
export function getSpeedMult(wName) {
  const lo = getLoadout(wName);
  let mult = 1.0;
  for (const id of Object.values(lo.attachments || {})) {
    const att = ATTACHMENTS[id];
    if (att?.mods?.speedMult) mult *= att.mods.speedMult;
  }
  return mult;
}

export function getEffectiveStats(wName, baseDefs) {
  const lo = getLoadout(wName); 
  const out = { ...baseDefs };
  
  for (const [, id] of Object.entries(lo.attachments)) {
    const att = ATTACHMENTS[id];
    if (!att || !att.mods) continue;
    
    for (const [mod, delta] of Object.entries(att.mods)) {
      if (mod === 'ammoMult') {
        // Apply to carried ammo (if not infinite)
        if (baseDefs.startAmmo !== Infinity) {
            out.startAmmo = Math.round((baseDefs.startAmmo || 0) * (1 + delta));
        }
        // Apply to magazine size
        if (baseDefs.magSize) {
            out.magSize = Math.max(1, Math.round(baseDefs.magSize * (1 + delta)));
        }
      }
      else if (mod === 'damage') out.dmg = Math.round(baseDefs.dmg * (1 + delta));
      else if (mod === 'spread') out.spread = Math.max(0, (baseDefs.spread || 0) * (1 + delta));
      else if (mod === 'range') out.range = Math.round(baseDefs.range * (1 + delta));
      else if (mod === 'cd') out.cd = Math.max(0.02, baseDefs.cd * (1 + delta));
      else if (mod === 'speed') out.speed = Math.round((baseDefs.speed || 0) * (1 + delta));
      else if (mod === 'chainRange') out.chainRange = (baseDefs.chainRange || 8) * (1 + delta); // +1.0 = 100% increase
      else if (mod === 'adsSpeedMult') out.adsSpeedMult = (out.adsSpeedMult || 1.0) * delta;
      // Dynamic Magazine and Multiplier Handling
      else if (mod === 'magSize') out.magSize = Math.max(1, (baseDefs.magSize || 0) + delta);
      else if (mod === 'cdMult') out.cd = Math.max(0.02, baseDefs.cd * delta);
      else if (mod === 'dmgMult') out.dmg = Math.round(baseDefs.dmg * delta);
      else if (mod === 'reloadMult') out.reloadTime = Math.max(0.1, (baseDefs.reloadTime || 1.6) * delta);     
      else if (mod === 'spreadAdd') out.spread = (out.spread || baseDefs.spread || 0) + delta;
      else if (mod === 'recoilMult') out.recoilMult = (out.recoilMult || 1.0) * delta;
    else if (mod === 'spreadAdd') out.spread = (out.spread || baseDefs.spread || 0) + delta;
    }
  }
  // ION SNIPER RAMP-UP LOGIC
  if (wName === 'ION') {
    const currentHeat = baseDefs.heat || 0;
    const rampFactor = 1 + currentHeat; // 0 heat = 1x dmg, 1.0 heat = 2x dmg
    out.dmg = Math.round(out.dmg * rampFactor);
  }
  return out;
}

export function getAdsFov(wName){const id=getLoadout(wName).attachments?.sight;return ATTACHMENTS[id]?.visual?.adsZoom??null;}
export function getScopeShape(wName){const id=getLoadout(wName).attachments?.sight;return ATTACHMENTS[id]?.visual?.scopeShape??null;}
export function isAkimbo(wName){return getLoadout(wName).attachments?.special==='akimbo';}
export function isAutoFire(wName) {
  const lo = getLoadout(wName);
  return lo.attachments?.special === 'auto_fire' || lo.attachments?.magazine === 'pdw_conversion';
}
export function hasPowerCell(){return getLoadout('RAILGUN').attachments?.special==='power_cell'||getLoadout('ION').attachments?.special==='power_cell';}
export function hasPowerCellFor(wName){return getLoadout(wName).attachments?.special==='power_cell';}
export function hasClusterRounds(){return getLoadout('GLAUNCHER').attachments?.special==='cluster_rounds';}
export function hasLaserDot(wName){return false;} // red_dot disabled — always false
export function hasEnergyCoil(){return getLoadout('ION').attachments?.special==='energy_coil';}
export function hasSlowTrigger(){return getLoadout('ELECTRON').attachments?.special==='slow_trigger';}
export function hasSpinningModule(){return getLoadout('CHAINGUN').attachments?.special==='spinning_module';}
export function hasEnergyConverter(){return getLoadout('PLASMA').attachments?.magazine==='energy_converter';}
export function hasDualTrigger(){return getLoadout('PLASMA').attachments?.special==='dual_trigger';}
export function hasEfficiencyModule(){return getLoadout('RAILGUN').attachments?.special==='efficiency_module';}
export function hasBoltRecovery(){return getLoadout('CROSSBOW').attachments?.special==='bolt_recovery';}
export function hasSeasonedVet(wName){
  if(wName==='ROCKET')   return getLoadout('ROCKET').attachments?.special==='seasoned_vet_rocket';
  if(wName==='GLAUNCHER')return getLoadout('GLAUNCHER').attachments?.special==='seasoned_vet_glauncher';
  return false;
}
export function hasFreefallCoil(){ return getLoadout('ELECTRON').attachments?.special==='freefall_coil'; }
export function hasRocketBurst(){ return getLoadout('ROCKET').attachments?.special==='rocket_burst'; }
export function hasMagnetCoil(){ return getLoadout('TESLA').attachments?.special==='magnet_coil'; }
export function hasSuppressor(wName) {
  return getLoadout(wName).attachments?.barrel === 'suppressor';
}
export function hasQuickTrigger() {
  return getLoadout('SMG').attachments?.special === 'quick_trigger';
}

export function getAdsLerpSpeed(wName) {
  const lo = getLoadout(wName);
  let mult = 1.0;
  for (const id of Object.values(lo.attachments || {})) {
    const att = ATTACHMENTS[id];
    if (att?.mods?.adsSpeedMult) mult *= att.mods.adsSpeedMult;
  }
  return 15 * mult; // 15 is the base lerp speed used in animWeapon
}

export function getLevelProgress(){
  const lv=profile.level;const x=profile.totalXp-totalXpForLevel(lv);const n=xpForLevel(lv);
  return{level:lv,xpThisLevel:x,xpNeeded:n,pct:x/n};
}
export function getChallengeProgress(ch){
  const s=profile.stats;const{track,target}=ch;let val=0;
  if(track==='pvpKills')val=s.pvpKills||0;
  else if(track==='maxWave')val=s.maxWave||0;
  else if(track==='bossWaveClears')val=s.bossWaveClears||0;
  else if(track.startsWith('killsOfType:'))val=s.killsOfType[track.split(':')[1]]||0;
  else if(track.startsWith('headshotKills:')) val=(s.headshotKills||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsWith:'))val=s.killsWith[track.split(':')[1]]||0;
  else if(track.startsWith('killsWhileJumping:'))val=(s.killsWhileJumping||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsWhileScoped:'))val=(s.killsWhileScoped||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsOfCombo:'))val=(s.killsOfCombo||{})[track.split(':')[1]]||0;
  else if(track.startsWith('energyPickups:'))val=(s.energyPickups||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killedBossWith:'))val=(s.bossKillsWith||{})[track.split(':')[1]]||0;
  else if(track.startsWith('multiKillsWith:'))      val=(s.multiKillsWith||{})[track.split(':')[1]]||0;
  else if(track.startsWith('damageDealt:')) val=Math.floor((s.damageDealt||{})[track.split(':')[1]]||0);
  else if(track.startsWith('killsFullyEquipped:'))   val=(s.killsFullyEquipped||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsBareWeapon:'))      val=(s.killsBareWeapon||{})[track.split(':')[1]]||0;
  else if(track==='maxKillCombo')                    val=s.maxKillCombo||0;
  else if(track.startsWith('weaponLevel:'))          val=getWeaponLevel(track.split(':')[1]);
  else if(track.startsWith('allChallengesComplete:'))val=_allWeaponChallengesComplete(track.split(':')[1])?1:0;
  else if(track === 'barrelDestroys') val = s.barrelDestroys || 0;
  else if(track === 'empStuns') val = s.empStuns || 0;
  return{val,target,pct:Math.min(1,val/target)};
}
export function getUnlockHint(u){
  if(u.secret)return u.challenge?getChallengeDescription(u):'???';
  if(u.level)return`Reach Level ${u.level}`;
  if(u.challenge)return getChallengeDescription(u);
  return '';
}

// ── Toasts & Notification Queue ───────────────────────────────
const _toastQueue = [];
let _isToasting = false;

function _ensureToastStyle() {
  if (!document.getElementById('toastAnim')) {
    const s = document.createElement('style');
    s.id = 'toastAnim';
    s.innerHTML = '@keyframes _fadeToast { 0%{opacity:0;transform:translateY(10px)} 10%{opacity:1;transform:translateY(0)} 90%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-10px)} }';
    document.head.appendChild(s);
  }
}

function _enqueueToast(html, duration, cssProps) {
  _toastQueue.push({ html, duration, cssProps });
  if (!_isToasting) _processToastQueue();
}

function _processToastQueue() {
  if (_toastQueue.length === 0) {
    _isToasting = false;
    return;
  }
  _isToasting = true;
  const { html, duration, cssProps } = _toastQueue.shift();
  
  const d = document.createElement('div');
  d.style.cssText = cssProps;
  d.innerHTML = html;
  
  _ensureToastStyle();
  document.body.appendChild(d);
  
  setTimeout(() => {
    d.remove();
    _processToastQueue();
  }, duration);
}

function _showMilestoneToast(u, prog, milestone) {
  const pct = Math.round(milestone * 100);
  const isSecret = u.secret === true;
  const label = isSecret ? `??? SECRET ACHIEVEMENT` : `${u.id.replace(/_/g,' ').toUpperCase()}${u.weapon ? ` (${u.weapon})` : ''}`;
  const desc = isSecret ? 'Keep playing to discover this unlock...' : getChallengeDescription(u);

  const html = `
    <div style="font-size:13px;color:#557733;letter-spacing:2px;margin-bottom:3px">UNLOCK PROGRESS</div>
    <div style="font-size:16px;color:#d8f030;font-weight:bold;margin-bottom:2px">${label}</div>
    <div style="font-size:13px;color:#aaa;margin-bottom:5px">${desc}</div>
    <div style="display:flex;align-items:center;gap:6px">
      <div style="flex:1;height:6px;background:#1e1e1e;border-radius:3px">
        <div style="width:${pct}%;height:100%;background:#d8f030;border-radius:3px"></div>
      </div>
      <span style="font-size:14px;color:#d8f030;font-weight:bold">${pct}%</span>
    </div>
    <div style="font-size:13px;color:#557733;margin-top:3px">${prog.val} / ${prog.target}</div>`;
    
  const css = 'position:fixed;bottom:130px;right:20px;min-width:260px;max-width:320px;background:rgba(0,0,0,.88);border:1px solid rgba(216,240,48,.45);padding:12px 16px;z-index:1200;font-family:"Courier New",monospace;pointer-events:none;animation:_fadeToast 5.0s forwards';
  _enqueueToast(html, 5000, css);
}

function _showLevelUpToast(oldLv,newLv,unlocks){
  const html = `<div style="font-size:14px;color:#557733;letter-spacing:3px">LEVEL UP</div><div style="font-size:42px;font-weight:bold;color:#d8f030;margin:2px 0">${newLv}</div>${unlocks.map(u=>`<div style="font-size:14px;color:#aaa;margin-top:4px">🔓 ${u.id.replace(/_/g,' ').toUpperCase()}${u.weapon?' ('+u.weapon+')':''}</div>`).join('')}`;
  const css = 'position:fixed;top:22%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);border:1px solid rgba(216,240,48,.5);padding:20px 40px;z-index:1100;text-align:center;font-family:"Courier New",monospace;pointer-events:none;animation:_fadeToast 2.2s forwards';
  _enqueueToast(html, 2300, css);
}

function _showUnlockToasts(unlocks){
  unlocks.forEach((u) => {
    const html = `🔓 ${u.id.replace(/_/g,' ').toUpperCase()}${u.weapon?' — '+u.weapon:''}<br><span style="color:#557733;font-size:13px">${u.reason}</span>`;
    const css = 'position:fixed;bottom:90px;right:20px;background:rgba(0,0,0,.85);border:1px solid rgba(216,240,48,.4);padding:10px 18px;z-index:1100;font-family:"Courier New",monospace;font-size:15px;color:#d8f030;animation:_fadeToast 2.0s forwards';
    _enqueueToast(html, 2100, css);
  });
}

function _showWeaponLevelUpToast(wName, newLv) {
  const wlabel = wName.replace(/_/g, ' ').toUpperCase();
  const html = `<div style="font-size:14px;color:#d8a030;letter-spacing:3px">WEAPON LEVEL UP</div><div style="font-size:32px;font-weight:bold;color:#d8f030;margin:2px 0">${wlabel} LVL ${newLv}</div>`;
  const css = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);border:1px solid rgba(216,160,48,.5);padding:15px 30px;z-index:1100;text-align:center;font-family:"Courier New",monospace;pointer-events:none;animation:_fadeToast 2.5s forwards';
  _enqueueToast(html, 2500, css);
}
