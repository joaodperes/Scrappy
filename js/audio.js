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
  // mag: null | 'pdw_conversion' | 'mag_50_cal'
  pistol: (mag = null) => {
    if (mag === 'pdw_conversion') {
      // PDW: lighter, higher-pitch, rapid burst character — near SMG territory
      tone({ f:1200, t:'square',   d:.028, v:.10 });
      tone({ f:420,  t:'sawtooth', d:.038, v:.08 });
    } else if (mag === 'mag_50_cal') {
      // .50 Cal: deep crack sweep + heavy low boom — near sniper territory
      tone({ f:95,   t:'sawtooth', d:.32,  v:.22, f2:40 });
      tone({ f:1800, t:'square',   d:.06,  v:.20 });
      tone({ f:4200, t:'sawtooth', d:.018, v:.12 }); // high-end snap
    } else {
      // Standard pistol
      tone({ f:1100, t:'square',   d:.04, v:.14 });
      tone({ f:350,  t:'sawtooth', d:.07, v:.10 });
    }
  },
  shotgun: () => {
    // Hard-hitting layered blast: deep low boom + mid punch + high crack
    tone({ f:72,   t:'sawtooth', d:.18,  v:.28 });          // deep floor-shaking boom
    tone({ f:260,  t:'sawtooth', d:.10,  v:.22 });          // mid-body punch
    tone({ f:900,  t:'sawtooth', d:.06,  v:.16 });          // upper bark
    setTimeout(() => tone({ f:1900, t:'square', d:.022, v:.18 }), 4);  // sharp crack transient
  },
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
      [220,330,440,660,880,1320].forEach((f,i) => setTimeout(() => tone({ f, t:'sine', d:.18, v:.18 }), i*55));
      tone({ f:80, t:'sawtooth', d:.55, v:.12 });
    },
  lavaDamage: () => {
    tone({ f: 85, t: 'sawtooth', d: 0.4, v: 0.22 });
    tone({ f: 40, t: 'square',   d: 0.5, v: 0.18 });
    },
  // vol 0–1, type = bot type string
  step: (vol = 0.5, type = 'scout') => {
    switch (type) {
      case 'giantbot':
        // Massive floor-shaking slam
        tone({ f: 32 + Math.random() * 12, t:'square',   d:.14,  v: vol * 0.55 });
        tone({ f: 800 + Math.random() * 300, t:'sawtooth', d:.030, v: vol * 0.18 });
        break;
      case 'heavy':
        // Heavy thud — slow, low, weighty
        tone({ f: 48 + Math.random() * 18, t:'square',   d:.10,  v: vol * 0.38 });
        tone({ f: 950 + Math.random() * 400, t:'sawtooth', d:.022, v: vol * 0.14 });
        break;
      case 'sniper':
      case 'ion_sniper':
        // Precise, deliberate — medium bass, crisp click
        tone({ f: 70 + Math.random() * 25, t:'square',   d:.065, v: vol * 0.24 });
        tone({ f: 1300 + Math.random() * 500, t:'sawtooth', d:.016, v: vol * 0.10 });
        break;
      case 'shotgun':
      case 'rocket':
      case 'grenadier':
        // Mid-weight trudge
        tone({ f: 60 + Math.random() * 22, t:'square',   d:.075, v: vol * 0.28 });
        tone({ f: 1100 + Math.random() * 450, t:'sawtooth', d:.018, v: vol * 0.10 });
        break;
      case 'scout':
      case 'pistol':
      default:
        // Light, quick scurry — higher pitch, short decay
        tone({ f: 85 + Math.random() * 35, t:'square',   d:.048, v: vol * 0.18 });
        tone({ f: 1400 + Math.random() * 600, t:'sawtooth', d:.014, v: vol * 0.08 });
        break;
      case 'electron_bot':
        // Electro-mechanical skitter — thin buzz underneath
        tone({ f: 75 + Math.random() * 28, t:'square',   d:.052, v: vol * 0.20 });
        tone({ f: 2200 + Math.random() * 800, t:'sine',    d:.012, v: vol * 0.07 }); // high electric whine
        break;
    }
  },
  // Drone hover hum — called on a timer while the drone is alive and moving
  hover: (vol = 0.5) => {
    tone({ f: 180 + Math.random() * 40, t:'sine',    d:.18, v: vol * 0.08 }); // low rotor hum
    tone({ f: 360 + Math.random() * 60, t:'sine',    d:.14, v: vol * 0.05 }); // first harmonic
    tone({ f: 2600 + Math.random() * 400, t:'square', d:.06, v: vol * 0.03 }); // thin electric whirr
  },
};
