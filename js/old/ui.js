import { $, $$, clamp, createEl, formatTime, getById } from './utils.js';

function bindLongPress(el, onLongPress, { threshold = 450, moveTolerance = 10 } = {}) {
  let timer = null;
  let startX = 0, startY = 0;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      timer = null;
      onLongPress(e);
    }, threshold);
  });

  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > moveTolerance || Math.abs(e.clientY - startY) > moveTolerance) clear();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => el.addEventListener(type, clear));
}

export function initPanels(state, api) {
  $$('.panel').forEach((panel, idx) => {
    panel.style.left = `${40 + idx * 18}px`;
    panel.style.top = `${92 + idx * 10}px`;
    const header = panel.querySelector('.panel-header');
    const closeBtn = panel.querySelector('.close-btn');
    const collapseBtn = panel.querySelector('.collapse-btn');
    const stopHeaderButton = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['pointerdown', 'click'].forEach(type => {
      closeBtn.addEventListener(type, stopHeaderButton);
      collapseBtn.addEventListener(type, stopHeaderButton);
    });
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
    collapseBtn.addEventListener('click', () => panel.classList.toggle('collapsed'));

    let dragging = false, offX = 0, offY = 0;
    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      panel.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      panel.style.left = `${clamp(e.clientX - offX, 4, window.innerWidth - 150)}px`;
      panel.style.top = `${clamp(e.clientY - offY, 4, window.innerHeight - 50)}px`;
      panel.style.right = 'auto';
      panel.style.transform = 'none';
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => header.addEventListener(type, () => dragging = false));
  });

  $$('[data-panel]').forEach(btn => btn.addEventListener('click', () => {
    const panel = document.getElementById(btn.dataset.panel);
    panel.classList.toggle('hidden');
    panel.classList.remove('collapsed');
  }));

  $('#openCodexBtn').addEventListener('click', () => {
    $('#codexPanel').classList.remove('hidden');
    $('#splash').classList.remove('active');
    $('#gameRoot').classList.add('active');
    api.renderCodex();
  });
}

export function renderTopHUD(state, data) {
  $('#worldClock').textContent = formatTime(state.timeMinutes);
  $('#locationName').textContent = currentMap(state, data)?.name || '—';
  const currentTurnActor = state.combat.active
    ? state.roster.find(a => a.id === state.combat.turnOrder[state.combat.currentTurnIndex])
    : null;
  $('#modeName').textContent = state.combat.active ? `Combat · ${currentTurnActor?.name || '—'}` : 'Exploration';
  $('#threatName').textContent = state.combat.active ? `Round ${state.combat.round}` : (currentMap(state, data)?.threat || 'Low');
  document.body.classList.toggle('in-combat', !!state.combat.active);
}

