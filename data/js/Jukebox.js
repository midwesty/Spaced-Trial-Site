/**
 * SPACE STYLE JAMS — Jukebox System for Spaced
 * =============================================
 * Entry point: openJukebox(jukeboxId, state, data, api)
 * Proximity: updateJukeboxProximity(playerX, playerY, mapId, state, data)
 *
 * Data-driven: jukeboxes defined in data.jukeboxes[]
 * Songs: up to 10 slots per jukebox (configurable via songSlots)
 * Cost: 1 credit per song queued (configurable via costPerSong)
 * Audio: files in assets/audio/jukebox/ — fails silently if missing
 *
 * Proximity model: loudest within 2 tiles, audible up to 10 tiles,
 * silent beyond. Called each time player moves.
 */

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _jkOverlay   = null;
let _jkState     = null;
let _jkData      = null;
let _jkApi       = null;
let _jkDef       = null;      // current jukebox definition
let _jkAnim      = null;      // rAF id for visualizer
let _jkAudioCtx  = null;      // Web Audio context
let _jkGainNode  = null;      // master gain for proximity fade
let _jkSource    = null;      // current AudioBufferSourceNode
let _jkBuffer    = null;      // current loaded AudioBuffer
let _jkStartedAt = 0;         // when current song started (audioCtx.currentTime)
let _jkPausedAt  = 0;         // offset when paused
let _jkPlaying   = false;
let _jkQueue     = [];        // [{ title, artist, file, addedBy }]
let _jkHistory   = [];        // last 5 played
let _jkCurrentSong = null;
let _jkVisBars   = 32;
let _jkVisData   = new Float32Array(_jkVisBars).fill(0);
let _jkAnalyser  = null;

// Global jukebox registry — tracks which jukeboxes are "on" for proximity
const _jkActive = {};  // { jukeboxId: { x, y, mapId, gain } }

// ─── SOUND HELPERS ────────────────────────────────────────────────────────────

function jkGetAudioCtx() {
  if (!_jkAudioCtx) {
    try {
      _jkAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _jkGainNode = _jkAudioCtx.createGain();
      _jkAnalyser = _jkAudioCtx.createAnalyser();
      _jkAnalyser.fftSize = 64;
      _jkGainNode.connect(_jkAnalyser);
      _jkAnalyser.connect(_jkAudioCtx.destination);
      _jkGainNode.gain.value = 1.0;
    } catch (e) { _jkAudioCtx = null; }
  }
  return _jkAudioCtx;
}

async function jkLoadAndPlay(song, offset = 0) {
  const ctx = jkGetAudioCtx();
  if (!ctx) return;
  if (!song?.file) return;

  // Stop current
  jkStop(false);

  try {
    ctx.resume();
    const resp = await fetch(song.file);
    if (!resp.ok) throw new Error('not found');
    const buf = await resp.arrayBuffer();
    _jkBuffer = await ctx.decodeAudioData(buf);
    _jkSource = ctx.createBufferSource();
    _jkSource.buffer = _jkBuffer;
    _jkSource.connect(_jkGainNode);
    _jkSource.start(0, offset);
    _jkStartedAt = ctx.currentTime - offset;
    _jkPausedAt = 0;
    _jkPlaying = true;
    _jkSource.onended = () => {
      if (_jkPlaying) jkAdvanceQueue();
    };
  } catch (e) {
    // File not found yet — simulate playback for UI testing
    _jkPlaying = true;
    _jkBuffer = null;
    setTimeout(() => { if (_jkPlaying) jkAdvanceQueue(); }, 30000);
  }
  jkUpdatePlayUI();
}

function jkStop(resetOffset = true) {
  if (_jkSource) {
    try { _jkSource.onended = null; _jkSource.stop(); } catch (e) {}
    _jkSource = null;
  }
  if (resetOffset) {
    _jkPlaying = false;
    _jkPausedAt = 0;
  }
}

function jkPause() {
  if (!_jkPlaying) return;
  const ctx = jkGetAudioCtx();
  if (ctx && _jkSource) {
    _jkPausedAt = ctx.currentTime - _jkStartedAt;
    jkStop(false);
    _jkPlaying = false;
  }
  jkUpdatePlayUI();
}

