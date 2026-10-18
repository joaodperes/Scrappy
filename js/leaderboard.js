// leaderboard.js – Firebase Firestore backend for scores + progression

export let currentLeaderboardMode = 'solo';

export function setLeaderboardMode(mode) {
    currentLeaderboardMode = mode;
}

function _db() {
  return typeof firebase !== 'undefined' ? firebase.firestore() : null;
}

export async function submitScore(name, score, wave, mode, mapName) {
    if (typeof firebase === 'undefined') return;
    
    // Route to the correct Firebase collection
    const collectionName = mode === 'hard' ? 'scores_hard' : 'scores';
    
    try {
      await firebase.firestore().collection(collectionName).add({
        name: name,
        score: score,
        wave: wave,
        map: mapName || 'scrapyard',
        mode: mode,           // ← ADD THIS
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
        renderLeaderboard(); // Refresh the board after submitting
    } catch (e) {
        console.error("Error submitting score: ", e);
    }
}

export async function fetchTopScores(mode = 'solo', map = 'scrapyard', count = 10) {
  const db = _db(); if (!db) return [];
  const snap = await db.collection('scores')
    .where('mode', '==', mode)
    .where('map', '==', map)
    .orderBy('score', 'desc')
    .limit(count)
    .get()
    .catch(e => { console.error('[leaderboard] Fetch failed:', e); return null; });
  if (!snap) return [];
  return snap.docs.map(d => d.data());
}

export async function renderLeaderboard(mapIdOverride) {
  if (typeof firebase === 'undefined') return;
  const list = document.getElementById('leaderboardList');
  if (!list) return;

  list.innerHTML = '<li style="color:#557733; text-align:center;">LOADING...</li>';

  const collectionName = currentLeaderboardMode === 'hard' ? 'scores_hard' : 'scores';

  import('./mapManager.js').then(async ({ getCurrentMap }) => {
    const currentMap = mapIdOverride || getCurrentMap() || 'scrapyard';

    try {
      // ── Single-field query (no composite index needed) ────
      const snapshot = await firebase.firestore()
        .collection(collectionName)
        .orderBy('score', 'desc')
        .limit(100)           // over-fetch, then filter client-side
        .get();

      // Filter by map on the client
      const docs = snapshot.docs
        .filter(d => (d.data().map || 'scrapyard') === currentMap)
        .slice(0, 10);

      list.innerHTML = '';
      if (docs.length === 0) {
        list.innerHTML = '<li style="color:#557733; text-align:center;">NO SCORES YET</li>';
        return;
      }

      docs.forEach((doc, i) => {
        const data = doc.data();
        const rank  = i + 1;
        const rankColor = rank === 1 ? '#F6B53D' : '#88aa44';
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(85,119,51,0.3)';
        li.innerHTML = `
          <span style="color:${rankColor};font-weight:bold;">${rank}. ${data.name}</span>
          <span style="color:#d8f030;">${data.score}</span>
        `;
        list.appendChild(li);
      });

    } catch (e) {
      console.error("Error fetching leaderboard: ", e);
      list.innerHTML = '<li style="color:#E85E76; text-align:center;">ERROR LOADING SCORES</li>';
    }
  });
}

export async function syncProgressionUp(profile) {
  const db = _db(); if (!db || !profile?.name) return;
  await db.collection('progression').doc(profile.name).set(
    { profile, updated_at: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(e => console.error('[leaderboard] Sync failed:', e));
}

export async function fetchProgression(playerName) {
  const db = _db(); if (!db) return null;
  const doc = await db.collection('progression').doc(playerName).get()
    .catch(() => null);
  return doc?.exists ? doc.data().profile : null;
}

function _esc(s) {
  return String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}