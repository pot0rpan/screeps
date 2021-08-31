export default {
  MAX_REPAIR_HITS: (rcl: number): number => {
    switch (rcl) {
      case 0:
      case 1:
      case 2:
        return 0;
      case 3:
        return 10000;
      case 4:
        return 25000;
      case 5:
        return 75000;
      case 6:
        return 300000;
      default:
        return 30000000;
    }
  },
  MIN_ENERGY_STORAGE: (rcl: number): number => {
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
      case 6:
        return 200000;
      default:
        return 500000;
    }
  },
  MAX_MINERAL_STORAGE: 30000,
  MAX_REMOTES: (rcl: number): number => {
    switch (rcl) {
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
  MAX_CONSTRUCTION_SITES: 5,
  MAX_TOWER_REFILL: 600,
  ticks: {
    SPAWN_CREEPS: 10,
    RECHECK_TASK_VALIDITY: 5,
    CLEAN_TASK_CACHE: 7,
    DELETE_DEAD_CREEP_MEMORY: 3,
    PLAN_ROOMS: 133,
    SAFE_MODE_DELAY: 40,
    RECYCLE_CREEP_DELAY: 20,
    SCOUT_ADJACENT_ROOMS: 100,
    RCL_DOWNGRADE: 3000,
  },
};