function jkResume() {
  if (_jkPlaying || !_jkCurrentSong) return;
  jkLoadAndPlay(_jkCurrentSong, _jkPausedAt);
}

function jkAdvanceQueue() {
  if (_jkCurrentSong) _jkHistory.unshift(_jkCurrentSong);
  if (_jkHistory.length > 5) _jkHistory.length = 5;

  if (_jkQueue.length > 0) {
    _jkCurrentSong = _jkQueue.shift();
    jkLoadAndPlay(_jkCurrentSong);
  } else {
    _jkPlaying = false;
    _jkCurrentSong = null;
    jkStop();
  }
  jkUpdatePlayUI();
  jkSaveState();
}

function jkSetProximityGain(vol) {
  const ctx = jkGetAudioCtx();
  if (!ctx || !_jkGainNode) return;
  _jkGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime, 0.3);
}

// ─── PROXIMITY ENGINE ─────────────────────────────────────────────────────────

/**
 * Call this every time the player moves.
 * playerX/Y are tile coordinates.
 */
export function updateJukeboxProximity(playerX, playerY, mapId, state, data) {
  const jukeboxes = data.jukeboxes || [];
  let closestVol = 0;

  for (const jk of jukeboxes) {
    if (jk.mapId !== mapId) continue;
    const jkState = state.jukeboxes?.[jk.id];
    if (!jkState?.playing) continue;

    const dx = playerX - jk.tileX, dy = playerY - jk.tileY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const MAX_DIST = 10, MIN_DIST = 2;

    if (dist <= MIN_DIST) {
      closestVol = Math.max(closestVol, 1.0);
    } else if (dist <= MAX_DIST) {
      const vol = 1.0 - (dist - MIN_DIST) / (MAX_DIST - MIN_DIST);
      closestVol = Math.max(closestVol, Math.pow(vol, 1.5)); // gentle rolloff
    }
  }

  jkSetProximityGain(closestVol);
}

// ─── STATE PERSISTENCE ────────────────────────────────────────────────────────

function jkSaveState() {
  if (!_jkState || !_jkDef) return;
  if (!_jkState.jukeboxes) _jkState.jukeboxes = {};
  _jkState.jukeboxes[_jkDef.id] = {
    queue: [..._jkQueue],
    history: [..._jkHistory],
    currentSong: _jkCurrentSong,
    playing: _jkPlaying,
  };
}

