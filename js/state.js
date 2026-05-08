import { deepClone, uid, loadJSON, saveJSON, statMod } from './utils.js';

export const SAVE_KEY = 'starfall_mvp_save_v1';

export function freshState(data) {
  return {
    version: 1,
    mode: 'exploration',
    timeMinutes: 6 * 60,
    mapId: 'port_sable',
    currentSectorNode: 'port_sable',
    zoom: 1,
    camera: { x: 0, y: 0 },
    selectedActorId: null,
    partyMax: data.config.party.defaultMax,
    party: [],
    roster: [],
    factions: Object.fromEntries(data.factions.map(f => [f.id, 0])),
    quests: {},
    flags: {
      introSeen: false,
      shipOwned: false,
      tutorialComplete: false,
      crimeAlert: false,
      romanceEnabled: true,
      acquiredWake: false
    },
    relationship: {},
    resources: {
      credits: 180,
      fuel: 4,
      shipSupplies: 8,
      rations: 12,
      water: 15,
      medgel: 3,
      scrap: 18
    },
    ship: {
      name: "The Scavenger's Wake",
      hull: 42,
      fuelCapacity: 12,
      installedModules: ['galley','medbay','bunks','scanner','smuggler-hold'],
      cargo: [],
      notes: ['Recovered in damaged condition during the opening escape.']
    },
    crime: {
      witnessLevel: 0,
      stolenItems: [],
      trespassZonesViolated: []
    },
    visitedMaps: ['port_sable'],
    dialogueMemory: {},
    partyControl: {
      follow: true,
      leaderId: null,
      squadStealth: false
    },
    combat: {
      active: false,
      round: 0,
      turnOrder: [],
      currentTurnIndex: 0,
      movementLeft: {},
      acted: {},
      bonusActed: {},
      reactionSpent: {},
      aiActingId: null
    },
    ui: {
      openPanels: [],
      messages: [],
      viewedCodex: false
    },
    gamblerCredits: {}
  };
}

export function createActorFromTemplate(template, data, overrides = {}) {
  const cls = data.classes.find(c => c.id === template.classId);
  const species = data.species.find(s => s.id === template.speciesId);
  const stats = deepClone(template.stats || { might: 10, agility: 10, grit: 10, wit: 10, presence: 10, tech: 10 });
  const hpMax = (template.hpMax || 10) + statMod(stats.grit) + (cls?.hpBonus || 0) + (species?.hpBonus || 0);
  return {
    id: overrides.id || uid('actor'),
    templateId: template.id || null,
    name: overrides.name || template.name,
    speciesId: template.speciesId,
    classId: template.classId,
    factionId: template.factionId || 'free',
    role: overrides.role || template.role || 'neutral',
    x: template.x ?? 1,
    y: template.y ?? 1,
    stats,
    hp: hpMax,
    hpMax,
    shield: template.shield ?? 0,
    shieldMax: template.shieldMax ?? 0,
    armor: template.armor ?? 10,
    level: template.level || 1,
    xp: 0,
    statuses: template.statuses ? [...template.statuses] : [],
    tags: template.tags ? [...template.tags] : [],
    movement: template.movement || 6,
    actionPoints: 1,
    bonusPoints: 1,
    reactionReady: true,
    inventory: deepClone(template.inventory || []),
    equipped: deepClone(template.equipped || {
      mainhand: null, offhand: null, armor: null, utility: null, implant: null, pack: null
    }),
    abilities: deepClone(template.abilities || []),
    powerPools: deepClone(template.powerPools || cls?.powerPools || {}),
    abilityUses: deepClone(template.abilityUses || {}),
    repeatDialogueId: template.repeatDialogueId || null,
    ambientDialogue: deepClone(template.ambientDialogue || []),
    conversationTag: template.conversationTag || template.id || null,
    factionRole: template.factionRole || null,
    affinity: template.affinity || 0,
    romance: { locked: false, active: false, stage: 0 },
    survival: deepClone(template.survival || {
      hunger: 100, thirst: 100, fatigue: 100, morale: 60, toxicity: 0
    }),
    ai: template.ai || 'neutral',
    bio: template.bio || '',
    dialogueId: template.dialogueId || null,
    dead: false,
    downed: false,
    canRevive: template.canRevive !== false,
    portrait: template.portrait || '',
    appearance: deepClone(template.appearance || {}),
    voice: template.voice || null
  };
}

export function applyDerivedStats(actor, data) {
  const cls = data.classes.find(c => c.id === actor.classId);
  const species = data.species.find(s => s.id === actor.speciesId);
  actor.moveRange = actor.movement + (species?.moveBonus || 0);
  actor.initiative = statMod(actor.stats.agility) + actor.level + (cls?.initiativeBonus || 0);
  actor.saveMods = {
    grit: statMod(actor.stats.grit) + (cls?.saveBonuses?.includes('grit') ? 2 : 0),
    agility: statMod(actor.stats.agility) + (cls?.saveBonuses?.includes('agility') ? 2 : 0),
    wit: statMod(actor.stats.wit) + (cls?.saveBonuses?.includes('wit') ? 2 : 0),
    presence: statMod(actor.stats.presence) + (cls?.saveBonuses?.includes('presence') ? 2 : 0),
    tech: statMod(actor.stats.tech) + (cls?.saveBonuses?.includes('tech') ? 2 : 0)
  };
  return actor;
}

export function saveState(state) {
  saveJSON(SAVE_KEY, state);
}

export function loadState() {
  return loadJSON(SAVE_KEY);
}
