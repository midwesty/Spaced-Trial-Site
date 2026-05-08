export async function loadGameData() {
  const names = ['config','species','classes','abilities','items','statuses','companions','quests','dialogue','maps','encounters','factions','tables','gamblers','jukeboxes'];
  const entries = await Promise.all(names.map(async (name) => {
    const res = await fetch(`./data/${name}.json`);
    return [name, await res.json()];
  }));
  return Object.fromEntries(entries);
}
