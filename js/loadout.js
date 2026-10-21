// loadout.js – In-game loadout screen
import {
  profile, getLoadout, setWeaponSkin, setAttachment, setPlayerSkin,
  ATTACHMENTS, WEAPON_SKINS, PLAYER_SKINS, WEAPON_ATTACHMENT_SLOTS, WEAPON_SPECIALS,
  UNLOCK_TABLE, getLevelProgress, getChallengeProgress, getEffectiveStats,
  isAttachmentUnlocked, isWeaponSkinUnlocked, isSkinUnlocked, isPrereqUnlocked,
  getUnlockHint, getChallengeDescription, SKIN_DIFFICULTY_ORDER, getWeaponLevelProgress, saveProfile,
} from './progression.js';
import { WDEFS, applyLoadoutToScene } from './weapons.js';
import { MAPS } from './mapManager.js';
import { isCompetitiveFirearm, normalizeCompetitiveLoadout } from './weaponCategories.js';
import { renderPveBuild } from './pveBuildPage.js';

let _activeWeapon = 'PISTOL';
let _activeTab    = 'attachments';

// Track which progress sections are collapsed
const _progressCollapsed = {};
let _currentMode = null;
let _modeSlotTarget = 'primary';
let _modeSlots = { primary: null, secondary: null };

export function getModeSlots() { return { ..._modeSlots }; }

export function showLoadout(onClose, mode = null) {
  document.getElementById('loadoutPanel')?.remove();
  _currentMode = mode;
  _modeSlotTarget = 'primary';
  if(mode)_activeTab='attachments';
  _modeSlots = normalizeCompetitiveLoadout(profile.pvpLoadout,WDEFS);
  document.body.appendChild(_buildPanel(onClose, mode));
  _renderContent();
}

export function hideLoadout() { document.getElementById('loadoutPanel')?.remove(); }

// ── Colour palette (Metricalist Simply Modern Dark) ───────────
const C = {
  bg:           '#262735', // Main Background
  bgMid:        '#323447', // Cards and Panels
  bgCard:       '#323447',
  border:       '#5F6B6D', 
  borderHi:     '#15CAB6', // Accent / Good
  accent:       '#15CAB6', // Primary Accent (Teal)
  accentHi:     '#4AC5BB', // Lighter Teal
  accentPurple: '#696CB5', // Purple from dataColors
  accentGreen:  '#15CAB6', 
  dim:          '#ADAEB5', // Text Dim
  text:         '#F8FAF7', // Pure text foreground
  textDim:      '#CCCCCC', // Secondary text
  textMuted:    '#848591',
  warn:         '#F6B53D', // Yellow warning
  danger:       '#E85E76', // Red/Bad
  chalAtt:      '#15CAB6',
  chalSkin:     '#696CB5',
  chalPlayer:   '#287E8F',
};

// ── Shared helpers ────────────────────────────────────────────
const F = '"Courier New",monospace';

