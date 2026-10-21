// progression.js – XP, levels, unlocks, challenges, persistence
// localStorage (offline) + Firebase cross-session sync
import { player } from './gameState.js';
import { getCurrentMap } from './mapManager.js';
import { WDEFS } from './weapons.js';
import { crossedMilestone, notificationKey, upgradeNotificationHistory } from './milestoneNotifications.js';
import { questDefinitions, ensureQuestState, trackQuestEvent, questProgress, claimQuest, convertMaxedWeaponXp } from './questRules.js';

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
    desc:'−10% damage. Weapon becomes silent.',
    icon:'🔇', mods:{damage:-0.10},
    visual:{type:'barrel',style:'suppressor'},
  },
  ported_barrel: {
    id:'ported_barrel', name:'Ported Barrel', slot:'barrel',
    desc:'Reduces weapon recoil and barrel climb.',
    icon:'💨', mods:{recoilMult:0.65},
    visual:{type:'barrel',style:'ported'},
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
    visual:{type:'special',style:'endless_magazine'},
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
  sticky_fuel: {
    id: 'sticky_fuel',
    name: 'Sticky Fuel',
    slot: 'special',
    desc: 'Flames cling to floors and walls, creating short-lived burning hazards. Direct hit damage is mildly reduced.',
    icon: '🧪',
    mods: { damage: -0.10, range: +0.80 },
    visual: { type: 'special', style: 'sticky_valves' }
  },
  cryo_core: {
    id: 'cryo_core',
    name: 'Cryo-Core',
    slot: 'special',
    desc: 'Converts chemical fuel into liquid nitrogen. Direct hits deal direct damage and decelerate enemies up to 45%, but deals reduced damage.',
    icon: '❄️',
    mods: { damage: -0.15, range: +0.40, heatMult: -0.25 },
    visual: { type: 'special', style: 'cryo_tanks' }
  },
  thermal_blast: {
    id: 'thermal_blast',
    name: 'Thermal Backfire',
    slot: 'special',
    desc: 'Press [V] to discharge an emergency localized combustion shockwave that knocks back threats, but instantly builds +50% heat.',
    icon: '💥',
    mods: { damage: +0.05 },
    visual: { type: 'special', style: 'reinforced_shroud' }
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
  coated_tips: {
    id:'coated_tips', name:'Coated Tips', slot:'special', weapon:'CROSSBOW',
    desc:'Bolts are coated in a lethal neurotoxin. Deals 2% of enemy max HP per second for 5 seconds. Stacks on multiple hits.',
    icon:'🧪', mods:{},
    visual:{type:'special',style:'explosive_tips'},
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
    desc:'Swap between semi-auto (3-shot burst) and sniper mode (single shot, 3× damage) with [V].',
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
  lantern: {
    id:'lantern', name:'Tactical Lantern', slot:'sight',
    desc:'Projects a bright beam of light forward. Crucial for pitch-black sectors.',
    icon:'🔦', mods:{},
    visual:{type:'sight',style:'lantern'},
  },
  night_vision: {
    id:'night_vision', name:'NVG Optic', slot:'sight',
    desc:'Right-click applies a green night-vision amplification overlay.',
    icon:'👁️', mods:{},
    visual:{type:'sight',style:'night_vision',adsZoom:0.75,scopeShape:'square'},
  },
  magnetic_coils: { id:'magnetic_coils', name:'Magnetic Coils', slot:'special', weapon:'RIVETER', desc:'Nails gain a slight homing effect if they pass within 1.5 units of an enemy.', icon:'🧲', mods:{} },
  superheated_rivets: { id:'superheated_rivets', name:'Superheated Rivets', slot:'special', weapon:'RIVETER', desc:'Replaces raw damage with a severe burn effect.', icon:'🔥', mods:{ damage: -0.80 } },
  resonance_cascade: { id:'resonance_cascade', name:'Resonance Cascade', slot:'special', weapon:'PHALANX', desc:'Enemies knocked into walls take massive shatter damage.', icon:'💥', mods:{} },
  emp_frequency: { id:'emp_frequency', name:'EMP Frequency', slot:'special', weapon:'PHALANX', desc:'Converts knockback into a 1.5s EMP stun.', icon:'⚡', mods:{} },
  multi_thread: { id:'multi_thread', name:'Multi-Thread Processor', slot:'special', weapon:'AEGIS', desc:'Increases maximum painted targets from 3 to 6, but reduces damage per target to 66% of normal.', icon:'🎯', mods:{ maxTargets: 3, dmgMult: 0.66 } },
  bypass_algorithms: { id:'bypass_algorithms', name:'Bypass Algorithms', slot:'special', weapon:'AEGIS', desc:'Smart rounds bypass enemy armor and shields.', icon:'🔓', mods:{} },
  sonic_amplifier: {
    id:'sonic_amplifier', name:'Sonic Amplifier', slot:'barrel',
    weapon: 'PHALANX',
    desc:'+30% knockback force. Enemies fly further.',
    icon:'📢', mods:{knockbackMult:+0.30},
    visual:{type:'barrel',style:'heavy'},
  },
  wide_diaphragm: {
    id:'wide_diaphragm', name:'Wide Diaphragm', slot:'barrel',
    weapon: 'PHALANX',
    desc:'+25% range, +20% spread. Wider cone of effect.',
    icon:'📐', mods:{range:+0.25, spread:+0.20},
    visual:{type:'barrel',style:'compensator'},
  },

  // ── New Stock (for precision / support weapons) ──────────────────
  stabilizing_brace: {
    id:'stabilizing_brace', name:'Stabilizing Brace', slot:'stock',
    desc:'+15% ADS speed, -10% recoil. Keeps weapon steady.',
    icon:'📏', mods:{adsSpeedMult:1.15, recoilMult:0.90},
    visual:{type:'stock',style:'folded'},
  },
  single_thread: {
    id:'single_thread', name:'Single-Thread Override', slot:'special', weapon:'AEGIS',
    desc:'Focuses targeting. Limits max painted targets to 1, but increases smart round damage to 3.5× normal.',
    icon:'🎯', mods:{ maxTargetsOverride: 1, dmgMult: 3.5 },
    incompatibleWith:['multi_thread']
  },
  slug_rounds: {
    id:'slug_rounds', name:'Slug Rounds', slot:'special', weapon:'SHOTGUN',
    desc:'Fires a single, highly accurate slug. +150% damage, +60% range, zero spread.',
    icon:'🎯', mods:{ pelletsOverride: 1, dmgMult: 2.5, spreadOverride: 0.0, range: +0.60 }
  },
  dragons_breath: {
    id:'dragons_breath', name:'Dragon\'s Breath', slot:'special', weapon:'SHOTGUN',
    desc:'Ignites enemies on hit, dealing heavy burn damage over 3 seconds, but reduces initial impact damage.',
    icon:'🔥', mods:{ damage: -0.30, dotDamage: 12, dotDuration: 3 }
  },
  bouncy_rivets: {
    id:'bouncy_rivets', name:'High-Tensile Rivets', slot:'special', weapon:'RIVETER',
    desc:'Rivets can bounce 3 additional times before embedding. -15% projectile speed.',
    icon:'🪀', mods:{ bounces: 3, speed: -0.15 }
  },
  // ── New COMET attachments ──────────────────────────────────────
  burst_modulator: {
    id: 'burst_modulator',
    name: 'Burst Modulator',
    slot: 'special',
    weapon: 'COMET',
    desc: 'Increases burst count to 5, but fire rate is slightly reduced.',
    icon: '🔁',
    mods: { burstCount: 5, cd: +0.20 },
    visual: { type: 'special', style: 'burst_modulator' },
  },
  precision_barrel: {
    id: 'precision_barrel',
    name: 'Precision Barrel',
    slot: 'barrel',
    weapon: 'COMET',
    desc: 'Precision‑machined barrel reduces spread and increases range.',
    icon: '🎯',
    mods: { spread: -0.20, range: +0.15 },
    visual: { type: 'barrel', style: 'extended' },
  },
  lightweight_handguard: {
    id: 'lightweight_handguard',
    name: 'Lightweight Handguard',
    slot: 'grip',
    weapon: 'COMET',
    desc: 'Ergonomic grip improves ADS speed and stability.',
    icon: '✋',
    mods: { adsSpeedMult: 1.20, spread: -0.10 },
    visual: { type: 'grip', style: 'angled' },
  },
  // ── New DMR attachments ────────────────────────────────────────
  high_caliber: {
    id: 'high_caliber',
    name: 'High‑Caliber Rounds',
    slot: 'magazine',
    weapon: 'DMR',
    desc: 'Heavy rounds deal +30% damage but reduce magazine capacity.',
    icon: '💢',
    mods: { dmgMult: 1.30, magSize: -3 },
    visual: { type: 'magazine', style: 'extended' },
  },
  stabilizing_bipod: {
    id: 'stabilizing_bipod',
    name: 'Stabilizing Bipod',
    slot: 'grip',
    weapon: 'DMR',
    desc: 'Deploys a bipod that greatly reduces spread when stationary.',
      icon: '🦵',
      mods: { spread: -0.40 },
      visual: { type: 'grip', style: 'vertical' },
  },
  precision_stock: {
    id: 'precision_stock',
    name: 'Precision Stock',
    slot: 'stock',
    weapon: 'DMR',
    desc: 'Adjustable stock reduces recoil and speeds up ADS.',
    icon: '📐',
    mods: { recoilMult: 0.70, adsSpeedMult: 1.15 },
    visual: { type: 'stock', style: 'heavy' },
  },
};

export const WEAPON_ATTACHMENT_SLOTS = {
  PISTOL:       ['sight','barrel','magazine','grip','stock','special'],
  SMG:          ['sight','barrel','magazine','grip','stock','special'],
  SHOTGUN:      ['sight','barrel','magazine','grip','stock','special'],
  CHAINGUN:     ['sight','barrel','magazine','grip','stock','special'],
  RAILGUN:      ['sight','barrel','stock','grip','special'],
  PLASMA:       ['sight','barrel','magazine','grip','stock','special'],
  ROCKET:       ['sight','barrel','magazine','stock','special'],
  GLAUNCHER:    ['sight','barrel','magazine','stock','special'],
  ELECTRON:     ['sight','barrel','grip','stock','special'],
  ION:          ['sight','barrel','grip','stock','special'],
  FLAMETHROWER: ['sight','barrel','magazine','grip','stock'],
  TESLA:        ['sight', 'magazine','grip','stock','special'],
  CROSSBOW:     ['sight','barrel','grip','stock','special'],
  RIVETER:      ['sight','barrel','magazine','grip','stock','special'],
  PHALANX:      ['sight','barrel','magazine','grip','stock','special'],
  AEGIS:        ['sight','barrel','magazine','grip','stock','special'],
  DMR: ['sight','barrel','magazine','grip','stock','special'],
  COMET: ['sight','barrel','magazine','grip','stock','special'],
};

export const WEAPON_SPECIALS = {
  PISTOL:    ['endless_magazine','akimbo','quick_trigger'],
  SMG:       ['quick_trigger','akimbo'],
  SHOTGUN:   ['slug_rounds','dragons_breath'],
  CHAINGUN:  ['spinning_module', 'carbon_fiber'],
  RAILGUN:   ['power_cell','efficiency_module'],
  PLASMA:    ['dual_trigger','emp_rounds'],
  ROCKET:    ['seasoned_vet_rocket','rocket_burst'],
  GLAUNCHER: ['cluster_rounds','seasoned_vet_glauncher'],
  ELECTRON:  ['slow_trigger','freefall_coil','emp_rounds'],
  ION:       ['energy_coil','explosive_bullets','emp_rounds'],
  FLAMETHROWER: ['sticky_fuel','cryo_core','thermal_blast'],
  TESLA:     ['amplifier_coil','magnet_coil'],
  CROSSBOW:  ['explosive_tips', 'quick_loader', 'bolt_recovery', 'coated_tips'],
  RIVETER: ['magnetic_coils', 'superheated_rivets', 'bouncy_rivets'],
  PHALANX: ['resonance_cascade', 'emp_frequency'],
  AEGIS:   ['multi_thread', 'bypass_algorithms', 'single_thread'],
  DMR: ['power_cell', 'emp_rounds'],
  COMET: ['quick_trigger', 'emp_rounds', 'burst_modulator']
};

export const WEAPON_SKINS = {
  // --- GAMEPLAY SKINS ---
  default:    {id:'default',    category:'Gameplay', name:'Factory',    desc:'Standard issue.',           body:[0.45,0.45,0.45], accent:[0.25,0.25,0.25], grip:[0.30,0.20,0.10]},
  midnight:   {id:'midnight',   category:'Gameplay', name:'Midnight',   desc:'All-black tactical.',       body:[0.05,0.05,0.05], accent:[0.10,0.10,0.10], grip:[0.05,0.05,0.05]},
  desert:     {id:'desert',     category:'Gameplay', name:'Desert',     desc:'Sand and tan camo.',        body:[0.70,0.60,0.35], accent:[0.55,0.44,0.22], grip:[0.42,0.30,0.14]},
  arctic:     {id:'arctic',     category:'Gameplay', name:'Arctic',     desc:'Snow-pattern white.',       body:[0.75,0.78,0.82], accent:[0.50,0.55,0.60], grip:[0.35,0.40,0.45]},
  hazard:     {id:'hazard',     category:'Gameplay', name:'Hazard',     desc:'Safety orange and black.',  body:[0.90,0.30,0.02], accent:[0.10,0.10,0.10], grip:[0.06,0.06,0.06]},
  jungle:     {id:'jungle',     category:'Gameplay', name:'Jungle',     desc:'Dark ops foliage.',         body:[0.10,0.22,0.06], accent:[0.16,0.32,0.09], grip:[0.07,0.14,0.04]},
  plasma_glow:{id:'plasma_glow',category:'Gameplay', name:'Plasma',     desc:'Cyan energy accents.',      body:[0.10,0.15,0.25], accent:[0.05,0.80,0.90], grip:[0.05,0.10,0.15]},
  toxic:      {id:'toxic',      category:'Gameplay', name:'Toxic',      desc:'Radioactive slime finish.', body:[0.18,0.78,0.04], accent:[0.38,0.96,0.14], grip:[0.09,0.48,0.02]},
  gold:       {id:'gold',       category:'Gameplay', name:'Gold',       desc:'Prestige finish.',          body:[0.83,0.70,0.25], accent:[0.96,0.88,0.52], grip:[0.55,0.40,0.15]},
  crimson:    {id:'crimson',    category:'Gameplay', name:'Crimson',    desc:'Blood red.',                body:[0.22,0.01,0.01], accent:[0.12,0.01,0.01], grip:[0.08,0.01,0.01]},
  bengal:     {id:'bengal',     category:'Gameplay', name:'Bengal',     desc:'Predator stripe pattern.',  body:[0.78,0.35,0.04], accent:[0.06,0.06,0.06], grip:[0.52,0.22,0.03]},
  
  // --- MASTERY SKINS ---
  dark_matter:{id:'dark_matter',category:'Mastery',  name:'Dark Matter',desc:'Cosmic singularity.',       body:[0.04,0.01,0.12], accent:[0.50,0.05,0.90], grip:[0.06,0.02,0.14]},
  cosmic:     {id:'cosmic',     category:'Mastery',  name:'Cosmic',     desc:'Stellar constellations.',   body:[0.01,0.04,0.08], accent:[0.10,0.80,0.60], grip:[0.05,0.10,0.15]},

  // --- COLLECTOR SKINS ---
  aurora:     {id:'aurora',     category:'Collector',name:'Aurora',    desc:'Ethereal green pulse.',     body:[0.01,0.10,0.03], accent:[0.10,0.90,0.30], grip:[0.02,0.15,0.05], pulseMult: 1.5},
  nebula:     {id:'nebula',     category:'Collector',name:'Nebula',    desc:'Violet lunar clouds.',     body:[0.08,0.03,0.19], accent:[0.66,0.29,1.0], grip:[0.10,0.06,0.24]},
  cinder:     {id:'cinder',     category:'Collector',name:'Cinder',    desc:'Meteor ember finish.',    body:[0.17,0.04,0.02], accent:[1.0,0.35,0.06], grip:[0.21,0.08,0.04]},
  tundra:     {id:'tundra',     category:'Collector',name:'Tundra',    desc:'Cryogenic ice-metal.',    body:[0.55,0.72,0.77], accent:[0.26,0.82,1.0], grip:[0.22,0.40,0.46]},
};

export const SKIN_DIFFICULTY_ORDER = [
  'default','midnight','desert','crimson','arctic','hazard',
  'jungle','plasma_glow','toxic','gold','bengal',//'dark_matter', 'cosmic'
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
  GLAUNCHER:'Grenade Launcher', ELECTRON:'Electron', ION:'Ion Sniper', 
  FLAMETHROWER:'Flamethrower', TESLA:'Tesla Cannon', CROSSBOW:'Crossbow', 
  RIVETER:'Riveter', PHALANX:'Phalanx', AEGIS:'Aegis', DMR:'DMR', COMET:'Comet'
};

export const UNLOCK_TABLE = [
  // ════════════════════════════════════════════════════════════════
  //  ATTACHMENTS
  // ════════════════════════════════════════════════════════════════

    // PISTOL
  { id:'endless_magazine', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', weaponLevel:true }, target:1,
      desc:'Reach Pistol level {target}.' } },
  { id:'holo_sight', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Pistol' } },
  { id:'acog', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'sniper' }, target:15,
      desc:'Kill {target} Snipers with the Pistol' } },
  { id:'thermal', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'ion_sniper' }, target:10,
      desc:'Kill {target} Ion Snipers with the Pistol' } },
  { id:'suppressor', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', bareWeapon:true }, target:30,
      desc:'Kill {target} enemies with an unmodified Pistol' } },
  { id:'ported_barrel', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ maxCombo:true }, target:5,
      desc:'Reach a {target}‑kill combo with the Pistol' } },
  { id:'heavy_barrel', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Pistol' } },
  { id:'extended_barrel', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Pistol' } },
  { id:'quick_swap_mag', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', fullyEquipped:true }, target:25,
      desc:'Kill {target} enemies with a fully‑equipped Pistol' } },
  { id:'mag_50_cal', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', boss:true }, target:1,
      desc:'Kill a boss with the Pistol' } },
  { id:'pdw_conversion', weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', explosive:true }, target:20,
      desc:'Get {target} explosive kills with the Pistol' } },
  { id:'akimbo', weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', isHeadshot:true }, target:15,
      desc:'Hit {target} headshots with the Pistol' } },
  { id:'compensator', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Pistol' } },
  { id:'angled_grip', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', map:'jungle' }, target:20,
      desc:'Kill {target} enemies with the Pistol in the Jungle' } },
  { id:'vertical_grip', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'shotgun' }, target:15,
      desc:'Kill {target} Shotgunners with the Pistol' } },
  { id:'tactical_grip', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'scout' }, target:30,
      desc:'Kill {target} Scouts with the Pistol' } },
  { id:'folded_stock', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', withAttachment:'suppressor' }, target:10,
      desc:'Kill {target} enemies with the Pistol while using a Suppressor' } },
  { id:'heavy_stock', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Pistol' } },
  { id:'quick_trigger', weapon:'PISTOL', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', multiKill:true }, target:12,
      desc:'Get {target} multi‑kills with the Pistol' } },
  { id:'scavenger', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PISTOL' }, target:25000,
      desc:'Deal {target} damage with the Pistol' } },
  { id:'lantern', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', map:'scrapyard' }, target:25,
      desc:'Kill {target} enemies with the Pistol in the Scrapyard' } },
  { id:'night_vision', weapon:'PISTOL', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'PISTOL', map:'scrapyard' }, target:15,
      desc:'Kill {target} enemies with the Pistol and Lantern in the Scrapyard' } },

  // SMG
  { id:'holo_sight', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the SMG' } },
  { id:'acog', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'drone' }, target:30,
      desc:'Kill {target} Drones with the SMG' } },
  { id:'thermal', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'electron_bot' }, target:20,
      desc:'Kill {target} Electron Bots with the SMG' } },
  { id:'compensator', weapon:'SMG', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'SMG' }, target:18000,
      desc:'Deal {target} damage with the SMG' } },
  { id:'angled_grip', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the SMG' } },
  { id:'folded_stock', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', bareWeapon:true }, target:40,
      desc:'Kill {target} enemies with an unmodified SMG' } },
  { id:'extended_mag', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', fullyEquipped:true }, target:30,
      desc:'Kill {target} enemies with a fully‑equipped SMG' } },
  { id:'quick_mag', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', boss:true }, target:1,
      desc:'Kill a boss with the SMG' } },
  { id:'drum_mag', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', explosive:true }, target:25,
      desc:'Get {target} explosive kills with the SMG' } },
  { id:'suppressor', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'sniper' }, target:25,
      desc:'Kill {target} Snipers with the SMG' } },
  { id:'extended_barrel', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'airborne' }, target:30,
      desc:'Kill {target} enemies while airborne with the SMG' } },
  { id:'heavy_barrel', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the SMG' } },
  { id:'quick_swap_mag', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', isHeadshot:true }, target:35,
      desc:'Hit {target} headshots with the SMG' } },
  { id:'heavy_stock', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'scout' }, target:50,
      desc:'Kill {target} Scouts with the SMG' } },
  { id:'vertical_grip', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the SMG' } },
  { id:'tactical_grip', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the SMG' } },
  { id:'quick_trigger', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the SMG' } },
  { id:'akimbo', weapon:'SMG', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', isHeadshot:true }, target:10,
      desc:'Hit {target} headshots with the SMG' } },
  { id:'recoil_dampener', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'scout' }, target:60,
      desc:'Kill {target} Scouts with the SMG' } },
  { id:'scavenger', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', boss:true }, target:2,
      desc:'Kill {target} bosses with the SMG' } },
  { id:'lantern', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', map:'scrapyard' }, target:40,
      desc:'Kill {target} enemies with the SMG in the Scrapyard' } },
  { id:'night_vision', weapon:'SMG', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'SMG', map:'scrapyard' }, target:25,
      desc:'Kill {target} enemies with the SMG and Lantern in the Scrapyard' } },

  // SHOTGUN
  { id:'holo_sight', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Shotgun' } },
  { id:'acog', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'pistol' }, target:15,
      desc:'Kill {target} Pistol bots with the Shotgun' } },
  { id:'thermal', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'ion_sniper' }, target:10,
      desc:'Kill {target} Ion Snipers with the Shotgun' } },
  { id:'vertical_grip', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', fullyEquipped:true }, target:20,
      desc:'Kill {target} enemies with a fully‑equipped Shotgun' } },
  { id:'heavy_stock', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Shotgun' } },
  { id:'compensator', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'SHOTGUN' }, target:20000,
      desc:'Deal {target} damage with the Shotgun' } },
  { id:'extended_mag', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', boss:true }, target:1,
      desc:'Kill a boss with the Shotgun' } },
  { id:'slug_rounds', weapon:'SHOTGUN', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', isHeadshot:true }, target:20,
      desc:'Hit {target} headshots with the Shotgun' } },
  { id:'dragons_breath', weapon:'SHOTGUN', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'heavy' }, target:30,
      desc:'Kill {target} Heavy robots with the Shotgun' } },
  { id:'suppressor', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', bareWeapon:true }, target:30,
      desc:'Kill {target} enemies with an unmodified Shotgun' } },
  { id:'extended_barrel', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'shotgun' }, target:25,
      desc:'Kill {target} Shotgunners with the Shotgun' } },
  { id:'heavy_barrel', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'heavy' }, target:25,
      desc:'Kill {target} Heavy robots with the Shotgun' } },
  { id:'quick_swap_mag', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Shotgun' } },
  { id:'folded_stock', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Shotgun' } },
  { id:'angled_grip', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Shotgun' } },
  { id:'tactical_grip', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', bareWeapon:true }, target:50,
      desc:'Kill {target} enemies with an unmodified Shotgun' } },
  { id:'recoil_dampener', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', isHeadshot:true }, target:15,
      desc:'Hit {target} headshots with the Shotgun' } },
  { id:'scavenger', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', explosive:true }, target:20,
      desc:'Get {target} explosive kills with the Shotgun' } },
  { id:'lantern', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', map:'scrapyard' }, target:25,
      desc:'Kill {target} enemies with the Shotgun in the Scrapyard' } },
  { id:'night_vision', weapon:'SHOTGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'SHOTGUN', map:'scrapyard' }, target:15,
      desc:'Kill {target} enemies with the Shotgun and Lantern in the Scrapyard' } },

  // CHAINGUN
  { id:'holo_sight', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'airborne' }, target:30,
      desc:'Get {target} kills while airborne with the Chaingun' } },
  { id:'heavy_barrel', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'CHAINGUN' }, target:30000,
      desc:'Deal {target} damage with the Chaingun' } },
  { id:'vertical_grip', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', boss:true }, target:1,
      desc:'Kill a boss with the Chaingun' } },
  { id:'compensator', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', targetType:'scout' }, target:40,
      desc:'Kill {target} Scouts with the Chaingun' } },
  { id:'drum_mag', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', explosive:true }, target:30,
      desc:'Get {target} explosive kills with the Chaingun' } },
  { id:'spinning_module', weapon:'CHAINGUN', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'airborne' }, target:80,
      desc:'Kill {target} enemies while airborne with the Chaingun' } },
  { id:'extended_barrel', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', multiKill:true }, target:40,
      desc:'Get {target} multi‑kills with the Chaingun' } },
  { id:'quick_swap_mag', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', targetType:'drone' }, target:50,
      desc:'Kill {target} Drones with the Chaingun' } },
  { id:'extended_mag', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', fullyEquipped:true }, target:60,
      desc:'Kill {target} enemies with a fully‑equipped Chaingun' } },
  { id:'heavy_stock', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', targetType:'heavy' }, target:30,
      desc:'Kill {target} Heavy robots with the Chaingun' } },
  { id:'folded_stock', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Chaingun' } },
  { id:'angled_grip', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'airborne' }, target:40,
      desc:'Kill {target} enemies while airborne with the Chaingun' } },
  { id:'carbon_fiber', weapon:'CHAINGUN', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', multiKill:true }, target:30,
      desc:'Get {target} multi‑kills with the Chaingun' } },
  { id:'scavenger', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', boss:true }, target:2,
      desc:'Kill {target} bosses with the Chaingun' } },
  { id:'lantern', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', map:'scrapyard' }, target:30,
      desc:'Kill {target} enemies with the Chaingun in the Scrapyard' } },
  { id:'night_vision', weapon:'CHAINGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'CHAINGUN', map:'scrapyard' }, target:18,
      desc:'Kill {target} enemies with the Chaingun and Lantern in the Scrapyard' } },

  // RAILGUN
  { id:'holo_sight', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'airborne' }, target:10,
      desc:'Get {target} kills while airborne with the Railgun' } },
  { id:'acog', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'sniper' }, target:15,
      desc:'Kill {target} Snipers with the Railgun' } },
  { id:'thermal', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Railgun' } },
  { id:'extended_barrel', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'RAILGUN' }, target:50000,
      desc:'Deal {target} damage with the Railgun' } },
  { id:'power_cell', weapon:'RAILGUN', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'sniper' }, target:25,
      desc:'Kill {target} Snipers with the Railgun' } },
  { id:'efficiency_module', weapon:'RAILGUN', type:'attachment', secret:true,
    challenge:{ event:'PICKUP', conditions:{ pickupType:'railgun' }, target:20,
      desc:'Pick up {target} Railgun ammo drops' } },
  { id:'suppressor', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', bareWeapon:true }, target:15,
      desc:'Kill {target} enemies with an unmodified Railgun' } },
  { id:'extended_barrel2', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Railgun' } },
  { id:'compensator', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'heavy' }, target:12,
      desc:'Kill {target} Heavy robots with the Railgun' } },
  { id:'folded_stock', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', multiKill:true }, target:8,
      desc:'Get {target} multi‑kills with the Railgun' } },
  { id:'angled_grip', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Railgun' } },
  { id:'vertical_grip', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'sniper' }, target:15,
      desc:'Kill {target} Snipers with the Railgun' } },
  { id:'lantern', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', map:'scrapyard' }, target:15,
      desc:'Kill {target} enemies with the Railgun in the Scrapyard' } },
  { id:'night_vision', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'RAILGUN', map:'scrapyard' }, target:10,
      desc:'Kill {target} enemies with the Railgun and Lantern in the Scrapyard' } },
  { id:'recoil_dampener', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Railgun' } },
  { id:'stabilizing_brace', weapon:'RAILGUN', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'acog', weapon:'RAILGUN' }, target:10,
      desc:'Kill {target} enemies with the Railgun while using ACOG' } },

  // PLASMA
  { id:'holo_sight', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Plasma Rifle' } },
  { id:'thermal', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Plasma Rifle' } },
  { id:'acog', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the Plasma Rifle' } },
  { id:'extended_mag', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'electron_bot' }, target:30,
      desc:'Kill {target} Electron Bots with the Plasma Rifle' } },
  { id:'plasma_accelerator', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the Plasma Rifle' } },
  { id:'energy_converter', weapon:'PLASMA', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'ion_sniper' }, target:10,
      desc:'Kill {target} Ion Snipers with the Plasma Rifle' } },
  { id:'dual_trigger', weapon:'PLASMA', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', boss:true }, target:2,
      desc:'Kill {target} bosses with the Plasma Rifle' } },
  { id:'suppressor', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', bareWeapon:true }, target:30,
      desc:'Kill {target} enemies with an unmodified Plasma Rifle' } },
  { id:'extended_barrel', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PLASMA' }, target:25000,
      desc:'Deal {target} damage with the Plasma Rifle' } },
  { id:'compensator', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'scout' }, target:30,
      desc:'Kill {target} Scouts with the Plasma Rifle' } },
  { id:'heavy_barrel', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Plasma Rifle' } },
  { id:'quick_swap_mag', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Plasma Rifle' } },
  { id:'extended_mag2', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'electron_bot' }, target:25,
      desc:'Kill {target} Electron Bots with the Plasma Rifle' } },
  { id:'heavy_stock', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', fullyEquipped:true }, target:40,
      desc:'Kill {target} enemies with a fully‑equipped Plasma Rifle' } },
  { id:'folded_stock', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', bareWeapon:true }, target:30,
      desc:'Kill {target} enemies with an unmodified Plasma Rifle' } },
  { id:'angled_grip', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Plasma Rifle' } },
  { id:'vertical_grip', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'scout' }, target:40,
      desc:'Kill {target} Scouts with the Plasma Rifle' } },
  { id:'emp_rounds', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'ninja' }, target:30,
      desc:'Kill {target} Ninjas with the Plasma Rifle' } },
  { id:'lantern', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', map:'scrapyard' }, target:25,
      desc:'Kill {target} enemies with the Plasma Rifle in the Scrapyard' } },
  { id:'night_vision', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'PLASMA', map:'scrapyard' }, target:15,
      desc:'Kill {target} enemies with the Plasma Rifle and Lantern in the Scrapyard' } },
  { id:'stabilizing_brace', weapon:'PLASMA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'acog', weapon:'PLASMA' }, target:15,
      desc:'Kill {target} enemies with the Plasma Rifle while using ACOG' } },

  // ROCKET
  { id:'holo_sight', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'airborne' }, target:10,
      desc:'Get {target} kills while airborne with the Rocket Launcher' } },
  { id:'acog', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'scoped' }, target:10,
      desc:'Kill {target} enemies while scoped with the Rocket Launcher' } },
  { id:'thermal', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ explosive:true }, target:50,
      desc:'Get {target} explosive kills with the Rocket Launcher' } },
  { id:'suppressor', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Rocket Launcher' } },
  { id:'heavy_barrel', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ROCKET' }, target:25000,
      desc:'Deal {target} damage with the Rocket Launcher' } },
  { id:'seasoned_vet_rocket', weapon:'ROCKET', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', boss:true }, target:1,
      desc:'Kill a boss with the Rocket Launcher' } },
  { id:'extended_barrel', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'airborne' }, target:10,
      desc:'Kill {target} enemies while airborne with the Rocket Launcher' } },
  { id:'heavy_propellant', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'heavy' }, target:10,
      desc:'Kill {target} Heavy robots with the Rocket Launcher' } },
  { id:'quick_swap_mag', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'heavy' }, target:8,
      desc:'Kill {target} Heavy robots with the Rocket Launcher' } },
  { id:'extended_mag', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Rocket Launcher' } },
  { id:'heavy_stock', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Rocket Launcher' } },
  { id:'folded_stock', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Rocket Launcher' } },
  { id:'rocket_burst', weapon:'ROCKET', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', boss:true }, target:2,
      desc:'Kill {target} bosses with the Rocket Launcher' } },
  { id:'lantern', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', map:'scrapyard' }, target:20,
      desc:'Kill {target} enemies with the Rocket Launcher in the Scrapyard' } },
  { id:'night_vision', weapon:'ROCKET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'ROCKET', map:'scrapyard' }, target:12,
      desc:'Kill {target} enemies with the Rocket Launcher and Lantern in the Scrapyard' } },

  // GLAUNCHER
  { id:'holo_sight', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', playerState:'airborne' }, target:12,
      desc:'Get {target} kills while airborne with the Grenade Launcher' } },
  { id:'acog', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Grenade Launcher' } },
  { id:'thermal', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'grenadier' }, target:20,
      desc:'Kill {target} Grenadiers with the Grenade Launcher' } },
  { id:'compensator', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'GLAUNCHER' }, target:20000,
      desc:'Deal {target} damage with the Grenade Launcher' } },
  { id:'cluster_rounds', weapon:'GLAUNCHER', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ explosive:true }, target:30,
      desc:'Get {target} explosive kills with the Grenade Launcher' } },
  { id:'seasoned_vet_glauncher', weapon:'GLAUNCHER', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', boss:true }, target:1,
      desc:'Kill a boss with the Grenade Launcher' } },
  { id:'suppressor', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', bareWeapon:true }, target:20,
      desc:'Kill {target} enemies with an unmodified Grenade Launcher' } },
  { id:'extended_barrel', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'grenadier' }, target:15,
      desc:'Kill {target} Grenadiers with the Grenade Launcher' } },
  { id:'long_barrel_gl', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'rocket' }, target:15,
      desc:'Kill {target} Rocket bots with the Grenade Launcher' } },
  { id:'heavy_barrel', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Grenade Launcher' } },
  { id:'quick_swap_mag', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Grenade Launcher' } },
  { id:'extended_mag', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', fullyEquipped:true }, target:25,
      desc:'Kill {target} enemies with a fully‑equipped Grenade Launcher' } },
  { id:'heavy_stock', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ maxCombo:true }, target:8,
      desc:'Reach a {target}‑kill combo with the Grenade Launcher' } },
  { id:'folded_stock', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'rocket' }, target:12,
      desc:'Kill {target} Rocket bots with the Grenade Launcher' } },
  { id:'lantern', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', map:'scrapyard' }, target:22,
      desc:'Kill {target} enemies with the Grenade Launcher in the Scrapyard' } },
  { id:'night_vision', weapon:'GLAUNCHER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'GLAUNCHER', map:'scrapyard' }, target:14,
      desc:'Kill {target} enemies with the Grenade Launcher and Lantern in the Scrapyard' } },

  // ELECTRON
  { id:'holo_sight', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Electron' } },
  { id:'acog', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Electron' } },
  { id:'thermal', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the Electron' } },
  { id:'compensator', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ELECTRON' }, target:8000,
      desc:'Deal {target} damage with the Electron' } },
  { id:'heavy_barrel', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Electron' } },
  { id:'extended_barrel', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', boss:true }, target:2,
      desc:'Kill {target} bosses with the Electron' } },
  { id:'slow_trigger', weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'airborne' }, target:30,
      desc:'Kill {target} enemies while airborne with the Electron' } },
  { id:'heavy_stock', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', targetType:'electron_bot' }, target:20,
      desc:'Kill {target} Electron Bots with the Electron' } },
  { id:'folded_stock', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', bareWeapon:true }, target:25,
      desc:'Kill {target} enemies with an unmodified Electron' } },
  { id:'angled_grip', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Electron' } },
  { id:'vertical_grip', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Electron' } },
  { id:'freefall_coil', weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'airborne' }, target:40,
      desc:'Kill {target} enemies while airborne with the Electron' } },
  { id:'emp_rounds', weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ event:'STATUS_APPLIED', conditions:{ statusType:'EMP_STUN' }, target:50,
      desc:'Stun {target} enemies with EMP rounds' } },
  { id:'lantern', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', map:'scrapyard' }, target:30,
      desc:'Kill {target} enemies with the Electron in the Scrapyard' } },
  { id:'night_vision', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'ELECTRON', map:'scrapyard' }, target:18,
      desc:'Kill {target} enemies with the Electron and Lantern in the Scrapyard' } },
  { id:'stabilizing_brace', weapon:'ELECTRON', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'acog', weapon:'ELECTRON' }, target:20,
      desc:'Kill {target} enemies with the Electron while using ACOG' } },

  // ION
  { id:'holo_sight', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', isHeadshot:true }, target:10,
      desc:'Hit {target} headshots with the Ion Sniper' } },
  { id:'acog', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', multiKill:true }, target:5,
      desc:'Get {target} multi‑kills with the Ion Sniper' } },
  { id:'thermal', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the Ion Sniper' } },
  { id:'extended_barrel', weapon:'ION', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ION' }, target:30000,
      desc:'Deal {target} damage with the Ion Sniper' } },
  { id:'energy_coil', weapon:'ION', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'airborne' }, target:30,
      desc:'Kill {target} enemies while airborne with the Ion Sniper' } },
  { id:'suppressor', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'sniper' }, target:8,
      desc:'Kill {target} Snipers with the Ion Sniper' } },
  { id:'heavy_barrel', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'heavy' }, target:10,
      desc:'Kill {target} Heavy robots with the Ion Sniper' } },
  { id:'compensator', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Ion Sniper' } },
  { id:'heavy_stock', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', boss:true }, target:2,
      desc:'Kill {target} bosses with the Ion Sniper' } },
  { id:'folded_stock', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', multiKill:true }, target:5,
      desc:'Get {target} multi‑kills with the Ion Sniper' } },
  { id:'angled_grip', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Ion Sniper' } },
  { id:'vertical_grip', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Ion Sniper' } },
  { id:'explosive_bullets', weapon:'ION', type:'attachment', secret:true,
    challenge:{ event:'BARREL_DESTROYED', conditions:{}, target:30,
      desc:'Destroy {target} explosive barrels' } },
  { id:'emp_rounds', weapon:'ION', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Ion Sniper' } },
  { id:'lantern', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', map:'scrapyard' }, target:20,
      desc:'Kill {target} enemies with the Ion Sniper in the Scrapyard' } },
  { id:'night_vision', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'ION', map:'scrapyard' }, target:12,
      desc:'Kill {target} enemies with the Ion Sniper and Lantern in the Scrapyard' } },
  { id:'recoil_dampener', weapon:'ION', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Ion Sniper' } },

  // FLAMETHROWER
  { id:'napalm_tank', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'swarm_host' }, target:10,
      desc:'Kill {target} Swarm Hosts with the Flamethrower' } },
  { id:'wide_nozzle', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'shield_bot' }, target:20,
      desc:'Kill {target} Shield Bots with the Flamethrower' } },
  { id:'holo_sight', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Flamethrower' } },
  { id:'acog', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'shield_bot' }, target:15,
      desc:'Kill {target} Shield Bots with the Flamethrower' } },
  { id:'thermal', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'medic_bot' }, target:10,
      desc:'Kill {target} Medic Bots with the Flamethrower' } },
  { id:'angled_grip', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Flamethrower' } },
  { id:'vertical_grip', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'FLAMETHROWER' }, target:40000,
      desc:'Deal {target} damage with the Flamethrower' } },
  { id:'tactical_grip', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'swarm_host' }, target:8,
      desc:'Kill {target} Swarm Hosts with the Flamethrower' } },
  { id:'heavy_stock', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Flamethrower' } },
  { id:'folded_stock', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the Flamethrower' } },
  { id:'efficiency_tank', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'PICKUP', conditions:{ pickupType:'flamethrower' }, target:15,
      desc:'Collect {target} Flamethrower pickups' } },
  { id:'long_barrel_fl', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Flamethrower' } },
  { id:'lantern', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', map:'jungle' }, target:30,
      desc:'Kill {target} enemies with the Flamethrower in the Jungle' } },
  { id:'night_vision', weapon:'FLAMETHROWER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'FLAMETHROWER', map:'jungle' }, target:18,
      desc:'Kill {target} enemies with the Flamethrower and Lantern in the Jungle' } },

  // TESLA
  { id:'amplifier_coil', weapon:'TESLA', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA_CHAIN' }, target:15,
      desc:'Kill {target} enemies with Tesla Chain Lightning' } },
  { id:'capacitor_bank', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'shield_bot' }, target:10,
      desc:'Kill {target} Shield Bots with the Tesla Cannon' } },
  { id:'efficiency_tank', weapon:'TESLA', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'TESLA' }, target:50000,
      desc:'Deal {target} damage with the Tesla Cannon' } },
  { id:'holo_sight', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Tesla Cannon' } },
  { id:'acog', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'swarm_host' }, target:15,
      desc:'Kill {target} Swarm Hosts with the Tesla Cannon' } },
  { id:'thermal', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'teleport_bot' }, target:10,
      desc:'Kill {target} Teleport Bots with the Tesla Cannon' } },
  { id:'angled_grip', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Tesla Cannon' } },
  { id:'vertical_grip', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', boss:true }, target:2,
      desc:'Kill {target} bosses with the Tesla Cannon' } },
  { id:'tactical_grip', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'shield_bot' }, target:15,
      desc:'Kill {target} Shield Bots with the Tesla Cannon' } },
  { id:'heavy_stock', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Tesla Cannon' } },
  { id:'folded_stock', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', explosive:true }, target:20,
      desc:'Get {target} explosive kills with the Tesla Cannon' } },
  { id:'magnet_coil', weapon:'TESLA', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA_CHAIN' }, target:40,
      desc:'Kill {target} enemies with Tesla Chain Lightning' } },
  { id:'compensator', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Tesla Cannon' } },
  { id:'ported_barrel', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Tesla Cannon' } },
  { id:'lantern', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', map:'jungle' }, target:25,
      desc:'Kill {target} enemies with the Tesla Cannon in the Jungle' } },
  { id:'night_vision', weapon:'TESLA', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'TESLA', map:'jungle' }, target:15,
      desc:'Kill {target} enemies with the Tesla Cannon and Lantern in the Jungle' } },

  // CROSSBOW
  { id:'explosive_tips', weapon:'CROSSBOW', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'teleport_bot' }, target:10,
      desc:'Kill {target} Teleport Bots with the Crossbow' } },
  { id:'quick_loader', weapon:'CROSSBOW', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', boss:true }, target:1,
      desc:'Kill a boss with the Crossbow' } },
  { id:'holo_sight', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', playerState:'airborne' }, target:12,
      desc:'Get {target} kills while airborne with the Crossbow' } },
  { id:'acog', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'ninja' }, target:15,
      desc:'Kill {target} Ninjas with the Crossbow' } },
  { id:'thermal', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'heavy' }, target:10,
      desc:'Kill {target} Heavy robots with the Crossbow' } },
  { id:'extended_barrel', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Crossbow' } },
  { id:'lightweight_limbs', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Crossbow' } },
  { id:'heavy_barrel', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Crossbow' } },
  { id:'bolt_recovery', weapon:'CROSSBOW', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', isHeadshot:true }, target:30,
      desc:'Hit {target} headshots with the Crossbow' } },
  { id:'angled_grip', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Crossbow' } },
  { id:'vertical_grip', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Crossbow' } },
  { id:'tactical_grip', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'ninja' }, target:20,
      desc:'Kill {target} Ninjas with the Crossbow' } },
  { id:'heavy_stock', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'scout' }, target:15,
      desc:'Kill {target} Scouts with the Crossbow' } },
  { id:'folded_stock', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', bareWeapon:true }, target:30,
      desc:'Kill {target} enemies with an unmodified Crossbow' } },
  { id:'coated_tips', weapon:'CROSSBOW', type:'attachment', secret:true,
    challenge:{ event:'BARREL_DESTROYED', conditions:{}, target:30,
      desc:'Destroy {target} explosive barrels' } },
  { id:'lantern', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', map:'jungle' }, target:25,
      desc:'Kill {target} enemies with the Crossbow in the Jungle' } },
  { id:'night_vision', weapon:'CROSSBOW', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'CROSSBOW', map:'jungle' }, target:15,
      desc:'Kill {target} enemies with the Crossbow and Lantern in the Jungle' } },

  // RIVETER
  { id:'holo_sight', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Riveter' } },
  { id:'acog', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', isHeadshot:true }, target:15,
      desc:'Hit {target} headshots with the Riveter' } },
  { id:'thermal', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Riveter' } },
  { id:'lantern', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', map:'city' }, target:20,
      desc:'Kill {target} enemies with the Riveter in the City' } },
  { id:'night_vision', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'RIVETER', map:'city' }, target:12,
      desc:'Kill {target} enemies with the Riveter and Lantern in the City' } },
  { id:'suppressor', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Riveter' } },
  { id:'compensator', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Riveter' } },
  { id:'extended_mag', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'drone' }, target:20,
      desc:'Kill {target} Drones with the Riveter' } },
  { id:'drum_mag', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Riveter' } },
  { id:'heavy_stock', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Riveter' } },
  { id:'folded_stock', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', bareWeapon:true }, target:20,
      desc:'Kill {target} enemies with an unmodified Riveter' } },
  { id:'magnetic_coils', weapon:'RIVETER', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER' }, target:30,
      desc:'Kill {target} enemies with the Riveter' } },
  { id:'superheated_rivets', weapon:'RIVETER', type:'attachment', secret:true,
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'RIVETER' }, target:15000,
      desc:'Deal {target} damage with the Riveter' } },
  { id:'bouncy_rivets', weapon:'RIVETER', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER' }, target:30,
      desc:'Kill {target} enemies with bounced Rivets' } },
  { id:'angled_grip', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the Riveter' } },
  { id:'vertical_grip', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'scout' }, target:15,
      desc:'Kill {target} Scouts with the Riveter' } },
  { id:'stabilizing_brace', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'acog', weapon:'RIVETER' }, target:15,
      desc:'Kill {target} enemies with the Riveter while using ACOG' } },
  { id:'heavy_barrel', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Riveter' } },
  { id:'extended_barrel', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Riveter' } },
  { id:'lightweight_handguard', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Riveter' } },
  { id:'quick_swap_mag', weapon:'RIVETER', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Riveter' } },

  // PHALANX
  { id:'holo_sight', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Phalanx' } },
  { id:'acog', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Phalanx' } },
  { id:'thermal', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Phalanx' } },
  { id:'lantern', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', map:'city' }, target:20,
      desc:'Kill {target} enemies with the Phalanx in the City' } },
  { id:'night_vision', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'PHALANX', map:'city' }, target:12,
      desc:'Kill {target} enemies with the Phalanx and Lantern in the City' } },
  { id:'extended_mag', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PHALANX' }, target:25000,
      desc:'Deal {target} damage with the Phalanx' } },
  { id:'drum_mag', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the Phalanx' } },
  { id:'angled_grip', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Phalanx' } },
  { id:'vertical_grip', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Phalanx' } },
  { id:'resonance_cascade', weapon:'PHALANX', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Phalanx' } },
  { id:'emp_frequency', weapon:'PHALANX', type:'attachment', secret:true,
    challenge:{ event:'STATUS_APPLIED', conditions:{ statusType:'EMP_STUN' }, target:40,
      desc:'Stun {target} enemies' } },
  { id:'sonic_amplifier', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Phalanx' } },
  { id:'wide_diaphragm', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', boss:true }, target:2,
      desc:'Kill {target} bosses with the Phalanx' } },
  { id:'heavy_stock', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Phalanx' } },
  { id:'folded_stock', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Phalanx' } },
  { id:'heavy_barrel', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Phalanx' } },
  { id:'extended_barrel', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Phalanx' } },
  { id:'lightweight_handguard', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the Phalanx' } },
  { id:'quick_swap_mag', weapon:'PHALANX', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Phalanx' } },

  // AEGIS
  { id:'holo_sight', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Aegis' } },
  { id:'acog', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'AEGIS' }, target:25000,
      desc:'Deal {target} damage with the Aegis' } },
  { id:'thermal', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Aegis' } },
  { id:'lantern', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', map:'city' }, target:20,
      desc:'Kill {target} enemies with the Aegis in the City' } },
  { id:'night_vision', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'lantern', weapon:'AEGIS', map:'city' }, target:12,
      desc:'Kill {target} enemies with the Aegis and Lantern in the City' } },
  { id:'suppressor', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', bareWeapon:true }, target:25,
      desc:'Kill {target} enemies with an unmodified Aegis' } },
  { id:'compensator', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the Aegis' } },
  { id:'extended_mag', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Aegis' } },
  { id:'drum_mag', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', multiKill:true }, target:30,
      desc:'Get {target} multi‑kills with the Aegis' } },
  { id:'angled_grip', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Aegis' } },
  { id:'vertical_grip', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', bareWeapon:true }, target:25,
      desc:'Kill {target} enemies with an unmodified Aegis' } },
  { id:'multi_thread', weapon:'AEGIS', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', multiKill:true }, target:25,
      desc:'Get {target} multi‑kills with the Aegis' } },
  { id:'bypass_algorithms', weapon:'AEGIS', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'shield_bot' }, target:15,
      desc:'Kill {target} Shield Bots with the Aegis' } },
  { id:'heavy_stock', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Aegis' } },
  { id:'folded_stock', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'scout' }, target:15,
      desc:'Kill {target} Scouts with the Aegis' } },
  { id:'stabilizing_brace', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ withAttachment:'acog', weapon:'AEGIS' }, target:15,
      desc:'Kill {target} enemies with the Aegis while using ACOG' } },
  { id:'single_thread', weapon:'AEGIS', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', boss:true }, target:2,
      desc:'Kill {target} bosses with the Aegis' } },
  { id:'heavy_barrel', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Aegis' } },
  { id:'extended_barrel', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Aegis' } },
  { id:'quick_swap_mag', weapon:'AEGIS', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Aegis' } },

  // ── COMET (Burst Rifle) attachments ──────────────────────────
  { id:'holo_sight', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the COMET' } },
  { id:'acog', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the COMET' } },
  { id:'thermal', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'drone' }, target:15,
      desc:'Kill {target} Drones with the COMET' } },
  { id:'suppressor', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', bareWeapon:true }, target:25,
      desc:'Kill {target} enemies with an unmodified COMET' } },
  { id:'compensator', weapon:'COMET', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'COMET' }, target:20000,
      desc:'Deal {target} damage with the COMET' } },
  { id:'extended_barrel', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the COMET' } },
  { id:'heavy_barrel', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the COMET' } },
  { id:'quick_swap_mag', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', boss:true }, target:1,
      desc:'Kill a boss with the COMET' } },
  { id:'extended_mag', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', fullyEquipped:true }, target:30,
      desc:'Kill {target} enemies with a fully‑equipped COMET' } },
  { id:'drum_mag', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', explosive:true }, target:15,
      desc:'Get {target} explosive kills with the COMET' } },
  { id:'angled_grip', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the COMET' } },
  { id:'vertical_grip', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the COMET' } },
  { id:'tactical_grip', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', multiKill:true }, target:10,
      desc:'Get {target} multi‑kills with the COMET' } },
  { id:'heavy_stock', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'heavy' }, target:10,
      desc:'Kill {target} Heavy robots with the COMET' } },
  { id:'folded_stock', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', fullyEquipped:true }, target:30,
      desc:'Kill {target} enemies with a fully‑equipped COMET' } },
  { id:'recoil_dampener', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', isHeadshot:true }, target:20,
      desc:'Hit {target} headshots with the COMET' } },
  { id:'burst_modulator', weapon:'COMET', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the COMET' } },
  { id:'precision_barrel', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', isHeadshot:true }, target:15,
      desc:'Hit {target} headshots with the COMET' } },
  { id:'lightweight_handguard', weapon:'COMET', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'airborne' }, target:20,
      desc:'Kill {target} enemies while airborne with the COMET' } },
  { id:'quick_trigger', weapon:'COMET', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the COMET' } },
  { id:'emp_rounds', weapon:'COMET', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'heavy' }, target:12,
      desc:'Kill {target} Heavy robots with the COMET' } },

  // ── DMR attachments ──────────────────────────────────────────
  { id:'holo_sight', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'airborne' }, target:12,
      desc:'Get {target} kills while airborne with the DMR' } },
  { id:'acog', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the DMR' } },
  { id:'thermal', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'sniper' }, target:15,
      desc:'Kill {target} Snipers with the DMR' } },
  { id:'suppressor', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', bareWeapon:true }, target:20,
      desc:'Kill {target} enemies with an unmodified DMR' } },
  { id:'compensator', weapon:'DMR', type:'attachment',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'DMR' }, target:25000,
      desc:'Deal {target} damage with the DMR' } },
  { id:'extended_barrel', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the DMR' } },
  { id:'heavy_barrel', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the DMR' } },
  { id:'quick_swap_mag', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', boss:true }, target:1,
      desc:'Kill a boss with the DMR' } },
  { id:'extended_mag', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', fullyEquipped:true }, target:25,
      desc:'Kill {target} enemies with a fully‑equipped DMR' } },
  { id:'angled_grip', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'airborne' }, target:15,
      desc:'Kill {target} enemies while airborne with the DMR' } },
  { id:'vertical_grip', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', explosive:true }, target:15,
      desc:'Get {target} explosive kills with the DMR' } },
  { id:'tactical_grip', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', multiKill:true }, target:10,
      desc:'Get {target} multi‑kills with the DMR' } },
  { id:'heavy_stock', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'heavy' }, target:10,
      desc:'Kill {target} Heavy robots with the DMR' } },
  { id:'folded_stock', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', fullyEquipped:true }, target:30,
      desc:'Kill {target} enemies with a fully‑equipped DMR' } },
  { id:'recoil_dampener', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', isHeadshot:true }, target:20,
      desc:'Hit {target} headshots with the DMR' } },
  { id:'high_caliber', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', isHeadshot:true }, target:20,
      desc:'Hit {target} headshots with the DMR' } },
  { id:'stabilizing_bipod', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'scoped' }, target:30,
      desc:'Kill {target} enemies while scoped with the DMR' } },
  { id:'precision_stock', weapon:'DMR', type:'attachment',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'airborne' }, target:25,
      desc:'Kill {target} enemies while airborne with the DMR' } },
  { id:'power_cell', weapon:'DMR', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', multiKill:true }, target:12,
      desc:'Get {target} multi‑kills with the DMR' } },
  { id:'emp_rounds', weapon:'DMR', type:'attachment', secret:true,
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'heavy' }, target:12,
      desc:'Kill {target} Heavy robots with the DMR' } },

  // ════════════════════════════════════════════════════════════════
  //  WEAPON SKINS
  // ════════════════════════════════════════════════════════════════
  // PISTOL
  { id:'midnight', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL' }, target:30,
      desc:'Kill {target} enemies with the Pistol' } },
  { id:'desert', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Pistol' } },
  { id:'arctic', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Pistol' } },
  { id:'hazard', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'scout' }, target:30,
      desc:'Kill {target} Scouts with the Pistol' } },
  { id:'jungle', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Pistol' } },
  { id:'plasma_glow', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Pistol' } },
  { id:'toxic', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', targetType:'drone' }, target:30,
      desc:'Kill {target} Drones with the Pistol' } },
  { id:'gold', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PISTOL' }, target:25000,
      desc:'Deal {target} damage with the Pistol' } },
  { id:'crimson', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', boss:true }, target:1,
      desc:'Kill a boss with the Pistol' } },
  { id:'bengal', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PISTOL', weaponLevel:true }, target:10,
      desc:'Reach Pistol level 10' } },
  { id:'dark_matter', weapon:'PISTOL', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'PISTOL' }, target:1,
      desc:'Complete all Pistol challenges' } },
  { id:'cosmic', weapon:'PISTOL', type:'weaponSkin', requires:'dark_matter',
    challenge: { 
      isComposite: true,
      desc: 'Get 30 Pistol kills and 15 airborne SMG kills.',
      subChallenges: [
        { event: 'KILL', conditions: { weapon: 'PISTOL' }, target: 30, desc: 'Pistol Kills' },
        { event: 'KILL', conditions: { weapon: 'SMG', playerState: 'airborne' }, target: 10, desc: 'Airborne SMG Kills' }
      ]
    } 
  },

  // SMG
  { id:'midnight', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG' }, target:30,
      desc:'Kill {target} enemies with the SMG' } },
  { id:'desert', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the SMG' } },
  { id:'arctic', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the SMG' } },
  { id:'hazard', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'drone' }, target:30,
      desc:'Kill {target} Drones with the SMG' } },
  { id:'jungle', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the SMG' } },
  { id:'plasma_glow', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the SMG' } },
  { id:'toxic', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', targetType:'electron_bot' }, target:25,
      desc:'Kill {target} Electron Bots with the SMG' } },
  { id:'gold', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'SMG' }, target:25000,
      desc:'Deal {target} damage with the SMG' } },
  { id:'crimson', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', boss:true }, target:1,
      desc:'Kill a boss with the SMG' } },
  { id:'bengal', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SMG', weaponLevel:true }, target:10,
      desc:'Reach SMG level 10' } },
  { id:'dark_matter', weapon:'SMG', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'SMG' }, target:1,
      desc:'Complete all SMG challenges' } },

  // SHOTGUN
  { id:'midnight', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN' }, target:25,
      desc:'Kill {target} enemies with the Shotgun' } },
  { id:'desert', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Shotgun' } },
  { id:'arctic', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Shotgun' } },
  { id:'hazard', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Shotgun' } },
  { id:'jungle', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Shotgun' } },
  { id:'plasma_glow', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Shotgun' } },
  { id:'toxic', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', targetType:'shotgun' }, target:25,
      desc:'Kill {target} Shotgunners with the Shotgun' } },
  { id:'gold', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'SHOTGUN' }, target:20000,
      desc:'Deal {target} damage with the Shotgun' } },
  { id:'crimson', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', boss:true }, target:1,
      desc:'Kill a boss with the Shotgun' } },
  { id:'bengal', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'SHOTGUN', weaponLevel:true }, target:10,
      desc:'Reach Shotgun level 10' } },
  { id:'dark_matter', weapon:'SHOTGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'SHOTGUN' }, target:1,
      desc:'Complete all Shotgun challenges' } },

  // CHAINGUN
  { id:'midnight', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN' }, target:30,
      desc:'Kill {target} enemies with the Chaingun' } },
  { id:'desert', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Chaingun' } },
  { id:'arctic', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'airborne' }, target:25,
      desc:'Get {target} kills while airborne with the Chaingun' } },
  { id:'hazard', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', targetType:'heavy' }, target:25,
      desc:'Kill {target} Heavy robots with the Chaingun' } },
  { id:'jungle', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Chaingun' } },
  { id:'plasma_glow', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', multiKill:true }, target:20,
      desc:'Get {target} multi‑kills with the Chaingun' } },
  { id:'toxic', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', targetType:'drone' }, target:30,
      desc:'Kill {target} Drones with the Chaingun' } },
  { id:'gold', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'CHAINGUN' }, target:35000,
      desc:'Deal {target} damage with the Chaingun' } },
  { id:'crimson', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', boss:true }, target:1,
      desc:'Kill a boss with the Chaingun' } },
  { id:'bengal', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CHAINGUN', weaponLevel:true }, target:10,
      desc:'Reach Chaingun level 10' } },
  { id:'dark_matter', weapon:'CHAINGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'CHAINGUN' }, target:1,
      desc:'Complete all Chaingun challenges' } },

  // RAILGUN
  { id:'midnight', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN' }, target:20,
      desc:'Kill {target} enemies with the Railgun' } },
  { id:'desert', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', isHeadshot:true }, target:10,
      desc:'Get {target} headshot kills with the Railgun' } },
  { id:'arctic', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Railgun' } },
  { id:'hazard', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'sniper' }, target:15,
      desc:'Kill {target} Snipers with the Railgun' } },
  { id:'jungle', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Railgun' } },
  { id:'plasma_glow', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', multiKill:true }, target:10,
      desc:'Get {target} multi‑kills with the Railgun' } },
  { id:'toxic', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Railgun' } },
  { id:'gold', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'RAILGUN' }, target:30000,
      desc:'Deal {target} damage with the Railgun' } },
  { id:'crimson', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', boss:true }, target:1,
      desc:'Kill a boss with the Railgun' } },
  { id:'bengal', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RAILGUN', weaponLevel:true }, target:10,
      desc:'Reach Railgun level 10' } },
  { id:'dark_matter', weapon:'RAILGUN', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'RAILGUN' }, target:1,
      desc:'Complete all Railgun challenges' } },

  // PLASMA
  { id:'midnight', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA' }, target:30,
      desc:'Kill {target} enemies with the Plasma Rifle' } },
  { id:'desert', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Plasma Rifle' } },
  { id:'arctic', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Plasma Rifle' } },
  { id:'hazard', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'electron_bot' }, target:20,
      desc:'Kill {target} Electron Bots with the Plasma Rifle' } },
  { id:'jungle', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Plasma Rifle' } },
  { id:'plasma_glow', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Plasma Rifle' } },
  { id:'toxic', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Plasma Rifle' } },
  { id:'gold', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PLASMA' }, target:30000,
      desc:'Deal {target} damage with the Plasma Rifle' } },
  { id:'crimson', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', boss:true }, target:1,
      desc:'Kill a boss with the Plasma Rifle' } },
  { id:'bengal', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PLASMA', weaponLevel:true }, target:10,
      desc:'Reach Plasma Rifle level 10' } },
  { id:'dark_matter', weapon:'PLASMA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'PLASMA' }, target:1,
      desc:'Complete all Plasma Rifle challenges' } },

  // ROCKET
  { id:'midnight', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET' }, target:20,
      desc:'Kill {target} enemies with the Rocket Launcher' } },
  { id:'desert', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', isHeadshot:true }, target:10,
      desc:'Get {target} headshot kills with the Rocket Launcher' } },
  { id:'arctic', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Rocket Launcher' } },
  { id:'hazard', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Rocket Launcher' } },
  { id:'jungle', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Rocket Launcher' } },
  { id:'plasma_glow', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', multiKill:true }, target:12,
      desc:'Get {target} multi‑kills with the Rocket Launcher' } },
  { id:'toxic', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', targetType:'scout' }, target:20,
      desc:'Kill {target} Scouts with the Rocket Launcher' } },
  { id:'gold', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ROCKET' }, target:25000,
      desc:'Deal {target} damage with the Rocket Launcher' } },
  { id:'crimson', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', boss:true }, target:1,
      desc:'Kill a boss with the Rocket Launcher' } },
  { id:'bengal', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ROCKET', weaponLevel:true }, target:10,
      desc:'Reach Rocket Launcher level 10' } },
  { id:'dark_matter', weapon:'ROCKET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'ROCKET' }, target:1,
      desc:'Complete all Rocket Launcher challenges' } },

  // GLAUNCHER
  { id:'midnight', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER' }, target:20,
      desc:'Kill {target} enemies with the Grenade Launcher' } },
  { id:'desert', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', isHeadshot:true }, target:10,
      desc:'Get {target} headshot kills with the Grenade Launcher' } },
  { id:'arctic', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Grenade Launcher' } },
  { id:'hazard', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'grenadier' }, target:15,
      desc:'Kill {target} Grenadiers with the Grenade Launcher' } },
  { id:'jungle', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', playerState:'scoped' }, target:15,
      desc:'Kill {target} enemies while scoped with the Grenade Launcher' } },
  { id:'plasma_glow', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', multiKill:true }, target:12,
      desc:'Get {target} multi‑kills with the Grenade Launcher' } },
  { id:'toxic', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', targetType:'rocket' }, target:15,
      desc:'Kill {target} Rocket bots with the Grenade Launcher' } },
  { id:'gold', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'GLAUNCHER' }, target:25000,
      desc:'Deal {target} damage with the Grenade Launcher' } },
  { id:'crimson', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', boss:true }, target:1,
      desc:'Kill a boss with the Grenade Launcher' } },
  { id:'bengal', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'GLAUNCHER', weaponLevel:true }, target:10,
      desc:'Reach Grenade Launcher level 10' } },
  { id:'dark_matter', weapon:'GLAUNCHER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'GLAUNCHER' }, target:1,
      desc:'Complete all Grenade Launcher challenges' } },

  // ELECTRON
  { id:'midnight', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON' }, target:25,
      desc:'Kill {target} enemies with the Electron' } },
  { id:'desert', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Electron' } },
  { id:'arctic', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Electron' } },
  { id:'hazard', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Electron' } },
  { id:'jungle', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Electron' } },
  { id:'plasma_glow', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Electron' } },
  { id:'toxic', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', targetType:'electron_bot' }, target:20,
      desc:'Kill {target} Electron Bots with the Electron' } },
  { id:'gold', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ELECTRON' }, target:20000,
      desc:'Deal {target} damage with the Electron' } },
  { id:'crimson', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', boss:true }, target:1,
      desc:'Kill a boss with the Electron' } },
  { id:'bengal', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ELECTRON', weaponLevel:true }, target:10,
      desc:'Reach Electron level 10' } },
  { id:'dark_matter', weapon:'ELECTRON', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'ELECTRON' }, target:1,
      desc:'Complete all Electron challenges' } },

  // ION
  { id:'midnight', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION' }, target:15,
      desc:'Kill {target} enemies with the Ion Sniper' } },
  { id:'desert', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', isHeadshot:true }, target:10,
      desc:'Get {target} headshot kills with the Ion Sniper' } },
  { id:'arctic', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'airborne' }, target:15,
      desc:'Get {target} kills while airborne with the Ion Sniper' } },
  { id:'hazard', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'sniper' }, target:10,
      desc:'Kill {target} Snipers with the Ion Sniper' } },
  { id:'jungle', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Ion Sniper' } },
  { id:'plasma_glow', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', multiKill:true }, target:8,
      desc:'Get {target} multi‑kills with the Ion Sniper' } },
  { id:'toxic', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', targetType:'heavy' }, target:15,
      desc:'Kill {target} Heavy robots with the Ion Sniper' } },
  { id:'gold', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'ION' }, target:30000,
      desc:'Deal {target} damage with the Ion Sniper' } },
  { id:'crimson', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', boss:true }, target:1,
      desc:'Kill a boss with the Ion Sniper' } },
  { id:'bengal', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'ION', weaponLevel:true }, target:10,
      desc:'Reach Ion Sniper level 10' } },
  { id:'dark_matter', weapon:'ION', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'ION' }, target:1,
      desc:'Complete all Ion Sniper challenges' } },

  // FLAMETHROWER
  { id:'midnight', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER' }, target:30,
      desc:'Kill {target} enemies with the Flamethrower' } },
  { id:'desert', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Flamethrower' } },
  { id:'arctic', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Flamethrower' } },
  { id:'hazard', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'shield_bot' }, target:20,
      desc:'Kill {target} Shield Bots with the Flamethrower' } },
  { id:'jungle', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Flamethrower' } },
  { id:'plasma_glow', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Flamethrower' } },
  { id:'toxic', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', targetType:'swarm_host' }, target:15,
      desc:'Kill {target} Swarm Hosts with the Flamethrower' } },
  { id:'gold', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'FLAMETHROWER' }, target:40000,
      desc:'Deal {target} damage with the Flamethrower' } },
  { id:'crimson', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', boss:true }, target:1,
      desc:'Kill a boss with the Flamethrower' } },
  { id:'bengal', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'FLAMETHROWER', weaponLevel:true }, target:10,
      desc:'Reach Flamethrower level 10' } },
  { id:'dark_matter', weapon:'FLAMETHROWER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'FLAMETHROWER' }, target:1,
      desc:'Complete all Flamethrower challenges' } },

  // TESLA
  { id:'midnight', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA' }, target:30,
      desc:'Kill {target} enemies with the Tesla Cannon' } },
  { id:'desert', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Tesla Cannon' } },
  { id:'arctic', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Tesla Cannon' } },
  { id:'hazard', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'shield_bot' }, target:20,
      desc:'Kill {target} Shield Bots with the Tesla Cannon' } },
  { id:'jungle', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Tesla Cannon' } },
  { id:'plasma_glow', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Tesla Cannon' } },
  { id:'toxic', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', targetType:'teleport_bot' }, target:15,
      desc:'Kill {target} Teleport Bots with the Tesla Cannon' } },
  { id:'gold', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'TESLA' }, target:40000,
      desc:'Deal {target} damage with the Tesla Cannon' } },
  { id:'crimson', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', boss:true }, target:1,
      desc:'Kill a boss with the Tesla Cannon' } },
  { id:'bengal', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'TESLA', weaponLevel:true }, target:10,
      desc:'Reach Tesla Cannon level 10' } },
  { id:'dark_matter', weapon:'TESLA', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'TESLA' }, target:1,
      desc:'Complete all Tesla Cannon challenges' } },

  // CROSSBOW
  { id:'midnight', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW' }, target:25,
      desc:'Kill {target} enemies with the Crossbow' } },
  { id:'desert', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Crossbow' } },
  { id:'arctic', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Crossbow' } },
  { id:'hazard', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'ninja' }, target:20,
      desc:'Kill {target} Ninjas with the Crossbow' } },
  { id:'jungle', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Crossbow' } },
  { id:'plasma_glow', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Crossbow' } },
  { id:'toxic', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', targetType:'teleport_bot' }, target:15,
      desc:'Kill {target} Teleport Bots with the Crossbow' } },
  { id:'gold', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'CROSSBOW' }, target:25000,
      desc:'Deal {target} damage with the Crossbow' } },
  { id:'crimson', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', boss:true }, target:1,
      desc:'Kill a boss with the Crossbow' } },
  { id:'bengal', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'CROSSBOW', weaponLevel:true }, target:10,
      desc:'Reach Crossbow level 10' } },
  { id:'dark_matter', weapon:'CROSSBOW', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'CROSSBOW' }, target:1,
      desc:'Complete all Crossbow challenges' } },

  // RIVETER
  { id:'midnight', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER' }, target:30,
      desc:'Kill {target} enemies with the Riveter' } },
  { id:'desert', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Riveter' } },
  { id:'arctic', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Riveter' } },
  { id:'hazard', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Riveter' } },
  { id:'jungle', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the Riveter' } },
  { id:'plasma_glow', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Riveter' } },
  { id:'toxic', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', targetType:'drone' }, target:25,
      desc:'Kill {target} Drones with the Riveter' } },
  { id:'gold', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'RIVETER' }, target:25000,
      desc:'Deal {target} damage with the Riveter' } },
  { id:'crimson', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', boss:true }, target:1,
      desc:'Kill a boss with the Riveter' } },
  { id:'bengal', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'RIVETER', weaponLevel:true }, target:10,
      desc:'Reach Riveter level 10' } },
  { id:'dark_matter', weapon:'RIVETER', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'RIVETER' }, target:1,
      desc:'Complete all Riveter challenges' } },

  // PHALANX
  { id:'midnight', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX' }, target:25,
      desc:'Kill {target} enemies with the Phalanx' } },
  { id:'desert', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Phalanx' } },
  { id:'arctic', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Phalanx' } },
  { id:'hazard', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the Phalanx' } },
  { id:'jungle', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Phalanx' } },
  { id:'plasma_glow', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Phalanx' } },
  { id:'toxic', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', targetType:'shotgun' }, target:20,
      desc:'Kill {target} Shotgunners with the Phalanx' } },
  { id:'gold', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'PHALANX' }, target:30000,
      desc:'Deal {target} damage with the Phalanx' } },
  { id:'crimson', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', boss:true }, target:1,
      desc:'Kill a boss with the Phalanx' } },
  { id:'bengal', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'PHALANX', weaponLevel:true }, target:10,
      desc:'Reach Phalanx level 10' } },
  { id:'dark_matter', weapon:'PHALANX', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'PHALANX' }, target:1,
      desc:'Complete all Phalanx challenges' } },

  // AEGIS
  { id:'midnight', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS' }, target:25,
      desc:'Kill {target} enemies with the Aegis' } },
  { id:'desert', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the Aegis' } },
  { id:'arctic', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the Aegis' } },
  { id:'hazard', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'scout' }, target:25,
      desc:'Kill {target} Scouts with the Aegis' } },
  { id:'jungle', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', playerState:'scoped' }, target:20,
      desc:'Kill {target} enemies while scoped with the Aegis' } },
  { id:'plasma_glow', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the Aegis' } },
  { id:'toxic', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', targetType:'shield_bot' }, target:20,
      desc:'Kill {target} Shield Bots with the Aegis' } },
  { id:'gold', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'AEGIS' }, target:30000,
      desc:'Deal {target} damage with the Aegis' } },
  { id:'crimson', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', boss:true }, target:1,
      desc:'Kill a boss with the Aegis' } },
  { id:'bengal', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'AEGIS', weaponLevel:true }, target:10,
      desc:'Reach Aegis level 10' } },
  { id:'dark_matter', weapon:'AEGIS', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'AEGIS' }, target:1,
      desc:'Complete all Aegis challenges' } },

  // COMET
  { id:'midnight', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET' }, target:30,
      desc:'Kill {target} enemies with the COMET' } },
  { id:'desert', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the COMET' } },
  { id:'arctic', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the COMET' } },
  { id:'hazard', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'drone' }, target:25,
      desc:'Kill {target} Drones with the COMET' } },
  { id:'jungle', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the COMET' } },
  { id:'plasma_glow', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the COMET' } },
  { id:'toxic', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', targetType:'heavy' }, target:20,
      desc:'Kill {target} Heavy robots with the COMET' } },
  { id:'gold', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'COMET' }, target:25000,
      desc:'Deal {target} damage with the COMET' } },
  { id:'crimson', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', boss:true }, target:1,
      desc:'Kill a boss with the COMET' } },
  { id:'bengal', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'COMET', weaponLevel:true }, target:10,
      desc:'Reach COMET level 10' } },
  { id:'dark_matter', weapon:'COMET', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'COMET' }, target:1,
      desc:'Complete all COMET challenges' } },

  // DMR
  { id:'midnight', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR' }, target:25,
      desc:'Kill {target} enemies with the DMR' } },
  { id:'desert', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', isHeadshot:true }, target:15,
      desc:'Get {target} headshot kills with the DMR' } },
  { id:'arctic', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'airborne' }, target:20,
      desc:'Get {target} kills while airborne with the DMR' } },
  { id:'hazard', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'sniper' }, target:20,
      desc:'Kill {target} Snipers with the DMR' } },
  { id:'jungle', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', playerState:'scoped' }, target:25,
      desc:'Kill {target} enemies while scoped with the DMR' } },
  { id:'plasma_glow', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', multiKill:true }, target:15,
      desc:'Get {target} multi‑kills with the DMR' } },
  { id:'toxic', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', targetType:'electron_bot' }, target:20,
      desc:'Kill {target} Electron Bots with the DMR' } },
  { id:'gold', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'DAMAGE_DEALT', conditions:{ weapon:'DMR' }, target:25000,
      desc:'Deal {target} damage with the DMR' } },
  { id:'crimson', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', boss:true }, target:1,
      desc:'Kill a boss with the DMR' } },
  { id:'bengal', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ weapon:'DMR', weaponLevel:true }, target:10,
      desc:'Reach DMR level 10' } },
  { id:'dark_matter', weapon:'DMR', type:'weaponSkin',
    challenge:{ event:'KILL', conditions:{ allChallenges:true, weapon:'DMR' }, target:1,
      desc:'Complete all DMR challenges' } },
      
  { id:'ghost',     type:'playerSkin', level:10 },
  { id:'forest',    type:'playerSkin', level:15 },
  { id:'oni',       type:'playerSkin', level:25 },
  { id:'void',      type:'playerSkin', level:30 },
  { id:'gold',      type:'playerSkin', level:40 },
  { id:'gladiator', type:'playerSkin', challenge:{ event:'KILL', conditions:{ pvp:true }, target:250,
      desc:'Get {target} PvP kills across all competitive modes' } },
  
  // Tests