function jkLoadState() {
  const saved = _jkState?.jukeboxes?.[_jkDef?.id];
  if (!saved) return;
  _jkQueue = saved.queue || [];
  _jkHistory = saved.history || [];
  _jkCurrentSong = saved.currentSong || null;
  // Don't auto-resume — player opens jukebox to resume
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

export function openJukebox(jukeboxId, state, data, api) {
  _jkState = state;
  _jkData  = data;
  _jkApi   = api;
  _jkDef   = (data.jukeboxes || []).find(j => j.id === jukeboxId);
  if (!_jkDef) { api.log?.('Jukebox not found: ' + jukeboxId); return; }

  jkLoadState();
  jkInjectStyles();

  if (_jkOverlay) { _jkOverlay.remove(); cancelAnimationFrame(_jkAnim); }
  _jkOverlay = document.createElement('div');
  _jkOverlay.id = 'jkOverlay';
  _jkOverlay.className = 'jk-overlay';
  document.body.appendChild(_jkOverlay);

  jkRender();
  jkStartVisualizer();
}

// ─── MAIN RENDER ──────────────────────────────────────────────────────────────

function jkRender() {
  const jk = _jkDef;
  const credits = _jkState.resources?.credits ?? 0;
  const slots = jk.songs || [];
  const maxSlots = jk.songSlots || 10;
  const cost = jk.costPerSong ?? 1;
  const queueFull = _jkQueue.length >= maxSlots;

  _jkOverlay.innerHTML = `
    <div class="jk-modal">

      <!-- HEADER / MARQUEE -->
      <div class="jk-header">
        <div class="jk-neon-strip jk-neon-top"></div>
        <div class="jk-header-inner">
          <div class="jk-logo-block">
            <div class="jk-logo-icon">🎵</div>
            <div class="jk-logo-text">
              <div class="jk-logo-title">SPACE STYLE JAMS</div>
              <div class="jk-logo-sub">${jk.name || 'Galactic Jukebox'} · ${jk.location || ''}</div>
            </div>
          </div>
          <div class="jk-header-right">
            <div class="jk-credits-pill">
              <span class="jk-credits-icon">◈</span>
              <span class="jk-credits-val" id="jkCreditsVal">${credits}</span>
              <span class="jk-credits-label">CREDITS</span>
            </div>
            <button class="jk-close-btn" id="jkCloseBtn">✕</button>
          </div>
        </div>
        <div class="jk-neon-strip jk-neon-bot"></div>
      </div>

      <!-- NOW PLAYING + VISUALIZER -->
      <div class="jk-now-playing-section">
        <div class="jk-visualizer-wrap">
          <canvas id="jkVisCanvas" width="420" height="60"></canvas>
        </div>
        <div class="jk-now-playing-info">
          <div class="jk-np-label">NOW PLAYING</div>
          <div class="jk-np-title" id="jkNpTitle">${_jkCurrentSong ? _jkCurrentSong.title : '— Insert credit to play —'}</div>
          <div class="jk-np-artist" id="jkNpArtist">${_jkCurrentSong ? _jkCurrentSong.artist : ''}</div>
        </div>
        <div class="jk-playback-controls">
          <button class="jk-ctrl-btn" id="jkPrevBtn" title="Skip back">⏮</button>
          <button class="jk-ctrl-btn jk-play-btn" id="jkPlayBtn" title="Play/Pause">
            ${_jkPlaying ? '⏸' : '▶'}
          </button>
          <button class="jk-ctrl-btn" id="jkSkipBtn" title="Skip">⏭</button>
        </div>
      </div>

      <!-- BODY: SONG LIST + QUEUE -->
      <div class="jk-body">

        <!-- LEFT: SONG CATALOGUE -->
        <div class="jk-catalogue">
          <div class="jk-section-hdr">
            <span class="jk-section-icon">📀</span>
            CATALOGUE
            <span class="jk-section-note">${cost}¢ per song</span>
          </div>
          <div class="jk-song-list" id="jkSongList">
            ${slots.length === 0 ? `
              <div class="jk-empty-slot">
                <div class="jk-empty-icon">📻</div>
                <div class="jk-empty-text">No songs loaded yet.</div>
                <div class="jk-empty-sub">The proprietor is working on the playlist.</div>
              </div>` :
              slots.map((song, i) => `
                <div class="jk-song-row ${queueFull ? 'jk-song-disabled' : ''}" data-idx="${i}">
                  <div class="jk-song-num">${String(i + 1).padStart(2, '0')}</div>
                  <div class="jk-song-info">
                    <div class="jk-song-title">${song.title}</div>
                    <div class="jk-song-artist">${song.artist || 'Unknown Artist'}</div>
                    ${song.genre ? `<div class="jk-song-genre">${song.genre}</div>` : ''}
                  </div>
                  <div class="jk-song-dur">${song.duration || '?:??'}</div>
                  <button class="jk-queue-btn" data-idx="${i}" ${queueFull || credits < cost ? 'disabled' : ''}>
                    ${queueFull ? 'FULL' : credits < cost ? 'NO¢' : `+${cost}¢`}
                  </button>
                </div>`).join('')
            }
          </div>
        </div>

        <!-- RIGHT: QUEUE + HISTORY -->
        <div class="jk-right-panel">

          <!-- QUEUE -->
          <div class="jk-section-hdr">
            <span class="jk-section-icon">📋</span>
            QUEUE
            <span class="jk-section-note">${_jkQueue.length}/${maxSlots}</span>
          </div>
          <div class="jk-queue-list" id="jkQueueList">
            ${_jkQueue.length === 0
              ? `<div class="jk-queue-empty">Queue is empty</div>`
              : _jkQueue.map((s, i) => `
                <div class="jk-queue-row">
                  <span class="jk-queue-pos">${i + 1}</span>
                  <span class="jk-queue-title">${s.title}</span>
                  <button class="jk-dequeue-btn" data-qi="${i}" title="Remove">✕</button>
                </div>`).join('')
            }
          </div>

          <!-- HISTORY -->
          <div class="jk-section-hdr jk-hdr-history">
            <span class="jk-section-icon">🕐</span>
            RECENTLY PLAYED
          </div>
          <div class="jk-history-list">
            ${_jkHistory.length === 0
              ? `<div class="jk-queue-empty">Nothing played yet</div>`
              : _jkHistory.map(s => `
                <div class="jk-history-row">
                  <span class="jk-history-bullet">◈</span>
                  <span class="jk-history-title">${s.title}</span>
                  <span class="jk-history-artist">${s.artist || ''}</span>
                </div>`).join('')
            }
          </div>

          <!-- GOSSIP / ATMOSPHERE -->
          ${(jk.gossip || []).length ? `
            <div class="jk-gossip-block">
              <div class="jk-gossip-text">"${jk.gossip[Math.floor(Math.random() * jk.gossip.length)]}"</div>
            </div>` : ''}

        </div>
      </div>

      <!-- FOOTER -->
      <div class="jk-footer">
        <div class="jk-footer-left">
          <div class="jk-cost-hint">${cost}¢ per selection · Queue holds ${maxSlots} songs</div>
        </div>
        <div class="jk-footer-lights">
          ${Array.from({length: 12}, (_, i) => `<div class="jk-foot-light" style="animation-delay:${i * 0.12}s"></div>`).join('')}
        </div>
      </div>

      <!-- NEON SIDE STRIPS -->
      <div class="jk-side-strip jk-side-left"></div>
      <div class="jk-side-strip jk-side-right"></div>

    </div>`;

  // Events
  document.getElementById('jkCloseBtn').onclick = () => jkClose();
  document.getElementById('jkPlayBtn').onclick  = () => { _jkPlaying ? jkPause() : (_jkCurrentSong ? jkResume() : null); };
  document.getElementById('jkSkipBtn').onclick  = () => { if (_jkCurrentSong || _jkQueue.length) jkAdvanceQueue(); };
  document.getElementById('jkPrevBtn').onclick  = () => {
    if (_jkHistory.length) {
      if (_jkCurrentSong) _jkQueue.unshift(_jkCurrentSong);
      _jkCurrentSong = _jkHistory.shift();
      jkLoadAndPlay(_jkCurrentSong);
      jkSaveState(); jkRender();
    }
  };

  document.querySelectorAll('.jk-queue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx);
      jkQueueSong(i);
    });
  });

  document.querySelectorAll('.jk-dequeue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = parseInt(btn.dataset.qi);
      _jkQueue.splice(qi, 1);
      jkSaveState(); jkRender();
    });
  });

  // Close on backdrop
  _jkOverlay.addEventListener('click', (e) => {
    if (e.target === _jkOverlay) jkClose();
  });

  // Restart visualizer canvas after render
  jkStartVisualizer();
}