function _el(tag, css, html) {
  const d = document.createElement(tag);
  if (css)  d.style.cssText = css;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
function _fmt(n) {
  n = Number(n) || 0;
  return n >= 1000000 ? (n / 1000000).toFixed(1) + 'M'
       : n >= 1000    ? (n / 1000).toFixed(1)    + 'k'
       : String(n);
}
function _bar(pct, col, h = 4) {
  const w = Math.round(Math.min(1, Math.max(0, pct)) * 100);
  return `<div style="height:${h}px;background:#1a1c2e;border-radius:2px;overflow:hidden">
    <div style="width:${w}%;height:100%;background:${col};border-radius:2px;transition:width .3s"></div>
  </div>`;
}
function _progressRow(pct, val, target, col) {
  return `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
    <div style="flex:1;height:3px;background:#1a1c2e;border-radius:2px;overflow:hidden">
      <div style="width:${Math.round(Math.min(1,pct)*100)}%;height:100%;background:${col};border-radius:2px"></div>
    </div>
    <span style="font-size:11px;color:${col};min-width:52px;text-align:right">${_fmt(val)} / ${_fmt(target)}</span>
  </div>`;
}
function _pill(label, n, d, col) {
  const done = d > 0 && n >= d;
  return `<span style="font-size:11px;background:${C.bg};border:1px solid ${col};color:${col};
    padding:2px 7px;border-radius:10px;letter-spacing:.5px">${label}&nbsp;${n}/${d}${done?' ✓':''}</span>`;
}
function _wIcon(w) {
  return {
    PISTOL:       '🔫',
    KNIFE:        '🔪',
    SMG:          '💨',
    SHOTGUN:      '💥',
    CHAINGUN:     '⛓️',
    RAILGUN:      '🎯',
    PLASMA:       '🔵',
    ROCKET:       '🚀',
    GLAUNCHER:    '💣',
    ELECTRON:     '🔭',
    ION:          '🔮',
    FLAMETHROWER: '🔥',
    TESLA:        '⚡',
    CROSSBOW:     '🏹',
    SINGULARITY:   '🌌',
    THUNDERBOLT:   '🌩️',
    PYROCLAST:     '🌋',
    OMEGA_STORM:   '⛈️',
    VORTEX_C:     '🌀', 
    RIVETER:      '🔩', 
    PHALANX:      '🛡️',
    AEGIS:        '📌',
    COMET:        '☄️',
    DMR:          '💠',
  }[w] ?? '⚔️';
}

// ── Style fragments ───────────────────────────────────────────
const _tabStyle  = (a) =>
  `background:${a?C.bgMid:'transparent'};border:none;border-bottom:3px solid ${a?C.accent:'transparent'};` +
  `color:${a?C.text:C.dim};padding:14px 22px;cursor:pointer;font-family:${F};` +
  `font-size:16px;font-weight:bold;letter-spacing:1.5px;transition:all .15s`;
const _wcardStyle = (s) =>
  `background:${s?'#131626':'transparent'};border-left:4px solid ${s?C.accent:'transparent'};` +
  `padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:11px;` +
  `font-size:14px;color:${s?C.text:C.dim};transition:background .1s`;
const _cardBase = (s) =>
  `background:${s?'#161a2a':C.bgCard};border:1.5px solid ${s?C.borderHi:C.border};` +
  `border-radius:6px;padding:12px 15px;cursor:pointer;display:flex;` +
  `align-items:flex-start;gap:11px;transition:all .15s`;

// ── Panel skeleton ────────────────────────────────────────────
function _buildPanel(onClose, mode = null) {
  const panel = _el('div',
    `position:fixed;inset:0;background:${C.bg};z-index:1050;overflow:hidden;` +
    `display:flex;flex-direction:column;font-family:${F};color:${C.text}`
  );
  panel.id = 'loadoutPanel';

  // Top bar
  const topBar = _el('div',
    `display:flex;align-items:center;justify-content:space-between;padding:12px 28px;` +
    `background:${C.bgMid};border-bottom:1.5px solid ${C.border};flex-shrink:0`
  );

  if (mode) {
    // ── MODE CONTEXT: slot boxes instead of name/XP ──────
    const slotRow = _el('div', 'display:flex;gap:12px;align-items:stretch;');
    slotRow.appendChild(_buildModeSlotBox('PRIMARY'));
    slotRow.appendChild(_buildModeSlotBox('SECONDARY'));
    topBar.appendChild(slotRow);

    const deployBtn = _el('button',
    `background:#0e1428;border:2px solid ${C.accent};color:${C.accent};` +
    `padding:8px 28px;cursor:pointer;font-family:${F};font-size:14px;font-weight:bold;letter-spacing:2px`,
    'DEPLOY →');
  deployBtn.id = 'deployBtn';
  deployBtn.onclick = () => {
    const slots = getModeSlots();
    if (!slots.primary || !slots.secondary) {
      // Flash the empty slot boxes to show the user what's missing
      document.querySelectorAll('[data-mslot]').forEach(el => {
        const key = el.dataset.mslot;
        if (!_modeSlots[key]) {
          el.style.transition = 'border-color .15s';
          el.style.borderColor = C.danger;
          setTimeout(() => { el.style.borderColor = (_modeSlotTarget === key) ? C.accent : C.border; }, 600);
        }
      });
      return;
    }
    profile.pvpLoadout={...slots};
    saveProfile();
    _currentMode = null;
    hideLoadout();
    onClose?.(slots);
  };
topBar.appendChild(deployBtn);

    // Back button
    const backBtn = _el('button',
      `background:transparent;border:1px solid ${C.border};color:${C.dim};` +
      `padding:5px 13px;cursor:pointer;font-family:${F};font-size:11px;margin-left:12px`,
      '← BACK'
    );
    backBtn.onclick = () => {
      // Cancel without saving a new selection. Preserve the room behind us.
      _currentMode = null;
      hideLoadout();
      onClose?.(null);
    };
    topBar.appendChild(backBtn);

  } else {
    // ── NORMAL CONTEXT: name + XP + close ────────────
    const { level, xpThisLevel, xpNeeded, pct } = getLevelProgress();
    const displayName = profile.displayName || profile.name || 'ANON';

    const identity = _el('div','display:flex;align-items:center;gap:14px');
    identity.innerHTML = `
      <div>
        <div id="loadoutDisplayName" style="font-size:20px;font-weight:bold;letter-spacing:3px;color:${C.accentHi}">${_esc(displayName)}</div>
        <div style="font-size:12px;color:${C.dim};letter-spacing:2px;margin-top:1px">LOADOUT · CUSTOMISE YOUR ARSENAL</div>
      </div>`;
    const editBtn = _el('button',
      `background:transparent;border:1px solid ${C.border};color:${C.textDim};` +
      `padding:3px 9px;cursor:pointer;font-family:${F};font-size:12px;letter-spacing:1px;border-radius:3px`,
      '✎ NAME'
    );
    editBtn.onclick = _showNameEditor;
    identity.appendChild(editBtn);
    topBar.appendChild(identity);

    const xpBlock = _el('div','text-align:right;min-width:170px');
    xpBlock.innerHTML = `
      <div style="font-size:12px;color:${C.textDim}">
        LEVEL <span style="color:${C.accent};font-size:19px;font-weight:bold">${level}</span>
      </div>
      ${_bar(pct, C.accent, 5)}
      <div style="font-size:12px;color:${C.dim};margin-top:2px">${xpThisLevel} / ${xpNeeded} XP</div>`;
    topBar.appendChild(xpBlock);

    const closeBtn = _el('button',
      `background:transparent;border:1px solid ${C.border};color:${C.accent};` +
      `padding:5px 13px;cursor:pointer;font-family:${F};font-size:11px;margin-left:20px`,
      '✕ CLOSE'
    );
    closeBtn.id = 'loadoutCloseBtn';
    closeBtn.onclick = () => { saveProfile(); hideLoadout(); onClose?.(); };
    topBar.appendChild(closeBtn);
  }
  panel.appendChild(topBar);

  // Tab bar
  const tabs = [
    { id:'attachments', label:'ATTACHMENTS' },
    { id:'skins',       label:'WEAPON SKINS' },
    {id:'player',       label:'PLAYER SKIN'  },
    { id:'progress',    label:'PROGRESS'     },
    { id:'pve',         label:'SURVIVAL GEAR' },
    { id:'pvp',         label:'PVP LOADOUT'  },
  ];
  const tabBar = _el('div',
    `display:flex;background:${C.bgMid};border-bottom:1.5px solid ${C.border};padding:0 28px;flex-shrink:0;overflow-x:auto;white-space:nowrap`
  );
  if (mode) tabBar.style.display = 'none'; // hide tabs in mode context
  tabs.forEach(t => {
    const b = _el('button', _tabStyle(_activeTab === t.id), t.label);
    b.style.flexShrink='0'; // Quests/Secondary tabs can scroll on narrow screens.
    b.dataset.tabId = t.id;
    b.onclick = () => { _activeTab = t.id; _renderContent(); };
    tabBar.appendChild(b);
  });
  panel._tabBar = tabBar;
  panel.appendChild(tabBar);

  // Body
  const body = _el('div','display:flex;flex:1;overflow:hidden');
  const sidebar = _el('div',
    `width:210px;flex-shrink:0;background:${C.bgMid};border-right:1.5px solid ${C.border};overflow-y:auto;padding:12px 0`
  );
  sidebar.id = 'loadoutSidebar';
  Object.keys(WDEFS).forEach(wName => {
    if (_currentMode && !isCompetitiveFirearm(wName,WDEFS)) return;
    if (WDEFS[wName].wonderWeapon) return;
    // Pistol is a valid selectable competitive slot; Gun Game stays automatic.

    const wxp = profile.stats?.weaponXp?.[wName] || 0;
    const isDiscovered = wxp > 0 || wName === 'PISTOL';
    const title = isDiscovered ? WDEFS[wName].name : '??? (UNDISCOVERED)';

    const btn = _el('div', _wcardStyle(wName === _activeWeapon));
    btn.dataset.wName = wName;
    btn.innerHTML =
      `<span style="font-size:15px">${_wIcon(wName)}</span>` +
      `<span style="margin-left:8px">${_esc(title)}</span>`;

    btn.onclick=()=>{
      _activeWeapon=wName;
      if(_currentMode){
        _modeSlots[_modeSlotTarget]=wName;
        // The two deployment weapons must be distinct.
        const other=_modeSlotTarget==='primary'?'secondary':'primary';
        if(_modeSlots[other]===wName)_modeSlots[other]=null;
        _refreshSlotBoxes();
      }
      _renderContent();
    };
    sidebar.appendChild(btn);
  });
  body.appendChild(sidebar);

  const main = _el('div','flex:1;overflow-y:auto;padding:22px 32px');
  main.id = 'loadoutMain';
  body.appendChild(main);
  panel.appendChild(body);
  // Initialize deploy button state for mode context
  if (mode) _updateDeployBtn(); 
  return panel;
}

function _renderDiscoveryMessage(wName) {
  const main = document.getElementById('loadoutContent');
  if (!main) return;
  main.innerHTML = ''; // Wipe current attachments/stats view

  // Build a clean, styled outer box
  const box = _el('div', 
    `display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; 
     padding:60px 20px; border:1px dashed #E85E76; border-radius:8px; background:rgba(232,94,118,0.03); margin-top:20px;`
  );

  // Grab any challenges tied to unlocking this base weapon, if applicable
  const baseUnlock = UNLOCK_TABLE.find(u => u.type === 'weapon' && u.id === wName);
  let challengeContext = '';

  if (baseUnlock && baseUnlock.challenge) {
      challengeContext = `
        <div style="margin-top:20px; padding:12px; background:rgba(0,0,0,0.4); border:1px solid #E85E76; border-radius:4px; max-width:400px; font-family:monospace;">
            <span style="color:#E85E76; font-weight:bold;">REQUISITION PROTOCOL:</span><br>
            <div style="font-size:13px; margin-top:6px; color:#fff;">${_esc(baseUnlock.challenge.desc)}</div>
        </div>
      `;
  } else {
      challengeContext = `
        <div style="color:#848591; font-size:13px; margin-top:10px; max-width:420px; line-height:1.5;">
            This item is currently locked down by sector command. Locate this armament dropped during deployment or complete active operation waves to salvage its data patterns.
        </div>
      `;
  }

  box.innerHTML = `
    <div style="font-size:42px; margin-bottom:15px; filter: drop-shadow(0 0 8px rgba(232,94,118,0.4));">🔒</div>
    <div style="font-size:20px; font-weight:bold; color:#E85E76; letter-spacing:2px; text-transform:uppercase;">
        CLASSIFIED BLUEPRINT DATA
    </div>
    <div style="color:#848591; font-size:11px; margin-top:4px; font-family:monospace; letter-spacing:1px;">
        INDEX REQ: UNKNOWN_WEAPON_${wName}
    </div>
    <div style="width:60px; height:2px; background:#E85E76; margin:20px 0; opacity:0.5;"></div>
    ${challengeContext}
  `;

  main.appendChild(box);
}

// ── Name editor overlay ───────────────────────────────────────
function _showNameEditor() {
  document.getElementById('_nameEditorOverlay')?.remove();
  const overlay = _el('div',
    `position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:2000;` +
    `display:flex;align-items:center;justify-content:center`
  );
  overlay.id = '_nameEditorOverlay';
  const box = _el('div',
    `background:${C.bgMid};border:2px solid ${C.border};padding:26px 34px;` +
    `display:flex;flex-direction:column;gap:11px;font-family:${F};min-width:300px`
  );
  box.innerHTML = `
    <div style="font-size:16px;font-weight:bold;letter-spacing:3px;color:${C.accentHi}">CHANGE DISPLAY NAME</div>
    <input id="_newNameInput" maxlength="16" autocomplete="off" spellcheck="false"
      value="${_esc(profile.displayName || profile.name || '')}"
      style="background:${C.bg};border:1.5px solid ${C.border};color:${C.accent};font-family:${F};
             font-size:18px;padding:7px 12px;letter-spacing:2px;outline:none;width:100%;box-sizing:border-box"/>
    <div id="_newNameErr" style="font-size:11px;color:${C.danger};display:none">Name must be 1–16 characters.</div>
    <div style="display:flex;gap:8px">
      <button id="_newNameConfirm" style="flex:1;background:#0e1428;border:1.5px solid ${C.accent};
        color:${C.accent};font-family:${F};font-size:12px;padding:7px;cursor:pointer;letter-spacing:1px">CONFIRM</button>
      <button id="_newNameCancel" style="background:transparent;border:1px solid ${C.border};
        color:${C.dim};font-family:${F};font-size:12px;padding:7px 12px;cursor:pointer">CANCEL</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const inp = box.querySelector('#_newNameInput');
  const err = box.querySelector('#_newNameErr');
  inp.focus(); inp.select();
  
  const confirm = () => {
    const v = inp.value.trim();
    if (!v) { err.style.display = 'block'; return; }
    profile.displayName = v; profile.name = v;
    saveProfile();
    
    const deathInp = document.getElementById('playerNameInput');
    if (deathInp) deathInp.value = v;
    
    try {
        if (window.firebase && window.firebase.auth().currentUser) {
            const uid = window.firebase.auth().currentUser.uid;
            // Point to firestore(), NOT database(), and hit the 'users' collection
            window.firebase.firestore().collection('users').doc(uid).update({
                displayName: v,
                displayName_lower: v.toLowerCase()
            });
        }
    } catch (e) {
        console.error("[FIREBASE] Sync failed:", e);
    }
    
    overlay.remove();
    const badge = document.getElementById('loadoutDisplayName');
    if (badge) badge.textContent = v;
  };
  
  box.querySelector('#_newNameConfirm').addEventListener('click', confirm);
  box.querySelector('#_newNameCancel').addEventListener('click', () => overlay.remove());
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') overlay.remove();
  });
}

// ── Mode slot box builder ─────────────────────────────────
function _buildModeSlotBox(label) {
  const key = label.toLowerCase();
  const sel = _modeSlots[key];
  const wDef = sel ? WDEFS[sel] : null;
  const active = _modeSlotTarget === key;

  const card = _el('div',
    `background:${active ? '#161a2a' : C.bgCard};` +
    `border:2px solid ${active ? C.accent : C.border};` +
    `border-radius:6px;padding:8px 16px;pointer-events:auto;cursor:pointer;` +
    `display:flex;align-items:center;gap:10px;min-width:160px;transition:all .15s`);
  card.dataset.mslot = key;  // ← Set as real DOM attribute, NOT in cssText
  card.innerHTML = `
    <div style="font-size:9px;color:${C.dim};letter-spacing:2px">${label}</div>
    ${wDef
      ? `<span style="font-size:18px">${_wIcon(sel)}</span>
         <span style="font-size:13px;font-weight:bold;color:${active ? C.accentHi : C.text}">${wDef.name}</span>`
      : `<span style="font-size:12px;color:${C.textMuted}">— CLICK A WEAPON —</span>`}
  `;
  card.onclick = (e) => { e.stopPropagation(); _modeSlotTarget = key; _refreshSlotBoxes(); };
  return card;
}

function _updateDeployBtn() {
  const btn = document.getElementById('deployBtn');
  if (!btn) return;
  const slots = getModeSlots();
  const ready = !!(slots.primary && slots.secondary);
  btn.style.opacity = ready ? '1' : '0.35';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  btn.style.borderColor = ready ? C.accent : C.border;
  btn.style.color = ready ? C.accent : C.dim;
}

function _refreshSlotBoxes() {
  document.querySelectorAll('[data-mslot]').forEach(el => {
    const key = el.dataset.mslot;
    const sel = _modeSlots[key];
    const wDef = sel ? WDEFS[sel] : null;
    const active = _modeSlotTarget === key;
    el.style.borderColor = active ? C.accent : C.border;
    el.style.background = active ? '#161a2a' : C.bgCard;
    el.innerHTML = `
      <div style="font-size:9px;color:${C.dim};letter-spacing:2px">${key.toUpperCase()}</div>
      ${wDef
        ? `<span style="font-size:18px">${_wIcon(sel)}</span>
           <span style="font-size:13px;font-weight:bold;color:${active ? C.accentHi : C.text}">${wDef.name}</span>`
        : `<span style="font-size:12px;color:${C.textMuted}">— CLICK A WEAPON —</span>`}
    `;
  });
  _updateDeployBtn();  // ← Update deploy button state whenever slots change
}

function _getAttachmentProgressMetrics() {
  let unlocked = 0;
  let total = 0;
  
  // UNLOCK_TABLE is imported directly from progression.js at the top of loadout.js
  if (Array.isArray(UNLOCK_TABLE)) {
    UNLOCK_TABLE.forEach(u => {
      total++;
      
      let isDone = false;
      // Mirror the precise completion evaluation pattern your challenge rows use
      if (u.weapon && typeof isAttachmentUnlocked === 'function') {
        isDone = isAttachmentUnlocked(u.id, u.weapon);
      } else if (typeof isSkinUnlocked === 'function') {
        isDone = isSkinUnlocked(u.id);
      }
      
      if (isDone) unlocked++;
    });
  }
  return { unlocked, total };
}

// ── Tab routing ───────────────────────────────────────────────
function _renderContent() {
  const panel = document.getElementById('loadoutPanel'); if (!panel) return;
  panel._tabBar?.querySelectorAll('button').forEach(b => {
    b.style.cssText = _tabStyle(b.dataset.tabId === _activeTab);
  });
  const sidebar  = document.getElementById('loadoutSidebar');
  const noSidebar = ['player','progress','pve','pvp'].includes(_activeTab);
  if (sidebar) sidebar.style.display = noSidebar ? 'none' : 'block';
  sidebar?.querySelectorAll('[data-w-name]').forEach(c => {
    c.style.cssText = _wcardStyle(c.dataset.wName === _activeWeapon);
  });
  const main = document.getElementById('loadoutMain'); if (!main) return;
  main.innerHTML = '';
  if      (_activeTab === 'attachments') _renderAttachments(main);
  else if (_activeTab === 'skins')       _renderWeaponSkins(main);
  else if (_activeTab === 'player')      _renderPlayerSkins(main);
  else if (_activeTab === 'progress')    _renderProgress(main);
  else if (_activeTab === 'pve')         renderPveBuild(main);
  else if (_activeTab === 'pvp')         _renderPvpSetup(main);
}

// ── Weapon level banner ───────────────────────────────────────
function _weaponLevelBanner(wName) {
  const { level, xpThisLevel, xpNeeded, pct, isMax } = getWeaponLevelProgress(wName);
  const col = isMax ? C.warn : C.accent;
  const d = _el('div',
    `display:flex;align-items:center;gap:14px;padding:9px 13px;` +
    `background:${C.bgMid};border:1.5px solid ${C.border};border-radius:6px;margin-bottom:10px`
  );
  d.innerHTML = `
    <div style="text-align:center;min-width:42px">
      <div style="font-size:11px;color:${C.dim};letter-spacing:2px">WPN LVL</div>
      <div style="font-size:24px;font-weight:bold;color:${col}">${level}</div>
      ${isMax ? `<div style="font-size:8px;color:${C.warn};border:1px solid ${C.warn};padding:0 3px">MAX</div>` : ''}
    </div>
    <div style="flex:1">
      ${_bar(pct, col, 6)}
      <div style="font-size:12px;color:${C.dim};margin-top:3px">
        ${isMax
          ? 'Prestige — all weapon XP banked'
          : `${xpThisLevel} / ${xpNeeded} XP · ${xpNeeded - xpThisLevel} to next level`}
      </div>
    </div>`;
  return d;
}

// ── Unlock helpers ────────────────────────────────────────────
function _getUnlockInfo(attId, wName, type) {
  const u = UNLOCK_TABLE.find(e =>
    e.type === type && e.id === attId && (wName ? e.weapon === wName : !e.weapon)
  );
  if (!u) return { isSecret:false, isChallenge:false, isLevel:false, prog:null, unlockEntry:null };
  return {
    isSecret:    !!u.secret,
    isChallenge: !!u.challenge,
    isLevel:     !!u.level && !u.challenge,
    prog:        u.challenge ? getChallengeProgress(u.challenge) : null,
    unlockEntry: u,
  };
}
function _lockHTML(attId, wName, type) {
  const { isSecret, isChallenge, isLevel, prog, unlockEntry } = _getUnlockInfo(attId, wName, type);
  if (!unlockEntry)
    return `<div style="font-size:12px;color:${C.textDim};margin-top:5px;font-style:italic">🔒 Locked</div>`;

  // Sequential exception: gated behind another unlock, regardless of this
  // item's own challenge progress.
  if (unlockEntry.requires && !isPrereqUnlocked(unlockEntry)) {
    const reqLabel = unlockEntry.requires.replace(/_/g, ' ').toUpperCase();
    const ownDone  = prog ? prog.pct >= 1 : false;
    return `<div style="font-size:11px;color:${C.accentPurple};margin-top:5px">
        🔒 ${ownDone ? 'Challenge complete — ' : ''}Unlocks after equipping <b>${_esc(reqLabel)}</b>
      </div>` + (prog ? _progressRow(prog.pct, prog.val, prog.target, C.accentPurple) : '');
  }  

  const { level } = getLevelProgress();
  
  // Helper to render either a single or composite progress track
  const buildProgress = (baseColor) => {
    if (prog.subProgresses) {
      return prog.subProgresses.map(sp => `
        <div style="margin-top:6px;">
          <div style="display:flex; justify-content:space-between; font-size:9px; color:${C.dim}; text-transform:uppercase; margin-bottom:2px">
            <span>${_esc(sp.desc)}</span>
            <span style="color:${sp.pct>=1?C.accentGreen:baseColor}">${_fmt(sp.val)} / ${_fmt(sp.target)}</span>
          </div>
          <div style="width:100%;height:3px;background:#1a1c2e;border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(Math.min(1,sp.pct)*100)}%;height:100%;background:${sp.pct>=1?C.accentGreen:baseColor};border-radius:2px"></div>
          </div>
        </div>x
      `).join('');
    }
    return _progressRow(prog.pct, prog.val, prog.target, baseColor);
  };

  if (isSecret) {
    if (!prog || prog.pct < 0.10)
      return `<div style="font-size:11px;color:${C.dim};margin-top:5px;font-style:italic">🔒 ??? SECRET — keep playing to reveal</div>`;
    return `<div style="font-size:11px;color:${C.accentPurple};margin-top:5px">🔒 SECRET: ${_esc(getChallengeDescription(unlockEntry))}</div>`
         + buildProgress(C.accentPurple);
  }
  
  if (isChallenge && prog) {
    return `<div style="font-size:11px;color:${C.textDim};margin-top:5px;line-height:1.3">🔒 ${_esc(getChallengeDescription(unlockEntry))}</div>`
         + buildProgress(C.accent);
  }
  
  if (isLevel) {
    const lv = unlockEntry.level;
    return `<div style="font-size:11px;color:${C.textDim};margin-top:5px">🔒 Reach Level ${lv} (you are ${level})</div>`
         + _progressRow(Math.min(1, level / lv), level, lv, '#7788ff');
  }
  
  return `<div style="font-size:11px;color:${C.textDim};margin-top:5px">🔒 ${_esc(getUnlockHint(unlockEntry))}</div>`;
}

// ── ATTACHMENTS tab ───────────────────────────────────────────
function _renderAttachments(main) {
  const wName = _activeWeapon;
  main.appendChild(_weaponLevelBanner(wName));

  const desc = WDEFS[wName]?.desc;
  if (desc) {
    main.appendChild(_el('div',
      `font-size:12px;color:${C.textDim};line-height:1.65;margin-bottom:12px;padding:9px 13px;` +
      `background:${C.bgMid};border-left:3px solid ${C.accent};border-radius:0 4px 4px 0;font-style:italic`,
      _esc(desc)
    ));
  }

  const lo   = getLoadout(wName);
  const base = WDEFS[wName];
  const eff  = getEffectiveStats(wName, base);

  const statDefs = [
    ['DMG',    eff.dmg ?? base.dmg],
    ['SPREAD', ((eff.spread ?? base.spread ?? 0) * 100).toFixed(1)],
    ['RANGE',  eff.range ?? base.range],
    ['RoF',    (1 / (eff.cd ?? base.cd)).toFixed(1) + '/s'],
    ['AMMO',   base.ammo === Infinity ? '∞' : (eff.startAmmo ?? base.startAmmo)],
    ...(base.speed != null      ? [['SPEED',  eff.speed ?? base.speed]] : []),
    ...(base.reloadTime != null ? [['RELOAD', base.reloadTime.toFixed(1) + 's']] : []),
    ...(base.useHeat            ? [['SYSTEM', 'HEAT']] : []),
  ];
  const sb = _el('div',
    `display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;` +
    `margin-bottom:14px;padding:9px 12px;background:${C.bgMid};border:1.5px solid ${C.border};border-radius:5px`
  );
  statDefs.forEach(([l, v]) => {
    sb.innerHTML += `<div>
      <div style="font-size:11px;color:${C.dim};letter-spacing:1px">${l}</div>
      <div style="font-size:15px;color:${C.accent};font-weight:bold">${v}</div>
    </div>`;
  });
  main.appendChild(sb);

  const slots    = WEAPON_ATTACHMENT_SLOTS[wName] ?? [];
  const specials = WEAPON_SPECIALS[wName]          ?? [];

  const renderGrid = (slotName, available) => {
    if (!available.length) return;
    const section = _el('div','margin-bottom:18px');
    section.appendChild(_el('div',
      `font-size:12px;color:${C.dim};letter-spacing:3px;margin-bottom:8px;` +
      `border-bottom:1px solid ${C.border};padding-bottom:4px;font-weight:bold`,
      slotName.toUpperCase()
    ));
    const grid = _el('div',
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:8px'
    );
    const equipped = lo.attachments[slotName];

    const noneCard = _el('div', _cardBase(!equipped) + ';align-items:center;min-height:42px');
    noneCard.innerHTML = `<span style="font-size:18px;color:${C.dim}">—</span>
      <span style="font-size:12px;color:${C.textDim}">None equipped</span>`;
    noneCard.onclick = () => { setAttachment(wName, slotName, null); applyLoadoutToScene(wName); _renderContent(); };
    grid.appendChild(noneCard);

    available.forEach(attId => {
      const att    = ATTACHMENTS[attId]; if (!att) return;
      const uInfo  = _getUnlockInfo(att.id, wName, 'attachment');
      const isOwned = isAttachmentUnlocked(wName, att.id);
      if (!uInfo.unlockEntry && !isOwned) return;
      const isEquipped = equipped === att.id;
      const isHidden   = uInfo.isSecret && (!uInfo.prog || uInfo.prog.pct < 0.10) && !isOwned;

      if (isHidden) {
        const c = _el('div', _cardBase(false) + ';opacity:0.28');
        c.innerHTML = `<span style="font-size:20px">❓</span>
          <div>
            <div style="font-size:12px;color:${C.dim}">??? Secret Attachment</div>
            <div style="font-size:12px;color:${C.textMuted};margin-top:3px">Keep playing to reveal...</div>
          </div>`;
        grid.appendChild(c); return;
      }

      const c = _el('div', _cardBase(isEquipped) + (isOwned ? '' : ';opacity:0.42'));
      const modStr = att.mods ? Object.entries(att.mods).map(([k, v]) => {
        const col  = v > 0 ? '#4ade80' : v < 0 ? '#f87171' : C.textDim;
        const lbl  = {damage:'DMG',spread:'SPD',range:'RNG',cd:'CD',ammoMult:'AMMO',
                      speed:'PROJ',heatMult:'HEAT',recoilMult:'RECOIL',scavengerBonus:'SCAV'}[k] ?? k.toUpperCase();
        return `<span style="color:${col};font-size:11px;font-weight:bold;background:rgba(0,0,0,.4);
          padding:1px 4px;border-radius:2px;margin-right:3px">${v>0?'+':''}${Math.round(Math.abs(v)*100)}% ${lbl}</span>`;
      }).join('') : '';

      const badges = [
        att.visual?.adsZoom  ? `<span style="font-size:11px;color:#38bdf8;border:1px solid #0e4f6e;padding:1px 3px">ZOOM ×${(1/att.visual.adsZoom).toFixed(1)}</span>` : '',
        att.hasLaser         ? `<span style="font-size:11px;color:#fb923c;border:1px solid #7c3415;padding:1px 3px">LASER</span>` : '',
        uInfo.isSecret && isOwned ? `<span style="font-size:11px;color:${C.accentPurple};border:1px solid #6b21a8;padding:1px 3px">SECRET</span>` : '',
        att.disablesAds      ? `<span style="font-size:11px;color:${C.warn};border:1px solid #7c5a0a;padding:1px 3px">NO ADS</span>` : '',
      ].filter(Boolean).join(' ');

      c.innerHTML = `
        <span style="font-size:22px;flex-shrink:0">${_esc(att.icon)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:bold;color:${isEquipped?C.accentHi:C.text};
               display:flex;align-items:center;flex-wrap:wrap;gap:3px">
            ${_esc(att.name)} ${badges}
          </div>
          <div style="font-size:11px;color:${C.textDim};margin-top:2px;line-height:1.4">${_esc(att.desc)} ${modStr}</div>
          ${isOwned ? '' : _lockHTML(att.id, wName, 'attachment')}
        </div>
        <span style="font-size:15px;color:${isOwned?(isEquipped?C.accentGreen:C.dim):C.danger};margin-left:auto;flex-shrink:0">
          ${isOwned ? (isEquipped ? '✓' : '') : '🔒'}
        </span>`;
      if (isOwned) c.onclick = () => {
        setAttachment(wName, slotName, isEquipped ? null : att.id);
        applyLoadoutToScene(wName); _renderContent();
      };
      grid.appendChild(c);
    });
    section.appendChild(grid);
    main.appendChild(section);
  };

  slots.filter(s => s !== 'special').forEach(slot => {
    const available = Object.values(ATTACHMENTS)
      .filter(a => a.slot === slot && !a.disabled && (
        UNLOCK_TABLE.some(u => u.type === 'attachment' && u.weapon === wName && u.id === a.id) ||
        profile.unlockedAttachments?.[wName]?.includes(a.id)
      ))
      .map(a => a.id);
    renderGrid(slot, available);
  });
  if (specials.length) renderGrid('special', specials);
}

