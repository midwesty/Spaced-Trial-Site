/**
 * VOID SLOTS — Galactic Slot Machine System for Spaced
 * =====================================================
 * Entry point: openSlotMachine(tableId, state, data, api)
 *
 * Machines: classic_space_slots | brain_splosion
 * Adding a machine: register in MACHINE_REGISTRY.
 *
 * Integrates with the same credit system as CardTable.js.
 * No NPC gamblers — slots are solo. Launches directly, no lobby.
 */

// ─── MACHINE REGISTRY ────────────────────────────────────────────────────────

const MACHINE_REGISTRY = {
  classic_space_slots: {
    id: 'classic_space_slots',
    name: 'Classic Space Slots',
    subtitle: 'THE VOID NEVER PAYS — BUT IT WILL',
    initFn: (...args) => initClassic(...args),
    renderFn: (...args) => renderClassic(...args),
  },
  brain_splosion: {
    id: 'brain_splosion',
    name: "BRAIN 'SPLOSION",
    subtitle: '25 LINES OF PURE UNCUT CHAOS',
    initFn: (...args) => initBrainSplosion(...args),
    renderFn: (...args) => renderBrainSplosion(...args),
  },
};

// ─── CLASSIC SPACE SLOTS — SYMBOLS & PAYTABLE ────────────────────────────────

const CLASSIC_SYMBOLS = [
  { id: 'seven',   label: '7',  display: '7',  color: '#ff4444', glow: '#ff0000', weight: 1,  value: 100 },
  { id: 'ship',    label: '🚀', display: '🚀', color: '#79c0ff', glow: '#4a9eff', weight: 3,  value: 40  },
  { id: 'crystal', label: '◈',  display: '◈',  color: '#9b59ff', glow: '#7b39df', weight: 5,  value: 20  },
  { id: 'pulse',   label: '⚡', display: '⚡', color: '#ffcc5a', glow: '#ffaa00', weight: 7,  value: 10  },
  { id: 'star',    label: '★',  display: '★',  color: '#7ed9a0', glow: '#50c878', weight: 10, value: 5   },
  { id: 'scatter', label: '☠',  display: '☠',  color: '#ff8888', glow: '#ff4444', weight: 4,  value: 0, isScatter: true },
  { id: 'wild',    label: 'WILD', display: 'WILD', color: '#ffffff', glow: '#ccccff', weight: 2, value: 0, isWild: true },
];

// Classic: 5 reels, 3 rows, 9 paylines
// Paylines defined as row-index per reel (0=top, 1=mid, 2=bot)
const CLASSIC_PAYLINES = [
  [1, 1, 1, 1, 1], // 1: straight middle
  [0, 0, 0, 0, 0], // 2: straight top
  [2, 2, 2, 2, 2], // 3: straight bottom
  [0, 1, 2, 1, 0], // 4: V shape
  [2, 1, 0, 1, 2], // 5: inverted V
  [0, 0, 1, 2, 2], // 6: diagonal down
  [2, 2, 1, 0, 0], // 7: diagonal up
  [1, 0, 0, 0, 1], // 8: dip top
  [1, 2, 2, 2, 1], // 9: dip bottom
];

// ─── BRAIN 'SPLOSION — SYMBOLS & PAYTABLE ────────────────────────────────────

const BRAIN_SYMBOLS = [
  { id: 'jackpot', label: '💎', display: '💎', color: '#00ffff', glow: '#00ddff', weight: 1,  value: 500, name: 'VOID JACKPOT' },
  { id: 'brain',   label: '🧠', display: '🧠', color: '#ff69b4', glow: '#ff1493', weight: 2,  value: 150, name: 'BRAIN BLAST' },
  { id: 'explode', label: '💥', display: '💥', color: '#ff6600', glow: '#ff3300', weight: 3,  value: 75,  name: 'SPLOSION' },
  { id: 'rainbow', label: '🌈', display: '🌈', color: '#ff00ff', glow: '#cc00cc', weight: 4,  value: 40,  name: 'COLOR CRIME' },
  { id: 'eye',     label: '👁', display: '👁',  color: '#00ff88', glow: '#00cc66', weight: 5,  value: 20,  name: 'THE WATCHER' },
  { id: 'star',    label: '⭐', display: '⭐', color: '#ffdd00', glow: '#ffaa00', weight: 7,  value: 10,  name: 'GOLD STAR' },
  { id: 'cherry',  label: '🍒', display: '🍒', color: '#ff4466', glow: '#cc0033', weight: 8,  value: 5,   name: 'lol cherry' },
  { id: 'duck',    label: '🦆', display: '🦆', color: '#88ff44', glow: '#44cc00', weight: 6,  value: 15,  name: 'THE DUCK' },
  { id: 'wild',    label: '🌀', display: '🌀', color: '#ffffff', glow: '#aaaaff', weight: 2,  value: 0,   isWild: true, name: 'BRAIN WILD' },
  { id: 'bonus',   label: '🎰', display: '🎰', color: '#ffcc00', glow: '#ff9900', weight: 3,  value: 0,   isBonus: true, name: 'BONUS BRAIN' },
];

// Brain: 5 reels, 4 rows, 25 paylines (all 25 lines)
const BRAIN_PAYLINES = [
  // Straight lines
  [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],
  // V / inverted V shapes
  [0,1,2,1,0],[2,1,0,1,2],[1,0,1,0,1],[1,2,1,2,1],
  // Zigzags
  [0,1,0,1,0],[2,1,2,1,2],[3,2,1,2,3],[0,0,1,0,0],
  // Diagonals
  [0,1,2,3,3],[3,2,1,0,0],[0,0,1,2,3],[3,3,2,1,0],
  // W and M shapes
  [1,0,1,0,1],[2,3,2,3,2],[0,2,0,2,0],[3,1,3,1,3],
  // Extra lines to reach 25
  [1,1,0,1,1],[1,1,2,1,1],[0,1,1,1,0],[2,1,1,1,2],[1,2,3,2,1],
];

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _overlay = null;
let _machineData = null;
let _machineType = null;
let _state = null;
let _data = null;
let _api = null;
let _sessionStartCredits = 0;