export function renderPartyStrip(state, data, api) {
  const root = $('#partyStrip');
  root.innerHTML = '';
  const party = state.party.map(id => state.roster.find(a => a.id === id)).filter(Boolean);
  party.forEach(actor => {
    const card = createEl('div', { class: `party-card ${state.selectedActorId === actor.id ? 'selected' : ''}` });
    card.innerHTML = `
      <div class="row"><strong>${actor.name}</strong><span class="small">${actor.classId}</span></div>
      <div class="small">${actor.speciesId} · Lv ${actor.level} · Affinity ${actor.affinity ?? 0}</div>
      <div class="bar"><div class="fill" style="width:${(actor.hp/actor.hpMax)*100}%;background:${actor.downed?'#555':'#ff6e6e'}"></div></div>
      <div class="small">HP ${actor.hp}/${actor.hpMax} ${actor.dead ? '· DEAD' : actor.downed ? '· DOWN' : ''}</div>
      <div class="bar"><div class="fill" style="width:${actor.survival.hunger}%;background:#ffcc6b"></div></div>
      <div class="small">Hunger ${Math.round(actor.survival.hunger)} · Thirst ${Math.round(actor.survival.thirst)} · Morale ${Math.round(actor.survival.morale)}</div>
    `;
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

export function renderMap(state, data, api) {
  const map = currentMap(state, data);
  const tileLayer = $('#tileLayer');
  const entityLayer = $('#entityLayer');
  tileLayer.innerHTML = '';
  entityLayer.innerHTML = '';
  if (!map) return;
  const size = data.config.map.tileSize;
  document.documentElement.style.setProperty('--tile', `${size}px`);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y][x];
      const tile = createEl('div', { class: `tile ${t.type} ${t.cover ? 'cover' : ''} ${t.interact ? 'interact' : ''} ${t.loot ? 'loot' : ''}` });
      tile.style.left = `${x * size}px`;
      tile.style.top = `${y * size}px`;
      tile.style.width = `${size}px`;
      tile.style.height = `${size}px`;
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.addEventListener('click', (e) => api.handleTileClick(x, y, e));
      bindLongPress(tile, (e) => api.handleTileContext(x, y, e));
      tile.addEventListener('contextmenu', (e) => e.preventDefault());
      tileLayer.appendChild(tile);
    }
  }

  const actorsHere = state.roster.filter(a => a.mapId === state.mapId);
  actorsHere.forEach(actor => {
    const ent = createEl('div', { class: `entity ${actor.role} ${actor.downed ? 'down' : ''} ${state.selectedActorId === actor.id ? 'selected' : ''} ${actor.statuses.includes('stealthed') ? 'stealthed' : ''}` });
    ent.style.left = `${actor.x * size}px`;
    ent.style.top = `${actor.y * size}px`;
    ent.innerHTML = `<span>${actor.name.split(' ').map(w => w[0]).slice(0,2).join('')}</span><div class="bubble">${actor.name}</div>`;
    ent.addEventListener('click', (e) => { e.stopPropagation(); api.handleActorPrimary(actor.id, e); });
    bindLongPress(ent, (e) => {
      e.stopPropagation();
      api.handleActorLongPress(actor.id, e.clientX, e.clientY);
    });
    ent.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    entityLayer.appendChild(ent);
  });
}

export function renderResources(state) {
  const resourceBar = $('#resourceBar');
  resourceBar.innerHTML = '';
  const items = [
    ['Credits', state.resources.credits],
    ['Fuel', `${state.resources.fuel}/${state.ship.fuelCapacity}`],
    ['Rations', state.resources.rations],
    ['Water', state.resources.water],
    ['Supplies', state.resources.shipSupplies],
    ['Medgel', state.resources.medgel],
    ['Scrap', state.resources.scrap]
  ];
  items.forEach(([label, val]) => {
    const chip = createEl('div', { class: 'resource-chip' }, `<strong>${label}</strong>: ${val}`);
    resourceBar.appendChild(chip);
  });
}


