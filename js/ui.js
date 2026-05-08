import { $, $$, clamp, createEl, formatTime, getById } from './utils.js';

// ─── PANEL DRAG ───────────────────────────────────────────────────────────────
function initPanelDrag(panel) {
  const header = panel.querySelector('.panel-header');
  if (!header) return;
  let dragging = false, startMoved = false, offX = 0, offY = 0, startX = 0, startY = 0;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    startX = e.clientX; startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    offX = e.clientX - rect.left; offY = e.clientY - rect.top;
    startMoved = false; dragging = true;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!startMoved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
    startMoved = true;
    panel.style.left  = `${clamp(e.clientX - offX, 4, window.innerWidth  - 60)}px`;
    panel.style.top   = `${clamp(e.clientY - offY, 4, window.innerHeight - 40)}px`;
    panel.style.right = 'auto'; panel.style.transform = 'none';
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(t =>
    header.addEventListener(t, () => { dragging = false; startMoved = false; })
  );
}

function centerPanel(panel) {
  const w = panel.offsetWidth || 420, h = panel.offsetHeight || 300;
  panel.style.left  = `${Math.max(4, (window.innerWidth  - w) / 2)}px`;
  panel.style.top   = `${Math.max(4, (window.innerHeight - h) / 3)}px`;
  panel.style.right = 'auto'; panel.style.transform = 'none';
}

// ─── INIT PANELS ──────────────────────────────────────────────────────────────
export function initPanels(state, api) {
  $$('.panel').forEach(panel => {
    const closeBtn    = panel.querySelector('.close-btn');
    const collapseBtn = panel.querySelector('.collapse-btn');
    [closeBtn, collapseBtn].forEach(btn => {
      if (!btn) return;
      ['pointerdown','pointerup','click'].forEach(t =>
        btn.addEventListener(t, e => { e.stopPropagation(); e.preventDefault(); })
      );
    });
    closeBtn?.addEventListener('click',    () => panel.classList.add('hidden'));
    collapseBtn?.addEventListener('click', () => panel.classList.toggle('collapsed'));
    initPanelDrag(panel);
  });

  $$('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      if (!panel) return;
      const wasHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      panel.classList.remove('collapsed');
      if (wasHidden) requestAnimationFrame(() => centerPanel(panel));
    });
  });

  $('#openCodexBtn')?.addEventListener('click', () => {
    const p = $('#codexPanel');
    p.classList.remove('hidden');
    $('#splash').classList.remove('active');
    $('#gameRoot').classList.add('active');
    renderCodex();
    requestAnimationFrame(() => centerPanel(p));
  });

  const hudToggle = $('#hudToggleBtn');
  if (hudToggle) {
    hudToggle.addEventListener('click', () => {
      const hud = $('#hudBottom');
      hud.classList.toggle('hud-collapsed');
      hudToggle.textContent = hud.classList.contains('hud-collapsed') ? '▲' : '▼';
    });
  }
}

// ─── TOP HUD ──────────────────────────────────────────────────────────────────
export function renderTopHUD(state, data) {
  const clockEl = $('#worldClock'), locEl = $('#locationName');
  const modeEl  = $('#modeName'),  threatEl = $('#threatName');
  if (!clockEl) return;
  clockEl.textContent  = formatTime(state.timeMinutes);
  locEl.textContent    = currentMap(state, data)?.name || '—';
  const turnActor = state.combat.active
    ? state.roster.find(a => a.id === state.combat.turnOrder[state.combat.currentTurnIndex]) : null;
  modeEl.textContent   = state.combat.active ? `Combat · ${turnActor?.name || '—'}` : 'Exploration';
  threatEl.textContent = state.combat.active ? `Round ${state.combat.round}` : (currentMap(state, data)?.threat || 'Low');
  document.body.classList.toggle('in-combat', !!state.combat.active);
}

// ─── PARTY STRIP ──────────────────────────────────────────────────────────────
// ─── STATUS ICON MAP ─────────────────────────────────────────────────────────
// Maps status ID → emoji icon shown on party strip and inventory panel
const STATUS_ICONS = {
  stealthed:        '👣',
  bleeding:         '🩸',
  irradiated:       '☢',
  staggered:        '💫',
  inspired:         '⚡',
  fortified:        '🛡',
  steadfast:        '💪',
  hasted:           '⚡',
  shaken:           '😨',
  blinded:          '🌫',
  bloated:          '🤢',
  'scarred-survivor':'🪖',
  'clean-killer':   '🗡',
  'saint-of-nowhere':'🕊',
  'void-touched':   '🌀',
  dodging:          '↩',
};

export function renderPartyStrip(state, data, api) {
  const root = $('#partyStrip');
  if (!root) return;
  root.innerHTML = '';
  const party = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean);
  party.forEach(actor => {
    const hpPct   = Math.max(0, (actor.hp / actor.hpMax) * 100);
    const hpColor = actor.downed ? '#555' : hpPct > 50 ? '#86dfa3' : hpPct > 25 ? '#ffcc6b' : '#ff6e6e';
    const isAI    = state.combat.active && state.combat.aiActingId === actor.id;
    const card = createEl('div', {
      class: `party-card ${state.selectedActorId === actor.id ? 'selected' : ''} ${isAI ? 'ai-acting-card' : ''}`
    });
    card.style.position = 'relative';
    card.innerHTML = `
      <div class="row"><strong>${actor.name}</strong><span class="small">${actor.classId}${isAI ? ' ◉' : ''}</span></div>
      <div class="small">${actor.speciesId} · Lv ${actor.level}</div>
      <div class="bar"><div class="fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      <div class="small">HP ${actor.hp}/${actor.hpMax}${actor.dead ? ' · DEAD' : actor.downed ? ' · DOWN' : ''}</div>
      <div class="bar"><div class="fill" style="width:${actor.survival?.hunger ?? 0}%;background:#ffcc6b"></div></div>
      <div class="small">🍖${Math.round(actor.survival?.hunger ?? 0)} 💧${Math.round(actor.survival?.thirst ?? 0)} ♥${Math.round(actor.survival?.morale ?? 0)}</div>
    `;
    // Status icon strip — rendered INSIDE the card along the right edge
    if (actor.statuses?.length) {
      const iconStrip = createEl('div', { class: 'party-status-strip' });
      actor.statuses.forEach(statusId => {
        const statusDef = data.statuses?.find(s => s.id === statusId);
        const emoji = STATUS_ICONS[statusId] || '●';
        const iconEl = createEl('div', {
          class: 'party-status-icon',
          title: statusDef ? `${statusDef.name}: ${statusDef.description}` : statusId
        });
        iconEl.textContent = emoji;
        iconStrip.appendChild(iconEl);
      });
      card.appendChild(iconStrip);
    }
    card.addEventListener('click', () => {
      state.selectedActorId = actor.id;
      api.centerOnActor(actor);
      api.renderAll();
    });
    root.appendChild(card);
  });
}

function currentMap(state, data) {
  return data.maps.find(m => m.id === state.mapId);
}