// ── WEAPON SKINS tab ──────────────────────────────────────────
function _renderWeaponSkins(main) {
  if(!document.getElementById('collectorPreviewStyles')){
    const style=document.createElement('style');
    style.id='collectorPreviewStyles';
    style.textContent=`
      @keyframes collectorAurora {0%,100%{filter:hue-rotate(-12deg) brightness(.85)}50%{filter:hue-rotate(38deg) brightness(1.35)}}
      @keyframes collectorNebula {0%,100%{filter:hue-rotate(0deg) brightness(.85)}50%{filter:hue-rotate(90deg) brightness(1.3)}}
      @keyframes collectorCinder {0%,100%{filter:brightness(.75)}45%{filter:brightness(1.55)}70%{filter:brightness(.9)}}
      @keyframes collectorTundra {0%,100%{filter:hue-rotate(-10deg) brightness(1)}50%{filter:hue-rotate(16deg) brightness(1.4)}}
    `;
    document.head.appendChild(style);
  }
  const wName = _activeWeapon;
  const lo    = getLoadout(wName);
  main.appendChild(_weaponLevelBanner(wName));
  main.appendChild(_el('div',`font-size:12px;color:${C.dim};letter-spacing:2px;margin-bottom:12px`,
    `SKINS FOR: ${_esc(WDEFS[wName].name)}`));

  // Collector finishes are granted by weekly quests, not the standard
  // permanent weapon challenge table.
  const availableSkins = Object.values(WEAPON_SKINS).filter(skin =>
      skin.category==='Collector' || skin.category==='Shop' ||
      UNLOCK_TABLE.some(u => u.type === 'weaponSkin' && u.weapon === wName && u.id === skin.id)
  );

  const categories = ['Gameplay', 'Mastery', 'Collector', 'Shop'];
  
  categories.forEach(cat => {
    const skinsInCat = availableSkins.filter(s => s.category === cat);
    if (skinsInCat.length === 0) return;

    // Category Header
    main.appendChild(_el('div', `font-size:13px;color:${C.accentHi};font-weight:bold;margin:16px 0 8px;letter-spacing:2px;border-bottom:1px solid ${C.border};padding-bottom:4px;`, cat.toUpperCase()));

    const grid = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px');
    
    skinsInCat.forEach(skin => {
      const isOwned    = isWeaponSkinUnlocked(wName, skin.id);
      const isEquipped = lo.skin === skin.id;
      const [br,bg,bb] = skin.body; const [ar,ag,ab] = skin.accent;
      const card = _el('div',
        `background:${C.bgCard};border:1.5px solid ${isEquipped?C.accentPurple:C.border};border-radius:6px;` +
        `padding:11px;display:flex;flex-direction:column;gap:5px;cursor:pointer;transition:all .15s${isOwned?'':';opacity:0.42'}`
      );
      const sw = _el('div','display:flex;gap:2px;height:13px;border-radius:2px;overflow:hidden');
      sw.innerHTML = `<div style="flex:2;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div>
        <div style="flex:1;background:rgb(${Math.round(ar*255)},${Math.round(ag*255)},${Math.round(ab*255)})"></div>`;
      if(skin.category==='Collector'){
        sw.style.height='22px';
        sw.style.animation='collector'+skin.id[0].toUpperCase()+skin.id.slice(1)+' 2.7s ease-in-out infinite';
        sw.style.boxShadow='0 0 9px rgba(130,220,255,.35)';
        sw.style.border='1px solid '+C.accent;
      }
      card.appendChild(sw);
      if(skin.category==='Collector')
        card.appendChild(_el('div','font-size:10px;font-weight:bold;color:'+C.accentGreen,'✦ ANIMATED COLLECTOR'));
      card.appendChild(_el('div',`font-size:11px;font-weight:bold;color:${isEquipped?C.accentPurple:C.text}`,_esc(skin.name)));
      card.appendChild(_el('div',`font-size:11px;color:${C.dim}`,_esc(skin.desc)));
      if (!isOwned) {
        const f=_el('div','');
        f.innerHTML=skin.category==='Collector'
          ? '<span style="font-size:11px">🔒 Weekly Collector quest reward</span>'
          :skin.category==='Shop'
          ? '<span style="font-size:11px">🛒 Available in Scraps Shop</span>'
          : _lockHTML(skin.id,wName,'weaponSkin');
        card.appendChild(f);
      }
      else if (isEquipped) card.appendChild(_el('div',`font-size:11px;color:${C.accentGreen}`,'✓ EQUIPPED'));
      if (isOwned) card.onclick = () => { setWeaponSkin(wName, skin.id); applyLoadoutToScene(wName); _renderContent(); };
      grid.appendChild(card);
    });
    main.appendChild(grid);
  });
}