/*   { id:'credits_1', weapon:'GLOBAL', type:'currency', rewardName:'100 Credits',
    challenge: { event: 'KILL', conditions: {}, target: 100, desc: 'Defeat 100 total enemies.' } },
  { id:'credits_2', weapon:'GLOBAL', type:'currency', rewardName:'250 Credits',
    challenge: { event: 'KILL', conditions: { isHeadshot: true }, target: 50, desc: 'Get 50 Headshot kills.' } },
  { id:'credits_3', weapon:'GLOBAL', type:'currency', rewardName:'500 Credits',
    challenge: { event: 'KILL', conditions: { isExplosiveKill: true }, target: 75, desc: 'Get 75 Explosive kills.' } }, */
  { 
    id:'aurora', weapon:'PISTOL', type:'weaponSkin', requires: 'dark_matter',
    challenge: { 
      isComposite: true,
      desc: 'Kill a boss in each map without Endless Magazine equipped.',
      subChallenges: [
        { event: 'KILL', conditions: { weapon: 'PISTOL', targetType: 'giantbot', map: 'scrapyard', excludeAttachment: 'endless_magazine' }, target: 1, desc: 'Scrapyard Boss'},
        { event: 'KILL', conditions: { weapon: 'PISTOL', targetType: 'giantbot', map: 'jungle', excludeAttachment: 'endless_magazine' }, target: 1, desc: 'Jungle Boss'},
        { event: 'KILL', conditions: { weapon: 'PISTOL', targetType: 'giantbot', map: 'city', excludeAttachment: 'endless_magazine' }, target: 1, desc: 'City Boss'},
        { event: 'KILL', conditions: { weapon: 'PISTOL', targetType: 'giantbot', map: 'terminal', excludeAttachment: 'endless_magazine' }, target: 1, desc: 'Moon Boss'},
      ]
    } 
  },
];

