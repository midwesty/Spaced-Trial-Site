import { loadGameData } from './data.js';
import { GameEngine } from './engine.js';

function showStartupError(err) {
  console.error(err);
  const splash = document.getElementById('splash');
  if (splash) splash.classList.add('active');
  let box = document.getElementById('startupErrorBox');
  if (!box) {
    const panel = splash?.querySelector('.splash-panel') || document.body;
    box = document.createElement('div');
    box.id = 'startupErrorBox';
    box.style.marginTop = '16px';
    box.style.padding = '12px';
    box.style.border = '1px solid #ad5d67';
    box.style.borderRadius = '12px';
    box.style.background = 'rgba(80,20,20,0.35)';
    box.style.whiteSpace = 'pre-wrap';
    panel.appendChild(box);
  }
  box.innerHTML = `<strong>Startup error</strong><br>${String(err?.message || err)}`;
}

window.addEventListener('error', (e) => showStartupError(e.error || e.message || 'Unknown script error'));
window.addEventListener('unhandledrejection', (e) => showStartupError(e.reason || 'Unhandled promise rejection'));

async function boot() {
  try {
    const data = await loadGameData();
    window.game = new GameEngine(data);
    document.getElementById('splash').classList.add('active');
  } catch (err) {
    showStartupError(err);
  }
}
boot();
