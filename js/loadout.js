// loadout.js – In-game loadout screen
import {
  profile, getLoadout, setWeaponSkin, setAttachment, setPlayerSkin,
  ATTACHMENTS, WEAPON_SKINS, PLAYER_SKINS, WEAPON_ATTACHMENT_SLOTS, WEAPON_SPECIALS,
  UNLOCK_TABLE, getLevelProgress, getChallengeProgress, getEffectiveStats,
  isAttachmentUnlocked, isWeaponSkinUnlocked, isSkinUnlocked, getUnlockHint, getChallengeDescription,
  SKIN_DIFFICULTY_ORDER, getWeaponLevelProgress, saveProfile,
} from './progression.js';
import { WDEFS, applyLoadoutToScene } from './weapons.js';

let _activeWeapon = 'PISTOL';
let _activeTab    = 'attachments';

export function showLoadout(onClose) {
  document.getElementById('loadoutPanel')?.remove();
  document.body.appendChild(_buildPanel(onClose));
  _renderContent();
}
export function hideLoadout() { document.getElementById('loadoutPanel')?.remove(); }

// ── Shared styles ─────────────────────────────────────────────
const F = '"Courier New",monospace';
const CSS = {
  panel: `position:fixed;inset:0;background:#0a0b10;z-index:1050;overflow:hidden;display:flex;flex-direction:column;font-family:${F};color:#ffffff`,
  topBar:`display:flex;align-items:center;justify-content:space-between;padding:20px 32px;background:#10121a;border-bottom:2px solid #2a2e3d;flex-shrink:0`,
  tabBar:`display:flex;background:#10121a;border-bottom:2px solid #2a2e3d;padding:0 32px;flex-shrink:0`,
  body:  `display:flex;flex:1;overflow:hidden`,
  sidebar:`width:260px;flex-shrink:0;background:#14161f;border-right:2px solid #2a2e3d;overflow-y:auto;padding:16px 0`,
  main:  `flex:1;overflow-y:auto;padding:32px 48px`,
  tab:   (a) => `background:${a?'#1e2436':'transparent'};border:none;border-bottom:4px solid ${a?'#00e5ff':'transparent'};color:${a?'#ffffff':'#8c9ab3'};padding:18px 24px;cursor:pointer;font-family:${F};font-size:20px;font-weight:bold;letter-spacing:1.5px;transition:all 0.15s`,
  wcard: (s) => `background:${s?'#1e2436':'transparent'};border-left:6px solid ${s?'#00e5ff':'transparent'};padding:18px 24px;cursor:pointer;display:flex;align-items:center;gap:18px;font-size:20px;color:${s?'#ffffff':'#8c9ab3'};transition:background 0.1s`,
  card:  (s) => `background:#181b26;border:2px solid ${s?'#00e5ff':'#2a2e3d'};border-radius:6px;padding:16px 20px;cursor:pointer;display:flex;align-items:flex-start;gap:16px;transition:all .15s`,
  hint:  `font-size:16px;color:#a0aabf;margin-top:8px;font-style:italic`,
  lock:  `font-size:20px;color:#ff4d4d;margin-left:auto;flex-shrink:0;font-weight:bold`,
};

