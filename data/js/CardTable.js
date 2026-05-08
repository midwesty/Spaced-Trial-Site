/**
 * VOID TABLE — Galactic Card Game System for Spaced
 * =====================================================
 * Entry point: openCardTable(tableId, state, data, api)
 *
 * Games: blackjack | void_draw | holdem
 * Adding a game: register in GAME_REGISTRY. No other changes needed.
 *
 * BUG FIXES in this version:
 *  1. Exit screen now shows correct "sat down" vs current credits
 *     using _sessionStartCredits snapshot taken at openCardTable().
 *  2. Void Draw pot is built during initVoidDraw (not at resolve),
 *     each NPC's actual bet is shown on their seat card, and the
 *     running pot total is displayed on the table.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SUITS = [
  { id: 'void',  label: 'VOID',  symbol: '◈', color: '#9b59ff' },
  { id: 'pulse', label: 'PULSE', symbol: '⚡', color: '#ffcc5a' },
  { id: 'drift', label: 'DRIFT', symbol: '~',  color: '#79d4ff' },
  { id: 'flux',  label: 'FLUX',  symbol: '⊕', color: '#7ed9a0' },
];

const FACE_VALUES = { J: 10, Q: 10, K: 10, A: 11 };
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const VOID_SHIFTS = {
  marshal:  { id: 'overcharge',  label: 'Overcharge',  desc: 'Force an opponent to discard their highest card.' },
  raider:   { id: 'overcharge',  label: 'Overcharge',  desc: 'Force an opponent to discard their highest card.' },
  salvager: { id: 'strip_mine',  label: 'Strip Mine',  desc: 'Peek at two cards from any opponent before acting.' },
  voidseer: { id: 'premonition', label: 'Premonition', desc: 'See the top 3 cards of the draw deck before drawing.' },
  _default: { id: 'lucky_draw',  label: 'Lucky Draw',  desc: 'Draw 3 cards from the deck, keep 1, discard 2.' },
};

// ─── DECK UTILITIES ───────────────────────────────────────────────────────────

function buildDeck() {
  const deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      const val = FACE_VALUES[rank] ?? parseInt(rank);
      deck.push({ suit: suit.id, rank, value: val, faceUp: false, id: `${rank}_${suit.id}` });
    });
  });
  return deck;
}

function buildVoidDeck() {
  const deck = [];
  SUITS.forEach(suit => {
    for (let v = 1; v <= 10; v++)
      deck.push({ suit: suit.id, rank: String(v), value: v, faceUp: false, id: `${v}_${suit.id}` });
  });
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(cards) {
  let total = 0, aces = 0;
  cards.forEach(c => {
    if (!c.faceUp) return;
    if (c.rank === 'A') { aces++; total += 11; } else total += c.value;
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function voidHandValue(cards) { return cards.reduce((s, c) => s + c.value, 0); }

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _overlay   = null;
let _tableData = null;
let _state     = null;
let _data      = null;
let _api       = null;

// FIX 1: Snapshot at session open so exit screen always shows correct delta
let _sessionStartCredits = 0;

let _ts = {   // _tableState shorthand
  game: null, phase: 'lobby',
  playerCredits: 0, playerBet: 0,
  seats: [], deck: [], pot: 0, round: 0,
  playerHand: [], playerStatus: 'active',
  voidShiftUsed: false, voidShiftPeeked: null,
  message: '', log: [], gossipShown: new Set(),
};

// ─── GAME REGISTRY ────────────────────────────────────────────────────────────

const GAME_REGISTRY = {
  blackjack: {
    id: 'blackjack', name: 'Blackjack', icon: '♠',
    subtitle: '21 — Beat the dealer without going over',
    description: 'Get as close to 21 as possible. Face cards = 10, Aces = 1 or 11. Dealer hits on 16 or less. NPCs play alongside you — each independently against the dealer.',
    initFn: initBlackjack, renderFn: renderBlackjack,
  },
  void_draw: {
    id: 'void_draw', name: 'Void Draw', icon: '◈',
    subtitle: 'Target 30 — The game of the outer void',
    description: 'Each player antes in. 5 cards dealt, target 30 without going over. Swap up to 2 cards once. Best hand wins the full pot. Use your class Void Shift once per session.',
    initFn: initVoidDraw, renderFn: renderVoidDraw,
  },
  holdem: {
    id: 'holdem', name: "Texas Hold 'Em", icon: '♦',
    subtitle: 'Best 5-card hand from 2 hole + 5 community cards',
    description: 'Two hole cards per player. Five community cards over 4 rounds: Pre-Flop, Flop, Turn, River. Blind bets open each hand. Fold, call, check, or raise. Best hand at showdown wins the pot.',
    initFn: initHoldem, renderFn: renderHoldem,
  },
};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

export function openCardTable(tableId, state, data, api) {
  _state = state; _data = data; _api = api;
  const table = (data.tables || []).find(t => t.id === tableId);
  if (!table) { console.warn('[CardTable] Not found:', tableId); return; }
  _tableData = table;

  if (table.requiredFlag && !state.flags[table.requiredFlag]) {
    api.log(`The ${table.name} is not accessible yet.`); return;
  }

  // Snapshot entry credits — used for net calc on exit (never overwritten mid-session)
  _sessionStartCredits = state.resources.credits;

  _ts = {
    game: null, phase: 'lobby',
    playerCredits: state.resources.credits,
    playerBet: Math.max(table.minBet, 10),
    seats: buildSeats(table, data.gamblers || []),
    deck: [], pot: 0, round: 0,
    playerHand: [], playerStatus: 'active',
    voidShiftUsed: false, voidShiftPeeked: null,
    message: '', log: [], gossipShown: new Set(),
  };

  _ts.seats.forEach(seat => {
    const saved = state.gamblerCredits?.[seat.gamblerId];
    if (saved !== undefined) seat.credits = saved;
  });

  injectStyles();
  if (_overlay) _overlay.remove();
  _overlay = document.createElement('div');
  _overlay.id = 'voidTableOverlay';
  _overlay.className = 'vt-overlay';
  document.body.appendChild(_overlay);
  renderLobby();
}

function buildSeats(table, gamblers) {
  return (table.seats || []).map(s => {
    const g = gamblers.find(x => x.id === s.gamblerId) || {
      id: s.gamblerId, name: 'Unknown', archetype: 'nervous',
      bluffFrequency: 0.1, foldThreshold: 0.4, aggressionBias: 0.2,
      creditReset: 200, tells: [], winDialogue: [], loseDialogue: [], bustDialogue: [], gossipDialogue: {},
    };
    return {
      gamblerId: g.id, name: g.name, archetype: g.archetype, speciesId: g.speciesId,
      credits: s.startingCredits || g.creditReset || 200,
      hand: [], bet: 0, totalBet: 0, status: 'active', heFolded: false, heLastAction: '',
      _def: g,
    };
  });
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────

function renderLobby() {
  const t = _tableData;
  const availGames = (t.availableGames || ['blackjack','void_draw','holdem'])
    .map(id => GAME_REGISTRY[id]).filter(Boolean);

  _overlay.innerHTML = `
    <div class="vt-container vt-lobby">
      <div class="vt-header">
        <div class="vt-header-left">
          <div class="vt-title">${t.name}</div>
          <div class="vt-subtitle">${t.location}</div>
        </div>
        <div class="vt-header-right">
          <div class="vt-credits-display">
            <span class="vt-label">YOUR CREDITS</span>
            <span class="vt-credits-val">${_ts.playerCredits}</span>
          </div>
          <button class="vt-btn vt-btn-leave" id="vtLeaveBtn">Leave Table</button>
        </div>
      </div>
      <div class="vt-lobby-body">
        <div class="vt-seats-section">
          <div class="vt-section-title">PLAYERS AT THE TABLE</div>
          <div class="vt-seat-cards">
            ${_ts.seats.map(seat => {
              const archLabel = {shark:'◆ Shark',nervous:'◇ Nervous',reckless:'⚠ Reckless',drunk:'~ Drunk'}[seat.archetype]||seat.archetype;
              return `<div class="vt-seat-card vt-arch-${seat.archetype}">
                <div class="vt-seat-avatar">${seat.name[0].toUpperCase()}</div>
                <div class="vt-seat-info">
                  <div class="vt-seat-name">${seat.name}</div>
                  <div class="vt-seat-arch">${archLabel}</div>
                  <div class="vt-seat-credits">${seat.credits}¢</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="vt-games-section">
          <div class="vt-section-title">CHOOSE YOUR GAME</div>
          <div class="vt-game-cards">
            ${availGames.map(g => `
              <div class="vt-game-card">
                <div class="vt-game-icon">${g.icon}</div>
                <div class="vt-game-name">${g.name}</div>
                <div class="vt-game-sub">${g.subtitle}</div>
                <div class="vt-game-desc">${g.description}</div>
                <div class="vt-game-stakes">Min <strong>${t.minBet}¢</strong> — Max <strong>${t.maxBet}¢</strong></div>
                <button class="vt-btn vt-btn-primary vt-play-btn" data-game="${g.id}">Play ${g.name}</button>
              </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="vt-atmosphere-bar">
        <span class="vt-atm-label">${({dim:'🔅 Dim and smoky',tense:'⚡ Charged with tension',hostile:'🔴 Hostile territory',quiet:'◈ Quiet and watchful'})[t.atmosphere]||'◈ Void Table'}</span>
        <span class="vt-credits-hint">Min bet: ${t.minBet}¢ · Max: ${t.maxBet}¢</span>
      </div>
    </div>`;

  document.getElementById('vtLeaveBtn').onclick = () => closeTable();
  document.querySelectorAll('.vt-play-btn').forEach(btn => {
    btn.onclick = () => startGame(btn.dataset.game);
  });
}

// ─── GAME START ───────────────────────────────────────────────────────────────

function startGame(gameId) {
  if (!GAME_REGISTRY[gameId]) return;
  _ts.game = gameId;
  _ts.phase = 'bet';
  _ts.round = (_ts.round || 0) + 1;
  if (gameId === 'holdem') { initHoldem(); renderHoldem(); }
  else renderBetPhase();
}

function renderBetPhase() {
  const t = _tableData, ts = _ts;
  const game = GAME_REGISTRY[ts.game];
  const maxBet = Math.min(t.maxBet, ts.playerCredits);
  const clampV = (v,mn,mx) => Math.max(mn,Math.min(mx,v));

  // FIX 2: Show estimated pot so player knows what they're getting into
  const estNPCTotal = ts.seats.filter(s=>s.credits>0).reduce((a,s) => {
    const pct = {shark:0.3,reckless:0.7,nervous:0.05,drunk:0.4}[s.archetype]||0.2;
    return a + Math.floor(t.minBet + (Math.min(t.maxBet,s.credits)-t.minBet)*pct);
  },0);

  _overlay.innerHTML = `
    <div class="vt-container vt-bet-screen">
      <div class="vt-header">
        <div class="vt-header-left">
          <div class="vt-title">${t.name} — ${game.name}</div>
          <div class="vt-subtitle">Round ${ts.round}</div>
        </div>
        <div class="vt-header-right">
          <div class="vt-credits-display">
            <span class="vt-label">CREDITS</span>
            <span class="vt-credits-val">${ts.playerCredits}</span>
          </div>
          <button class="vt-btn vt-btn-leave" id="vtBackLobbyBtn">← Back</button>
        </div>
      </div>
      <div class="vt-bet-body">
        <div class="vt-bet-panel">
          <div class="vt-section-title">PLACE YOUR BET</div>
          <div class="vt-bet-display" id="vtBetDisplay">${ts.playerBet}¢</div>
          <input type="range" class="vt-bet-slider" id="vtBetSlider"
            min="${t.minBet}" max="${maxBet}"
            value="${clampV(ts.playerBet,t.minBet,maxBet)}"
            step="${Math.max(1,Math.floor(t.minBet/2))}"/>
          <div class="vt-quick-bets">
            <button class="vt-btn vt-quick-btn" data-pct="0">Min (${t.minBet}¢)</button>
            <button class="vt-btn vt-quick-btn" data-pct="25">¼ Max</button>
            <button class="vt-btn vt-quick-btn" data-pct="50">½ Max</button>
            <button class="vt-btn vt-quick-btn" data-pct="100">All-In (${maxBet}¢)</button>
          </div>
          <button class="vt-btn vt-btn-primary vt-deal-btn" id="vtDealBtn">DEAL — ${ts.playerBet}¢</button>
        </div>
        <div class="vt-seats-preview">
          <div class="vt-section-title">OPPONENTS</div>
          <div class="vt-pot-preview">Est. pot: ~${ts.playerBet + estNPCTotal}¢</div>
          <div class="vt-pot-note">Each opponent antes their own bet. You win the full pot if you have the best hand.</div>
          ${ts.seats.map(s => `
            <div class="vt-seat-row vt-arch-${s.archetype}">
              <span class="vt-seat-dot"></span>
              <span class="vt-seat-name-sm">${s.name}</span>
              <span class="vt-seat-credits-sm">${s.credits}¢</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  const slider = document.getElementById('vtBetSlider');
  const display = document.getElementById('vtBetDisplay');
  const dealBtn = document.getElementById('vtDealBtn');
  slider.addEventListener('input', () => {
    ts.playerBet = parseInt(slider.value);
    display.textContent = ts.playerBet+'¢';
    dealBtn.textContent = `DEAL — ${ts.playerBet}¢`;
  });
  document.querySelectorAll('.vt-quick-btn').forEach(btn => {
    btn.onclick = () => {
      const pct = parseInt(btn.dataset.pct);
      ts.playerBet = Math.max(t.minBet, Math.min(pct===0 ? t.minBet : Math.floor(maxBet*pct/100), maxBet));
      slider.value = ts.playerBet; display.textContent = ts.playerBet+'¢'; dealBtn.textContent=`DEAL — ${ts.playerBet}¢`;
    };
  });
  dealBtn.onclick = () => {
    if (ts.playerCredits < ts.playerBet) { showMessage('Not enough credits.'); return; }
    ts.playerCredits -= ts.playerBet;
    ts.phase = 'playing';
    GAME_REGISTRY[ts.game].initFn();
    GAME_REGISTRY[ts.game].renderFn();
  };
  document.getElementById('vtBackLobbyBtn').onclick = () => { _ts.game=null; _ts.phase='lobby'; renderLobby(); };
}

// ─── BLACKJACK ────────────────────────────────────────────────────────────────

function initBlackjack() {
  const ts = _ts;
  ts.deck = shuffle(buildDeck());
  ts.playerHand = []; ts.playerStatus = 'active';
  ts.dealerHand = []; ts.dealerStatus = 'active';
  ts.seats.forEach(seat => {
    if (seat.credits <= 0) { seat.status='fold'; seat.bet=0; return; }
    seat.hand=[]; seat.status='active';
    seat.bet = npcBet(seat, _tableData);
    seat.credits -= seat.bet;
  });
  ts.playerHand = [deal(true), deal(true)];
  ts.dealerHand = [deal(true), deal(false)];
  ts.seats.forEach(seat => { if (seat.status!=='fold') seat.hand=[deal(true),deal(true)]; });
}

function deal(faceUp=true) {
  const card = _ts.deck.pop();
  if (card) card.faceUp = faceUp;
  return card;
}

function renderBlackjack() {
  const ts = _ts;
  const pv = handValue(ts.playerHand);
  const dv = handValue(ts.dealerHand.filter(c=>c.faceUp));
  const hero = _state.roster.find(a=>a.id===_state.selectedActorId||a.role==='player');
  const shift = VOID_SHIFTS[hero?.classId]||VOID_SHIFTS._default;
  const canHit   = ts.playerStatus==='active' && pv<21;
  const canStand = ts.playerStatus==='active';
  const canShift = !ts.voidShiftUsed && ts.playerStatus==='active';

  _overlay.innerHTML = `
    <div class="vt-container vt-game-screen">
      ${gameHeader('Blackjack',`Round ${ts.round}`)}
      <div class="vt-table-surface">
        <div class="vt-dealer-zone">
          <div class="vt-zone-label">DEALER · ${ts.dealerHand.some(c=>!c.faceUp)?'?':dv}</div>
          <div class="vt-hand">${ts.dealerHand.map(c=>cardHTML(c)).join('')}</div>
        </div>
        <div class="vt-npc-row">
          ${ts.seats.map(seat=>`
            <div class="vt-npc-seat ${seat.status==='fold'||seat.status==='bust'?'vt-npc-out':''}">
              <div class="vt-npc-name">${seat.name}</div>
              <div class="vt-hand vt-npc-hand">${seat.hand.map(c=>cardHTML(c,true)).join('')}</div>
              <div class="vt-npc-bet-row">Bet: ${seat.bet}¢</div>
              <div class="vt-npc-credits">${seat.credits}¢</div>
              <div class="vt-npc-status vt-arch-${seat.archetype}">${npcStatusLabel(seat)}</div>
            </div>`).join('')}
        </div>
        <div class="vt-player-zone">
          <div class="vt-zone-label">YOU · ${pv>21?`<span class="vt-bust">BUST ${pv}</span>`:pv}</div>
          <div class="vt-hand">${ts.playerHand.map(c=>cardHTML(c)).join('')}</div>
          <div class="vt-bet-chip">BET: ${ts.playerBet}¢</div>
        </div>
      </div>
      <div class="vt-action-bar">
        <div class="vt-action-left"><div class="vt-credits-chip">Credits: <strong>${ts.playerCredits}</strong></div></div>
        <div class="vt-action-btns">
          ${canHit?`<button class="vt-btn vt-btn-primary" id="vtHitBtn">Hit</button>`:''}
          ${canStand?`<button class="vt-btn" id="vtStandBtn">Stand</button>`:''}
          ${canShift?`<button class="vt-btn vt-btn-shift" id="vtShiftBtn" title="${shift.desc}">${shift.label} ◈</button>`:''}
          ${ts.playerStatus!=='active'?`<button class="vt-btn vt-btn-primary" id="vtNextRoundBtn">Next Round</button>`:''}
        </div>
        <div class="vt-action-right"><button class="vt-btn vt-btn-sm vt-btn-leave" id="vtLeaveGameBtn">Leave</button></div>
      </div>
      <div class="vt-message-bar">${ts.message||'&nbsp;'}</div>
      <div class="vt-log">${ts.log.slice(-4).map(l=>`<div>${l}</div>`).join('')}</div>
    </div>`;

  document.getElementById('vtHitBtn')?.addEventListener('click', bjHit);
  document.getElementById('vtStandBtn')?.addEventListener('click', bjStand);
  document.getElementById('vtShiftBtn')?.addEventListener('click', ()=>activateVoidShift('blackjack'));
  document.getElementById('vtNextRoundBtn')?.addEventListener('click', startNextRound);
  document.getElementById('vtLeaveGameBtn').addEventListener('click', confirmLeave);
}

function bjHit() {
  const card = deal(true);
  if (!card) return;
  _ts.playerHand.push(card);
  const v = handValue(_ts.playerHand);
  addLog(`You hit: ${cardLabel(card)} — total ${v}.`);
  if (v > 21) { _ts.playerStatus='bust'; _ts.message=`Bust with ${v}!`; setTimeout(bjResolveDealer,600); }
  else if (v===21) { _ts.playerStatus='stand'; _ts.message='21! Standing.'; setTimeout(bjResolveDealer,600); }
  else renderBlackjack();
}

function bjStand() { _ts.playerStatus='stand'; addLog('You stand.'); bjResolveDealer(); }

function bjResolveDealer() {
  const ts = _ts;
  ts.dealerHand.forEach(c=>c.faceUp=true);
  ts.seats.forEach(seat => {
    if (seat.status!=='active') return;
    let v = handValue(seat.hand.map(c=>({...c,faceUp:true})));
    while (v<17 && ts.deck.length) { const nc=deal(true); if(nc){seat.hand.push(nc);v=handValue(seat.hand);} }
    seat.status = v>21?'bust':'stand';
  });
  let dv = handValue(ts.dealerHand);
  while (dv<=16 && ts.deck.length) { const dc=deal(true); if(dc){ts.dealerHand.push(dc);dv=handValue(ts.dealerHand);} }
  bjResolvePot();
}

function bjResolvePot() {
  const ts = _ts;
  const pv = handValue(ts.playerHand);
  const dv = handValue(ts.dealerHand);
  const dbust = dv>21;
  let delta=0, result='';
  if (ts.playerStatus==='bust') { result=`Bust with ${pv}. Dealer wins.`; }
  else if (dbust)    { delta=ts.playerBet*2; result=`Dealer busts! You win ${delta}¢!`; }
  else if (pv>dv)    { delta=ts.playerBet*2; result=`You win! ${pv} beats ${dv}. +${delta}¢`; }
  else if (pv===dv)  { delta=ts.playerBet;   result=`Push — ${pv} each. Bet returned.`; }
  else               { result=`Dealer wins. ${dv} beats your ${pv}.`; }
  ts.playerCredits += delta;
  ts.seats.forEach(seat=>{
    if (seat.status==='bust'||seat.status==='fold') return;
    const sv=handValue(seat.hand);
    if (dbust||sv>dv) seat.credits+=seat.bet*2;
    else if (sv===dv) seat.credits+=seat.bet;
  });
  ts.playerStatus = delta>0?'win':ts.playerStatus==='bust'?'bust':'lose';
  ts.message=result; addLog(result);
  syncCredits(); saveGamblers(); maybeGossip();
  if (delta>ts.playerBet && _tableData.onPlayerWinFlag) _state.flags[_tableData.onPlayerWinFlag]=true;
  renderBlackjack();
}

// ─── VOID DRAW ────────────────────────────────────────────────────────────────

function initVoidDraw() {
  const ts = _ts;
  ts.deck = shuffle(buildVoidDeck());
  ts.playerHand=[]; ts.playerStatus='active';
  ts.vdPhase='draw'; ts.vdSwapsLeft=2; ts.vdSelectedCards=new Set();
  // FIX 2: Build pot here with actual NPC bets so it's accurate during play
  ts.pot = ts.playerBet;
  ts.seats.forEach(seat=>{
    if (seat.credits<=0){seat.status='fold';seat.bet=0;return;}
    seat.hand=[]; seat.status='active';
    seat.bet = npcBet(seat,_tableData);
    seat.credits -= seat.bet;
    ts.pot += seat.bet;
  });
  for (let i=0;i<5;i++){const c=deal(true);if(c)ts.playerHand.push(c);}
  ts.seats.forEach(seat=>{
    if(seat.status==='fold')return;
    seat.hand=[];
    for(let i=0;i<5;i++){const c=deal(false);if(c)seat.hand.push(c);}
  });
}

function renderVoidDraw() {
  const ts = _ts;
  const pv = voidHandValue(ts.playerHand);
  const over = pv>30;
  const hero = _state.roster.find(a=>a.id===_state.selectedActorId||a.role==='player');
  const shift = VOID_SHIFTS[hero?.classId]||VOID_SHIFTS._default;
  const inSwap = ts.vdPhase==='draw' && ts.vdSwapsLeft>0 && ts.playerStatus==='active';
  const isResolved = ts.vdPhase==='reveal';

  _overlay.innerHTML=`
    <div class="vt-container vt-game-screen vt-void-draw">
      ${gameHeader('Void Draw',`Round ${ts.round} · Target 30 · Pot: ${ts.pot}¢`)}
      <div class="vt-table-surface">
        <div class="vt-npc-row">
          ${ts.seats.map(seat=>{
            if(isResolved) seat.hand.forEach(c=>c.faceUp=true);
            const sv = isResolved ? voidHandValue(seat.hand) : '?';
            return `<div class="vt-npc-seat ${seat.status==='fold'||seat.status==='bust'?'vt-npc-out':''}">
              <div class="vt-npc-name">${seat.name}</div>
              <div class="vt-hand vt-npc-hand">${seat.hand.map(c=>cardHTML(c,!isResolved)).join('')}</div>
              <div class="vt-npc-bet-row">Ante: ${seat.bet}¢</div>
              <div class="vt-npc-credits">${seat.credits}¢</div>
              <div class="vt-npc-status vt-arch-${seat.archetype}">${isResolved?(sv>30?'BUST':sv):npcStatusLabel(seat)}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="vt-player-zone">
          <div class="vt-zone-label">
            YOUR HAND · <span class="${over?'vt-bust':pv===30?'vt-perfect':''}">${pv}${over?' BUST':pv===30?' PERFECT':''}</span>
            ${inSwap?`<span class="vt-swap-hint">Click up to 2 cards to swap (${ts.vdSwapsLeft} left)</span>`:''}
          </div>
          <div class="vt-hand vt-player-hand-vd">
            ${ts.playerHand.map((c,i)=>`
              <div class="vt-card-wrap ${ts.vdSelectedCards?.has(i)?'vt-card-selected':''}"
                data-idx="${i}" onclick="${inSwap?`vtToggleCard(${i})`:''}"
                style="${inSwap?'cursor:pointer':''}">
                ${cardHTML(c)}
              </div>`).join('')}
          </div>
          <div class="vt-bet-chip">YOUR ANTE: ${ts.playerBet}¢ · TOTAL POT: ${ts.pot}¢</div>
        </div>
      </div>
      ${ts.voidShiftPeeked?peekPanel(ts.voidShiftPeeked):''}
      <div class="vt-action-bar">
        <div class="vt-action-left"><div class="vt-credits-chip">Credits: <strong>${ts.playerCredits}</strong></div></div>
        <div class="vt-action-btns">
          ${inSwap&&ts.vdSelectedCards?.size>0?`<button class="vt-btn vt-btn-primary" id="vtSwapBtn">Swap ${ts.vdSelectedCards.size}</button>`:''}
          ${inSwap?`<button class="vt-btn" id="vtSkipSwapBtn">Keep Hand</button>`:''}
          ${!inSwap&&ts.playerStatus==='active'&&!isResolved?`<button class="vt-btn vt-btn-primary" id="vtLockBtn">Lock In</button>`:''}
          ${!ts.voidShiftUsed&&ts.playerStatus==='active'&&!isResolved?`<button class="vt-btn vt-btn-shift" id="vtShiftBtn" title="${shift.desc}">${shift.label} ◈</button>`:''}
          ${isResolved?`<button class="vt-btn vt-btn-primary" id="vtNextRoundBtn">Next Round</button>`:''}
        </div>
        <div class="vt-action-right"><button class="vt-btn vt-btn-sm vt-btn-leave" id="vtLeaveGameBtn">Leave</button></div>
      </div>
      <div class="vt-message-bar">${ts.message||'&nbsp;'}</div>
      <div class="vt-log">${ts.log.slice(-4).map(l=>`<div>${l}</div>`).join('')}</div>
    </div>`;

  window.vtToggleCard=(idx)=>{
    const s=_ts.vdSelectedCards||((_ts.vdSelectedCards=new Set()),_ts.vdSelectedCards);
    s.has(idx)?s.delete(idx):s.size<2&&s.add(idx);
    renderVoidDraw();
  };
  document.getElementById('vtSwapBtn')?.addEventListener('click',vdSwap);
  document.getElementById('vtSkipSwapBtn')?.addEventListener('click',()=>{
    _ts.vdPhase='stand';_ts.playerStatus='stand';addLog('You keep your hand.');vdNPCTurns();
  });
  document.getElementById('vtLockBtn')?.addEventListener('click',()=>{
    _ts.playerStatus='stand';addLog('You lock in your hand.');vdNPCTurns();
  });
  document.getElementById('vtShiftBtn')?.addEventListener('click',()=>activateVoidShift('void_draw'));
  document.getElementById('vtNextRoundBtn')?.addEventListener('click',startNextRound);
  document.getElementById('vtLeaveGameBtn').addEventListener('click',confirmLeave);
}

function vdSwap() {
  const ts=_ts;
  const idxs=[...(ts.vdSelectedCards||[])].sort((a,b)=>b-a);
  idxs.forEach(i=>{const nc=deal(true);if(nc)ts.playerHand[i]=nc;});
  ts.vdSelectedCards=new Set(); ts.vdSwapsLeft--;
  const v=voidHandValue(ts.playerHand);
  addLog(`Swapped ${idxs.length}. New total: ${v}.`);
  if(v>30){ts.playerStatus='bust';ts.message=`Bust! ${v} over 30.`;vdNPCTurns();return;}
  if(ts.vdSwapsLeft<=0)ts.vdPhase='stand';
  renderVoidDraw();
}

function vdNPCTurns() {
  const ts=_ts;
  ts.seats.forEach(seat=>{
    if(seat.status!=='active')return;
    seat.hand.forEach(c=>c.faceUp=true);
    const v=voidHandValue(seat.hand);
    const th={shark:25,nervous:22,reckless:28,drunk:23}[seat.archetype]||24;
    const shouldSwap=(v<20)||(v<th&&v<27);
    if(shouldSwap&&ts.deck.length>=2){
      const sorted=[...seat.hand].map((c,i)=>({c,i})).sort((a,b)=>b.c.value-a.c.value);
      const n={shark:1,nervous:1,reckless:2,drunk:2}[seat.archetype]||1;
      for(let j=0;j<n;j++){
        const w=sorted[sorted.length-1-j];
        const nc=deal(false);if(nc){nc.faceUp=false;seat.hand[w.i]=nc;}
      }
    }
    seat.hand.forEach(c=>c.faceUp=false);
  });
  vdResolve();
}

function vdResolve() {
  const ts=_ts;
  ts.vdPhase='reveal';
  const pv=voidHandValue(ts.playerHand);
  const pbust=pv>30||ts.playerStatus==='bust';
  ts.seats.forEach(seat=>{
    if(seat.status==='fold')return;
    seat.hand.forEach(c=>c.faceUp=true);
    seat.status=voidHandValue(seat.hand)>30?'bust':'stand';
  });
  const best=ts.seats.filter(s=>s.status!=='bust'&&s.status!=='fold')
    .map(s=>({seat:s,val:voidHandValue(s.hand)})).sort((a,b)=>b.val-a.val);
  const pot=ts.pot;
  let delta=0,result='';
  if(pbust){
    result=`You bust with ${pv}.`;
    if(best.length) best[0].seat.credits+=pot;
  } else {
    const bn=best.length>0?best[0].val:-1;
    if(pv>bn){ delta=pot; ts.playerCredits+=delta; result=pv===30?`PERFECT 30! You win ${pot}¢!`:`You win! ${pv} beats the field. +${pot}¢`; }
    else if(pv===bn){
      const tied=best.filter(n=>n.val===pv);
      const share=Math.floor(pot/(tied.length+1));
      delta=share; ts.playerCredits+=delta;
      tied.forEach(n=>n.seat.credits+=share);
      result=`Tie at ${pv}. Split ${tied.length+1} ways. +${share}¢`;
    } else {
      result=`${best[0].seat.name} wins with ${best[0].val} over your ${pv}.`;
      best[0].seat.credits+=pot;
    }
  }
  ts.playerStatus=delta>0?'win':pbust?'bust':'lose';
  ts.message=result; addLog(result);
  syncCredits(); saveGamblers(); maybeGossip();
  if(delta>ts.playerBet&&_tableData.onPlayerWinFlag)_state.flags[_tableData.onPlayerWinFlag]=true;
  renderVoidDraw();
}

// ─── TEXAS HOLD 'EM ───────────────────────────────────────────────────────────

function initHoldem() {
  const ts=_ts;
  ts.deck=shuffle(buildDeck());
  ts.playerHand=[]; ts.playerStatus='active';
  ts.hePhase='preflop'; ts.heCommunity=[]; ts.hePot=0;
  ts.heCurrentBet=0; ts.hePlayerBet=0; ts.hePlayerTotalBet=0;
  ts.heRaiseCount=0; ts.heActed=false;
  const blind=_tableData.minBet;
  ts.seats.forEach(seat=>{
    seat.hand=[]; seat.bet=0; seat.totalBet=0;
    seat.heFolded=seat.credits<=0; seat.heLastAction='';
    seat.status=seat.heFolded?'fold':'active';
  });
  const active=ts.seats.map((s,i)=>i).filter(i=>!ts.seats[i].heFolded);
  if(active.length>=1){
    const sb=ts.seats[active[0]];
    const amt=Math.min(blind,sb.credits);
    sb.credits-=amt; sb.bet=amt; sb.totalBet=amt; ts.hePot+=amt;
    sb.heLastAction=`SB ${amt}¢`;
  }
  if(active.length>=2){
    const bb=ts.seats[active[1]];
    const amt=Math.min(blind*2,bb.credits);
    bb.credits-=amt; bb.bet=amt; bb.totalBet=amt; ts.hePot+=amt;
    bb.heLastAction=`BB ${amt}¢`;
    ts.heCurrentBet=amt;
  }
  ts.playerHand=[deal(true),deal(true)];
  ts.seats.forEach(seat=>{if(!seat.heFolded)seat.hand=[deal(false),deal(false)];});
  ts.hePlayerBet=0;
  addLog(`New hand. Blinds: ${blind}¢/${blind*2}¢. Pot: ${ts.hePot}¢`);
}

function renderHoldem() {
  const ts=_ts;
  const isSd=ts.hePhase==='showdown';
  const toCall=Math.max(0,ts.heCurrentBet-ts.hePlayerBet);
  const canCheck=toCall===0&&ts.playerStatus==='active'&&!ts.heActed;
  const canCall =toCall>0 &&ts.playerStatus==='active'&&!ts.heActed&&ts.playerCredits>0;
  const canRaise=ts.playerStatus==='active'&&!ts.heActed&&ts.heRaiseCount<4;
  const canFold =ts.playerStatus==='active'&&!ts.heActed;
  const phLabel={preflop:'Pre-Flop',flop:'Flop',turn:'Turn',river:'River',showdown:'Showdown'}[ts.hePhase]||ts.hePhase;
  const community=Array.from({length:5},(_,i)=>ts.heCommunity[i]?cardHTML(ts.heCommunity[i]):`<div class="vt-card vt-card-empty"></div>`).join('');

  _overlay.innerHTML=`
    <div class="vt-container vt-game-screen vt-holdem">
      ${gameHeader("Texas Hold 'Em",`${phLabel} · Pot: ${ts.hePot}¢`)}
      <div class="vt-table-surface vt-holdem-surface">
        <div class="vt-community-zone">
          <div class="vt-zone-label">COMMUNITY · ${phLabel.toUpperCase()}</div>
          <div class="vt-hand vt-community-hand">${community}</div>
          <div class="vt-pot-display">POT: <strong>${ts.hePot}¢</strong>${toCall>0?` · To call: <strong>${toCall}¢</strong>`:''}</div>
        </div>
        <div class="vt-npc-row">
          ${ts.seats.map(seat=>{
            if(isSd&&!seat.heFolded)seat.hand.forEach(c=>c.faceUp=true);
            let handName='';
            if(isSd&&!seat.heFolded&&seat.hand.length===2){
              const r=heEvalHand([...seat.hand,...ts.heCommunity.filter(c=>c.faceUp)]);
              handName=`<div class="vt-npc-hand-name">${r.name}</div>`;
            }
            return `<div class="vt-npc-seat ${seat.heFolded?'vt-npc-out':''}">
              <div class="vt-npc-name">${seat.name}</div>
              <div class="vt-hand vt-npc-hand">${seat.hand.map(c=>cardHTML(c,!isSd||seat.heFolded)).join('')}</div>
              ${handName}
              <div class="vt-npc-bet-row">${seat.totalBet>0?`In: ${seat.totalBet}¢`:''} ${seat.heLastAction?`· ${seat.heLastAction}`:''}</div>
              <div class="vt-npc-credits">${seat.credits}¢</div>
              <div class="vt-npc-status vt-arch-${seat.archetype}">${seat.heFolded?'Fold':npcStatusLabel(seat)}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="vt-player-zone">
          <div class="vt-zone-label">
            YOUR HAND
            ${isSd?`· <span class="vt-hand-name">${heEvalHand([...ts.playerHand,...ts.heCommunity.filter(c=>c.faceUp)]).name}</span>`:''}
          </div>
          <div class="vt-hand">${ts.playerHand.map(c=>cardHTML(c)).join('')}</div>
          <div class="vt-bet-chip">In pot: ${ts.hePlayerTotalBet}¢</div>
        </div>
      </div>
      <div id="vtRaiseArea" class="vt-raise-area" style="display:none">
        <span class="vt-label">RAISE TO:</span>
        <span id="vtRaiseDisplay" class="vt-raise-display">${ts.heCurrentBet+_tableData.minBet}¢</span>
        <input type="range" class="vt-bet-slider" id="vtRaiseSlider"
          min="${ts.heCurrentBet+_tableData.minBet}"
          max="${Math.min(_tableData.maxBet,ts.playerCredits+ts.hePlayerBet)}"
          value="${ts.heCurrentBet+_tableData.minBet}" step="${_tableData.minBet}"/>
        <button class="vt-btn vt-btn-primary" id="vtConfirmRaise">Raise</button>
        <button class="vt-btn" id="vtCancelRaise">Cancel</button>
      </div>
      <div class="vt-action-bar">
        <div class="vt-action-left"><div class="vt-credits-chip">Credits: <strong>${ts.playerCredits}</strong></div></div>
        <div class="vt-action-btns">
          ${canFold? `<button class="vt-btn vt-btn-leave" id="vtFold">Fold</button>`:''}
          ${canCheck?`<button class="vt-btn" id="vtCheck">Check</button>`:''}
          ${canCall? `<button class="vt-btn vt-btn-primary" id="vtCall">Call ${toCall}¢</button>`:''}
          ${canRaise?`<button class="vt-btn" id="vtRaise">Raise</button>`:''}
          ${isSd?`<button class="vt-btn vt-btn-primary" id="vtNextRoundBtn">Next Round</button>`:''}
          ${ts.playerStatus==='fold'&&!isSd?`<button class="vt-btn" id="vtWatch">Watch →</button>`:''}
        </div>
        <div class="vt-action-right"><button class="vt-btn vt-btn-sm vt-btn-leave" id="vtLeaveGameBtn">Leave</button></div>
      </div>
      <div class="vt-message-bar">${ts.message||'&nbsp;'}</div>
      <div class="vt-log">${ts.log.slice(-4).map(l=>`<div>${l}</div>`).join('')}</div>
    </div>`;

  document.getElementById('vtFold')?.addEventListener('click',()=>heAct('fold'));
  document.getElementById('vtCheck')?.addEventListener('click',()=>heAct('check'));
  document.getElementById('vtCall')?.addEventListener('click',()=>heAct('call'));
  document.getElementById('vtWatch')?.addEventListener('click',heNPCStreet);
  document.getElementById('vtNextRoundBtn')?.addEventListener('click',startNextRound);
  document.getElementById('vtLeaveGameBtn').addEventListener('click',confirmLeave);
  if(canRaise){
    document.getElementById('vtRaise')?.addEventListener('click',()=>document.getElementById('vtRaiseArea').style.display='flex');
    const sl=document.getElementById('vtRaiseSlider');
    const dp=document.getElementById('vtRaiseDisplay');
    sl?.addEventListener('input',()=>dp.textContent=sl.value+'¢');
    document.getElementById('vtConfirmRaise')?.addEventListener('click',()=>{
      heAct('raise',parseInt(document.getElementById('vtRaiseSlider').value));
    });
    document.getElementById('vtCancelRaise')?.addEventListener('click',()=>document.getElementById('vtRaiseArea').style.display='none');
  }
}

function heAct(action,raiseAmt=0) {
  const ts=_ts;
  const toCall=Math.max(0,ts.heCurrentBet-ts.hePlayerBet);
  ts.heActed=true;
  if(action==='fold'){ts.playerStatus='fold';ts.message='You fold.';addLog('You fold.');heNPCStreet();return;}
  if(action==='check'){addLog('You check.');heNPCStreet();return;}
  if(action==='call'){
    const amt=Math.min(toCall,ts.playerCredits);
    ts.playerCredits-=amt; ts.hePlayerBet+=amt; ts.hePlayerTotalBet+=amt; ts.hePot+=amt;
    addLog(`You call ${amt}¢. Pot: ${ts.hePot}¢`); heNPCStreet(); return;
  }
  if(action==='raise'){
    const extra=Math.max(0,raiseAmt-ts.hePlayerBet);
    const amt=Math.min(extra,ts.playerCredits);
    ts.playerCredits-=amt; ts.hePlayerBet+=amt; ts.hePlayerTotalBet+=amt; ts.hePot+=amt;
    ts.heCurrentBet=ts.hePlayerBet; ts.heRaiseCount++;
    addLog(`You raise to ${ts.hePlayerBet}¢. Pot: ${ts.hePot}¢`); heNPCStreet(); return;
  }
}

function heNPCStreet() {
  const ts=_ts;
  ts.seats.forEach(seat=>{
    if(seat.heFolded)return;
    const toCall=Math.max(0,ts.heCurrentBet-seat.bet);
    const strength=heHoleStr(seat.hand);
    const g=seat._def;
    let action='check';
    if(toCall>0){
      if(toCall>seat.credits*0.5&&strength<0.4)action='fold';
      else if(Math.random()<(g.foldThreshold||0.3)&&strength<0.3)action='fold';
      else if(Math.random()<(g.bluffFrequency||0.15))action='raise';
      else action='call';
    } else {
      if(Math.random()<(g.aggressionBias||0.3)*strength)action='raise';
    }
    if(action==='fold'){seat.heFolded=true;seat.heLastAction='Fold';addLog(`${seat.name} folds.`);}
    else if(action==='call'&&toCall>0){
      const amt=Math.min(toCall,seat.credits);
      seat.credits-=amt;seat.bet+=amt;seat.totalBet+=amt;ts.hePot+=amt;
      seat.heLastAction=`Call ${amt}¢`;addLog(`${seat.name} calls ${amt}¢.`);
    } else if(action==='raise'){
      const raise=_tableData.minBet*(1+Math.floor(Math.random()*3));
      const extra=Math.max(0,ts.heCurrentBet+raise-seat.bet);
      const amt=Math.min(extra,seat.credits);
      seat.credits-=amt;seat.bet+=amt;seat.totalBet+=amt;ts.hePot+=amt;
      if(seat.bet>ts.heCurrentBet){ts.heCurrentBet=seat.bet;ts.heRaiseCount++;}
      seat.heLastAction=`Raise ${seat.bet}¢`;addLog(`${seat.name} raises to ${seat.bet}¢.`);
    } else {
      seat.heLastAction='Check';addLog(`${seat.name} checks.`);
    }
  });
  heNextStreet();
}

function heNextStreet() {
  const ts=_ts;
  const alive=ts.seats.filter(s=>!s.heFolded).length;
  if(alive+(ts.playerStatus!=='fold'?1:0)<=1){heShowdown();return;}
  ts.seats.forEach(s=>{s.bet=0;});
  ts.hePlayerBet=0; ts.heCurrentBet=0; ts.heRaiseCount=0; ts.heActed=false;
  if(ts.hePhase==='preflop'){
    ts.hePhase='flop'; ts.heCommunity=[deal(true),deal(true),deal(true)];
    ts.message='The Flop.'; addLog(`Flop. Pot: ${ts.hePot}¢`);
  } else if(ts.hePhase==='flop'){
    ts.hePhase='turn'; ts.heCommunity.push(deal(true));
    ts.message='The Turn.'; addLog(`Turn. Pot: ${ts.hePot}¢`);
  } else if(ts.hePhase==='turn'){
    ts.hePhase='river'; ts.heCommunity.push(deal(true));
    ts.message='The River.'; addLog(`River. Pot: ${ts.hePot}¢`);
  } else if(ts.hePhase==='river'){
    heShowdown(); return;
  }
  renderHoldem();
}

function heShowdown() {
  const ts=_ts;
  ts.hePhase='showdown';
  ts.seats.forEach(seat=>{if(!seat.heFolded)seat.hand.forEach(c=>c.faceUp=true);});
  const com=ts.heCommunity.filter(c=>c.faceUp);
  const pFolded=ts.playerStatus==='fold';
  const results=[];
  if(!pFolded){
    const r=heEvalHand([...ts.playerHand,...com]);
    results.push({who:'player',name:'You',score:r.rankVal,label:r.name});
  }
  ts.seats.forEach(seat=>{
    if(seat.heFolded)return;
    const r=heEvalHand([...seat.hand,...com]);
    results.push({who:seat,name:seat.name,score:r.rankVal,label:r.name});
  });
  results.sort((a,b)=>b.score-a.score);
  const winner=results[0];
  if(!winner){ts.message='Everyone folded. Pot split.';ts.playerCredits+=ts.hePot;}
  else if(winner.who==='player'){
    ts.playerCredits+=ts.hePot;
    ts.message=`You win with ${winner.label}! +${ts.hePot}¢`;
    ts.playerStatus='win';
    if(_tableData.onPlayerWinFlag)_state.flags[_tableData.onPlayerWinFlag]=true;
  } else {
    if(winner.who?.credits!==undefined)winner.who.credits+=ts.hePot;
    ts.message=`${winner.name} wins with ${winner.label}.`;
    ts.playerStatus=pFolded?'fold':'lose';
  }
  addLog(ts.message);
  syncCredits(); saveGamblers(); maybeGossip();
  renderHoldem();
}

function heEvalHand(cards) {
  if(!cards||cards.length<2)return{name:'High Card',rankVal:0};
  const fc=cards.filter(c=>c.faceUp!==false);
  if(fc.length<2)return{name:'High Card',rankVal:0};
  const ro=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const rn=(r)=>ro.indexOf(r);
  const counts={},sc={};
  fc.forEach(c=>{counts[c.rank]=(counts[c.rank]||0)+1;sc[c.suit]=(sc[c.suit]||0)+1;});
  const pairs=Object.entries(counts).filter(([,v])=>v===2).map(([k])=>k);
  const threes=Object.entries(counts).filter(([,v])=>v===3).map(([k])=>k);
  const fours=Object.entries(counts).filter(([,v])=>v===4).map(([k])=>k);
  const flush=Object.values(sc).some(v=>v>=5);
  const sr=[...new Set(fc.map(c=>rn(c.rank)))].sort((a,b)=>a-b);
  const straight=sr.length>=5&&(
    (sr[sr.length-1]-sr[sr.length-5]===4)||
    (sr.includes(12)&&[0,1,2,3].every(v=>sr.includes(v)))
  );
  const royal=flush&&straight&&sr.includes(12)&&sr.includes(11);
  let name='High Card',rv=0;
  if(royal)                          {name='Royal Flush';rv=9;}
  else if(flush&&straight)           {name='Straight Flush';rv=8;}
  else if(fours.length)              {name='Four of a Kind';rv=7;}
  else if(threes.length&&pairs.length){name='Full House';rv=6;}
  else if(flush)                     {name='Flush';rv=5;}
  else if(straight)                  {name='Straight';rv=4;}
  else if(threes.length)             {name='Three of a Kind';rv=3;}
  else if(pairs.length>=2)           {name='Two Pair';rv=2;}
  else if(pairs.length===1)          {name='Pair';rv=1;}
  const tieVal=fc.reduce((s,c)=>s+rn(c.rank),0);
  return{name,rankVal:rv*1000+tieVal};
}

function heHoleStr(hand) {
  if(!hand||hand.length<2)return 0.3;
  const [a,b]=hand;
  const ro=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const hv=Math.max(ro.indexOf(a.rank),ro.indexOf(b.rank));
  let s=hv/12;
  if(a.rank===b.rank)s+=0.3;
  if(a.suit===b.suit)s+=0.1;
  return Math.min(1,s);
}

// ─── VOID SHIFT ───────────────────────────────────────────────────────────────

function activateVoidShift(gameId) {
  const ts=_ts;
  const hero=_state.roster.find(a=>a.id===_state.selectedActorId||a.role==='player');
  const shift=VOID_SHIFTS[hero?.classId]||VOID_SHIFTS._default;
  ts.voidShiftUsed=true; addLog(`You activate ${shift.label}!`);
  if(shift.id==='overcharge'){
    const tgts=ts.seats.filter(s=>s.status==='active'&&s.hand.length>0);
    if(!tgts.length){addLog('No valid targets.');return;}
    const t=tgts[Math.floor(Math.random()*tgts.length)];
    const hi=t.hand.reduce((b,c,i)=>c.value>b.val?{idx:i,val:c.value}:b,{idx:0,val:-1});
    t.hand.splice(hi.idx,1);
    const rep=deal(false);if(rep)t.hand.push(rep);
    ts.message=`Overcharge! ${t.name} discards their highest card.`;addLog(ts.message);
  } else if(shift.id==='strip_mine'){
    const tgts=ts.seats.filter(s=>s.status==='active'&&s.hand.length>=2);
    if(!tgts.length){addLog('No valid targets.');return;}
    const t=tgts[Math.floor(Math.random()*tgts.length)];
    ts.voidShiftPeeked={label:`${t.name}'s cards`,cards:t.hand.slice(0,2)};
    ts.message=`Strip Mine: You see ${t.name}'s cards.`;addLog(ts.message);
  } else if(shift.id==='premonition'){
    ts.voidShiftPeeked={label:'Top of deck',cards:ts.deck.slice(-3).reverse()};
    ts.message='Premonition: You see the top of the deck.';addLog(ts.message);
  } else if(shift.id==='lucky_draw'){
    const drawn=[deal(true),deal(true),deal(true)].filter(Boolean);
    if(!drawn.length)return;
    const best=drawn.reduce((b,c)=>c.value>b.value?c:b,drawn[0]);
    ts.playerHand.push(best);
    ts.message=`Lucky Draw: Kept ${cardLabel(best)} from 3 drawn.`;addLog(ts.message);
  }
  if(gameId==='blackjack')renderBlackjack();
  else if(gameId==='void_draw')renderVoidDraw();
  else renderHoldem();
}

// ─── ROUND FLOW ───────────────────────────────────────────────────────────────

function startNextRound() {
  const ts=_ts;
  if(ts.playerCredits<_tableData.minBet){showEndScreen(false);return;}
  if(!ts.seats.some(s=>s.credits>=_tableData.minBet)){showEndScreen(true);return;}
  ts.voidShiftPeeked=null; ts.pot=0; ts.phase='bet';
  if(ts.game==='holdem'){initHoldem();renderHoldem();}
  else renderBetPhase();
}

function showEndScreen(won) {
  const net=_ts.playerCredits-_sessionStartCredits;
  _overlay.innerHTML=`
    <div class="vt-container vt-end-screen">
      <div class="vt-end-icon">${won?'◈':'◇'}</div>
      <div class="vt-end-title">${won?'TABLE CLEARED':'TAPPED OUT'}</div>
      <div class="vt-end-result">${won?'You emptied the table.':'Your credits ran dry.'}</div>
      <div class="vt-end-net ${net>=0?'vt-net-win':'vt-net-loss'}">Net: ${net>=0?'+':''}${net}¢</div>
      <button class="vt-btn vt-btn-primary" id="vtEndLeave">Leave Table</button>
    </div>`;
  document.getElementById('vtEndLeave').onclick=()=>closeTable();
}

// FIX 1: Use _sessionStartCredits (never overwritten) not _state.resources.credits
function confirmLeave() {
  const ts=_ts;
  const net=ts.playerCredits-_sessionStartCredits;
  _overlay.innerHTML=`
    <div class="vt-container vt-leave-confirm">
      <div class="vt-leave-title">Leave the table?</div>
      <div class="vt-leave-stats">
        <div>Credits when you sat down: <strong>${_sessionStartCredits}¢</strong></div>
        <div>Credits now: <strong>${ts.playerCredits}¢</strong></div>
        <div class="${net>=0?'vt-net-win':'vt-net-loss'}">Net: ${net>=0?'+':''}${net}¢</div>
      </div>
      <div class="vt-leave-btns">
        <button class="vt-btn" id="vtStayBtn">Stay</button>
        <button class="vt-btn vt-btn-primary" id="vtConfirmLeave">Leave</button>
      </div>
    </div>`;
  document.getElementById('vtStayBtn').onclick=()=>{
    if(_ts.game)GAME_REGISTRY[_ts.game]?.renderFn(); else renderLobby();
  };
  document.getElementById('vtConfirmLeave').onclick=()=>closeTable();
}

function closeTable() {
  syncCredits(); saveGamblers();
  if(_tableData.narrativeNPC&&_state.flags[_tableData.onPlayerWinFlag]&&!_state.flags[`${_tableData.onPlayerWinFlag}_talked`])
    _state.flags[`${_tableData.onPlayerWinFlag}_talked`]=true;
  if(_overlay){_overlay.remove();_overlay=null;}
  _api.renderAll();
}

// ─── NPC AI ───────────────────────────────────────────────────────────────────

function npcBet(seat,table) {
  const min=table.minBet, max=Math.min(table.maxBet,seat.credits);
  const arch=seat.archetype;
  let bet=min;
  if     (arch==='shark')    bet=min+Math.floor((max-min)*0.3);
  else if(arch==='reckless') bet=min+Math.floor((max-min)*(0.5+Math.random()*0.5));
  else if(arch==='nervous')  bet=min+Math.floor((max-min)*0.1*Math.random());
  else if(arch==='drunk')    bet=min+Math.floor((max-min)*Math.random());
  return Math.max(min,Math.min(bet,max,seat.credits));
}

function npcStatusLabel(seat) {
  return {active:'In',stand:'Stand',bust:'Bust',fold:'Fold',win:'Win!',lose:'Loss'}[seat.status]||seat.status;
}

// ─── GOSSIP ───────────────────────────────────────────────────────────────────

function maybeGossip() {
  const pool=_tableData.gossipPool||[];
  if(!pool.length||Math.random()>0.3)return;
  for(const seat of _ts.seats){
    const gossip=seat._def?.gossipDialogue||{};
    for(const key of pool){
      if(gossip[key]&&!_ts.gossipShown.has(key)){
        _ts.gossipShown.add(key);
        const toast=document.createElement('div');
        toast.className='vt-gossip-toast';
        toast.innerHTML=`<span class="vt-gossip-speaker">${seat.name}</span><span class="vt-gossip-line">${gossip[key]}</span>`;
        _overlay.appendChild(toast);
        addLog(`[${seat.name}] ${gossip[key]}`);
        setTimeout(()=>{toast.style.opacity='0';setTimeout(()=>toast.remove(),600);},4200);
        return;
      }
    }
  }
}

// ─── CARD / UI RENDERING ──────────────────────────────────────────────────────

function cardHTML(card,forceBack=false) {
  if(!card)return'<div class="vt-card vt-card-empty"></div>';
  if(!card.faceUp||forceBack)return`<div class="vt-card vt-card-back"><div class="vt-card-back-pattern">◈</div></div>`;
  const suit=SUITS.find(s=>s.id===card.suit)||SUITS[0];
  const rc=card.rank==='A'?'vt-rank-ace':['10','J','Q','K'].includes(card.rank)?'vt-rank-high':'';
  return`<div class="vt-card vt-card-face ${rc}" style="--suit-color:${suit.color}">
    <div class="vt-card-corner vt-card-tl"><span class="vt-card-rank">${card.rank}</span><span class="vt-card-suit-sm">${suit.symbol}</span></div>
    <div class="vt-card-center">${suit.symbol}</div>
    <div class="vt-card-corner vt-card-br"><span class="vt-card-rank">${card.rank}</span><span class="vt-card-suit-sm">${suit.symbol}</span></div>
  </div>`;
}

function cardLabel(card) {
  if(!card)return'?';
  return card.rank+(SUITS.find(s=>s.id===card.suit)?.symbol||'');
}

function peekPanel(peeked) {
  if(!peeked?.cards?.length)return'';
  return`<div class="vt-peek-panel">
    <div class="vt-section-title">◈ VOID SIGHT — ${peeked.label||''}</div>
    <div class="vt-hand vt-peek-hand">${peeked.cards.map(c=>cardHTML({...c,faceUp:true})).join('')}</div>
  </div>`;
}

function gameHeader(name,sub) {
  return`<div class="vt-header">
    <div class="vt-header-left">
      <div class="vt-title">${_tableData.name}</div>
      <div class="vt-subtitle">${name} — ${sub}</div>
    </div>
    <div class="vt-header-right">
      <div class="vt-credits-display">
        <span class="vt-label">CREDITS</span>
        <span class="vt-credits-val">${_ts.playerCredits}</span>
      </div>
    </div>
  </div>`;
}

// ─── STATE SYNC ───────────────────────────────────────────────────────────────

function syncCredits() { _state.resources.credits=_ts.playerCredits; }
function saveGamblers() {
  if(!_state.gamblerCredits)_state.gamblerCredits={};
  _ts.seats.forEach(seat=>{ _state.gamblerCredits[seat.gamblerId]=seat.credits; });
}
function addLog(msg) { _ts.log.push(msg); if(_ts.log.length>20)_ts.log.shift(); }
function showMessage(msg) { _ts.message=msg; const el=document.getElementById('vtMessageBar'); if(el)el.textContent=msg; }

// ─── GAMBLER CREDIT RESET ─────────────────────────────────────────────────────

export function resetGamblerCredits(state,data) {
  if(!state.gamblerCredits)return;
  (data.tables||[]).flatMap(t=>t.seats||[]).forEach(s=>{
    const g=(data.gamblers||[]).find(x=>x.id===s.gamblerId);
    if(g&&state.gamblerCredits[s.gamblerId]!==undefined)
      state.gamblerCredits[s.gamblerId]=Math.max(state.gamblerCredits[s.gamblerId],Math.floor(g.creditReset*0.7));
  });
}

// ─── STYLE INJECTION ──────────────────────────────────────────────────────────

function injectStyles() {
  if(document.getElementById('voidTableStyles'))return;
  const link=document.createElement('link');
  link.id='voidTableStyles';link.rel='stylesheet';link.href='css/CardTable.css';
  document.head.appendChild(link);
}
