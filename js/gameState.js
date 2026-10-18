
// gameState.js – shared mutable state and cross-module callbacks
// All arrays are mutated in place; other modules import the same references.

export const enemies     = [];
export const projs       = [];
export const pickups     = [];
export const weaponDrops = [];
export const _sparkPool  = [];
export const particles   = []; // kept for compat



// Player state – mutated directly
export const player = {
  hp: 100, maxHp: 100,
  armor: 0, maxArmor: 100,
  score: 0,
  onGround: false, yVel: 0,
  buffs: {},
  hardMode: false,
  
  // New weapon state tracking:
  wepHeat: 0,
  overheated: false,
  isReloading: false,
  reloadTimer: 0
};

// Cross-module callbacks registered after module init to avoid circular deps
export const cb = {
  hitRobot:    null,
  hurtPlayer:  null,
  markHudDirty: null,
  endGame: null,
  isGameRunning: null,
  /** @type {(() => void)|null} */
  showHitMarker: null,
  /** @type {((wName: string) => void)|null} */
  resetWeaponHeat: null,
};

// PvP remote player map: socketId → { group, hp, team, name }
export const remotePlayers = new Map();

// ── FFA Room configuration ────────────────────────────────────
// Sent by the host to the server on room creation; broadcast to all joiners.
// All numeric modifiers are multipliers (1.0 = default, 0.25 = -75%, 1.75 = +75%).
export const DEFAULT_ROOM_CONFIG = {
  // Logistics
  maxPlayers:       8,
  roundDuration:    600,   // seconds
  scoreLimit:       30,    // frags to win (0 = time only)

  // Content toggles
  addBots:          false,
  botCount:         4,
  weaponSpawns:     true,
  healthSpawns:     true,
  armorSpawns:      true,
  allowRocketJump:  true,

  // Numeric modifiers (multipliers applied server+client side)
  healthMult:       1.0,   // starting + pickup health
  armorMult:        1.0,
  damageMult:       1.0,
  speedMult:        1.0,
  gravityMult:      1.0,
  jumpMult:         1.0,
  reloadMult:       1.0,   // weapon cooldown multiplier (lower = faster)
  respawnDelay:     5,     // seconds

  // Extra fun options
  instagib:         false, // all weapons one-shot
  infiniteAmmo:     false,
  lowGravity:       false, // overrides gravityMult to 0.35
  bigHead:          false, // headshot hitbox ×3
  friendlyFire:     false,
};

// Active room config (populated when joining or hosting)
export let roomConfig = { ...DEFAULT_ROOM_CONFIG };
export function setRoomConfig(cfg) {
  Object.assign(roomConfig, cfg);
}