// ─── TILE HOVER TOOLTIP ───────────────────────────────────────────────────────
let _tooltipEl = null;
function getTooltip() {
  if (!_tooltipEl) {
    _tooltipEl = createEl('div', { class: 'tile-tooltip hidden' });
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}
function showTileTooltip(text, x, y) {
  const tt = getTooltip();
  tt.textContent = text;
  tt.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  const tx = Math.min(x + 14, vw - 220);
  const ty = Math.min(y + 14, vh - 60);
  tt.style.left = `${tx}px`; tt.style.top = `${ty}px`;
}
function hideTileTooltip() {
  getTooltip().classList.add('hidden');
}

// ─── MAP RENDER ───────────────────────────────────────────────────────────────
export function renderMap(state, data, api) {
  const map = currentMap(state, data);
  const tileLayer   = $('#tileLayer');
  const entityLayer = $('#entityLayer');
  tileLayer.innerHTML = ''; entityLayer.innerHTML = '';
  if (!map) return;

  const size = data.config.map.tileSize;
  document.documentElement.style.setProperty('--tile', `${size}px`);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t) continue;
      const revealed = api.isTileRevealed(x, y);

      let cls = `tile ${t.type}`;
      if (!revealed) {
        cls += ' fogged';
      } else {
        if (t.cover)    cls += ' cover';
        if (t.locked)   cls += ' tile-locked';
        if (t.smoke > 0) cls += ' smoky';
        if (t.stasis > 0) cls += ' stasis-field';
        if (t.gameTable)       cls += ' game-table';
        if (t.jukebox)         cls += ' tile-jukebox';
        if (t.transition)      cls += ' tile-door';
        else if (t.loot)       cls += ' tile-loot';
        else if (t.interact)   cls += ' tile-interact';
      }

      const tile = createEl('div', { class: cls });
      tile.style.left = `${x * size}px`; tile.style.top = `${y * size}px`;
      tile.dataset.x  = x; tile.dataset.y = y;

      if (revealed && (t.transition || t.loot || t.interact || t.gameTable || t.jukebox)) {
        const iconSpan = createEl('span', { class: 'tile-icon' });
        iconSpan.textContent = getTileIcon(t);
        tile.appendChild(iconSpan);

        // Hover tooltip
        const tipText = buildTileTooltip(t);
        tile.addEventListener('mouseenter', e => showTileTooltip(tipText, e.clientX, e.clientY));
        tile.addEventListener('mousemove',  e => showTileTooltip(tipText, e.clientX, e.clientY));
        tile.addEventListener('mouseleave', hideTileTooltip);
      }

      if (revealed) {
        tile.addEventListener('click',       e => api.handleTileClick(x, y, e));
        tile.addEventListener('contextmenu', e => { e.preventDefault(); api.handleTileContext(x, y, e); });
        // AoE preview when hovering with a pending throw action
        tile.addEventListener('mouseenter', () => {
          const pending = api.getPendingAction?.();
          if (pending?.type === 'throw') {
            const actor = state.roster.find(a => a.id === pending.actorId);
            const entry = actor?.inventory[pending.itemIdx];
            const item  = entry ? api.getItemById?.(entry.itemId) : null;
            if (item?.throwAoeRadius > 0) renderAoEPreview(x, y, item.throwAoeRadius, size);
          }
        });
        tile.addEventListener('mouseleave', () => {
          const pending = api.getPendingAction?.();
          if (pending?.type === 'throw') clearAoEPreview();
        });
      }
      tileLayer.appendChild(tile);
    }
  }

  // ── Entities ──
  const roleIcon   = { player: '★', ally: '◉', enemy: '✕', neutral: '◆' };
  const actorsHere = state.roster.filter(a => a.mapId === state.mapId && !a.dead);
  actorsHere.forEach(actor => {
    const revealed = api.isTileRevealed(actor.x, actor.y);
    if (!revealed && !state.party.includes(actor.id)) return;

    const isAI      = state.combat.aiActingId === actor.id;
    const isCurrent = state.combat.active && state.combat.turnOrder[state.combat.currentTurnIndex] === actor.id;
    const map = data.maps.find(m => m.id === state.mapId);
    const actorTile = map?.tiles[actor.y]?.[actor.x];
    const inSmoke = actorTile?.smoke > 0;
    let cls = `entity ${actor.role}`;
    if (actor.downed)                         cls += ' down';
    if (state.selectedActorId === actor.id)   cls += ' selected';
    if (actor.statuses.includes('stealthed')) cls += ' stealthed';
    if (inSmoke)                              cls += ' in-smoke';
    if (isAI)                                 cls += ' ai-acting';
    if (isCurrent && !isAI)                   cls += ' current-turn';

    const ent = createEl('div', { class: cls });
    ent.style.left = `${actor.x * size}px`; ent.style.top = `${actor.y * size}px`;
    ent.dataset.actorid = actor.id;
    const icon = roleIcon[actor.role] || actor.name.split(' ').map(w => w[0]).slice(0,2).join('');
    ent.innerHTML = `<span class="icon">${icon}</span><div class="bubble">${actor.name}</div>`;

    // Entity tooltip — shows attack preview in combat
    ent.addEventListener('mouseenter', e => {
      if (state.combat.active) {
        api.setAttackHoverTarget?.(actor.id);
      }
      const preview = api.pendingAbilityPreview ?? null;
      // Build tooltip text
      let tipText = `${actor.name} · ${actor.classId} · HP ${actor.hp}/${actor.hpMax} · AC ${actor.armor}`;
      if (preview && state.combat.active) {
        tipText += `\n⚔ Hit chance: ${preview.hitPct}% · ${preview.dmgExpr}`;
        if (!preview.inRange) tipText += ` · OUT OF RANGE (${preview.range})`;
        if (preview.aoeRadius > 0) tipText += ` · AoE r${preview.aoeRadius}`;
      }
      showTileTooltip(tipText, e.clientX, e.clientY);
      // Show AoE ring if relevant
      if (preview?.aoeRadius > 0) renderAoEPreview(actor.x, actor.y, preview.aoeRadius, size);
      // Show throw AoE preview
      const pending = api.getPendingAction?.();
      if (pending?.type === 'throw') {
        const thrower = state.roster.find(a => a.id === pending.actorId);
        const entry = thrower?.inventory[pending.itemIdx];
        const item = entry ? api.getItemById?.(entry.itemId) : null;
        if (item?.throwAoeRadius > 0) renderAoEPreview(actor.x, actor.y, item.throwAoeRadius, size);
      }
    });
    ent.addEventListener('mousemove', e => {
      const preview = api.pendingAbilityPreview ?? null;
      let tipText = `${actor.name} · ${actor.classId} · HP ${actor.hp}/${actor.hpMax} · AC ${actor.armor}`;
      if (preview && state.combat.active) {
        tipText += `\n⚔ Hit chance: ${preview.hitPct}% · ${preview.dmgExpr}`;
        if (!preview.inRange) tipText += ` · OUT OF RANGE`;
        if (preview.aoeRadius > 0) tipText += ` · AoE r${preview.aoeRadius}`;
      }
      showTileTooltip(tipText, e.clientX, e.clientY);
    });
    ent.addEventListener('mouseleave', () => {
      hideTileTooltip();
      clearAoEPreview();
      api.clearAttackHover?.();
    });

    ent.addEventListener('pointerdown', e => e.stopPropagation());
    ent.addEventListener('click', e => { e.stopPropagation(); api.handleActorPrimary(actor.id, e); });
    ent.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); api.showActorContext(actor.id, e.clientX, e.clientY); });
    entityLayer.appendChild(ent);
  });

  // ── NPC Vision Cone Overlay ──
  renderVisionCones(state, data, api, entityLayer, size);
}

// ─── AoE RING PREVIEW ────────────────────────────────────────────────────────
let _aoePreviewEl = null;
function renderAoEPreview(cx, cy, radius, tileSize) {
  clearAoEPreview();
  const el = createEl('div', { class: 'aoe-preview-ring' });
  const px = (cx - radius) * tileSize;
  const py = (cy - radius) * tileSize;
  const sz = (radius * 2 + 1) * tileSize;
  el.style.left   = `${px}px`;
  el.style.top    = `${py}px`;
  el.style.width  = `${sz}px`;
  el.style.height = `${sz}px`;
  el.style.borderRadius = '50%';
  document.getElementById('effectLayer').appendChild(el);
  _aoePreviewEl = el;
}
function clearAoEPreview() {
  if (_aoePreviewEl) { _aoePreviewEl.remove(); _aoePreviewEl = null; }
}

// ─── NPC VISION CONE RENDERING ───────────────────────────────────────────────
// Draws translucent cone overlays for NPCs with visionRange set.
// Cones are SVG polygons drawn on the effectLayer.
let _visionConeContainer = null;

function renderVisionCones(state, data, api, entityLayer, tileSize) {
  // Remove old cone SVG
  if (_visionConeContainer) { _visionConeContainer.remove(); _visionConeContainer = null; }

  // Only show if any party member is stealthed, or always show if in stealth mode
  const partyStealthed = state.party.some(id => {
    const a = state.roster.find(x => x.id === id);
    return a?.statuses?.includes('stealthed');
  });
  const showCones = partyStealthed || state.partyControl?.squadStealth;
  if (!showCones) return;

  const cones = api.getVisibleNPCCones?.() || [];
  if (!cones.length) return;

  const effectLayer = document.getElementById('effectLayer');
  if (!effectLayer) return;

  const map = data.maps.find(m => m.id === state.mapId);
  if (!map) return;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width',  map.width  * tileSize);
  svg.setAttribute('height', map.height * tileSize);
  svg.style.position = 'absolute';
  svg.style.left = '0'; svg.style.top = '0';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '4';
  _visionConeContainer = svg;

  cones.forEach(cone => {
    const cx = (cone.x + 0.5) * tileSize;
    const cy = (cone.y + 0.5) * tileSize;
    const r  = cone.visionRange * tileSize;
    const halfAngle = (cone.visionAngle / 2) * (Math.PI / 180);

    // Facing direction → angle in radians
    const faceAngle = Math.atan2(cone.facing.dy, cone.facing.dx);
    const startAngle = faceAngle - halfAngle;
    const endAngle   = faceAngle + halfAngle;

    // Build arc path
    const steps = 16;
    let points = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / steps);
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const pointStr = points.map(p => p.join(',')).join(' ');

    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', pointStr);
    poly.setAttribute('fill',   cone.alert ? 'rgba(255,80,60,0.22)' : 'rgba(255,200,60,0.14)');
    poly.setAttribute('stroke', cone.alert ? 'rgba(255,80,60,0.7)'  : 'rgba(255,200,60,0.5)');
    poly.setAttribute('stroke-width', '1.5');

    // NPC dot at center
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', cone.alert ? '#ff5040' : '#ffcc3c');
    dot.setAttribute('stroke', '#000'); dot.setAttribute('stroke-width', '1');

    svg.appendChild(poly);
    svg.appendChild(dot);
  });

  effectLayer.appendChild(svg);
}

function buildTileTooltip(t) {
  if (t.jukebox)   return `[🎵 Jukebox] Queue a song · 1¢ per track`;
  if (t.gameTable) return `[◈ Card Table] Join a game · Min bet varies`;
  const name = t.containerName || (t.transition ? `→ ${t.transition.mapId}` : null)
    || t.interactText?.slice(0, 60) || 'Interactable';
  const type = t.transition ? 'Door/Transition' : t.loot ? 'Container' : 'Interact';
  const lock = t.locked ? ' 🔒' : '';
  return `[${type}]${lock} ${name}`;
}

