export default {
  TARGET_ENERGY_STORAGE: (rcl: number): number => {
    switch (rcl) {
      case 0:
      case 1:
      case 2:
      case 3:
        return 0;
      case 4:
        return 10000;
      case 5:
        return 25000;
      default:
        return 100000;
    }
  },
  TARGET_MINERAL_STORAGE: 5000,
  MAX_REMOTES: (rcl: number): number => {
    switch (rcl) {
      case 0:
      case 1:
      case 2:
      case 3:
        return 0;
      case 4:
        return 1;
      case 5:
        return 2;
      case 6:
        return 3;
      default:
        return 4;
    }
  },
  USERNAME: 'poot',
  FRIENDLY_NAMES: ['iiF', 'Xephael'],
  // USERNAME: 'iiF',
  // FRIENDLY_NAMES: ['poot', 'Xephael'],
  MIN_REPAIR_HITS: 0.5, // For both towers and Builders
  MAX_CONSTRUCTION_SITES: 10,
  MAX_TOWER_REFILL: 600,
  COLONY_HELP_DISTANCE: 5,
  ticks: {
    SPAWN_CREEPS: 10,
    RECHECK_TASK_VALIDITY: 5,
    CLEAN_TASK_CACHE: 7,
    DELETE_DEAD_CREEP_MEMORY: 3,
    PLACE_CONSTRUCTION_SITES: 200,
    PLAN_EXPANSION: 123,
    SAFE_MODE_DELAY: 40,
    RECYCLE_CREEP_DELAY: 20,
    SCOUT_ADJACENT_ROOMS: 100,
    RCL_DOWNGRADE: 3000,
    RUN_MARKET: 200,
  },
  flags: {
    COLONIZE: [COLOR_PURPLE, COLOR_PURPLE], // For claiming a new colony
    DRAIN: [COLOR_CYAN, COLOR_CYAN], // For draining an enemy's towers/energy
    ATTACK: [COLOR_RED, COLOR_RED], // For single Attacker
    PAIR_ATTACK: [COLOR_RED, COLOR_GREEN], // For Attacker/Healer pair
    LOOT: [COLOR_YELLOW, COLOR_YELLOW], // For Looters to loot storages
  },
  signs: {
    RESERVE: 'mining my own business',
    CLAIM: 'not overmind, just like the bunker',
  },
  SPAWN_ORDER: [
    'pioneer',
    'filler',
    'operator',
    'builder',
    'ranged_defender',
    'defender',
    'attacker',
    'healer',
    'exterminator',
    'drainer',
    'harvester',
    'mover',
    'upgrader',
    'scout',
    'assassin',
    'prospector',
    'reserver',
    'miner',
    'hauler',
    'claimer',
    'colonizer',
    'looter',
    'explorer',
  ],
};
