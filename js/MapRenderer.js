/**
 * MapRenderer.js — Canvas-based pseudo-isometric map renderer for Spaced
 * =========================================================================
 * Draws the map onto a <canvas> element using procedural placeholder art.
 * All gameplay logic (grid coords, collision, clicks, entities) is unchanged.
 * A transparent HTML overlay sits on top for all click/hover interactions.
 *
 * Visual approach:
 *   - Each tile is drawn as a top-down square with depth illusions
 *   - Walls get a top face (lit) + front face (shadowed) for height
 *   - Floors get texture, edge shading, and decal/FX overlays
 *   - Props are drawn as small geometric silhouettes
 *   - All assets are procedural — swap drawXxx() functions for sprite draws later
 *
 * Coordinate system: unchanged. x,y = grid tile coords. Canvas px = x*T, y*T.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const WALL_HEIGHT  = 18;   // pixels of wall "height" above tile top
const WALL_DEPTH   = 6;    // right-side wall depth
const LIGHT_DIR    = { x: -0.4, y: -0.8 };  // top-left light source

// Port Sable palette
const PAL = {
  // Floors
  floorMetal:    ['#1a2535', '#1e2c3f', '#162030'],
  floorGrate:    ['#111820', '#141e28', '#0e1520'],
  floorConcrete: ['#1c2230', '#1a2030', '#161c28'],
  floorStained:  ['#16181e', '#1a1c22', '#121416'],
  floorCivic:    ['#1a2048', '#1e2550', '#161c3a'],
  floorVoid:     ['#050810', '#060a14', '#040608'],

  // Walls
  wallHull:      { top: '#2a3f58', face: '#142030', right: '#0a1520', accent: '#3a5570' },
  wallCorrugated:{ top: '#253545', face: '#101e2c', right: '#080f18', accent: '#304555' },
  wallPipes:     { top: '#1a2d3f', face: '#0c1c2c', right: '#060e18', accent: '#2a4060' },
  wallRock:      { top: '#2a2018', face: '#181208', right: '#0c0a04', accent: '#3a3020' },
  wallCivic:     { top: '#1e2c60', face: '#0e1840', right: '#081028', accent: '#2e4080' },

  // Neon accent colors by zone
  neonPink:   '#ff2d78',
  neonCyan:   '#00e5ff',
  neonGold:   '#ffd600',
  neonGreen:  '#00ff88',
  neonPurple: '#b400ff',
  neonOrange: '#ff6a00',

  // Fogged
  fog: '#0a0e14',
  fogEdge: '#0c1018',

  // Grid edge
  gridLine: 'rgba(255,255,255,0.028)',
};

// Zone → accent color mapping
const ZONE_COLOR = {
  restricted_impound: PAL.neonOrange,
  restricted_civic:   PAL.neonCyan,
  hostile_reaver:     PAL.neonPink,
  transition_ab:      PAL.neonGold,
  transition_bc:      PAL.neonGold,
  transition_ac:      PAL.neonGold,
};

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _canvas  = null;
let _ctx     = null;
let _animId  = null;
let _fxTime  = 0;   // incremented each frame for animations

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initMapRenderer(tileLayerEl) {
  // Replace tileLayer div with a canvas
  if (_canvas) { _canvas.remove(); cancelAnimationFrame(_animId); }

  _canvas = document.createElement('canvas');
  _canvas.id = 'mapCanvas';
  _canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
  tileLayerEl.parentElement.insertBefore(_canvas, tileLayerEl);

  // Hide the old tileLayer div — keep it for click hit-testing
  tileLayerEl.style.opacity = '0';
  tileLayerEl.style.pointerEvents = 'auto'; // still handles clicks

  _ctx = _canvas.getContext('2d');
  return _canvas;
}

// ─── MAIN RENDER ENTRY POINT ──────────────────────────────────────────────────

export function renderMapCanvas(map, state, data, api) {
  if (!_canvas || !_ctx) return;
  const T = data.config.map.tileSize;
  const W = map.width  * T;
  const H = map.height * T + WALL_HEIGHT; // extra height for wall tops

  _canvas.width  = W;
  _canvas.height = H;

  _ctx.clearRect(0, 0, W, H);

  // Draw in painter's order: back rows first
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t) continue;
      const revealed = api.isTileRevealed(x, y);
      drawTile(_ctx, t, x, y, T, revealed, map, state, data);
    }
  }
}

// ─── DRAW A SINGLE TILE ───────────────────────────────────────────────────────

function drawTile(ctx, t, x, y, T, revealed, map, state, data) {
  const px = x * T;
  const py = y * T;
  const v  = t.visual || {};

  if (!revealed) {
    drawFogTile(ctx, px, py, T);
    return;
  }

  if (t.type === 'wall') {
    drawWallTile(ctx, t, px, py, T, v, map, x, y);
  } else {
    drawFloorTile(ctx, t, px, py, T, v, map, x, y, state, data);
  }
}

// ─── FOG TILE ─────────────────────────────────────────────────────────────────

function drawFogTile(ctx, px, py, T) {
  ctx.fillStyle = PAL.fog;
  ctx.fillRect(px, py, T, T);
  // Subtle vignette at edges
  const g = ctx.createLinearGradient(px, py, px+T, py+T);
  g.addColorStop(0, 'rgba(20,30,50,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(px, py, T, T);
}

// ─── WALL TILE ────────────────────────────────────────────────────────────────

function drawWallTile(ctx, t, px, py, T, v, map, gx, gy) {
  const pal  = getWallPalette(v.wall);
  const zone = t.zone || '';

  // ── Front face (the main block face) ──────────────────────────────────────
  const faceGrad = ctx.createLinearGradient(px, py, px, py + T);
  faceGrad.addColorStop(0, pal.face);
  faceGrad.addColorStop(1, darken(pal.face, 0.6));
  ctx.fillStyle = faceGrad;
  ctx.fillRect(px, py, T, T);

  // ── Wall texture based on type ─────────────────────────────────────────────
  const wallType = v.wall || 'hull_plate';
  drawWallTexture(ctx, wallType, px, py, T, pal);

  // ── Top face (lit surface — gives height illusion) ─────────────────────────
  ctx.fillStyle = pal.top;
  ctx.fillRect(px, py, T, WALL_HEIGHT);

  // Top face highlight gradient
  const topGrad = ctx.createLinearGradient(px, py, px + T, py + WALL_HEIGHT);
  topGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
  topGrad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(px, py, T, WALL_HEIGHT);

  // Top face accent line
  ctx.fillStyle = pal.accent;
  ctx.fillRect(px, py, T, 1);
  ctx.fillRect(px, py, 1, WALL_HEIGHT);

  // ── Right depth edge ───────────────────────────────────────────────────────
  ctx.fillStyle = pal.right;
  ctx.fillRect(px + T - WALL_DEPTH, py, WALL_DEPTH, T);
  const rightGrad = ctx.createLinearGradient(px + T - WALL_DEPTH, py, px + T, py);
  rightGrad.addColorStop(0, 'rgba(0,0,0,0)');
  rightGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(px + T - WALL_DEPTH, py, WALL_DEPTH, T);

  // ── Zone accent glow on wall top ───────────────────────────────────────────
  const zoneColor = ZONE_COLOR[zone];
  if (zoneColor) {
    ctx.fillStyle = hexAlpha(zoneColor, 0.18);
    ctx.fillRect(px, py, T, WALL_HEIGHT);
  }

  // ── Cast shadow downward (onto the floor below if not also a wall) ─────────
  const tileBelow = map.tiles[gy + 1]?.[gx];
  if (tileBelow && tileBelow.type !== 'wall') {
    const shadowGrad = ctx.createLinearGradient(px, py + T, px, py + T + 12);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(px, py + T, T, 12);
  }

  // ── Grid line ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = PAL.gridLine;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
}

function drawWallTexture(ctx, wallType, px, py, T, pal) {
  ctx.save();
  ctx.globalAlpha = 0.35;

  if (wallType === 'corrugated') {
    // Vertical corrugation lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 4; i < T; i += 8) {
      ctx.beginPath(); ctx.moveTo(px + i, py + WALL_HEIGHT); ctx.lineTo(px + i, py + T);
      ctx.stroke();
    }
    // Darker valleys
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    for (let i = 8; i < T; i += 8) {
      ctx.beginPath(); ctx.moveTo(px + i, py + WALL_HEIGHT); ctx.lineTo(px + i, py + T);
      ctx.stroke();
    }

  } else if (wallType === 'pipe_bundle') {
    // Draw 2-3 horizontal pipes
    ctx.globalAlpha = 0.5;
    const pipes = [py + T * 0.3, py + T * 0.6];
    pipes.forEach(pipeY => {
      const pg = ctx.createLinearGradient(px, pipeY - 4, px, pipeY + 4);
      pg.addColorStop(0, 'rgba(80,120,160,0.6)');
      pg.addColorStop(0.4, 'rgba(140,180,220,0.4)');
      pg.addColorStop(1, 'rgba(20,50,80,0.5)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(px + 4, pipeY - 4, T - 8, 8, 3);
      ctx.fill();
      // Pipe highlight
      ctx.fillStyle = 'rgba(200,230,255,0.15)';
      ctx.fillRect(px + 4, pipeY - 3, T - 8, 2);
    });

  } else if (wallType === 'rock') {
    // Irregular rock facets
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(80,60,20,0.3)';
    ctx.fillRect(px + 4, py + WALL_HEIGHT + 4, T * 0.4, T * 0.3);
    ctx.fillStyle = 'rgba(40,30,10,0.3)';
    ctx.fillRect(px + T * 0.45, py + WALL_HEIGHT + 8, T * 0.35, T * 0.4);
    // Crack lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px + T * 0.3, py + WALL_HEIGHT);
    ctx.lineTo(px + T * 0.45, py + T * 0.5);
    ctx.lineTo(px + T * 0.6, py + T);
    ctx.stroke();

  } else if (wallType === 'civic_block') {
    // Horizontal mortar lines
    ctx.strokeStyle = 'rgba(60,80,140,0.2)';
    ctx.lineWidth = 1;
    for (let i = py + WALL_HEIGHT + 10; i < py + T; i += 10) {
      ctx.beginPath(); ctx.moveTo(px, i); ctx.lineTo(px + T, i); ctx.stroke();
    }
    // Civic authority stripe
    ctx.fillStyle = 'rgba(60,80,180,0.12)';
    ctx.fillRect(px, py + T - 6, T, 4);

  } else {
    // hull_plate default — subtle panel lines
    ctx.strokeStyle = 'rgba(100,150,200,0.07)';
    ctx.lineWidth = 0.8;
    // Horizontal panel seam
    const seamY = py + WALL_HEIGHT + Math.floor((T - WALL_HEIGHT) / 2);
    ctx.beginPath(); ctx.moveTo(px, seamY); ctx.lineTo(px + T, seamY); ctx.stroke();
    // Bolt dots
    ctx.fillStyle = 'rgba(80,120,160,0.2)';
    [[px+4,py+WALL_HEIGHT+4],[px+T-6,py+WALL_HEIGHT+4],[px+4,py+T-6],[px+T-6,py+T-6]].forEach(([bx,by]) => {
      ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI*2); ctx.fill();
    });
  }
  ctx.restore();
}

// ─── FLOOR TILE ───────────────────────────────────────────────────────────────

function drawFloorTile(ctx, t, px, py, T, v, map, gx, gy, state, data) {
  const zone  = t.zone || '';
  const floor = v.floor || (t.type === 'metal' ? 'metal_plate' : t.type === 'floor' ? 'concrete' : t.type);

  // ── Base floor color ───────────────────────────────────────────────────────
  drawFloorBase(ctx, floor, px, py, T);

  // ── Receive shadow from wall above ─────────────────────────────────────────
  const tileAbove = map.tiles[gy - 1]?.[gx];
  if (tileAbove?.type === 'wall') {
    const shadowGrad = ctx.createLinearGradient(px, py, px, py + 14);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(px, py, T, 14);
  }
  // Shadow from wall to the left
  const tileLeft = map.tiles[gy]?.[gx - 1];
  if (tileLeft?.type === 'wall') {
    const lsGrad = ctx.createLinearGradient(px, py, px + 10, py);
    lsGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
    lsGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lsGrad;
    ctx.fillRect(px, py, 10, T);
  }

  // ── Zone color overlay ─────────────────────────────────────────────────────
  const zoneColor = ZONE_COLOR[zone];
  if (zoneColor) {
    ctx.fillStyle = hexAlpha(zoneColor, 0.06);
    ctx.fillRect(px, py, T, T);
    // Zone edge highlight on north wall face
    if (tileAbove?.zone !== zone) {
      ctx.fillStyle = hexAlpha(zoneColor, 0.25);
      ctx.fillRect(px, py, T, 2);
    }
  }

  // ── Decal ──────────────────────────────────────────────────────────────────
  if (v.decal) drawDecal(ctx, v.decal, px, py, T, zone);

  // ── Prop ───────────────────────────────────────────────────────────────────
  if (v.prop && !t.gameTable && !t.jukebox) drawProp(ctx, v.prop, px, py, T);

  // ── FX ─────────────────────────────────────────────────────────────────────
  if (v.fx) drawFX(ctx, v.fx, px, py, T, _fxTime);

  // ── Special tile markers ───────────────────────────────────────────────────
  if (t.gameTable)   drawGameTableMarker(ctx, px, py, T, t.gameTable, data);
  if (t.jukebox)     drawJukeboxMarker(ctx, px, py, T, t.jukebox, data);
  if (t.transition)  drawTransitionMarker(ctx, px, py, T, t.transition);
  else if (t.loot)   drawLootMarker(ctx, px, py, T, t);
  else if (t.interact) drawInteractMarker(ctx, px, py, T, t);

  // ── Cover indicator ────────────────────────────────────────────────────────
  if (t.cover) {
    ctx.strokeStyle = 'rgba(80,120,180,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
  }

  // ── Grid line ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = PAL.gridLine;
  ctx.lineWidth   = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
}

// ─── FLOOR BASE TEXTURES ──────────────────────────────────────────────────────

function drawFloorBase(ctx, floor, px, py, T) {
  switch (floor) {

    case 'metal_plate': {
      // Steel plate with rivet grid
      const g = ctx.createLinearGradient(px, py, px + T, py + T);
      g.addColorStop(0, '#1e2c3e'); g.addColorStop(1, '#141e2c');
      ctx.fillStyle = g; ctx.fillRect(px, py, T, T);
      // Panel seams
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      const seamX = px + Math.round(T / 2);
      const seamY = py + Math.round(T / 2);
      ctx.beginPath(); ctx.moveTo(seamX, py); ctx.lineTo(seamX, py + T); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, seamY); ctx.lineTo(px + T, seamY); ctx.stroke();
      // Rivets at corners
      ctx.fillStyle = 'rgba(80,110,150,0.5)';
      [[px+3,py+3],[px+T-4,py+3],[px+3,py+T-4],[px+T-4,py+T-4]].forEach(([rx,ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 1.8, 0, Math.PI*2); ctx.fill();
      });
      // Subtle highlight top-left
      const hl = ctx.createLinearGradient(px, py, px + T * 0.6, py + T * 0.6);
      hl.addColorStop(0, 'rgba(255,255,255,0.04)');
      hl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hl; ctx.fillRect(px, py, T, T);
      break;
    }

    case 'metal_grate': {
      ctx.fillStyle = '#0e1520'; ctx.fillRect(px, py, T, T);
      // Grate crosshatch
      ctx.strokeStyle = 'rgba(40,60,90,0.7)'; ctx.lineWidth = 1;
      for (let i = 0; i <= T; i += 7) {
        ctx.beginPath(); ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + T); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py + i); ctx.lineTo(px + T, py + i); ctx.stroke();
      }
      // Glow from below (through grate)
      const gg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*0.5);
      gg.addColorStop(0, 'rgba(0,100,200,0.12)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(px, py, T, T);
      break;
    }

    case 'concrete': {
      const g = ctx.createLinearGradient(px, py, px + T, py + T);
      g.addColorStop(0, '#1c2230'); g.addColorStop(1, '#141a24');
      ctx.fillStyle = g; ctx.fillRect(px, py, T, T);
      // Crack pattern
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(px + T*0.3, py + T*0.2);
      ctx.lineTo(px + T*0.5, py + T*0.55);
      ctx.lineTo(px + T*0.7, py + T*0.7);
      ctx.stroke();
      // Subtle noise patches
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(px + 8, py + 12, 14, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(px + 28, py + 6, 10, 16);
      break;
    }

    case 'stained': {
      ctx.fillStyle = '#14161c'; ctx.fillRect(px, py, T, T);
      // Oil stains
      const s1 = ctx.createRadialGradient(px+T*0.35, py+T*0.4, 0, px+T*0.35, py+T*0.4, T*0.3);
      s1.addColorStop(0, 'rgba(40,20,5,0.4)'); s1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = s1; ctx.fillRect(px, py, T, T);
      const s2 = ctx.createRadialGradient(px+T*0.7, py+T*0.25, 0, px+T*0.7, py+T*0.25, T*0.2);
      s2.addColorStop(0, 'rgba(0,15,30,0.35)'); s2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = s2; ctx.fillRect(px, py, T, T);
      break;
    }

    case 'civic_tile': {
      const g = ctx.createLinearGradient(px, py, px + T, py + T);
      g.addColorStop(0, '#1a2248'); g.addColorStop(1, '#121838');
      ctx.fillStyle = g; ctx.fillRect(px, py, T, T);
      // Clean tile grid
      ctx.strokeStyle = 'rgba(60,80,160,0.25)'; ctx.lineWidth = 0.8;
      const half = T / 2;
      ctx.strokeRect(px + 3, py + 3, half - 4, half - 4);
      ctx.strokeRect(px + half + 1, py + 3, half - 4, half - 4);
      ctx.strokeRect(px + 3, py + half + 1, half - 4, half - 4);
      ctx.strokeRect(px + half + 1, py + half + 1, half - 4, half - 4);
      // Civic sheen
      const hl = ctx.createLinearGradient(px, py, px + T * 0.5, py + T * 0.3);
      hl.addColorStop(0, 'rgba(100,140,255,0.06)');
      hl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hl; ctx.fillRect(px, py, T, T);
      break;
    }

    case 'void': default: {
      ctx.fillStyle = '#050810'; ctx.fillRect(px, py, T, T);
      const vg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*0.7);
      vg.addColorStop(0, 'rgba(20,30,80,0.15)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vg; ctx.fillRect(px, py, T, T);
      break;
    }
  }
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

function drawProp(ctx, prop, px, py, T) {
  ctx.save();
  const cx = px + T / 2, cy = py + T / 2;

  switch(prop) {
    case 'barrel': {
      // Industrial drum — cylindrical silhouette
      const bx = px + T * 0.62, by = py + T * 0.55, bw = T * 0.22, bh = T * 0.28;
      ctx.fillStyle = '#3a4a5a';
      ctx.fillRect(bx, by - bh/2, bw, bh);
      // Barrel highlight
      const bg = ctx.createLinearGradient(bx, by, bx + bw, by);
      bg.addColorStop(0, 'rgba(100,140,180,0.4)');
      bg.addColorStop(0.4, 'rgba(200,230,255,0.15)');
      bg.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = bg; ctx.fillRect(bx, by - bh/2, bw, bh);
      // Bands
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by - bh/6); ctx.lineTo(bx+bw, by - bh/6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + bh/6); ctx.lineTo(bx+bw, by + bh/6); ctx.stroke();
      // Top cap shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by - bh/2, bw, 3);
      break;
    }

    case 'crate': {
      const crx = px + T*0.1, cry = py + T*0.15, crw = T*0.5, crh = T*0.45;
      // Crate body
      const cg = ctx.createLinearGradient(crx, cry, crx+crw, cry+crh);
      cg.addColorStop(0, '#5a4a2a'); cg.addColorStop(1, '#3a2e18');
      ctx.fillStyle = cg; ctx.fillRect(crx, cry, crw, crh);
      // Wood planks
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(crx, cry, crw, crh);
      ctx.beginPath(); ctx.moveTo(crx + crw/3, cry); ctx.lineTo(crx + crw/3, cry + crh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(crx + crw*2/3, cry); ctx.lineTo(crx + crw*2/3, cry + crh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(crx, cry + crh/2); ctx.lineTo(crx + crw, cry + crh/2); ctx.stroke();
      // Top highlight
      ctx.fillStyle = 'rgba(255,220,120,0.08)';
      ctx.fillRect(crx, cry, crw, crh * 0.3);
      // Cast shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(crx + crw, cry + 4, 5, crh - 4);
      ctx.fillRect(crx + 4, cry + crh, crw - 4, 4);
      break;
    }

    case 'terminal': {
      const tx = px + T*0.2, ty = py + T*0.1, tw = T*0.6, th = T*0.5;
      // Terminal body
      ctx.fillStyle = '#0a1520'; ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = '#1a3050'; ctx.lineWidth = 1; ctx.strokeRect(tx, ty, tw, th);
      // Screen glow
      const scr = ctx.createRadialGradient(tx+tw/2, ty+th/2, 0, tx+tw/2, ty+th/2, tw/2);
      scr.addColorStop(0, 'rgba(0,200,255,0.3)');
      scr.addColorStop(0.6, 'rgba(0,100,200,0.15)');
      scr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scr; ctx.fillRect(tx+2, ty+2, tw-4, th-4);
      // Screen scanlines
      ctx.strokeStyle = 'rgba(0,200,255,0.08)'; ctx.lineWidth = 0.8;
      for (let i = ty + 4; i < ty + th - 4; i += 3) {
        ctx.beginPath(); ctx.moveTo(tx+2, i); ctx.lineTo(tx+tw-2, i); ctx.stroke();
      }
      // Cursor blink via phase of fxTime
      if (Math.sin(_fxTime * 3) > 0) {
        ctx.fillStyle = 'rgba(0,255,200,0.7)';
        ctx.fillRect(tx + tw * 0.3, ty + th * 0.55, 6, 3);
      }
      // Base
      ctx.fillStyle = '#0c1828'; ctx.fillRect(tx + tw*0.3, ty + th, tw*0.4, 4);
      break;
    }

    case 'cable_bundle': {
      // Cables running along wall edge
      ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px+2, py+T*0.3); ctx.lineTo(px+2, py+T*0.9); ctx.stroke();
      ctx.strokeStyle = '#0f2030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px+5, py+T*0.2); ctx.lineTo(px+5, py+T); ctx.stroke();
      ctx.strokeStyle = '#152535'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px+8, py+T*0.4); ctx.lineTo(px+8, py+T*0.85); ctx.stroke();
      // Zip tie
      ctx.strokeStyle = 'rgba(200,220,255,0.3)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(px+1, py + T*0.55, 9, 4);
      break;
    }

    case 'sign_neon': {
      // Neon sign on wall — glowing text box
      const sx = px + T*0.05, sy = py + T*0.1, sw = T*0.9, sh = T*0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx, sy, sw, sh);
      // Neon glow
      const neonAlpha = 0.7 + 0.3 * Math.sin(_fxTime * 2);
      ctx.fillStyle = hexAlpha(PAL.neonPink, neonAlpha * 0.15);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = hexAlpha(PAL.neonPink, neonAlpha);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      // Sign glow halo
      ctx.shadowColor = PAL.neonPink;
      ctx.shadowBlur = 8 * neonAlpha;
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.shadowBlur = 0;
      // BAR text approximation (3 rectangles)
      ctx.fillStyle = hexAlpha(PAL.neonPink, neonAlpha * 0.8);
      const lx = sx + sw*0.15, ly = sy + sh*0.25, lh = sh*0.5;
      // B
      ctx.fillRect(lx,      ly, 4, lh);
      ctx.fillRect(lx,      ly, 8, 2);
      ctx.fillRect(lx,      ly + lh/2 - 1, 8, 2);
      ctx.fillRect(lx,      ly + lh - 2, 8, 2);
      // A
      ctx.fillRect(lx+12,   ly, 3, lh);
      ctx.fillRect(lx+19,   ly, 3, lh);
      ctx.fillRect(lx+12,   ly, 10, 2);
      ctx.fillRect(lx+12,   ly + lh/2-1, 10, 2);
      // R
      ctx.fillRect(lx+26,   ly, 3, lh);
      ctx.fillRect(lx+26,   ly, 9, 2);
      ctx.fillRect(lx+26,   ly + lh/2-1, 9, 2);
      ctx.fillRect(lx+33,   ly, 3, lh*0.5);
      ctx.fillRect(lx+30,   ly + lh*0.5, 6, lh*0.5);
      break;
    }

    case 'debris': {
      ctx.fillStyle = 'rgba(60,70,80,0.6)';
      // Scattered small pieces
      [[px+T*0.2, py+T*0.6, 6, 3],[px+T*0.5, py+T*0.45, 4, 4],[px+T*0.7, py+T*0.7, 5, 2]].forEach(([rx,ry,rw,rh]) => {
        ctx.fillRect(rx, ry, rw, rh);
      });
      ctx.fillStyle = 'rgba(80,90,100,0.4)';
      ctx.beginPath(); ctx.arc(px+T*0.35, py+T*0.55, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(px+T*0.65, py+T*0.6, 1.5, 0, Math.PI*2); ctx.fill();
      break;
    }

    case 'chem_tank': {
      const ctx2 = ctx;
      const tx = px + T*0.55, ty = py + T*0.1, tw2 = T*0.32, th2 = T*0.7;
      const tg = ctx2.createLinearGradient(tx, ty, tx+tw2, ty);
      tg.addColorStop(0, '#1a3a20'); tg.addColorStop(0.4, '#2a5a30'); tg.addColorStop(1, '#0e2016');
      ctx2.fillStyle = tg; ctx2.fillRect(tx, ty, tw2, th2);
      // Tank ribs
      ctx2.strokeStyle = 'rgba(0,0,0,0.4)'; ctx2.lineWidth = 1;
      for (let i = 0.2; i < 0.9; i += 0.2) {
        ctx2.beginPath(); ctx2.moveTo(tx, ty + th2*i); ctx2.lineTo(tx+tw2, ty + th2*i); ctx2.stroke();
      }
      // Hazard label
      ctx2.fillStyle = 'rgba(200,200,0,0.2)';
      ctx2.fillRect(tx + 2, ty + th2*0.35, tw2-4, th2*0.25);
      // Top cap
      ctx2.fillStyle = '#0e1e14';
      ctx2.fillRect(tx - 2, ty, tw2 + 4, 5);
      break;
    }
  }
  ctx.restore();
}

// ─── FX LAYER ─────────────────────────────────────────────────────────────────

function drawFX(ctx, fx, px, py, T, t) {
  ctx.save();
  switch(fx) {

    case 'steam_vent': {
      const phase = t * 0.8;
      const puffs = 3;
      for (let i = 0; i < puffs; i++) {
        const offset = ((phase + i / puffs) % 1);
        const puffY  = py + T - offset * T * 1.2;
        const alpha  = offset < 0.3 ? offset / 0.3 : 1 - (offset - 0.3) / 0.7;
        const radius = 3 + offset * 10;
        const sg = ctx.createRadialGradient(px + T/2, puffY, 0, px + T/2, puffY, radius);
        sg.addColorStop(0, `rgba(200,220,255,${alpha * 0.35})`);
        sg.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(px + T/2, puffY, radius, 0, Math.PI*2); ctx.fill();
      }
      // Vent grate at bottom
      ctx.fillStyle = 'rgba(40,50,70,0.6)';
      ctx.fillRect(px + T*0.3, py + T*0.8, T*0.4, 4);
      ctx.strokeStyle = 'rgba(80,100,130,0.4)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const vx = px + T*0.32 + i * (T*0.38/3);
        ctx.beginPath(); ctx.moveTo(vx, py+T*0.8); ctx.lineTo(vx, py+T*0.8+4); ctx.stroke();
      }
      break;
    }

    case 'neon_glow': {
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.5);
      const ng = ctx.createRadialGradient(px + T/2, py + T/2, 0, px + T/2, py + T/2, T * 0.6);
      ng.addColorStop(0, `rgba(255,30,120,${0.12 * pulse})`);
      ng.addColorStop(1, 'rgba(255,30,120,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(px, py, T, T);
      break;
    }

    case 'flicker': {
      // Overhead light cone that flickers
      const on = Math.sin(t * 8) > -0.85 && Math.sin(t * 15) > -0.7;
      if (on) {
        const fl = ctx.createRadialGradient(px + T/2, py, 0, px + T/2, py + T*0.7, T*0.6);
        fl.addColorStop(0, 'rgba(220,210,150,0.18)');
        fl.addColorStop(1, 'rgba(220,210,150,0)');
        ctx.fillStyle = fl; ctx.fillRect(px, py, T, T);
        // Light fixture dot
        ctx.fillStyle = on ? 'rgba(255,240,180,0.7)' : 'rgba(80,80,60,0.3)';
        ctx.beginPath(); ctx.arc(px + T/2, py + 3, 2.5, 0, Math.PI*2); ctx.fill();
      }
      break;
    }

    case 'red_light': {
      const rpulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.2));
      const rl = ctx.createRadialGradient(px + T*0.8, py + T*0.15, 0, px + T*0.8, py + T*0.15, T*0.5);
      rl.addColorStop(0, `rgba(255,20,20,${0.25 * rpulse})`);
      rl.addColorStop(1, 'rgba(255,20,20,0)');
      ctx.fillStyle = rl; ctx.fillRect(px, py, T, T);
      // Warning light fixture
      ctx.fillStyle = `rgba(255,20,20,${0.8 * rpulse})`;
      ctx.beginPath(); ctx.arc(px + T*0.8, py + T*0.15, 3, 0, Math.PI*2); ctx.fill();
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 6 * rpulse;
      ctx.fill(); ctx.shadowBlur = 0;
      break;
    }

    case 'sparks': {
      if (Math.sin(t * 7) > 0.92) {
        const sparkCount = 4;
        for (let i = 0; i < sparkCount; i++) {
          const ang = (i / sparkCount) * Math.PI * 2 + t * 10;
          const dist = 4 + Math.random() * 8;
          const sx = px + T * 0.3 + Math.cos(ang) * dist;
          const sy = py + T * 0.5 + Math.sin(ang) * dist;
          ctx.fillStyle = `rgba(255,${180 + Math.floor(Math.random()*60)},30,0.9)`;
          ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.fillStyle = 'rgba(255,220,80,0.6)';
        ctx.beginPath(); ctx.arc(px + T*0.3, py + T*0.5, 3, 0, Math.PI*2); ctx.fill();
      }
      break;
    }

    case 'haze': {
      const alpha = 0.08 + 0.04 * Math.sin(t * 0.5);
      ctx.fillStyle = `rgba(60,60,80,${alpha})`;
      ctx.fillRect(px, py, T, T);
      break;
    }

    case 'drip': {
      const dPhase = (t * 0.4) % 1;
      const dAlpha = dPhase < 0.2 ? dPhase / 0.2 : dPhase > 0.8 ? 1 - (dPhase - 0.8) / 0.2 : 1;
      const dY = py + dPhase * T;
      ctx.fillStyle = `rgba(100,140,200,${dAlpha * 0.6})`;
      ctx.beginPath(); ctx.arc(px + T * 0.4, dY, 1.5, 0, Math.PI*2); ctx.fill();
      // Drip streak
      ctx.strokeStyle = `rgba(100,140,200,${dAlpha * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + T*0.4, py); ctx.lineTo(px + T*0.4, dY); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ─── DECALS ───────────────────────────────────────────────────────────────────

function drawDecal(ctx, decal, px, py, T, zone) {
  ctx.save(); ctx.globalAlpha = 0.6;
  switch(decal) {
    case 'worn_number':
      ctx.fillStyle = 'rgba(100,120,160,0.3)';
      ctx.font = `bold ${T*0.22}px monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('B4', px + 3, py + T - 3);
      break;
    case 'civic_stripe':
      ctx.fillStyle = 'rgba(255,200,0,0.25)';
      ctx.fillRect(px, py + T - 4, T, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px, py + T - 6, T, 2);
      break;
    case 'blood_stain':
      ctx.fillStyle = 'rgba(120,15,15,0.45)';
      ctx.beginPath(); ctx.ellipse(px + T*0.3, py + T*0.6, T*0.2, T*0.12, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px + T*0.55, py + T*0.5, T*0.08, T*0.06, -0.5, 0, Math.PI*2); ctx.fill();
      break;
    case 'graffiti':
      ctx.fillStyle = 'rgba(180,40,180,0.3)';
      ctx.font = `bold ${T*0.25}px monospace`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('◈◈', px + T - 3, py + 3);
      break;
    case 'hazard_strip':
      for (let i = 0; i < T; i += 8) {
        ctx.fillStyle = i % 16 < 8 ? 'rgba(255,200,0,0.3)' : 'rgba(0,0,0,0.2)';
        ctx.fillRect(px + i, py + T - 5, 8, 5);
      }
      break;
    case 'boot_prints':
      ctx.fillStyle = 'rgba(30,35,45,0.5)';
      ctx.beginPath(); ctx.ellipse(px+T*0.35, py+T*0.4, 4, 6, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px+T*0.55, py+T*0.65, 4, 6, 0.5, 0, Math.PI*2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ─── SPECIAL TILE MARKERS ─────────────────────────────────────────────────────

function drawGameTableMarker(ctx, px, py, T, tableId, data) {
  const table = (data.tables||[]).find(t => t.id === tableId);
  const type  = table?.type || 'card';
  const color = type === 'slot' ? PAL.neonGold : type === 'other' ? PAL.neonGreen : PAL.neonCyan;

  // Glow floor
  const gg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*0.5);
  gg.addColorStop(0, hexAlpha(color, 0.15)); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.fillRect(px, py, T, T);

  // Icon
  ctx.save();
  ctx.font = `${T * 0.38}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(type === 'slot' ? '🎰' : type === 'other' ? '◈' : '◈', px + T/2, py + T/2);
  ctx.shadowBlur = 0; ctx.restore();
}

function drawJukeboxMarker(ctx, px, py, T, jukeboxId, data) {
  const color = PAL.neonPink;
  const pulse = 0.8 + 0.2 * Math.sin(_fxTime * 2);

  const gg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*0.5);
  gg.addColorStop(0, hexAlpha(color, 0.18 * pulse)); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.fillRect(px, py, T, T);

  ctx.save();
  ctx.font = `${T * 0.4}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 10 * pulse;
  ctx.fillStyle = color;
  ctx.fillText('♪', px + T/2, py + T/2);
  ctx.shadowBlur = 0; ctx.restore();
}

function drawTransitionMarker(ctx, px, py, T, transition) {
  const color = PAL.neonGold;
  // Arrow chevron drawn on floor
  ctx.save();
  ctx.strokeStyle = hexAlpha(color, 0.7);
  ctx.fillStyle   = hexAlpha(color, 0.12);
  ctx.lineWidth   = 1.5;
  ctx.fillRect(px + 4, py + 4, T - 8, T - 8);
  ctx.strokeRect(px + 4, py + 4, T - 8, T - 8);
  // Arrow pointing right
  ctx.beginPath();
  ctx.moveTo(px + T*0.35, py + T*0.35);
  ctx.lineTo(px + T*0.65, py + T/2);
  ctx.lineTo(px + T*0.35, py + T*0.65);
  ctx.strokeStyle = hexAlpha(color, 0.9);
  ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawLootMarker(ctx, px, py, T, t) {
  const color = '#c8a040';
  ctx.save();
  ctx.font = `${T * 0.35}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.fillStyle = color;
  const txt = t.containerName?.toLowerCase().includes('locker') ? '▪' : '▩';
  ctx.fillText(txt, px + T/2, py + T/2);
  ctx.shadowBlur = 0; ctx.restore();
}

function drawInteractMarker(ctx, px, py, T, t) {
  const txt = t.interactText?.toLowerCase();
  const color = txt?.includes('terminal') || txt?.includes('console') ? PAL.neonCyan
              : txt?.includes('door') || txt?.includes('hatch') ? PAL.neonGold
              : '#8888aa';
  ctx.save();
  ctx.font = `${T * 0.3}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 4;
  ctx.fillStyle = color;
  ctx.fillText('⬡', px + T/2, py + T/2);
  ctx.shadowBlur = 0; ctx.restore();
}

// ─── ENTITY / ACTOR DRAWING ───────────────────────────────────────────────────

/**
 * Draw all actors onto the canvas AFTER the tile pass.
 * Called separately so entities are always on top of tiles.
 */