function getTileIcon(t) {
  if (t.jukebox)  return '♪';
  if (t.gameTable) return '◈';
  if (t.transition) {
    const dest = t.transition.mapId || '';
    if (dest.includes('vent'))     return '▤';
    if (dest.includes('hold'))     return '⬒';
    if (dest.includes('wake'))     return '⬡';
    if (dest.includes('jail'))     return '▦';
    if (dest.includes('archive'))  return '▤';
    if (dest.includes('derelict')) return '⬡';
    return '▣';
  }
  if (t.loot) {
    const name = (t.containerName || t.interactText || '').toLowerCase();
    if (name.includes('crate') || name.includes('cargo') || name.includes('duffel') || name.includes('box')) return '▩';
    if (name.includes('locker') || name.includes('lock') || name.includes('cache') || name.includes('safe')) return '▪';
    if (name.includes('cabinet') || name.includes('trunk') || name.includes('reliquary')) return '▫';
    if (name.includes('drawer') || name.includes('desk')) return '▬';
    if (name.includes('pod') || name.includes('barrel')) return '▧';
    if (name.includes('shelf') || name.includes('record')) return '▤';
    return '◈';
  }
  if (t.interact) {
    const txt = (t.interactText || '').toLowerCase();
    if (txt.includes('door') || txt.includes('gate') || txt.includes('hatch') || txt.includes('grate')) return '▣';
    if (txt.includes('terminal') || txt.includes('console') || txt.includes('computer') || txt.includes('panel')) return '▦';
    if (txt.includes('desk') || txt.includes('counter') || txt.includes('workbench') || txt.includes('table')) return '▬';
    if (txt.includes('bunk') || txt.includes('bed') || txt.includes('rest')) return '▭';
    if (txt.includes('galley') || txt.includes('cook') || txt.includes('food') || txt.includes('kitchen')) return '◇';
    if (txt.includes('stall') || txt.includes('shop') || txt.includes('vendor') || txt.includes('market')) return '◆';
    if (txt.includes('board') || txt.includes('bulletin') || txt.includes('notice') || txt.includes('sign')) return '▤';
    if (txt.includes('nav') || txt.includes('navigation') || txt.includes('chart')) return '◈';
    if (txt.includes('med') || txt.includes('scan') || txt.includes('clinic') || txt.includes('diagnostic')) return '✚';
    if (txt.includes('engine') || txt.includes('reactor') || txt.includes('fuel')) return '◉';
    if (txt.includes('strut') || txt.includes('berth') || txt.includes('cradle')) return '◎';
    if (txt.includes('airlock') || txt.includes('seal')) return '▣';
    if (txt.includes('camp') || txt.includes('fire pit')) return '◇';
    return '◇';
  }
  return '·';
}

// ─── RESOURCES ────────────────────────────────────────────────────────────────
export function renderResources(state) {
  const bar = $('#resourceBar');
  if (!bar) return;
  bar.innerHTML = '';
  [
    ['Credits', state.resources.credits],
    ['Fuel',    `${state.resources.fuel}/${state.ship.fuelCapacity}`],
    ['Rations', state.resources.rations],
    ['Water',   state.resources.water],
    ['Supplies',state.resources.shipSupplies],
    ['Medgel',  state.resources.medgel],
    ['Scrap',   state.resources.scrap],
  ].forEach(([label, val]) => {
    bar.appendChild(createEl('div', { class: 'resource-chip' },
      `<span class="small">${label}</span><strong>${val}</strong>`));
  });
}

// ─── ACTION / BONUS ACTION BAR ────────────────────────────────────────────────
export function renderActionBar(state, data, api) {
  const bar = $('#actionBar');
  if (!bar) return;
  bar.innerHTML = '';

  const actor = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean)
    .find(a => a.id === state.selectedActorId)
    || state.roster.find(a => state.party.includes(a.id) && !a.dead);
  if (!actor) return;

  const inCombat  = state.combat.active;
  const isMyTurn  = inCombat && state.combat.turnOrder[state.combat.currentTurnIndex] === actor.id;
  const actionSpent = inCombat && !!state.combat.acted?.[actor.id];
  const bonusSpent  = inCombat && !!state.combat.bonusActed?.[actor.id];
  const movLeft     = inCombat ? (state.combat.movementLeft?.[actor.id] ?? actor.moveRange) : actor.moveRange;

  // Combat turn order strip
  if (inCombat) {
    const strip = createEl('div', { class: 'combat-roster' });
    state.combat.turnOrder.forEach((id, idx) => {
      const a = state.roster.find(x => x.id === id);
      if (!a) return;
      const isCurrent = idx === state.combat.currentTurnIndex;
      const isAI = state.combat.aiActingId === id;
      strip.appendChild(createEl('div', {
        class: `combatant-chip ${a.role} ${isCurrent ? 'current' : ''} ${a.dead ? 'dead' : ''} ${isAI ? 'ai-acting' : ''}`
      }, `${a.name} ${a.hp}/${a.hpMax}`));
    });
    bar.appendChild(strip);
  }

  // Build action list — costs one action
  const actionList = [];
  if (inCombat) {
    actionList.push({ label: '⚔ Attack', desc: 'Weapon attack against an enemy in range.', fn: () => api.setPendingAction('attack') });
    actionList.push({ label: '🏃 Dash', desc: 'Double your movement for this turn.', fn: () => {
      state.combat.movementLeft[actor.id] = (state.combat.movementLeft[actor.id] ?? 0) + actor.moveRange;
      state.combat.acted[actor.id] = true;
      api.renderAll(); api.log?.(`${actor.name} dashes.`);
    }});
    actionList.push({ label: '🛡 Dodge', desc: 'Attacks against you have disadvantage until next turn.', fn: () => {
      if (!actor.statuses.includes('dodging')) actor.statuses.push('dodging');
      state.combat.acted[actor.id] = true;
      api.renderAll(); api.log?.(`${actor.name} dodges.`);
    }});
    actionList.push({ label: '🤫 Hide', desc: 'Attempt to become stealthed (Agility check).', fn: () => {
      const roll = Math.floor(Math.random()*20)+1;
      const mod  = Math.floor((actor.stats.agility-10)/2) + actor.level;
      if (roll+mod >= 13) {
        if (!actor.statuses.includes('stealthed')) actor.statuses.push('stealthed');
        api.log?.(`${actor.name} hides! (${roll}+${mod}=${roll+mod})`);
      } else { api.log?.(`${actor.name} fails to hide. (${roll}+${mod}=${roll+mod})`); }
      state.combat.acted[actor.id] = true; api.renderAll();
    }});
    actionList.push({ label: '🤝 Help', desc: 'Grant an ally advantage on their next action.', fn: () => {
      state.combat.acted[actor.id] = true; api.renderAll(); api.log?.(`${actor.name} helps an ally.`);
    }});
  }
  actionList.push({ label: '🏃 Move', desc: 'Move to any revealed tile.', fn: () => api.setPendingAction('move') });
  actionList.push({ label: '💬 Talk', desc: 'Speak to an NPC within 5 tiles.', fn: () => api.setPendingAction('talk') });
  actionList.push({ label: '🎒 Loot', desc: 'Loot a container within 5 tiles.', fn: () => api.setPendingAction('loot') });
  if (!inCombat) {
    actionList.push({ label: '🛌 Rest', desc: 'Long rest — restore HP and abilities. Needs rations + water.', fn: () => api.longRest() });
    actionList.push({ label: '🔍 Inspect', desc: 'Inspect a nearby tile or object.', fn: () => api.setPendingAction('loot') });
  }
  // Actor abilities (action type)
  (actor.abilities || []).forEach(abilityId => {
    const ab = getById(data.abilities, abilityId);
    if (!ab || ab.costType === 'bonus') return;
    actionList.push({ label: `✨ ${ab.name}`, desc: ab.description, fn: () => api.setPendingAction({ type: 'ability', abilityId }) });
  });

  // Build bonus action list
  const bonusList = [];
  bonusList.push({ label: '🧪 Use Item', desc: 'Use a consumable from your inventory.', fn: () => { $('#inventoryPanel')?.classList.remove('hidden'); } });
  bonusList.push({ label: '🎯 Throw Item', desc: 'Select a throwable item from your inventory.', fn: () => {
    // Open inventory so the player can choose what to throw from there
    api.openPanel?.('inventoryPanel');
    api.log?.('Select a throwable item from your inventory to throw.');
  }});
  if (inCombat) {
    bonusList.push({ label: '🩹 Second Wind', desc: 'Regain 1d6+level HP (once per rest).', fn: () => {
      if (actor._secondWindUsed) { api.log?.('Already used Second Wind this rest.'); return; }
      const heal = Math.floor(Math.random()*6)+1+actor.level;
      actor.hp = Math.min(actor.hpMax, actor.hp+heal);
      actor._secondWindUsed = true;
      state.combat.bonusActed[actor.id] = true;
      api.renderAll(); api.log?.(`${actor.name} uses Second Wind — healed ${heal} HP.`);
    }});
    bonusList.push({ label: '⚡ Off-hand Strike', desc: 'Attack with your off-hand weapon if equipped.', fn: () => {
      const off = getById(data.items, actor.equipped?.offhand);
      if (!off) { api.log?.('No off-hand weapon.'); return; }
      api.setPendingAction('attack');
    }});
  }
  bonusList.push({ label: actor.statuses.includes('stealthed') ? '👁 Un-hide' : '👣 Sneak', desc: 'Toggle stealth on or off.', fn: () => {
    const nowStealthed = actor.statuses.includes('stealthed');
    if (nowStealthed) {
      actor.statuses = actor.statuses.filter(s => s !== 'stealthed');
      api.log?.(`${actor.name} leaves stealth.`);
    } else {
      actor.statuses.push('stealthed');
      api.log?.(`${actor.name} enters stealth.`);
    }
    if (inCombat) state.combat.bonusActed[actor.id] = true;
    api.renderAll();
  }});
  bonusList.push({ label: '🗣 Rally', desc: 'Inspire an ally with a shout.', fn: () => {
    if (inCombat) state.combat.bonusActed[actor.id] = true;
    api.renderAll(); api.log?.(`${actor.name} rallies the team.`);
  }});
  // Actor bonus abilities
  (actor.abilities || []).forEach(abilityId => {
    const ab = getById(data.abilities, abilityId);
    if (!ab || ab.costType !== 'bonus') return;
    bonusList.push({ label: `⚡ ${ab.name}`, desc: ab.description, fn: () => api.setPendingAction({ type: 'ability', abilityId }) });
  });

  // Render the row
  const row = createEl('div', { class: 'action-row' });

  // Action button
  const actionBtn = createEl('button', {
    class: `action-main-btn ${actionSpent ? 'action-spent' : ''}`
  }, actionSpent ? '✓ Action Used' : '⚔ Action ▼');
  actionBtn.addEventListener('click', e => {
    if (inCombat && !isMyTurn) { api.log?.('Not your turn.'); return; }
    _showActionDropdown(actionBtn, actionList, actionSpent);
    e.stopPropagation();
  });
  row.appendChild(actionBtn);

  // Bonus action button
  const bonusBtn = createEl('button', {
    class: `action-main-btn bonus-btn ${bonusSpent ? 'action-spent' : ''}`
  }, bonusSpent ? '✓ Bonus Used' : '⚡ Bonus ▼');
  bonusBtn.addEventListener('click', e => {
    if (inCombat && !isMyTurn) { api.log?.('Not your turn.'); return; }
    _showActionDropdown(bonusBtn, bonusList, bonusSpent);
    e.stopPropagation();
  });
  row.appendChild(bonusBtn);

  // Movement chip
  if (inCombat) {
    const movChip = createEl('div', { class: `action-chip ${movLeft > 0 ? '' : 'action-spent'}` });
    movChip.innerHTML = `<span class="small">Move</span><strong>${movLeft}t</strong>`;
    row.appendChild(movChip);
  }

  if (!inCombat) {
    const followBtn = createEl('button', { class: 'secondary' }, `Follow: ${state.partyControl.follow ? 'ON' : 'OFF'}`);
    followBtn.addEventListener('click', () => api.toggleGroupFollow());
    row.appendChild(followBtn);
  }

  bar.appendChild(row);
}

