declare global {
  interface CreepMemory {
    excuse?: DirectionConstant;
    excuseTs?: number;

    // This is used to not move twice, which can happen depending on creep run order
    // If this creep moves and clears memory, but other creep sets it after in same tick,
    // This creep would move 2 ticks in a row
    excusing?: number;
  }
}

// Returns true if moving for a stuck creep
export function excuse(creep: Creep): boolean {
  const start = Game.cpu.getUsed();
  if (!creep.fatigue && creep.memory.excuse && creep.memory.excuseTs) {
    const dir = creep.memory.excuse;
    const time = creep.memory.excuseTs;

    delete creep.memory.excuse;
    delete creep.memory.excuseTs;

    // Ignore if not this tick or previous tick
    if (time < Game.time - 1 || creep.memory.excusing === Game.time - 1) {
      // Stale excuse, creep probably repathed already
      global.stats.profileLog(`${creep} ignore excuse()`, start, [
        creep.name,
        creep.room.name,
        'excuse',
      ]);
      return false;
    }

    creep.say('sorry!');
    creep.memory.excusing = Game.time;
    const ret = creep.move(dir) === OK;
    global.stats.profileLog(`${creep} handled excuse()`, start, [
      creep.name,
      creep.room.name,
      'excuse',
    ]);
    return ret;
  }

  global.stats.profileLog(`${creep} noop excuse()`, start, [
    creep.name,
    creep.room.name,
    'excuse',
  ]);
  return false;
}
