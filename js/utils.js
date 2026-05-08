export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
export function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(pct) { return Math.random() * 100 < pct; }

export function rollDice(expression = '1d20') {
  const match = expression.match(/(\d+)d(\d+)([+-]\d+)?/i);
  if (!match) return { total: Number(expression) || 0, rolls: [], expression };
  const [, countStr, dieStr, modStr] = match;
  const count = Number(countStr), die = Number(dieStr), mod = Number(modStr || 0);
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rand(1, die));
  return { expression, rolls, mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

export function statMod(score = 10) {
  return Math.floor((score - 10) / 2);
}

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function createEl(tag, attrs = {}, html = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'class') el.className = val;
    else if (key === 'dataset') Object.entries(val).forEach(([k, v]) => el.dataset[k] = v);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
    else el.setAttribute(key, val);
  });
  if (html) el.innerHTML = html;
  return el;
}

export function formatTime(minutes) {
  const day = Math.floor(minutes / (24 * 60)) + 1;
  const rem = minutes % (24 * 60);
  const h = String(Math.floor(rem / 60)).padStart(2, '0');
  const m = String(rem % 60).padStart(2, '0');
  return `Cycle ${day} · ${h}:${m}`;
}

export function getById(list, id) {
  return list.find(x => x.id === id);
}