// ── PLAYER SKIN tab ───────────────────────────────────────────
function _renderPlayerSkins(main) {
  main.appendChild(_el('div',`font-size:11px;color:${C.accentPurple};letter-spacing:2px;margin-bottom:14px`,
    'SUIT APPEARANCE — VISIBLE IN MULTIPLAYER'));
  const container = _el('div','display:flex;gap:24px;align-items:flex-start');
  const grid      = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;flex:1');

  const viewer = _el('div',
    `width:180px;background:${C.bgMid};border:1.5px solid ${C.border};border-radius:6px;` +
    `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
    `flex-shrink:0;position:sticky;top:0;padding:18px 0`
  );
  const updateViewer = (skin) => {
    const [br,bg,bb]=skin.body; const [vr,vg,vb]=skin.visor;
    viewer.innerHTML = `
      <div style="font-size:11px;color:${C.dim};margin-bottom:14px;letter-spacing:2px">PREVIEW</div>
      <div style="width:56px;height:56px;background:rgb(${br*255},${bg*255},${bb*255});border-radius:50%;
           position:relative;border:1.5px solid ${C.border};box-shadow:inset -5px -5px 10px rgba(0,0,0,.5)">
        <div style="position:absolute;top:16px;left:7px;right:7px;height:16px;
             background:rgb(${vr*255},${vg*255},${vb*255});border-radius:7px;
             box-shadow:0 0 9px rgb(${vr*255},${vg*255},${vb*255})"></div>
      </div>
      <div style="width:86px;height:76px;background:rgb(${br*255},${bg*255},${bb*255});
           border-radius:13px 13px 3px 3px;margin-top:6px;border:1.5px solid ${C.border};
           box-shadow:inset -6px -6px 12px rgba(0,0,0,.5)"></div>`;
  };
  updateViewer(PLAYER_SKINS[profile.playerSkin] || PLAYER_SKINS.default);

  // Present in expected progression order, with Standard fixed first.
  const unlockRank=skin=>{
    if(skin.id==='default')return 0;
    const u=UNLOCK_TABLE.find(entry=>entry.id===skin.id&&entry.type==='playerSkin');
    return u?.level??(u?.challenge?.conditions?.pvp?250:999);
  };
  const sorted=Object.values(PLAYER_SKINS).sort((a,b)=>
    unlockRank(a)-unlockRank(b)||a.name.localeCompare(b.name));
  sorted.forEach(skin => {
    const isOwned    = isSkinUnlocked(skin.id);
    const isEquipped = profile.playerSkin === skin.id;
    const [br,bg,bb]=skin.body; const [vr,vg,vb]=skin.visor;
    const card = _el('div',
      `background:${C.bgCard};border:1.5px solid ${isEquipped?C.accentPurple:C.border};border-radius:6px;` +
      `padding:11px;display:flex;flex-direction:column;gap:7px;cursor:pointer;transition:all .15s${isOwned?'':';opacity:0.38'}`
    );
    card.onmouseenter = () => updateViewer(skin);
    card.onmouseleave = () => updateViewer(PLAYER_SKINS[profile.playerSkin] || PLAYER_SKINS.default);
    const sw = _el('div','display:flex;gap:3px;height:20px;width:100%;border-radius:2px;overflow:hidden');
    sw.innerHTML = `<div style="flex:3;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div>
      <div style="flex:1;background:rgb(${Math.round(vr*255)},${Math.round(vg*255)},${Math.round(vb*255)})"></div>`;
    card.appendChild(sw);
    card.appendChild(_el('div',`font-size:12px;font-weight:bold;color:${isEquipped?C.accentPurple:C.text}`,_esc(skin.name)));
    if(!isOwned){
      // Player-level progress is already displayed in Progress: don't
      // repeat "Reach Level N (you are X)" plus another bar on every suit.
      const unlock=UNLOCK_TABLE.find(u=>u.id===skin.id&&u.type==='playerSkin');
      const label=['scavenger','reclaimer'].includes(skin.id)?'🛒 Available in Scraps Shop':
        (unlock?.level?'🔒 LOCKED': '🔒 '+(unlock?getUnlockHint(unlock):'Locked'));
      card.appendChild(_el('div','font-size:11px;color:'+C.dim,label));
    }
    else if (isEquipped) card.appendChild(_el('div',`font-size:12px;color:${C.accentGreen};font-weight:bold`,'✓ EQUIPPED'));
    if (isOwned) card.onclick = () => { setPlayerSkin(skin.id); _renderContent(); };
    grid.appendChild(card);
  });
  container.appendChild(grid);
  container.appendChild(viewer);
  main.appendChild(container);
}

