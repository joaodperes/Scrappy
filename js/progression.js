// progression.js – XP, levels, unlocks, challenges, persistence
// localStorage (offline) + Firebase cross-session sync

const XP_BASE = 200, XP_EXP = 1.4;
export function xpForLevel(level) { return Math.floor(XP_BASE * Math.pow(level, XP_EXP)); }
export function totalXpForLevel(level) { let t=0; for(let i=1;i<level;i++) t+=xpForLevel(i); return t; }
export function levelFromTotalXp(xp) { let lv=1; while(xp>=totalXpForLevel(lv+1)) lv++; return lv; }

export const XP_GRANTS = {
  killScout:15,killHeavy:30,killSniper:25,killDrone:20,killShotgun:22,killRocket:28,
  killPistol:12,killGrenadier:24,killGiantbot:200,killPvpPlayer:50,
  killElectron_bot:22, killIon_sniper:30,
  waveComplete:40,bossWave:120,matchWin:80,
};

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
    desc:'Headshot kills instantly vent 40% heat. Body shots still generate full heat.',
    icon:'🌀', mods:{},
    visual:{type:'special',style:'energy_coil'},
  },
  slow_trigger: {
    id:'slow_trigger', name:'Slow Trigger', slot:'special',
    desc:'Converts to 3-shot burst mode. −70% heat per shot. Brief pause between bursts.',
    icon:'⏱️', mods:{heatMult:-0.70},
    visual:{type:'special',style:'slow_trigger'},
  },
  mag_50_cal: {
    id:'mag_50_cal', name:'.50 Caliber', slot:'magazine', weapon:'PISTOL',
    desc:'Reduces magazine to 6 and lowers fire rate, but massively increases damage per shot.',
    icon:'💢',
    mods:{ magSize:-8, cdMult:1.4, dmgMult:2.2 },
    visual:{type:'magazine',style:'heavy',magScale:0.85},
  },
  quick_swap_mag: {
    id:'quick_swap_mag', name:'Quick Swap', slot:'magazine', weapon:'PISTOL',
    desc:'Speed-loaded mag. Improves reload speed by 10%.',
    icon:'⚡',
    mods:{ reloadMult:0.90 },
    visual:{type:'magazine',style:'quick',magScale:0.70},
  },
  pdw_conversion: {
    id:'pdw_conversion', name:'PDW Conversion', slot:'magazine', weapon:'PISTOL',
    desc:'Increases magazine to 18, enables full-auto fire, but reduces damage per shot.',
    icon:'🔄',
    special:'auto_fire',
    mods:{ magSize:10, cdMult:0.65, dmgMult:0.6 },
    visual:{type:'magazine',style:'extended',magScale:1.40},
  },
  // ── Chaingun ──────────────────────────────────────────────────
  spinning_module: {
    id:'spinning_module', name:'Spinning Module', slot:'special',
    desc:'Converts to minigun mode: 1-second spin-up before firing, no magazine limit (fires until empty), rate of fire increases the longer it fires.',
    icon:'🌪️', mods:{},
    visual:{type:'special',style:'spinning_module'},
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
};

export const WEAPON_ATTACHMENT_SLOTS = {
  PISTOL:    ['sight','barrel','magazine','special'],
  SMG:       ['sight','barrel','magazine','grip','stock'],
  SHOTGUN:   ['sight','barrel','magazine','grip','stock','special'],
  CHAINGUN:  ['sight','barrel','magazine','grip','special'],
  RAILGUN:   ['sight','barrel','special'],
  PLASMA:    ['sight','barrel','magazine','special'],
  ROCKET:    ['sight','barrel','special'],
  GLAUNCHER: ['sight','barrel','special'],
  ELECTRON:  ['sight','barrel','grip','special'],
  ION:       ['sight','barrel','special'],
};

export const WEAPON_SPECIALS = {
  PISTOL:['akimbo'], SHOTGUN:['akimbo','auto_fire'],
  CHAINGUN:['spinning_module'],
  RAILGUN:['power_cell','efficiency_module'], GLAUNCHER:['cluster_rounds','seasoned_vet_glauncher'],
  PLASMA:['dual_trigger'],
  ROCKET:['seasoned_vet_rocket'],
  ELECTRON:['slow_trigger'],
  ION:['power_cell','energy_coil'],
};

