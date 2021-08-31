import config from 'config';
import { isNthTick } from 'utils';

export function recycle(
  creep: Creep,
  delayTicks = config.ticks.RECYCLE_CREEP_DELAY,
  dontMoveUntilZero = false
): number {
  if (creep.memory.recycle === undefined) {
    creep.memory.recycle = delayTicks;
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
    return 0;
  } else if (!dontMoveUntilZero) {
    creep.say('... ' + creep.memory.recycle);
    if (creep.room.name !== creep.memory.homeRoom || creep.pos.isNearEdge(3)) {
      creep.travelToRoom(creep.memory.homeRoom);
    } else {
      const ramp = creep.pos.findClosestWalkableRampart([creep.name]);
      if (ramp && !creep.pos.isEqualTo(ramp)) {
        creep.travelTo(ramp);
      } else {
        // Lazy "excuse me" for now
        if (isNthTick(2)) {
          const moveFor = _.sample(
            creep.pos.findInRange(FIND_MY_CREEPS, 1, {
              filter: crp =>
                // is traveling
                crp.memory._trav &&
                // is stuck
                (crp.memory._trav.state?.[2] ?? 0) > 0 &&
                // is trying to move where this creep is
                '' + crp.pos.getDirectionTo(creep) ===
                  crp.memory._trav.path?.substr(0, 1),
            })
          );
          if (moveFor) {
            creep.move(creep.pos.getDirectionTo(moveFor));
          }
        }
      }
    }
  }
  return creep.memory.recycle;
}
