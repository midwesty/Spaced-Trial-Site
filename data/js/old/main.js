import { loadGameData } from './data.js';
import { GameEngine } from './engine.js';

async function boot() {
  const data = await loadGameData();
  window.game = new GameEngine(data);
  document.getElementById('splash').classList.add('active');
}
boot();