function _showActionDropdown(anchorBtn, actions, spent) {
  document.querySelectorAll('.action-dropdown').forEach(el => el.remove());
  if (spent) return;
  const dropdown = createEl('div', { class: 'action-dropdown' });
  actions.forEach(({ label, desc, fn }) => {
    const item = createEl('div', { class: 'action-dropdown-item' });
    item.innerHTML = `<div><strong>${label}</strong></div><div class="small">${desc}</div>`;
    item.addEventListener('click', e => { e.stopPropagation(); dropdown.remove(); fn(); });
    dropdown.appendChild(item);
  });
  const rect = anchorBtn.getBoundingClientRect();
  dropdown.style.cssText = `position:fixed;left:${Math.min(rect.left, window.innerWidth-290)}px;bottom:${window.innerHeight-rect.top+6}px;z-index:9999`;
  document.body.appendChild(dropdown);
  const close = (e) => { if (!dropdown.contains(e.target)) { dropdown.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 0);
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
export function renderMessages(state) {
  const log = $('#messageLog');
  if (!log) return;
  log.innerHTML = '';
  const msgs = (state.ui.messages || []).slice(-12);
  msgs.forEach((msg, i) => {
    const div = createEl('div', {}, msg);
    if (i === msgs.length - 1) div.style.color = 'var(--text)';
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;
}

export function pushMessage(state, msg) {
  state.ui.messages = state.ui.messages || [];
  state.ui.messages.push(msg);
  if (state.ui.messages.length > 60) state.ui.messages.shift();
}

// ─── JOURNAL (BG3-style with steps + collected items) ─────────────────────────
export function renderJournal(state, data) {
  const root = $('#journalBody');
  if (!root) return;
  root.innerHTML = '';
  let any = false;

  data.quests.forEach(quest => {
    const prog = state.quests[quest.id];
    if (!prog) return;
    any = true;

    const statusLabel = prog.complete ? '✓ Complete' : prog.failed ? '✗ Failed' : 'Active';
    const statusCls   = prog.complete ? 'good' : prog.failed ? 'danger-text' : '';

    const card = createEl('div', { class: 'card journal-quest' });

    // Header
    card.innerHTML = `
      <div class="row">
        <strong>${quest.name}</strong>
        <span class="small ${statusCls}">${quest.category} · ${statusLabel}</span>
      </div>
      <p class="small" style="margin:4px 0 8px">${quest.description}</p>
    `;

    // All stages — past ones checkmarked, current highlighted, future dimmed
    const stagesDiv = createEl('div', { class: 'journal-stages' });
    quest.stages.forEach((stage, i) => {
      const done    = i < prog.stage || prog.complete;
      const current = i === prog.stage && !prog.complete && !prog.failed;
      const future  = i > prog.stage && !prog.complete;

      const row = createEl('div', { class: `journal-step ${done ? 'done' : current ? 'current' : 'future'}` });
      row.innerHTML = `
        <span class="journal-step-icon">${done ? '✓' : current ? '▶' : '○'}</span>
        <span>${stage.text}</span>
      `;
      stagesDiv.appendChild(row);
    });
    card.appendChild(stagesDiv);

    // Collected quest-relevant items
    const relevantFlags = quest.stages
      .flatMap(s => s.autoAdvanceIf || [])
      .filter(c => c.type === 'flag' && c.key.startsWith('has_'));
    if (relevantFlags.length > 0 && !prog.complete) {
      const itemsDiv = createEl('div', { class: 'journal-items' });
      itemsDiv.innerHTML = '<div class="small" style="margin-top:6px;opacity:0.6">Quest items:</div>';
      relevantFlags.forEach(c => {
        const have = !!state.flags[c.key];
        const itemId = c.key.replace('has_', '');
        const item   = data.items?.find(it => it.id === itemId);
        const label  = item?.name || itemId;
        itemsDiv.innerHTML += `<div class="journal-item-row ${have ? 'have' : ''}">
          ${have ? '✓' : '○'} ${label}
        </div>`;
      });
      card.appendChild(itemsDiv);
    }

    root.appendChild(card);
  });

  if (!any) root.innerHTML = '<div class="card"><div class="small">No quests yet. Explore and speak to people.</div></div>';
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
// Item type → color class map
const ITEM_TYPE_CLASS = {
  weapon:     'item-type-weapon',
  armor:      'item-type-armor',
  consumable: 'item-type-consumable',
  quest:      'item-type-quest',
  container:  'item-type-container',
  implant:    'item-type-armor',
  utility:    'item-type-utility',
  misc:       'item-type-misc',
  trade:      'item-type-misc',
  trinket:    'item-type-misc',
};

// State for inventory sort/search — lives outside render so it persists across rerenders
let _invSort   = 'type';   // 'type' | 'newest' | 'value'
let _invSearch = '';
let _dragSlot  = null;     // which slot type we're dragging FROM (for equip highlight)
let _invTab    = 'player'; // 'player' | 'party' | 'ship'

// ─── CHARACTER MINI-DOLL ──────────────────────────────────────────────────────
function renderMiniDoll(actor) {
  const app = actor.appearance || {};
  const skin   = app.skin   || '#b88e74';
  const hair   = app.hair   || '#2f3d5a';
  const eyes   = app.eyes   || '#93d7ff';
  const accent = app.accent || '#d2a84b';
  const armorColor = accent;

  const doll = createEl('div', { class: 'inv-mini-doll' });
  doll.innerHTML = `
    <div class="inv-doll-layer inv-doll-body"   style="--skin:${skin}"></div>
    <div class="inv-doll-layer inv-doll-armor"  style="--armorColor:${armorColor}"></div>
    <div class="inv-doll-layer inv-doll-hair"   style="--hair:${hair}"></div>
    <div class="inv-doll-layer inv-doll-accent" style="--eyes:${eyes}"></div>
    <div class="inv-doll-name">${actor.name}</div>
    <div class="inv-doll-class small">${actor.classId} · ${actor.speciesId}</div>
  `;
  return doll;
}

function renderInvBag(actor, state, data, api, showCargo = false) {
  // Equipment column
  const actorCol = createEl('div', { class: 'card' });
  actorCol.appendChild(renderMiniDoll(actor));
  const equipSlots = ['mainhand','offhand','armor','utility','implant','pack'];
  equipSlots.forEach(slot => {
    const itemId = actor.equipped?.[slot];
    const item   = getById(data.items, itemId);
    const typeCls = item ? (ITEM_TYPE_CLASS[item.type] || '') : '';
    const div = createEl('div', { class: `equip-slot ${typeCls} ${_dragSlot === slot ? 'equip-slot-highlight' : ''}` });
    div.innerHTML = `<div class="small">${slot}</div><div>${item?.name || '<span class="muted">Empty</span>'}</div>`;
    div.addEventListener('click', () => api.inspectEquipmentSlot(actor.id, slot));
    div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('equip-slot-highlight'); });
    div.addEventListener('dragleave', () => div.classList.remove('equip-slot-highlight'));
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('equip-slot-highlight');
      try {
        const payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        const srcActor = state.roster.find(a => a.id === payload.actorId);
        if (!srcActor) return;
        const entry = srcActor.inventory[payload.idx];
        const dragItem = entry ? getById(data.items, entry.itemId) : null;
        if (dragItem?.slot === slot) api.equipItem(srcActor, payload.idx);
      } catch { /* ignore */ }
    });
    actorCol.appendChild(div);
  });

  // Inventory bag column
  const bagCol = createEl('div', { class: 'card' }, '<strong>Carried Items</strong>');
  let inventory = (actor.inventory || []).map((entry, origIdx) => ({ entry, origIdx }));
  if (_invSearch.trim()) {
    const q = _invSearch.toLowerCase();
    inventory = inventory.filter(({ entry }) => {
      const item = getById(data.items, entry.itemId);
      return (item?.name || entry.itemId).toLowerCase().includes(q) || (item?.type || '').toLowerCase().includes(q);
    });
  }
  if (_invSort === 'type') {
    const order = ['weapon','armor','consumable','quest','utility','implant','container','misc','trade','trinket'];
    inventory.sort((a, b) => {
      const ia = getById(data.items, a.entry.itemId), ib = getById(data.items, b.entry.itemId);
      return (order.indexOf(ia?.type||'misc') - order.indexOf(ib?.type||'misc'));
    });
  } else if (_invSort === 'value') {
    inventory.sort((a, b) => {
      const ia = getById(data.items, a.entry.itemId), ib = getById(data.items, b.entry.itemId);
      return ((ib?.sellValue || 10) - (ia?.sellValue || 10));
    });
  }
  const grid = createEl('div', { class: 'slot-grid' });
  inventory.forEach(({ entry, origIdx }) => {
    const item    = getById(data.items, entry.itemId);
    const typeCls = ITEM_TYPE_CLASS[item?.type] || 'item-type-misc';
    const slot = createEl('div', { class: 'slot' });
    slot.innerHTML = `<div class="item ${typeCls}">
      <strong>${entry.customName || item?.name || entry.itemId}</strong>
      <div class="meta">${item?.type || 'item'} x${entry.qty}</div>
    </div>`;
    slot.addEventListener('click', e => api.inspectInventoryItem(actor.id, origIdx, e.clientX, e.clientY));
    // Right-click: context with throw option for throwable items
    slot.addEventListener('contextmenu', e => {
      e.preventDefault();
      const opts = [['Inspect', () => api.inspectInventoryItem(actor.id, origIdx, e.clientX, e.clientY)]];
      if (item?.throwable) opts.push([`🎯 Throw ${item.name}`, () => api.prepareThrow(actor.id, origIdx)]);
      if (item?.type === 'consumable') opts.push(['Use', () => api.inspectInventoryItem(actor.id, origIdx, e.clientX, e.clientY, true)]);
      // Show mini context
      const menu = document.getElementById('contextMenu');
      if (menu) {
        menu.innerHTML = '';
        opts.forEach(([label, fn]) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.onclick = (ev) => { ev.stopPropagation(); menu.classList.add('hidden'); fn(); };
          menu.appendChild(btn);
        });
        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 210)}px`;
        menu.style.top  = `${Math.min(e.clientY, window.innerHeight - (opts.length * 44))}px`;
        menu.classList.remove('hidden');
      }
    });
    slot.setAttribute('draggable', 'true');
    slot.addEventListener('dragstart', e => {
      _dragSlot = item?.slot || null;
      e.dataTransfer.setData('text/plain', JSON.stringify({ actorId: actor.id, idx: origIdx }));
      setTimeout(() => renderInventory(state, data, api), 0);
    });
    slot.addEventListener('dragend', () => { _dragSlot = null; renderInventory(state, data, api); });
    slot.addEventListener('dragover', e => e.preventDefault());
    slot.addEventListener('drop', e => api.handleInventoryDrop(e, actor.id, origIdx));
    grid.appendChild(slot);
  });
  for (let i = inventory.length; i < 20; i++) {
    const slot = createEl('div', { class: 'slot' }, '<span class="small">—</span>');
    slot.addEventListener('dragover', e => e.preventDefault());
    slot.addEventListener('drop', e => api.handleInventoryDrop(e, actor.id, actor.inventory.length));
    grid.appendChild(slot);
  }
  bagCol.appendChild(grid);
  return [actorCol, bagCol];
}

export function renderInventory(state, data, api) {
  const root = $('#inventoryBody');
  if (!root) return;
  root.innerHTML = '';

  // ── Tab bar ──
  const tabBar = createEl('div', { class: 'inv-tab-bar' });
  [['player','Player'],['party','Party'],['ship','Ship Cargo']].forEach(([id, label]) => {
    const btn = createEl('button', { class: `inv-tab-btn ${_invTab === id ? 'active' : ''}` }, label);
    btn.addEventListener('click', () => { _invTab = id; renderInventory(state, data, api); });
    tabBar.appendChild(btn);
  });
  root.appendChild(tabBar);

  // ── Toolbar: search + sort (shown for player/party tabs) ──
  if (_invTab !== 'ship') {
    const toolbar = createEl('div', { class: 'inv-toolbar' });
    const searchInput = createEl('input', { class: 'inv-search' });
    searchInput.type        = 'text';
    searchInput.placeholder = 'Search items…';
    searchInput.value       = _invSearch;
    searchInput.addEventListener('input', e => { _invSearch = e.target.value; renderInventory(state, data, api); });
    const sortSel = createEl('select', { class: 'inv-sort' });
    [['type','By Type'],['newest','Newest'],['value','By Value']].forEach(([v,l]) => {
      const opt = createEl('option', {}, l);
      opt.value = v;
      if (_invSort === v) opt.selected = true;
      sortSel.appendChild(opt);
    });
    sortSel.addEventListener('change', e => { _invSort = e.target.value; renderInventory(state, data, api); });
    toolbar.append(searchInput, sortSel);
    root.appendChild(toolbar);
  }

  const wrap = createEl('div', { class: 'inventory-columns' });

  // ── PLAYER TAB ──
  if (_invTab === 'player') {
    const actor = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean)
      .find(a => a.id === state.selectedActorId)
      || state.roster.find(a => state.party.includes(a.id) && !a.dead);
    if (!actor) {
      root.appendChild(createEl('div', { class: 'card' }, '<div class="small">No party member selected.</div>'));
      return;
    }

    // ── Active Conditions / Status strip ──
    if (actor.statuses?.length) {
      const condCard = createEl('div', { class: 'card', style: 'margin-bottom:8px' });
      const condTitle = createEl('div', { class: 'small', style: 'font-weight:600;margin-bottom:6px;color:var(--accent2,#79d4ff)' }, 'Active Conditions');
      condCard.appendChild(condTitle);
      const condRow = createEl('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' });
      actor.statuses.forEach(statusId => {
        const statusDef = data.statuses?.find(s => s.id === statusId);
        const emoji = STATUS_ICONS[statusId] || '●';
        const chip = createEl('div', { class: 'status-chip', style: 'position:relative;cursor:default' });
        chip.innerHTML = `<span class="status-chip-icon">${emoji}</span><span class="status-chip-label">${statusDef?.name || statusId}</span>`;
        // Hover tooltip showing description
        const tip = createEl('div', { class: 'status-chip-tip hidden' });
        tip.innerHTML = `<strong>${statusDef?.name || statusId}</strong><br>${statusDef?.description || ''}`;
        chip.appendChild(tip);
        chip.addEventListener('mouseenter', () => tip.classList.remove('hidden'));
        chip.addEventListener('mouseleave', () => tip.classList.add('hidden'));
        condRow.appendChild(chip);
      });
      condCard.appendChild(condRow);
      root.appendChild(condCard);
    }

    const [eqCol, bagCol] = renderInvBag(actor, state, data, api);
    wrap.append(eqCol, bagCol);
    root.appendChild(wrap);
    return;
  }

  // ── PARTY TAB ──
  if (_invTab === 'party') {
    const activeParty = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean);
    const otherCompanions = state.roster.filter(a =>
      !state.party.includes(a.id) && (a.role === 'ally' || a.templateId) && !a.dead &&
      a.role !== 'enemy' && a.role !== 'neutral'
    );

    if (!activeParty.length) {
      root.appendChild(createEl('div', { class: 'card' }, '<div class="small">No active party members.</div>'));
      return;
    }

    // Show each party member's inventory as a collapsible section
    activeParty.forEach(actor => {
      const section = createEl('div', { class: 'card', style: 'margin-bottom:12px' });
      const sectionHeader = createEl('div', { class: 'row', style: 'margin-bottom:8px;cursor:pointer' });
      const hpPct = Math.max(0, (actor.hp / actor.hpMax) * 100);
      const hpColor = actor.downed ? '#555' : hpPct > 50 ? '#86dfa3' : hpPct > 25 ? '#ffcc6b' : '#ff6e6e';
      sectionHeader.innerHTML = `
        <strong>${actor.name}</strong>
        <span class="small">${actor.classId} · ${actor.speciesId} · HP ${actor.hp}/${actor.hpMax}</span>
        <div class="bar" style="flex:1;margin:0 8px"><div class="fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
        <span class="small">${actor.inventory?.length || 0} items</span>
      `;
      section.appendChild(sectionHeader);

      // Mini inventory grid for this party member
      const miniGrid = createEl('div', { class: 'slot-grid' });
      (actor.inventory || []).forEach((entry, origIdx) => {
        const item    = getById(data.items, entry.itemId);
        const typeCls = ITEM_TYPE_CLASS[item?.type] || 'item-type-misc';
        const slot = createEl('div', { class: 'slot' });
        slot.innerHTML = `<div class="item ${typeCls}">
          <strong>${entry.customName || item?.name || entry.itemId}</strong>
          <div class="meta">${item?.type || 'item'} x${entry.qty}</div>
        </div>`;
        slot.addEventListener('click', e => {
          // Switch to player tab on this actor first, then inspect
          state.selectedActorId = actor.id;
          api.inspectInventoryItem(actor.id, origIdx, e.clientX, e.clientY);
        });
        miniGrid.appendChild(slot);
      });
      if (!(actor.inventory || []).length) {
        miniGrid.appendChild(createEl('div', { class: 'slot' }, '<span class="small muted">Empty</span>'));
      }
      section.appendChild(miniGrid);
      wrap.appendChild(section);
    });

    // Other (inactive) party members toggle
    if (otherCompanions.length) {
      const toggleSection = createEl('div', { class: 'card' });
      const toggleBtn = createEl('button', { class: 'secondary', style: 'width:100%;margin-bottom:8px' },
        `▼ Other Companions (${otherCompanions.length})`);
      const otherBody = createEl('div', { style: 'display:none' });
      toggleBtn.addEventListener('click', () => {
        const hidden = otherBody.style.display === 'none';
        otherBody.style.display = hidden ? '' : 'none';
        toggleBtn.textContent = (hidden ? '▲' : '▼') + ` Other Companions (${otherCompanions.length})`;
      });
      otherCompanions.forEach(actor => {
        const row = createEl('div', { class: 'row', style: 'padding:4px 0;border-bottom:1px solid var(--line-color)' });
        row.innerHTML = `<strong>${actor.name}</strong><span class="small">${actor.classId} · ${actor.inventory?.length || 0} items</span>`;
        otherBody.appendChild(row);
      });
      toggleSection.append(toggleBtn, otherBody);
      wrap.appendChild(toggleSection);
    }

    root.appendChild(wrap);
    return;
  }

  // ── SHIP TAB ──
  if (_invTab === 'ship') {
    const stashCol = createEl('div', { class: 'card' });
    stashCol.innerHTML = '<strong>Ship Cargo</strong><div class="small">Shared storage accessible from the ship.</div>';
    const stashGrid = createEl('div', { class: 'slot-grid', style: 'margin-top:10px' });
    (state.ship.cargo || []).forEach((entry, idx) => {
      const item    = getById(data.items, entry.itemId);
      const typeCls = ITEM_TYPE_CLASS[item?.type] || 'item-type-misc';
      const slot = createEl('div', { class: 'slot' });
      slot.innerHTML = `<div class="item ${typeCls}"><strong>${entry.customName || item?.name || entry.itemId}</strong><div class="meta">${item?.type || 'misc'} x${entry.qty}</div></div>`;
      slot.addEventListener('click', () => api.inspectCargoItem(idx));
      stashGrid.appendChild(slot);
    });
    for (let i = (state.ship.cargo||[]).length; i < 24; i++) {
      stashGrid.appendChild(createEl('div', { class: 'slot' }, '<span class="small">—</span>'));
    }
    stashCol.appendChild(stashGrid);
    wrap.appendChild(stashCol);
    root.appendChild(wrap);
    return;
  }
}

// ─── CREW ─────────────────────────────────────────────────────────────────────
export function renderCrew(state, data) {
  const root = $('#crewBody');
  if (!root) return;
  root.innerHTML = '';
  state.roster.filter(a => a.role === 'ally' || state.party.includes(a.id)).forEach(actor => {
    root.appendChild(createEl('div', { class: 'card' }, `
      <strong>${actor.name}</strong>
      <div class="small">${actor.classId} · ${actor.speciesId}</div>
      <p>${actor.bio || 'No biography yet.'}</p>
      <div class="statline"><span>Affinity</span><strong>${actor.affinity ?? 0}</strong></div>
      <div class="statline"><span>Romance</span><strong>Stage ${actor.romance?.stage || 0}</strong></div>
      <div class="statline"><span>Morale</span><strong>${Math.round(actor.survival?.morale ?? 0)}</strong></div>
      <div class="small">${actor.romance?.active ? 'Romance active.' : ''}</div>
    `));
  });
}

// ─── SHIP ─────────────────────────────────────────────────────────────────────
export function renderShip(state, api) {
  const root = $('#shipBody');
  if (!root) return;
  const scrap = state.resources.scrap, canMake = Math.floor(scrap / 5);
  const fuelSpace = state.ship.fuelCapacity - state.resources.fuel;
  root.innerHTML = `
    <div class="card">
      <strong>${state.ship.name}</strong>
      <div class="small">Mobile base, safe-rest zone, cargo hold, companion hub, travel interface.</div>
      <div class="statline"><span>Hull</span><strong>${state.ship.hull}%</strong></div>
      <div class="statline"><span>Fuel</span><strong>${state.resources.fuel} / ${state.ship.fuelCapacity}</strong></div>
      <div class="statline"><span>Scrap</span><strong>${scrap} (can convert ${Math.min(canMake, fuelSpace)} → fuel)</strong></div>
      <div class="statline"><span>Modules</span><strong>${state.ship.installedModules.join(', ')}</strong></div>
    </div>
    <div class="card">
      <strong>Actions</strong>
      <div class="small">Ship Rest uses 1 ration + 1 water. Restores full HP and abilities.</div>
      <div class="row-wrap" style="margin-top:8px">
        <button id="restOnShipBtn">Ship Rest</button>
        <button id="refuelShipBtn" ${fuelSpace <= 0 || canMake <= 0 ? 'disabled' : ''}>Scrap → Fuel (5:1)</button>
        <button id="openCargoBtn">Open Cargo</button>
      </div>
    </div>
    <div class="card">
      <strong>Ship Log</strong>
      ${(state.ship.notes || []).map(n => `<p class="small">${n}</p>`).join('') || '<p class="small">No entries.</p>'}
    </div>
  `;
  $('#restOnShipBtn').addEventListener('click', () => api?.shipRest?.());
  $('#refuelShipBtn').addEventListener('click', () => api?.convertScrapToFuel?.());
  $('#openCargoBtn').addEventListener('click', () => {
    const inv = $('#inventoryPanel');
    if (inv) { inv.classList.remove('hidden'); requestAnimationFrame(() => centerPanel(inv)); }
  });
}

// ─── SECTOR MAP ───────────────────────────────────────────────────────────────
export function renderSectorMap(state, data, api) {
  const root = $('#sectorMapBody');
  if (!root) return;
  root.innerHTML = '';
  const shipOwned = state.flags.shipOwned;
  if (!shipOwned) {
    root.innerHTML = `<div class="card warning">
      <strong>🔒 No Ship</strong>
      <p>You need to acquire the Scavenger's Wake before travelling between sectors.</p>
      <p class="small">Objective: Speak to the dock warden and impound clerk in the Civic Quarter, then find the Wake's berth.</p>
    </div>`;
  }
  data.config.sectorNodes.forEach(node => {
    const isCurrent = state.currentSectorNode === node.id;
    const blocked   = !shipOwned && node.fuelCost > 0;
    const card = createEl('div', { class: `travel-node ${blocked ? 'travel-node-blocked' : ''}` }, `
      <strong>${node.name}</strong>
      <div class="small">${node.type} · Danger: ${node.danger}</div>
      <p>${node.description}</p>
      <div class="statline"><span>Fuel Cost</span><strong>${node.fuelCost}</strong></div>
      <div class="row-wrap"></div>
    `);
    const btn = createEl('button', {}, isCurrent ? 'Current Location' : `Travel (${node.fuelCost} fuel)`);
    btn.disabled = isCurrent || blocked;
    if (blocked) btn.title = 'Acquire the ship first';
    btn.addEventListener('click', () => api.travelToSector(node.id));
    card.querySelector('.row-wrap').appendChild(btn);
    root.appendChild(card);
  });
}

// ─── SAVES ────────────────────────────────────────────────────────────────────
export function renderSaves(state, data, api) {
  const root = $('#savesBody');
  if (!root) return;
  root.innerHTML = '';

  const saves = api.listSaves();

  // Quick save button
  const quickRow = createEl('div', { class: 'card' });
  quickRow.innerHTML = '<strong>Quick Save / Load</strong><div class="small">Slot 1 is also the autosave slot.</div>';
  const quickSaveBtn = createEl('button', {}, '💾 Quick Save');
  quickSaveBtn.addEventListener('click', () => {
    api.saveToSlot(0, 'Autosave');
    renderSaves(state, data, api);
  });
  quickRow.appendChild(quickSaveBtn);
  root.appendChild(quickRow);

  // All slots
  for (let i = 0; i < 6; i++) {
    const save = saves.find(s => s.slot === i);
    const card = createEl('div', { class: 'card save-slot' });

    if (save) {
      const d = new Date(save.timestamp);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="row">
          <strong>${save.name}</strong>
          <span class="small">${dateStr}</span>
        </div>
        <div class="small">${save.mapId} · Cycle ${Math.floor(save.timeMinutes / 1440) + 1}</div>
        <div class="row-wrap" style="margin-top:8px"></div>
      `;
      const row = card.querySelector('.row-wrap');
      const loadBtn = createEl('button', {}, '▶ Load');
      loadBtn.addEventListener('click', () => {
        if (confirm(`Load "${save.name}"? Unsaved progress will be lost.`)) {
          api.loadFromSlot(i);
          // Close saves panel after loading
          $('#savesPanel')?.classList.add('hidden');
        }
      });
      const overwriteBtn = createEl('button', { class: 'secondary' }, '💾 Overwrite');
      overwriteBtn.addEventListener('click', () => {
        const name = prompt('Save name:', save.name) ?? save.name;
        api.saveToSlot(i, name);
        renderSaves(state, data, api);
      });
      const deleteBtn = createEl('button', { class: 'danger' }, '🗑 Delete');
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete "${save.name}"?`)) {
          api.deleteSaveSlot(i);
          renderSaves(state, data, api);
        }
      });
      row.append(loadBtn, overwriteBtn, deleteBtn);
    } else {
      card.innerHTML = `
        <div class="row"><strong>Slot ${i + 1}</strong><span class="small muted">Empty</span></div>
        <div class="row-wrap" style="margin-top:8px"></div>
      `;
      const saveBtn = createEl('button', {}, '💾 Save Here');
      saveBtn.addEventListener('click', () => {
        const name = prompt(`Name for slot ${i + 1}:`, `Save ${i + 1}`) ?? `Save ${i + 1}`;
        api.saveToSlot(i, name);
        renderSaves(state, data, api);
      });
      card.querySelector('.row-wrap').appendChild(saveBtn);
    }
    root.appendChild(card);
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
export function renderAdmin(state, data, api) {
  const root = $('#adminBody');
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <strong>Testing Controls</strong>
      <div class="row-wrap">
        <button id="adminHealBtn">Heal Party</button>
        <button id="adminFeedBtn">Feed Party</button>
        <button id="adminAddFuelBtn">+Fuel</button>
        <button id="adminAddCreditsBtn">+Credits</button>
        <button id="adminAddScrapBtn">+Scrap</button>
        <button id="adminUnlockShipBtn">Unlock Ship</button>
        <button id="adminToggleCombatBtn">Toggle Combat</button>
        <button id="adminSpawnEnemyBtn">Spawn Enemy</button>
        <button id="adminAdvanceHourBtn">+1 Hour</button>
        <button id="adminQuestAdvanceBtn">Advance Quest</button>
      </div>
    </div>
    <div class="card">
      <strong>Party Size</strong>
      <div class="small">Max: ${state.partyMax} / Admin max: ${data.config.party.adminMax}</div>
      <input id="partySizeInput" type="range" min="1" max="${data.config.party.adminMax}" value="${state.partyMax}" />
      <div id="partySizeLabel">${state.partyMax}</div>
    </div>
    <div class="card">
      <strong>State</strong>
      <div class="small">Fog tiles: ${Object.values(state.fogRevealed || {}).reduce((n, m) => n + Object.keys(m).length, 0)}</div>
      <div class="small">${Object.entries(state.flags).map(([k,v]) => `${k}: ${v}`).join('<br>')}</div>
    </div>
  `;
  $('#adminHealBtn').onclick        = api.adminHealParty;
  $('#adminFeedBtn').onclick        = api.adminFeedParty;
  $('#adminAddFuelBtn').onclick     = () => api.adjustResource('fuel', 4);
  $('#adminAddCreditsBtn').onclick  = () => api.adjustResource('credits', 250);
  $('#adminAddScrapBtn').onclick    = () => api.adjustResource('scrap', 25);
  $('#adminUnlockShipBtn').onclick  = api.adminUnlockShip;
  $('#adminToggleCombatBtn').onclick = api.adminToggleCombat;
  $('#adminSpawnEnemyBtn').onclick  = api.adminSpawnEnemy;
  $('#adminAdvanceHourBtn').onclick = () => api.advanceTime(60);
  $('#adminQuestAdvanceBtn').onclick = api.adminAdvanceMainQuest;
  $('#partySizeInput').oninput = e => {
    state.partyMax = Number(e.target.value);
    $('#partySizeLabel').textContent = state.partyMax;
  };
}

// ─── DIALOGUE ─────────────────────────────────────────────────────────────────
export function renderDialogue(state, data, api, nodeId, speakerActor) {
  const root = $('#dialogueBody');
  const node = data.dialogue.nodes[nodeId];
  if (!node) {
    root.innerHTML = `<div class="card"><em class="small">Missing dialogue node: ${nodeId}</em></div>`;
    return;
  }
  const speaker = speakerActor?.name || node.speaker || 'Unknown';
  root.innerHTML = `
    <div class="card">
      <div class="dialogue-speaker">${speaker}</div>
      <div class="dialogue-npc-line">${node.text}</div>
    </div>
  `;
  (node.choices || []).forEach(choice => {
    const hasCheck = !!choice.check;
    // Show roll info but don't pre-determine outcome — player rolls
    let label = choice.label;
    if (hasCheck) {
      const actor = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean)
        .find(a => a.id === state.selectedActorId)
        || state.roster.find(a => state.party.includes(a.id) && !a.dead);
      const bonus = actor ? Math.floor((actor.stats[choice.check.stat] - 10) / 2) + actor.level + (choice.check.bonus || 0) : 0;
      const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
      label += ` [${choice.check.stat.toUpperCase()} DC ${choice.check.dc} · d20${bonusStr}]`;
    }
    const btn = createEl('button', { class: `choice ${hasCheck ? 'check-pending' : ''}` }, label);
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (hasCheck) {
        _showDiceRoll(choice, state, data, api, speakerActor, root);
      } else {
        const result = api.evaluateChoice(choice);
        api.resolveDialogueChoice(choice, result, speakerActor);
      }
    });
    root.appendChild(btn);
  });
}

