/**
 * MapRenderer.js — Sprite-based canvas renderer for Spaced
 * =========================================================
 * Uses real PNG sprites from tilesets.json.
 * Falls back to procedural drawing when sprites aren't loaded yet.
 * All gameplay logic (grid, collision, clicks) is unchanged.
 */

// ─── SPRITE CACHE ─────────────────────────────────────────────────────────────

const _imgCache = {};   // path → HTMLImageElement (or null if failed)
const _loading  = {};   // path → true (in flight)

function _img(path) {
  if (!path) return null;
  if (_imgCache[path] !== undefined) return _imgCache[path];
  if (_loading[path]) return null;
  _loading[path] = true;
  const im = new Image();
  im.onload  = () => { _imgCache[path] = im; delete _loading[path]; };
  im.onerror = () => { _imgCache[path] = null; delete _loading[path]; };
  im.src = path;
  return null;
}

function _preloadTileset(ts) {
  if (!ts) return;
  const ap = ts.assetPath || 'assets/';
  const load = (rel) => rel && _img(ap + rel);
  for (const f of Object.values(ts.floors  || {})) { load(f.image); }
  for (const w of Object.values(ts.walls   || {})) { load(w.imageH); load(w.imageV); }
  for (const p of Object.values(ts.props   || {})) { load(p.image); }
  for (const a of Object.values(ts.actors  || {})) { load(a.image); }
  for (const x of Object.values(ts.fx      || {})) {
    if (x.frames) {
      for (let i = 0; i < (x.frameCount||4); i++)
        load(x.frames.replace('{n}', i));
    }
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const WALL_H   = 24;
const SHADOW_D = 14;

const C = {
  fMetal:'#18232f', fGrate:'#0e1620', fConcrete:'#161d28',
  fStained:'#111318', fCivic:'#151d3a', fVoid:'#040608',
  wTop:'#2c4060', wFace:'#0e1824', wDepth:'#060e16', wAccent:'#3a5580',
  pink:'#ff2070', cyan:'#00d4ff', gold:'#ffcc00', green:'#00ff88',
  purple:'#c040ff', orange:'#ff6a00', red:'#ff2020',
  fog:'#06090e',
};

const ZONE_NEON = {
  restricted_impound: C.orange,
  restricted_civic:   C.cyan,
  hostile_reaver:     C.red,
  transition_ab:      C.gold,
  transition_bc:      C.gold,
  transition_ac:      C.gold,
};

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _canvas = null, _ctx = null, _animId = null, _t = 0, _getState = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function initMapRenderer(tileLayerEl) {
  if (_canvas) { _canvas.remove(); cancelAnimationFrame(_animId); }
  _canvas = document.createElement('canvas');
  _canvas.id = 'mapCanvas';
  _canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
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
        // Preload tileset sprites
        const ts = (data.tilesets||[]).find(t => t.id === map.tileset);
        if (ts) _preloadTileset(ts);
        _drawFrame(map, state, data, api, ts);
      }
    } catch(e) { console.warn('MapRenderer:', e); }
    _animId = requestAnimationFrame(loop);
  }
  _animId = requestAnimationFrame(loop);
}

export function stopMapRenderLoop() { cancelAnimationFrame(_animId); }
export function renderMapCanvas(map, state, data, api) {
  const ts = (data?.tilesets||[]).find(t => t.id === map?.tileset);
  if (_canvas && _ctx && map) _drawFrame(map, state, data, api, ts);
}
export function renderEntitiesCanvas() {} // actors drawn in main loop

// ─── MAIN FRAME ───────────────────────────────────────────────────────────────