// ── Skins ─────────────────────────────────────────────────────
export const WEAPON_SKINS = {
  default:    {id:'default',   name:'Factory',  desc:'Standard issue.',          body:[0.45,0.45,0.45],accent:[0.25,0.25,0.25],grip:[0.30,0.20,0.10]},
  midnight:   {id:'midnight',  name:'Midnight', desc:'All-black tactical.',      body:[0.05,0.05,0.05],accent:[0.10,0.10,0.10],grip:[0.05,0.05,0.05]},
  desert:     {id:'desert',    name:'Desert',   desc:'Sand and tan camo.',       body:[0.70,0.60,0.35],accent:[0.55,0.44,0.22],grip:[0.42,0.30,0.14]},
  arctic:     {id:'arctic',    name:'Arctic',   desc:'Snow-pattern white.',      body:[0.90,0.92,0.95],accent:[0.75,0.80,0.85],grip:[0.60,0.65,0.70]},
  hazard:     {id:'hazard',    name:'Hazard',   desc:'Safety orange and black.', body:[0.90,0.30,0.02],accent:[0.10,0.10,0.10],grip:[0.06,0.06,0.06]},
  plasma_glow:{id:'plasma_glow',name:'Plasma', desc:'Cyan energy accents.',     body:[0.10,0.15,0.25],accent:[0.05,0.80,0.90],grip:[0.05,0.10,0.15]},
  gold:       {id:'gold',      name:'Gold',     desc:'Prestige finish.',         body:[0.80,0.65,0.10],accent:[0.90,0.75,0.20],grip:[0.50,0.35,0.05]},
  crimson:    {id:'crimson',   name:'Crimson',  desc:'Blood red.',               body:[0.55,0.05,0.05],accent:[0.35,0.02,0.02],grip:[0.18,0.04,0.04]},
};