// Classic state
let _cs = {
  credits: 0,
  betPerSpin: 10,
  reels: [[], [], [], [], []],  // each reel: 3 visible symbols (top, mid, bot)
  spinning: false,
  lastWin: 0,
  totalWon: 0,
  totalSpent: 0,
  spinsThisSession: 0,
  freeSpinsLeft: 0,
  message: '',
  winLines: [],   // which paylines won this spin
  scatterCount: 0,
  bonusActive: false,
  spinLog: [],
  phase: 'idle', // idle | spinning | result | freespin | bonus
};

// Brain state
let _bs = {
  credits: 0,
  betPerLine: 1,
  activeLines: 25,
  reels: [[], [], [], [], []],  // 4 rows each
  spinning: false,
  lastWin: 0,
  totalWon: 0,
  totalSpent: 0,
  spinsThisSession: 0,
  freeSpinsLeft: 0,
  freeSpinMultiplier: 1,
  message: '',
  winLines: [],
  bonusTriggered: false,
  bonusSpinsLeft: 0,
  expandingWilds: [],
  phase: 'idle',
  spinLog: [],
  lastWinName: '',
  jackpotFlash: false,
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

export function openSlotMachine(tableId, state, data, api) {
  _state = state; _data = data; _api = api;

  const table = (data.tables || []).find(t => t.id === tableId);
  if (!table) { console.warn('[SlotMachine] Not found:', tableId); return; }
  _machineData = table;
  _machineType = table.machineType || 'classic_space_slots';

  if (table.requiredFlag && !state.flags[table.requiredFlag]) {
    api.log?.(`The ${table.name} is locked.`); return;
  }

  _sessionStartCredits = state.resources.credits;

  if (_machineType === 'brain_splosion') {
    _bs = {
      credits: state.resources.credits,
      betPerLine: Math.max(1, table.minBet || 1),
      activeLines: 25,
      reels: buildBrainReels(),
      spinning: false, lastWin: 0, totalWon: 0, totalSpent: 0,
      spinsThisSession: 0, freeSpinsLeft: 0, freeSpinMultiplier: 1,
      message: "PLACE YOUR BETS. THE BRAIN DEMANDS IT.",
      winLines: [], bonusTriggered: false, bonusSpinsLeft: 0,
      expandingWilds: [], phase: 'idle', spinLog: [],
      lastWinName: '', jackpotFlash: false,
    };
  } else {
    _cs = {
      credits: state.resources.credits,
      betPerSpin: Math.max(table.minBet || 10, 10),
      reels: buildClassicReels(),
      spinning: false, lastWin: 0, totalWon: 0, totalSpent: 0,
      spinsThisSession: 0, freeSpinsLeft: 0,
      message: "Insert credits. Pull lever. Pray to the void.",
      winLines: [], scatterCount: 0, bonusActive: false,
      spinLog: [], phase: 'idle',
    };
  }

  injectStyles();
  if (_overlay) _overlay.remove();
  _overlay = document.createElement('div');
  _overlay.id = 'slotMachineOverlay';
  _overlay.className = 'sm-overlay';
  document.body.appendChild(_overlay);

  MACHINE_REGISTRY[_machineType]?.renderFn();
}

// ─── REEL BUILDERS ────────────────────────────────────────────────────────────

function weightedPick(symbols) {
  const total = symbols.reduce((s, sym) => s + sym.weight, 0);
  let r = Math.random() * total;
  for (const sym of symbols) {
    r -= sym.weight;
    if (r <= 0) return sym;
  }
  return symbols[symbols.length - 1];
}

function buildClassicReels() {
  // Each reel: generate a long strip, show 3 at a time
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => weightedPick(CLASSIC_SYMBOLS))
  );
}

function buildBrainReels() {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => weightedPick(BRAIN_SYMBOLS))
  );
}

// ─── ═══════════════════════════════════════════════════════
//     CLASSIC SPACE SLOTS
// ═══════════════════════════════════════════════════════════