// ── Profile ───────────────────────────────────────────────────
const STORAGE_KEY = 'botarena_profile';

const _defaultProfile = () => ({
  name:'ANON', displayName: '',totalXp:0, level:1,
  unlocked:['default'],
  unlockedWeaponSkins:{PISTOL:[],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[], FLAMETHROWER:[], TESLA:[], CROSSBOW:[],RIVETER: [],PHALANX: [],AEGIS: []},
  unlockedAttachments:{PISTOL:['endless_magazine'],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[], FLAMETHROWER:[], TESLA:[], CROSSBOW:[],RIVETER: [],PHALANX: [],AEGIS: []},
  loadouts:{
    PISTOL:{skin:'default',attachments:{special:'endless_magazine'}},
    SMG:{skin:'default',attachments:{}},
    SHOTGUN:{skin:'default',attachments:{}},CHAINGUN:{skin:'default',attachments:{}},
    RAILGUN:{skin:'default',attachments:{}},PLASMA:{skin:'default',attachments:{}},
    ROCKET:{skin:'default',attachments:{}},GLAUNCHER:{skin:'default',attachments:{}},
    ELECTRON:{skin:'default',attachments:{}},ION:{skin:'default',attachments:{}},
    FLAMETHROWER:{skin:'default',attachments:{}},TESLA:{skin:'default',attachments:{}},CROSSBOW:{skin:'default',attachments:{}},
    RIVETER:{skin:'default',attachments:{}},PHALANX:{skin:'default',attachments:{}},AEGIS:{skin:'default',attachments:{}},
  },
  playerSkin:'default',
  pvpLoadout:{primary:'SMG',secondary:'SHOTGUN'},
  scraps:0,
  questProgress:{},
  weaponScrapRemainders:{},
  pveBuild:{ranks:{vitality:0,mobility:0,scavenger:0},equipment:null},

  firebaseUid:null,
  stats:{totalKills:0,pvpKills:0,bossWaveClears:0,maxWave:0,killsOfType:{},killsWith:{},killsWhileJumping:{},killsWhileScoped:{},energyPickups:{},bossKillsWith:{}},
  maxWaveHard: 0,
  hardModeClears: 0,
  wonderWeaponsCollected: [],
  unlockedWeapons: [],
  progressNoticeVersion: 0,
  progressNoticeSeen: {},
});

