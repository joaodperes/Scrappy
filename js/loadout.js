// loadout.js – In-game loadout screen: weapon skins, attachments, player appearance
// Self-contained: injects its own DOM panel, no HTML changes required.

import {
  profile, getLoadout, setWeaponSkin, setAttachment, setPlayerSkin,
  ATTACHMENTS, WEAPON_SKINS, PLAYER_SKINS, WEAPON_ATTACHMENT_SLOTS,
  UNLOCK_TABLE, getLevelProgress, getChallengeProgress, getEffectiveStats,
  isAttachmentUnlocked, isWeaponSkinUnlocked, isSkinUnlocked, getUnlockHint,
} from './progression.js';
import { WDEFS } from './weapons.js';
import { applyLoadoutToScene } from './weapons.js';

// ── Panel state ───────────────────────────────────────────────
let _activeWeapon = 'PISTOL';
let _activeTab    = 'attachments';   // 'attachments' | 'skins' | 'player' | 'progress'

// ── Open / close ──────────────────────────────────────────────
export function showLoadout(onClose) {
  document.getElementById('loadoutPanel')?.remove();
  const panel = _buildPanel(onClose);
  document.body.appendChild(panel);
  _renderContent();
}

export function hideLoadout() {
  document.getElementById('loadoutPanel')?.remove();
}

// ── Helpers ───────────────────────────────────────────────────
const CSS = {
  panel: [
    'position:fixed;inset:0;background:#080808;z-index:1050;overflow:hidden',
    'display:flex;flex-direction:column',
    'font-family:"Courier New",monospace;color:#d8f030',
  ].join(';'),
  topBar: [
    'display:flex;align-items:center;justify-content:space-between',
    'padding:12px 20px;border-bottom:1px solid #1e1e1e;flex-shrink:0',
  ].join(';'),
  body: 'display:flex;flex:1;overflow:hidden',
  sidebar: [
    'width:190px;flex-shrink:0;border-right:1px solid #1e1e1e',
    'overflow-y:auto;padding:10px 0',
  ].join(';'),
  main: 'flex:1;overflow-y:auto;padding:16px 20px',
  tabBar: 'display:flex;border-bottom:1px solid #1e1e1e;padding:0 20px;flex-shrink:0',
  btn: (active) => [
    `background:${active ? '#1a2800' : 'transparent'}`,
    `border:none;border-bottom:2px solid ${active ? '#d8f030' : 'transparent'}`,
    'color:#d8f030;padding:9px 14px;cursor:pointer',
    'font-family:"Courier New",monospace;font-size:12px;font-weight:bold;letter-spacing:1px',
  ].join(';'),
  card: (selected) => [
    `background:${selected ? '#1a2800' : '#0d0d0d'}`,
    `border:1px solid ${selected ? '#d8f030' : '#252525'}`,
    'padding:10px 12px;cursor:pointer;margin-bottom:6px',
    'display:flex;align-items:center;gap:10px',
    'transition:border-color .15s',
  ].join(';'),
  lockBadge: 'font-size:10px;color:#557733;margin-left:auto;flex-shrink:0',
  unlockHint: 'font-size:9px;color:#446622;margin-top:3px;font-style:italic',
};