// ── PVP LOADOUT tab ──────────────────────────────────────────
function _renderPvpSetup(main){
  main.appendChild(_el('h2','color:'+C.accent+';margin:0 0 12px','PVP MATCH LOADOUT'));
  main.appendChild(_el('p','color:'+C.textDim+';line-height:1.6;max-width:650px',
    'Select two different weapons below. Changes are saved immediately, without leaving Loadout. Configure attachments and skins in their existing tabs. Gun Game ignores this selection.'));
  const usable=Object.keys(WDEFS).filter(id=>isCompetitiveFirearm(id,WDEFS));
  const old=profile.pvpLoadout||{};
  const {primary,secondary}=normalizeCompetitiveLoadout(old,WDEFS);
  const row=_el('div','display:flex;flex-wrap:wrap;gap:18px;margin:18px 0');
  const inputs={};
  function makePicker(slot,value){
    const section=_el('label','display:flex;flex-direction:column;gap:8px;font-size:12px;color:'+C.accentHi,slot.toUpperCase());
    const select=_el('select','background:'+C.bgCard+';color:'+C.text+';padding:12px 14px;border:1px solid '+C.border+';border-radius:4px;font-family:'+F+';min-width:220px');
    for(const id of usable){
      const opt=_el('option','',WDEFS[id].name);
      opt.value=id;
      select.appendChild(opt);
    }
    select.value=value;
    inputs[slot]=select;
    section.appendChild(select);row.appendChild(section);
    select.onchange=()=>{
      const other=slot==='primary'?'secondary':'primary';
      if(select.value===inputs[other].value){
        const replacement=usable.find(id=>id!==select.value);
        inputs[other].value=replacement;
      }
      profile.pvpLoadout={primary:inputs.primary.value,secondary:inputs.secondary.value};
      saveProfile();
      note.textContent='✓ SAVED — '+profile.pvpLoadout.primary+' + '+profile.pvpLoadout.secondary;
    };
  }
  makePicker('primary',primary);
  makePicker('secondary',secondary);
  main.appendChild(row);
  const note=_el('p','font-size:12px;color:'+C.accentGreen,
    '✓ SAVED — '+primary+' + '+secondary);
  main.appendChild(note);
  // Repair old saves containing a missing/duplicate weapon.
  if(old.primary!==primary || old.secondary!==secondary){
    profile.pvpLoadout={primary,secondary};
    saveProfile();
  }
}

