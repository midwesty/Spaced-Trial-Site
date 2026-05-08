/**
 * MapRenderer.js — High-atmosphere canvas renderer for Spaced
 * ============================================================
 * Target aesthetic: dark atmospheric sci-fi station interior.
 * Walls read as tall 3D blocks. Floors have strong texture contrast.
 * Lighting pools create zone identity. Props fill space.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const T_BASE    = 56;   // base tile size (overridden by config)
const WALL_H    = 26;   // wall top-face height in px
const WALL_D    = 8;    // wall right-depth in px
const SHADOW_D  = 16;   // floor shadow cast by wall above

// ─── PALETTE ──────────────────────────────────────────────────────────────────

const C = {
  // Floor bases
  fMetal:    '#18232f',
  fGrate:    '#0e1620',
  fConcrete: '#161d28',
  fStained:  '#111318',
  fCivic:    '#151d3a',
  fVoid:     '#040608',
  fAsh:      '#1a1510',
  fSand:     '#1e1a0e',
  fToxic:    '#0a1812',

  // Wall bases
  wTop:      '#2c4060',  // lit top face
  wFace:     '#0e1824',  // front face
  wDepth:    '#060e16',  // right depth
  wAccent:   '#3a5580',  // top edge highlight

  // Neon palette
  pink:   '#ff2070',
  cyan:   '#00d4ff',
  gold:   '#ffcc00',
  green:  '#00ff88',
  purple: '#c040ff',
  orange: '#ff6a00',
  red:    '#ff2020',

  // Fog
  fog:    '#080c10',
};

// Zone → neon color
const ZONE_NEON = {
  restricted_impound: C.orange,
  restricted_civic:   C.cyan,
  hostile_reaver:     C.red,
  transition_ab:      C.gold,
  transition_bc:      C.gold,
  transition_ac:      C.gold,
};

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _canvas  = null;
let _ctx     = null;
let _animId  = null;
let _t       = 0;     // time counter for animations
let _getState = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function initMapRenderer(tileLayerEl) {
  if (_canvas) { _canvas.remove(); cancelAnimationFrame(_animId); }
  _canvas = document.createElement('canvas');
  _canvas.id = 'mapCanvas';
  _canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated;';
  tileLayerEl.parentElement.insertBefore(_canvas, tileLayerEl);
  tileLayerEl.style.opacity = '0';
  tileLayerEl.style.pointerEvents = 'auto';
  _ctx = _canvas.getContext('2d', { alpha: false });
}

export function startMapRenderLoop(getStateFn) {
  _getState = getStateFn;
  cancelAnimationFrame(_animId);
  function loop() {
    _t += 0.018;
    try {
      const { map, state, data, api } = _getState();
      if (map && state && data && api) {
        _drawFrame(map, state, data, api);
      }
    } catch(e) {}
    _animId = requestAnimationFrame(loop);
  }
  _animId = requestAnimationFrame(loop);
}

export function stopMapRenderLoop() {
  cancelAnimationFrame(_animId);
  _animId = null;
}

export function renderMapCanvas(map, state, data, api) {
  if (!_canvas || !_ctx) return;
  _drawFrame(map, state, data, api);
}

export function renderEntitiesCanvas() {} // no-op — entities drawn in loop

// ─── MAIN FRAME ───────────────────────────────────────────────────────────────

function _drawFrame(map, state, data, api) {
  const T  = data?.config?.map?.tileSize || T_BASE;
  const W  = map.width  * T;
  const H  = map.height * T;

  if (_canvas.width !== W || _canvas.height !== H) {
    _canvas.width  = W;
    _canvas.height = H;
  }

  const ctx = _ctx;
  ctx.fillStyle = C.fog;
  ctx.fillRect(0, 0, W, H);

  // Pass 1 — floors (back to front)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type === 'wall') continue;
      const revealed = api.isTileRevealed(x, y);
      if (revealed) _drawFloor(ctx, t, x, y, T, map);
      else _drawFog(ctx, x, y, T);
    }
  }

  // Pass 2 — walls on top (so they overlap floors)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type !== 'wall') continue;
      const revealed = api.isTileRevealed(x, y);
      if (revealed) _drawWall(ctx, t, x, y, T, map);
      else _drawFog(ctx, x, y, T);
    }
  }

  // Pass 3 — overlays: FX, markers, props
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type === 'wall') continue;
      if (!api.isTileRevealed(x, y)) continue;
      _drawOverlays(ctx, t, x, y, T, map, data);
    }
  }

  // Pass 4 — actors
  const actors = state.roster.filter(a => a.mapId === state.mapId && !a.dead);
  // Sort by Y so lower actors draw on top
  actors.sort((a,b) => a.y - b.y);
  for (const actor of actors) {
    const revealed = api.isTileRevealed(actor.x, actor.y);
    if (!revealed && !state.party.includes(actor.id)) continue;
    _drawActor(ctx, actor, state, T);
  }
}

// ─── FOG ──────────────────────────────────────────────────────────────────────

function _drawFog(ctx, gx, gy, T) {
  const px = gx * T, py = gy * T;
  ctx.fillStyle = '#06090e';
  ctx.fillRect(px, py, T, T);
}

// ─── FLOOR ────────────────────────────────────────────────────────────────────

function _drawFloor(ctx, t, gx, gy, T, map) {
  const px   = gx * T, py = gy * T;
  const v    = t.visual || {};
  const fl   = v.floor || _inferFloor(t);
  const zone = t.zone || '';

  // Base texture
  _floorTexture(ctx, fl, px, py, T);

  // Receive wall shadow from above
  const above = map.tiles[gy-1]?.[gx];
  if (above?.type === 'wall') {
    const sg = ctx.createLinearGradient(px, py, px, py + SHADOW_D);
    sg.addColorStop(0, 'rgba(0,0,0,0.75)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(px, py, T, SHADOW_D);
  }
  // Shadow from wall to the left
  const left = map.tiles[gy]?.[gx-1];
  if (left?.type === 'wall') {
    const sg = ctx.createLinearGradient(px, py, px + SHADOW_D * 0.7, py);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(px, py, SHADOW_D * 0.7, T);
  }

  // Zone neon floor tint
  const zc = ZONE_NEON[zone];
  if (zc) {
    ctx.fillStyle = _rgba(zc, 0.07);
    ctx.fillRect(px, py, T, T);
    // Edge strip on north boundary
    const aboveZone = map.tiles[gy-1]?.[gx]?.zone;
    if (aboveZone !== zone) {
      ctx.fillStyle = _rgba(zc, 0.35);
      ctx.fillRect(px, py, T, 2);
    }
  }

  // Decal
  if (v.decal) _drawDecal(ctx, v.decal, px, py, T);

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
}

function _inferFloor(t) {
  if (t.type === 'metal') return 'metal_plate';
  if (t.type === 'floor') return 'concrete';
  if (t.type === 'dirt')  return 'concrete';
  if (t.type === 'sand')  return 'metal_plate';
  if (t.type === 'toxic') return 'void';
  return 'metal_plate';
}

function _floorTexture(ctx, floor, px, py, T) {
  switch(floor) {

    case 'metal_plate': {
      // Base gradient — slightly lighter toward top-left (light source)
      const g = ctx.createLinearGradient(px, py, px + T, py + T);
      g.addColorStop(0, '#1e2c3e');
      g.addColorStop(0.5, '#18222e');
      g.addColorStop(1, '#111820');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, T, T);

      // Plate seam lines — divides tile into 4 panels
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      const mx = px + T * 0.5, my = py + T * 0.5;
      ctx.beginPath(); ctx.moveTo(mx, py); ctx.lineTo(mx, py+T); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, my); ctx.lineTo(px+T, my); ctx.stroke();

      // Seam highlight (light edge of seam)
      ctx.strokeStyle = 'rgba(80,120,180,0.12)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(mx+1, py); ctx.lineTo(mx+1, py+T); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, my+1); ctx.lineTo(px+T, my+1); ctx.stroke();

      // Rivet bolts at corners and center seam intersections
      ctx.fillStyle = 'rgba(60,90,130,0.6)';
      const rivets = [[px+3,py+3],[px+T-4,py+3],[px+3,py+T-4],[px+T-4,py+T-4],[mx-1,my-1]];
      for (const [rx,ry] of rivets) {
        ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI*2); ctx.fill();
        // Rivet highlight
        ctx.fillStyle = 'rgba(140,180,240,0.25)';
        ctx.beginPath(); ctx.arc(rx-0.5, ry-0.5, 1, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(60,90,130,0.6)';
      }

      // Overall top-left light sheen
      const sheen = ctx.createLinearGradient(px, py, px+T*0.7, py+T*0.7);
      sheen.addColorStop(0, 'rgba(255,255,255,0.035)');
      sheen.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(px, py, T, T);
      break;
    }

    case 'metal_grate': {
      ctx.fillStyle = '#0a1018';
      ctx.fillRect(px, py, T, T);

      // Thick grid bars
      ctx.strokeStyle = 'rgba(30,50,80,0.9)';
      ctx.lineWidth = 2;
      const step = 8;
      for (let i = 0; i <= T; i += step) {
        ctx.beginPath(); ctx.moveTo(px+i, py); ctx.lineTo(px+i, py+T); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py+i); ctx.lineTo(px+T, py+i); ctx.stroke();
      }
      // Thinner inner highlight
      ctx.strokeStyle = 'rgba(60,90,140,0.3)';
      ctx.lineWidth = 0.8;
      for (let i = step/2; i < T; i += step) {
        ctx.beginPath(); ctx.moveTo(px+i, py); ctx.lineTo(px+i, py+T); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py+i); ctx.lineTo(px+T, py+i); ctx.stroke();
      }
      // Glow from below (machinery beneath)
      const gg = ctx.createRadialGradient(px+T/2, py+T, 0, px+T/2, py+T/2, T*0.6);
      gg.addColorStop(0, 'rgba(0,80,180,0.18)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(px, py, T, T);
      break;
    }

    case 'concrete': {
      const g = ctx.createLinearGradient(px, py, px+T, py+T);
      g.addColorStop(0, '#1a2030');
      g.addColorStop(1, '#12181e');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, T, T);

      // Cracked texture overlay
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.8;
      // Main crack
      ctx.beginPath();
      ctx.moveTo(px + T*0.25, py + T*0.1);
      ctx.lineTo(px + T*0.4,  py + T*0.5);
      ctx.lineTo(px + T*0.65, py + T*0.75);
      ctx.stroke();
      // Secondary crack
      ctx.beginPath();
      ctx.moveTo(px + T*0.6, py + T*0.15);
      ctx.lineTo(px + T*0.55, py + T*0.45);
      ctx.stroke();
      // Spalling patches
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(px+5, py+8, 12, 8);
      ctx.fillRect(px+T-14, py+T-12, 10, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
      ctx.fillRect(px+T*0.3, py+T*0.3, 16, 10);
      break;
    }

    case 'stained': {
      ctx.fillStyle = '#0e1016';
      ctx.fillRect(px, py, T, T);

      // Multi-layer oil/grime stains
      const stains = [
        [px+T*0.3, py+T*0.4, T*0.35, T*0.22, 'rgba(50,25,5,0.5)'],
        [px+T*0.6, py+T*0.2, T*0.22, T*0.18, 'rgba(0,20,40,0.45)'],
        [px+T*0.15,py+T*0.65,T*0.28, T*0.2,  'rgba(30,10,5,0.4)'],
      ];
      for (const [sx,sy,sw,sh,col] of stains) {
        const sg = ctx.createRadialGradient(sx,sy,0,sx,sy,Math.max(sw,sh));
        sg.addColorStop(0, col); sg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(px, py, T, T);
      }
      // Scuff marks
      ctx.strokeStyle = 'rgba(40,40,50,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px+T*0.2,py+T*0.3); ctx.lineTo(px+T*0.45,py+T*0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px+T*0.55,py+T*0.6); ctx.lineTo(px+T*0.8,py+T*0.7); ctx.stroke();
      break;
    }

    case 'civic_tile': {
      const g = ctx.createLinearGradient(px, py, px+T, py+T);
      g.addColorStop(0, '#182050');
      g.addColorStop(1, '#10163a');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, T, T);

      // 2x2 tile sub-grid
      const hs = T / 2;
      ctx.strokeStyle = 'rgba(50,80,180,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px+2, py+2, hs-3, hs-3);
      ctx.strokeRect(px+hs+1, py+2, hs-3, hs-3);
      ctx.strokeRect(px+2, py+hs+1, hs-3, hs-3);
      ctx.strokeRect(px+hs+1, py+hs+1, hs-3, hs-3);

      // Tile face reflections (polished look)
      ctx.fillStyle = 'rgba(80,120,255,0.05)';
      ctx.fillRect(px+2, py+2, hs-3, hs-3);
      ctx.fillRect(px+hs+1, py+hs+1, hs-3, hs-3);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(px+hs+1, py+2, hs-3, hs-3);
      ctx.fillRect(px+2, py+hs+1, hs-3, hs-3);

      // Authority sheen
      const sheen = ctx.createLinearGradient(px, py, px+T*0.5, py+T*0.3);
      sheen.addColorStop(0, 'rgba(100,140,255,0.06)');
      sheen.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sheen; ctx.fillRect(px,py,T,T);
      break;
    }

    case 'void': default: {
      ctx.fillStyle = '#040608';
      ctx.fillRect(px, py, T, T);
      const vg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*0.7);
      vg.addColorStop(0, 'rgba(10,20,60,0.2)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vg; ctx.fillRect(px, py, T, T);
      break;
    }
  }
}

// ─── WALL ─────────────────────────────────────────────────────────────────────

function _drawWall(ctx, t, gx, gy, T, map) {
  const px   = gx * T, py = gy * T;
  const v    = t.visual || {};
  const wt   = v.wall || 'hull_plate';
  const zone = t.zone || '';

  const isOuterEdge = (gx === 0 || gx === map.width-1 || gy === 0 || gy === map.height-1);
  const cols = _wallColors(wt, isOuterEdge);

  // ── Front face — fills the tile square ────────────────────────────────────
  const fg = ctx.createLinearGradient(px, py, px, py+T);
  fg.addColorStop(0, cols.face1);
  fg.addColorStop(0.6, cols.face2);
  fg.addColorStop(1, cols.face3);
  ctx.fillStyle = fg;
  ctx.fillRect(px, py, T, T);

  // Wall texture
  _wallTexture(ctx, wt, px, py, T);

  // ── TOP FACE — drawn ABOVE the tile square, gives height illusion ──────────
  const topPy = py - WALL_H;
  const tg = ctx.createLinearGradient(px, topPy, px+T, topPy+WALL_H);
  tg.addColorStop(0, cols.top1);
  tg.addColorStop(1, cols.top2);
  ctx.fillStyle = tg;
  ctx.fillRect(px, topPy, T, WALL_H);

  // Top face — beveled edges
  ctx.fillStyle = cols.accent;
  ctx.fillRect(px, topPy, T, 1.5);     // top edge bright line
  ctx.fillRect(px, topPy, 1.5, WALL_H);// left edge bright line

  // Top face inner shadow (depth)
  const tis = ctx.createLinearGradient(px, topPy, px, topPy+WALL_H);
  tis.addColorStop(0, 'rgba(255,255,255,0.06)');
  tis.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = tis;
  ctx.fillRect(px, topPy, T, WALL_H);

  // Top face texture marks
  _wallTopTexture(ctx, wt, px, topPy, T, WALL_H);

  // ── RIGHT DEPTH FACE ────────────────────────────────────────────────────────
  const dg = ctx.createLinearGradient(px+T-WALL_D, py, px+T, py);
  dg.addColorStop(0, 'rgba(0,0,0,0)');
  dg.addColorStop(1, cols.depth);
  ctx.fillStyle = dg;
  ctx.fillRect(px+T-WALL_D, py-WALL_H, WALL_D, T+WALL_H);

  // ── BOTTOM EDGE shadow ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(px, py+T-2, T, 2);

  // ── Zone neon accent on top face ────────────────────────────────────────────
  const zc = ZONE_NEON[zone];
  if (zc) {
    ctx.fillStyle = _rgba(zc, 0.22);
    ctx.fillRect(px, topPy, T, WALL_H);
    ctx.fillStyle = _rgba(zc, 0.6);
    ctx.fillRect(px, topPy, T, 1);
  }

  // ── Cast shadow downward onto floor below ──────────────────────────────────
  const below = map.tiles[gy+1]?.[gx];
  if (below && below.type !== 'wall') {
    const sg = ctx.createLinearGradient(px, py+T, px, py+T+SHADOW_D);
    sg.addColorStop(0, 'rgba(0,0,0,0.6)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(px, py+T, T, SHADOW_D);
  }
}

function _wallColors(wt, isOuter) {
  switch(wt) {
    case 'corrugated':   return { face1:'#0e1c2c', face2:'#091420', face3:'#060e18', top1:'#253545', top2:'#182535', accent:'#3a5060', depth:'#04080c' };
    case 'pipe_bundle':  return { face1:'#0a1828', face2:'#071220', face3:'#050e18', top1:'#1e3050', top2:'#142240', accent:'#304880', depth:'#030810' };
    case 'rock':         return { face1:'#16120a', face2:'#0e0c06', face3:'#080604', top1:'#2a2216', top2:'#1c1810', accent:'#3a3020', depth:'#040302' };
    case 'civic_block':  return { face1:'#0e1840', face2:'#091030', face3:'#060c20', top1:'#1e2c60', top2:'#141e50', accent:'#304080', depth:'#040810' };
    default: // hull_plate
      return isOuter
        ? { face1:'#101e2e', face2:'#0a1420', face3:'#060c14', top1:'#283c54', top2:'#1a2c40', accent:'#3a5060', depth:'#03080e' }
        : { face1:'#0e1c2c', face2:'#091420', face3:'#060c18', top1:'#243850', top2:'#18283e', accent:'#344e68', depth:'#040810' };
  }
}

function _wallTexture(ctx, wt, px, py, T) {
  ctx.save();
  if (wt === 'corrugated') {
    ctx.strokeStyle = 'rgba(255,255,255,0.055)'; ctx.lineWidth = 1;
    for (let i = 6; i < T; i += 10) {
      ctx.beginPath(); ctx.moveTo(px+i, py); ctx.lineTo(px+i, py+T); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    for (let i = 11; i < T; i += 10) {
      ctx.beginPath(); ctx.moveTo(px+i, py); ctx.lineTo(px+i, py+T); ctx.stroke();
    }
  } else if (wt === 'pipe_bundle') {
    // Two horizontal pipes across the wall face
    for (const fy of [py + T*0.28, py + T*0.65]) {
      const pg = ctx.createLinearGradient(px, fy-5, px, fy+5);
      pg.addColorStop(0, 'rgba(30,60,100,0.7)');
      pg.addColorStop(0.35, 'rgba(80,130,200,0.45)');
      pg.addColorStop(0.6, 'rgba(20,50,90,0.5)');
      pg.addColorStop(1, 'rgba(5,15,30,0.6)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(px+3, fy-5, T-6, 10, 4); ctx.fill();
      ctx.fillStyle = 'rgba(160,210,255,0.12)';
      ctx.fillRect(px+4, fy-4, T-8, 2);
    }
  } else if (wt === 'rock') {
    // Irregular facet patches
    ctx.fillStyle = 'rgba(80,60,20,0.2)';
    ctx.fillRect(px+4, py+8, T*0.38, T*0.32);
    ctx.fillStyle = 'rgba(30,20,5,0.25)';
    ctx.fillRect(px+T*0.42, py+T*0.2, T*0.4, T*0.45);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px+T*0.28, py); ctx.lineTo(px+T*0.42, py+T*0.55); ctx.lineTo(px+T*0.62, py+T); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px+T*0.65, py+T*0.1); ctx.lineTo(px+T*0.55, py+T*0.6); ctx.stroke();
  } else if (wt === 'civic_block') {
    ctx.strokeStyle = 'rgba(60,80,160,0.18)'; ctx.lineWidth = 1;
    for (let i = py+12; i < py+T; i += 12) {
      ctx.beginPath(); ctx.moveTo(px, i); ctx.lineTo(px+T, i); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,60,180,0.08)';
    ctx.fillRect(px, py+T-8, T, 6);
  } else {
    // hull_plate — bolt pattern + panel seam
    ctx.strokeStyle = 'rgba(80,120,180,0.06)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px, py + T*0.5); ctx.lineTo(px+T, py + T*0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(80,120,160,0.2)';
    for (const [bx,by] of [[px+4,py+5],[px+T-6,py+5],[px+4,py+T-7],[px+T-6,py+T-7]]) {
      ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

function _wallTopTexture(ctx, wt, px, py, T, H) {
  ctx.save(); ctx.globalAlpha = 0.45;
  if (wt === 'corrugated') {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.7;
    for (let i = 8; i < T; i += 10) {
      ctx.beginPath(); ctx.moveTo(px+i, py); ctx.lineTo(px+i, py+H); ctx.stroke();
    }
  } else if (wt === 'pipe_bundle') {
    // Pipe cross-sections on top
    for (const fx of [px+T*0.2, px+T*0.55, px+T*0.8]) {
      const pg2 = ctx.createRadialGradient(fx, py+H/2, 0, fx, py+H/2, H*0.5);
      pg2.addColorStop(0, 'rgba(80,140,220,0.6)');
      pg2.addColorStop(1, 'rgba(20,60,120,0.3)');
      ctx.fillStyle = pg2;
      ctx.beginPath(); ctx.arc(fx, py+H/2, H*0.38, 0, Math.PI*2); ctx.fill();
    }
  } else if (wt === 'hull_plate') {
    ctx.strokeStyle = 'rgba(120,160,200,0.12)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px+T/2, py); ctx.lineTo(px+T/2, py+H); ctx.stroke();
  }
  ctx.restore();
}

// ─── OVERLAYS: PROPS / FX / MARKERS ──────────────────────────────────────────

function _drawOverlays(ctx, t, gx, gy, T, map, data) {
  const px = gx * T, py = gy * T;
  const v  = t.visual || {};

  // Atmospheric lighting pools per zone
  _drawZoneLighting(ctx, t, gx, gy, T, map);

  if (v.prop)  _drawProp(ctx, v.prop, px, py, T);
  if (v.fx)    _drawFX(ctx, v.fx, px, py, T, _t);
  if (v.decal) _drawDecal(ctx, v.decal, px, py, T);

  if (t.gameTable)  _drawTableMarker(ctx, px, py, T, t.gameTable, data);
  if (t.jukebox)    _drawJukeboxMarker(ctx, px, py, T);
  if (t.transition) _drawDoorMarker(ctx, px, py, T);
  else if (t.loot)   _drawLootMarker(ctx, px, py, T, t);
  else if (t.interact) _drawInteractMarker(ctx, px, py, T, t);

  if (t.cover) {
    ctx.strokeStyle = 'rgba(80,120,200,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px+3, py+3, T-6, T-6);
  }
}

function _drawZoneLighting(ctx, t, gx, gy, T, map) {
  const zone = t.zone || '';
  const px = gx * T, py = gy * T;

  // Bar/sump area — warm amber light pools
  if (!zone && (gy >= 19 && gy <= 28) && (gx >= 1 && gx <= 13)) {
    if ((gx + gy * 2) % 9 === 0) {
      const lg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*1.5);
      lg.addColorStop(0, 'rgba(200,120,20,0.09)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(px-T, py-T, T*3, T*3);
    }
  }
  // Berth area — cool blue-white lights
  if (!zone && gy <= 9) {
    if ((gx * 3 + gy) % 11 === 0) {
      const lg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*1.8);
      lg.addColorStop(0, 'rgba(80,140,220,0.07)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(px-T, py-T, T*3, T*3);
    }
  }
  // Civic zone — white/blue authority lighting
  if (zone === 'restricted_civic') {
    const lg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T);
    lg.addColorStop(0, 'rgba(140,160,255,0.06)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(px-T/2, py-T/2, T*2, T*2);
  }
  // Hostile zone — red ambient threat
  if (zone === 'hostile_reaver') {
    const lg = ctx.createRadialGradient(px+T/2, py+T/2, 0, px+T/2, py+T/2, T*1.2);
    lg.addColorStop(0, 'rgba(180,20,20,0.08)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(px-T/2, py-T/2, T*2, T*2);
  }
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

function _drawProp(ctx, prop, px, py, T) {
  ctx.save();
  switch(prop) {

    case 'crate': {
      const cx = px + T*0.12, cy = py + T*0.18, cw = T*0.52, ch = T*0.48;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(cx+4, cy+ch, cw-4, 5);
      ctx.fillRect(cx+cw, cy+5, 6, ch-4);
      // Body
      const bg = ctx.createLinearGradient(cx, cy, cx+cw, cy+ch);
      bg.addColorStop(0, '#5c4c28'); bg.addColorStop(0.5,'#48381c'); bg.addColorStop(1,'#30240e');
      ctx.fillStyle = bg; ctx.fillRect(cx, cy, cw, ch);
      // Top face
      const tg = ctx.createLinearGradient(cx, cy-8, cx+cw, cy);
      tg.addColorStop(0,'#7a6030'); tg.addColorStop(1,'#5c4824');
      ctx.fillStyle = tg; ctx.fillRect(cx, cy-7, cw, 7);
      // Plank lines
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.2;
      ctx.strokeRect(cx,cy,cw,ch);
      for (const fx of [cx+cw*0.33, cx+cw*0.66]) {
        ctx.beginPath(); ctx.moveTo(fx,cy); ctx.lineTo(fx,cy+ch); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx,cy+ch*0.5); ctx.lineTo(cx+cw,cy+ch*0.5); ctx.stroke();
      // Metal banding
      ctx.strokeStyle='rgba(100,80,30,0.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(cx,cy+ch*0.22); ctx.lineTo(cx+cw,cy+ch*0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy+ch*0.78); ctx.lineTo(cx+cw,cy+ch*0.78); ctx.stroke();
      // Highlight
      ctx.fillStyle='rgba(255,220,120,0.06)';
      ctx.fillRect(cx,cy-7,cw,ch*0.25+7);
      break;
    }

    case 'barrel': {
      const bx = px+T*0.55, by = py+T*0.15, bw = T*0.3, bh = T*0.6;
      // Shadow
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(bx+bw/2+3, by+bh+2, bw*0.5, 4, 0, 0, Math.PI*2); ctx.fill();
      // Body gradient (cylindrical)
      const bg = ctx.createLinearGradient(bx, by, bx+bw, by);
      bg.addColorStop(0,'#2a3840'); bg.addColorStop(0.2,'#3c5060'); bg.addColorStop(0.5,'#4a6070');
      bg.addColorStop(0.75,'#2a3840'); bg.addColorStop(1,'#151e24');
      ctx.fillStyle=bg; ctx.fillRect(bx,by,bw,bh);
      // Bands
      ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=1.5;
      for (const fy of [by+bh*0.2, by+bh*0.5, by+bh*0.78]) {
        ctx.beginPath(); ctx.moveTo(bx,fy); ctx.lineTo(bx+bw,fy); ctx.stroke();
        ctx.strokeStyle='rgba(100,140,180,0.2)'; ctx.lineWidth=0.7;
        ctx.beginPath(); ctx.moveTo(bx,fy+1.5); ctx.lineTo(bx+bw,fy+1.5); ctx.stroke();
        ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=1.5;
      }
      // Top
      const tg = ctx.createLinearGradient(bx, by-6, bx+bw, by);
      tg.addColorStop(0,'#3a5060'); tg.addColorStop(1,'#1e2e38');
      ctx.fillStyle=tg; ctx.fillRect(bx, by-5, bw, 5);
      ctx.strokeStyle='rgba(80,120,160,0.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(bx,by-5); ctx.lineTo(bx+bw,by-5); ctx.stroke();
      break;
    }

    case 'terminal': {
      const tx=px+T*0.08, ty=py+T*0.06, tw=T*0.7, th=T*0.55;
      // Body
      ctx.fillStyle='#0a1520'; ctx.fillRect(tx,ty,tw,th);
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=1.5; ctx.strokeRect(tx,ty,tw,th);
      // Screen
      const scx=tx+4, scy=ty+4, scw=tw-8, sch=th-14;
      ctx.fillStyle='#040c18'; ctx.fillRect(scx,scy,scw,sch);
      // Screen glow
      const sg = ctx.createRadialGradient(scx+scw/2,scy+sch/2,0,scx+scw/2,scy+sch/2,scw/2);
      sg.addColorStop(0,'rgba(0,180,255,0.25)'); sg.addColorStop(0.6,'rgba(0,80,200,0.1)'); sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sg; ctx.fillRect(scx,scy,scw,sch);
      // Scanlines
      ctx.strokeStyle='rgba(0,180,255,0.06)'; ctx.lineWidth=0.8;
      for (let i=scy+2; i<scy+sch-2; i+=3) { ctx.beginPath(); ctx.moveTo(scx+1,i); ctx.lineTo(scx+scw-1,i); ctx.stroke(); }
      // Text lines
      ctx.fillStyle='rgba(0,220,255,0.5)';
      ctx.fillRect(scx+3, scy+4, scw*0.7, 2);
      ctx.fillRect(scx+3, scy+9, scw*0.5, 2);
      ctx.fillRect(scx+3, scy+14, scw*0.6, 2);
      // Cursor blink
      if (Math.sin(_t*4) > 0) { ctx.fillStyle='rgba(0,255,200,0.8)'; ctx.fillRect(scx+3,scy+20,6,3); }
      // Base
      ctx.fillStyle='#0c1828'; ctx.fillRect(tx+tw*0.25,ty+th,tw*0.5,5);
      // Status lights
      for (const [lx,lc] of [[tx+3,'#00ff88'],[tx+9,'#ffcc00'],[tx+15,'rgba(255,80,80,0.3)']]) {
        ctx.fillStyle=lc; ctx.beginPath(); ctx.arc(lx,ty+th-5,2,0,Math.PI*2); ctx.fill();
      }
      break;
    }

    case 'cable_bundle': {
      const cables = [
        {x:px+3, c:'#1a2a3a', w:3},
        {x:px+7, c:'#0f2030', w:2},
        {x:px+11,c:'#152535', w:2.5},
        {x:px+15,c:'#101820', w:2},
      ];
      for (const cab of cables) {
        ctx.strokeStyle=cab.c; ctx.lineWidth=cab.w;
        ctx.beginPath();
        ctx.moveTo(cab.x, py);
        ctx.bezierCurveTo(cab.x+2, py+T*0.3, cab.x-2, py+T*0.6, cab.x, py+T);
        ctx.stroke();
      }
      // Zip tie
      ctx.fillStyle='rgba(180,200,220,0.3)'; ctx.lineWidth=1.5;
      ctx.fillRect(px+1,py+T*0.45,17,5);
      ctx.strokeStyle='rgba(200,220,240,0.2)'; ctx.lineWidth=1;
      ctx.strokeRect(px+1,py+T*0.45,17,5);
      break;
    }

    case 'sign_neon': {
      const sx=px+T*0.04, sy=py+T*0.06, sw=T*0.92, sh=T*0.38;
      ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(sx,sy,sw,sh);
      const pulse = 0.75 + 0.25*Math.sin(_t*1.8);
      // Glow
      ctx.shadowColor=C.pink; ctx.shadowBlur=12*pulse;
      ctx.strokeStyle=_rgba(C.pink,pulse); ctx.lineWidth=1.5;
      ctx.strokeRect(sx+1,sy+1,sw-2,sh-2);
      ctx.shadowBlur=0;
      // Bar text (pixel style)
      ctx.fillStyle=_rgba(C.pink,pulse*0.85);
      const lx=sx+sw*0.12, ly=sy+sh*0.2, lh=sh*0.6;
      // B — two rectangles
      ctx.fillRect(lx,ly,3,lh); ctx.fillRect(lx,ly,8,2); ctx.fillRect(lx,ly+lh/2-1,8,2); ctx.fillRect(lx,ly+lh-2,8,2);
      ctx.fillRect(lx+3,ly,5,lh/2-1); ctx.fillRect(lx+3,ly+lh/2+1,5,lh/2-2);
      // A
      ctx.fillRect(lx+12,ly,3,lh); ctx.fillRect(lx+19,ly,3,lh);
      ctx.fillRect(lx+12,ly,10,2); ctx.fillRect(lx+12,ly+lh*0.45,10,2);
      // R
      ctx.fillRect(lx+26,ly,3,lh); ctx.fillRect(lx+26,ly,10,2); ctx.fillRect(lx+26,ly+lh*0.45,10,2);
      ctx.fillRect(lx+33,ly,3,lh*0.45+2); ctx.fillRect(lx+30,ly+lh*0.45,5,lh*0.55);
      break;
    }

    case 'debris': {
      ctx.fillStyle='rgba(50,60,70,0.65)';
      const pieces=[[px+T*0.15,py+T*0.55,8,3,0.2],[px+T*0.4,py+T*0.45,5,5,0.5],[px+T*0.65,py+T*0.65,7,2,0.1],[px+T*0.55,py+T*0.35,3,6,-0.3]];
      for (const [dx,dy,dw,dh,dr] of pieces) {
        ctx.save(); ctx.translate(dx+dw/2,dy+dh/2); ctx.rotate(dr);
        ctx.fillRect(-dw/2,-dh/2,dw,dh); ctx.restore();
      }
      ctx.fillStyle='rgba(80,90,100,0.4)';
      for (const [dx,dy,dr] of [[px+T*0.3,py+T*0.6,2],[px+T*0.7,py+T*0.4,1.5],[px+T*0.2,py+T*0.75,1.8]]) {
        ctx.beginPath(); ctx.arc(dx,dy,dr,0,Math.PI*2); ctx.fill();
      }
      break;
    }

    case 'chem_tank': {
      const tx2=px+T*0.52, ty2=py+T*0.08, tw2=T*0.34, th2=T*0.75;
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.fillRect(tx2+3,ty2+th2,tw2-3,5);
      const tg2=ctx.createLinearGradient(tx2,ty2,tx2+tw2,ty2);
      tg2.addColorStop(0,'#152a18'); tg2.addColorStop(0.3,'#1e3c20'); tg2.addColorStop(0.7,'#122418'); tg2.addColorStop(1,'#0a1810');
      ctx.fillStyle=tg2; ctx.fillRect(tx2,ty2,tw2,th2);
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
      for (let i=0.2; i<0.9; i+=0.18) { ctx.beginPath(); ctx.moveTo(tx2,ty2+th2*i); ctx.lineTo(tx2+tw2,ty2+th2*i); ctx.stroke(); }
      ctx.fillStyle='rgba(180,200,30,0.22)'; ctx.fillRect(tx2+2,ty2+th2*0.32,tw2-4,th2*0.22);
      ctx.strokeStyle='rgba(180,200,30,0.5)'; ctx.lineWidth=0.8; ctx.strokeRect(tx2+2,ty2+th2*0.32,tw2-4,th2*0.22);
      ctx.fillStyle='#0e1e12'; ctx.fillRect(tx2-2,ty2,tw2+4,6);
      ctx.fillStyle='#0e2012'; ctx.fillRect(tx2-2,ty2+th2,tw2+4,4);
      break;
    }
  }
  ctx.restore();
}

// ─── FX ───────────────────────────────────────────────────────────────────────

function _drawFX(ctx, fx, px, py, T, t) {
  ctx.save();
  switch(fx) {

    case 'steam_vent': {
      const puffs=4;
      for (let i=0; i<puffs; i++) {
        const phase=((t*0.7 + i/puffs) % 1);
        const pY=py+T - phase*T*1.1;
        const alpha=phase<0.3 ? phase/0.3*0.4 : (1-phase)*0.4;
        const r=4+phase*14;
        const sg=ctx.createRadialGradient(px+T/2,pY,0,px+T/2,pY,r);
        sg.addColorStop(0,`rgba(200,220,255,${alpha})`); sg.addColorStop(1,'rgba(200,220,255,0)');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(px+T/2,pY,r,0,Math.PI*2); ctx.fill();
      }
      // Vent grate
      ctx.fillStyle='rgba(30,45,65,0.8)';
      ctx.fillRect(px+T*0.28,py+T*0.82,T*0.44,5);
      ctx.strokeStyle='rgba(60,90,130,0.5)'; ctx.lineWidth=0.8;
      for (let i=0;i<5;i++) { const vx=px+T*0.3+i*(T*0.4/4); ctx.beginPath(); ctx.moveTo(vx,py+T*0.82); ctx.lineTo(vx,py+T*0.82+5); ctx.stroke(); }
      break;
    }

    case 'neon_glow': {
      const p=0.65+0.35*Math.sin(t*1.4);
      const ng=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.65);
      ng.addColorStop(0,`rgba(255,20,100,${0.18*p})`); ng.addColorStop(0.5,`rgba(200,10,80,${0.08*p})`); ng.addColorStop(1,'rgba(255,20,100,0)');
      ctx.fillStyle=ng; ctx.fillRect(px,py,T,T);
      break;
    }

    case 'flicker': {
      const flicker=Math.sin(t*9)>-0.8 && Math.sin(t*16)>-0.6;
      if (flicker) {
        const fl=ctx.createRadialGradient(px+T/2,py+4,0,px+T/2,py+T*0.6,T*0.55);
        fl.addColorStop(0,'rgba(230,220,160,0.2)'); fl.addColorStop(1,'rgba(230,220,160,0)');
        ctx.fillStyle=fl; ctx.fillRect(px,py,T,T);
        ctx.fillStyle='rgba(255,240,180,0.7)';
        ctx.beginPath(); ctx.arc(px+T/2,py+4,2.5,0,Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle='rgba(80,80,60,0.3)';
        ctx.beginPath(); ctx.arc(px+T/2,py+4,2.5,0,Math.PI*2); ctx.fill();
      }
      break;
    }

    case 'red_light': {
      const p=0.4+0.6*Math.abs(Math.sin(t*1.1));
      const rl=ctx.createRadialGradient(px+T*0.82,py+T*0.12,0,px+T*0.82,py+T*0.12,T*0.6);
      rl.addColorStop(0,`rgba(255,20,20,${0.3*p})`); rl.addColorStop(1,'rgba(255,20,20,0)');
      ctx.fillStyle=rl; ctx.fillRect(px,py,T,T);
      ctx.fillStyle=`rgba(255,20,20,${0.85*p})`;
      ctx.shadowColor='#ff0000'; ctx.shadowBlur=8*p;
      ctx.beginPath(); ctx.arc(px+T*0.82,py+T*0.12,3,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      break;
    }

    case 'sparks': {
      if (Math.sin(t*8)>0.9) {
        ctx.shadowColor='#ffaa20'; ctx.shadowBlur=6;
        ctx.fillStyle='rgba(255,180,40,0.9)';
        ctx.beginPath(); ctx.arc(px+T*0.28,py+T*0.5,3,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0;
        for (let i=0;i<5;i++) {
          const ang=i/5*Math.PI*2+t*8;
          const d=5+Math.random()*10;
          ctx.fillStyle=`rgba(255,${160+Math.random()*80|0},20,0.8)`;
          ctx.fillRect(px+T*0.28+Math.cos(ang)*d,py+T*0.5+Math.sin(ang)*d,2,2);
        }
      }
      break;
    }

    case 'drip': {
      const ph=(t*0.35)%1;
      const dY=py+ph*T;
      const alpha=ph<0.15?ph/0.15:ph>0.85?(1-ph)/0.15:1;
      ctx.fillStyle=`rgba(80,120,200,${alpha*0.7})`;
      ctx.beginPath(); ctx.arc(px+T*0.38,dY,2,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=`rgba(80,120,200,${alpha*0.25})`; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+T*0.38,py); ctx.lineTo(px+T*0.38,dY); ctx.stroke();
      break;
    }

    case 'haze': {
      ctx.fillStyle=`rgba(50,55,70,${0.1+0.04*Math.sin(t*0.4)})`;
      ctx.fillRect(px,py,T,T);
      break;
    }
  }
  ctx.restore();
}

// ─── DECALS ───────────────────────────────────────────────────────────────────

function _drawDecal(ctx, decal, px, py, T) {
  ctx.save(); ctx.globalAlpha=0.7;
  switch(decal) {
    case 'hazard_strip':
      for (let i=0;i<T;i+=10) {
        ctx.fillStyle=i%20<10?'rgba(255,200,0,0.35)':'rgba(0,0,0,0.2)';
        ctx.fillRect(px+i,py+T-6,10,6);
      }
      break;
    case 'civic_stripe':
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(px,py+T-5,T,2);
      ctx.fillStyle='rgba(255,210,0,0.3)'; ctx.fillRect(px,py+T-7,T,3);
      break;
    case 'blood_stain':
      const bs=ctx.createRadialGradient(px+T*0.3,py+T*0.6,0,px+T*0.3,py+T*0.6,T*0.22);
      bs.addColorStop(0,'rgba(130,15,15,0.55)'); bs.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=bs; ctx.fillRect(px,py,T,T);
      ctx.fillStyle='rgba(100,10,10,0.4)';
      ctx.beginPath(); ctx.ellipse(px+T*0.55,py+T*0.5,T*0.06,T*0.04,-0.4,0,Math.PI*2); ctx.fill();
      break;
    case 'graffiti':
      ctx.fillStyle='rgba(180,40,180,0.35)';
      ctx.font=`bold ${T*0.22}px monospace`; ctx.textAlign='right'; ctx.textBaseline='top';
      ctx.fillText('VR', px+T-3, py+3);
      break;
    case 'worn_number':
      ctx.fillStyle='rgba(90,110,150,0.35)';
      ctx.font=`bold ${T*0.2}px monospace`; ctx.textAlign='left'; ctx.textBaseline='bottom';
      ctx.fillText('B'+(px%10+1|0), px+3, py+T-2);
      break;
    case 'boot_prints':
      ctx.fillStyle='rgba(25,30,40,0.55)';
      ctx.beginPath(); ctx.ellipse(px+T*0.35,py+T*0.4,4,7,0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px+T*0.55,py+T*0.65,4,7,0.5,0,Math.PI*2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ─── SPECIAL MARKERS ─────────────────────────────────────────────────────────

function _drawTableMarker(ctx, px, py, T, tableId, data) {
  const table=(data?.tables||[]).find(t=>t.id===tableId);
  const type=table?.type||'card';
  const color=type==='slot'?C.gold:type==='other'?C.green:C.cyan;
  const pulse=0.75+0.25*Math.sin(_t*1.5);
  ctx.save();
  const gg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.6);
  gg.addColorStop(0,_rgba(color,0.2*pulse)); gg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gg; ctx.fillRect(px,py,T,T);
  ctx.shadowColor=color; ctx.shadowBlur=6*pulse;
  ctx.font=`${T*0.4}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(color,0.9);
  ctx.fillText(type==='slot'?'⬡':type==='other'?'◈':'◈', px+T/2, py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _drawJukeboxMarker(ctx, px, py, T) {
  const p=0.7+0.3*Math.sin(_t*2);
  ctx.save();
  const gg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.6);
  gg.addColorStop(0,_rgba(C.pink,0.22*p)); gg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gg; ctx.fillRect(px,py,T,T);
  ctx.shadowColor=C.pink; ctx.shadowBlur=10*p;
  ctx.font=`${T*0.45}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(C.pink,0.95);
  ctx.fillText('♪', px+T/2, py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _drawDoorMarker(ctx, px, py, T) {
  ctx.save();
  ctx.fillStyle=_rgba(C.gold,0.1);
  ctx.fillRect(px+3,py+3,T-6,T-6);
  ctx.strokeStyle=_rgba(C.gold,0.6); ctx.lineWidth=1.5;
  ctx.strokeRect(px+3,py+3,T-6,T-6);
  ctx.shadowColor=C.gold; ctx.shadowBlur=4;
  ctx.font=`${T*0.38}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(C.gold,0.85); ctx.fillText('▶', px+T/2, py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _drawLootMarker(ctx, px, py, T, t) {
  ctx.save();
  ctx.shadowColor='#c8a040'; ctx.shadowBlur=4;
  ctx.font=`${T*0.35}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#c8a040';
  ctx.fillText('▩', px+T/2, py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _drawInteractMarker(ctx, px, py, T, tile) {
  const txt=(tile.interactText||'').toLowerCase();
  const color=txt.includes('terminal')||txt.includes('console')?C.cyan:txt.includes('door')||txt.includes('hatch')?C.gold:'#6688aa';
  ctx.save();
  ctx.shadowColor=color; ctx.shadowBlur=3;
  ctx.font=`${T*0.3}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=color; ctx.fillText('⬡', px+T/2, py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

// ─── ACTORS ───────────────────────────────────────────────────────────────────

function _drawActor(ctx, actor, state, T) {
  const px=actor.x*T, py=actor.y*T;
  const cx=px+T/2, cy=py+T/2;
  const isSelected=state.selectedActorId===actor.id;
  const isCurrent=state.combat.active&&state.combat.turnOrder[state.combat.currentTurnIndex]===actor.id;
  const isAI=state.combat.aiActingId===actor.id;
  const isStealthed=actor.statuses.includes('stealthed');
  const hpPct=Math.max(0,actor.hp/actor.hpMax);

  const COLORS={
    player: {body:'#1a3562',rim:'#4a88d8',glow:'#6fb3ff',name:'player'},
    ally:   {body:'#183620',rim:'#38a858',glow:'#7ed9a0',name:'ally'},
    enemy:  {body:'#420e0e',rim:'#c03030',glow:'#ff6060',name:'enemy'},
    neutral:{body:'#342e10',rim:'#a07820',glow:'#ccaa55',name:'neutral'},
  };
  const col=COLORS[actor.role]||COLORS.neutral;

  ctx.save();
  if (isStealthed) ctx.globalAlpha=0.38;
  if (actor.downed) { ctx.globalAlpha=0.4; ctx.filter='grayscale(1)'; }

  // AI bounce
  let offY=0;
  if (isAI) offY=-Math.abs(Math.sin(_t*5))*5;

  // Ground shadow ellipse
  const sg=ctx.createRadialGradient(cx,py+T-5,0,cx,py+T-5,T*0.42);
  sg.addColorStop(0,'rgba(0,0,0,0.55)'); sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;
  ctx.beginPath(); ctx.ellipse(cx,py+T-5,T*0.38,5,0,0,Math.PI*2); ctx.fill();

  // Selection ring
  if (isSelected) {
    const sp=0.6+0.4*Math.abs(Math.sin(_t*2.5));
    ctx.strokeStyle=_rgba(col.glow,sp); ctx.lineWidth=2;
    ctx.shadowColor=col.glow; ctx.shadowBlur=10*sp;
    ctx.strokeRect(px-1,py-1+offY,T+2,T+2);
    ctx.shadowBlur=0;
  }

  // Body dimensions
  const bodyW=T*0.52, bodyH=T*0.55;
  const bodyX=cx-bodyW/2, bodyY=py+T*0.38+offY;
  const headR=T*0.175, headY=py+T*0.26+offY;

  // Body shadow (left side dark)
  const bg=ctx.createLinearGradient(bodyX,bodyY,bodyX+bodyW,bodyY+bodyH);
  bg.addColorStop(0,_lighten(col.body,0.35));
  bg.addColorStop(0.3,col.body);
  bg.addColorStop(1,_darken(col.body,0.5));
  ctx.fillStyle=bg; ctx.fillRect(bodyX,bodyY,bodyW,bodyH);
  ctx.strokeStyle=col.rim; ctx.lineWidth=1.2;
  ctx.strokeRect(bodyX,bodyY,bodyW,bodyH);
  // Body highlight
  ctx.fillStyle='rgba(255,255,255,0.08)';
  ctx.fillRect(bodyX,bodyY,bodyW*0.38,bodyH);

  // Class detail on body
  _actorClassDetail(ctx, actor.classId, bodyX, bodyY, bodyW, bodyH, cx, col, offY);

  // Head
  const hg=ctx.createRadialGradient(cx-headR*0.2,headY-headR*0.2,0,cx,headY,headR);
  hg.addColorStop(0,_lighten(col.body,0.55)); hg.addColorStop(1,col.body);
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(cx,headY,headR,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=col.rim; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.arc(cx,headY,headR,0,Math.PI*2); ctx.stroke();
  // Head highlight
  ctx.fillStyle='rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.arc(cx-headR*0.28,headY-headR*0.28,headR*0.42,0,Math.PI*2); ctx.fill();

  // Current turn glow
  if (isCurrent&&!isAI) {
    const tp=0.5+0.5*Math.abs(Math.sin(_t*2));
    ctx.strokeStyle=_rgba(col.glow,tp); ctx.lineWidth=1.5;
    ctx.shadowColor=col.glow; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(cx,py+T*0.5+offY,T*0.46,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
  }

  // AI glow
  if (isAI) {
    ctx.strokeStyle=_rgba(C.gold,0.9); ctx.lineWidth=2;
    ctx.shadowColor=C.gold; ctx.shadowBlur=14;
    ctx.strokeRect(px-2,py-2+offY,T+4,T+4);
    ctx.shadowBlur=0;
  }

  // HP bar
  const bY=py+T-6, bW=T-4;
  ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(px+2,bY,bW,4);
  const hpC=hpPct>0.6?'#4aff9a':hpPct>0.3?'#ffcc5a':'#ff4444';
  ctx.fillStyle=hpC;
  ctx.shadowColor=hpC; ctx.shadowBlur=4;
  ctx.fillRect(px+2,bY,bW*hpPct,4);
  ctx.shadowBlur=0;

  // Name label above head (small, dim)
  ctx.fillStyle='rgba(200,220,255,0.65)';
  ctx.font=`${T*0.15}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText(actor.name.split(' ')[0], cx, py+headY-headR-2+offY);

  ctx.restore();
}

function _actorClassDetail(ctx, classId, bx, by, bw, bh, cx, col, offY) {
  ctx.save();
  switch(classId) {
    case 'marshal':
      // Gun held forward
      ctx.fillStyle=_rgba(col.rim,0.8); ctx.lineWidth=2; ctx.strokeStyle=col.rim;
      ctx.fillRect(bx+bw-1,by+bh*0.15,10,5);
      ctx.fillRect(bx+bw+9,by+bh*0.12,3,3);
      break;
    case 'voidseer':
      // Aura ring
      ctx.strokeStyle=_rgba('#c040ff',0.45); ctx.lineWidth=1.5;
      ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.arc(cx,by+bh*0.35+offY,bw*0.72,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      // Eye glow
      ctx.fillStyle='rgba(180,60,255,0.7)';
      ctx.beginPath(); ctx.arc(cx,by+offY-6,2,0,Math.PI*2); ctx.fill();
      break;
    case 'raider':
      // Shoulder spikes
      ctx.fillStyle=_rgba(col.rim,0.7);
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx-6,by-8); ctx.lineTo(bx+6,by); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx+bw,by); ctx.lineTo(bx+bw+6,by-8); ctx.lineTo(bx+bw-6,by); ctx.fill();
      break;
    case 'salvager':
      // Tool/wrench on back
      ctx.strokeStyle='rgba(80,100,120,0.6)'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(bx+bw*0.78,by-5); ctx.lineTo(bx+bw*0.78,by+bh*0.5); ctx.stroke();
      ctx.fillStyle='rgba(80,100,120,0.5)';
      ctx.fillRect(bx+bw*0.72,by-5,12,5);
      break;
  }
  ctx.restore();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _rgba(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function _darken(hex, f) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `#${Math.max(0,r*(1-f)|0).toString(16).padStart(2,'0')}${Math.max(0,g*(1-f)|0).toString(16).padStart(2,'0')}${Math.max(0,b*(1-f)|0).toString(16).padStart(2,'0')}`;
}
function _lighten(hex, f) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `#${Math.min(255,r+(255-r)*f|0).toString(16).padStart(2,'0')}${Math.min(255,g+(255-g)*f|0).toString(16).padStart(2,'0')}${Math.min(255,b+(255-b)*f|0).toString(16).padStart(2,'0')}`;
}
