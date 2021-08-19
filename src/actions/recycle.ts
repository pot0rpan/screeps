import config from 'config';

export function recycle(creep: Creep): void {
  if (creep.memory.recycle === undefined) {
    creep.memory.recycle = config.ticks.RECYCLE_CREEP_DELAY;
  } else if (creep.memory.recycle > 0) {
    creep.memory.recycle--;
  }

  if (creep.memory.recycle <= 0) {
    if (creep.room.name !== creep.memory.homeRoom) {
      creep.travelToRoom(creep.memory.homeRoom);
    } else {
      creep.travelTo(creep.room.findSpawns()[0], { range: 1 });
    }
    creep.say('recycle');
  } else {
    creep.say('...');
  }
}
