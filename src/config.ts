export default {
  MAX_REPAIR_HITS: (rcl: number): number => {
    switch (rcl) {
      case 3:
        return 10000;
      case 4:
        return 25000;
      case 5:
        return 50000;
      default:
        return 100000;
    }
  },
  MAX_ENERGY_STORAGE: (rcl: number): number => {
    switch (rcl) {
      case 4:
        return 10000;
      case 5:
        return 20000;
      case 6:
        return 40000;
      default:
        return 100000;
    }
  },
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
      default:
        return 3;
    }
  },
  USERNAME: 'poot',
  FRIENDLY_NAMES: ['iiF', 'Xephael'],
  MAX_CONSTRUCTION_SITES: 5,
  MAX_TOWER_REFILL: 600,
  ticks: {
    SPAWN_CREEPS: 10,
    RECHECK_TASK_VALIDITY: 5,
    CLEAN_TASK_CACHE: 33,
    DELETE_DEAD_CREEP_MEMORY: 3,
    PLAN_ROOMS: 69,
    SAFE_MODE_DELAY: 40,
    RECYCLE_CREEP_DELAY: 5,
    SCOUT_ADJACENT_ROOMS: 200,
    RCL_DOWNGRADE: 3000,
  },
};