function renderClassic() {
  const cs = _cs;
  const totalBet = cs.betPerSpin;
  const canSpin = cs.credits >= totalBet && !cs.spinning;
  const isFreeSpin = cs.freeSpinsLeft > 0;

  _overlay.innerHTML = `
    <div class="sm-container sm-classic ${cs.phase === 'result' && cs.lastWin > 0 ? 'sm-win-flash' : ''}">

      <!-- Machine Header -->
      <div class="sm-header sm-classic-header">
        <div class="sm-machine-marquee">
          <span class="sm-marquee-text">◈ CLASSIC SPACE SLOTS ◈ THE VOID NEVER PAYS — BUT IT WILL ◈ CLASSIC SPACE SLOTS ◈</span>
        </div>
        <div class="sm-header-body">
          <div class="sm-header-left">
            <div class="sm-machine-title">VOID SLOTS</div>
            <div class="sm-machine-sub">EST. CYCLE 1 · PORT SABLE STATION</div>
          </div>
          <div class="sm-credits-display">
            <div class="sm-credit-label">CREDITS</div>
            <div class="sm-credit-val sm-classic-credit">${cs.credits}</div>
          </div>
          <button class="sm-btn sm-btn-leave" id="smLeaveBtn">⬅ LEAVE</button>
        </div>
      </div>

      <!-- Paytable strip -->
      <div class="sm-paytable-strip">
        ${CLASSIC_SYMBOLS.filter(s => !s.isScatter && !s.isWild).map(s =>
          `<div class="sm-pay-item"><span class="sm-pay-sym" style="color:${s.color};text-shadow:0 0 8px ${s.glow}">${s.display}</span><span class="sm-pay-val">×${s.value}</span></div>`
        ).join('')}
        <div class="sm-pay-item"><span class="sm-pay-sym" style="color:#ff8888">☠</span><span class="sm-pay-val">3=FREE</span></div>
        <div class="sm-pay-item"><span class="sm-pay-sym" style="color:#fff">WILD</span><span class="sm-pay-val">= ANY</span></div>
      </div>

      <!-- Main reel window -->
      <div class="sm-reel-cabinet sm-classic-cabinet">

        <!-- Decorative side lights left -->
        <div class="sm-side-lights sm-side-left">
          ${Array.from({length:8},(_,i)=>`<div class="sm-bulb sm-bulb-${i%3}" style="animation-delay:${i*0.15}s"></div>`).join('')}
        </div>

        <!-- Reel window -->
        <div class="sm-reel-window sm-classic-window">
          <!-- Payline overlay indicators -->
          <div class="sm-payline-indicators">
            ${CLASSIC_PAYLINES.map((pl, i) => `
              <div class="sm-payline-ind ${cs.winLines.includes(i) ? 'sm-payline-active' : ''}" data-line="${i+1}">
                ${i+1}
              </div>`).join('')}
          </div>

          <!-- The reels -->
          <div class="sm-reels sm-classic-reels" id="smClassicReels">
            ${cs.reels.map((reel, ri) => `
              <div class="sm-reel sm-classic-reel ${cs.spinning ? 'sm-reel-spin' : ''}" id="smReel${ri}" style="animation-delay:${ri * 0.08}s">
                <div class="sm-reel-strip">
                  ${reel.map((sym, row) => {
                    const isWin = cs.winLines.length > 0 && cs.phase === 'result' &&
                      cs.winLines.some(li => cs.reels[ri][CLASSIC_PAYLINES[li][ri]]?.id === sym.id);
                    return `<div class="sm-cell sm-classic-cell ${isWin ? 'sm-cell-win' : ''}" data-row="${row}" data-reel="${ri}">
                      <div class="sm-sym-inner" style="color:${sym.color};text-shadow:0 0 12px ${sym.glow},0 0 24px ${sym.glow}40">
                        ${sym.display}
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>`).join('')}
          </div>

          <!-- Win line overlay -->
          ${cs.phase === 'result' && cs.lastWin > 0 ? `
            <div class="sm-win-overlay">
              <div class="sm-win-text">+${cs.lastWin}¢</div>
            </div>` : ''}

          <!-- Spinning overlay -->
          ${cs.spinning ? `<div class="sm-spinning-veil"></div>` : ''}
        </div>

        <!-- Decorative side lights right -->
        <div class="sm-side-lights sm-side-right">
          ${Array.from({length:8},(_,i)=>`<div class="sm-bulb sm-bulb-${(i+2)%3}" style="animation-delay:${i*0.2}s"></div>`).join('')}
        </div>
      </div>

      <!-- Status message -->
      <div class="sm-message-bar sm-classic-msg ${cs.lastWin > 0 && cs.phase === 'result' ? 'sm-msg-win' : ''}">
        ${cs.freeSpinsLeft > 0 ? `<span class="sm-free-badge">FREE SPIN ${cs.freeSpinsLeft} LEFT</span>` : ''}
        ${cs.message || '&nbsp;'}
      </div>

      <!-- Controls -->
      <div class="sm-controls sm-classic-controls">
        <div class="sm-bet-section">
          <div class="sm-control-label">BET PER SPIN</div>
          <div class="sm-bet-adjuster">
            <button class="sm-adj-btn" id="smBetDown" ${cs.betPerSpin <= (_machineData.minBet || 10) ? 'disabled' : ''}>−</button>
            <div class="sm-bet-display">${cs.betPerSpin}¢</div>
            <button class="sm-adj-btn" id="smBetUp" ${cs.betPerSpin >= (_machineData.maxBet || 500) ? 'disabled' : ''}>+</button>
          </div>
          <div class="sm-bet-presets">
            ${[10,25,50,100,250].map(v =>
              `<button class="sm-preset ${cs.betPerSpin===v?'sm-preset-active':''}" data-val="${v}">${v}¢</button>`
            ).join('')}
          </div>
        </div>

        <div class="sm-spin-section">
          ${isFreeSpin
            ? `<button class="sm-spin-btn sm-free-spin-btn ${!canSpin?'disabled':''}" id="smSpinBtn" ${!canSpin?'disabled':''}>
                FREE SPIN ☠
               </button>`
            : `<button class="sm-spin-btn sm-classic-spin ${!canSpin?'disabled':''}" id="smSpinBtn" ${!canSpin?'disabled':''}>
                PULL
               </button>`
          }
          <div class="sm-spin-label">◈ VOID ◈</div>
        </div>

        <div class="sm-stats-section">
          <div class="sm-stat-row"><span>Spins</span><strong>${cs.spinsThisSession}</strong></div>
          <div class="sm-stat-row"><span>Total Won</span><strong class="sm-stat-green">${cs.totalWon}¢</strong></div>
          <div class="sm-stat-row"><span>Total Spent</span><strong class="sm-stat-red">${cs.totalSpent}¢</strong></div>
          <div class="sm-stat-row"><span>Net</span><strong class="${cs.totalWon - cs.totalSpent >= 0 ? 'sm-stat-green' : 'sm-stat-red'}">${cs.totalWon - cs.totalSpent >= 0 ? '+' : ''}${cs.totalWon - cs.totalSpent}¢</strong></div>
        </div>
      </div>

      <!-- Log -->
      <div class="sm-log sm-classic-log">
        ${cs.spinLog.slice(-4).map(l => `<div>${l}</div>`).join('') || '<div>Awaiting your first pull, spacer.</div>'}
      </div>

    </div>`;

  // Wire buttons
  document.getElementById('smLeaveBtn')?.addEventListener('click', smConfirmLeave);
  document.getElementById('smSpinBtn')?.addEventListener('click', classicSpin);
  document.getElementById('smBetDown')?.addEventListener('click', () => {
    const step = _machineData.minBet || 10;
    _cs.betPerSpin = Math.max(step, _cs.betPerSpin - step);
    renderClassic();
  });
  document.getElementById('smBetUp')?.addEventListener('click', () => {
    const step = _machineData.minBet || 10;
    _cs.betPerSpin = Math.min(_machineData.maxBet || 500, _cs.betPerSpin + step);
    renderClassic();
  });
  document.querySelectorAll('.sm-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      _cs.betPerSpin = parseInt(btn.dataset.val);
      renderClassic();
    });
  });
}

function classicSpin() {
  const cs = _cs;
  const isFree = cs.freeSpinsLeft > 0;
  const cost = isFree ? 0 : cs.betPerSpin;

  if (!isFree && cs.credits < cs.betPerSpin) {
    cs.message = "Not enough credits. Hit the trail, spacer.";
    renderClassic(); return;
  }

  cs.spinning = true;
  cs.phase = 'spinning';
  cs.credits -= cost;
  cs.totalSpent += cost;
  cs.spinsThisSession++;
  if (isFree) cs.freeSpinsLeft--;
  cs.winLines = [];
  cs.lastWin = 0;
  cs.message = isFree ? "FREE SPIN — THE VOID GIVES BACK..." : "REELS TURNING...";
  renderClassic();

  // Animate: stagger reel stops
  const spinDuration = 800 + Math.random() * 400;
  setTimeout(() => {
    // Generate new results
    cs.reels = buildClassicReels();
    cs.spinning = false;
    cs.phase = 'result';
    resolveClassic();
  }, spinDuration);
}

function resolveClassic() {
  const cs = _cs;
  let totalWin = 0;
  const winLines = [];
  let scatters = 0;

  // Count scatters anywhere on grid
  cs.reels.forEach(reel => {
    reel.forEach(sym => { if (sym.isScatter) scatters++; });
  });
  cs.scatterCount = scatters;

  // Check each payline
  CLASSIC_PAYLINES.forEach((pl, lineIdx) => {
    const lineSymbols = pl.map((row, reel) => cs.reels[reel][row]);
    const win = evaluateClassicLine(lineSymbols);
    if (win > 0) {
      totalWin += win;
      winLines.push(lineIdx);
    }
  });

  // Scatter bonus: 3+ scatters = free spins
  if (scatters >= 3) {
    const freeSpins = scatters >= 5 ? 15 : scatters >= 4 ? 10 : 5;
    cs.freeSpinsLeft += freeSpins;
    cs.spinLog.push(`☠ ${scatters} SCATTERS → ${freeSpins} FREE SPINS AWARDED!`);
  }

  cs.lastWin = totalWin;
  cs.totalWon += totalWin;
  cs.credits += totalWin;
  cs.winLines = winLines;

  if (totalWin >= cs.betPerSpin * 50) {
    cs.message = `◈ VOID JACKPOT ◈ +${totalWin}¢ THE STARS ALIGN!`;
    cs.spinLog.push(`★ JACKPOT! +${totalWin}¢`);
    triggerClassicJackpot();
  } else if (totalWin > 0) {
    const msgs = [
      `+${totalWin}¢ — The void pays its debts. Sometimes.`,
      `+${totalWin}¢ — Oh. You actually won.`,
      `+${totalWin}¢ — Don't get used to it.`,
      `+${totalWin}¢ — Mark this moment. It won't last.`,
      `${winLines.length} LINE${winLines.length>1?'S':''} — +${totalWin}¢`,
    ];
    cs.message = msgs[Math.floor(Math.random() * msgs.length)];
    cs.spinLog.push(`Win: +${totalWin}¢ on ${winLines.length} line(s).`);
  } else {
    const loseMsgs = [
      "The void is unmoved by your suffering.",
      "Nope. Not even close.",
      "Static. Just static.",
      "The machine stares back.",
      "Your credits continue their one-way journey.",
      "Try again. Or don't. The void doesn't care.",
      "A miss. Cosmically, meaningfully, a miss.",
    ];
    cs.message = loseMsgs[Math.floor(Math.random() * loseMsgs.length)];
    cs.spinLog.push(`Spin ${cs.spinsThisSession}: No win.`);
  }

  syncCredits();
  renderClassic();

  // If credits empty
  if (cs.credits < cs.betPerSpin && cs.freeSpinsLeft === 0) {
    setTimeout(() => { cs.message = "OUT OF CREDITS. The void collects."; renderClassic(); }, 600);
  }
}