const EXCLUSIONS_TO_TRACK = [...new Set(
  UNLOCK_TABLE.flatMap(u => {
    if (u.challenge?.isComposite && u.challenge.subChallenges) {
      return u.challenge.subChallenges.map(s => s.conditions?.excludeAttachment);
    }
    return [u.challenge?.conditions?.excludeAttachment];
  }).filter(Boolean)
)];

export let profile = _defaultProfile();

// ── Firebase cross-session persistence ────────────────────────
let _fbReady = false;

export function initFirebaseAuth() {
  if (typeof firebase === 'undefined') return;
  
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      _fbReady = true;
      const uid = user.uid;

      // SECURITY CHECK: If the local cached profile belongs to a DIFFERENT Firebase user, wipe it immediately!
      if (profile.firebaseUid && profile.firebaseUid !== uid) {
          console.log('[progression] Different user detected. Wiping local profile.');
          Object.assign(profile, _defaultProfile()); // Reset to defaults
      }

      const cloudProfile = await _loadFromFirestore(uid);

      if (cloudProfile) {
        // We have cloud data. Prefer the cloud data unless local is strictly verified as ahead for this exact UID.
        if (profile.totalXp > cloudProfile.totalXp && profile.firebaseUid === uid) {
            await _saveToFirestore();
        } else {
            profile = _deepMerge(_defaultProfile(), cloudProfile);
            profile.firebaseUid = uid;
            _sanitizeUnlocks();
            _primeProgressNoticeHistory();
            _saveToLocalStorage();
            //console.log('[progression] Cross-session profile restored from cloud');
        }
      } else {
        // Brand new cloud account. 
        profile.firebaseUid = uid;
        _primeProgressNoticeHistory();
        await _saveToFirestore();
        _saveToLocalStorage();
        //console.log('[progression] New cloud profile created');
      }
    } else {
      _fbReady = false;
    }
  });
}