export function renderActionBar(state, data, api) {
  const root = $('#actionBar');
  root.innerHTML = '';
  const selectedActor = state.roster.find(a => a.id === state.selectedActorId);
  const currentTurnActor = state.combat.active
    ? state.roster.find(a => a.id === state.combat.turnOrder[state.combat.currentTurnIndex])
    : null;
  const actor = currentTurnActor || selectedActor;
  if (!actor) return;

  const actionUsed = !!state.combat.acted?.[actor.id];
  const bonusUsed = !!state.combat.bonusActed?.[actor.id];
  const reactionUsed = !!state.combat.reactionSpent?.[actor.id];
  const movementLeft = state.combat.active
    ? (state.combat.movementLeft[actor.id] ?? actor.moveRange ?? 0)
    : (actor.moveRange ?? actor.movement ?? 0);
  const pendingType = typeof state.ui.pendingAction === 'string'
    ? state.ui.pendingAction
    : state.ui.pendingAction?.type || null;
  const pendingAbilityId = typeof state.ui.pendingAction === 'object'
    ? state.ui.pendingAction?.abilityId || null
    : null;

  const turnInfo = state.combat.active
    ? `<strong>Turn:</strong> ${actor.name} · <strong>Move:</strong> ${movementLeft} · <strong>Action:</strong> ${actionUsed ? 'Spent' : 'Ready'} · <strong>Bonus:</strong> ${bonusUsed ? 'Spent' : 'Ready'} · <strong>Reaction:</strong> ${reactionUsed ? 'Spent' : 'Ready'}`
    : `<strong>Selected:</strong> ${actor.name}`;
  root.appendChild(createEl('div', { class: 'turn-chip' }, turnInfo));

  if (state.combat.active) {
    const roster = createEl('div', { class: 'combat-roster' });
    state.combat.turnOrder.forEach(id => {
      const unit = state.roster.find(a => a.id === id);
      if (!unit) return;
      const chip = createEl('button', {
        class: `combatant-chip ${unit.role} ${unit.dead ? 'dead' : ''} ${unit.id === actor.id ? 'current' : ''}`,
        onclick: () => {
          state.selectedActorId = unit.id;
          api.centerOnActor(unit);
          api.renderAll();
        }
      }, `${unit.name} <span>${Math.max(0, unit.hp)}/${unit.hpMax}</span>`);
      roster.appendChild(chip);
    });
    root.appendChild(roster);
  }

  const actions = [
    ['Move', () => api.setPendingAction('move')],
    ['Attack', () => api.setPendingAction('attack')],
    ['Stealth', () => api.toggleStealth(actor.id)],
    ['Use Item', () => api.openPanel('inventoryPanel')],
    ['Talk', () => api.setPendingAction('talk')],
    ['Loot', () => api.setPendingAction('loot')],
    ['Rest', () => api.longRest()]
  ];
  actions.forEach(([label, fn]) => {
    const key = label.toLowerCase().replace(/ item/, '');
    const btn = createEl('button', { class: `action-chip ${pendingType === key ? 'active' : ''}`, onclick: fn }, label);
    if (state.combat.active) {
      if (label === 'Attack' && actionUsed) btn.disabled = true;
      if (label === 'Stealth' && bonusUsed) btn.disabled = true;
      if (label === 'Rest') btn.disabled = true;
      if (label === 'Talk' || label === 'Loot') btn.disabled = false;
    }
    root.appendChild(btn);
  });

  if (actor.abilities?.length) {
    const abilityWrap = createEl('div', { class: 'ability-strip' });
    actor.abilities.forEach(abilityId => {
      const ability = getById(data.abilities, abilityId);
      if (!ability) return;

      let suffix = '';
      if (ability.powerSource && actor.powerPools?.[ability.powerSource]) {
        const pool = actor.powerPools[ability.powerSource];
        suffix = ` · ${pool.label}: ${pool.current}/${pool.max}`;
      } else if (ability.usesPerRest && actor.abilityUses?.[ability.id]) {
        const entry = actor.abilityUses[ability.id];
        suffix = ` · Uses: ${entry.current}/${entry.max}`;
      }

      const disabled = state.combat.active && (
        (ability.costType === 'bonus' ? bonusUsed : ability.costType === 'reaction' ? reactionUsed : ability.costType === 'free' ? false : actionUsed)
      );

      const btn = createEl('button', {
        class: `action-chip ability-chip ${pendingType === 'ability' && pendingAbilityId === ability.id ? 'active' : ''}`,
        onclick: () => api.setPendingAction({ type: 'ability', abilityId: ability.id })
      }, `${ability.name}${suffix}`);
      if (disabled) btn.disabled = true;
      abilityWrap.appendChild(btn);
    });
    root.appendChild(abilityWrap);
  }
}