// ── PROGRESS tab ──────────────────────────────────────────────
// Add a global tracker for the stats tab
let _statsMapFilter = 'TOTAL';

function _renderProgress(main) {
  const s = profile.stats;

  // Filter buttons come straight from the MAPS registry — add a map there
  // and it shows up here with the correct lowercase id automatically.
  const filterRow = _el('div', 'display:flex; gap:10px; margin-bottom: 15px; flex-wrap:wrap;');
  const filterOptions = [{ id: 'TOTAL', label: 'TOTAL' }, ...Object.values(MAPS).map(m => ({ id: m.id, label: m.name }))];
  filterOptions.forEach(({ id, label }) => {
      const btn = _el('button', `padding: 5px 15px; background: ${_statsMapFilter === id ? C.accent : 'transparent'}; border: 1px solid ${C.accent}; color: ${_statsMapFilter === id ? '#000' : C.accent}; cursor:pointer; font-weight: bold; border-radius: 3px; font-family:${F}`, label);
      btn.onclick = () => { _statsMapFilter = id; _renderContent(); };
      filterRow.appendChild(btn);
  });
  main.appendChild(filterRow);


  // ── PLAYER section ───────────────────────────────────────────
  // Groups: no-weapon challenges + environment kills + player skin challenges
  const playerChallenges = UNLOCK_TABLE.filter(u =>
    u.challenge && (!u.weapon || u.weapon === 'ENVIRONMENT' || u.type === 'playerSkin')
  );
  _renderProgressSection(main, 'PLAYER METRICS', null, playerChallenges, s);

  // ── Per-weapon sections ───────────────────────────────────────
  Object.keys(WDEFS).forEach(wName => {
    const wChallenges = UNLOCK_TABLE.filter(u =>
      u.challenge && (u.weapon === wName || (wName === 'TESLA' && u.weapon === 'TESLA_CHAIN'))
    );
    
    // --- ATTACHMENT MATH ---
    const relevantAtts = UNLOCK_TABLE.filter(u => u.type === 'attachment' && (!u.weapon || u.weapon === wName));
    const totalAtts = relevantAtts.length;
    let unlockedAtts = 0;
    relevantAtts.forEach(u => {
        if (isAttachmentUnlocked(wName, u.id)) unlockedAtts++;
    });

    // --- SKIN MATH ---
    const relevantSkins = UNLOCK_TABLE.filter(u => u.type === 'weaponSkin' && u.weapon === wName);
    const totalSkins = relevantSkins.length;
    let unlockedSkins = 0;
    relevantSkins.forEach(u => {
        if (isWeaponSkinUnlocked(wName, u.id)) unlockedSkins++;
    });
    
    const wxp = profile.stats?.weaponXp?.[wName] || 0;
    const isDiscovered = wxp > 0 || wName === 'PISTOL';
    const title = isDiscovered ? WDEFS[wName].name : '??? (UNDISCOVERED)';
    
    _renderProgressSection(main, title, wName, wChallenges, s, unlockedAtts, totalAtts, unlockedSkins, totalSkins, isDiscovered);
  });
}

