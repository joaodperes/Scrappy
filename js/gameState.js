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
};

// Cross-module callbacks registered after module init to avoid circular deps
export const cb = {
  /** @type {((e: object, dmg: number) => void)|null} */
  hitRobot:    null,
  /** @type {((dmg: number) => void)|null} */
  hurtPlayer:  null,
  /** @type {(() => void)|null} */
  markHudDirty: null,
  /** @type {(() => void)|null} */
  endGame: null,
};

// PvP remote player map: socketId → { group, hp, team, name }
export const remotePlayers = new Map();