function _drawFrame(map, state, data, api, ts) {
  const T = data?.config?.map?.tileSize || 56;
  const W = map.width * T, H = map.height * T;
  if (_canvas.width !== W || _canvas.height !== H) {
    _canvas.width = W; _canvas.height = H;
  }
  const ctx = _ctx;
  ctx.fillStyle = C.fog;
  ctx.fillRect(0, 0, W, H);

  // Pass 1: floors
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type === 'wall') continue;
      api.isTileRevealed(x,y) ? _drawFloor(ctx,t,x,y,T,map,ts) : _drawFog(ctx,x,y,T);
    }

  // Pass 2: walls
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type !== 'wall') continue;
      api.isTileRevealed(x,y) ? _drawWall(ctx,t,x,y,T,map,ts) : _drawFog(ctx,x,y,T);
    }

  // Pass 3: overlays (props, fx, markers)
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y]?.[x];
      if (!t || t.type === 'wall' || !api.isTileRevealed(x,y)) continue;
      _drawOverlays(ctx,t,x,y,T,map,data,ts);
    }

  // Pass 4: actors (sorted by Y)
  const actors = state.roster.filter(a => a.mapId === state.mapId && !a.dead);
  actors.sort((a,b) => a.y - b.y);
  for (const actor of actors) {
    if (!api.isTileRevealed(actor.x, actor.y) && !state.party.includes(actor.id)) continue;
    _drawActor(ctx, actor, state, T, ts);
  }
}

// ─── FOG ──────────────────────────────────────────────────────────────────────

function _drawFog(ctx, gx, gy, T) {
  ctx.fillStyle = '#050810';
  ctx.fillRect(gx*T, gy*T, T, T);
}

// ─── FLOOR ────────────────────────────────────────────────────────────────────