function evaluateClassicLine(symbols) {
  // Replace wilds
  const effective = symbols.map(s => s.isWild ? null : s);

  // Find the dominant non-wild symbol (leftmost match)
  let anchor = null;
  for (const s of effective) { if (s) { anchor = s; break; } }
  if (!anchor) return 0; // all wilds — wild combo

  // Count how many match from left
  let count = 0;
  for (const s of effective) {
    if (!s || s.id === anchor.id) count++;
    else break;
  }

  if (count < 3) return 0;
  const multiplier = count === 3 ? 1 : count === 4 ? 3 : 10;
  return anchor.value * multiplier * Math.floor(_cs.betPerSpin / 10);
}

function triggerClassicJackpot() {
  // Flash the machine with rapid color cycling
  const cabinet = _overlay.querySelector('.sm-classic-cabinet');
  if (!cabinet) return;
  let flashes = 0;
  const interval = setInterval(() => {
    cabinet.style.borderColor = `hsl(${Math.random()*360},100%,60%)`;
    cabinet.style.boxShadow = `0 0 60px hsl(${Math.random()*360},100%,50%)`;
    flashes++;
    if (flashes > 20) {
      clearInterval(interval);
      cabinet.style.borderColor = '';
      cabinet.style.boxShadow = '';
    }
  }, 100);
}

// ─── ═══════════════════════════════════════════════════════
//     BRAIN 'SPLOSION
// ═══════════════════════════════════════════════════════════