// Ordered from easiest to hardest unlock — used by loadout UI to sort skin cards
export const SKIN_DIFFICULTY_ORDER = ['default','Standard','midnight','desert','crimson','arctic','hazard','plasma_glow','gold'];

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
    challenge:{ desc:'Pick up {target} Railgun drops',                          track:'energyPickups:RAILGUN', target:20 } },

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

  // ── ROCKET ────────────────────────────────────────────────────
  { id:'holo_sight',   weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',                    track:'killsWith:ROCKET',          target:8   } },
  { id:'acog',         weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Rocket Launcher',     track:'killsWhileJumping:ROCKET',  target:5   } },
  { id:'thermal',      weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} bosses with the Rocket Launcher',                     track:'killedBossWith:ROCKET',     target:3   } },
  { id:'suppressor',   weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies while airborne with the Rocket Launcher',     track:'killsWhileJumping:ROCKET',  target:15  } },
  { id:'heavy_barrel', weapon:'ROCKET', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Rocket Launcher',                    track:'killsWith:ROCKET',          target:20  } },
  { id:'seasoned_vet_rocket', weapon:'ROCKET', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} bosses with the Rocket Launcher',                     track:'killedBossWith:ROCKET',     target:1   } },

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
    challenge:{ desc:'Kill {target} enemies with the Grenade Launcher',              track:'killsWith:GLAUNCHER',               target:40  } },
  { id:'seasoned_vet_glauncher', weapon:'GLAUNCHER', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} bosses with the Grenade Launcher',               track:'killedBossWith:GLAUNCHER',          target:1   } },

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
    challenge:{ desc:'Kill {target} enemies with the Electron while airborne',       track:'killsWhileJumping:ELECTRON',  target:50  } },

  // ── ION ───────────────────────────────────────────────────────
  { id:'holo_sight',       weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper',                    track:'killsWith:ION',              target:5   } },
  { id:'acog',             weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper',                    track:'killsWith:ION',              target:15  } },
  { id:'extended_barrel',  weapon:'ION', type:'attachment',
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper',                    track:'killsWith:ION',              target:30  } },
  { id:'energy_coil',      weapon:'ION', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Ion Sniper while scoped',       track:'killsWhileScoped:ION',       target:30  } },

  // ── ELECTRON extra (Slow Trigger) ────────────────────────────
  { id:'slow_trigger',    weapon:'ELECTRON', type:'attachment', secret:true,
    challenge:{ desc:'Kill {target} enemies with the Electron while airborne', track:'killsWhileJumping:ELECTRON', target:20 } },

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
  name:'ANON', totalXp:0, level:1,
  unlocked:['default'],
  unlockedWeaponSkins:{PISTOL:[],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[]},
  unlockedAttachments:{PISTOL:['holo_sight'],SMG:[],SHOTGUN:[],CHAINGUN:[],RAILGUN:[],PLASMA:[],ROCKET:[],GLAUNCHER:[],ELECTRON:[],ION:[]},
  loadouts:{
    PISTOL:{skin:'default',attachments:{}},SMG:{skin:'default',attachments:{}},
    SHOTGUN:{skin:'default',attachments:{}},CHAINGUN:{skin:'default',attachments:{}},
    RAILGUN:{skin:'default',attachments:{}},PLASMA:{skin:'default',attachments:{}},
    ROCKET:{skin:'default',attachments:{}},GLAUNCHER:{skin:'default',attachments:{}},
    ELECTRON:{skin:'default',attachments:{}},ION:{skin:'default',attachments:{}},
  },
  playerSkin:'default',
  firebaseUid:null,
  stats:{totalKills:0,pvpKills:0,bossWaveClears:0,maxWave:0,killsOfType:{},killsWith:{},killsWhileJumping:{},killsWhileScoped:{},energyPickups:{},bossKillsWith:{}},
});

export let profile = _defaultProfile();

// ── Firebase cross-session persistence ────────────────────────
let _fbReady = false;

export async function initFirebaseAuth() {
  if (typeof firebase === 'undefined') return;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await firebase.auth().signInWithPopup(provider); 
    const uid  = cred.user.uid;
    _fbReady   = true;

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
  initFirebaseAuth();
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
export function recordKill(botType, weaponKey, { isJumping = false, isScoped = false } = {}) {
  const s=profile.stats; s.totalKills++;
  if (botType==='pvp') s.pvpKills++;
  else { s.killsOfType[botType]=(s.killsOfType[botType]||0)+1; if(botType==='giantbot')s.bossWaveClears=(s.bossWaveClears||0)+1; }
  if (weaponKey) {
    s.killsWith[weaponKey]=(s.killsWith[weaponKey]||0)+1;
    // Track Bot + Weapon combo
    const comboKey = botType + '_' + weaponKey;
    if (!s.killsOfCombo) s.killsOfCombo = {};
    s.killsOfCombo[comboKey] = (s.killsOfCombo[comboKey]||0)+1;
    if (isJumping) {
      if (!s.killsWhileJumping) s.killsWhileJumping = {};
      s.killsWhileJumping[weaponKey]=(s.killsWhileJumping[weaponKey]||0)+1;
    }
    if (isScoped) {
      if (!s.killsWhileScoped) s.killsWhileScoped = {};
      s.killsWhileScoped[weaponKey]=(s.killsWhileScoped[weaponKey]||0)+1;
    }
    // Track boss kills per weapon for 'seasoned vet' attachments
    if (botType==='giantbot') {
      if (!s.bossKillsWith) s.bossKillsWith = {};
      s.bossKillsWith[weaponKey]=(s.bossKillsWith[weaponKey]||0)+1;
    }
  }
  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  checkProgressMilestones(); // ← milestone notifications
  saveProfile(); return n;
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

export function recordWaveComplete(waveNum, isBoss) {
  if (typeof waveNum!=='number'||isNaN(waveNum)) return;
  profile.stats.maxWave=Math.max(profile.stats.maxWave||0, waveNum);
  if (isBoss) profile.stats.bossWaveClears=(profile.stats.bossWaveClears||0)+1;
  const n=_checkChallenges(); if(n.length)_showUnlockToasts(n);
  checkProgressMilestones();
  saveProfile();
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
  if(track==='pvpKills') return `Defeat ${target} players in FFA`;
  if(track==='bossWaveClears') return `Defeat ${target} bosses`;
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

export function getEffectiveStats(wName, baseDefs) {
  const lo = getLoadout(wName); 
  const out = { ...baseDefs };
  
  for (const [, id] of Object.entries(lo.attachments)) {
    const att = ATTACHMENTS[id];
    if (!att || !att.mods) continue;
    
    for (const [mod, delta] of Object.entries(att.mods)) {
      if (mod === 'ammoMult') out.startAmmo = Math.round((baseDefs.startAmmo || 0) * (1 + delta));
      else if (mod === 'damage') out.dmg = Math.round(baseDefs.dmg * (1 + delta));
      else if (mod === 'spread') out.spread = Math.max(0, (baseDefs.spread || 0) * (1 + delta));
      else if (mod === 'range') out.range = Math.round(baseDefs.range * (1 + delta));
      else if (mod === 'cd') out.cd = Math.max(0.02, baseDefs.cd * (1 + delta));
      else if (mod === 'speed') out.speed = Math.round((baseDefs.speed || 0) * (1 + delta));
      // NEW: Handle Pistol magazine conversion properties
      else if (mod === 'magSize') out.magSize = Math.max(1, (baseDefs.magSize || 0) + delta);
      else if (mod === 'cdMult') out.cd = Math.max(0.02, baseDefs.cd * delta);
      else if (mod === 'dmgMult') out.dmg = Math.round(baseDefs.dmg * delta);
      else if (mod === 'reloadMult') out.reloadTime = Math.max(0.1, (baseDefs.reloadTime || 1.6) * delta);
    }
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
export function hasSeasonedVet(wName){
  if(wName==='ROCKET')   return getLoadout('ROCKET').attachments?.special==='seasoned_vet_rocket';
  if(wName==='GLAUNCHER')return getLoadout('GLAUNCHER').attachments?.special==='seasoned_vet_glauncher';
  return false;
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
  else if(track.startsWith('killsWith:'))val=s.killsWith[track.split(':')[1]]||0;
  else if(track.startsWith('killsWhileJumping:'))val=(s.killsWhileJumping||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsWhileScoped:'))val=(s.killsWhileScoped||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killsOfCombo:'))val=(s.killsOfCombo||{})[track.split(':')[1]]||0;
  else if(track.startsWith('energyPickups:'))val=(s.energyPickups||{})[track.split(':')[1]]||0;
  else if(track.startsWith('killedBossWith:'))val=(s.bossKillsWith||{})[track.split(':')[1]]||0;
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