function el(tag, css, html) {
  const d = document.createElement(tag);
  if (css)  d.style.cssText = css;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pctStr(v) { return (v >= 0 ? '+' : '') + Math.round(v * 100) + '%'; }

// ── Panel skeleton ─────────────────────────────────────────────
function _buildPanel(onClose) {
  const panel = el('div', CSS.panel);
  panel.id = 'loadoutPanel';

  // Top bar
  const topBar = el('div', CSS.topBar);
  const { level, xpThisLevel, xpNeeded, pct } = getLevelProgress();

  topBar.innerHTML = `
    <div>
      <span style="font-size:18px;font-weight:bold;letter-spacing:3px">LOADOUT</span>
      <span style="color:#557733;font-size:11px;margin-left:12px">CUSTOMISE YOUR ARSENAL</span>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:bold">LVL ${esc(level)}</div>
      <div style="width:160px;height:5px;background:#1e1e1e;margin:4px 0;position:relative">
        <div style="position:absolute;left:0;top:0;height:100%;width:${Math.round(pct*100)}%;background:#d8f030"></div>
      </div>
      <div style="font-size:10px;color:#557733">${xpThisLevel} / ${xpNeeded} XP</div>
    </div>`;

  const closeBtn = el('button', 'background:transparent;border:1px solid #333;color:#d8f030;padding:8px 16px;cursor:pointer;font-family:inherit;font-size:13px');
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.onclick = () => { hideLoadout(); onClose?.(); };
  topBar.appendChild(closeBtn);
  panel.appendChild(topBar);

  // Tab bar
  const tabs = [
    { id:'attachments', label:'ATTACHMENTS' },
    { id:'skins',       label:'WEAPON SKINS' },
    { id:'player',      label:'PLAYER SKIN' },
    { id:'progress',    label:'PROGRESS' },
  ];
  const tabBar = el('div', CSS.tabBar);
  tabs.forEach(t => {
    const btn = el('button', CSS.btn(_activeTab === t.id), t.label);
    btn.onclick = () => { _activeTab = t.id; _renderContent(); };
    btn.dataset.tabId = t.id;
    tabBar.appendChild(btn);
  });
  panel.appendChild(tabBar);
  panel._tabBar = tabBar;

  // Body
  const body = el('div', CSS.body);
  panel.appendChild(body);

  // Sidebar (weapon list)
  const sidebar = el('div', CSS.sidebar);
  sidebar.id = 'loadoutSidebar';
  const weps = Object.keys(WDEFS);
  weps.forEach(wName => {
    const btn = el('div', CSS.card(wName === _activeWeapon));
    btn.dataset.wName = wName;
    btn.innerHTML = `<span style="font-size:16px">${_wIcon(wName)}</span><span style="font-size:12px">${esc(WDEFS[wName].name)}</span>`;
    btn.onclick = () => { _activeWeapon = wName; _renderContent(); };
    sidebar.appendChild(btn);
  });
  body.appendChild(sidebar);

  // Main content area
  const main = el('div', CSS.main);
  main.id = 'loadoutMain';
  body.appendChild(main);

  panel._body    = body;
  panel._sidebar = sidebar;
  return panel;
}

// ── Render content ─────────────────────────────────────────────
function _renderContent() {
  const panel  = document.getElementById('loadoutPanel');
  if (!panel) return;
  panel._tabBar?.querySelectorAll('button').forEach(btn => {
    btn.style.cssText = CSS.btn(btn.dataset.tabId === _activeTab);
  });

  const sidebar = document.getElementById('loadoutSidebar');
  if (sidebar) sidebar.style.display = (_activeTab === 'player' || _activeTab === 'progress') ? 'none' : 'block';

  sidebar?.querySelectorAll('[data-w-name]').forEach(card => {
    card.style.cssText = CSS.card(card.dataset.wName === _activeWeapon);
  });

  const main = document.getElementById('loadoutMain');
  if (!main) return;
  main.innerHTML = '';

  if      (_activeTab === 'attachments') _renderAttachments(main);
  else if (_activeTab === 'skins')       _renderWeaponSkins(main);
  else if (_activeTab === 'player')      _renderPlayerSkins(main);
  else if (_activeTab === 'progress')    _renderProgress(main);
}

// ── Helper: find unlock info for a given attachment/skin on a weapon ──────────
function _findUnlockEntry(type, id, weapon) {
  if (type === 'attachment') {
    return UNLOCK_TABLE.find(u => u.type === 'attachment' && u.id === id && u.weapon === weapon);
  }
  if (type === 'weaponSkin') {
    return UNLOCK_TABLE.find(u => u.type === 'weaponSkin' && u.id === id && u.weapon === weapon);
  }
  if (type === 'playerSkin') {
    return UNLOCK_TABLE.find(u => u.type === 'playerSkin' && u.id === id);
  }
  return null;
}

// ── Attachments tab ────────────────────────────────────────────
function _renderAttachments(main) {
  const wName   = _activeWeapon;
  const loadout = getLoadout(wName);
  const slots   = WEAPON_ATTACHMENT_SLOTS[wName] ?? [];
  const base    = WDEFS[wName];
  const eff     = getEffectiveStats(wName, base);

  // Stat diff header
  const diffBox = el('div', 'display:flex;gap:24px;margin-bottom:18px;padding:12px 14px;background:#0d0d0d;border:1px solid #1e1e1e;flex-wrap:wrap');
  diffBox.innerHTML = `
    <div><div style="font-size:10px;color:#557733">DAMAGE</div><div style="font-size:16px;color:#d8f030;font-weight:bold">${eff.dmg ?? base.dmg}</div></div>
    <div><div style="font-size:10px;color:#557733">SPREAD</div><div style="font-size:16px;color:#d8f030;font-weight:bold">${((eff.spread ?? base.spread ?? 0) * 100).toFixed(1)}</div></div>
    <div><div style="font-size:10px;color:#557733">RANGE</div><div style="font-size:16px;color:#d8f030;font-weight:bold">${eff.range ?? base.range}</div></div>
    <div><div style="font-size:10px;color:#557733">FIRE RATE</div><div style="font-size:16px;color:#d8f030;font-weight:bold">${(1 / (eff.cd ?? base.cd)).toFixed(1)}/s</div></div>
    <div><div style="font-size:10px;color:#557733">AMMO</div><div style="font-size:16px;color:#d8f030;font-weight:bold">${base.ammo === Infinity ? '∞' : (eff.startAmmo ?? base.startAmmo)}</div></div>`;
  main.appendChild(diffBox);

  if (slots.length === 0) {
    main.appendChild(el('div', 'color:#557733;font-size:13px', 'No attachment slots on this weapon.'));
    return;
  }

  slots.forEach(slot => {
    const section = el('div', 'margin-bottom:20px');
    section.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:8px;border-bottom:1px solid #1e1e1e;padding-bottom:4px', slot.toUpperCase()));

    const equipped = loadout.attachments[slot];

    // "None" option
    const noneCard = el('div', CSS.card(!equipped));
    noneCard.innerHTML = `<span>—</span><span style="font-size:12px;color:#aaa">None</span>`;
    noneCard.onclick = () => { setAttachment(wName, slot, null); applyLoadoutToScene(wName); _renderContent(); };
    section.appendChild(noneCard);

    // Attachments for this slot
    Object.values(ATTACHMENTS).filter(a => a.slot === slot).forEach(att => {
      const isOwned    = isAttachmentUnlocked(wName, att.id);
      const isEquipped = equipped === att.id;

      const card = el('div', CSS.card(isEquipped) + (isOwned ? '' : ';opacity:0.5'));

      // Stat mods display
      const mods = Object.entries(att.mods).map(([k, v]) => {
        const col = v > 0 ? '#66ff66' : v < 0 ? '#ff6666' : '#aaa';
        const label = { damage:'DMG', spread:'SPREAD', range:'RANGE', cd:'CD', ammoMult:'AMMO' }[k] ?? k.toUpperCase();
        const sign  = k === 'spread' || k === 'cd' ? (v > 0 ? '+' : '') : (v > 0 ? '+' : '');
        return `<span style="color:${col};font-size:10px;margin-left:6px">${sign}${Math.round(Math.abs(v)*100)}% ${label}</span>`;
      }).join('');

      // Visual effect badge
      const visualBadge = att.visual ? `<span style="font-size:9px;color:#336655;margin-left:6px;border:1px solid #224433;padding:1px 4px">3D MODEL</span>` : '';
      // ADS zoom badge for sights
      const adsBadge = att.visual?.adsZoom
        ? `<span style="font-size:9px;color:#335566;margin-left:4px;border:1px solid #223344;padding:1px 4px">ADS ${Math.round((1 - att.visual.adsZoom / 1.48) * 100)}% ZOOM</span>`
        : '';

      // Unlock criteria
      const unlockEntry = _findUnlockEntry('attachment', att.id, wName);
      const unlockHint  = unlockEntry ? getUnlockHint(unlockEntry) : '';

      card.innerHTML = `
        <span style="font-size:18px">${esc(att.icon)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:bold;display:flex;align-items:center;flex-wrap:wrap;gap:3px">
            ${esc(att.name)}${visualBadge}${adsBadge}
          </div>
          <div style="font-size:10px;color:#aaa;margin-top:1px">${esc(att.desc)}${mods}</div>
          ${!isOwned && unlockHint ? `<div style="${CSS.unlockHint}">🔒 ${esc(unlockHint)}</div>` : ''}
        </div>
        <span style="${CSS.lockBadge}">${isOwned ? (isEquipped ? '✓ ON' : '') : '🔒'}</span>`;

      if (isOwned) {
        card.onclick = () => {
          setAttachment(wName, slot, isEquipped ? null : att.id);
          applyLoadoutToScene(wName);
          _renderContent();
        };
      }
      section.appendChild(card);
    });

    main.appendChild(section);
  });
}

// ── Weapon skins tab ───────────────────────────────────────────
function _renderWeaponSkins(main) {
  const wName   = _activeWeapon;
  const loadout = getLoadout(wName);

  main.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:14px',
    `SKINS FOR: ${esc(WDEFS[wName].name)} — unlocks are per-weapon`));

  const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px');

  Object.values(WEAPON_SKINS).forEach(skin => {
    const isOwned    = isWeaponSkinUnlocked(wName, skin.id);
    const isEquipped = loadout.skin === skin.id;
    const [br, bg, bb] = skin.body;
    const [ar, ag, ab] = skin.accent;

    const card = el('div', CSS.card(isEquipped) + ';flex-direction:column;gap:6px' + (isOwned ? '' : ';opacity:0.45'));

    // Colour preview swatch
    const swatch = el('div', 'display:flex;gap:4px;height:20px');
    swatch.innerHTML = `
      <div style="flex:2;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div>
      <div style="flex:1;background:rgb(${Math.round(ar*255)},${Math.round(ag*255)},${Math.round(ab*255)})"></div>`;

    card.appendChild(swatch);
    card.appendChild(el('div', 'font-size:13px;font-weight:bold', esc(skin.name)));
    card.appendChild(el('div', 'font-size:10px;color:#aaa', esc(skin.desc)));

    if (!isOwned) {
      // Find unlock entry for this skin on this weapon
      const unlockEntry = _findUnlockEntry('weaponSkin', skin.id, wName);
      const hint = unlockEntry ? getUnlockHint(unlockEntry) : '';
      card.appendChild(el('div', CSS.unlockHint, hint ? `🔒 ${esc(hint)}` : '🔒 Locked'));
    } else if (isEquipped) {
      card.appendChild(el('div', 'font-size:10px;color:#d8f030', '✓ EQUIPPED'));
    }

    if (isOwned) {
      card.onclick = () => {
        setWeaponSkin(wName, skin.id);
        applyLoadoutToScene(wName);
        _renderContent();
      };
    }
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

// ── Player skins tab ───────────────────────────────────────────
function _renderPlayerSkins(main) {
  main.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:14px', 'SUIT APPEARANCE — VISIBLE IN MULTIPLAYER'));

  const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px');

  Object.values(PLAYER_SKINS).forEach(skin => {
    const isOwned    = isSkinUnlocked(skin.id);
    const isEquipped = profile.playerSkin === skin.id;
    const [br, bg, bb] = skin.body;
    const [vr, vg, vb] = skin.visor;

    const card = el('div', CSS.card(isEquipped) + ';flex-direction:column;gap:6px' + (isOwned ? '' : ';opacity:0.45'));

    const swatch = el('div', 'display:flex;gap:4px;height:24px');
    swatch.innerHTML = `
      <div style="flex:3;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div>
      <div style="flex:1;background:rgb(${Math.round(vr*255)},${Math.round(vg*255)},${Math.round(vb*255)})"></div>`;

    card.appendChild(swatch);
    card.appendChild(el('div', 'font-size:13px;font-weight:bold', esc(skin.name)));

    if (!isOwned) {
      const unlockEntry = _findUnlockEntry('playerSkin', skin.id, null);
      const hint = unlockEntry ? getUnlockHint(unlockEntry) : '';
      card.appendChild(el('div', CSS.unlockHint, hint ? `🔒 ${esc(hint)}` : '🔒 Locked'));
    } else if (isEquipped) {
      card.appendChild(el('div', 'font-size:10px;color:#d8f030', '✓ EQUIPPED'));
    }

    if (isOwned) card.onclick = () => { setPlayerSkin(skin.id); _renderContent(); };
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

// ── Progress tab ───────────────────────────────────────────────
function _renderProgress(main) {
  const s = profile.stats;

  // Overall stats
  const statBox = el('div', 'display:flex;flex-wrap:wrap;gap:18px;margin-bottom:24px;padding:14px;background:#0d0d0d;border:1px solid #1e1e1e');
  [
    ['TOTAL KILLS', s.totalKills ?? 0],
    ['PVP KILLS',   s.pvpKills   ?? 0],
    ['MAX WAVE',    s.maxWave    ?? 0],
    ['BOSS CLEARS', s.bossWaveClears ?? 0],
    ['LEVEL',       profile.level],
    ['TOTAL XP',    profile.totalXp],
  ].forEach(([label, val]) => {
    statBox.innerHTML += `<div><div style="font-size:10px;color:#557733;letter-spacing:2px">${esc(label)}</div>
      <div style="font-size:22px;font-weight:bold;color:#d8f030">${val}</div></div>`;
  });
  main.appendChild(statBox);

  // Weapon kills breakdown
  main.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin:14px 0 8px', 'KILLS BY WEAPON'));
  const wGrid = el('div', 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px');
  Object.keys(WDEFS).forEach(wName => {
    const k = s.killsWith?.[wName] ?? 0;
    wGrid.innerHTML += `<div style="background:#0d0d0d;border:1px solid #1e1e1e;padding:8px 14px;min-width:90px">
      <div style="font-size:10px;color:#557733">${esc(WDEFS[wName].name)}</div>
      <div style="font-size:18px;font-weight:bold;color:#d8f030">${k}</div>
    </div>`;
  });
  main.appendChild(wGrid);

  // Challenges — deduplicated by desc so same challenge doesn't appear N times for N weapons
  main.appendChild(el('div', 'font-size:11px;color:#557733;letter-spacing:2px;margin:14px 0 8px', 'CHALLENGES'));
  const seen = new Set();
  UNLOCK_TABLE.filter(u => u.challenge).forEach(u => {
    const key = u.challenge.desc;
    if (seen.has(key)) return;
    seen.add(key);

    const prog = getChallengeProgress(u.challenge);
    const isUnlocked = u.type === 'attachment'
      ? isAttachmentUnlocked(u.weapon, u.id)
      : u.type === 'weaponSkin'
        ? isWeaponSkinUnlocked(u.weapon ?? 'PISTOL', u.id)
        : isSkinUnlocked(u.id);
    const done = prog.pct >= 1;

    const rewardLabel = u.type === 'weaponSkin'
      ? `${u.id.replace(/_/g,' ').toUpperCase()} skin (${u.weapon ?? 'all'})`
      : u.type === 'playerSkin'
        ? `${u.id.replace(/_/g,' ').toUpperCase()} suit`
        : `${u.id.replace(/_/g,' ').toUpperCase()} (${u.weapon})`;

    const row = el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:8px 12px;background:#0d0d0d;border:1px solid #1e1e1e');
    row.innerHTML = `
      <div style="flex:1">
        <div style="font-size:12px;${done ? 'color:#557733' : 'color:#d8f030'}">${done ? '✓ ' : ''}${esc(u.challenge.desc)}</div>
        <div style="font-size:10px;color:#557733">Reward: ${esc(rewardLabel)}</div>
      </div>
      <div style="text-align:right;min-width:80px">
        <div style="font-size:11px;color:#d8f030">${prog.val} / ${prog.target}</div>
        <div style="width:80px;height:4px;background:#1e1e1e;margin-top:4px">
          <div style="width:${Math.round(prog.pct*100)}%;height:100%;background:${done ? '#557733' : '#d8f030'}"></div>
        </div>
      </div>`;
    main.appendChild(row);
  });
}

// ── Weapon icon helper ─────────────────────────────────────────
function _wIcon(w) {
  return {PISTOL:'🔫',SMG:'⚡',SHOTGUN:'💥',CHAINGUN:'🌀',RAILGUN:'⚡',PLASMA:'🔵',ROCKET:'🚀',GLAUNCHER:'💣'}[w] ?? '🔫';
}
