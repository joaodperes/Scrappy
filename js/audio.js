// audio.js – Web Audio sound effects
let actx = null;
export function ensureAudio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
}

function tone({ f = 440, t = 'square', d = .15, v = .15, det = 0, f2 = null } = {}) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.connect(g); g.connect(actx.destination);
  o.type = t; o.frequency.value = f; o.detune.value = det;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, actx.currentTime + d);
  const now = actx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(v, now + .008);
  g.gain.exponentialRampToValueAtTime(.001, now + d);
  o.start(now); o.stop(now + d + .05);
}

export const sfx = {
  pistol:    () => { tone({ f:1100, t:'square', d:.04, v:.14 }); tone({ f:350, d:.07, v:.1, t:'sawtooth' }); },
  shotgun:   () => [900,650,400,150].forEach((f,i) => setTimeout(() => tone({ f, t:'sawtooth', d:.07, v:.16 }), i*7)),
  rocket:    () => { tone({ f:200, t:'sawtooth', d:.35, v:.2, f2:70 }); tone({ f:1300, t:'square', d:.07, v:.18 }); },
  explosion: () => [280,180,100,70,50].forEach((f,i) => setTimeout(() => tone({ f, t:'sawtooth', d:.3, v:.22 }), i*28)),
  hit:       () => tone({ f:550, t:'square', d:.06, v:.14, f2:180 }),
  robotDie:  () => [500,380,260,150,80].forEach((f,i) => setTimeout(() => tone({ f, t:'sawtooth', d:.14, v:.16 }), i*45)),
  playerHit: () => tone({ f:90, t:'square', d:.28, v:.26 }),
  pickup:    () => [440,550,660,880].forEach((f,i) => setTimeout(() => tone({ f, t:'sine', d:.08, v:.11 }), i*45)),
  wave:      () => [220,330,440,550,660].forEach((f,i) => setTimeout(() => tone({ f, t:'square', d:.17, v:.12 }), i*75)),
  noAmmo:    () => tone({ f:180, t:'square', d:.12, v:.12 }),
  smg:       () => { tone({ f:1400, t:'square', d:.025, v:.1 }); tone({ f:480, d:.03, v:.08, t:'sawtooth' }); },
  chaingun:  () => { tone({ f:980, t:'sawtooth', d:.022, v:.13 }); tone({ f:320, d:.026, v:.1, t:'square' }); },
  railgun:   () => { tone({ f:90, t:'sawtooth', d:.48, v:.2, f2:2400 }); tone({ f:900, t:'square', d:.08, v:.2 }); },
  plasma:    () => { tone({ f:1800, t:'sine', d:.11, v:.13, f2:600 }); tone({ f:2100, t:'square', d:.05, v:.1 }); },
  wPickup:   () => [330,440,550,660,880].forEach((f,i) => setTimeout(() => tone({ f, t:'sine', d:.1, v:.13 }), i*40)),
  powerup:   () => {
    // Dramatic 6-note ascending sweep with a higher final note — clearly distinct from pickup/wPickup
    [220,330,440,660,880,1320].forEach((f,i) => setTimeout(() => tone({ f, t:'sine', d:.18, v:.18 }), i*55));
    tone({ f:80, t:'sawtooth', d:.55, v:.12 }); // Deep bass rumble underneath
  },
};