function renderBrainSplosion() {
  const bs = _bs;
  const totalBet = bs.betPerLine * bs.activeLines;
  const canSpin = bs.credits >= totalBet && !bs.spinning;
  const isFree = bs.freeSpinsLeft > 0;
  const isBonus = bs.bonusTriggered;

  _overlay.innerHTML = `
    <div class="sm-container sm-brain ${bs.jackpotFlash ? 'sm-brain-jackpot' : ''} ${bs.phase === 'result' && bs.lastWin > 0 ? 'sm-brain-win-flash' : ''}">

      <!-- Chaos marquee (multiple layers) -->
      <div class="sm-brain-marquee-wrap">
        <div class="sm-brain-marquee sm-bm1">
          <span>🧠 BRAIN 'SPLOSION 🧠 ${bs.lastWin > 0 ? `WIN! +${bs.lastWin}¢ ` : ''}💥 25 LINES OF PURE UNCUT CHAOS 💥 THE DUCK IS ALWAYS WATCHING 🦆 IS IT A BIRD? IS IT A PLANE? NO. IT'S A BRAIN SPLOSION 🧠 </span>
        </div>
        <div class="sm-brain-marquee sm-bm2">
          <span>💎 JACKPOT 500x 💎 👁 WE SEE YOU 👁 🌈 COLOR IS A PRIVILEGE NOT A RIGHT 🌈 🍒 WHY IS THERE A CHERRY 🍒 NOBODY KNOWS 🦆 THE DUCK KNOWS 🦆 💥 </span>
        </div>
      </div>

      <!-- Header -->
      <div class="sm-header sm-brain-header">
        <div class="sm-brain-logo">
          <span class="sm-brain-title">BRAIN <span class="sm-brain-apostrophe">'</span>SPLOSION</span>
          <div class="sm-brain-stars">
            ${Array.from({length:7},(_,i)=>`<span class="sm-brain-star" style="animation-delay:${i*0.3}s;color:hsl(${i*51},100%,60%)">★</span>`).join('')}
          </div>
        </div>
        <div class="sm-brain-credit-box">
          <div class="sm-brain-credit-label">YOUR MONEY</div>
          <div class="sm-brain-credit-val">${bs.credits}¢</div>
          ${isFree ? `<div class="sm-free-badge sm-brain-free">FREE SPINS: ${bs.freeSpinsLeft} 🧠</div>` : ''}
          ${bs.freeSpinMultiplier > 1 ? `<div class="sm-brain-mult">×${bs.freeSpinMultiplier} MULTIPLIER ACTIVE</div>` : ''}
        </div>
        <button class="sm-btn sm-btn-leave sm-brain-leave" id="smLeaveBtn">ESCAPE 🚪</button>
      </div>

      <!-- Bonus brain announcement -->
      ${isBonus ? `
        <div class="sm-bonus-banner">
          🧠💥 BRAIN GOES BRRRR — ${bs.bonusSpinsLeft} CHAOS SPINS REMAINING 💥🧠
        </div>` : ''}

      <!-- Main cabinet -->
      <div class="sm-reel-cabinet sm-brain-cabinet">

        <!-- Left: payline info -->
        <div class="sm-brain-sidebar sm-brain-left-sidebar">
          <div class="sm-sidebar-title">TOP PAYS</div>
          ${BRAIN_SYMBOLS.slice(0,5).map(s => `
            <div class="sm-brain-pay-row">
              <span class="sm-brain-pay-sym" style="color:${s.color};text-shadow:0 0 8px ${s.glow}">${s.display}</span>
              <span class="sm-brain-pay-info">5× = <strong>${s.value * bs.betPerLine}¢</strong></span>
            </div>`).join('')}
          <div class="sm-sidebar-title" style="margin-top:8px">SPECIAL</div>
          <div class="sm-brain-pay-row"><span style="color:#fff">🌀</span><span class="sm-brain-pay-info">WILD</span></div>
          <div class="sm-brain-pay-row"><span style="color:#ffcc00">🎰</span><span class="sm-brain-pay-info">3=BONUS</span></div>
        </div>

        <!-- Center: reel window -->
        <div class="sm-brain-window-wrap">
          <div class="sm-brain-line-count">${bs.activeLines} LINES ACTIVE</div>
          <div class="sm-reel-window sm-brain-window">

            <!-- Expanding wilds overlay -->
            ${bs.expandingWilds.map(ri => `
              <div class="sm-expanding-wild" style="left:${ri*20}%">🌀</div>`).join('')}

            <!-- Reels -->
            <div class="sm-reels sm-brain-reels" id="smBrainReels">
              ${bs.reels.map((reel, ri) => `
                <div class="sm-reel sm-brain-reel ${bs.spinning ? 'sm-brain-reel-spin' : ''}" style="animation-delay:${ri * 0.12}s;animation-duration:${0.35 + ri * 0.08}s">
                  ${reel.map((sym, row) => {
                    const isWin = bs.winLines.length > 0 && bs.phase === 'result' &&
                      bs.expandingWilds.includes(ri);
                    const isExpWild = bs.expandingWilds.includes(ri) && sym.isWild;
                    return `<div class="sm-cell sm-brain-cell ${isWin ? 'sm-brain-cell-win' : ''} ${isExpWild ? 'sm-brain-wild-cell' : ''}"
                      style="background:${sym.isWild ? 'rgba(150,100,255,0.2)' : sym.isBonus ? 'rgba(255,200,0,0.2)' : ''}">
                      <div class="sm-brain-sym" style="color:${sym.color};text-shadow:0 0 10px ${sym.glow},0 0 30px ${sym.glow}60,0 0 60px ${sym.glow}20">
                        ${sym.display}
                        ${sym.name ? `<div class="sm-sym-name" style="color:${sym.color}80">${sym.name}</div>` : ''}
                      </div>
                    </div>`;
                  }).join('')}
                </div>`).join('')}
            </div>

            <!-- Win overlay -->
            ${bs.phase === 'result' && bs.lastWin > 0 ? `
              <div class="sm-brain-win-burst">
                <div class="sm-brain-win-amount">+${bs.lastWin}¢</div>
                ${bs.lastWinName ? `<div class="sm-brain-win-name">${bs.lastWinName}</div>` : ''}
              </div>` : ''}

            ${bs.spinning ? `<div class="sm-brain-spin-veil"></div>` : ''}
          </div>

          <!-- Win line display -->
          ${bs.winLines.length > 0 && bs.phase === 'result' ? `
            <div class="sm-win-lines-display">
              ${bs.winLines.length} LINE${bs.winLines.length > 1 ? 'S' : ''} WIN!
            </div>` : ''}
        </div>

        <!-- Right: active lines & win meter -->
        <div class="sm-brain-sidebar sm-brain-right-sidebar">
          <div class="sm-sidebar-title">LINES</div>
          <div class="sm-line-selector">
            ${[1,5,10,15,20,25].map(n => `
              <button class="sm-line-btn ${bs.activeLines === n ? 'sm-line-active' : ''}"
                data-lines="${n}">${n}</button>`).join('')}
          </div>
          <div class="sm-sidebar-title" style="margin-top:8px">METER</div>
          <div class="sm-brain-meter">
            <div class="sm-brain-meter-fill" style="height:${Math.min(100,(bs.totalWon/Math.max(1,bs.totalSpent+bs.totalWon))*100)}%"></div>
            <div class="sm-brain-meter-label">RTP</div>
          </div>
          <div class="sm-sidebar-title" style="margin-top:8px">SESSION</div>
          <div class="sm-brain-session">
            <div>Spins: <strong>${bs.spinsThisSession}</strong></div>
            <div style="color:#7ed9a0">Won: <strong>${bs.totalWon}¢</strong></div>
            <div style="color:#ff8888">Spent: <strong>${bs.totalSpent}¢</strong></div>
          </div>
        </div>
      </div>

      <!-- Message -->
      <div class="sm-message-bar sm-brain-msg ${bs.lastWin > 0 && bs.phase === 'result' ? 'sm-brain-msg-win' : ''}">
        ${bs.message || '&nbsp;'}
      </div>

      <!-- Controls -->
      <div class="sm-controls sm-brain-controls">
        <div class="sm-brain-bet-section">
          <div class="sm-brain-bet-label">BET/LINE</div>
          <div class="sm-bet-adjuster">
            <button class="sm-adj-btn sm-brain-adj" id="smBetDown">−</button>
            <div class="sm-bet-display sm-brain-bet">${bs.betPerLine}¢</div>
            <button class="sm-adj-btn sm-brain-adj" id="smBetUp">+</button>
          </div>
          <div class="sm-brain-total-bet">TOTAL BET: <strong>${totalBet}¢</strong></div>
        </div>

        <div class="sm-brain-spin-wrap">
          <button class="sm-brain-spin-btn ${!canSpin ? 'disabled' : ''} ${isFree ? 'sm-brain-free-btn' : ''} ${isBonus ? 'sm-bonus-spin-btn' : ''}"
            id="smSpinBtn" ${!canSpin ? 'disabled' : ''}>
            ${isBonus ? '💥 CHAOS SPIN 💥' : isFree ? '🧠 FREE SPIN 🧠' : 'SPIN'}
          </button>
          ${canSpin ? `
            <button class="sm-brain-auto-btn" id="smAutoBtn">AUTO ×5</button>` : ''}
        </div>

        <div class="sm-brain-quick-bets">
          <div class="sm-brain-bet-label">QUICK BET/LINE</div>
          ${[1,2,5,10,25].map(v =>
            `<button class="sm-brain-quick ${bs.betPerLine===v?'sm-bq-active':''}" data-val="${v}">${v}¢</button>`
          ).join('')}
        </div>
      </div>

      <!-- Log ticker -->
      <div class="sm-brain-log">
        ${bs.spinLog.slice(-5).map((l,i) => `<div class="sm-blog-entry" style="opacity:${0.4+i*0.15}">${l}</div>`).join('') || '<div class="sm-blog-entry">The brain awaits your sacrifice.</div>'}
      </div>

    </div>`;

  // Wire all buttons
  document.getElementById('smLeaveBtn')?.addEventListener('click', smConfirmLeave);
  document.getElementById('smSpinBtn')?.addEventListener('click', brainSpin);
  document.getElementById('smAutoBtn')?.addEventListener('click', () => brainAutoSpin(5));
  document.getElementById('smBetDown')?.addEventListener('click', () => {
    _bs.betPerLine = Math.max(1, _bs.betPerLine - 1);
    renderBrainSplosion();
  });
  document.getElementById('smBetUp')?.addEventListener('click', () => {
    _bs.betPerLine = Math.min(50, _bs.betPerLine + 1);
    renderBrainSplosion();
  });
  document.querySelectorAll('.sm-line-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _bs.activeLines = parseInt(btn.dataset.lines);
      renderBrainSplosion();
    });
  });
  document.querySelectorAll('.sm-brain-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      _bs.betPerLine = parseInt(btn.dataset.val);
      renderBrainSplosion();
    });
  });
}