// ─── QUEUE A SONG ─────────────────────────────────────────────────────────────

function jkQueueSong(idx) {
  const jk = _jkDef;
  const song = jk.songs?.[idx];
  if (!song) return;

  const cost = jk.costPerSong ?? 1;
  const maxSlots = jk.songSlots || 10;
  const credits = _jkState.resources?.credits ?? 0;

  if (credits < cost) {
    jkFlashMsg('Not enough credits!'); return;
  }
  if (_jkQueue.length >= maxSlots) {
    jkFlashMsg('Queue is full!'); return;
  }

  _jkState.resources.credits -= cost;
  _jkApi?.log?.(`You paid ${cost}¢ to queue "${song.title}".`);

  const entry = { ...song, addedBy: 'player' };
  _jkQueue.push(entry);

  // If nothing playing, start immediately
  if (!_jkPlaying && !_jkCurrentSong) {
    _jkCurrentSong = _jkQueue.shift();
    jkLoadAndPlay(_jkCurrentSong);
  }

  jkSaveState();
  jkRender();
  jkFlashMsg(`"${song.title}" added to queue!`);
}

// ─── PLAYBACK UI UPDATE (lightweight — no full re-render) ────────────────────

function jkUpdatePlayUI() {
  const pb = document.getElementById('jkPlayBtn');
  if (pb) pb.textContent = _jkPlaying ? '⏸' : '▶';

  const npT = document.getElementById('jkNpTitle');
  const npA = document.getElementById('jkNpArtist');
  if (npT) npT.textContent = _jkCurrentSong ? _jkCurrentSong.title : '— Insert credit to play —';
  if (npA) npA.textContent = _jkCurrentSong?.artist || '';

  const credEl = document.getElementById('jkCreditsVal');
  if (credEl) credEl.textContent = _jkState?.resources?.credits ?? 0;

  // Refresh queue display
  const ql = document.getElementById('jkQueueList');
  if (ql) {
    const maxSlots = _jkDef?.songSlots || 10;
    ql.innerHTML = _jkQueue.length === 0
      ? `<div class="jk-queue-empty">Queue is empty</div>`
      : _jkQueue.map((s, i) => `
          <div class="jk-queue-row">
            <span class="jk-queue-pos">${i + 1}</span>
            <span class="jk-queue-title">${s.title}</span>
            <button class="jk-dequeue-btn" data-qi="${i}" title="Remove">✕</button>
          </div>`).join('');
    ql.querySelectorAll('.jk-dequeue-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _jkQueue.splice(parseInt(btn.dataset.qi), 1);
        jkSaveState(); jkUpdatePlayUI();
      });
    });
  }
}