function _el(tag, css, html) {
  const d = document.createElement(tag);
  if (css)  d.style.cssText = css;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
function _esc(s) { return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── Progress bar HTML helper ───────────────────────────────────
function _progressBar(pct, val, target, col = '#d8f030') {
  const w = Math.round(Math.min(1, pct) * 100);
  return `
    <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
      <div style="flex:1;height:3px;background:#1e1e1e;border-radius:2px;overflow:hidden">
        <div style="width:${w}%;height:100%;background:${col};border-radius:2px"></div>
      </div>
      <span style="font-size:16px;color:${col};min-width:42px;text-align:right">${val} / ${target}</span>
    </div>`;
}

// ── Panel skeleton ────────────────────────────────────────────
function _buildPanel(onClose) {
  const panel = _el('div', CSS.panel); panel.id = 'loadoutPanel';

  const topBar = _el('div', CSS.topBar);
  const { level, xpThisLevel, xpNeeded, pct } = getLevelProgress();
  topBar.innerHTML = `
    <div>
      <span style="font-size:20px;font-weight:bold;letter-spacing:3px">LOADOUT</span>
      <span style="color:#557733;font-size:16px;margin-left:10px">CUSTOMISE YOUR ARSENAL</span>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:bold">LVL ${level}</div>
      <div style="width:150px;height:4px;background:#1e1e1e;margin:3px 0;position:relative">
        <div style="position:absolute;left:0;top:0;height:100%;width:${Math.round(pct*100)}%;background:#d8f030"></div>
      </div>
      <div style="font-size:16px;color:#557733">${xpThisLevel} / ${xpNeeded} XP</div>
    </div>`;
  const closeBtn = _el('button','background:transparent;border:1px solid #333;color:#d8f030;padding:7px 14px;cursor:pointer;font-family:inherit;font-size:12px');
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.onclick = () => { saveProfile();hideLoadout(); onClose?.(); };
  topBar.appendChild(closeBtn);
  panel.appendChild(topBar);

  const tabs = [{ id:'attachments',label:'ATTACHMENTS' },{ id:'skins',label:'WEAPON SKINS' },{ id:'player',label:'PLAYER SKIN' },{ id:'progress',label:'PROGRESS' }];
  const tabBar = _el('div', CSS.tabBar);
  tabs.forEach(t => {
    const b = _el('button', CSS.tab(_activeTab===t.id), t.label);
    b.dataset.tabId = t.id;
    b.onclick = () => { _activeTab = t.id; _renderContent(); };
    tabBar.appendChild(b);
  });
  panel._tabBar = tabBar;
  panel.appendChild(tabBar);

  const body = _el('div', CSS.body);
  const sidebar = _el('div', CSS.sidebar); sidebar.id = 'loadoutSidebar';
  Object.keys(WDEFS).forEach(wName => {
    const btn = _el('div', CSS.wcard(wName===_activeWeapon));
    btn.dataset.wName = wName;
    btn.innerHTML = `<span style="font-size:18px">${_wIcon(wName)}</span><span style="font-size:18px">${_esc(WDEFS[wName].name)}</span>`;
    btn.onclick = () => { _activeWeapon = wName; _renderContent(); };
    sidebar.appendChild(btn);
  });
  body.appendChild(sidebar);
  const main = _el('div', CSS.main); main.id = 'loadoutMain';
  body.appendChild(main);
  panel.appendChild(body);
  return panel;
}

function _renderContent() {
  const panel = document.getElementById('loadoutPanel'); if (!panel) return;
  panel._tabBar?.querySelectorAll('button').forEach(b => { b.style.cssText = CSS.tab(b.dataset.tabId===_activeTab); });
  const sidebar = document.getElementById('loadoutSidebar');
  if (sidebar) sidebar.style.display = (_activeTab==='player'||_activeTab==='progress') ? 'none' : 'block';
  sidebar?.querySelectorAll('[data-w-name]').forEach(c => { c.style.cssText = CSS.wcard(c.dataset.wName===_activeWeapon); });
  const main = document.getElementById('loadoutMain'); if (!main) return;
  main.innerHTML = '';
  if      (_activeTab==='attachments') _renderAttachments(main);
  else if (_activeTab==='skins')       _renderWeaponSkins(main);
  else if (_activeTab==='player')      _renderPlayerSkins(main);
  else if (_activeTab==='progress')    _renderProgress(main);
}

function _renderWeaponLevelBanner(main, wName) {
  const { level, xpThisLevel, xpNeeded, pct, isMax } = getWeaponLevelProgress(wName);
  const pctW = Math.round(pct * 100);
  const bar = _el('div', 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0d0f18;border:1px solid #2a2e3d;margin-bottom:14px;gap:16px');
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
      <div style="font-size:11px;color:#557733;letter-spacing:2px">WEAPON LVL</div>
      <div style="font-size:26px;font-weight:bold;color:${isMax?'#d8a030':'#d8f030'}">${level}</div>
      ${isMax ? '<div style="font-size:11px;color:#d8a030;letter-spacing:1px;padding:2px 6px;border:1px solid #a07020">PRESTIGE</div>' : ''}
    </div>
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;height:5px;background:#1a1a2a;border-radius:3px;overflow:hidden">
          <div style="width:${pctW}%;height:100%;background:${isMax?'#d8a030':'#d8f030'};border-radius:3px;transition:width .3s"></div>
        </div>
        <span style="font-size:13px;color:#d8f030;min-width:80px;text-align:right">
          ${isMax ? 'MAX' : `${xpThisLevel} / ${xpNeeded} XP`}
        </span>
      </div>
      ${isMax ? '' : `<div style="font-size:11px;color:#445533;margin-top:2px">Next level in ${xpNeeded - xpThisLevel} XP</div>`}
    </div>`;
  main.appendChild(bar);
}

// ── Unlock info helper ─────────────────────────────────────────
// Returns { isSecret, isChallenge, isLevel, prog, unlockEntry }
function _getUnlockInfo(attId, wName, type) {
  const u = UNLOCK_TABLE.find(e =>
    e.type === type && e.id === attId && (wName ? e.weapon === wName : !e.weapon)
  );
  if (!u) return { isSecret:false, isChallenge:false, isLevel:false, prog:null, unlockEntry:null };
  const isSecret    = !!u.secret;
  const isChallenge = !!u.challenge;
  const isLevel     = !!u.level && !u.challenge;
  const prog        = isChallenge ? getChallengeProgress(u.challenge) : null;
  return { isSecret, isChallenge, isLevel, prog, unlockEntry:u };
}

// ── Lock display inside a card ─────────────────────────────────
// Returns an HTML string for the "locked" footer of a card.
function _lockDisplay(attId, wName, type) {
  const { isSecret, isChallenge, isLevel, prog, unlockEntry } = _getUnlockInfo(attId, wName, type);
  if (!unlockEntry) return `<div style="${CSS.hint}">🔒 Locked</div>`;
  const { level } = getLevelProgress();

  if (isSecret) {
    const partiallyRevealed = prog && prog.pct >= 0.10;
    if (!partiallyRevealed) {
      return `<div style="${CSS.hint};color:#77aa44">🔒 ??? SECRET ACHIEVEMENT<br>Keep playing to discover this unlock...</div>`;
    }
    return `
      <div style="${CSS.hint};color:#a0ff60">🔒 SECRET: ${_esc(getChallengeDescription(unlockEntry))}</div>
      ${_progressBar(prog.pct, prog.val, prog.target, '#d8a030')}`;
  }

  if (isChallenge && prog) {
    return `
      <div style="${CSS.hint}">🔒 ${_esc(getChallengeDescription(unlockEntry))}</div>
      ${_progressBar(prog.pct, prog.val, prog.target)}`;
  }

  if (isLevel) {
    const lv = unlockEntry.level;
    const lvPct = Math.min(1, level / lv);
    return `
      <div style="${CSS.hint}">🔒 Reach Level ${lv} (you are ${level})</div>
      ${_progressBar(lvPct, level, lv, '#7788ff')}`;
  }

  return `<div style="${CSS.hint}">🔒 ${_esc(getUnlockHint(unlockEntry))}</div>`;
}

// ── Attachments ───────────────────────────────────────────────
function _renderAttachments(main) {
  const wName = _activeWeapon;
  _renderWeaponLevelBanner(main, wName);
  const lo    = getLoadout(wName);
  const base  = WDEFS[wName];
  const eff   = getEffectiveStats(wName, base);

  // Stat bar
  const sb = _el('div','display:flex;gap:18px;margin-bottom:14px;padding:10px 12px;background:#0a0a0a;border:1px solid #1e1e1e;flex-wrap:wrap');
  const statRows = [
    ['DMG',    eff.dmg ?? base.dmg],
    ['SPREAD', ((eff.spread ?? base.spread ?? 0) * 100).toFixed(1)],
    ['RANGE',  eff.range ?? base.range],
    ['RoF',    (1 / (eff.cd ?? base.cd)).toFixed(1) + '/s'],
    ['AMMO',   base.ammo === Infinity ? '∞' : (eff.startAmmo ?? base.startAmmo)],
  ];
  if (base.speed != null) statRows.push(['SPD', eff.speed ?? base.speed]);
  if (base.reloadTime != null) statRows.push(['RELOAD', base.reloadTime.toFixed(1) + 's']);
  else if (base.useHeat)       statRows.push(['RELOAD', '— HEAT']);
  statRows.forEach(([l,v])=>{
    sb.innerHTML += `<div><div style="font-size:14px;color:#557733">${l}</div><div style="font-size:18px;color:#d8f030;font-weight:bold">${v}</div></div>`;
  });
  main.appendChild(sb);

  const slots    = WEAPON_ATTACHMENT_SLOTS[wName] ?? [];
  const specials = WEAPON_SPECIALS[wName] ?? [];

  const regularSlots = slots.filter(s => s !== 'special');
  
  // ── Helper to render a grid of attachments (Used for both Regular & Special) ──
  const renderAttachmentGrid = (slotName, availableAttachments, isSpecial = false) => {
      const section = _el('div','margin-bottom:24px');
      section.appendChild(_el('div','font-size:20px;color:#557733;letter-spacing:2px;margin-bottom:10px;border-bottom:1px solid #1a1a1a;padding-bottom:5px;font-weight:bold', slotName.toUpperCase()));

      const grid = _el('div','display:grid;grid-template-columns:1fr 1fr;gap:10px');

      const equipped = lo.attachments[slotName];
      const noneCard = _el('div', CSS.card(!equipped) + ';min-height:54px;align-items:center');
      noneCard.innerHTML = `<span style="font-size:24px">—</span><span style="font-size:16px;color:#777">None</span>`;
      noneCard.onclick = () => { setAttachment(wName, slotName, null); applyLoadoutToScene(wName); _renderContent(); };
      grid.appendChild(noneCard);

      availableAttachments.forEach(attId => {
        const att = ATTACHMENTS[attId]; if (!att) return;
        const uInfo = _getUnlockInfo(att.id, wName, 'attachment');
        const isOwned = isAttachmentUnlocked(wName, att.id);
        
        if (!uInfo.unlockEntry && !isOwned) return;
        const isEquipped = equipped === att.id;

        const { isSecret, prog: secretProg } = _getUnlockInfo(att.id, wName, 'attachment');
        const isHidden = isSecret && (!secretProg || secretProg.pct < 0.10) && !isOwned;

        if (isHidden) {
          const card = _el('div', CSS.card(false) + ';opacity:0.35');
          card.innerHTML = `
            <span style="font-size:28px">❓</span>
            <div style="flex:1">
              <div style="font-size:16px;color:#44aa33;font-weight:bold">??? Secret ${isSpecial ? 'Special' : 'Attachment'}</div>
              <div style="font-size:13px;color:#555;margin-top:4px">Keep playing to reveal...</div>
            </div>`;
          grid.appendChild(card);
          return;
        }

        const card = _el('div', CSS.card(isEquipped) + (isOwned ? '' : ';opacity:0.5'));

        const mods = att.mods ? Object.entries(att.mods).map(([k,v]) => {
            const col = v>0 ? '#66ff66' : v<0 ? '#ff6666' : '#aaa';
            const lbl = {damage:'DMG',spread:'SPD',range:'RNG',cd:'CD',ammoMult:'AMMO',speed:'PROJ SPD',heatMult:'HEAT',recoilMult:'RECOIL'}[k]??k.toUpperCase();
            return `<span style="color:${col};font-size:12px;font-weight:bold;margin-right:8px;display:inline-block;background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px">${v>0?'+':''}${Math.round(Math.abs(v)*100)}% ${lbl}</span>`;
        }).join('') : '';

        const adsBadge = att.visual?.adsZoom ? `<span style="font-size:11px;color:#338866;border:1px solid #225544;padding:2px 4px;margin-left:5px">ZOOM x${(1/att.visual.adsZoom).toFixed(1)}</span>` : '';
        const laserBadge = att.hasLaser ? `<span style="font-size:11px;color:#aa4433;border:1px solid #772211;padding:2px 4px;margin-left:5px">LASER</span>` : '';
        const secretBadge = isSecret && isOwned ? `<span style="font-size:11px;color:#aa44dd;border:1px solid #662288;padding:2px 4px;margin-left:5px">SECRET</span>` : '';
        const noAdsBadge = att.disablesAds ? `<span style="font-size:11px;color:#aa8833;border:1px solid #775511;padding:2px 4px;margin-left:5px">NO ADS</span>` : '';

        let footerHtml = '';
        if (!isOwned) footerHtml = _lockDisplay(att.id, wName, 'attachment');

        card.innerHTML = `
          <span style="font-size:28px;flex-shrink:0">${_esc(att.icon)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:18px;font-weight:bold;display:flex;align-items:center;flex-wrap:wrap;gap:4px">
              ${_esc(att.name)}${adsBadge}${laserBadge}${secretBadge}${noAdsBadge}
            </div>
            <div style="font-size:14px;color:#aaa;margin-top:4px;line-height:1.3">${_esc(att.desc)}${mods}</div>
            ${footerHtml}
          </div>
          <span style="${CSS.lock}">${isOwned?(isEquipped?'✓':''):'🔒'}</span>`;

        if (isOwned) card.onclick = () => { setAttachment(wName, slotName, isEquipped ? null : att.id); applyLoadoutToScene(wName); _renderContent(); };
        grid.appendChild(card);
      });
      
      section.appendChild(grid);
      main.appendChild(section);
  };

  // Render Regular Slots
  regularSlots.forEach(slot => {
      const available = Object.values(ATTACHMENTS).filter(a => a.slot === slot && !a.disabled).map(a => a.id);
      renderAttachmentGrid(slot, available, false);
  });

  // Render Special Slot (Now perfectly matches regular slots!)
  if (specials.length > 0) {
      renderAttachmentGrid('special', specials, true);
  }
}
// ── Weapon skins ──────────────────────────────────────────────
function _renderWeaponSkins(main) {
  const wName = _activeWeapon;
  const lo    = getLoadout(wName);
  main.appendChild(_el('div','font-size:10px;color:#557733;letter-spacing:2px;margin-bottom:12px',`SKINS FOR: ${_esc(WDEFS[wName].name)}`));
  const grid = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px');
  const sortedSkins = Object.values(WEAPON_SKINS).sort((a, b) => {
    const iA = SKIN_DIFFICULTY_ORDER.indexOf(a.id);
    const iB = SKIN_DIFFICULTY_ORDER.indexOf(b.id);
    return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
  });
  _renderWeaponLevelBanner(main, wName);
  sortedSkins.forEach(skin => {
    const isOwned    = isWeaponSkinUnlocked(wName, skin.id);
    const isEquipped = lo.skin === skin.id;
    const [br,bg,bb] = skin.body; const [ar,ag,ab] = skin.accent;
    const card = _el('div', CSS.card(isEquipped)+';flex-direction:column;gap:5px'+(isOwned?'':';opacity:0.5'));
    const sw = _el('div','display:flex;gap:3px;height:18px');
    sw.innerHTML=`<div style="flex:2;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div><div style="flex:1;background:rgb(${Math.round(ar*255)},${Math.round(ag*255)},${Math.round(ab*255)})"></div>`;
    card.appendChild(sw);
    card.appendChild(_el('div','font-size:12px;font-weight:bold',_esc(skin.name)));
    card.appendChild(_el('div','font-size:9px;color:#888',_esc(skin.desc)));
    if (!isOwned) {
      const footer = _el('div', '');
      footer.innerHTML = _lockDisplay(skin.id, wName, 'weaponSkin');
      card.appendChild(footer);
    } else if (isEquipped) {
      card.appendChild(_el('div','font-size:9px;color:#d8f030','✓ EQUIPPED'));
    }
    if (isOwned) card.onclick = () => { setWeaponSkin(wName,skin.id); applyLoadoutToScene(wName); _renderContent(); };
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

// ── Player skins ──────────────────────────────────────────────
function _renderPlayerSkins(main) {
  main.appendChild(_el('div','font-size:14px;color:#a0ff60;letter-spacing:2px;margin-bottom:16px','SUIT APPEARANCE — VISIBLE IN MULTIPLAYER'));
  
  const container = _el('div', 'display:flex; gap:32px; align-items:flex-start;');
  const grid = _el('div','display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px; flex:1;');
  
  // 2D Character Viewer Panel
  const viewer = _el('div', 'width:200px; height:280px; background:#050505; border:1px solid #333; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; position:sticky; top:0;');
  
  const updateViewer = (skin) => {
      const [br,bg,bb]=skin.body; const [vr,vg,vb]=skin.visor;
      const bColor = `rgb(${br*255},${bg*255},${bb*255})`;
      const vColor = `rgb(${vr*255},${vg*255},${vb*255})`;
      viewer.innerHTML = `
          <div style="font-size:16px; color:#ffffff; margin-bottom:20px; font-weight:bold; letter-spacing:2px">PREVIEW</div>
          <div style="width:70px; height:70px; background:${bColor}; border-radius:50%; position:relative; border:2px solid #222; box-shadow: inset -6px -6px 12px rgba(0,0,0,0.6);">
              <div style="position:absolute; top:20px; left:10px; right:10px; height:22px; background:${vColor}; border-radius:10px; box-shadow: 0 0 12px ${vColor};"></div>
          </div>
          <div style="width:100px; height:90px; background:${bColor}; border-radius:16px 16px 4px 4px; margin-top:8px; border:2px solid #222; box-shadow: inset -8px -8px 16px rgba(0,0,0,0.6);"></div>
      `;
  };

  updateViewer(PLAYER_SKINS[profile.playerSkin] || PLAYER_SKINS.default);

  // Sort skins linearly by Level Requirement
  const sortedSkins = Object.values(PLAYER_SKINS).sort((a, b) => {
    const uA = UNLOCK_TABLE.find(u => u.id === a.id && u.type === 'playerSkin');
    const uB = UNLOCK_TABLE.find(u => u.id === b.id && u.type === 'playerSkin');
    return (uA?.level || 999) - (uB?.level || 999);
  });

  sortedSkins.forEach(skin => {
    const isOwned    = isSkinUnlocked(skin.id);
    const isEquipped = profile.playerSkin === skin.id;
    const [br,bg,bb]=skin.body; const [vr,vg,vb]=skin.visor;
    
    const card = _el('div',CSS.card(isEquipped)+';flex-direction:column;gap:8px'+(isOwned?'':';opacity:0.4'));
    
    card.onmouseenter = () => updateViewer(skin);
    card.onmouseleave = () => updateViewer(PLAYER_SKINS[profile.playerSkin] || PLAYER_SKINS.default);
    
    const sw = _el('div','display:flex;gap:4px;height:28px;width:100%');
    sw.innerHTML=`<div style="flex:3;background:rgb(${Math.round(br*255)},${Math.round(bg*255)},${Math.round(bb*255)})"></div><div style="flex:1;background:rgb(${Math.round(vr*255)},${Math.round(vg*255)},${Math.round(vb*255)})"></div>`;
    card.appendChild(sw);
    card.appendChild(_el('div','font-size:16px;font-weight:bold',_esc(skin.name)));
    
    if (!isOwned) {
      const footer = _el('div', '');
      footer.innerHTML = _lockDisplay(skin.id, null, 'playerSkin');
      card.appendChild(footer);
    } else if (isEquipped) {
      card.appendChild(_el('div','font-size:14px;color:#a0ff60;font-weight:bold;','✓ EQUIPPED'));
    }
    
    if (isOwned) { card.onclick = () => { setPlayerSkin(skin.id); _renderContent(); }; }
    grid.appendChild(card);
  });
  
  container.appendChild(grid);
  container.appendChild(viewer);
  main.appendChild(container);
}

// ── Progress ──────────────────────────────────────────────────
function _renderProgress(main) {
  const s = profile.stats;
  const sb = _el('div','display:flex;flex-wrap:wrap;gap:24px;margin-bottom:32px;padding:20px;background:#181b26;border:2px solid #2a2e3d;border-radius:6px');
  [['TOTAL KILLS',s.totalKills??0],['PVP KILLS',s.pvpKills??0],['MAX WAVE',s.maxWave??0],['BOSS CLEARS',s.bossWaveClears??0],['LEVEL',profile.level],['TOTAL XP',profile.totalXp]].forEach(([l,v])=>{
    sb.innerHTML+=`<div><div style="font-size:14px;color:#00e5ff;letter-spacing:2px;font-weight:bold">${l}</div><div style="font-size:32px;font-weight:bold;color:#ffffff;margin-top:4px">${v}</div></div>`;
  });
  main.appendChild(sb);

  main.appendChild(_el('div','font-size:10px;color:#557733;letter-spacing:2px;margin:12px 0 6px','KILLS BY WEAPON'));
  const wg = _el('div','display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px');
  Object.keys(WDEFS).forEach(w=>{
    const k=s.killsWith?.[w]??0;
    const ep=s.energyPickups?.[w]??0;
    const bk=s.bossKillsWith?.[w]??0;
    const epLine = ep > 0 ? `<div style="font-size:8px;color:#00ccff">${ep} ⚡ pickups</div>` : '';
    const bkLine = bk > 0 ? `<div style="font-size:8px;color:#ff8800">${bk} 💀 boss</div>` : '';
    wg.innerHTML+=`<div style="background:#0a0a0a;border:1px solid #1e1e1e;padding:6px 12px;min-width:80px"><div style="font-size:9px;color:#557733">${_esc(WDEFS[w].name)}</div><div style="font-size:17px;font-weight:bold;color:#d8f030">${k}</div>${epLine}${bkLine}</div>`;
  });
  main.appendChild(wg);

  main.appendChild(_el('div','font-size:10px;color:#557733;letter-spacing:2px;margin:12px 0 6px','CHALLENGES'));
  const seen = new Set();
  UNLOCK_TABLE.filter(u=>u.challenge).forEach(u=>{
    const key = getChallengeDescription(u); if(seen.has(key))return; seen.add(key);
    const prog = getChallengeProgress(u.challenge);
    const done = prog.pct >= 1;
    const reward = u.type==='weaponSkin'?`${u.id.replace(/_/g,' ').toUpperCase()} skin (${u.weapon??'all'})`
                 : u.type==='playerSkin'?`${u.id.replace(/_/g,' ').toUpperCase()} suit`
                 : `${u.id.replace(/_/g,' ').toUpperCase()} (${u.weapon})`;
    const isSecret = !!u.secret;
    // Hide secret challenge description if not started
    const descToShow = (isSecret && prog.pct < 0.10 && !done) ? '??? (secret challenge)' : getChallengeDescription(u);
    const row = _el('div','display:flex;align-items:center;gap:10px;margin-bottom:7px;padding:7px 10px;background:#0a0a0a;border:1px solid #1e1e1e');
    row.innerHTML=`
      <div style="flex:1">
        <div style="font-size:18px;${done?'color:#557733':'color:#d8f030'}">${done?'✓ ':''} ${_esc(descToShow)}${isSecret?' <span style=\'font-size:8px;color:#8833aa\'>SECRET</span>':''}</div>
        <div style="font-size:14px;color:#557733">Reward: ${_esc(reward)}</div>
      </div>
      <div style="text-align:right;min-width:70px">
        <div style="font-size:14px;color:#d8f030">${prog.val} / ${prog.target}</div>
        <div style="width:70px;height:3px;background:#1e1e1e;margin-top:3px">
          <div style="width:${Math.round(prog.pct*100)}%;height:100%;background:${done?'#557733':isSecret?'#a030d0':'#d8f030'}"></div>
        </div>
      </div>`;
    main.appendChild(row);
  });
}

function _wIcon(w) {
  return {PISTOL:'🔫',SMG:'⚡',SHOTGUN:'💥',CHAINGUN:'🌀',RAILGUN:'🎯',PLASMA:'🔵',ROCKET:'🚀',GLAUNCHER:'💣',ELECTRON:'⚡',ION:'🔮'}[w]??'🔫';
}