export function renderMessages(state) {(state) {
  const root = $('#messageLog');
  root.innerHTML = state.ui.messages.slice(-14).map(m => `<div>${m}</div>`).join('');
  root.scrollTop = root.scrollHeight;
}

export function pushMessage(state, msg) {
  state.ui.messages.push(msg);
}

export function renderJournal(state, data) {
  const root = $('#journalBody');
  root.innerHTML = '';
  const quests = data.quests;
  quests.forEach(q => {
    const progress = state.quests[q.id] || { stage: 0, complete: false, failed: false };
    const stage = q.stages[progress.stage] || q.stages[q.stages.length - 1];
    const card = createEl('div', { class: 'card' }, `
      <strong>${q.name}</strong>
      <div class="small">${q.category}</div>
      <p>${q.description}</p>
      <div><span class="badge">${progress.complete ? 'Complete' : progress.failed ? 'Failed' : 'Active'}</span>
      <span class="badge">Stage ${progress.stage + 1}/${q.stages.length}</span></div>
      <p><strong>Current Objective:</strong> ${stage?.text || 'No current objective.'}</p>
    `);
    root.appendChild(card);
  });
}

export function renderInventory(state, data, api) {
  const root = $('#inventoryBody');
  const actor = state.roster.find(a => a.id === state.selectedActorId) || state.roster.find(a => state.party.includes(a.id));
  if (!actor) return;
  root.innerHTML = '';
  const containerItems = actor.inventory;
  const actorCol = createEl('div', { class: 'card' });
  actorCol.innerHTML = `<strong>${actor.name}</strong><div class="small">${actor.classId} · ${actor.speciesId}</div>`;

  const equip = createEl('div', { class: 'grid-2' });
  Object.entries(actor.equipped).forEach(([slot, itemId]) => {
    const item = itemId ? getById(data.items, itemId) : null;
    const slotEl = createEl('div', { class: 'equip-slot', dataset: { slot } }, `<div><strong>${slot}</strong><div class="small">${item?.name || 'Empty'}</div></div>`);
    slotEl.addEventListener('click', () => api.inspectEquipmentSlot(actor.id, slot));
    equip.appendChild(slotEl);
  });
  actorCol.appendChild(equip);

  const bagCol = createEl('div', { class: 'card' }, `<strong>Inventory</strong><div class="small">Drag, drop, inspect, use, send, rename containers, stash cargo.</div>`);
  const grid = createEl('div', { class: 'slot-grid' });
  containerItems.forEach((entry, idx) => {
    const item = getById(data.items, entry.itemId);
    const itemEl = createEl('div', { class: 'slot', dataset: { idx } });
    const inner = createEl('div', { class: 'item', draggable: 'true' }, `<strong>${entry.customName || item?.name || entry.itemId}</strong><div class="meta">${item?.type || 'misc'} x${entry.qty}</div>`);
    inner.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', JSON.stringify({ ownerId: actor.id, idx })));
    inner.addEventListener('click', (e) => api.inspectInventoryItem(actor.id, idx, e.clientX, e.clientY));
    bindLongPress(inner, (e) => api.inspectInventoryItem(actor.id, idx, e.clientX, e.clientY, true));
    inner.addEventListener('contextmenu', (e) => e.preventDefault());
    itemEl.appendChild(inner);
    itemEl.addEventListener('dragover', e => e.preventDefault());
    itemEl.addEventListener('drop', e => api.handleInventoryDrop(e, actor.id, idx));
    grid.appendChild(itemEl);
  });
  for (let i = containerItems.length; i < 20; i++) {
    const slot = createEl('div', { class: 'slot', dataset: { idx: i } }, `<span class="small">Empty</span>`);
    slot.addEventListener('dragover', e => e.preventDefault());
    slot.addEventListener('drop', e => api.handleInventoryDrop(e, actor.id, i));
    grid.appendChild(slot);
  }
  bagCol.appendChild(grid);

  const stashCol = createEl('div', { class: 'card' }, `<strong>Ship Cargo</strong><div class="small">Shared storage aboard the ship.</div>`);
  const stashGrid = createEl('div', { class: 'slot-grid' });
  state.ship.cargo.forEach((entry, idx) => {
    const item = getById(data.items, entry.itemId);
    const slot = createEl('div', { class: 'slot' });
    slot.innerHTML = `<div class="item"><strong>${entry.customName || item?.name || entry.itemId}</strong><div class="meta">${item?.type || 'misc'} x${entry.qty}</div></div>`;
    slot.addEventListener('click', () => api.inspectCargoItem(idx));
    bindLongPress(slot, () => api.inspectCargoItem(idx));
    stashGrid.appendChild(slot);
  });
  for (let i = state.ship.cargo.length; i < 15; i++) stashGrid.appendChild(createEl('div', { class: 'slot' }, `<span class="small">Empty</span>`));
  stashCol.appendChild(stashGrid);

  const wrap = createEl('div', { class: 'inventory-columns' });
  wrap.append(actorCol, bagCol, stashCol);
  root.appendChild(wrap);
}

export function renderCrew(state, data) {
  const root = $('#crewBody');
  root.innerHTML = '';
  state.roster.filter(a => a.role === 'ally' || state.party.includes(a.id)).forEach(actor => {
    const card = createEl('div', { class: 'card' }, `
      <strong>${actor.name}</strong>
      <div class="small">${actor.classId} · ${actor.speciesId}</div>
      <p>${actor.bio || 'No biography yet.'}</p>
      <div class="statline"><span>Affinity</span><strong>${actor.affinity ?? 0}</strong></div>
      <div class="statline"><span>Romance Stage</span><strong>${actor.romance?.stage || 0}</strong></div>
      <div class="statline"><span>Morale</span><strong>${Math.round(actor.survival.morale)}</strong></div>
      <div class="small">${actor.romance?.active ? 'Romance active.' : 'Not currently in romance.'}</div>
    `);
    root.appendChild(card);
  });
}

export function renderShip(state) {
  const root = $('#shipBody');
  root.innerHTML = `
    <div class="card">
      <strong>${state.ship.name}</strong>
      <div class="small">Mobile home base, safe-rest zone, cargo hold, companion hub, and travel interface.</div>
      <div class="statline"><span>Hull Integrity</span><strong>${state.ship.hull}%</strong></div>
      <div class="statline"><span>Fuel</span><strong>${state.resources.fuel}/${state.ship.fuelCapacity}</strong></div>
      <div class="statline"><span>Modules</span><strong>${state.ship.installedModules.join(', ')}</strong></div>
      <div class="statline"><span>Notes</span><strong>${state.ship.notes.length}</strong></div>
    </div>
    <div class="card">
      <strong>Deck Layout</strong>
      <p>Bridge · Sensor Nook · Bunks · Galley · Cargo Bay · Smuggler Hold · Medbay · Engine Room</p>
      <div class="row-wrap">
        <button id="restOnShipBtn">Ship Rest</button>
        <button id="refuelShipBtn">Convert Scrap to Fuel</button>
        <button id="openCargoBtn">Open Cargo</button>
      </div>
    </div>
  `;
}

export function renderSectorMap(state, data, api) {
  const root = $('#sectorMapBody');
  root.innerHTML = '';
  data.config.sectorNodes.forEach(node => {
    const card = createEl('div', { class: 'travel-node' }, `
      <strong>${node.name}</strong>
      <div class="small">${node.type} · Danger ${node.danger}</div>
      <p>${node.description}</p>
      <div class="statline"><span>Fuel Cost</span><strong>${node.fuelCost}</strong></div>
      <div class="row-wrap"></div>
    `);
    const row = card.querySelector('.row-wrap');
    const btn = createEl('button', {}, state.currentSectorNode === node.id ? 'Current Location' : 'Travel Here');
    if (state.currentSectorNode === node.id) btn.disabled = true;
    btn.addEventListener('click', () => api.travelToSector(node.id));
    row.appendChild(btn);
    root.appendChild(card);
  });
}

export function renderAdmin(state, data, api) {
  const root = $('#adminBody');
  root.innerHTML = `
    <div class="card">
      <strong>Testing Controls</strong>
      <div class="row-wrap">
        <button id="adminHealBtn">Heal Party</button>
        <button id="adminFeedBtn">Feed Party</button>
        <button id="adminAddFuelBtn">+Fuel</button>
        <button id="adminAddCreditsBtn">+Credits</button>
        <button id="adminToggleCombatBtn">Toggle Combat</button>
        <button id="adminSpawnEnemyBtn">Spawn Enemy</button>
        <button id="adminAdvanceHourBtn">+1 Hour</button>
        <button id="adminQuestAdvanceBtn">Advance Main Quest</button>
      </div>
    </div>
    <div class="card">
      <strong>Party Size</strong>
      <div class="small">Current max: ${state.partyMax}. Default is ${data.config.party.defaultMax}. Admin maximum is ${data.config.party.adminMax}.</div>
      <input id="partySizeInput" type="range" min="1" max="${data.config.party.adminMax}" value="${state.partyMax}" />
      <div id="partySizeLabel">${state.partyMax}</div>
    </div>
    <div class="card">
      <strong>Flags</strong>
      <div class="small">${Object.entries(state.flags).map(([k,v]) => `${k}: ${v}`).join('<br>')}</div>
    </div>
  `;
  $('#adminHealBtn').onclick = api.adminHealParty;
  $('#adminFeedBtn').onclick = api.adminFeedParty;
  $('#adminAddFuelBtn').onclick = () => api.adjustResource('fuel', 2);
  $('#adminAddCreditsBtn').onclick = () => api.adjustResource('credits', 250);
  $('#adminToggleCombatBtn').onclick = api.adminToggleCombat;
  $('#adminSpawnEnemyBtn').onclick = api.adminSpawnEnemy;
  $('#adminAdvanceHourBtn').onclick = () => api.advanceTime(60);
  $('#adminQuestAdvanceBtn').onclick = api.adminAdvanceMainQuest;
  $('#partySizeInput').oninput = (e) => {
    state.partyMax = Number(e.target.value);
    $('#partySizeLabel').textContent = state.partyMax;
  };
}

export function renderDialogue(state, data, api, nodeId, speakerActor) {
  const root = $('#dialogueBody');
  const node = data.dialogue.nodes[nodeId];
  if (!node) {
    root.innerHTML = '<div class="card">Dialogue node missing.</div>';
    return;
  }
  const speaker = speakerActor?.name || node.speaker || 'Unknown';
  const portrait = speakerActor?.portrait || '';
  root.innerHTML = `
    <div class="card">
      <div class="dialogue-speaker">${speaker}</div>
      <div class="small">${portrait ? `Voice: ${speakerActor.voice || 'placeholder'}` : 'Audio hook ready for future voice files.'}</div>
      <p>${node.text}</p>
    </div>
  `;
  (node.choices || []).forEach(choice => {
    const result = api.evaluateChoice(choice);
    const btn = createEl('button', { class: `choice ${result.pass ? 'check-pass' : choice.check ? 'check-fail' : ''}` },
      `${choice.label}${choice.check ? ` [${choice.check.stat.toUpperCase()} DC ${choice.check.dc}]` : ''}${result.passText ? ` — ${result.passText}` : result.failText ? ` — ${result.failText}` : ''}`);
    btn.disabled = choice.check && !result.pass && choice.failTarget == null;
    btn.addEventListener('click', () => api.resolveDialogueChoice(choice, result, speakerActor));
    root.appendChild(btn);
  });
}

export function renderInspect(state, data, html) {
  $('#inspectBody').innerHTML = html;
}

export function renderCodex() {
  $('#codexBody').innerHTML = `
    <div class="card">
      <strong>What this MVP already supports</strong>
      <p>Exploration on a top-down map, same-map turn-based combat, party control, drag/drop inventory, equipment, status effects, survival pressures, dialogue trees, skill checks, ship hub, sector travel, quests, faction reputation, crime, stealth, companion affinity, romance hooks, admin/testing tools, save/load, and JSON-driven content.</p>
    </div>
    <div class="card">
      <strong>How to expand it later</strong>
      <p>Add or edit content in the data folder: maps, dialogue, items, companions, quests, classes, species, statuses, and encounters. Swap placeholder files in the assets folders without changing code as long as you keep names consistent.</p>
    </div>
    <div class="card">
      <strong>Important note</strong>
      <p>Because this uses fetch to load JSON, run it from a local web server rather than opening the HTML file directly. For example: <code>python -m http.server 8000</code> from the project folder.</p>
    </div>
  `;
}