// ─── VISUALIZER ───────────────────────────────────────────────────────────────

function jkStartVisualizer() {
  cancelAnimationFrame(_jkAnim);
  const canvas = document.getElementById('jkVisCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const BAR_COUNT = _jkVisBars;

  function tick() {
    _jkAnim = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);

    // Get real analyser data if available
    let data = new Uint8Array(BAR_COUNT);
    if (_jkAnalyser && _jkPlaying) {
      _jkAnalyser.getByteFrequencyData(data);
    } else {
      // Idle animation — slow breathing bars
      const t = Date.now() * 0.001;
      for (let i = 0; i < BAR_COUNT; i++) {
        data[i] = _jkPlaying
          ? Math.max(20, 40 + 80 * Math.sin(t * 2 + i * 0.4) * Math.sin(t * 0.7 + i * 0.2))
          : 8 + 12 * Math.sin(t * 0.5 + i * 0.3);
      }
    }

    const barW = W / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      const val = data[i] / 255;
      const barH = Math.max(2, val * H);

      // Color: cycles through neon spectrum
      const hue = (i / BAR_COUNT * 200 + Date.now() * 0.05) % 360;
      const alpha = _jkPlaying ? 0.85 : 0.3;
      ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;

      // Mirror bar (top and bottom)
      ctx.fillRect(i * barW + 1, H / 2 - barH / 2, barW - 2, barH / 2);
      ctx.fillStyle = `hsla(${hue}, 100%, 40%, ${alpha * 0.5})`;
      ctx.fillRect(i * barW + 1, H / 2, barW - 2, barH / 2);

      // Glow dot at peak
      if (_jkPlaying && val > 0.5) {
        ctx.fillStyle = `hsla(${hue}, 100%, 90%, 0.9)`;
        ctx.fillRect(i * barW + 1, H / 2 - barH / 2 - 2, barW - 2, 2);
      }
    }

    // Scanline overlay
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }
  tick();
}

// ─── FLASH MESSAGE ────────────────────────────────────────────────────────────

function jkFlashMsg(msg) {
  let el = document.getElementById('jkFlash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'jkFlash';
    el.className = 'jk-flash';
    _jkOverlay?.querySelector('.jk-modal')?.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('jk-flash-show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('jk-flash-show'), 2200);
}

// ─── CLOSE ────────────────────────────────────────────────────────────────────

function jkClose() {
  cancelAnimationFrame(_jkAnim);
  jkSaveState();
  if (_jkOverlay) { _jkOverlay.remove(); _jkOverlay = null; }
  // DON'T stop audio — music keeps playing after closing the UI
}

// ─── STYLES INJECTION ─────────────────────────────────────────────────────────

function jkInjectStyles() {
  if (document.getElementById('jkStyles')) return;
  const link = document.createElement('link');
  link.id = 'jkStyles';
  link.rel = 'stylesheet';
  link.href = 'css/Jukebox.css';
  document.head.appendChild(link);
}

// ─── RESET HELPER (for engine use) ────────────────────────────────────────────

export function resetJukeboxState(state) {
  if (state.jukeboxes) state.jukeboxes = {};
}