async function _saveToFirestore() {
  if (!_fbReady || !profile.firebaseUid) return false;
  try {
    await firebase.firestore().collection('player_profiles').doc(profile.firebaseUid).set(
      { profile, updated_at: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (e) {
      if (e.message.includes('CORS') || e.message.includes('offline') || e.message.includes('network')) {
          return false;
      }
      console.warn('[progression] Firestore sync paused:', e.message);
      return false;
  }
}

async function _loadFromFirestore(uid) {
  try {
    const doc = await firebase.firestore().collection('player_profiles').doc(uid).get();
    return doc.exists ? doc.data().profile : null;
  } catch (e) { 
      return null; 
  }
}

function _saveToLocalStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch {}
}

export function checkFirstTimePickup(wName) {
  if (!profile.discoveredWeapons) profile.discoveredWeapons = [];
  if (!profile.discoveredWeapons.includes(wName)) {
    profile.discoveredWeapons.push(wName);
    saveProfile();

    import('./weapons.js').then(({ WDEFS }) => {
      const def = WDEFS[wName];
      if (!def) return;
      const isWW = def.wonderWeapon;
      const color = isWW ? '#cc00ff' : '#00ffff';
      const title = isWW
        ? `WONDER WEAPON DISCOVERED: ${def.name}`
        : `NEW WEAPON DISCOVERED: ${def.name}`;

      const html = `<div style="font-weight:bold;font-size:18px;letter-spacing:2px;text-shadow:0 0 10px ${color};">${title}</div>`;
      const css = `
        position:fixed;top:140px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.85);border:2px solid ${color};
        padding:14px 28px;color:${color};font-family:monospace;
        z-index:9999;text-align:center;box-shadow:0 0 20px ${color};
        border-radius:4px;animation:_fadeToast 3.5s forwards;
      `;
      _enqueueToast(html, 3500, css);
    });
  }
}

// Validates local/cloud save data against the current UNLOCK_TABLE.
// Removes attachments/skins that have been deleted or moved to other weapons in code updates.
function _sanitizeUnlocks() {
    // 1. Build a master dictionary of what is currently allowed per weapon
    const validAtts = {};
    const validSkins = {};
    
    for (const u of UNLOCK_TABLE) {
        if (!u.weapon) continue;
        if (u.type === 'attachment') {
            if (!validAtts[u.weapon]) validAtts[u.weapon] = new Set();
            validAtts[u.weapon].add(u.id);
        } else if (u.type === 'weaponSkin') {
            if (!validSkins[u.weapon]) validSkins[u.weapon] = new Set();
            validSkins[u.weapon].add(u.id);
        }
    }

    // 2. Scrub the player's profile data
    for (const wName of Object.keys(profile.unlockedAttachments)) {
        const allowedAtts = validAtts[wName] || new Set();
        profile.unlockedAttachments[wName] = profile.unlockedAttachments[wName].filter(id => allowedAtts.has(id));
        
        const allowedSkins = validSkins[wName] || new Set();
        // Collector rewards are issued by the UTC quest claim ledger rather
        // than UNLOCK_TABLE; preserve legitimate reward IDs after reloading.
        for(const [id,def] of Object.entries(WEAPON_SKINS)){
          if(def.category==='Collector')allowedSkins.add(id);
        }
        if (profile.unlockedWeaponSkins[wName]) {
             profile.unlockedWeaponSkins[wName] = profile.unlockedWeaponSkins[wName].filter(id => allowedSkins.has(id));
        }

        // 3. Clean up active Loadouts in case an invalid attachment is currently equipped
        if (profile.loadouts[wName]) {
             for (const [slot, attId] of Object.entries(profile.loadouts[wName].attachments)) {
                 if (!allowedAtts.has(attId)) {
                     delete profile.loadouts[wName].attachments[slot];
                 }
             }
        }
    }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const saved = JSON.parse(raw); profile = _deepMerge(_defaultProfile(), saved); _migrateOldWeaponSkins(); }
  } catch {}
  _sanitizeUnlocks();
  _primeProgressNoticeHistory();
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

let _cloudDirty = false;

export function getQuestBoard(date=new Date()){
  const state=ensureQuestState(profile,date);
  return {scraps:profile.scraps||0,
    quests:questDefinitions(date).map(def=>({...def,...questProgress(profile,def,date)}))};
}
export function claimProfileQuest(id,date=new Date()){
  const result=claimQuest(profile,id,date);
  if(result.ok){
    saveProfile();
    const reward=result.skin?result.skin.id.toUpperCase()+' · '+result.skin.weapon:
      result.scraps+' Scraps';
    _showQuestToast('REWARD CLAIMED',reward);
  }
  return result;
}

export function saveProfile() {
  _saveToLocalStorage();
  _cloudDirty = true;
}

export async function flushProfileToCloud() {
  if (!_cloudDirty) return;
  const ok = await _saveToFirestore();
  if (ok) _cloudDirty = false;
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

// ═══════════════════════════════════════════════════════════════
//  GENERIC EVENT DISPATCHER (replaces old record* functions)
// ═══════════════════════════════════════════════════════════════
export function emitEvent(eventName, payload) {
  const s = profile.stats;
  const now = Date.now();
  const mapId = typeof getCurrentMap === 'function' ? getCurrentMap() : 'scrapyard';

  switch (eventName) {
    case 'KILL': {
      const {
        botType, weaponKey, isJumping = false, isScoped = false,
        isHeadshot = false, isExplosiveKill = false,
        source = 'PLAYER', xpMult = 1
      } = payload;

      _bump(s, 'totalKills');
      _bump(s, `totalKills_${mapId}`);

      if (botType === 'pvp') s.pvpKills = (s.pvpKills || 0) + 1;
      else {
        _bump(s.killsOfType, botType);
        if (botType === 'giantbot') s.bossWaveClears = (s.bossWaveClears || 0) + 1;
      }

      _currentCombo = (now - _lastAnyKillTime < 5000) ? _currentCombo + 1 : 1;
      _lastAnyKillTime = now;
      if (_currentCombo > (s.maxKillCombo || 0)) s.maxKillCombo = _currentCombo;

      if (weaponKey) {
        _bumpPerMap(s, 'killsWith', weaponKey, mapId);

        const comboKey = botType + '_' + weaponKey;
        if (!s.killsOfCombo) s.killsOfCombo = {};
        
        // Base combo tracking
        _bump(s.killsOfCombo, comboKey);
        _bump(s.killsOfCombo, `${comboKey}_${mapId}`); // Map specific combo
        
        // DYNAMIC EXCLUSION TRACKING:
        // Automatically creates stats like "giantbot_PISTOL_scrapyard_no_endless_magazine" 
        // ONLY for attachments that the challenges actually care about.
        const lo = getLoadout(weaponKey);
        const equippedAtts = Object.values(lo.attachments || {});
        
        for (const attId of EXCLUSIONS_TO_TRACK) {
            if (!equippedAtts.includes(attId)) {
                _bump(s.killsOfCombo, `${comboKey}_no_${attId}`);
                _bump(s.killsOfCombo, `${comboKey}_${mapId}_no_${attId}`);
            }
        }
        if (!s.killsWithAttOnMap) s.killsWithAttOnMap = {};
        for (const [, attId] of Object.entries(lo.attachments || {})) {
          if (attId) _bump(s.killsWithAttOnMap, `${attId}_${weaponKey}_${mapId}`);
        }

        if (isJumping)              _bumpPerMap(s, 'killsWhileJumping', weaponKey, mapId);
        if (isScoped)                _bumpPerMap(s, 'killsWhileScoped',  weaponKey, mapId);
        if (botType === 'giantbot')  {
            _bumpPerMap(s, 'bossKillsWith',     weaponKey, mapId);
        }
        if (isHeadshot)              _bumpPerMap(s, 'headshotKills',     weaponKey, mapId);
        if (weaponKey === 'ROCKET' || weaponKey === 'GLAUNCHER' || isExplosiveKill) {
          s.explosiveKills = (s.explosiveKills || 0) + 1;
        }
        if (source === 'TESLA_CHAIN') _bumpPerMap(s, 'killsWith', source, mapId);

        if (!_recentKillTimes[weaponKey]) _recentKillTimes[weaponKey] = [];
        _recentKillTimes[weaponKey] = _recentKillTimes[weaponKey].filter(t => now - t < 3000);
        if (_recentKillTimes[weaponKey].length >= 1) _bumpPerMap(s, 'multiKillsWith', weaponKey, mapId);
        _recentKillTimes[weaponKey].push(now);

        const slots = WEAPON_ATTACHMENT_SLOTS[weaponKey] || [];
        if (slots.length > 0 && slots.every(slot => !!lo.attachments?.[slot])) {
          _bumpPerMap(s, 'killsFullyEquipped', weaponKey, mapId);
        }
        if (!lo.attachments || Object.values(lo.attachments).every(v => !v)) {
          _bumpPerMap(s, 'killsBareWeapon', weaponKey, mapId);
        }
    // Only award weapon XP for actual weapons — not environmental/synthetic sources
        const PSEUDO_SOURCES = new Set(['ENVIRONMENT', 'TESLA_CHAIN']);
        if (weaponKey && !PSEUDO_SOURCES.has(weaponKey)) {
          const prevWepLevel = getWeaponLevel(weaponKey);

          const wxp = ((WEAPON_XP_GRANTS[botType] || 8) * xpMult);
          if(botType!=='pvp' && source!=='ENVIRONMENT'){
            convertMaxedWeaponXp(profile,weaponKey,wxp,WEAPON_LEVEL_THRESHOLDS.at(-1));
          }else{
            // PvP currency conversion is disabled until server-authoritative
            // kill validation and signed economy events are in place.
            s.weaponXp[weaponKey]=(s.weaponXp[weaponKey]||0)+wxp;
          }

          const newWepLevel = getWeaponLevel(weaponKey);
          if (newWepLevel > prevWepLevel) {
              _showWeaponLevelUpToast(weaponKey, newWepLevel);
          }
        }
      }
      break;
    }

    case 'DAMAGE_DEALT': {
      const { weaponKey, amount } = payload;
      if (!weaponKey || !amount || amount <= 0) break;
      _bumpPerMap(s, 'damageDealt', weaponKey, mapId, amount);
      clearTimeout(_damageFlushTimer);
      _damageFlushTimer = setTimeout(() => {
        const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
        checkProgressMilestones();
        saveProfile();
      }, 2000);
      break;
    }

    case 'STATUS_APPLIED': {
      if (payload.type === 'EMP_STUN') {
        _bump(s, 'empStuns');
        _bump(s, `empStuns_${mapId}`);
      }
      break;
    }

    case 'PICKUP': {
      if (payload.type === 'energy') {
        if (!s.energyPickups) s.energyPickups = {};
        s.energyPickups[payload.weaponKey] = (s.energyPickups[payload.weaponKey] || 0) + 1;
      } else if (payload.type === 'railgun') {
        s.railgunPickups = (s.railgunPickups || 0) + 1;
      } else if (payload.type === 'flamethrower') {
        s.flamethrowerPickups = (s.flamethrowerPickups || 0) + 1;
      }
      break;
    }

    case 'BARREL_DESTROYED':
      s.barrelDestroys = (s.barrelDestroys || 0) + 1;
      break;

    case 'WAVE_COMPLETE': {
      const { waveNum, isBoss, mapId: waveMapId = mapId } = payload;
      if (typeof waveNum !== 'number' || isNaN(waveNum)) break;
      s.maxWave = Math.max(s.maxWave || 0, waveNum);
      s[`maxWave_${waveMapId}`] = Math.max(s[`maxWave_${waveMapId}`] || 0, waveNum);
      if (player.hardMode) {
        s.maxWaveHard = Math.max(s.maxWaveHard || 0, waveNum);
        s[`maxWaveHard_${waveMapId}`] = Math.max(s[`maxWaveHard_${waveMapId}`] || 0, waveNum);
      }
      if (isBoss) {
        s.bossWaveClears = (s.bossWaveClears || 0) + 1;
        s[`bossWaveClears_${waveMapId}`] = (s[`bossWaveClears_${waveMapId}`] || 0) + 1;
        if(player.difficulty==='hard'){
          s[`bossWaveClearsHard_${waveMapId}`] = (s[`bossWaveClearsHard_${waveMapId}`] || 0) + 1;
        }
        if(player.difficulty==='nightmare'){
          s[`bossWaveClearsNightmare_${waveMapId}`] = (s[`bossWaveClearsNightmare_${waveMapId}`] || 0) + 1;
        }
      }
      break;
    }

    case 'WONDER_WEAPON_COLLECTED':
      recordWonderWeaponCollected(payload.wName); // keeps existing logic
      break;
  }

  // Daily/weekly progression tracks completed gameplay events. Currency
  // is only issued by a deliberate, idempotent claim, never per event.
  if(['KILL','DAMAGE_DEALT','WAVE_COMPLETE'].includes(eventName)){
    const when=new Date();
    const definitions=questDefinitions(when);
    const incomplete=definitions.filter(q=>!questProgress(profile,q,when).complete);
    trackQuestEvent(profile,eventName,payload,when);
    for(const q of incomplete){
      const current=questProgress(profile,q,when);
      if(current.complete && !current.claimed){
        _showQuestToast('QUEST COMPLETE',q.label+' — claim on the main menu');
      }
    }
  }
  // Evaluate challenges immediately (except damage, which is debounced above)
  if (eventName !== 'DAMAGE_DEALT') {
    const n = _checkChallenges(); if (n.length) _showUnlockToasts(n);
    checkProgressMilestones();
    saveProfile();
  }
}

// ── Legacy wrappers (thin, just delegate to emitEvent) ─────────
export function recordKill(botType, weaponKey, opts = {}) {
  emitEvent('KILL', { botType, weaponKey, ...opts });
}
export function recordEmpStun() {
  emitEvent('STATUS_APPLIED', { type: 'EMP_STUN' });
}
export function recordEnergyPickup(weaponKey) {
  emitEvent('PICKUP', { type: 'energy', weaponKey });
}
export function recordBarrelDestroyed() {
  emitEvent('BARREL_DESTROYED', {});
}
export function recordRailgunPickup() {
  emitEvent('PICKUP', { type: 'railgun' });
}
export function recordDamage(weaponKey, amount) {
  emitEvent('DAMAGE_DEALT', { weaponKey, amount });
}
export function recordWaveComplete(waveNum, isBoss, mapId) {
  emitEvent('WAVE_COMPLETE', { waveNum, isBoss, mapId });
}

function _allWeaponChallengesComplete(wName) {
  const requiredSkins = [...new Set(
    UNLOCK_TABLE.filter(u => u.type === 'weaponSkin' && u.weapon === wName && u.id !== 'dark_matter' && !u.requires).map(u => u.id)
  )];
  if (!requiredSkins.every(id => profile.unlockedWeaponSkins[wName]?.includes(id))) return false;

  const requiredAtts = [...new Set(
    UNLOCK_TABLE.filter(u => u.type === 'attachment' && u.weapon === wName && !u.requires).map(u => u.id)
  )];
  return requiredAtts.every(id => profile.unlockedAttachments[wName]?.includes(id));
}

function _checkChallenges() {
  const news = [];
  
  for (const u of UNLOCK_TABLE) {
    if (!u.challenge) continue;
    
    // Skip already fully unlocked items so we don't re-trigger notifications
    if (u.type === 'attachment' && u.weapon && profile.unlockedAttachments[u.weapon]?.includes(u.id)) continue;
    if (u.type === 'weaponSkin' && u.weapon && profile.unlockedWeaponSkins[u.weapon]?.includes(u.id)) continue;
    if (u.type === 'weaponUnlock' && profile.unlockedWeapons?.includes(u.id)) continue;
    if (u.type === 'playerSkin' && profile.unlocked?.includes(u.id)) continue;

    // Use our newly fixed universal logic
    const { val, target } = getChallengeProgress(u.challenge);
    
    if (val >= target && isPrereqUnlocked(u)) {
      let shouldNotify = true;

      if (u.type === 'attachment') {
        if (!profile.unlockedAttachments[u.weapon]) profile.unlockedAttachments[u.weapon] = [];
        profile.unlockedAttachments[u.weapon].push(u.id);
      } else if (u.type === 'weaponSkin') {
        if (!profile.unlockedWeaponSkins[u.weapon]) profile.unlockedWeaponSkins[u.weapon] = [];
        profile.unlockedWeaponSkins[u.weapon].push(u.id);
      } else if (u.type === 'weaponUnlock') {
        if (!profile.unlockedWeapons) profile.unlockedWeapons = [];
        if (!profile.unlockedWeapons.includes(u.id)) {
          profile.unlockedWeapons.push(u.id);
          news.push({ ...u, reason: 'Unlocked weapon!' });
          shouldNotify = false; 
        }
      } else if (u.type === 'currency') {
          if (!profile.unlocked.includes(u.id)) {
              profile.unlocked.push(u.id); // Mark challenge as claimed
              const amt = parseInt(u.rewardName) || 0; // Extract the number
              profile.stats.credits = (profile.stats.credits || 0) + amt; // Deposit
              news.push({ ...u, reason: `Awarded ${u.rewardName}` });
              shouldNotify = false; 
          }
      } else {
        profile.unlocked.push(u.id);
      }

      if (shouldNotify) {
        news.push({ ...u, reason: getChallengeDescription(u) });
      }
    }
  }
  return news;
}

export function getChallengeDescription(uOrCh) {
  const c = uOrCh && uOrCh.challenge ? uOrCh.challenge : uOrCh;
  if (!c) return '';
  
  if (typeof c.desc === 'function') return c.desc(c);
  
  if (typeof c.desc === 'string') {
    if (c.target != null) {
      // Replaces the {target} token with the actual number
      if (c.desc.includes('{target}')) return c.desc.replace(/\{target\}/g, String(c.target));
      
      // Fallback for descriptions that just use a raw number (e.g. "Kill 25 enemies")
      return c.desc.replace(/\d+/, String(c.target));
    }
    return c.desc;
  }
  
  return '???';
}

function getBaseWonderWeapons() {
  return Object.keys(WDEFS).filter(w => WDEFS[w].wonderWeapon && !WDEFS[w].secret);
}

/**
 * Record that the player has picked up a wonder weapon.
 * Updates the collection array and sets allWonderWeaponsCollected = 1
 * when all base (non‑secret) wonder weapons have been collected.
 */
export function recordWonderWeaponCollected(wName) {
  if (!wName) return;
  const s = profile.stats;
  if (!s.wonderWeaponsCollected) s.wonderWeaponsCollected = [];

  // Avoid duplicates
  if (s.wonderWeaponsCollected.includes(wName)) return;
  s.wonderWeaponsCollected.push(wName);
  saveProfile();

  // Check if all base wonder weapons are now collected
  const baseWeapons = getBaseWonderWeapons();
  const hasAllBase = baseWeapons.every(w => s.wonderWeaponsCollected.includes(w));
  if (hasAllBase) {
    s.allWonderWeaponsCollected = 1; // triggers the challenge
    saveProfile();
    // Optionally check challenges immediately
    const news = _checkChallenges();
    if (news.length) _showUnlockToasts(news);
  }
}

/**
 * Check if a specific wonder weapon has been unlocked (used by enemies.js)
 */
export function isWonderWeaponUnlocked(wName) {
  const s = profile.stats;
  // Check both collected (picked up) and unlocked (via challenge)
  return (s.wonderWeaponsCollected?.includes(wName) ?? false) ||
         (profile.unlockedWeapons?.includes(wName) ?? false);
}

// ── Persistent progress notifications (Firebase profile + local cache) ──
function _primeProgressNoticeHistory(){
  // On first use with an existing profile, record its current progression
  // rather than replaying notifications earned before this feature shipped.
  return upgradeNotificationHistory(profile,UNLOCK_TABLE,getChallengeProgress);
}

function _ownsChallengeReward(u){
  if(u.type==='attachment')return !!profile.unlockedAttachments?.[u.weapon]?.includes(u.id);
  if(u.type==='weaponSkin')return !!profile.unlockedWeaponSkins?.[u.weapon]?.includes(u.id);
  if(u.type==='weaponUnlock')return !!profile.unlockedWeapons?.includes(u.id);
  if(u.type==='playerSkin'||u.type==='currency')
    return !!profile.unlocked?.includes(u.id);
  return false;
}

export function checkProgressMilestones(){
  if(_primeProgressNoticeHistory())return;
  const seen=profile.progressNoticeSeen;
  for(const u of UNLOCK_TABLE){
    if(!u.challenge)continue;
    const key=notificationKey(u);
    const p=getChallengeProgress(u.challenge);
    const current=Number.isFinite(p.pct)?Math.max(0,Math.min(1,p.pct)):0;
    const previous=Number.isFinite(seen[key])?seen[key]:current;
    // Keep the high-water mark so a profile sync or map/rule change can't
    // produce repeated "lost progress" alerts for older earned progress.
    seen[key]=Math.max(previous,current);
    if(_ownsChallengeReward(u))continue;
    const crossed=crossedMilestone(u.challenge,previous,current);
    if(crossed!==null)_showMilestoneToast(u,p,crossed);
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

export function isWeaponSkinUnlocked(wName, skinId) {
  if (profile.unlockedWeaponSkins?.[wName]?.includes(skinId)) return true;
  const entry = UNLOCK_TABLE.find(u => u.type === 'weaponSkin' && u.weapon === wName && u.id === skinId);
  if (entry && entry.challenge) {
    const progress = getChallengeProgress(entry.challenge);
    if (progress.target && progress.val >= progress.target && isPrereqUnlocked(entry)) {
      if (!profile.unlockedWeaponSkins) profile.unlockedWeaponSkins = {};
      if (!profile.unlockedWeaponSkins[wName]) profile.unlockedWeaponSkins[wName] = [];
      if (!profile.unlockedWeaponSkins[wName].includes(skinId)) {
        profile.unlockedWeaponSkins[wName].push(skinId);
        saveProfile();
      }
      return true;
    }
  }
  return false;
}

export function isAttachmentUnlocked(wName, attId) {
  if (profile.unlockedAttachments?.[wName]?.includes(attId)) return true;
  const entry = UNLOCK_TABLE.find(u => u.type === 'attachment' && u.weapon === wName && u.id === attId);
  if (entry && entry.challenge) {
    const progress = getChallengeProgress(entry.challenge);
    if (progress.target && progress.val >= progress.target && isPrereqUnlocked(entry)) {
      if (!profile.unlockedAttachments) profile.unlockedAttachments = {};
      if (!profile.unlockedAttachments[wName]) profile.unlockedAttachments[wName] = [];
      if (!profile.unlockedAttachments[wName].includes(attId)) {
        profile.unlockedAttachments[wName].push(attId);
        saveProfile();
      }
      return true;
    }
  }
  const hasChallenge = UNLOCK_TABLE.some(u => u.type === 'attachment' && u.weapon === wName && u.id === attId && u.challenge);
  if (!hasChallenge) return true;
  return false;
}

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
      else if (mod === 'speed') {
          if (baseDefs.speed !== undefined) out.speed = baseDefs.speed * (1 + delta);
          if (baseDefs.projSpeed !== undefined) out.projSpeed = baseDefs.projSpeed * (1 + delta);
      }
      else if (mod === 'splash') {
          out.splash = (baseDefs.splash || 0) * (1 + delta);
      }
      else if (mod === 'chainRange') out.chainRange = (baseDefs.chainRange || 8) * (1 + delta); // +1.0 = 100% increase
      else if (mod === 'adsSpeedMult') out.adsSpeedMult = (out.adsSpeedMult || 1.0) * delta;
      // Dynamic Magazine and Multiplier Handling
      else if (mod === 'magSize') out.magSize = Math.max(1, (baseDefs.magSize || 0) + delta);
      else if (mod === 'heatMult') out.heatMult = (out.heatMult || 1.0) + delta;
      else if (mod === 'cdMult') out.cd = Math.max(0.02, baseDefs.cd * delta);
      else if (mod === 'dmgMult') out.dmg = Math.round(baseDefs.dmg * delta);
      else if (mod === 'reloadMult') out.reloadTime = Math.max(0.1, (baseDefs.reloadTime || 1.6) * delta);     
      else if (mod === 'spreadAdd') out.spread = (out.spread || baseDefs.spread || 0) + delta;
      else if (mod === 'recoilMult') out.recoilMult = (out.recoilMult || 1.0) * delta;
      else if (mod === 'pelletsOverride') out.pellets = delta;
      else if (mod === 'spreadOverride') out.spread = delta;
      else if (mod === 'dotDamage') out.dotDamage = delta;
      else if (mod === 'dotDuration') out.dotDuration = delta;
      else if (mod === 'bounces') out.bounces = (baseDefs.bounces || 1) + delta;
      else if (mod === 'maxTargets')         out.maxTargets = (baseDefs.maxTargets || 3) + delta;
      else if (mod === 'maxTargetsOverride') out.maxTargets = delta;
      else if (mod === 'lockCone')            out.lockCone = delta;
      else if (mod === 'burstCount') {
        out.burstCount = (baseDefs.burstCount || 0) + delta;
      }
      else if (mod === 'ammoType' && delta === 'infinite') {
          out.ammo = Infinity;
          out.magSize = null; 
      }
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

export function getAdsFov(wName) {
  const id = getLoadout(wName).attachments?.sight;
  if (ATTACHMENTS[id]?.visual?.adsZoom) return ATTACHMENTS[id].visual.adsZoom;
  return WDEFS[wName].baseAdsZoom ?? null; // Fallback to intrinsic zoom
}

export function getScopeShape(wName) {
  const id = getLoadout(wName).attachments?.sight;
  if (ATTACHMENTS[id]?.visual?.scopeShape) return ATTACHMENTS[id].visual.scopeShape;
  return WDEFS[wName].scopeShape ?? null; // Fallback to intrinsic shape
}
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
// ── Generic Stat Resolvers ─────────────────────────────────────
// Determines which condition takes precedence if multiple exist
const STAT_PRIORITY = [
  'weaponLevel', 'allChallenges', 'maxCombo', 'pvp', 'explosive',
  'withAttachment', 'targetType', 'map', 'boss', 'playerState',
  'multiKill', 'isHeadshot', 'fullyEquipped', 'bareWeapon'
];

// Maps a specific condition to its legacy location in profile.stats
const STAT_RESOLVERS = {
  weaponLevel:    (c) => getWeaponLevel(c.weapon),
  allChallenges:  (c) => _allWeaponChallengesComplete(c.weapon) ? 1 : 0,
  maxCombo:       (c, s) => s.maxKillCombo,
  pvp:            (c, s) => s.pvpKills,
  explosive:      (c, s) => s.explosiveKills,
  withAttachment: (c, s) => s.killsWithAttOnMap?.[`${c.withAttachment}_${c.weapon}_${c.map}`],
  
  // UPGRADED targetType resolver to natively parse map and excludeAttachment
  targetType: (c, s) => {
      let key = c.targetType;
      if (c.weapon) key += '_' + c.weapon;
      if (c.map) key += '_' + c.map;
      if (c.excludeAttachment) key += '_no_' + c.excludeAttachment;
      return s.killsOfCombo?.[key];
  },
  
  map:            (c, s) => s.killsWith?.[`${c.weapon}_${c.map}`],
  boss:           (c, s) => s.bossKillsWith?.[c.weapon],
  playerState:    (c, s) => c.playerState === 'airborne' ? s.killsWhileJumping?.[c.weapon] : s.killsWhileScoped?.[c.weapon],
  multiKill:      (c, s) => s.multiKillsWith?.[c.weapon],
  isHeadshot:     (c, s) => s.headshotKills?.[c.weapon],
  fullyEquipped:  (c, s) => s.killsFullyEquipped?.[c.weapon],
  bareWeapon:     (c, s) => s.killsBareWeapon?.[c.weapon]
};

export function getChallengeProgress(ch) {
  // ── SCALABLE COMPOSITE CHALLENGES ──
  if (ch.isComposite && ch.subChallenges) {
    let totalPct = 0;
    const subProgresses = [];
    
    // Evaluate every sub-challenge and store its individual progress
    for (const sub of ch.subChallenges) {
      const sp = getChallengeProgress(sub);
      // Grab the description directly from the sub-challenge, or parse it
      subProgresses.push({ desc: getChallengeDescription(sub), ...sp });
      totalPct += sp.pct; 
    }
    
    const avgPct = totalPct / ch.subChallenges.length;
    
    // Pass the subProgresses array down to the UI
    return { val: Math.floor(avgPct * 100), target: 100, pct: avgPct, subProgresses };
  }

  // Define variables FIRST
  const s = profile.stats;
  const { event, conditions, target } = ch;
  let val = 0;

  // 1. Direct event resolvers (Non-KILL events)
  if (event === 'DAMAGE_DEALT') val = s.damageDealt?.[conditions.weapon];
  else if (event === 'BARREL_DESTROYED') val = s.barrelDestroys;
  else if (event === 'STATUS_APPLIED') val = s.empStuns;
  else if (event === 'PICKUP') {
    if (conditions.pickupType === 'railgun') val = s.railgunPickups;
    else if (conditions.pickupType === 'flamethrower') val = s.flamethrowerPickups;
    else val = s.energyPickups?.[conditions.weapon];
  } 
  // 2. KILL events (Dynamic condition resolving)
  else if (event === 'KILL') {
    // Find the highest priority modifier present in the conditions
    const primaryKey = STAT_PRIORITY.find(key => conditions[key] !== undefined);
    
    if (primaryKey && STAT_RESOLVERS[primaryKey]) {
        val = STAT_RESOLVERS[primaryKey](conditions, s);
    } else if (conditions.weapon) {
        val = s.killsWith?.[conditions.weapon]; // Base weapon kill fallback
    }
  }

  val = Math.floor(val || 0);
  return { val, target, pct: Math.min(1, val / target) };
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

function _showQuestToast(title,desc){
  // Uses the same sequential queue as unlock/challenge toasts, avoiding
  // overlapping notifications when multiple quests finish in one wave.
  const safe=value=>String(value).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[c]);
  const html='<div style="color:#b9ed83;font-size:11px;letter-spacing:2px">'+
    safe(title)+'</div><div style="color:#d8f030;font-size:15px;font-weight:bold;margin-top:4px">'+
    safe(desc)+'</div>';
  const css='position:fixed;bottom:115px;right:20px;max-width:340px;'+
    'background:rgba(4,16,4,.94);color:#d8f030;border:1px solid #7a9940;'+
    'padding:12px 18px;z-index:1200;font-family:"Courier New",monospace;'+
    'pointer-events:none;animation:_fadeToast 3.8s forwards';
  _enqueueToast(html,3800,css);
}

function _showWeaponLevelUpToast(wName, newLv) {
  const wlabel = wName.replace(/_/g, ' ').toUpperCase();
  const html = `<div style="font-size:14px;color:#d8a030;letter-spacing:3px">WEAPON LEVEL UP</div><div style="font-size:32px;font-weight:bold;color:#d8f030;margin:2px 0">${wlabel} LVL ${newLv}</div>`;
  const css = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);border:1px solid rgba(216,160,48,.5);padding:15px 30px;z-index:1100;text-align:center;font-family:"Courier New",monospace;pointer-events:none;animation:_fadeToast 2.5s forwards';
  _enqueueToast(html, 2500, css);
}

// ── Sequential unlock prerequisites ─────────────────────────────
// Add `requires: '<id>'` to any UNLOCK_TABLE entry to gate it behind another
// unlock of the same type+weapon (e.g. a bonus skin that should only become
// available once a prior skin is owned). This is the generic mechanism for
// "exception" content that sits outside the normal challenge progression —
// no per-item special-casing is needed anywhere else.
export function isPrereqUnlocked(u) {
  if (!u.requires) return true;
  if (u.type === 'weaponSkin') return isWeaponSkinUnlocked(u.weapon, u.requires);
  if (u.type === 'attachment') return isAttachmentUnlocked(u.weapon, u.requires);
  if (u.type === 'playerSkin') return isSkinUnlocked(u.requires);
  return true;
}

// ── Stat bump helpers ────────────────────────────────────────────
// Centralizes "create the bucket if missing, then increment," and gives
// any per-weapon/per-type counter automatic per-map tracking for free —
// the Progress tab's map filter just works for anything recorded this way.
function _bump(obj, key, amt = 1) {
  obj[key] = (obj[key] || 0) + amt;
}
function _bumpPerMap(s, statName, key, mapId, amt = 1) {
  if (!s[statName]) s[statName] = {};
  _bump(s[statName], key, amt);
  _bump(s[statName], `${key}_${mapId}`, amt);
}