// ── Collapsible progress section ─────────────────────────────
function _renderProgressSection(main, title, wName, challenges, s,
    unlockedAtts = 0, totalAtts = 0, unlockedSkins = 0, totalSkins = 0, isDiscovered = true) {
  const key        = wName ?? '__player__';
  const collapsed  = !!_progressCollapsed[key];
    const chalDone = challenges.filter(u => {
    if (u.type === 'attachment' && wName) return isAttachmentUnlocked(wName, u.id);
    if (u.type === 'weaponSkin' && wName) return isWeaponSkinUnlocked(wName, u.id);
    if (u.type === 'playerSkin') return isSkinUnlocked(u.id);
    return getChallengeProgress(u.challenge).pct >= 1;
  }).length;


  const chalTotal  = challenges.length;
  const allDone    = chalDone === chalTotal && chalTotal > 0;

  const wLvData = wName ? getWeaponLevelProgress(wName) : null;

  // Section header
  const header = _el('div',
    `display:flex;align-items:center;gap:9px;margin-top:22px;margin-bottom:${collapsed?'0':'9px'};` +
    `padding:9px 13px;background:${C.bgMid};` +
    `border:1.5px solid ${allDone ? C.accentGreen : C.border};border-radius:6px;` +
    `cursor:pointer;user-select:none`
  );
  header.innerHTML = `
    <span style="font-size:17px">${wName ? _wIcon(wName) : '👤'}</span>
    <span style="font-size:14px;font-weight:bold;letter-spacing:2px;color:${allDone?C.accentGreen:C.text}">${_esc(title)}</span>
    ${wLvData ? `
      <span style="font-size:12px;color:${C.dim};margin-left:2px">LVL</span>
      <span style="font-size:14px;font-weight:bold;color:${wLvData.isMax?C.warn:C.accent}">${wLvData.level}</span>
      <div style="width:50px;height:3px;background:#1a1c2e;border-radius:2px;overflow:hidden">
        <div style="width:${Math.round(wLvData.pct*100)}%;height:100%;background:${wLvData.isMax?C.warn:C.accent}"></div>
      </div>` : ''}
    <div style="display:flex;gap:5px;margin-left:auto;align-items:center;flex-wrap:wrap">
      ${_pill('CHAL', chalDone, chalTotal, allDone ? C.accentGreen : C.accent)}
      ${wName ? _pill('ATT',  unlockedAtts,  totalAtts,
          unlockedAtts  >= totalAtts  && totalAtts  > 0 ? C.accentGreen : C.chalAtt)  : ''}
      ${wName ? _pill('SKIN', unlockedSkins, totalSkins,
          unlockedSkins >= totalSkins && totalSkins > 0 ? C.accentGreen : C.chalSkin) : ''}
    </div>
    <span style="font-size:13px;color:${C.dim};margin-left:6px">${collapsed ? '▶' : '▼'}</span>`;

  header.onclick = () => { _progressCollapsed[key] = !_progressCollapsed[key]; _renderContent(); };
  main.appendChild(header);
  if (collapsed) return;

  // If undiscovered, don't show stats or challenges
  if (!isDiscovered) {
      main.appendChild(_el('div', 
        'padding: 15px; color: #848591; font-size: 12px; font-style: italic;', 
        'Find and use this weapon in the arena to view its stats and challenges.'
      ));
      return; 
  }

  // Stats grid
  if (wName) {
    main.appendChild(_weaponStatsGrid(wName, s));
  } else {
    // Player-level extra stats
    const row = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:7px;margin-bottom:9px');
    [
      ['TOTAL KILLS', _getStat(s, 'totalKills'), C.accent],
      ['TOTAL XP',    profile.totalXp,   C.accentHi], // XP is always global
      ['MAX WAVE',    _getStat(s, 'maxWave'),    C.warn],
      ['BOSS CLEARS', _getStat(s, 'bossWaveClears'), C.warn],
      ['PVP KILLS',   s.pvpKills ?? 0,   C.chalPlayer], // PvP doesn't use map tracking currently
      ['ENV KILLS',   _getStat(s.killsWith, 'ENVIRONMENT'), C.danger],
      ['EMP STUNS',   _getStat(s, 'empStuns'),   C.accentPurple],
    ].forEach(([l,v,col]) => row.appendChild(_statCard(l,v,col)));
    main.appendChild(row);
  }

  // Challenges split by type
  const attChallenges  = challenges.filter(u => u.type === 'attachment');
  const skinChallenges = challenges.filter(u => u.type === 'weaponSkin' || u.type === 'playerSkin');
  const miscChallenges = challenges.filter(u => u.type !== 'attachment' && u.type !== 'weaponSkin' && u.type !== 'playerSkin');

  if (miscChallenges.length) _renderChallengeList(main, null,           miscChallenges, C.chalPlayer);
  if (attChallenges.length)  _renderChallengeList(main, 'ATTACHMENTS',  attChallenges,  C.chalAtt);
  if (skinChallenges.length) _renderChallengeList(main, 'SKINS',        skinChallenges, C.chalSkin);
}

