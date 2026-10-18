// leaderboardPage.js – standalone leaderboard subpage
//
// Moves the existing #leaderboardSection (STANDARD/HARD toggle + score
// list, rendered by leaderboard.js) out of the main menu and into its own
// full-screen page, adding a map selector on top. That selector is
// intentionally independent of setCurrentMap — browsing old scores
// shouldn't change which map Play/Create Room will load next.
//
// Built once and toggled via display, not rebuilt per open: this page
// permanently owns the relocated #leaderboardSection, so there's nowhere
// for it to get lost between opens.
//
// CO-OP has no data yet — nothing produces a co-op score until the
// Networking phase + real co-op Survival exist. Selecting it shows an
// honest empty state instead of a query that can never return anything.

import { MAPS } from './mapManager.js';
import { renderLeaderboard } from './leaderboard.js';

const FONT = '"Courier New",monospace';

function el(tag, css, html) {
  const d = document.createElement(tag);
  if (css) d.style.cssText = css;
  if (html !== undefined) d.innerHTML = html;
  return d;
}

let _pageEl = null;
let _boardHost = null;
let _selectedMapId = 'scrapyard';
let _playerMode = 'solo'; // 'solo' | 'coop' — separate from leaderboard.js's solo/hard difficulty filter

export function getLeaderboardPageMapId() {
  return _selectedMapId;
}

function _build() {
  const page = el('div',
    `position:fixed;inset:0;z-index:940;background:#080808;color:#d8f030;` +
    `font-family:${FONT};display:none;flex-direction:column;align-items:center;` +
    `padding:26px 16px 40px;overflow-y:auto`);
  page.id = '_leaderboardPage';
  page.appendChild(el('h1', 'font-size:24px;letter-spacing:5px;margin:0 0 18px', '🏆 LEADERBOARDS'));

  // Map selector — deliberately does NOT call setCurrentMap.
  const mapRow = el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:12px');
  mapRow.appendChild(el('span', 'font-size:12px;color:#88aa44;letter-spacing:2px', 'MAP:'));
  const mapSelect = el('select');
  mapSelect.style.cssText = `background:#0d1a05;color:#d8f030;border:1px solid #557733;padding:6px 12px;font-family:${FONT};font-size:14px;cursor:pointer`;
  Object.values(MAPS).forEach(m => {
    const opt = el('option', '', '');
    opt.value = m.id;
    opt.textContent = `${m.icon} ${m.name}`;
    mapSelect.appendChild(opt);
  });
  mapSelect.value = _selectedMapId;
  mapSelect.onchange = () => { _selectedMapId = mapSelect.value; refresh(); };
  mapRow.appendChild(mapSelect);
  page.appendChild(mapRow);

  // Solo / Co-op filter
  const pmRow = el('div', 'display:flex;gap:8px;margin-bottom:14px');
  const soloBtn = el('button', '', 'SOLO');
  const coopBtn = el('button', '', 'CO-OP');
  soloBtn.onclick = () => { _playerMode = 'solo'; onPlayerModeChanged(); };
  coopBtn.onclick = () => { _playerMode = 'coop'; onPlayerModeChanged(); };
  pmRow.appendChild(soloBtn); pmRow.appendChild(coopBtn);
  page.appendChild(pmRow);

  _boardHost = el('div', 'width:100%;max-width:380px');
  page.appendChild(_boardHost);

  const coopNote = el('div',
    'font-size:12px;color:#557733;max-width:380px;text-align:center;line-height:1.6;display:none',
    'No co-op scores yet \u2014 co-op Survival needs the multiplayer networking phase, which hasn\u2019t been built.');
  page.appendChild(coopNote);

  function styleTabs() {
    [[soloBtn, 'solo'], [coopBtn, 'coop']].forEach(([btn, id]) => {
      const on = _playerMode === id;
      btn.style.cssText = `font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:1px;padding:7px 22px;cursor:pointer;` +
        `background:${on ? '#1a3a1a' : 'transparent'};border:1.5px solid ${on ? '#2a5' : '#333'};color:${on ? '#d8f030' : '#666'}`;
    });
  }
  function onPlayerModeChanged() {
    const isCoop = _playerMode === 'coop';
    _boardHost.style.display = isCoop ? 'none' : 'block';
    coopNote.style.display = isCoop ? 'block' : 'none';
    styleTabs();
  }
  function refresh() {
    if (_playerMode === 'solo') renderLeaderboard(_selectedMapId);
  }
  page._refresh = refresh;
  page._onPlayerModeChanged = onPlayerModeChanged;

  styleTabs();

  const back = el('button',
    `font-family:${FONT};font-size:14px;font-weight:bold;letter-spacing:2px;background:transparent;` +
    `border:2px solid #333;color:#557733;padding:11px 28px;cursor:pointer;margin-top:20px`,
    '← BACK');
  back.onclick = () => {
    page.style.display = 'none';
    const m = document.getElementById('menuScreen');
    if (m) m.className = 'screen visible';
  };
  page.appendChild(back);

  document.body.appendChild(page);
  return page;
}

export function showLeaderboardPage() {
  if (!_pageEl) _pageEl = _build();

  // Relocate the real #leaderboardSection (STANDARD/HARD + list, from
  // index.html) into this page the first time it's needed. After that it
  // lives here permanently — never destroyed, just shown/hidden with the
  // rest of the page, so it can't get orphaned between opens.
  const section = document.getElementById('leaderboardSection');
  if (section && section.parentElement !== _boardHost) {
    section.style.display = 'block';
    _boardHost.appendChild(section);
  }

  _pageEl.style.display = 'flex';
  _pageEl._onPlayerModeChanged();
  _pageEl._refresh();
}
