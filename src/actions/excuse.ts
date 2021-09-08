import { isNthTick } from 'utils';

// Returns true if moving for a stuck creep
export function excuse(creep: Creep): boolean {
  // Lazy reactive implementation for now
  if (!creep.fatigue && isNthTick(2)) {
    const stuckCreep = _.sample(
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
    if (stuckCreep) {
      return creep.move(creep.pos.getDirectionTo(stuckCreep)) === OK;
    }
  }

  return false;
}