function _drawFloor(ctx, t, gx, gy, T, map, ts) {
  const px = gx*T, py = gy*T;
  const v  = t.visual || {};
  const flKey = v.floor || _inferFloor(t);
  const flDef = ts?.floors?.[flKey];
  const ap    = ts?.assetPath || 'assets/';
  const img   = flDef?.image ? _img(ap + flDef.image) : null;

  if (img) {
    // Draw real sprite scaled to tile size
    ctx.drawImage(img, px, py, T, T);
  } else {
    // Procedural fallback
    _floorProc(ctx, flKey, px, py, T);
  }

  // Wall shadow from above
  if (map.tiles[gy-1]?.[gx]?.type === 'wall') {
    const sg = ctx.createLinearGradient(px,py,px,py+SHADOW_D);
    sg.addColorStop(0,'rgba(0,0,0,0.7)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg; ctx.fillRect(px,py,T,SHADOW_D);
  }
  // Wall shadow from left
  if (map.tiles[gy]?.[gx-1]?.type === 'wall') {
    const sg = ctx.createLinearGradient(px,py,px+SHADOW_D*0.8,py);
    sg.addColorStop(0,'rgba(0,0,0,0.5)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg; ctx.fillRect(px,py,SHADOW_D*0.8,T);
  }

  // Zone tint
  const zc = ZONE_NEON[t.zone||''];
  if (zc) {
    ctx.fillStyle=_rgba(zc,0.07); ctx.fillRect(px,py,T,T);
    if (map.tiles[gy-1]?.[gx]?.zone !== t.zone) {
      ctx.fillStyle=_rgba(zc,0.35); ctx.fillRect(px,py,T,2);
    }
  }

  // Zone ambient light pools
  _zoneLighting(ctx, t, gx, gy, T, map);

  // Decal
  if (v.decal) _drawDecal(ctx, v.decal, px, py, T);

  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.02)'; ctx.lineWidth=0.5;
  ctx.strokeRect(px+0.5,py+0.5,T-1,T-1);
}

function _inferFloor(t) {
  const m = {metal:'metal_plate',floor:'concrete',dirt:'concrete',sand:'metal_plate',toxic:'void'};
  return m[t.type] || 'metal_plate';
}

function _floorProc(ctx, fl, px, py, T) {
  const colors = {
    metal_plate:'#18232f', metal_grate:'#0e1620', concrete:'#161d28',
    stained:'#111318', civic_tile:'#151d3a', void:'#040608',
  };
  ctx.fillStyle = colors[fl] || '#141820';
  ctx.fillRect(px, py, T, T);
  // Minimal texture hint
  ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=0.5;
  ctx.strokeRect(px+0.5,py+0.5,T-1,T-1);
}

// ─── WALL ─────────────────────────────────────────────────────────────────────

function _drawWall(ctx, t, gx, gy, T, map, ts) {
  const px = gx*T, py = gy*T;
  const v  = t.visual || {};
  const wKey = v.wall || 'hull_plate';
  const wDef = ts?.walls?.[wKey];
  const ap   = ts?.assetPath || 'assets/';

  // Determine orientation: wall is vertical if neighbors above/below are also walls
  const wallAbove = map.tiles[gy-1]?.[gx]?.type === 'wall';
  const wallBelow = map.tiles[gy+1]?.[gx]?.type === 'wall';
  const wallLeft  = map.tiles[gy]?.[gx-1]?.type === 'wall';
  const wallRight = map.tiles[gy]?.[gx+1]?.type === 'wall';
  const isVertical = (wallAbove || wallBelow) && !(wallLeft || wallRight);

  const imgPath = isVertical ? wDef?.imageV : wDef?.imageH;
  const img = imgPath ? _img(ap + imgPath) : null;

  if (img) {
    // Real sprite — draw face (full tile)
    ctx.drawImage(img, px, py, T, T);

    // Top face overlay — drawn above the tile
    ctx.save();
    ctx.globalAlpha = 0.85;
    const tg = ctx.createLinearGradient(px, py-WALL_H, px+T, py);
    tg.addColorStop(0,'rgba(50,80,120,0.9)');
    tg.addColorStop(1,'rgba(20,40,70,0.7)');
    ctx.fillStyle = tg;
    ctx.fillRect(px, py-WALL_H, T, WALL_H);

    // Draw scaled-down version of the same sprite as the top face
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, px, py-WALL_H, T, WALL_H);
    ctx.globalAlpha = 1;

    // Top face highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px, py-WALL_H, T, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px, py-WALL_H, 2, WALL_H);
    ctx.restore();

    // Right depth shadow
    const dg = ctx.createLinearGradient(px+T-8,py,px+T,py);
    dg.addColorStop(0,'rgba(0,0,0,0)'); dg.addColorStop(1,'rgba(0,0,0,0.6)');
    ctx.fillStyle=dg; ctx.fillRect(px+T-8,py-WALL_H,8,T+WALL_H);

    // Bottom edge darkening
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.fillRect(px,py+T-3,T,3);

  } else {
    // Procedural fallback
    _wallProc(ctx, wKey, px, py, T, map, gx, gy, isVertical);
  }

  // Zone accent on top face
  const zc = ZONE_NEON[t.zone||''];
  if (zc) {
    ctx.fillStyle=_rgba(zc,0.25); ctx.fillRect(px,py-WALL_H,T,WALL_H);
    ctx.fillStyle=_rgba(zc,0.7);  ctx.fillRect(px,py-WALL_H,T,1.5);
  }

  // Shadow onto floor below
  const below = map.tiles[gy+1]?.[gx];
  if (below && below.type !== 'wall') {
    const sg = ctx.createLinearGradient(px,py+T,px,py+T+SHADOW_D);
    sg.addColorStop(0,'rgba(0,0,0,0.6)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg; ctx.fillRect(px,py+T,T,SHADOW_D);
  }
}

function _wallProc(ctx, wKey, px, py, T, map, gx, gy, isV) {
  const cols = {
    corrugated:  {face:'#0e1c2c',top:'#253545',acc:'#3a5060',depth:'#04080c'},
    pipe_bundle: {face:'#0a1828',top:'#1e3050',acc:'#304880',depth:'#030810'},
    rock:        {face:'#16120a',top:'#2a2216',acc:'#3a3020',depth:'#040302'},
    civic_block: {face:'#0e1840',top:'#1e2c60',acc:'#304080',depth:'#040810'},
  };
  const c = cols[wKey] || {face:'#101e2e',top:'#283c54',acc:'#3a5060',depth:'#03080e'};
  ctx.fillStyle=c.face; ctx.fillRect(px,py,T,T);
  const tg=ctx.createLinearGradient(px,py-WALL_H,px,py);
  tg.addColorStop(0,c.top); tg.addColorStop(1,_darken(c.top,0.3));
  ctx.fillStyle=tg; ctx.fillRect(px,py-WALL_H,T,WALL_H);
  ctx.fillStyle=c.acc; ctx.fillRect(px,py-WALL_H,T,1.5); ctx.fillRect(px,py-WALL_H,1.5,WALL_H);
  const dg=ctx.createLinearGradient(px+T-6,py,px+T,py);
  dg.addColorStop(0,'rgba(0,0,0,0)'); dg.addColorStop(1,c.depth);
  ctx.fillStyle=dg; ctx.fillRect(px+T-6,py-WALL_H,6,T+WALL_H);
}

// ─── OVERLAYS ─────────────────────────────────────────────────────────────────

function _drawOverlays(ctx, t, gx, gy, T, map, data, ts) {
  const px = gx*T, py = gy*T;
  const v  = t.visual || {};
  const ap = ts?.assetPath || 'assets/';

  if (v.prop) _drawProp(ctx, v.prop, px, py, T, ts, ap);
  if (v.fx)   _drawFX(ctx, v.fx, px, py, T, ts, ap, _t);

  if (t.gameTable)   _markerTable(ctx,px,py,T,t.gameTable,data);
  if (t.jukebox)     _markerJukebox(ctx,px,py,T);
  if (t.transition)  _markerDoor(ctx,px,py,T);
  else if (t.loot)   _markerLoot(ctx,px,py,T);
  else if (t.interact) _markerInteract(ctx,px,py,T,t);

  if (t.cover) {
    ctx.strokeStyle='rgba(80,120,200,0.25)'; ctx.lineWidth=1.5;
    ctx.strokeRect(px+3,py+3,T-6,T-6);
  }
}

// ─── ZONE LIGHTING ────────────────────────────────────────────────────────────

function _zoneLighting(ctx, t, gx, gy, T, map) {
  const zone = t.zone||'';
  const px=gx*T, py=gy*T;
  if (!zone && gy>=19 && gy<=28 && gx>=1 && gx<=13 && (gx+gy*2)%9===0) {
    const lg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*1.5);
    lg.addColorStop(0,'rgba(200,120,20,0.09)'); lg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lg; ctx.fillRect(px-T,py-T,T*3,T*3);
  }
  if (!zone && gy<=9 && (gx*3+gy)%11===0) {
    const lg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*1.8);
    lg.addColorStop(0,'rgba(80,140,220,0.07)'); lg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lg; ctx.fillRect(px-T,py-T,T*3,T*3);
  }
  if (zone==='restricted_civic') {
    const lg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T);
    lg.addColorStop(0,'rgba(140,160,255,0.06)'); lg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lg; ctx.fillRect(px-T/2,py-T/2,T*2,T*2);
  }
  if (zone==='hostile_reaver') {
    const lg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*1.2);
    lg.addColorStop(0,'rgba(180,20,20,0.08)'); lg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lg; ctx.fillRect(px-T/2,py-T/2,T*2,T*2);
  }
}