function brainSpin() {
  const bs = _bs;
  const isFree = bs.freeSpinsLeft > 0 || bs.bonusSpinsLeft > 0;
  const totalBet = bs.betPerLine * bs.activeLines;
  const cost = isFree ? 0 : totalBet;

  if (!isFree && bs.credits < totalBet) {
    bs.message = "💸 OUT OF CREDITS. The brain is disappointed in you.";
    renderBrainSplosion(); return;
  }

  bs.spinning = true;
  bs.phase = 'spinning';
  bs.credits -= cost;
  bs.totalSpent += cost;
  bs.spinsThisSession++;
  bs.winLines = [];
  bs.lastWin = 0;
  bs.expandingWilds = [];
  bs.jackpotFlash = false;
  bs.lastWinName = '';

  if (bs.freeSpinsLeft > 0) bs.freeSpinsLeft--;
  else if (bs.bonusSpinsLeft > 0) bs.bonusSpinsLeft--;

  const spinMessages = [
    "🧠 THE BRAIN SPINS...", "💥 CHAOS IN MOTION...", "🌈 COLORS INCOMING...",
    "🦆 THE DUCK WATCHES...", "👁 THE EYE SEES ALL...", "💎 SEARCHING FOR DIAMONDS...",
    "🧠 NEURONS FIRING...", "💥 PROBABILITY IGNORED..."
  ];
  bs.message = spinMessages[Math.floor(Math.random() * spinMessages.length)];
  renderBrainSplosion();

  const spinDuration = bs.bonusSpinsLeft > 0 ? 500 : 900 + Math.random() * 500;
  setTimeout(() => {
    // Generate results
    bs.reels = buildBrainReels();

    // Bonus mode: force wilds to expand
    if (bs.bonusSpinsLeft > 0 || bs.bonusTriggered) {
      bs.reels.forEach((reel, ri) => {
        if (Math.random() < 0.4) {
          reel[Math.floor(Math.random() * 4)] = BRAIN_SYMBOLS.find(s => s.isWild);
        }
      });
    }

    bs.spinning = false;
    bs.phase = 'result';
    resolveBrain();
  }, spinDuration);
}