function _getStat(statObj, key) {
    if (!statObj) return 0;
    if (_statsMapFilter === 'TOTAL') return statObj[key] || 0;
    return statObj[`${key}_${_statsMapFilter}`] || 0;
}

// ── Weapon stats grid (always shows all cards, even at 0) ─────
function _weaponStatsGrid(wName, s) {
  const kills      = _getStat(s.killsWith, wName);
  const headshots  = _getStat(s.headshotKills, wName);
  const airKills   = _getStat(s.killsWhileJumping, wName);
  const scopeKills = _getStat(s.killsWhileScoped, wName);
  const dmgDealt   = Math.floor(_getStat(s.damageDealt, wName));
  const bossKills  = _getStat(s.bossKillsWith, wName);
  const multiKills = _getStat(s.multiKillsWith, wName);
  const bareKills  = _getStat(s.killsBareWeapon, wName);
  const fullKills  = _getStat(s.killsFullyEquipped, wName);
  const chainKills = wName === 'TESLA' ? _getStat(s.killsWith, 'TESLA_CHAIN') : null;

  const row = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;margin-bottom:9px');
  [
    ['KILLS',       kills,      C.accent],
    ['HEADSHOTS',   headshots,  C.accentHi],
    ['AIR KILLS',   airKills,   C.chalPlayer],
    ['SCOPE KILLS', scopeKills, C.chalPlayer],
    ['DAMAGE',      dmgDealt,   C.warn],
    ['BOSS KILLS',  bossKills,  C.warn],
    ['MULTI-KILLS', multiKills, C.accentPurple],
    ['BARE KILLS',  bareKills,  C.dim],
    ['FULL KIT',    fullKills,  C.accentGreen],
    ...(chainKills !== null ? [['CHAIN KILLS', chainKills, C.chalPlayer]] : []),
  ].forEach(([l,v,col]) => row.appendChild(_statCard(l,v,col)));
  return row;
}

function _statCard(label, val, col) {
  const d = _el('div',`background:${C.bg};border:1px solid ${C.border};padding:7px 10px;border-radius:4px`);
  d.innerHTML = `<div style="font-size:11px;color:${C.dim};letter-spacing:1px;margin-bottom:2px">${label}</div>
    <div style="font-size:17px;font-weight:bold;color:${col}">${_fmt(val)}</div>`;
  return d;
}

// ── Challenge rows in a 2-col grid ───────────────────────────
function _renderChallengeList(main, subTitle, entries, accentCol) {
  if (!entries.length) return;
  if (subTitle) {
    main.appendChild(_el('div',
      `font-size:11px;letter-spacing:3px;color:${accentCol};margin:9px 0 5px;` +
      `border-left:3px solid ${accentCol};padding-left:7px;font-weight:bold`,
      subTitle
    ));
  }
  const grid = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:5px');
  entries.forEach(u => {
    const prog     = getChallengeProgress(u.challenge);
    const isDone   = prog.pct >= 1;
    const isSecret = !!u.secret;
    const desc = (isSecret && prog.pct < 0.10 && !isDone)
      ? '??? (secret challenge)'
      : getChallengeDescription(u);
    const rewardType = u.type === 'weaponSkin'  ? 'SKIN'
                     : u.type === 'playerSkin'  ? 'SUIT'
                     : 'ATTACHMENT';
    const rewardName = u.id.replace(/_/g,' ').toUpperCase();

    const row = _el('div',
      `display:flex;align-items:center;gap:7px;padding:6px 9px;` +
      `background:${isDone ? '#0b1208' : C.bgCard};` +
      `border:1px solid ${isDone ? '#1a3010' : C.border};border-radius:4px`
    );
    let progressHtml = '';
    
    // If it's a composite challenge, render multiple tracks
    if (prog.subProgresses) {
      progressHtml = prog.subProgresses.map(sp => `
        <div style="text-align:right; width: 100%;">
          <div style="font-size:9px;color:${C.dim};text-transform:uppercase;margin-bottom:2px">${_esc(sp.desc)}</div>
          <div style="font-size:11px;color:${sp.pct>=1?C.accentGreen:accentCol}">${_fmt(sp.val)} / ${_fmt(sp.target)}</div>
          <div style="width:100%;height:3px;background:#1a1c2e;margin-top:2px;border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(sp.pct*100)}%;height:100%;background:${sp.pct>=1?C.accentGreen:accentCol};border-radius:2px"></div>
          </div>
        </div>
      `).join('<div style="height: 6px;"></div>'); // Added a spacer between tracks
    } else {
      // Standard single-track challenge
      progressHtml = `
        <div style="width: 100%; text-align: right;">
          <div style="font-size:12px;color:${isDone?C.accentGreen:accentCol}">${_fmt(prog.val)} / ${_fmt(prog.target)}</div>
          <div style="width:100%;height:3px;background:#1a1c2e;margin-top:3px;border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(prog.pct*100)}%;height:100%;background:${isDone?C.accentGreen:accentCol};border-radius:2px"></div>
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div style="font-size:13px;width:14px;text-align:center;flex-shrink:0;color:${isDone?C.accentGreen:C.textMuted}">${isDone?'✓':'○'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:${isDone?C.textDim:C.text};line-height:1.35;
             white-space:normal; padding-right: 10px;">
          ${_esc(desc)}${isSecret?` <span style="font-size:8px;color:${C.accentPurple}">SECRET</span>`:''}
        </div>
        <div style="font-size:11px;color:${accentCol};margin-top:4px">🎁 ${rewardType}: ${_esc(rewardName)}</div>
      </div>
      <div style="flex-shrink:0; width:90px; display:flex; flex-direction:column; align-items:flex-end; justify-content: center;">
        ${progressHtml}
      </div>`;
    grid.appendChild(row);
  });
  main.appendChild(grid);
}