// ─── PROP DRAWING ─────────────────────────────────────────────────────────────

function _drawProp(ctx, propKey, px, py, T, ts, ap) {
  const def = ts?.props?.[propKey];
  const img = def?.image ? _img(ap + def.image) : null;

  if (img) {
    // Draw sprite — center in tile, maintain aspect ratio, max ~80% of tile
    const maxDim = T * 0.82;
    const scale  = Math.min(maxDim / img.width, maxDim / img.height);
    const dw = img.width  * scale;
    const dh = img.height * scale;
    const dx = px + (T - dw) / 2;
    const dy = py + (T - dh) / 2;

    // Subtle shadow under sprite
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(px+T/2, py+T*0.85, dw*0.38, 5, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  } else {
    // Procedural fallback — draw icon + colored block
    _propProc(ctx, propKey, px, py, T, def);
  }
}

function _propProc(ctx, propKey, px, py, T, def) {
  const icon = def?.icon || '·';
  ctx.save();
  ctx.font = `${T*0.38}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(140,160,180,0.7)';
  ctx.fillText(icon, px+T/2, py+T/2);
  ctx.restore();
}

// ─── FX DRAWING ───────────────────────────────────────────────────────────────

function _drawFX(ctx, fxKey, px, py, T, ts, ap, t) {
  const def = ts?.fx?.[fxKey];

  if (def?.frames && def.frameCount > 1) {
    const fps     = def.fps || 8;
    const frameIdx = Math.floor(t * fps) % def.frameCount;
    const framePath = def.frames.replace('{n}', frameIdx);
    const img = _img(ap + framePath);
    if (img) {
      ctx.drawImage(img, px, py, T, T);
      return;
    }
  }

  // Procedural FX fallback
  _fxProc(ctx, fxKey, px, py, T, t);
}

function _fxProc(ctx, fxKey, px, py, T, t) {
  ctx.save();
  switch(fxKey) {
    case 'steam_vent': {
      for (let i=0;i<3;i++) {
        const ph=((t*0.7+i/3)%1);
        const pY=py+T-ph*T*1.1;
        const al=ph<0.3?ph/0.3*0.35:(1-ph)*0.35;
        const r=4+ph*12;
        const sg=ctx.createRadialGradient(px+T/2,pY,0,px+T/2,pY,r);
        sg.addColorStop(0,`rgba(200,220,255,${al})`); sg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(px+T/2,pY,r,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'neon_glow': {
      const p=0.65+0.35*Math.sin(t*1.4);
      const ng=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.65);
      ng.addColorStop(0,`rgba(255,20,100,${0.18*p})`); ng.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=ng; ctx.fillRect(px,py,T,T); break;
    }
    case 'flicker': {
      const on=Math.sin(t*9)>-0.8;
      if (on) {
        const fl=ctx.createRadialGradient(px+T/2,py+2,0,px+T/2,py+T*0.6,T*0.55);
        fl.addColorStop(0,'rgba(230,220,160,0.18)'); fl.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=fl; ctx.fillRect(px,py,T,T);
      }
      break;
    }
    case 'red_light': {
      const p=0.4+0.6*Math.abs(Math.sin(t*1.1));
      ctx.fillStyle=`rgba(255,20,20,${0.25*p})`;
      ctx.fillRect(px,py,T,T); break;
    }
    case 'sparks': {
      if (Math.sin(t*8)>0.9) {
        ctx.fillStyle='rgba(255,180,30,0.9)';
        ctx.beginPath(); ctx.arc(px+T*0.3,py+T*0.5,3,0,Math.PI*2); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

// ─── DECALS ───────────────────────────────────────────────────────────────────

function _drawDecal(ctx, decal, px, py, T) {
  ctx.save(); ctx.globalAlpha=0.65;
  switch(decal) {
    case 'hazard_strip':
      for (let i=0;i<T;i+=10) {
        ctx.fillStyle=i%20<10?'rgba(255,200,0,0.35)':'rgba(0,0,0,0.2)';
        ctx.fillRect(px+i,py+T-6,10,6);
      }
      break;
    case 'civic_stripe':
      ctx.fillStyle='rgba(255,210,0,0.3)'; ctx.fillRect(px,py+T-7,T,3); break;
    case 'blood_stain': {
      const bs=ctx.createRadialGradient(px+T*0.3,py+T*0.6,0,px+T*0.3,py+T*0.6,T*0.22);
      bs.addColorStop(0,'rgba(130,15,15,0.55)'); bs.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=bs; ctx.fillRect(px,py,T,T); break;
    }
    case 'graffiti':
      ctx.fillStyle='rgba(180,40,180,0.35)';
      ctx.font=`bold ${T*0.22}px monospace`; ctx.textAlign='right'; ctx.textBaseline='top';
      ctx.fillText('VR',px+T-3,py+3); break;
    case 'worn_number':
      ctx.fillStyle='rgba(90,110,150,0.35)';
      ctx.font=`${T*0.2}px monospace`; ctx.textAlign='left'; ctx.textBaseline='bottom';
      ctx.fillText('B'+(px%10+1|0),px+3,py+T-2); break;
    case 'boot_prints':
      ctx.fillStyle='rgba(25,30,40,0.55)';
      ctx.beginPath(); ctx.ellipse(px+T*0.35,py+T*0.4,4,7,0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px+T*0.55,py+T*0.65,4,7,0.5,0,Math.PI*2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ─── MARKERS ──────────────────────────────────────────────────────────────────

function _markerTable(ctx,px,py,T,tableId,data) {
  const tb=(data?.tables||[]).find(t=>t.id===tableId);
  const color=tb?.type==='slot'?C.gold:tb?.type==='other'?C.green:C.cyan;
  const p=0.75+0.25*Math.sin(_t*1.5);
  ctx.save();
  const gg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.6);
  gg.addColorStop(0,_rgba(color,0.2*p)); gg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gg; ctx.fillRect(px,py,T,T);
  ctx.shadowColor=color; ctx.shadowBlur=8*p;
  ctx.font=`${T*0.38}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(color,0.95);
  ctx.fillText(tb?.type==='slot'?'⬡':'◈',px+T/2,py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _markerJukebox(ctx,px,py,T) {
  const p=0.7+0.3*Math.sin(_t*2);
  ctx.save();
  const gg=ctx.createRadialGradient(px+T/2,py+T/2,0,px+T/2,py+T/2,T*0.6);
  gg.addColorStop(0,_rgba(C.pink,0.22*p)); gg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gg; ctx.fillRect(px,py,T,T);
  ctx.shadowColor=C.pink; ctx.shadowBlur=10*p;
  ctx.font=`${T*0.45}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(C.pink,0.95); ctx.fillText('♪',px+T/2,py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _markerDoor(ctx,px,py,T) {
  ctx.save();
  ctx.fillStyle=_rgba(C.gold,0.1); ctx.fillRect(px+3,py+3,T-6,T-6);
  ctx.strokeStyle=_rgba(C.gold,0.6); ctx.lineWidth=1.5;
  ctx.strokeRect(px+3,py+3,T-6,T-6);
  ctx.font=`${T*0.38}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=_rgba(C.gold,0.85); ctx.fillText('▶',px+T/2,py+T/2);
  ctx.restore();
}

function _markerLoot(ctx,px,py,T) {
  ctx.save();
  ctx.shadowColor='#c8a040'; ctx.shadowBlur=4;
  ctx.font=`${T*0.35}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#c8a040'; ctx.fillText('▩',px+T/2,py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

function _markerInteract(ctx,px,py,T,tile) {
  const txt=(tile.interactText||'').toLowerCase();
  const color=txt.includes('terminal')||txt.includes('console')?C.cyan:txt.includes('door')?C.gold:'#6688aa';
  ctx.save();
  ctx.font=`${T*0.3}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=3;
  ctx.fillText('⬡',px+T/2,py+T/2);
  ctx.shadowBlur=0; ctx.restore();
}

// ─── ACTOR DRAWING ────────────────────────────────────────────────────────────

function _drawActor(ctx, actor, state, T, ts) {
  const px=actor.x*T, py=actor.y*T;
  const cx=px+T/2;
  const isSelected=state.selectedActorId===actor.id;
  const isCurrent=state.combat.active&&state.combat.turnOrder[state.combat.currentTurnIndex]===actor.id;
  const isAI=state.combat.aiActingId===actor.id;
  const isStealthed=actor.statuses.includes('stealthed');
  const hpPct=Math.max(0,actor.hp/actor.hpMax);

  const COLORS={
    player:{body:'#1a3562',rim:'#4a88d8',glow:'#6fb3ff'},
    ally:  {body:'#183620',rim:'#38a858',glow:'#7ed9a0'},
    enemy: {body:'#420e0e',rim:'#c03030',glow:'#ff6060'},
    neutral:{body:'#342e10',rim:'#a07820',glow:'#ccaa55'},
  };
  const col=COLORS[actor.role]||COLORS.neutral;

  ctx.save();
  if (isStealthed) ctx.globalAlpha=0.38;
  if (actor.downed) { ctx.globalAlpha=0.4; ctx.filter='grayscale(1)'; }

  let offY = isAI ? -Math.abs(Math.sin(_t*5))*5 : 0;

  // Try to find actor sprite from tileset
  const ap = ts?.assetPath || 'assets/';
  const actDef = ts?.actors?.[actor.classId] || ts?.actors?.[actor.id];
  const actImg = actDef?.image ? _img(ap + actDef.image) : null;

  // Ground shadow
  const sg=ctx.createRadialGradient(cx,py+T-5,0,cx,py+T-5,T*0.4);
  sg.addColorStop(0,'rgba(0,0,0,0.55)'); sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;
  ctx.beginPath(); ctx.ellipse(cx,py+T-5,T*0.36,4,0,0,Math.PI*2); ctx.fill();

  // Selection ring
  if (isSelected) {
    const sp=0.6+0.4*Math.abs(Math.sin(_t*2.5));
    ctx.strokeStyle=_rgba(col.glow,sp); ctx.lineWidth=2;
    ctx.shadowColor=col.glow; ctx.shadowBlur=10*sp;
    ctx.strokeRect(px-2,py-2+offY,T+4,T+4);
    ctx.shadowBlur=0;
  }

  if (actImg) {
    // Draw real sprite
    const dh = T * 0.85;
    const dw = actImg.width * (dh / actImg.height);
    const dx = px + (T - dw) / 2;
    const dy = py + (T - dh) + offY;
    ctx.drawImage(actImg, dx, dy, dw, dh);

    // Role color rim glow over sprite
    ctx.strokeStyle = _rgba(col.rim, 0.4);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx-1, dy-1, dw+2, dh+2);
  } else {
    // Procedural actor fallback
    _actorProc(ctx, actor, px, py, T, col, offY, isAI);
  }

  // Current turn ring
  if (isCurrent && !isAI) {
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
  ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(px+2,py+T-6,T-4,4);
  const hpC=hpPct>0.6?'#4aff9a':hpPct>0.3?'#ffcc5a':'#ff4444';
  ctx.fillStyle=hpC; ctx.shadowColor=hpC; ctx.shadowBlur=4;
  ctx.fillRect(px+2,py+T-6,(T-4)*hpPct,4);
  ctx.shadowBlur=0;

  // Name tag
  ctx.fillStyle='rgba(200,220,255,0.7)';
  ctx.font=`${T*0.145}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText(actor.name.split(' ')[0], cx, py+T*0.18+offY);

  ctx.restore();
}

function _actorProc(ctx, actor, px, py, T, col, offY, isAI) {
  const cx=px+T/2;
  const bW=T*0.5, bH=T*0.52, bX=cx-bW/2, bY=py+T*0.38+offY;
  const hR=T*0.17, hY=py+T*0.24+offY;
  const bg=ctx.createLinearGradient(bX,bY,bX+bW,bY+bH);
  bg.addColorStop(0,_lighten(col.body,0.35)); bg.addColorStop(1,_darken(col.body,0.5));
  ctx.fillStyle=bg; ctx.fillRect(bX,bY,bW,bH);
  ctx.strokeStyle=col.rim; ctx.lineWidth=1.2; ctx.strokeRect(bX,bY,bW,bH);
  const hg=ctx.createRadialGradient(cx-hR*0.2,hY-hR*0.2,0,cx,hY,hR);
  hg.addColorStop(0,_lighten(col.body,0.55)); hg.addColorStop(1,col.body);
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(cx,hY,hR,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=col.rim; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.arc(cx,hY,hR,0,Math.PI*2); ctx.stroke();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _rgba(hex,a) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function _darken(hex,f) {
  let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `#${Math.max(0,r*(1-f)|0).toString(16).padStart(2,'0')}${Math.max(0,g*(1-f)|0).toString(16).padStart(2,'0')}${Math.max(0,b*(1-f)|0).toString(16).padStart(2,'0')}`;
}
function _lighten(hex,f) {
  let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `#${Math.min(255,r+(255-r)*f|0).toString(16).padStart(2,'0')}${Math.min(255,g+(255-g)*f|0).toString(16).padStart(2,'0')}${Math.min(255,b+(255-b)*f|0).toString(16).padStart(2,'0')}`;
}