let _autoSpinCount = 0;
function brainAutoSpin(count) {
  _autoSpinCount = count;
  runAutoSpin();
}
function runAutoSpin() {
  if (_autoSpinCount <= 0 || _bs.credits < _bs.betPerLine * _bs.activeLines) return;
  _autoSpinCount--;
  brainSpin();
  // Chain next auto spin after result
  const interval = setInterval(() => {
    if (!_bs.spinning && _bs.phase === 'result') {
      clearInterval(interval);
      if (_autoSpinCount > 0) {
        setTimeout(runAutoSpin, 600);
      }
    }
  }, 100);
}

function resolveBrain() {
  const bs = _bs;
  let totalWin = 0;
  const winLines = [];

  // Check expanding wilds first
  const expandedReels = [];
  bs.reels.forEach((reel, ri) => {
    if (reel.some(s => s.isWild)) {
      expandedReels.push(ri);
      // Expand: fill whole reel with wild
      bs.reels[ri] = Array.from({length: 4}, () => BRAIN_SYMBOLS.find(s => s.isWild));
    }
  });
  bs.expandingWilds = expandedReels;

  // Check each active payline
  BRAIN_PAYLINES.slice(0, bs.activeLines).forEach((pl, lineIdx) => {
    const lineSymbols = pl.map((row, reel) => bs.reels[reel][row]);
    const win = evaluateBrainLine(lineSymbols, bs.betPerLine);
    if (win > 0) {
      totalWin += win * (bs.freeSpinMultiplier || 1);
      winLines.push(lineIdx);
    }
  });

  // Count bonus symbols
  let bonusCount = 0;
  bs.reels.forEach(reel => reel.forEach(s => { if (s.isBonus) bonusCount++; }));

  if (bonusCount >= 3 && !bs.bonusTriggered) {
    bs.bonusTriggered = true;
    bs.bonusSpinsLeft = bonusCount >= 5 ? 20 : bonusCount >= 4 ? 15 : 10;
    bs.freeSpinMultiplier = Math.min(5, bonusCount);
    bs.spinLog.push(`🎰 ${bonusCount} BONUS → BRAIN GOES BRRRR! ${bs.bonusSpinsLeft} CHAOS SPINS × ${bs.freeSpinMultiplier} MULTIPLIER`);
  }

  // Decrement bonus if active
  if (bs.bonusSpinsLeft <= 0 && bs.bonusTriggered) {
    bs.bonusTriggered = false;
    bs.freeSpinMultiplier = 1;
  }

  // Free spins from scatter-equivalent (eye symbol 3+)
  let eyeCount = 0;
  bs.reels.forEach(reel => reel.forEach(s => { if (s.id === 'eye') eyeCount++; }));
  if (eyeCount >= 3) {
    const freeSpins = eyeCount >= 5 ? 15 : eyeCount >= 4 ? 10 : 5;
    bs.freeSpinsLeft += freeSpins;
    bs.spinLog.push(`👁 ${eyeCount} EYES → ${freeSpins} FREE SPINS. IT SEES YOU.`);
  }

  bs.lastWin = totalWin;
  bs.totalWon += totalWin;
  bs.credits += totalWin;
  bs.winLines = winLines;

  // Determine win message
  if (totalWin >= bs.betPerLine * bs.activeLines * 100) {
    bs.jackpotFlash = true;
    bs.lastWinName = 'VOID JACKPOT 💎';
    bs.message = `💎 VOID JACKPOT! 💎 +${totalWin}¢ THE BRAIN HAS SPOKEN AND IT IS GENEROUS TODAY ONLY!`;
    bs.spinLog.push(`💎 JACKPOT! +${totalWin}¢`);
  } else if (totalWin > 0) {
    const winSym = BRAIN_PAYLINES[winLines[0]]
      ? bs.reels[0][BRAIN_PAYLINES[winLines[0]][0]]
      : null;
    bs.lastWinName = winSym?.name || 'WIN!';

    const winMsgs = [
      `💥 +${totalWin}¢ — YOUR NEURONS ARE FIRING CORRECTLY.`,
      `🌈 +${totalWin}¢ — THE RAINBOW BLESSES YOU. PROBABLY.`,
      `🧠 +${totalWin}¢ — BRAIN APPROVES OF THIS DEVELOPMENT.`,
      `+${totalWin}¢ ON ${winLines.length} LINE${winLines.length>1?'S':''}! THE DUCK IS PLEASED! 🦆`,
      `💰 +${totalWin}¢ — STATISTICALLY IMPROBABLE. YOU'RE WELCOME.`,
      `🍒 THE CHERRY. IT HAPPENED. +${totalWin}¢`,
      `👁 +${totalWin}¢ — WE SAW THAT. WE SEE EVERYTHING.`,
    ];
    bs.message = winMsgs[Math.floor(Math.random() * winMsgs.length)];
    bs.spinLog.push(`Win: +${totalWin}¢ (${winLines.length} lines, ${expandedReels.length > 0 ? '🌀 wilds expanded' : 'no wilds'})`);
  } else {
    const loseMsgs = [
      "The brain is unimpressed. Spin again.",
      "💥 LOSS. THE BRAIN DOES NOT APOLOGIZE.",
      "🦆 THE DUCK OFFERS NO CONSOLATION.",
      "👁 WE SEE YOUR LOSS. WE CHOOSE NOT TO HELP.",
      "🌈 No win. The colors mock you.",
      "Statistical inevitability: completed.",
      "🧠 YOUR BRAIN SAYS: TRY AGAIN. YOUR WALLET SAYS: DON'T.",
      "The cherry appeared and then left. Like everyone.",
      "SPIN COMPLETE. CREDITS MISSING. INVESTIGATION UNNECESSARY.",
    ];
    bs.message = loseMsgs[Math.floor(Math.random() * loseMsgs.length)];
    bs.spinLog.push(`Spin ${bs.spinsThisSession}: No win.`);
  }

  syncCredits();
  renderBrainSplosion();

  // Post-win jackpot sequence
  if (bs.jackpotFlash) {
    setTimeout(() => triggerBrainJackpot(), 200);
  }
}