export function renderEntitiesCanvas(map, state, data, api, T) {
  if (!_ctx) return;
  const actorsHere = state.roster.filter(a => a.mapId === state.mapId && !a.dead);

  actorsHere.forEach(actor => {
    const revealed = api.isTileRevealed(actor.x, actor.y);
    if (!revealed && !state.party.includes(actor.id)) return;
    drawActor(_ctx, actor, state, T);
  });
}

function drawActor(ctx, actor, state, T) {
  const px = actor.x * T + 2;
  const py = actor.y * T + 2;
  const w  = T - 4;
  const h  = T - 4;
  const cx = px + w / 2;
  const cy = py + h / 2;

  const isSelected  = state.selectedActorId === actor.id;
  const isCurrent   = state.combat.active && state.combat.turnOrder[state.combat.currentTurnIndex] === actor.id;
  const isAI        = state.combat.aiActingId === actor.id;
  const isStealthed = actor.statuses.includes('stealthed');
  const hpPct       = Math.max(0, actor.hp / actor.hpMax);

  ctx.save();
  if (isStealthed) ctx.globalAlpha = 0.4;
  if (actor.downed) { ctx.globalAlpha = 0.45; ctx.filter = 'grayscale(0.8)'; }

  // Role colors
  const colors = {
    player:  { body: '#1e3a6e', rim: '#4a90e2', glow: '#6fb3ff' },
    ally:    { body: '#1a3d25', rim: '#3ab060', glow: '#7ed9a0' },
    enemy:   { body: '#4a1010', rim: '#cc3030', glow: '#ff6464' },
    neutral: { body: '#3d3010', rim: '#b08020', glow: '#ccaa55' },
  };
  const col = colors[actor.role] || colors.neutral;

  // ── Ground shadow ──────────────────────────────────────────────────────────
  const shadowG = ctx.createRadialGradient(cx, py + h - 2, 0, cx, py + h - 2, w * 0.55);
  shadowG.addColorStop(0, 'rgba(0,0,0,0.5)');
  shadowG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowG;
  ctx.beginPath(); ctx.ellipse(cx, py + h - 1, w * 0.45, 5, 0, 0, Math.PI*2); ctx.fill();

  // ── Selection ring ─────────────────────────────────────────────────────────
  if (isSelected) {
    const selPulse = 0.7 + 0.3 * Math.sin(_fxTime * 3);
    ctx.strokeStyle = hexAlpha(col.glow, selPulse);
    ctx.lineWidth = 2;
    ctx.shadowColor = col.glow; ctx.shadowBlur = 10 * selPulse;
    ctx.strokeRect(px - 2, py - 2, w + 4, h + 4);
    ctx.shadowBlur = 0;
  }

  // ── AI acting bounce offset ────────────────────────────────────────────────
  let drawOffY = 0;
  if (isAI) drawOffY = -Math.abs(Math.sin(_fxTime * 6)) * 4;

  // ── Body silhouette ────────────────────────────────────────────────────────
  const bodyH  = h * 0.65;
  const bodyW  = w * 0.55;
  const bodyX  = cx - bodyW / 2;
  const bodyY  = py + h * 0.28 + drawOffY;
  const headR  = w * 0.18;
  const headCX = cx;
  const headCY = py + h * 0.22 + drawOffY;

  // Body gradient
  const bg = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
  bg.addColorStop(0, lighten(col.body, 0.4));
  bg.addColorStop(0.3, col.body);
  bg.addColorStop(1, darken(col.body, 0.5));
  ctx.fillStyle = bg;

  // Draw body shape based on class
  drawActorBody(ctx, actor.classId, bodyX, bodyY, bodyW, bodyH, headCX, headCY, headR, col, bg);

  // ── Current turn pulse ring ────────────────────────────────────────────────
  if (isCurrent && !isAI) {
    const tp = 0.6 + 0.4 * Math.abs(Math.sin(_fxTime * 2));
    ctx.strokeStyle = hexAlpha(col.glow, tp);
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = col.glow; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, py + h * 0.5 + drawOffY, w * 0.48, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── AI warning glow ────────────────────────────────────────────────────────
  if (isAI) {
    ctx.strokeStyle = hexAlpha(PAL.neonGold, 0.85);
    ctx.lineWidth = 2;
    ctx.shadowColor = PAL.neonGold; ctx.shadowBlur = 12;
    ctx.strokeRect(px - 2, py - 2 + drawOffY, w + 4, h + 4);
    ctx.shadowBlur = 0;
  }

  // ── HP bar ─────────────────────────────────────────────────────────────────
  const barY  = py + h - 5;
  const barW  = w;
  const barH2 = 3;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(px, barY, barW, barH2);
  const hpColor = hpPct > 0.6 ? '#4aff9a' : hpPct > 0.3 ? '#ffcc5a' : '#ff4444';
  ctx.fillStyle = hpColor;
  ctx.fillRect(px, barY, barW * hpPct, barH2);

  ctx.restore();
}

function drawActorBody(ctx, classId, bodyX, bodyY, bodyW, bodyH, headCX, headCY, headR, col, bodyGrad) {
  // Head
  ctx.fillStyle = lighten(col.body, 0.5);
  ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = col.rim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI*2); ctx.stroke();
  // Head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(headCX - headR*0.25, headCY - headR*0.25, headR*0.45, 0, Math.PI*2); ctx.fill();

  // Body
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.strokeStyle = col.rim; ctx.lineWidth = 1;
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
  // Body highlight
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(bodyX, bodyY, bodyW * 0.4, bodyH);

  // Class-specific detail
  switch(classId) {
    case 'marshal':
      // Gun arm
      ctx.strokeStyle = col.rim; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bodyX + bodyW, bodyY + bodyH * 0.2);
      ctx.lineTo(bodyX + bodyW + 8, bodyY + bodyH * 0.15);
      ctx.stroke();
      break;
    case 'voidseer':
      // Glow aura
      ctx.strokeStyle = hexAlpha('#c97aff', 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(headCX, headCY, headR + 4, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'raider':
      // Shoulder spike
      ctx.fillStyle = col.rim;
      ctx.fillRect(bodyX - 4, bodyY, 4, 8);
      ctx.fillRect(bodyX + bodyW, bodyY, 4, 8);
      break;
    case 'salvager':
      // Tool on back
      ctx.strokeStyle = '#607080'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bodyX + bodyW * 0.8, bodyY - 4);
      ctx.lineTo(bodyX + bodyW * 0.8, bodyY + bodyH * 0.4);
      ctx.stroke();
      break;
  }
}

// ─── ANIMATION LOOP ───────────────────────────────────────────────────────────

export function startMapRenderLoop(getState) {
  cancelAnimationFrame(_animId);
  function loop() {
    _fxTime += 0.016;
    const { map, state, data, api } = getState();
    if (map && state && data && api) {
      renderMapCanvas(map, state, data, api);
      renderEntitiesCanvas(map, state, data, api, data.config.map.tileSize);
    }
    _animId = requestAnimationFrame(loop);
  }
  _animId = requestAnimationFrame(loop);
}

export function stopMapRenderLoop() {
  cancelAnimationFrame(_animId);
  _animId = null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getWallPalette(wallType) {
  switch(wallType) {
    case 'corrugated':  return PAL.wallCorrugated;
    case 'pipe_bundle': return PAL.wallPipes;
    case 'rock':        return PAL.wallRock;
    case 'civic_block': return PAL.wallCivic;
    default:            return PAL.wallHull;
  }
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function lighten(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
