// leaderboard.js – Firebase Firestore backend for scores + progression

function _db() {
  return typeof firebase !== 'undefined' ? firebase.firestore() : null;
}

export async function submitScore(name, score, wave, mode = 'solo', map = 'scrapyard') {
  const db = _db();
  if (!db) { console.warn('[leaderboard] Firebase not loaded'); return; }

  // Also update progression maxWave so the loadout stat is never stale
  if (mode === 'solo' && typeof wave === 'number') {
    import('./progression.js').then(({ recordWaveComplete }) => {
      recordWaveComplete(wave, false);
    });
  }

  await db.collection('scores').add({
    name, score, wave, mode, map, 
    date: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(e => console.error('[leaderboard] Submit failed:', e));
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

export async function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  if (!el) return;
  el.innerHTML = '<li style="color:#557733">LOADING…</li>';
  const selectedMap = document.getElementById('mapDropdown')?.value || 'scrapyard';
  const rows = await fetchTopScores('solo', selectedMap);
  if (!rows.length) { el.innerHTML = '<li style="color:#557733">NO SCORES YET</li>'; return; }
  el.innerHTML = rows.map((r, i) =>
    `<li>
      <span style="color:#d8f030;min-width:22px;display:inline-block">${i + 1}.</span>
      <span style="color:#fff;min-width:110px;display:inline-block">${_esc(r.name)}</span>
      <span style="color:#d8f030;font-weight:700">${r.score}</span>
      <span style="color:#557733;font-size:12px;margin-left:8px">W${r.wave ?? '?'}</span>
    </li>`
  ).join('');
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