function evaluateBrainLine(symbols, betPerLine) {
  // Resolve wilds
  let anchor = null;
  for (const s of symbols) { if (s && !s.isWild && !s.isBonus) { anchor = s; break; } }
  if (!anchor) return 0;

  let count = 0;
  for (const s of symbols) {
    if (!s || s.isWild || s.id === anchor.id) count++;
    else break;
  }

  if (count < 3) return 0;
  const mult = count === 3 ? 1 : count === 4 ? 4 : 15;
  return anchor.value * mult * betPerLine;
}

function triggerBrainJackpot() {
  // Absolutely unhinged jackpot sequence
  let frame = 0;
  const colors = ['#ff00ff','#00ffff','#ffff00','#ff6600','#00ff88','#ff0088'];
  const container = _overlay.querySelector('.sm-brain');
  if (!container) return;
  const interval = setInterval(() => {
    const c = colors[frame % colors.length];
    container.style.setProperty('--brain-flash', c);
    container.style.borderColor = c;
    container.style.boxShadow = `0 0 80px ${c}, inset 0 0 40px ${c}40`;
    frame++;
    if (frame > 30) {
      clearInterval(interval);
      container.style.borderColor = '';
      container.style.boxShadow = '';
      container.style.removeProperty('--brain-flash');
    }
  }, 80);
}

// ─── SHARED: LEAVE / CLOSE ────────────────────────────────────────────────────

function smConfirmLeave() {
  const isBrain = _machineType === 'brain_splosion';
  const current = isBrain ? _bs.credits : _cs.credits;
  const net = current - _sessionStartCredits;
  const spins = isBrain ? _bs.spinsThisSession : _cs.spinsThisSession;
  const won = isBrain ? _bs.totalWon : _cs.totalWon;
  const spent = isBrain ? _bs.totalSpent : _cs.totalSpent;

  _overlay.innerHTML = `
    <div class="sm-container sm-leave-screen">
      <div class="sm-leave-icon">${isBrain ? '🧠' : '◈'}</div>
      <div class="sm-leave-title">${isBrain ? "LEAVING ALREADY? THE BRAIN IS JUDGING YOU." : "The void releases you. For now."}</div>

      <div class="sm-leave-stats">
        <div class="sm-leave-stat">
          <span>Credits when you sat down</span>
          <strong>${_sessionStartCredits}¢</strong>
        </div>
        <div class="sm-leave-stat">
          <span>Credits now</span>
          <strong>${current}¢</strong>
        </div>
        <div class="sm-leave-stat">
          <span>Net result</span>
          <strong class="${net >= 0 ? 'sm-stat-green' : 'sm-stat-red'}">${net >= 0 ? '+' : ''}${net}¢</strong>
        </div>
        <div class="sm-leave-stat sm-leave-divider">
          <span>Total spins</span><strong>${spins}</strong>
        </div>
        <div class="sm-leave-stat">
          <span>Total won</span><strong class="sm-stat-green">${won}¢</strong>
        </div>
        <div class="sm-leave-stat">
          <span>Total spent</span><strong class="sm-stat-red">${spent}¢</strong>
        </div>
        ${net < 0 ? `<div class="sm-leave-quote">${isBrain ? '"The brain did not lose. You did." — The Brain' : '"The void always wins. You played well." — The Void'}</div>` : `<div class="sm-leave-quote sm-leave-win-quote">${isBrain ? '"VICTORY! THE BRAIN IS PLEASED. LEAVE QUICKLY." — The Brain' : '"A winner walks free. Rare. Remember this." — The Void'}</div>`}
      </div>

      <div class="sm-leave-btns">
        <button class="sm-btn sm-btn-stay" id="smStayBtn">One More Spin</button>
        <button class="sm-btn sm-btn-leave-confirm" id="smConfirmLeave">Cash Out</button>
      </div>
    </div>`;

  document.getElementById('smStayBtn')?.addEventListener('click', () => {
    MACHINE_REGISTRY[_machineType]?.renderFn();
  });
  document.getElementById('smConfirmLeave')?.addEventListener('click', smClose);
}

function smClose() {
  syncCredits();
  if (_overlay) { _overlay.remove(); _overlay = null; }
  _api.renderAll?.();
}

function syncCredits() {
  if (_machineType === 'brain_splosion') {
    _state.resources.credits = _bs.credits;
  } else {
    _state.resources.credits = _cs.credits;
  }
}

// ─── STYLE INJECTION ──────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('slotMachineStyles')) return;
  const link = document.createElement('link');
  link.id = 'slotMachineStyles';
  link.rel = 'stylesheet';
  link.href = 'css/SlotMachine.css';
  document.head.appendChild(link);
}