function _showDiceRoll(choice, state, data, api, speakerActor, dialogueRoot) {
  const actor = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean)
    .find(a => a.id === state.selectedActorId)
    || state.roster.find(a => state.party.includes(a.id) && !a.dead);

  const stat   = choice.check.stat;
  const dc     = choice.check.dc;
  const modVal = actor ? Math.floor((actor.stats[stat] - 10) / 2) + actor.level + (choice.check.bonus || 0) : 0;
  const modStr = modVal >= 0 ? `+${modVal}` : `${modVal}`;
  let rolling  = false;

  const panel = createEl('div', { class: 'dice-panel' });
  panel.innerHTML = `
    <div class="dice-header">
      <div class="dice-label">${choice.label}</div>
      <div class="small">${stat.toUpperCase()} check · DC ${dc} · d20${modStr}</div>
    </div>
    <div class="dice-visual">
      <div class="dice-face" id="diceFace">?</div>
    </div>
    <div id="diceResult" class="dice-result hidden"></div>
    <div class="row-wrap" style="justify-content:center;margin-top:14px;gap:10px">
      <button id="rollDiceBtn" class="action-main-btn">🎲 Roll</button>
      <button id="cancelDiceBtn" class="secondary">← Back</button>
    </div>
  `;
  dialogueRoot.appendChild(panel);

  const face      = panel.querySelector('#diceFace');
  const resultDiv = panel.querySelector('#diceResult');
  panel.querySelector('#cancelDiceBtn').addEventListener('click', () => panel.remove());
  panel.querySelector('#rollDiceBtn').addEventListener('click', () => {
    if (rolling) return;
    rolling = true;
    const rollBtn = panel.querySelector('#rollDiceBtn');
    rollBtn.disabled = true;
    let ticks = 0;
    const spin = setInterval(() => {
      face.textContent = Math.floor(Math.random() * 20) + 1;
      ticks++;
      if (ticks > 16) {
        clearInterval(spin);
        const raw   = Math.floor(Math.random() * 20) + 1;
        const total = raw + modVal;
        const pass  = total >= dc;
        face.textContent = raw;
        face.className = `dice-face ${pass ? 'dice-pass' : 'dice-fail'}`;
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
          <div class="dice-total ${pass ? 'good' : 'danger-text'}">
            ${raw} ${modVal !== 0 ? (modVal > 0 ? '+ ' : '− ') + Math.abs(modVal) + ' = ' : '= '}<strong>${total}</strong>
            ${pass ? '✓ Success' : '✗ Failure'} vs DC ${dc}
          </div>
          <div class="small" style="margin-top:4px">${pass ? (choice.passText || 'The check succeeds.') : (choice.failText || 'The check fails.')}</div>
        `;
        setTimeout(() => {
          panel.remove();
          api.resolveDialogueChoice(choice, { pass, roll: raw, mod: modVal, total, rollText: `${raw}${modStr}=${total}` }, speakerActor);
        }, 1800);
      }
    }, 75);
  });
}

// ─── VENDOR TRADE PANEL ───────────────────────────────────────────────────────
export function renderVendor(state, data, api, vendor) {
  const root = $('#inspectBody');
  if (!root) return;

  const playerActor = state.roster.find(a => a.id === state.selectedActorId && state.party.includes(a.id))
    || state.roster.find(a => state.party.includes(a.id) && !a.dead);

  const stockItems = (vendor.vendorInventory || []).map(entry => {
    const item = getById(data.items, entry.itemId);
    return { item, qty: entry.qty, itemId: entry.itemId };
  }).filter(e => e.item);

  const markup   = vendor.vendorMarkup   ?? 1.4;
  const credits  = state.resources.credits;

  root.innerHTML = `
    <div class="vendor-layout">
      <div class="vendor-header">
        <div class="vendor-name">🛒 ${vendor.name}</div>
        <div class="vendor-credits">Your Credits: <strong>${credits}¢</strong></div>
      </div>
      <div class="vendor-columns">
        <div class="vendor-col">
          <div class="vendor-col-title">FOR SALE</div>
          <div class="vendor-stock" id="vendorStock">
            ${stockItems.length ? stockItems.map((e, i) => {
              const price = Math.ceil((e.item.value || 10) * markup);
              const canAfford = credits >= price;
              return `<div class="vendor-item ${canAfford ? '' : 'vendor-cant-afford'}" data-vi="${i}">
                <div class="vendor-item-name">${e.item.name}</div>
                <div class="vendor-item-meta small">${e.item.type} · ${e.item.rarity || 'common'}</div>
                <div class="vendor-item-desc small">${e.item.description || ''}</div>
                <div class="vendor-item-price ${canAfford ? 'good' : 'danger-text'}">${price}¢</div>
                <button class="vend-buy-btn" data-itemid="${e.itemId}" data-price="${price}" ${canAfford ? '' : 'disabled'}>Buy</button>
              </div>`;
            }).join('') : '<div class="small muted">Nothing in stock.</div>'}
          </div>
        </div>
        <div class="vendor-col">
          <div class="vendor-col-title">YOUR INVENTORY</div>
          <div class="vendor-player-inv" id="vendorPlayerInv">
            ${(playerActor?.inventory || []).map((entry, i) => {
              const item = getById(data.items, entry.itemId);
              if (!item || item.type === 'quest') return '';
              const earnAmt = (item.sellValue || Math.floor((item.value || 10) * 0.4)) * entry.qty;
              return `<div class="vendor-item" data-pi="${i}">
                <div class="vendor-item-name">${entry.customName || item.name}</div>
                <div class="vendor-item-meta small">${item.type} · x${entry.qty}</div>
                <div class="vendor-item-price good">${earnAmt}¢</div>
                <button class="vend-sell-btn" data-actorid="${playerActor.id}" data-idx="${i}">Sell</button>
              </div>`;
            }).join('') || '<div class="small muted">Nothing to sell.</div>'}
          </div>
        </div>
      </div>
      <button id="vendorCloseBtn" class="secondary" style="margin-top:10px;width:100%">Close</button>
    </div>
  `;

  root.querySelectorAll('.vend-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      api.buyFromVendor(vendor.id, btn.dataset.itemid, 1);
      renderVendor(state, data, api, vendor); // refresh
    });
  });
  root.querySelectorAll('.vend-sell-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      api.sellToVendor(vendor.id, btn.dataset.actorid, parseInt(btn.dataset.idx));
      renderVendor(state, data, api, vendor); // refresh
    });
  });
  root.querySelector('#vendorCloseBtn')?.addEventListener('click', () => {
    state.activeVendorId = null;
    $('#inspectPanel')?.classList.add('hidden');
  });
}

// ─── SKILL CHECK DICE ROLL (Lockpick / Pickpocket / generic) ─────────────────
// Called when state.pendingSkillCheck is set. Renders a dice roll UI
// and calls the appropriate resolve method on completion.
export function renderSkillCheckIfPending(state, data, api) {
  const check = state.pendingSkillCheck;
  if (!check) return;

  // Only inject once
  if (document.getElementById('skillCheckOverlay')) return;

  const overlay = createEl('div', {
    class: 'skill-check-overlay',
    id: 'skillCheckOverlay'
  });

  const modStr = check.mod >= 0 ? `+${check.mod}` : `${check.mod}`;
  overlay.innerHTML = `
    <div class="dice-panel skill-check-panel">
      <div class="dice-header">
        <div class="dice-label">${check.label}</div>
        <div class="small">${check.statLabel} · d20${modStr} vs DC ${check.dc}</div>
      </div>
      <div class="dice-visual">
        <div class="dice-face" id="scDiceFace">?</div>
      </div>
      <div id="scDiceResult" class="dice-result hidden"></div>
      <div class="row-wrap" style="justify-content:center;margin-top:14px;gap:10px">
        <button id="scRollBtn" class="action-main-btn">🎲 Roll</button>
        <button id="scCancelBtn" class="secondary">← Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let rolling = false;
  const face      = overlay.querySelector('#scDiceFace');
  const resultDiv = overlay.querySelector('#scDiceResult');

  overlay.querySelector('#scCancelBtn').addEventListener('click', () => {
    state.pendingSkillCheck = null;
    overlay.remove();
    api.renderAll();
  });

  overlay.querySelector('#scRollBtn').addEventListener('click', () => {
    if (rolling) return;
    rolling = true;
    overlay.querySelector('#scRollBtn').disabled = true;
    let ticks = 0;
    const spin = setInterval(() => {
      face.textContent = Math.floor(Math.random() * 20) + 1;
      ticks++;
      if (ticks > 16) {
        clearInterval(spin);
        const raw   = Math.floor(Math.random() * 20) + 1;
        const total = raw + check.mod;
        const pass  = total >= check.dc;
        face.textContent = raw;
        face.className   = `dice-face ${pass ? 'dice-pass' : 'dice-fail'}`;
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
          <div class="dice-total ${pass ? 'good' : 'danger-text'}">
            ${raw} ${check.mod !== 0 ? (check.mod > 0 ? '+ ' : '− ') + Math.abs(check.mod) + ' = ' : '= '}<strong>${total}</strong>
            ${pass ? '✓ Success' : '✗ Failure'} vs DC ${check.dc}
          </div>
        `;
        setTimeout(() => {
          overlay.remove();
          // Route to the right resolver based on key
          if (check.resolveKey === 'lockpick')   api.resolveLockpick?.(total, pass);
          else if (check.resolveKey === 'pickpocket') api.resolvePickpocket?.(total, pass);
          else api.renderAll?.();
        }, 1600);
      }
    }, 75);
  });
}

// ─── INSPECT ──────────────────────────────────────────────────────────────────
export function renderInspect(state, data, html) {
  const root = $('#inspectBody');
  if (!root) return;
  // Only preserve vendor view if the inspect panel is open AND showing vendor content
  // If html is being explicitly set, always render it (activeVendorId cleared by callers)
  root.innerHTML = html;
}

// ─── CODEX ────────────────────────────────────────────────────────────────────
export function renderCodex() {
  const root = $('#codexBody');
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <strong>How to play Spaced</strong>
      <p>Click or tap any tile to see available actions — move, talk, loot, or interact. You must be within 5 tiles to talk or loot. During combat, use the action buttons then End Turn.</p>
    </div>
    <div class="card">
      <strong>Controls</strong>
      <p><strong>PC:</strong> Left-click to interact. Right-click for the action menu. Scroll to zoom. Drag empty space to pan.</p>
      <p><strong>Mobile:</strong> Tap to interact. Pinch to zoom. Drag empty map to pan. Use ▼ to collapse the bottom bar.</p>
    </div>
    <div class="card">
      <strong>What's in this build</strong>
      <p>Exploration, turn-based combat, party control, inventory, equipment, survival, dialogue trees with skill checks, ship hub, sector travel, quests, faction reputation, stealth, companion affinity, romance, fog of war, step movement, save/load, and JSON-driven content.</p>
    </div>
    <div class="card">
      <strong>Running locally</strong>
      <p>Use a local server. Example: <code>python -m http.server 8000</code></p>
    </div>
  `;
}
