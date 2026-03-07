// leaderboard.js – Firebase Firestore integration for score persistence
//
// ┌─────────────────────────────────────────────────────────────┐
// │  SETUP:                                                       │
// │  1. Create a Firebase project at https://console.firebase.google.com │
// │  2. Enable Firestore Database (start in test mode is fine)   │
// │  3. Copy your config values below                            │
// │  4. In Firestore, create a collection called "scores"        │
// └─────────────────────────────────────────────────────────────┘

import { initializeApp }        from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

// ── Firebase config ── Replace with your project's values ──────
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_ME",
  authDomain:        "REPLACE_ME.firebaseapp.com",
  projectId:         "REPLACE_ME",
  storageBucket:     "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId:             "REPLACE_ME",
};

let _db = null;
let _enabled = false;

function getDb() {
  if (!_db) {
    if (FIREBASE_CONFIG.apiKey === 'REPLACE_ME') {
      console.warn('[leaderboard] Firebase not configured – scores will not be saved.');
      return null;
    }
    const app = initializeApp(FIREBASE_CONFIG);
    _db = getFirestore(app);
    _enabled = true;
  }
  return _db;
}

/**
 * Submit a run score to Firestore.
 * @param {string} name
 * @param {number} score
 * @param {number} wave
 * @param {'solo'|'pvp'} mode
 */
export async function submitScore(name, score, wave, mode = 'solo') {
  const db = getDb(); if (!db) return;
  try {
    await addDoc(collection(db, 'scores'), {
      name, score, wave, mode,
      date: new Date().toISOString(),
    });
    console.log('[leaderboard] Score submitted:', name, score);
  } catch (err) {
    console.error('[leaderboard] Submit failed:', err);
  }
}

/**
 * Fetch top 10 solo scores.
 * @returns {Promise<Array<{name:string, score:number, wave:number}>>}
 */
export async function fetchTopScores(mode = 'solo', count = 10) {
  const db = getDb(); if (!db) return [];
  try {
    const q = query(
      collection(db, 'scores'),
      orderBy('score', 'desc'),
      limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.error('[leaderboard] Fetch failed:', err);
    return [];
  }
}

/** Render leaderboard into #leaderboardList element. */
export async function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  if (!el) return;
  el.innerHTML = '<li style="color:#557733">LOADING…</li>';
  const rows = await fetchTopScores();
  if (rows.length === 0) {
    el.innerHTML = '<li style="color:#557733">NO SCORES YET</li>';
    return;
  }
  el.innerHTML = rows.map((r, i) =>
    `<li>
      <span style="color:#d8f030;min-width:22px;display:inline-block">${i+1}.</span>
      <span style="color:#ffffff;min-width:110px;display:inline-block">${escHtml(r.name)}</span>
      <span style="color:#d8f030;font-weight:700">${r.score}</span>
      <span style="color:#557733;font-size:12px;margin-left:8px">W${r.wave??'?'}</span>
    </li>`
  ).join('');
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
